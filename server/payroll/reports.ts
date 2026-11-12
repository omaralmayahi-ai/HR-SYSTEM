// server/payroll/reports.ts — B8a3: تقرير المراجعة قبل الاعتماد (س11.3) والكشوف (13).
// كل الكشوف تُبنى من بيانات الاحتساب المجمّدة فقط (لقطة الموظف واسم البند المجمّد بالسطر)، فإعادة إخراج كشف
// مُصدَر بعد تغيير البيانات أو المسميات تطابق الأصل حرفياً (حالة 7).
import { sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { PayrollError } from './catalog.ts';
import { reconciliation } from './reconcile.ts';
import { money, toDecimal, sum, roundDinar, applyRate, rate } from './money.ts';

const rows = (r: any) => ((r as any).rows ?? r) as any[];
const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));

export async function periodWithRun(db: any, periodId: number, runId?: number) {
  const [p] = rows(await db.execute(sql`SELECT p.*, c.name AS category_name, c.code AS category_code FROM payroll_periods p JOIN payroll_categories c ON c.id = p.category_id WHERE p.id = ${periodId}`));
  if (!p) throw new PayrollError('الفترة غير موجودة', 404);
  const rid = runId ?? p.current_run_id;
  if (!rid) throw new PayrollError('الفترة بلا احتساب', 409);
  const [run] = rows(await db.execute(sql`SELECT * FROM payroll_runs WHERE id = ${rid} AND period_id = ${periodId}`));
  if (!run) throw new PayrollError('الاحتساب غير موجود لهذه الفترة', 404);
  return { period: p, run };
}

async function previousRun(db: any, period: any) {
  const [prev] = rows(await db.execute(sql`SELECT id, current_run_id, approved_at FROM payroll_periods WHERE category_id = ${period.category_id} AND kind = 'عادية'
    AND (year * 12 + month) < ${period.year * 12 + period.month} AND status IN ('معتمدة', 'مُصدَرة') ORDER BY year DESC, month DESC LIMIT 1`));
  return prev || null;
}

/** تقرير المراجعة (س11.3). threshold = نسبة تغيّر الصافي/عدد المستحقين اللي تُعلَّم. */
export async function reviewReport(db: any, periodId: number, threshold = 10) {
  const { period, run } = await periodWithRun(db, periodId);
  const results = rows(await db.execute(sql`SELECT employee_id, computed, net::text net, negative::text negative, flags, issues, snapshot FROM payroll_results WHERE run_id = ${run.id}`));
  const prev = await previousRun(db, period);
  const prevNet = new Map<number, string>();
  const prevSnap = new Map<number, any>();
  if (prev?.current_run_id) for (const r of rows(await db.execute(sql`SELECT employee_id, net::text net, computed, snapshot FROM payroll_results WHERE run_id = ${prev.current_run_id}`))) {
    if (r.computed) prevNet.set(Number(r.employee_id), r.net);
    prevSnap.set(Number(r.employee_id), r);
  }
  const who = (r: any) => ({ employee_id: Number(r.employee_id), name: r.snapshot?.full_name, company_number: r.snapshot?.company_number, department: r.snapshot?.department });

  const statesUsed: any[] = [], deferred: any[] = [];
  const netChanges: any[] = [], negatives: any[] = [], capped: any[] = [], unverifiedGrade: any[] = [], withheldGeneral: any[] = [], newEmployees: any[] = [];
  const issuesByCode: Record<string, any[]> = {};
  for (const r of results) {
    for (const i of r.issues || []) (issuesByCode[i.code] ||= []).push({ ...who(r), message: i.message, item: i.itemCode ?? null, date: i.date ?? null });
    if (!r.computed) continue;
    if (r.flags?.negative) negatives.push({ ...who(r), negative: r.negative });
    if (r.flags?.cap_reached) capped.push(who(r));
    if (r.flags?.unverified_grade) unverifiedGrade.push({ ...who(r), grade: r.snapshot?.grade });
    if (r.flags?.general_withheld?.length) withheldGeneral.push({ ...who(r), items: r.flags.general_withheld });
    if (r.flags?.states?.length) statesUsed.push({ ...who(r), states: r.flags.states, unverified: !!r.flags.unverified_state });
    if (r.flags?.deferred?.length) deferred.push({ ...who(r), deferred: r.flags.deferred });
    const before = prevNet.get(Number(r.employee_id));
    if (prev && before === undefined) newEmployees.push({ ...who(r), net: r.net });
    if (before !== undefined) {
      const b = num(before), a = num(r.net);
      const pct = b === 0 ? (a === 0 ? 0 : 100) : Math.abs(a - b) / b * 100;
      if (pct > threshold) netChanges.push({ ...who(r), before, after: r.net, change_pct: Math.round(pct * 10) / 10 });
    }
  }
  const computedNow = new Set(results.filter(r => r.computed).map(r => Number(r.employee_id)));
  const leavers = prev ? [...prevNet.keys()].filter(id => !computedNow.has(id)).map(id => ({ ...who(prevSnap.get(id)), net_before: prevNet.get(id) })) : [];

  // البنود اللي تغيّر عدد مستحقيها أكثر من النسبة
  const counts = async (rid: number) => new Map(rows(await db.execute(sql`SELECT item_code, item_name, count(DISTINCT employee_id)::int n FROM payroll_lines
    WHERE run_id = ${rid} AND kind IN ('item', 'deduction') AND amount <> 0 GROUP BY item_code, item_name`)).map(r => [r.item_code, r]));
  const cur = await counts(run.id);
  const itemChanges: any[] = [];
  if (prev?.current_run_id) {
    const old = await counts(Number(prev.current_run_id));
    for (const code of new Set([...cur.keys(), ...old.keys()])) {
      const a = cur.get(code)?.n ?? 0, b = old.get(code)?.n ?? 0;
      const pct = b === 0 ? (a === 0 ? 0 : 100) : Math.abs(a - b) / b * 100;
      if (pct > threshold) itemChanges.push({ item_code: code, item_name: (cur.get(code) || old.get(code)).item_name, before: b, after: a, change_pct: Math.round(pct * 10) / 10 });
    }
  }
  // تغييرات المستخدمين والأدوار منذ اعتماد الفترة السابقة (خطر المدير الثاني — قرار B8)
  const since = prev?.approved_at ?? period.opened_at;
  const userChanges = rows(await db.execute(sql`SELECT at, actor, action, before->>'username' AS before_user, after->>'username' AS after_user,
      before->>'role' AS before_role, after->>'role' AS after_role FROM payroll_audit WHERE entity = 'users' AND action <> 'تغيير كلمة مرور' AND at >= ${since}::timestamptz ORDER BY at`));
  // بنود فعّالة بقيم «يُتحقق» تمنع الاعتماد
  const unverifiedItems = rows(await db.execute(sql`SELECT DISTINCT i.code, i.name FROM pay_item_versions v JOIN pay_items i ON i.id = v.item_id
    WHERE i.category_id = ${period.category_id} AND v.superseded_at IS NULL AND v.props->>'status' = 'فعّال' AND v.props->>'verification' = 'يُتحقق'
      AND v.valid_from <= (make_date(${period.year}, ${period.month}, 1) + interval '1 month - 1 day')::date AND (v.valid_to IS NULL OR v.valid_to >= make_date(${period.year}, ${period.month}, 1))`));

  // الفروق الرجعية بهذا الاحتساب (القسم 12): لكل موظف مجموعها وأشهرها؛ السالبة الكبيرة تحتاج أمر استرداد (س12.6)
  const retro = rows(await db.execute(sql`SELECT l.employee_id, r.snapshot, sum(CASE WHEN l.direction = '-' THEN -l.amount ELSE l.amount END)::text total,
      array_agg(DISTINCT l.explain->>'origin_ym') months, bool_or((l.explain->>'shadow')::boolean) shadow
    FROM payroll_lines l JOIN payroll_results r ON r.run_id = l.run_id AND r.employee_id = l.employee_id
    WHERE l.run_id = ${run.id} AND l.kind = 'retro' GROUP BY l.employee_id, r.snapshot ORDER BY sum(CASE WHEN l.direction = '-' THEN -l.amount ELSE l.amount END)`)).map(x => ({ ...who(x), total: x.total, months: x.months, shadow: !!x.shadow }));
  const retroIssues = results.flatMap(r => (r.issues || []).filter((i: any) => ['RETRO_SKIPPED', 'RETRO_UNPAID'].includes(i.code)).map((i: any) => ({ ...who(r), message: i.message })));
  // فروق المطابقة مع الكشف الخارجي (س11.3، فترة الانتقال)
  const rec: any = await reconciliation(db, periodId);
  const reconcile = rec.has_import && rec.has_run ? { summary: rec.summary, totals: rec.totals, top: rec.diffs.slice(0, 50), targets: rec.targets,
    import: { id: rec.import.id, file_name: rec.import.file_name, file_sha256: rec.import.file_sha256, imported_by: rec.import.imported_by, confirmed_by: rec.import.confirmed_by ?? null } } : null;
  // أساس الفروق الظلّية: أي استيراد (ومن أكّده) بُنيت عليه الفروق — حتى المراجع يرى الأساس لا الفرق فقط (مراجعة B8a4 H2)
  const retroBasis = rows(await db.execute(sql`SELECT i.id, p.year, p.month, i.file_name, i.file_sha256, i.imported_by, i.confirmed_by, i.superseded_at
    FROM payroll_external_imports i JOIN payroll_periods p ON p.id = i.period_id
    WHERE i.id IN (SELECT DISTINCT (explain->>'basis_import_id')::int FROM payroll_lines WHERE run_id = ${run.id} AND kind = 'retro' AND explain ? 'basis_import_id') ORDER BY i.id`));
  return {
    period: { id: period.id, year: period.year, month: period.month, status: period.status, category: period.category_name, kind: period.kind },
    run: { id: run.id, state: run.state, computed_by: run.computed_by, finished_at: run.finished_at, totals: run.totals },
    previous_period: prev?.id ?? null, threshold,
    sections: {
      net_changes: netChanges.sort((a, b) => b.change_pct - a.change_pct),
      negative_net: negatives, cap_reached: capped, item_beneficiary_changes: itemChanges,
      issues: issuesByCode, unverified_grades: unverifiedGrade, general_withheld: withheldGeneral,
      reconcile, retro_basis_imports: retroBasis,
      retro_diffs: retro, retro_negative: retro.filter(x => Number(x.total) < 0), retro_issues: retroIssues, retro_strays: run.totals?.retro_strays ?? [],
      entitlement_states: statesUsed, unverified_states: statesUsed.filter(x => x.unverified), deferred_deductions: deferred,
      new_employees: newEmployees, leavers, user_role_changes: userChanges, unverified_items: unverifiedItems,
    },
    blocking: unverifiedItems.length ? ['بنود فعّالة بقيم «يُتحقق»'] : [],
  };
}

// ---------------- الكشوف ----------------
export const STATEMENTS = { full: 'الكشف الكامل', variances: 'كشف المتغيرات', item: 'كشف البند', exceptions: 'تقرير الاستثناءات',
  retirement: 'كشف التوقيفات التقاعدية', deductions: 'كشوف الاستقطاعات للجهات', bank: 'كشف المصرف', accounting: 'الملخص المحاسبي' } as const;
export type StatementKind = keyof typeof STATEMENTS;

const colKey = (l: any) => (l.kind === 'cap' ? `${l.item_code}#cap` : l.kind === 'retro' ? `${l.item_code}#retro` : l.item_code);
const catName = (period: any, run: any) => run.totals?.category_name ?? period.category_name;
const catCode = (period: any, run: any) => run.totals?.category_code ?? period.category_code;
const USER_MARK = '\u0000المستخرج';
function header(period: any, run: any, title: string, extra?: string) {
  const issued = period.status === 'مُصدَرة';
  return [
    [title + (extra ? ` — ${extra}` : '')],
    [`الفئة: ${catName(period, run)}`, `الفترة: ${period.year}/${String(period.month).padStart(2, '0')}`, `رقم الفترة: ${period.id}`, `الاحتساب: ${run.id}`],
    [issued ? `أُصدر: ${new Date(period.issued_at).toISOString().slice(0, 10)}` : `الحالة: ${period.status} (غير نهائي)`, `كتاب الإرسال: ${period.dispatch_letter ?? '—'}`, `المصدر: ${period.pay_source}`, USER_MARK],
    [],
  ];
}

/** بيانات الكشف كجداول (تُختبر مباشرة) — بلا أي قراءة من جداول البيانات الحية. */
export async function statementData(db: any, periodId: number, kind: StatementKind, opts: { itemCode?: string; runId?: number } = {}) {
  const { period, run } = await periodWithRun(db, periodId, opts.runId);
  const results = rows(await db.execute(sql`SELECT employee_id, computed, nominal::text nominal, allowances::text allowances, deductions::text deductions, net::text net, flags, issues, snapshot
    FROM payroll_results WHERE run_id = ${run.id} ORDER BY snapshot->>'department' NULLS LAST, snapshot->>'section' NULLS LAST, snapshot->>'company_number', employee_id`));
  const lines = rows(await db.execute(sql`SELECT employee_id, item_code, item_name, kind, direction, amount::text amount, assignment_id, explain, segment_from::text sf, segment_to::text st, share
    FROM payroll_lines WHERE run_id = ${run.id} ORDER BY employee_id, seq`));
  const byEmp = new Map<number, any[]>();
  for (const l of lines) { const k = Number(l.employee_id); (byEmp.get(k) || byEmp.set(k, []).get(k)!).push(l); }
  const idCols = (r: any) => [r.snapshot?.company_number ?? '', r.snapshot?.full_name ?? '', r.snapshot?.department ?? '', r.snapshot?.section ?? '', `${r.snapshot?.grade ?? ''}/${r.snapshot?.step ?? ''}`];
  const idHead = ['رقم الشركة', 'الاسم', 'القسم', 'الشعبة', 'الدرجة/المرحلة'];
  const sheets: { name: string; rows: any[][] }[] = [];

  if (kind === 'full') {
    // أعمدة البنود بترتيب ظهورها، باسمها المجمّد؛ التخفيض بسبب السقف عمود مستقل
    const cols: { key: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const l of lines) {
      if (l.kind === 'nominal') continue;
      const key = colKey(l);
      if (!seen.has(key)) { seen.add(key); cols.push({ key, name: l.kind === 'cap' ? `تخفيض سقف: ${l.item_code}` : l.kind === 'retro' ? `فروق رجعية: ${String(l.item_name).replace(/^فرق (رجعي )?عن [^:]+: /, '')}` : l.item_name }); }
    }
    const body: any[][] = [];
    const deptTotals = new Map<string, Map<string, bigint>>();
    for (const r of results.filter(r => r.computed)) {
      const amounts = new Map<string, bigint>();
      for (const l of byEmp.get(Number(r.employee_id)) || []) {
        if (l.kind === 'nominal') continue;
        const key = colKey(l);
        amounts.set(key, (amounts.get(key) ?? 0n) + money(l.amount));
      }
      body.push([...idCols(r), num(r.nominal), ...cols.map(c => (amounts.has(c.key) ? Number(toDecimal(amounts.get(c.key)!)) : '')), num(r.allowances), num(r.deductions), num(r.net)]);
      const dept = r.snapshot?.department || 'بلا قسم';
      const dt = deptTotals.get(dept) || new Map<string, bigint>(); deptTotals.set(dept, dt);
      for (const [k, v] of [['nominal', r.nominal], ['allowances', r.allowances], ['deductions', r.deductions], ['net', r.net]] as const) dt.set(k, (dt.get(k) ?? 0n) + money(v));
      dt.set('count', (dt.get('count') ?? 0n) + 1n);
    }
    sheets.push({ name: 'الكشف الكامل', rows: [...header(period, run, STATEMENTS.full), [...idHead, 'الاسمي', ...cols.map(c => c.name), 'المخصصات', 'الاستقطاعات', 'الصافي'], ...body] });
    const keys = ['nominal', 'allowances', 'deductions', 'net'] as const;
    const grand = new Map<string, bigint>();
    const totalRows = [...deptTotals.entries()].map(([d, t]) => {
      for (const k of [...keys, 'count']) grand.set(k, (grand.get(k) ?? 0n) + (t.get(k) ?? 0n));
      return [d, Number(t.get('count')), ...keys.map(k => Number(toDecimal(t.get(k)!)))];
    });
    sheets.push({ name: 'المجاميع حسب القسم', rows: [['القسم', 'العدد', 'الاسمي', 'المخصصات', 'الاستقطاعات', 'الصافي'], ...totalRows,
      ['المجموع', Number(grand.get('count') ?? 0n), ...keys.map(k => Number(toDecimal(grand.get(k) ?? 0n)))]] });
  } else if (kind === 'variances') {
    const vs = rows(await db.execute(sql`SELECT v.employee_id, v.item_code, v.item_name, v.before::text b, v.after::text a, v.cause, v.order_ref, r.snapshot
      FROM payroll_variances v JOIN payroll_results r ON r.run_id = v.run_id AND r.employee_id = v.employee_id WHERE v.run_id = ${run.id} ORDER BY r.snapshot->>'company_number', v.item_code`));
    sheets.push({ name: 'المتغيرات', rows: [...header(period, run, STATEMENTS.variances), [...idHead, 'البند', 'قبل', 'بعد', 'الفرق', 'السبب', 'الأمر/الإسناد'],
      ...vs.map(v => [...idCols(v), v.item_name, num(v.b), num(v.a), Number(toDecimal(money(v.a) - money(v.b))), v.cause, v.order_ref ?? ''])] });
  } else if (kind === 'item') {
    const code = String(opts.itemCode || '').trim();
    if (!code) throw new PayrollError('رمز البند مطلوب لكشف البند');
    const body: any[][] = [];
    let itemName = code;
    for (const r of results) {
      const ls = (byEmp.get(Number(r.employee_id)) || []).filter(l => l.item_code === code);
      if (!ls.length) continue;
      itemName = ls[0].item_name;
      const total = sum(ls.filter(l => l.kind !== 'cap').map(l => money(l.amount)));
      const cap = sum(ls.filter(l => l.kind === 'cap').map(l => money(l.amount)));
      const withheld = ls.some(l => l.explain?.withheld);
      const assign = ls.find(l => l.explain?.assignment)?.explain?.assignment;
      body.push([...idCols(r), Number(toDecimal(total)), cap === 0n ? '' : Number(toDecimal(cap)), withheld ? 'محجوب' : (assign ? `إسناد فردي ${assign.id}` : 'تلقائي'), ls.map(l => l.explain?.level).filter(Boolean)[0] ?? '']);
    }
    sheets.push({ name: 'كشف البند', rows: [...header(period, run, STATEMENTS.item, itemName), [...idHead, 'المبلغ', 'تخفيض السقف', 'السلوك', 'المستوى'], ...body] });
  } else if (kind === 'exceptions') {
    const body: any[][] = [];
    for (const r of results) {
      const ls = byEmp.get(Number(r.employee_id)) || [];
      for (const l of ls) {
        if (l.explain?.withheld) body.push([...idCols(r), 'حجب', l.item_name, Number(l.amount), `إسناد ${l.explain.withheld.assignment_id}`]);
        else if (l.explain?.assignment) body.push([...idCols(r), 'إسناد فردي', l.item_name, Number(l.amount), `${l.explain.assignment.kind} ${l.explain.assignment.id}`]);
        if (l.kind === 'cap') body.push([...idCols(r), 'سقف 200%', l.item_name, Number(l.amount), `الأولوية ${l.explain?.priority ?? '—'}`]);
      }
      if (r.flags?.segments > 1) body.push([...idCols(r), 'شهر جزئي/مقاطع', '', '', `${r.flags.segments} مقاطع`]);
      if (r.flags?.negative) body.push([...idCols(r), 'صافٍ سالب', '', '', 'صُرف صفراً']);
      for (const i of r.issues || []) if (i.code !== 'NOT_IN_PERIOD') body.push([...idCols(r), `تنبيه ${i.code}`, i.itemCode ?? '', '', i.message]);
    }
    sheets.push({ name: 'الاستثناءات', rows: [...header(period, run, STATEMENTS.exceptions), [...idHead, 'النوع', 'البند', 'المبلغ', 'التفصيل'], ...body] });
  } else if (kind === 'retirement') {
    // الوعاء وحصة الموظف من سطر التقاعد المجمّد؛ حصة الشركة بنسبة employer_rate بنسخة البند (ق-15 — فارغة حتى الكتاب)
    const ret = lines.filter(l => l.item_code === 'RETIRE' && l.kind !== 'retro');
    const retRetro = new Map<number, bigint>();
    for (const l of lines) if (l.item_code === 'RETIRE' && l.kind === 'retro') retRetro.set(Number(l.employee_id), (retRetro.get(Number(l.employee_id)) ?? 0n) + money(l.amount));
    const vids = [...new Set(rows(await db.execute(sql`SELECT DISTINCT item_version_id FROM payroll_lines WHERE run_id = ${run.id} AND item_code = 'RETIRE'`)).map(r => r.item_version_id).filter(Boolean))];
    const vprops = vids.length ? rows(await db.execute(sql`SELECT id, props FROM pay_item_versions WHERE id = ANY(${sql.raw(`ARRAY[${vids.map(Number).join(',')}]::int[]`)})`)) : [];
    const employerRate = vprops.map(v => v.props?.employer_rate).find(x => x !== undefined && x !== null);
    const body: any[][] = [];
    let tb = 0n, te = 0n, tc = 0n, tr = 0n;
    for (const r of results.filter(x => x.computed)) {
      const l = ret.find(x => Number(x.employee_id) === Number(r.employee_id));
      const rr = retRetro.get(Number(r.employee_id)) ?? 0n;
      tr += rr;
      if (!l) { if (rr !== 0n) body.push([...idCols(r), '', '', '', 'فرق رجعي فقط', Number(toDecimal(rr))]); continue; }
      const base = money(l.explain?.base ?? '0'), emp = money(l.amount);
      const er = employerRate !== undefined ? roundDinar(applyRate(base, rate(employerRate))) : null;
      tb += base; te += emp; if (er !== null) tc += er;
      body.push([...idCols(r), Number(toDecimal(base)), Number(toDecimal(emp)), er === null ? '' : Number(toDecimal(er)), l.explain?.withheld ? 'محجوب جزئياً/كلياً' : '', rr === 0n ? '' : Number(toDecimal(rr))]);
    }
    sheets.push({ name: 'التوقيفات التقاعدية', rows: [...header(period, run, STATEMENTS.retirement), ...(employerRate === undefined ? [['حصة الشركة فارغة: نسبتها بانتظار الكتاب (ق-15)']] : []),
      [...idHead, 'الوعاء', 'حصة الموظف', 'حصة الشركة', 'ملاحظة', 'فرق رجعي (حصة الموظف)'], ...body, ['المجموع', '', '', '', '', Number(toDecimal(tb)), Number(toDecimal(te)), employerRate === undefined ? '' : Number(toDecimal(tc)), '', Number(toDecimal(tr))]] });
  } else if (kind === 'deductions') {
    // لكل بند استقطاع له جهة مستفيدة: ورقة بالمستقطع لكل موظف (الاسم المجمّد بالسطر، والجهة من البند)
    const ben = new Map(rows(await db.execute(sql`SELECT code, beneficiary FROM pay_items WHERE beneficiary IS NOT NULL AND beneficiary <> ''`)).map(r => [r.code, r.beneficiary]));
    const byCode = new Map<string, Map<number, bigint>>();
    for (const l of lines) {
      if (l.direction !== '-' || l.item_code === 'RETIRE' || !ben.has(l.item_code)) continue;
      const m = byCode.get(l.item_code) || byCode.set(l.item_code, new Map()).get(l.item_code)!;
      m.set(Number(l.employee_id), (m.get(Number(l.employee_id)) ?? 0n) + money(l.amount));
    }
    const resById = new Map(results.map(r => [Number(r.employee_id), r]));
    for (const [code, m] of byCode) {
      const name = lines.find(l => l.item_code === code)?.item_name ?? code;
      let total = 0n;
      const body = [...m.entries()].filter(([, a]) => a !== 0n).map(([eid, a]) => { total += a; return [...idCols(resById.get(eid)), Number(toDecimal(a))]; });
      sheets.push({ name: name.slice(0, 31), rows: [...header(period, run, STATEMENTS.deductions, `${name} — ${ben.get(code)}`), [...idHead, 'المستقطع'], ...body, ['المجموع', '', '', '', '', Number(toDecimal(total))]] });
    }
    if (!sheets.length) sheets.push({ name: 'لا يوجد', rows: [...header(period, run, STATEMENTS.deductions), ['ما في استقطاعات لجهات مستفيدة بهذا الاحتساب']] });
  } else if (kind === 'bank') {
    // الحساب كما كان معروفاً يوم الإصدار (إعادة الإخراج تطابق الأصل)، والنافذ بنهاية الشهر. صيغة عامة حتى ق-11
    const asOf = period.issued_at ?? new Date();
    const monthEnd = `${period.year}-${String(period.month).padStart(2, '0')}-${String(new Date(Date.UTC(period.year, period.month, 0)).getUTCDate()).padStart(2, '0')}`;
    const accts = new Map(rows(await db.execute(sql`SELECT DISTINCT ON (employee_id) employee_id, bank_name, account_number FROM employee_bank_accounts
      WHERE recorded_at <= ${asOf}::timestamptz AND (superseded_at IS NULL OR superseded_at > ${asOf}::timestamptz) AND valid_from <= ${monthEnd}::date
      ORDER BY employee_id, valid_from DESC, id DESC`)).map(r => [Number(r.employee_id), r]));
    const rejected = new Set(rows(await db.execute(sql`SELECT employee_id FROM payroll_bank_rejections WHERE run_id = ${run.id}`)).map(r => Number(r.employee_id)));
    const body: any[][] = []; const missing: any[][] = [];
    let total = 0n;
    for (const r of results.filter(x => x.computed && money(x.net) > 0n)) {
      const a = accts.get(Number(r.employee_id));
      if (!a) { missing.push([...idCols(r), Number(r.net)]); continue; }
      total += money(r.net);
      body.push([a.bank_name, a.account_number, r.snapshot?.company_number ?? '', r.snapshot?.full_name ?? '', Number(r.net), rejected.has(Number(r.employee_id)) ? 'رُفض' : '']);
    }
    sheets.push({ name: 'كشف المصرف', rows: [...header(period, run, STATEMENTS.bank), ['المصرف', 'رقم الحساب/البطاقة', 'رقم الشركة', 'الاسم', 'الصافي', 'رفض المصرف'], ...body, ['المجموع', '', '', '', Number(toDecimal(total)), '']] });
    if (missing.length) sheets.push({ name: 'بلا حساب مصرفي', rows: [['موظفون صافيهم موجب وما عندهم حساب مصرفي نافذ'], [...idHead, 'الصافي'], ...missing] });
  } else if (kind === 'accounting') {
    // مجموع كل بند ← رقم الحساب بالدليل المحاسبي (الرقم من البند الحالي؛ المبالغ والأسماء من اللقطة)
    const codes = new Map(rows(await db.execute(sql`SELECT code, account_code FROM pay_items`)).map(r => [r.code, r.account_code]));
    const g = new Map<string, { name: string; dir: string; amount: bigint; count: Set<number> }>();
    for (const l of lines) {
      if (l.kind === 'held') continue;
      const key = `${l.kind === 'retro' ? 'retro:' : l.kind === 'cap' ? 'cap:' : ''}${l.item_code}`;
      const name = l.kind === 'retro' ? `فروق رجعية: ${String(l.item_name).replace(/^فرق (رجعي )?عن [^:]+: /, '')}` : l.kind === 'cap' ? `تخفيض سقف: ${l.item_code}` : l.item_name;
      const x = g.get(key) || { name, dir: l.kind === 'cap' ? '+' : l.direction, amount: 0n, count: new Set<number>() };
      x.amount += money(l.amount); x.count.add(Number(l.employee_id)); g.set(key, x);
    }
    const body = [...g.entries()].map(([k, x]) => [codes.get(k.replace(/^(retro|cap):/, '')) ?? 'بلا رقم حساب', x.name, x.dir === '-' ? 'استقطاع' : 'استحقاق', x.count.size, Number(toDecimal(x.amount))]);
    const net = results.filter(r => r.computed).reduce((a, r) => a + money(r.net), 0n);
    sheets.push({ name: 'الملخص المحاسبي', rows: [...header(period, run, STATEMENTS.accounting), ['رقم الحساب', 'البند', 'النوع', 'عدد الموظفين', 'المجموع'], ...body, ['', 'صافي الرواتب', '', '', Number(toDecimal(net))]] });
  } else {
    throw new PayrollError('نوع كشف غير معروف');
  }
  return { period, run, sheets };
}

export async function statementWorkbook(db: any, periodId: number, kind: StatementKind, user: string, opts: { itemCode?: string; runId?: number } = {}) {
  const data = await statementData(db, periodId, kind, opts);
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] } as any;
  for (const s of data.sheets) {
    // المستخرج يُكتب بالرأس (السطر الثالث) — الكشف نفسه ما يتغير
    const rowsOut = s.rows.map(r => r.map(c => (c === USER_MARK ? `استخرجه: ${user}` : c)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsOut), s.name.slice(0, 31));
  }
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fname = `${STATEMENTS[kind]}-${data.period.year}-${String(data.period.month).padStart(2, '0')}-${catCode(data.period, data.run)}.xlsx`;
  return { buf, fname, period: data.period, run: data.run };
}
