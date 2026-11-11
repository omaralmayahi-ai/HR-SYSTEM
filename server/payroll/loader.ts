// server/payroll/loader.ts — B8a2: يحمّل مدخلات فترة كاملة بقراءات جماعية «كما كانت معروفة» بلحظة knownAt،
// ثم يبني لكل موظف مدخلات المحرك. لا احتساب هنا.
import { sql } from 'drizzle-orm';
import { money, toDecimal, sum, minM, maxM, type Micro } from './money.ts';
import { monthBounds, normAr, addDays, computeEmployee, type EngineCtx, type EmployeeIn, type ItemIn } from './engine.ts';

export const ENGINE_FIELDS = ['grade', 'step', 'status', 'service_type', 'contract_type', 'education_level', 'marital_status', 'gender',
  'primary_responsibility', 'acting_responsibility', 'work_location', 'org_unit_id', 'free_transport', 'risk_exposure', 'family_mode', 'job_title'];

const rows = (r: any) => ((r as any).rows ?? r) as any[];
const isoOrNull = (v: any) => { const s = String(v ?? '').trim().slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

export interface LoadOpts { year: number; month: number; categoryId: number; eligibleStatuses: string[]; knownAt?: Date | string; employeeIds?: number[]; sequential?: boolean }

export async function loadPeriodInputs(db: any, o: LoadOpts) {
  const { start, end } = monthBounds(o.year, o.month);
  // داخل معاملة (عميل واحد) تُنفّذ القراءات بالتتابع؛ على المجمّع بالتوازي
  const runAll = async (qs: (() => Promise<any>)[]) => {
    if (!o.sequential) return Promise.all(qs.map(q => q()));
    const out: any[] = []; for (const q of qs) out.push(await q()); return out;
  };
  const knownAt = new Date(o.knownAt ?? Date.now()).toISOString();
  const idFilter = o.employeeIds && o.employeeIds.length ? sql.raw(`AND e.id = ANY(ARRAY[${o.employeeIds.map(Number).filter(Number.isInteger).join(',')}]::int[])`) : sql.raw('');
  const fieldsArr = sql.raw(`ARRAY[${ENGINE_FIELDS.map(f => `'${f}'`).join(',')}]::text[]`);

  const [rules, versions, scaleRows, items, itemVersions, deg, resp, locs, units, emps] = await runAll([
    () => db.execute(sql`SELECT service_type, contract_type, category_id FROM payroll_category_rules ORDER BY id`),
    () => db.execute(sql`SELECT id, effective_from::text ef FROM salary_scale_versions WHERE status = 'معتمد' AND coalesce(approved_at, '-infinity') <= ${knownAt}::timestamptz AND effective_from <= ${end}::date ORDER BY effective_from`),
    () => db.execute(sql`SELECT s.version_id, s.grade, s.step, s.amount FROM salary_scale s JOIN salary_scale_versions v ON v.id = s.version_id WHERE v.status = 'معتمد' AND coalesce(v.approved_at, '-infinity') <= ${knownAt}::timestamptz AND v.effective_from <= ${end}::date ORDER BY s.version_id, s.grade, s.step`),
    () => db.execute(sql`SELECT id, code, name, direction, classification, assignment_mode, method, category_id FROM pay_items WHERE category_id = ${o.categoryId} ORDER BY id`),
    () => db.execute(sql`SELECT v.id, v.item_id, v.valid_from::text vf, v.valid_to::text vt, v.props FROM pay_item_versions v JOIN pay_items i ON i.id = v.item_id
      WHERE i.category_id = ${o.categoryId} AND v.recorded_at <= ${knownAt}::timestamptz AND (v.superseded_at IS NULL OR v.superseded_at > ${knownAt}::timestamptz)
        AND v.valid_from <= ${end}::date AND (v.valid_to IS NULL OR v.valid_to >= ${start}::date) ORDER BY v.valid_from, v.id`),
    () => db.execute(sql`SELECT id, name FROM education_degrees ORDER BY id`),
    () => db.execute(sql`SELECT id, name FROM responsibility_allowances ORDER BY id`),
    () => db.execute(sql`SELECT id, name FROM work_locations ORDER BY id`),
    () => db.execute(sql`SELECT id, parent_id FROM org_units ORDER BY id`),
    () => db.execute(sql`SELECT e.id, e.full_name, e.company_number, e.department, e.section, e.job_title, e.current_appointment_date, e.first_appointment_date, e.appointment_date,
        ${sql.raw(ENGINE_FIELDS.map(f => `e.${f}`).join(', '))} FROM employees e WHERE e.created_at <= ${knownAt}::timestamptz ${idFilter} ORDER BY e.id`),
  ]);

  const amounts = new Map<number, Map<string, Micro>>();
  for (const r of rows(scaleRows)) {
    const vid = Number(r.version_id);
    if (!amounts.has(vid)) amounts.set(vid, new Map());
    amounts.get(vid)!.set(`${r.grade}-${r.step}`, money(r.amount));
  }
  const itemList: ItemIn[] = rows(items).map(i => ({
    id: Number(i.id), code: i.code, name: i.name, direction: i.direction, classification: i.classification, assignmentMode: i.assignment_mode,
    method: i.method, categoryId: Number(i.category_id),
    versions: rows(itemVersions).filter(v => Number(v.item_id) === Number(i.id)).map(v => ({ id: Number(v.id), validFrom: v.vf, validTo: v.vt, props: v.props })),
  }));
  const lookup = (rs: any) => new Map<string, number>(rows(rs).map(r => [normAr(r.name), Number(r.id)]));
  const ctx: EngineCtx = {
    year: o.year, month: o.month, categoryId: o.categoryId,
    scale: { versions: rows(versions).map(v => ({ id: Number(v.id), effectiveFrom: v.ef })), amounts },
    items: itemList,
    lookups: { education_degrees: lookup(deg), responsibility_allowances: lookup(resp), work_locations: lookup(locs) },
    orgParents: new Map(rows(units).map(u => [Number(u.id), u.parent_id === null ? null : Number(u.parent_id)])),
    eligibleStatuses: new Set(o.eligibleStatuses.map(s => String(s).trim())),
    categoryRules: rows(rules).map(r => ({ serviceType: r.service_type, contractType: r.contract_type, categoryId: Number(r.category_id) })),
  };

  const empRows = rows(emps);
  const ids = empRows.map(e => Number(e.id));
  const idArr = sql.raw(`ARRAY[${ids.join(',') || 0}]::int[]`);
  const [hist, assigns, members, facts, exts] = await runAll([
    () => db.execute(sql`
      WITH known AS (
        SELECT h.id, h.employee_id, h.field, h.value, h.valid_from, h.recorded_at, h.order_id, h.supersedes_id, h.source FROM employee_field_history h
        WHERE h.employee_id = ANY(${idArr}) AND h.field = ANY(${fieldsArr})
          AND (h.recorded_at <= ${knownAt}::timestamptz OR h.source = 'تقديري'))
      SELECT k.employee_id, k.field, k.value, k.valid_from::text vf FROM known k
      WHERE (k.valid_from IS NULL OR k.valid_from <= ${end}::date)
        AND NOT EXISTS (SELECT 1 FROM known c WHERE c.supersedes_id = k.id)
        AND NOT EXISTS (SELECT 1 FROM administrative_orders o WHERE o.cancels_order_id = k.order_id AND o.created_at <= ${knownAt}::timestamptz)
      ORDER BY k.employee_id, k.field, k.valid_from NULLS FIRST, k.recorded_at, k.id`),
    () => db.execute(sql`SELECT a.id, a.employee_id, a.item_id, a.kind, a.value_kind, a.value::text AS value, a.valid_from::text vf, a.valid_to::text vt,
        a.principal::text principal, a.installment::text installment, a.installments_count
      FROM employee_pay_assignments a WHERE a.employee_id = ANY(${idArr})
        AND a.recorded_at <= ${knownAt}::timestamptz AND (a.superseded_at IS NULL OR a.superseded_at > ${knownAt}::timestamptz)
        AND a.valid_from <= ${end}::date AND (a.valid_to IS NULL OR a.valid_to >= ${start}::date) ORDER BY a.employee_id, a.valid_from, a.id`),
    () => db.execute(sql`SELECT id, employee_id, relation, name, birth_date::text bd FROM family_members WHERE employee_id = ANY(${idArr}) AND created_at <= ${knownAt}::timestamptz ORDER BY employee_id, id`),
    () => db.execute(sql`
      WITH known AS (SELECT f.* FROM family_member_facts f JOIN family_members m ON m.id = f.member_id
        WHERE m.employee_id = ANY(${idArr}) AND (f.recorded_at <= ${knownAt}::timestamptz OR f.source = 'ترحيل قديم'))
      SELECT k.member_id, k.fact, k.value, k.valid_from::text vf FROM known k WHERE NOT EXISTS (SELECT 1 FROM known c WHERE c.supersedes_id = k.id)
        AND NOT EXISTS (SELECT 1 FROM administrative_orders o WHERE o.cancels_order_id = k.order_id AND o.created_at <= ${knownAt}::timestamptz)
      ORDER BY k.member_id, k.fact, k.valid_from NULLS FIRST, k.recorded_at, k.id`),
    () => db.execute(sql`SELECT x.member_id, x.valid_from::text vf, x.valid_to::text vt FROM family_extensions x JOIN family_members m ON m.id = x.member_id
      WHERE m.employee_id = ANY(${idArr}) AND x.recorded_at <= ${knownAt}::timestamptz ORDER BY x.member_id, x.valid_from, x.id`),
  ]);

  const tl = new Map<number, Record<string, { from: string | null; value: any }[]>>();
  for (const h of rows(hist)) {
    const id = Number(h.employee_id);
    if (!tl.has(id)) tl.set(id, {});
    (tl.get(id)![h.field] ||= []).push({ from: h.vf, value: h.value });
  }
  const byEmp = <T,>(rs: any[], key: string, map: (r: any) => T) => {
    const m = new Map<number, T[]>();
    for (const r of rs) { const id = Number(r[key]); if (!m.has(id)) m.set(id, []); m.get(id)!.push(map(r)); }
    return m;
  };
  const asg = byEmp(rows(assigns), 'employee_id', a => ({ id: Number(a.id), itemId: Number(a.item_id), kind: a.kind, valueKind: a.value_kind, value: a.value, validFrom: a.vf, validTo: a.vt, principal: a.principal, installment: a.installment, installmentsCount: a.installments_count }));
  const mem = byEmp(rows(members), 'employee_id', m => ({ id: Number(m.id), relation: m.relation, name: m.name, birthDate: m.bd }));
  const memberEmp = new Map(rows(members).map(m => [Number(m.id), Number(m.employee_id)]));
  const fct = new Map<number, any[]>(); for (const f of rows(facts)) { const e = memberEmp.get(Number(f.member_id)); if (e === undefined) continue; (fct.get(e) || fct.set(e, []).get(e)!).push({ memberId: Number(f.member_id), fact: f.fact, value: f.value, validFrom: f.vf }); }
  const ext = new Map<number, any[]>(); for (const x of rows(exts)) { const e = memberEmp.get(Number(x.member_id)); if (e === undefined) continue; (ext.get(e) || ext.set(e, []).get(e)!).push({ memberId: Number(x.member_id), validFrom: x.vf, validTo: x.vt }); }

  const employees: (EmployeeIn & { snapshot: any })[] = empRows.map(e => {
    const id = Number(e.id);
    const timeline = { ...(tl.get(id) || {}) };
    for (const f of ENGINE_FIELDS) if (!timeline[f]) timeline[f] = [{ from: null, value: e[f] ?? null }];
    return {
      id, name: e.full_name, companyNumber: e.company_number, timeline,
      serviceStart: isoOrNull(e.current_appointment_date) || isoOrNull(e.first_appointment_date) || isoOrNull(e.appointment_date),
      assignments: asg.get(id) || [],
      family: { members: mem.get(id) || [], facts: fct.get(id) || [], extensions: ext.get(id) || [] },
      snapshot: { full_name: e.full_name, company_number: e.company_number, department: e.department, section: e.section, job_title: e.job_title, grade: e.grade, step: e.step },
    };
  });
  return { ctx, employees, knownAt, bounds: { start, end } };
}

/** احتساب فترة كاملة بالذاكرة. */
export async function computePeriod(db: any, o: LoadOpts) {
  const t0 = Date.now();
  const { ctx, employees, knownAt, bounds } = await loadPeriodInputs(db, o);
  const t1 = Date.now();
  const results = employees.map(e => ({ ...computeEmployee(e, ctx), snapshot: e.snapshot }));
  return { ctx, results, knownAt, bounds, timing: { loadMs: t1 - t0, computeMs: Date.now() - t1 } };
}

/** تحويل نتيجة موظف للـ JSON (المبالغ نصوص عشرية بست منازل). */
export function serializeResult(r: any) {
  const d = (m: any) => (typeof m === 'bigint' ? toDecimal(m) : m);
  return {
    employee_id: r.employeeId, computed: r.computed, issues: r.issues, flags: r.flags, snapshot: r.snapshot,
    nominal: d(r.nominal), allowances: d(r.allowances), deductions: d(r.deductions), net_exact: d(r.netExact), net: d(r.net), negative: d(r.negative),
    lines: r.lines.map((l: any) => ({ ...l, amount: d(l.amount), base: l.base === null ? null : d(l.base) })),
  };
}

/** معاينة أثر نسخة مقترحة لبند على شهر نفاذها: المشمولون، المجموع، الأعلى والأدنى، قبل وبعد. */
export async function previewItemVersion(db: any, o: LoadOpts & { itemId: number; props: any; validFrom: string; validTo?: string | null }) {
  const { ctx, employees } = await loadPeriodInputs(db, o);
  const item = ctx.items.find(i => i.id === o.itemId);
  if (!item) throw new Error('البند مو من هذه الفئة');
  const amountOf = (res: any) => sum(res.lines.filter((l: any) => l.itemId === o.itemId).map((l: any) => l.amount));
  const before = employees.map(e => amountOf(computeEmployee(e, ctx)));
  const saved = item.versions;
  item.versions = withProposedVersion(saved, o.validFrom, o.validTo ?? null, o.props);
  const after = employees.map(e => amountOf(computeEmployee(e, ctx)));
  item.versions = saved;
  const stats = (xs: Micro[]) => {
    const nz = xs.filter(x => x !== 0n);
    return { beneficiaries: nz.length, total: toDecimal(sum(nz)), max: nz.length ? toDecimal(nz.reduce(maxM)) : null, min: nz.length ? toDecimal(nz.reduce(minM)) : null };
  };
  const changed = employees.map((e, i) => ({ id: e.id, name: e.name, before: toDecimal(before[i]), after: toDecimal(after[i]), diff: after[i] - before[i] }))
    .filter(x => x.diff !== 0n).sort((a, b) => (b.diff > a.diff ? 1 : -1)).slice(0, 200).map(x => ({ ...x, diff: toDecimal(x.diff) }));
  return { month: `${o.year}-${String(o.month).padStart(2, '0')}`, before: stats(before), after: stats(after), changed };
}

/** مثل supersedeAndInsert بالذاكرة: النسخ المتداخلة تُقص لليوم السابق وتبقى أطرافها بعد نهاية المقترحة. */
export function withProposedVersion(saved: { id: number; validFrom: string; validTo: string | null; props: any }[], from: string, to: string | null, props: any) {
  const kept: any[] = [];
  for (const v of saved) {
    const overlaps = v.validFrom <= (to ?? '9999-12-31') && (v.validTo === null || v.validTo >= from);
    if (!overlaps) { kept.push(v); continue; }
    if (v.validFrom < from) kept.push({ ...v, validTo: addDays(from, -1) });
    if (to !== null && (v.validTo === null || v.validTo > to)) kept.push({ ...v, validFrom: addDays(to, 1) });
  }
  return [{ id: -1, validFrom: from, validTo: to, props: { ...props, status: 'فعّال' } }, ...kept];
}
