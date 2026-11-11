// server/payroll/retro.ts — B8c: الفروقات الرجعية (القسم 12) والدورات الاستثنائية (11.2).
// الفرق لكل (موظف، بند، شهر أصلي) = إعادة الاحتساب بالمعرفة الحالية − ما صُرف عنه حتى الآن
// (اللقطة الأصلية + كل الفروق المعتمدة سابقاً عنه)؛ فرق اعتُمد يصير من الأساس فما يُصرف مرتين (س12.3).
import { sql } from 'drizzle-orm';
import { loadPeriodInputs } from './loader.ts';
import { computeEmployee, type EmployeeIn } from './engine.ts';
import { money, type Micro } from './money.ts';

const rows = (r: any) => ((r as any).rows ?? r) as any[];
export const RETRO_MONTHS = 36; // س12.7
const BASIS_KINDS = ['nominal', 'item', 'cap', 'deduction', 'held_release', 'retro'];

export type RetroLine = NonNullable<EmployeeIn['retro']>[number];

/** مفتاح المقارنة: البند (السقف يُدمج ببنده) — والفرق الرجعي يُنسب لمفتاحه الأصلي. */
const keyOf = (l: { kind: string; item_code: string; explain?: any }) => (l.kind === 'retro' ? String(l.explain?.origin_key ?? l.item_code) : l.item_code);

/** ما صُرف عن فترة أصلية لكل (موظف، مفتاح): اللقطة + الفروق المعتمدة عنها (بأي احتساب لاحق معتمد/مُصدَر). */
async function paidSoFar(tx: any, origin: { id: number; runId: number }, employeeIds: number[], excludePeriodId: number | null) {
  const ids = sql.raw(`ARRAY[${employeeIds.join(',') || 0}]::int[]`);
  const base = rows(await tx.execute(sql`SELECT employee_id, kind, item_id, item_code, item_name, direction, amount::text amount, explain FROM payroll_lines
    WHERE run_id = ${origin.runId} AND employee_id = ANY(${ids}) AND kind = ANY(${sql.raw(`ARRAY[${BASIS_KINDS.map(k => `'${k}'`).join(',')}]::text[]`)}) ORDER BY employee_id, seq`));
  const later = rows(await tx.execute(sql`SELECT l.employee_id, l.kind, l.item_id, l.item_code, l.item_name, l.direction, l.amount::text amount, l.explain FROM payroll_lines l
    JOIN payroll_runs r ON r.id = l.run_id WHERE r.state IN ('معتمد', 'مُصدَر') AND l.kind = 'retro' AND l.employee_id = ANY(${ids})
      AND (l.explain->>'origin_period_id')::int = ${origin.id} ${excludePeriodId ? sql`AND r.period_id <> ${excludePeriodId}` : sql``} ORDER BY l.employee_id, l.run_id, l.seq`));
  const m = new Map<string, { amount: Micro; itemId: number | null; itemCode: string; itemName: string; direction: '+' | '-' }>();
  for (const l of [...base, ...later]) {
    if (l.kind === 'retro' && l.explain?.origin_period_id !== undefined && Number(l.explain.origin_period_id) !== origin.id) continue;
    const k = `${l.employee_id}|${keyOf(l)}`;
    const name = l.kind === 'retro' ? String(l.item_name).replace(/^فرق رجعي عن [^:]+: /, '') : l.item_name;
    const cur = m.get(k) || { amount: 0n, itemId: l.item_id, itemCode: keyOf(l), itemName: name, direction: l.kind === 'cap' ? '+' : l.direction };
    cur.amount += money(l.amount);
    if (l.kind !== 'cap' && l.kind !== 'retro') cur.itemName = name;
    m.set(k, cur);
  }
  return m;
}

/** يحسب فروق فترة أصلية لموظفين محددين. */
async function diffsFor(tx: any, origin: any, employeeIds: number[], o: { categoryId: number; eligibleStatuses: string[]; knownAt: Date; excludePeriodId: number | null },
  out: Map<number, RetroLine[]>, skipped: Map<number, string>) {
  if (!employeeIds.length) return;
  const { ctx, employees } = await loadPeriodInputs(tx, { year: origin.year, month: origin.month, categoryId: o.categoryId, eligibleStatuses: o.eligibleStatuses,
    knownAt: o.knownAt, employeeIds, sequential: true, periodId: origin.id, balancesKnownAt: origin.approved_at });
  ctx.noNetProtection = true; // س12.4
  const paid = await paidSoFar(tx, { id: origin.id, runId: Number(origin.current_run_id) }, employeeIds, o.excludePeriodId);
  // تنبيهات البنود بالاحتساب الأصلي: تنبيه جديد بإعادة الاحتساب (بلا مستوى، تعذّر التقييم...) ما يصير استرداداً (AGENTS 2 — مراجعة M2)
  const origIssues = new Map<number, Set<string>>(rows(await tx.execute(sql`SELECT employee_id, issues FROM payroll_results WHERE run_id = ${Number(origin.current_run_id)} AND employee_id = ANY(${sql.raw(`ARRAY[${employeeIds.join(',') || 0}]::int[]`)}) ORDER BY employee_id`))
    .map(r => [Number(r.employee_id), new Set((r.issues || []).map((i: any) => `${i.code}|${i.itemCode ?? ''}`))]));
  const ym = `${origin.year}/${String(origin.month).padStart(2, '0')}`;
  const byEmp = new Map(employees.map(e => [e.id, e]));
  for (const eid of [...employeeIds].sort((x, y) => x - y)) {
    const e = byEmp.get(eid);
    const blockedKeys = new Set<string>();
    const now = new Map<string, { amount: Micro; itemId: number | null; itemCode: string; itemName: string; direction: '+' | '-' }>();
    if (e) {
      const r = computeEmployee({ ...e, retro: [], unpaid: 0n }, ctx);
      // تعذّر الاحتساب بسبب بيانات ناقصة (بلا درجة...) ما يعني إلغاء الراتب: ما نولّد فروقاً سالبة، نُبلّغ
      const blocking = r.issues.filter(i => i.code !== 'NOT_IN_PERIOD' && !r.computed);
      if (blocking.length) { skipped.set(eid, `${ym}: ${blocking.map(i => i.message).join('؛ ')}`); continue; }
      const had = origIssues.get(eid) || new Set<string>();
      const newItemIssues = r.issues.filter(i => i.itemCode && !had.has(`${i.code}|${i.itemCode}`));
      for (const i of newItemIssues) blockedKeys.add(i.itemCode!);
      if (newItemIssues.length) skipped.set(eid, `${ym}: ما احتُسب فرق ${[...blockedKeys].join('، ')} — ${newItemIssues.map(i => i.message).join('؛ ')}`);
      for (const l of r.lines) {
        if (!BASIS_KINDS.includes(l.kind)) continue;
        if (blockedKeys.has(l.itemCode)) continue;
        const k = `${eid}|${l.itemCode}`;
        const cur = now.get(k) || { amount: 0n, itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, direction: l.kind === 'cap' ? '+' : l.direction as '+' | '-' };
        cur.amount += l.amount;
        if (l.kind !== 'cap') cur.itemName = l.itemName;
        now.set(k, cur);
      }
    }
    for (const k of new Set([...[...paid.keys()].filter(x => x.startsWith(`${eid}|`)), ...now.keys()])) {
      if (blockedKeys.has(k.slice(k.indexOf('|') + 1))) continue;
      const a = paid.get(k), b = now.get(k);
      const diff = (b?.amount ?? 0n) - (a?.amount ?? 0n);
      if (diff === 0n) continue;
      const ref = b || a!;
      (out.get(eid) || out.set(eid, []).get(eid)!).push({ originPeriodId: origin.id, originYm: ym, key: ref.itemCode, itemId: ref.itemId, itemCode: ref.itemCode,
        itemName: ref.itemName, direction: ref.direction, amount: diff, ...(origin.pay_source === 'ظلّي' ? { shadow: true } : {}) });
    }
  }
}

/**
 * الفروق الرجعية للفترة العادية المفتوحة: لكل فترة عادية سابقة معتمدة/مُصدَرة ضمن الحد، المتأثرون بقيمة
 * سُجّلت بعد اعتمادها ونفاذها يمس شهرها (س12.2)؛ نسخة بند أو سلّم بعد اعتمادها تجعل الفئة كلها متأثرة.
 */
export async function retroForPeriod(tx: any, period: any, eligibleStatuses: string[], knownAt: Date) {
  const out = new Map<number, RetroLine[]>(); const skipped = new Map<number, string>();
  const ym = period.year * 12 + period.month;
  const origins = rows(await tx.execute(sql`SELECT id, year, month, approved_at, current_run_id, pay_source FROM payroll_periods
    WHERE category_id = ${period.categoryId} AND kind = 'عادية' AND status IN ('معتمدة', 'مُصدَرة') AND current_run_id IS NOT NULL
      AND (year * 12 + month) < ${ym} AND (year * 12 + month) >= ${ym - RETRO_MONTHS} ORDER BY year, month`));
  for (const q of origins) {
    const start = `${q.year}-${String(q.month).padStart(2, '0')}-01`;
    const end = sql`(${start}::date + interval '1 month - 1 day')::date`;
    const at = q.approved_at;
    // تغيير عام بعد اعتمادها يمس شهرها ⇒ كل موظفي الفئة. نسخ البنود تُقارن بمحتواها الفعّال للشهر كما كان معروفاً
    // يوم الاعتماد مقابل الآن، فبقايا القص (نفس المحتوى) والمسودات ما تعتبر تغييراً (مراجعة M1)
    const vset = (asOf: any) => sql`SELECT v.item_id, greatest(v.valid_from, ${start}::date) f, least(coalesce(v.valid_to, ${end}), ${end}) t, v.props
      FROM pay_item_versions v JOIN pay_items i ON i.id = v.item_id WHERE i.category_id = ${period.categoryId} AND v.props->>'status' = 'فعّال'
        AND v.recorded_at <= ${asOf}::timestamptz AND (v.superseded_at IS NULL OR v.superseded_at > ${asOf}::timestamptz)
        AND v.valid_from <= ${end} AND (v.valid_to IS NULL OR v.valid_to >= ${start}::date)`;
    const [all] = rows(await tx.execute(sql`SELECT
      EXISTS ((${vset(knownAt)} EXCEPT ${vset(at)}) UNION ALL (${vset(at)} EXCEPT ${vset(knownAt)})) items,
      EXISTS (SELECT 1 FROM salary_scale_versions s WHERE s.status = 'معتمد' AND s.approved_at > ${at}::timestamptz AND s.approved_at <= ${knownAt}::timestamptz AND s.effective_from <= ${end}) scale,
      EXISTS (SELECT 1 FROM payroll_audit a WHERE a.at > ${at}::timestamptz AND a.at <= ${knownAt}::timestamptz
        AND (a.entity = 'entitlement_states' OR a.action = 'ربط حالة استحقاق')) states`));
    let ids: number[];
    if (all?.items || all?.scale || all?.states) {
      ids = rows(await tx.execute(sql`SELECT employee_id FROM payroll_results WHERE run_id = ${q.current_run_id}
        UNION SELECT e.id FROM employees e JOIN payroll_category_rules cr ON cr.category_id = ${period.categoryId} AND cr.service_type = e.service_type
          AND (cr.contract_type IS NULL OR cr.contract_type = e.contract_type) WHERE e.created_at <= ${knownAt}::timestamptz ORDER BY 1`)).map(r => Number(r.employee_id));
    } else {
      ids = rows(await tx.execute(sql`SELECT DISTINCT eid FROM (
          SELECT employee_id eid FROM employee_field_history WHERE recorded_at > ${at}::timestamptz AND recorded_at <= ${knownAt}::timestamptz AND (valid_from IS NULL OR valid_from <= ${end})
          UNION SELECT employee_id FROM employee_pay_assignments WHERE (recorded_at > ${at}::timestamptz OR superseded_at > ${at}::timestamptz) AND recorded_at <= ${knownAt}::timestamptz
            AND valid_from <= ${end} AND (valid_to IS NULL OR valid_to >= ${start}::date)
          UNION SELECT m.employee_id FROM family_members m WHERE m.created_at > ${at}::timestamptz AND m.created_at <= ${knownAt}::timestamptz
          UNION SELECT m.employee_id FROM family_member_facts f JOIN family_members m ON m.id = f.member_id WHERE f.recorded_at > ${at}::timestamptz AND f.recorded_at <= ${knownAt}::timestamptz
            AND (f.valid_from IS NULL OR f.valid_from <= ${end})
          UNION SELECT m.employee_id FROM family_extensions x JOIN family_members m ON m.id = x.member_id WHERE x.recorded_at > ${at}::timestamptz AND x.recorded_at <= ${knownAt}::timestamptz
          -- الإجازات والعقوبات: إضافة أو تعديل (حالة، تواريخ) بعد الاعتماد (مراجعة H2)
          UNION SELECT employee_id FROM leave_requests WHERE greatest(created_at, updated_at) > ${at}::timestamptz AND greatest(created_at, updated_at) <= ${knownAt}::timestamptz
          UNION SELECT employee_id FROM penalties WHERE greatest(created_at, updated_at) > ${at}::timestamptz AND greatest(created_at, updated_at) <= ${knownAt}::timestamptz
          -- إلغاء أمر بعد الاعتماد يلغي أثر قيوده
          UNION SELECT h.employee_id FROM administrative_orders o JOIN employee_field_history h ON h.order_id = o.cancels_order_id
            WHERE o.created_at > ${at}::timestamptz AND o.created_at <= ${knownAt}::timestamptz
          UNION SELECT a.employee_id FROM administrative_orders o JOIN employee_pay_assignments a ON a.order_id = o.cancels_order_id
            WHERE o.created_at > ${at}::timestamptz AND o.created_at <= ${knownAt}::timestamptz
        ) x WHERE eid IS NOT NULL ORDER BY eid`)).map(r => Number(r.eid));
    }
    await diffsFor(tx, q, ids, { categoryId: period.categoryId, eligibleStatuses, knownAt, excludePeriodId: period.id }, out, skipped);
  }
  return { diffs: out, skipped, origins: origins.length };
}

/** دورة استثنائية (11.2): الفرق عن شهرها لموظفيها = إعادة احتسابه − كل ما صُرف عنه (العادية + الفروق + الاستثنائيات السابقة). */
export async function exceptionalDiffs(tx: any, period: any, eligibleStatuses: string[], knownAt: Date) {
  const out = new Map<number, RetroLine[]>(); const skipped = new Map<number, string>();
  const [origin] = rows(await tx.execute(sql`SELECT id, year, month, approved_at, current_run_id, pay_source FROM payroll_periods
    WHERE category_id = ${period.categoryId} AND kind = 'عادية' AND year = ${period.year} AND month = ${period.month} AND status IN ('معتمدة', 'مُصدَرة')`));
  if (!origin) return { diffs: out, skipped, origin: null };
  await diffsFor(tx, origin, (period.employeeIds || []).map(Number), { categoryId: period.categoryId, eligibleStatuses, knownAt, excludePeriodId: period.id }, out, skipped);
  return { diffs: out, skipped, origin };
}
