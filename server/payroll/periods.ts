// server/payroll/periods.ts — B8a3: دورة الفترة (فتح ← احتساب ← اعتماد ← إصدار) والاحتسابات الثابتة والبصمة والمتغيرات.
// كل احتساب سجل ثابت (payroll_runs)؛ السطور والنتائج تنتمي له. الاعتماد يعيد التحميل ويقارن البصمة (حالة 10).
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { PayrollError } from './catalog.ts';
import { loadPeriodInputs } from './loader.ts';
import { computeEmployee } from './engine.ts';
import { toDecimal, money } from './money.ts';

const rows = (r: any) => ((r as any).rows ?? r) as any[];
export const PERIOD_STATES = ['مفتوحة', 'محتسبة', 'معتمدة', 'مُصدَرة'] as const;

/** تسلسل قانوني ثابت: المفاتيح مرتبة، والخرائط والمجموعات مرتبة، والأعداد الكبيرة نصوص. */
export function canon(v: any): any {
  if (typeof v === 'bigint') return `${v}n`;
  if (v instanceof Map) return [...v.entries()].map(([k, x]) => [String(k), canon(x)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (v instanceof Set) return [...v].map(String).sort();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canon(v[k]);
    return o;
  }
  return v;
}
/** يتغير مع أي تعديل على منطق المحرك أو المحمّل يغيّر النتائج: اعتماد بعد نشر نسخة أخرى يُرفض. */
export const ENGINE_VERSION = 'b8b.1';
/** بصمة المدخلات = SHA-256 لمدخلات المحرك نفسها + نسخة المحرك (س11.1، 3.8). */
export function fingerprintOf(ctx: any, employees: any[]): string {
  const h = createHash('sha256');
  h.update(ENGINE_VERSION + '\n');
  h.update(JSON.stringify(canon({ ...ctx, items: ctx.items })));
  for (const e of [...employees].sort((a, b) => a.id - b.id)) h.update('\n' + JSON.stringify(canon(e)));
  return h.digest('hex');
}

/** معاملة REPEATABLE READ تُعاد عند تعارض التسلسل (40001): الثانية تنتظر القفل ثم لقطتها القديمة تتعارض. */
async function rrTx<T>(db: any, fn: (tx: any) => Promise<T>, accessMode?: 'read only'): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(fn, { isolationLevel: 'repeatable read', ...(accessMode ? { accessMode } : {}) });
    } catch (err: any) {
      const code = err?.code || err?.cause?.code;
      if (code !== '40001') throw err;
      if (attempt >= 3) throw new PayrollError('عملية متزامنة على نفس الفترة؛ أعد المحاولة', 409);
    }
  }
}

async function lockPeriod(tx: any, periodId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'payroll:period:' + periodId}))`);
}
async function getPeriod(tx: any, schema: any, periodId: number, forUpdate = true) {
  const q = tx.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, periodId));
  const [p] = forUpdate ? await q.for('update') : await q;
  if (!p) throw new PayrollError('الفترة غير موجودة', 404);
  return p;
}
const audit = (tx: any, schema: any, actor: string, action: string, periodId: number, after?: any, before?: any) =>
  tx.insert(schema.payrollAudit).values({ actor, action, entity: 'payroll_periods', entityId: String(periodId), before: before ?? null, after: after ?? null });

export async function openPeriod(db: any, schema: any, o: { categoryId: number; year: number; month: number; user: string; paySource?: string }) {
  if (!o.user) throw new PayrollError('تعذّر التعرّف على المستخدم', 403);
  if (!(o.month >= 1 && o.month <= 12) || !(o.year >= 2000 && o.year <= 2100)) throw new PayrollError('الشهر أو السنة غير صالح');
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'payroll:category:' + o.categoryId}))`);
    const [cat] = await tx.select().from(schema.payrollCategories).where(eq(schema.payrollCategories.id, o.categoryId));
    if (!cat) throw new PayrollError('فئة الرواتب غير موجودة', 404);
    if (!cat.isActive) throw new PayrollError(`فئة «${cat.name}» غير مفعّلة`, 409);
    const P = schema.payrollPeriods;
    const open = rows(await tx.execute(sql`SELECT id, year, month, status FROM payroll_periods WHERE category_id = ${o.categoryId} AND kind = 'عادية' AND status <> 'مُصدَرة'`));
    if (open.length) throw new PayrollError(`فترة ${open[0].year}/${open[0].month} غير مُصدَرة بعد؛ ما تنفتح فترة قبل إصدار سابقتها (س11.1)`, 409);
    const [last] = rows(await tx.execute(sql`SELECT year, month FROM payroll_periods WHERE category_id = ${o.categoryId} AND kind = 'عادية' ORDER BY year DESC, month DESC LIMIT 1`));
    if (last) {
      const nextY = last.month === 12 ? last.year + 1 : last.year, nextM = last.month === 12 ? 1 : last.month + 1;
      if (o.year !== nextY || o.month !== nextM) throw new PayrollError(`الفترة التالية لهذه الفئة هي ${nextY}/${nextM}`, 409);
    }
    const src = o.paySource || 'ظلّي';
    if (!['ظلّي', 'فعلي'].includes(src)) throw new PayrollError('مصدر الصرف: ظلّي / فعلي');
    const [p] = await tx.insert(P).values({ categoryId: o.categoryId, year: o.year, month: o.month, paySource: src, openedBy: o.user }).returning();
    await audit(tx, schema, o.user, 'فتح فترة', p.id, { year: o.year, month: o.month, pay_source: src });
    return p;
  });
}

/** يحمّل المدخلات ويحسب البصمة داخل معاملة القراءة نفسها. */
async function loadForPeriod(tx: any, period: any, eligibleStatuses: string[]) {
  // لحظة المعرفة = بداية المعاملة بساعة القاعدة (نفس ساعة recorded_at)
  const knownAt = new Date(rows(await tx.execute(sql`SELECT now() AS now`))[0].now);
  const input = await loadPeriodInputs(tx, { year: period.year, month: period.month, categoryId: period.categoryId, eligibleStatuses, knownAt, sequential: true, periodId: period.id });
  return { ...input, fingerprint: fingerprintOf(input.ctx, input.employees) };
}

const BATCH = 1000;
export async function computeRun(db: any, schema: any, periodId: number, user: string, eligibleStatuses: string[]) {
  if (!user) throw new PayrollError('تعذّر التعرّف على المستخدم', 403);
  return rrTx(db, async (tx: any) => {
    await lockPeriod(tx, periodId);
    const period = await getPeriod(tx, schema, periodId);
    if (!['مفتوحة', 'محتسبة'].includes(period.status)) throw new PayrollError(`الفترة ${period.status}؛ الاحتساب للفترة المفتوحة أو المحتسبة فقط`, 409);
    const t0 = Date.now();
    const { ctx, employees, fingerprint, knownAt } = await loadForPeriod(tx, period, eligibleStatuses);
    const t1 = Date.now();
    const [run] = await tx.insert(schema.payrollRuns).values({ periodId, fingerprint, knownAt: new Date(knownAt), computedBy: user }).returning();
    const results: any[] = [], lines: any[] = [];
    const totals = { employees: 0, computed: 0, nominal: 0n, allowances: 0n, deductions: 0n, net: 0n, issues: {} as Record<string, number> };
    for (const e of employees) {
      const r = computeEmployee(e, ctx);
      totals.employees++;
      for (const i of r.issues) totals.issues[i.code] = (totals.issues[i.code] || 0) + 1;
      if (!r.computed && !r.lines.length) {
        // غير مشمول بهذه الفترة (فئة/حالة/خدمة): نحفظ النتيجة فقط إذا فيها مشكلة تستحق المراجعة
        if (r.issues.every(i => i.code === 'NOT_IN_PERIOD')) continue;
      }
      if (r.computed) totals.computed++;
      totals.nominal += r.nominal; totals.allowances += r.allowances; totals.deductions += r.deductions; totals.net += r.net;
      results.push({ runId: run.id, employeeId: r.employeeId, computed: r.computed, nominal: toDecimal(r.nominal), allowances: toDecimal(r.allowances), deductions: toDecimal(r.deductions),
        netExact: toDecimal(r.netExact), net: toDecimal(r.net), negative: toDecimal(r.negative), flags: r.flags, issues: r.issues, snapshot: e.snapshot });
      r.lines.forEach((l, seq) => lines.push({ runId: run.id, employeeId: r.employeeId, seq, itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, direction: l.direction,
        kind: l.kind, itemVersionId: l.itemVersionId, scaleVersionId: l.scaleVersionId, assignmentId: l.assignmentId, segmentFrom: l.segmentFrom, segmentTo: l.segmentTo,
        share: l.share, base: l.base === null ? null : toDecimal(l.base), rate: l.rate, amount: toDecimal(l.amount), explain: l.explain }));
    }
    for (let i = 0; i < results.length; i += BATCH) await tx.insert(schema.payrollResults).values(results.slice(i, i + BATCH));
    for (let i = 0; i < lines.length; i += BATCH) await tx.insert(schema.payrollLines).values(lines.slice(i, i + BATCH));
    const [cat] = await tx.select().from(schema.payrollCategories).where(eq(schema.payrollCategories.id, period.categoryId));
    const tot = { ...totals, category_name: cat?.name ?? null, category_code: cat?.code ?? null, engine_version: ENGINE_VERSION, nominal: toDecimal(totals.nominal), allowances: toDecimal(totals.allowances), deductions: toDecimal(totals.deductions), net: toDecimal(totals.net),
      lines: lines.length, load_ms: t1 - t0, compute_ms: Date.now() - t1 };
    await tx.update(schema.payrollRuns).set({ state: 'محتسب', totals: tot, finishedAt: new Date() }).where(eq(schema.payrollRuns.id, run.id));
    if (period.currentRunId) {
      await tx.update(schema.payrollRuns).set({ state: 'ملغى', cancelReason: `أعيد الاحتساب (احتساب ${run.id})` }).where(eq(schema.payrollRuns.id, period.currentRunId));
    }
    await tx.update(schema.payrollPeriods).set({ status: 'محتسبة', currentRunId: run.id }).where(eq(schema.payrollPeriods.id, periodId));
    await audit(tx, schema, user, 'احتساب فترة', periodId, { run_id: run.id, fingerprint, ...tot });
    return { run_id: run.id, fingerprint, totals: tot };
  });
}

/** فحص البصمة الحالية مقابل احتساب الفترة (للشاشة: «تغيّرت المدخلات منذ الاحتساب»). */
export async function checkFingerprint(db: any, schema: any, periodId: number, eligibleStatuses: string[]) {
  return rrTx(db, async (tx: any) => {
    const period = await getPeriod(tx, schema, periodId, false);
    if (!period.currentRunId) return { has_run: false, changed: null };
    const [run] = await tx.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, period.currentRunId));
    const { fingerprint } = await loadForPeriod(tx, period, eligibleStatuses);
    return { has_run: true, changed: fingerprint !== run.fingerprint, run_id: run.id };
  }, 'read only');
}

/** سبب المتغير من التفسير (س11.2). prevRes/curRes = نتيجة الموظف بكل احتساب (أو لا شيء). */
function varianceCause(prev: any | undefined, cur: any | undefined, prevRes: any, curRes: any): string {
  if (!prevRes) return 'موظف جديد بهذه الفترة';
  if (!curRes) return 'غير مشمول بهذه الفترة (ترك أو تغيّرت فئته أو حالته)';
  if (!curRes.computed) return `لم يُحتسب: ${(curRes.issues || []).map((i: any) => i.message).join('؛ ') || 'بلا سبب مسجّل'}`;
  if (!prevRes.computed) return 'احتُسب هذا الشهر ولم يُحتسب بالسابق';
  const isCap = (cur || prev)?.isCap;
  if (isCap) return cur && !prev ? 'بلوغ سقف 200%' : !cur ? 'زوال تخفيض سقف 200%' : 'تغيّر تخفيض سقف 200%';
  if (!prev) return cur?.assignmentId ? 'إسناد فردي جديد' : 'استحقاق جديد';
  if (!cur) return prev.assignmentId ? 'انتهاء إسناد فردي' : 'انتهاء الاستحقاق';
  const pe = prev.explain || {}, ce = cur.explain || {};
  const causes: string[] = [];
  if (prev.itemVersionId !== cur.itemVersionId) causes.push('تغيّر قاعدة البند (نسخة جديدة)');
  if (pe.level !== ce.level) causes.push(`تغيّر المستوى: ${pe.level ?? '—'} ← ${ce.level ?? '—'}`);
  if ((prev.assignmentId ?? null) !== (cur.assignmentId ?? null)) causes.push('تغيّر الإسناد الفردي');
  if (ce.withheld && !pe.withheld) causes.push('حجب');
  if (pe.withheld && !ce.withheld) causes.push('رفع الحجب');
  // الدرجة/المرحلة سبب للاسمي وللبنود المحسوبة على وعاء فقط
  const ps = prevRes.snapshot || {}, cs = curRes.snapshot || {};
  if ((cur.itemCode === 'NOMINAL' || cur.hasBase) && (ps.grade !== cs.grade || ps.step !== cs.step)) causes.push(`تغيّر الدرجة/المرحلة: ${ps.grade}/${ps.step} ← ${cs.grade}/${cs.step}`);
  if (JSON.stringify(pe.family) !== JSON.stringify(ce.family) && (pe.family || ce.family)) causes.push('تغيّر العائلة');
  if (prev.segments !== cur.segments) causes.push('مقاطع جزئية بالشهر');
  return causes.length ? causes.join('؛ ') : 'تغيّر المدخلات';
}

/** يجمع سطور احتساب لكل (موظف، بند) — المبلغ ومعلومات آخر مقطع. */
async function aggregate(tx: any, runId: number) {
  const ls = rows(await tx.execute(sql`SELECT employee_id, coalesce(item_id, 0) item_key, item_id, item_code, item_name, kind, amount::text amount, item_version_id, assignment_id, explain, segment_from::text sf, base IS NOT NULL has_base
    FROM payroll_lines WHERE run_id = ${runId} ORDER BY employee_id, seq`));
  const m = new Map<string, any>();
  for (const l of ls) {
    const k = `${l.employee_id}:${l.item_key}:${l.kind === 'cap' ? 'cap' : 'x'}`;
    const cur = m.get(k);
    const amt = money(l.amount); // نص numeric(18,6) بدقة كاملة
    if (cur) { cur.amount += amt; cur.segments++; cur.hasBase ||= !!l.has_base; Object.assign(cur, { itemVersionId: l.item_version_id, assignmentId: l.assignment_id, explain: l.explain }); }
    else m.set(k, { employeeId: Number(l.employee_id), itemId: l.item_id, itemCode: l.kind === 'cap' ? `${l.item_code}_CAP` : l.item_code, itemName: l.item_name, amount: amt, segments: 1,
      itemVersionId: l.item_version_id, assignmentId: l.assignment_id, explain: l.explain, isCap: l.kind === 'cap', hasBase: !!l.has_base });
  }
  return m;
}

export async function approvePeriod(db: any, schema: any, periodId: number, user: string, eligibleStatuses: string[]) {
  if (!user) throw new PayrollError('تعذّر التعرّف على المستخدم', 403);
  return rrTx(db, async (tx: any) => {
    await lockPeriod(tx, periodId);
    const period = await getPeriod(tx, schema, periodId);
    if (period.status !== 'محتسبة') throw new PayrollError(`الفترة ${period.status}؛ الاعتماد للفترة المحتسبة فقط`, 409);
    const [run] = await tx.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, period.currentRunId));
    if (!run || run.state !== 'محتسب') throw new PayrollError('ما في احتساب صالح للاعتماد', 409);
    if (run.computedBy === user) throw new PayrollError('ما تكدر تعتمد فترة احتسبتها أنت؛ يعتمدها مستخدم آخر (مب9، حالة 11)', 403);
    const { fingerprint, ctx } = await loadForPeriod(tx, period, eligibleStatuses);
    if (fingerprint !== run.fingerprint) throw new PayrollError('تغيّرت مدخلات الفترة بعد الاحتساب (بصمة المدخلات اختلفت)؛ أعد الاحتساب ثم اعتمد (حالة 10)', 409);
    // ما يُعتمد وبند فعّال بقيمة «يُتحقق» (6)
    const unverified = ctx.items.filter((it: any) => it.versions.some((v: any) => v.props?.status === 'فعّال' && v.props?.verification === 'يُتحقق')).map((it: any) => it.code);
    if (unverified.length) throw new PayrollError(`بنود فعّالة بقيم «يُتحقق»: ${unverified.join('، ')}`, 409);
    // المتغيرات: مقارنة باحتساب الفترة العادية السابقة المعتمدة/المُصدَرة لنفس الفئة
    const [prevPeriod] = rows(await tx.execute(sql`SELECT id, current_run_id FROM payroll_periods WHERE category_id = ${period.categoryId} AND kind = 'عادية'
      AND (year * 12 + month) < ${period.year * 12 + period.month} AND status IN ('معتمدة', 'مُصدَرة') ORDER BY year DESC, month DESC LIMIT 1`));
    let variances = 0;
    if (prevPeriod?.current_run_id) {
      const [prev, cur] = await Promise.all([aggregate(tx, Number(prevPeriod.current_run_id)), aggregate(tx, run.id)]);
      const snaps = async (rid: number) => new Map(rows(await tx.execute(sql`SELECT employee_id, computed, issues, snapshot FROM payroll_results WHERE run_id = ${rid}`)).map(r => [Number(r.employee_id), r]));
      const [ps, cs] = await Promise.all([snaps(Number(prevPeriod.current_run_id)), snaps(run.id)]);
      const out: any[] = [];
      for (const k of new Set([...prev.keys(), ...cur.keys()])) {
        const a = prev.get(k), b = cur.get(k);
        const before = a?.amount ?? 0n, after = b?.amount ?? 0n;
        if (before === after) continue;
        const ref = b || a;
        out.push({ runId: run.id, employeeId: ref.employeeId, itemId: ref.itemId, itemCode: ref.itemCode, itemName: ref.itemName,
          before: toDecimal(before), after: toDecimal(after), cause: varianceCause(a, b, ps.get(ref.employeeId), cs.get(ref.employeeId)),
          orderRef: b?.explain?.assignment ? `إسناد ${b.explain.assignment.id}` : null });
      }
      for (let i = 0; i < out.length; i += BATCH) await tx.insert(schema.payrollVariances).values(out.slice(i, i + BATCH));
      variances = out.length;
    }
    await tx.update(schema.payrollRuns).set({ state: 'معتمد' }).where(eq(schema.payrollRuns.id, run.id));
    await tx.update(schema.payrollPeriods).set({ status: 'معتمدة', approvedBy: user, approvedAt: new Date() }).where(eq(schema.payrollPeriods.id, periodId));
    await audit(tx, schema, user, 'اعتماد فترة', periodId, { run_id: run.id, fingerprint, variances, previous_period: prevPeriod?.id ?? null });
    return { approved: true, run_id: run.id, variances, first_period: !prevPeriod };
  });
}

export async function issuePeriod(db: any, schema: any, periodId: number, user: string, dispatchLetter: string) {
  if (!String(dispatchLetter ?? '').trim()) throw new PayrollError('رقم كتاب الإرسال مطلوب');
  return db.transaction(async (tx: any) => {
    await lockPeriod(tx, periodId);
    const period = await getPeriod(tx, schema, periodId);
    if (period.status !== 'معتمدة') throw new PayrollError(`الفترة ${period.status}؛ الإصدار للفترة المعتمدة فقط`, 409);
    await tx.update(schema.payrollRuns).set({ state: 'مُصدَر' }).where(eq(schema.payrollRuns.id, period.currentRunId));
    await tx.update(schema.payrollPeriods).set({ status: 'مُصدَرة', issuedBy: user, issuedAt: new Date(), dispatchLetter: String(dispatchLetter).trim() }).where(eq(schema.payrollPeriods.id, periodId));
    await audit(tx, schema, user, 'إصدار فترة', periodId, { run_id: period.currentRunId, dispatch_letter: dispatchLetter });
    return { issued: true };
  });
}

/** إلغاء الاعتماد (يُطبَّق من العمليات بانتظار الاعتماد بعد مُعتمِد ثانٍ): الاحتساب يصير «ملغى» ويبقى أرشيفاً، والفترة ترجع مفتوحة. */
export async function unapproveInTx(tx: any, schema: any, periodId: number, reason: string, enteredBy: string, approver: string) {
  await lockPeriod(tx, periodId);
  const period = await getPeriod(tx, schema, periodId);
  if (period.status !== 'معتمدة') throw new PayrollError(`الفترة ${period.status}؛ إلغاء الاعتماد قبل الإصدار فقط`, 409);
  await tx.update(schema.payrollRuns).set({ state: 'ملغى', cancelReason: `إلغاء اعتماد: ${reason}` }).where(eq(schema.payrollRuns.id, period.currentRunId));
  await tx.update(schema.payrollPeriods).set({ status: 'مفتوحة', currentRunId: null, approvedBy: null, approvedAt: null }).where(eq(schema.payrollPeriods.id, periodId));
  await audit(tx, schema, approver, 'إلغاء اعتماد فترة', periodId, { reason, entered_by: enteredBy, cancelled_run: period.currentRunId });
  return { unapproved: true, cancelled_run: period.currentRunId };
}

