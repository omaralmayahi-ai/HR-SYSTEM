// server/payroll/engine.ts — B8a2: محرك الرواتب (دالة نقية، مسار احتساب واحد — مب5).
// الشهر يُقسَّم إلى مقاطع عند أي تغيّر بالمدخلات؛ كل مقطع يُحتسب كأن الشهر كله على حاله ثم يُضرب
// بنصيبه (أيامه ÷ أيام الشهر الفعلية، ق-12). سقف 200% لكل مقطع على الاسمي الكامل وبترتيب المدير (ق-6).
// السطور بدقة 6 منازل؛ استقطاعات الجهات تُقرَّب لكل سطر، والصافي يُقرَّب (ق-18 + قرار التقريب).
import { money, rate, applyRate, mulDiv, roundDinar, toDecimal, sum, minM, maxM, type Micro, RATE_SCALE } from './money.ts';

// ---------- أنواع المدخلات ----------
export type TimelineEntry = { from: string | null; value: any };
export interface ItemVersionIn { id: number; validFrom: string; validTo: string | null; props: any }
export interface ItemIn { id: number; code: string; name: string; direction: '+' | '-'; classification: string; assignmentMode: string; method: string; categoryId: number; versions: ItemVersionIn[] }
export interface AssignmentIn { id: number; itemId: number; kind: string; valueKind: string | null; value: string | null; validFrom: string; validTo: string | null; principal?: string | null; installment?: string | null; installmentsCount?: number | null }
export interface FamilyIn {
  members: { id: number; relation: string; name?: string | null; birthDate: string | null }[];
  facts: { memberId: number; fact: string; value: any; validFrom: string | null }[];
  extensions: { memberId: number; validFrom: string; validTo: string }[];
}
export interface EmployeeIn {
  id: number; name?: string; companyNumber?: string | null;
  timeline: Record<string, TimelineEntry[]>; // لكل حقل: القيم بتواريخ نفاذها (from=null: منذ البداية)
  serviceStart: string | null;               // المباشرة
  assignments: AssignmentIn[];
  family: FamilyIn;
}
export interface EngineCtx {
  year: number; month: number; categoryId: number;
  scale: { versions: { id: number; effectiveFrom: string }[]; amounts: Map<number, Map<string, Micro>> };
  items: ItemIn[];
  lookups: Record<string, Map<string, number>>;  // مصدر المستويات ← (اسم مطبّع ← معرّف)
  orgParents: Map<number, number | null>;
  eligibleStatuses: Set<string>;
  categoryRules: { serviceType: string; contractType: string | null; categoryId: number }[];
}

// ---------- أنواع المخرجات ----------
export interface Line {
  itemId: number | null; itemCode: string; itemName: string; direction: '+' | '-' | '=';
  kind: 'nominal' | 'item' | 'cap' | 'deduction';
  segmentFrom: string; segmentTo: string; share: string; // share = أيام/أيام الشهر نصاً
  amount: Micro; base: Micro | null; rate: string | null;
  itemVersionId: number | null; scaleVersionId: number | null; assignmentId: number | null;
  explain: Record<string, any>;
}
export interface Issue { code: string; message: string; itemCode?: string; date?: string }
export interface EmployeeResult {
  employeeId: number; computed: boolean;
  lines: Line[]; issues: Issue[];
  nominal: Micro; allowances: Micro; deductions: Micro; netExact: Micro; net: Micro; negative: Micro;
  flags: Record<string, any>;
}

// ---------- أدوات التاريخ ----------
const pad = (n: number) => String(n).padStart(2, '0');
export const monthBounds = (y: number, m: number) => {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(days)}`, days };
};
export const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const addYears = (d: string, n: number) => { const [y, m, dd] = d.split('-').map(Number); const t = new Date(Date.UTC(y + n, m - 1, dd)); if (t.getUTCMonth() !== m - 1) t.setUTCDate(0); return t.toISOString().slice(0, 10); };
const covers = (from: string | null, to: string | null, day: string) => (from === null || from <= day) && (to === null || to >= day);
export const normAr = (v: any) => String(v ?? '').trim().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

const MISSING = new Set(['', 'سيتم تسجيله لاحقاً', 'سيتم تسجيله لاحقا', 'غير محدد']);
const isMissing = (v: any) => v === null || v === undefined || (typeof v === 'string' && MISSING.has(v.trim()));

export function valueAt(tl: TimelineEntry[] | undefined, day: string): any {
  if (!tl || tl.length === 0) return null;
  let v: any = null;
  for (const e of tl) if (e.from === null || e.from <= day) v = e.value; // مرتبة تصاعدياً (null أولاً)
  return v;
}

// ---------- الشروط ----------
class EvalError extends Error {}
function cmp(a: any, b: any) { const x = Number(a), y = Number(b); return Number.isFinite(x) && Number.isFinite(y) ? x - y : String(a).localeCompare(String(b)); }
function evalCond(c: any, get: (f: string) => any, ctx: EngineCtx): boolean {
  const v = get(c.field);
  const list = (x: any) => (Array.isArray(x) ? x : [x]).map(String).map(normAr);
  switch (c.op) {
    case 'فارغ': return isMissing(v);
    case 'غير فارغ': return !isMissing(v);
  }
  if (isMissing(v)) throw new EvalError(`الحقل «${c.field}» فارغ`);
  switch (c.op) {
    case 'يساوي': return typeof c.value === 'boolean' ? (v === true) === c.value : normAr(v) === normAr(c.value);
    case 'لا يساوي': return typeof c.value === 'boolean' ? (v === true) !== c.value : normAr(v) !== normAr(c.value);
    case 'ضمن': return list(c.value).includes(normAr(v));
    case 'ليس ضمن': return !list(c.value).includes(normAr(v));
    case '>=': return cmp(v, c.value) >= 0;
    case '<=': return cmp(v, c.value) <= 0;
    case 'بين': { const [a, b] = Array.isArray(c.value) ? c.value : []; return cmp(v, a) >= 0 && cmp(v, b) <= 0; }
    case 'ضمن الوحدة وما تحتها': {
      const target = Number(c.value); let u: number | null = Number(v); let guard = 0;
      while (u !== null && u !== undefined && Number.isFinite(u) && guard++ < 50) { if (u === target) return true; u = ctx.orgParents.get(u) ?? null; }
      return false;
    }
  }
  throw new EvalError(`عامل غير معروف: ${c.op}`);
}
function conditionsMatch(conds: any, get: (f: string) => any, ctx: EngineCtx): { ok: boolean; group: number | null } {
  if (!Array.isArray(conds) || conds.length === 0) return { ok: true, group: null };
  for (let i = 0; i < conds.length; i++) if (conds[i].every((c: any) => evalCond(c, get, ctx))) return { ok: true, group: i };
  return { ok: false, group: null };
}

// ---------- العائلة ----------
function factAt(fam: FamilyIn, memberId: number, fact: string, day: string): boolean | null {
  let v: any = null; let best: string | null | undefined;
  for (const f of fam.facts) {
    if (f.memberId !== memberId || f.fact !== fact) continue;
    if (f.validFrom !== null && f.validFrom > day) continue;
    if (best === undefined || (f.validFrom ?? '') >= (best ?? '')) { best = f.validFrom; v = f.value; }
  }
  return v === null ? null : v === true || v === 'true';
}
function familyAmount(props: any, mode: any, fam: FamilyIn, day: string, issues: Issue[]) {
  const f = props.family || {};
  const spouse = money(f.spouse_amount), child = money(f.child_amount);
  const maxChildren = Number(f.max_children), sonAge = Number(f.son_age), studentAge = Number(f.son_student_age);
  if (isMissing(mode)) { issues.push({ code: 'FAMILY_MODE_MISSING', message: 'نمط الاستحقاق العائلي لم يُحدد', itemCode: 'FAMILY' }); return null; }
  if (mode === 'لا يستحق' || mode === 'محجوب') return { amount: 0n, detail: { mode } };
  let eligible = 0; const children: any[] = [];
  for (const m of fam.members) {
    if (!['ابن', 'بنت', 'طفل'].includes(m.relation)) continue;
    if (!m.birthDate) { issues.push({ code: 'CHILD_NO_BIRTHDATE', message: `طفل بلا تاريخ ميلاد: ${m.name || m.id}`, itemCode: 'FAMILY' }); continue; }
    if (m.birthDate > day || factAt(fam, m.id, 'متوفى', day) === true) continue;
    const under = (age: number) => day < addYears(m.birthDate!, age);
    const ext = fam.extensions.some(x => x.memberId === m.id && covers(x.validFrom, x.validTo, day));
    let ok = false, why = '';
    if (under(sonAge)) { ok = true; why = `دون ${sonAge}`; }
    else if (m.relation === 'بنت') {
      const married = factAt(fam, m.id, 'متزوج', day), employed = factAt(fam, m.id, 'موظف', day);
      if (married === null || employed === null) issues.push({ code: 'DAUGHTER_FACTS_MISSING', message: `بنت بالغة بلا حقيقتي الزواج والتوظيف: ${m.name || m.id}`, itemCode: 'FAMILY' });
      ok = married === false && employed === false; why = 'بنت غير متزوجة وغير موظفة';
    } else if (m.relation === 'ابن') {
      ok = under(studentAge) && (factAt(fam, m.id, 'يدرس', day) === true || ext); why = 'ابن طالب';
    } else {
      issues.push({ code: 'CHILD_GENDER_MISSING', message: `طفل بالغ جنسه غير مسجل: ${m.name || m.id}`, itemCode: 'FAMILY' });
    }
    if (!ok && ext) { ok = true; why = 'تمديد بأمر'; }
    if (ok) { eligible++; children.push({ id: m.id, why }); }
  }
  const counted = Math.min(eligible, Number.isFinite(maxChildren) ? maxChildren : eligible);
  const amount = (mode === 'كامل' ? spouse : 0n) + child * BigInt(counted);
  return { amount, detail: { mode, spouse: mode === 'كامل' ? toDecimal(spouse) : '0', eligible_children: eligible, counted_children: counted, children } };
}

// ---------- الاحتساب ----------
function categoryOf(ctx: EngineCtx, serviceType: any, contractType: any): number | null {
  const st = normAr(serviceType), ct = normAr(contractType);
  const exact = ctx.categoryRules.find(r => normAr(r.serviceType) === st && r.contractType !== null && normAr(r.contractType) === ct);
  if (exact) return exact.categoryId;
  return ctx.categoryRules.find(r => normAr(r.serviceType) === st && r.contractType === null)?.categoryId ?? null;
}
const liveVersion = (item: ItemIn, day: string) => item.versions.find(v => covers(v.validFrom, v.validTo, day)) || null;
const scaleVersionAt = (ctx: EngineCtx, day: string) => {
  let v: { id: number; effectiveFrom: string } | null = null;
  for (const s of ctx.scale.versions) if (s.effectiveFrom <= day && (!v || s.effectiveFrom > v.effectiveFrom)) v = s;
  return v;
};

export function computeEmployee(emp: EmployeeIn, ctx: EngineCtx): EmployeeResult {
  const { start, end, days } = monthBounds(ctx.year, ctx.month);
  const issues: Issue[] = []; const lines: Line[] = [];
  const result = (computed: boolean, flags: any = {}): EmployeeResult => {
    const nominal = sum(lines.filter(l => l.kind === 'nominal').map(l => l.amount));
    const allowances = sum(lines.filter(l => l.direction === '+' && l.kind !== 'nominal').map(l => l.amount));
    const deductions = sum(lines.filter(l => l.direction === '-').map(l => l.amount));
    const netExact = nominal + allowances - deductions;
    const rounded = roundDinar(netExact);
    return { employeeId: emp.id, computed, lines, issues, nominal, allowances, deductions, netExact, net: rounded < 0n ? 0n : rounded, negative: rounded < 0n ? -rounded : 0n, flags: { ...flags, negative: rounded < 0n } };
  };

  // نقاط القطع
  const cuts = new Set<string>([start]);
  const addCut = (d: string | null | undefined) => { if (d && d > start && d <= end) cuts.add(d); };
  for (const tl of Object.values(emp.timeline)) for (const e of tl) addCut(e.from);
  for (const it of ctx.items) for (const v of it.versions) { addCut(v.validFrom); if (v.validTo) addCut(addDays(v.validTo, 1)); }
  for (const a of emp.assignments) { addCut(a.validFrom); if (a.validTo) addCut(addDays(a.validTo, 1)); }
  for (const s of ctx.scale.versions) addCut(s.effectiveFrom);
  for (const f of emp.family.facts) addCut(f.validFrom);
  for (const x of emp.family.extensions) { addCut(x.validFrom); addCut(addDays(x.validTo, 1)); }
  // أعمار الحدود من إعدادات البند العائلي النافذة (لا أرقام ثابتة)
  const ages = new Set<number>([18, 24]);
  for (const it of ctx.items) if (it.method === 'family') for (const v of it.versions) for (const k of ['son_age', 'son_student_age']) {
    const a = Number(v.props?.family?.[k]); if (Number.isInteger(a) && a > 0) ages.add(a);
  }
  for (const m of emp.family.members) if (m.birthDate) for (const age of ages) addCut(addYears(m.birthDate, age));
  addCut(emp.serviceStart);
  const points = [...cuts].sort();
  const segments = points.map((from, i) => ({ from, to: i + 1 < points.length ? addDays(points[i + 1], -1) : end }));

  let any = false; const flags: any = { segments: 0, cap_reached: false, general_withheld: [] as string[] };
  for (const seg of segments) {
    const d = seg.from; const segDays = dayDiff(seg.from, seg.to) + 1;
    const get = (f: string) => valueAt(emp.timeline[f], d);
    // خارج الخدمة أو حالة غير مشمولة بالصرف أو فئة أخرى ⇒ المقطع بلا راتب بهذه الفترة
    if (emp.serviceStart && d < emp.serviceStart) continue;
    const status = String(get('status') ?? '').trim();
    if (!ctx.eligibleStatuses.has(status)) continue;
    if (categoryOf(ctx, get('service_type'), get('contract_type')) !== ctx.categoryId) continue;

    const grade = Number(get('grade')), step = Number(get('step'));
    const sv = scaleVersionAt(ctx, d);
    if (!Number.isInteger(grade) || !Number.isInteger(step) || isMissing(get('grade')) || isMissing(get('step'))) {
      issues.push({ code: 'NO_GRADE', message: 'موظف بلا درجة أو مرحلة: ما يُحتسب له راتب', date: d }); return result(false);
    }
    const nominalFull = sv ? ctx.scale.amounts.get(sv.id)?.get(`${grade}-${step}`) : undefined;
    if (!sv || nominalFull === undefined) {
      issues.push({ code: 'NO_SCALE', message: `ماكو مبلغ بالسلّم النافذ للدرجة ${grade} المرحلة ${step}`, date: d }); return result(false);
    }
    any = true; flags.segments++;
    if (grade >= 11) flags.unverified_grade = true;
    const share = (full: Micro) => mulDiv(full, BigInt(segDays), BigInt(days));
    const shareText = `${segDays}/${days}`;
    const segLines: { item: ItemIn | null; v: ItemVersionIn | null; full: Micro; base: Micro | null; r: bigint | null; a: AssignmentIn | null; explain: any }[] = [];
    const amountsByCode = new Map<string, Micro>([['NOMINAL', nominalFull]]);
    const baseOf = (codes: string[] | undefined) => sum((codes && codes.length ? codes : ['NOMINAL']).map(c => amountsByCode.get(c) ?? 0n));

    // البنود الفعّالة بهذه الفئة، بترتيب الاحتساب (المخصصات ثم الاستقطاعات غير القانونية)
    const active = ctx.items
      .map(it => ({ it, v: liveVersion(it, d) }))
      .filter(x => x.v && x.v.props?.status === 'فعّال' && x.it.categoryId === ctx.categoryId && x.it.code !== 'RETIRE')
      .sort((a, b) => (Number(a.v!.props.calc_order ?? 999) - Number(b.v!.props.calc_order ?? 999)) || a.it.id - b.it.id);

    for (const { it, v } of active) {
      const p = v!.props;
      if (['brackets', 'hours', 'installments'].includes(it.method)) continue; // B8b/B8c
      const assigns = emp.assignments.filter(a => a.itemId === it.id && covers(a.validFrom, a.validTo, d));
      // الحجب يتقدم على أي إسناد آخر بنفس اليوم (الأقساط قد تتعدد معه)
      const single = assigns.find(a => a.kind === 'حجب') || assigns[0] || null;
      const explain: any = { method: it.method, legal_basis: p.legal_basis, version_id: v!.id };
      let full: Micro | null = null; let base: Micro | null = null; let r: bigint | null = null;

      if (single && single.kind === 'حجب') {
        full = 0n; explain.withheld = { assignment_id: single.id };
        if (it.classification === 'عام') flags.general_withheld.push(it.code);
        segLines.push({ item: it, v, full, base, r, a: single, explain }); amountsByCode.set(it.code, 0n); continue;
      }
      if (it.assignmentMode === 'بأمر' && assigns.length === 0) continue;
      if (it.assignmentMode === 'تلقائي' && !(single && p.individual_override)) {
        try {
          const m = conditionsMatch(p.conditions, get, ctx);
          if (!m.ok) continue;
          explain.condition_group = m.group;
        } catch (e: any) {
          issues.push({ code: 'EVAL_FAILED', message: `تعذّر تقييم شرط ${it.name}: ${e.message}`, itemCode: it.code, date: d });
          continue; // خطأ التقييم ما يمنح البند (أ8)
        }
      }
      // الإسناد الفردي على بند تلقائي يسري فقط إذا النسخة النافذة تسمح بالتعديل الفردي
      const overrideAllowed = it.assignmentMode !== 'تلقائي' || !!p.individual_override;
      if (single && !overrideAllowed && single.kind !== 'حجب') issues.push({ code: 'OVERRIDE_IGNORED', message: `${it.name}: إسناد فردي ونسخة البند النافذة ما تسمح بالتعديل الفردي؛ طُبّقت القاعدة`, itemCode: it.code, date: d });
      const useAssign = overrideAllowed && single && single.value !== null && single.value !== undefined ? single : null;
      const kind = useAssign?.valueKind ?? p.value_kind;
      // قيمة الإسناد مبلغ صريح ⇒ مبلغ ثابت مهما كانت طريقة البند
      const assignIsAmount = !!useAssign && it.method !== 'manual' && it.method !== 'family' && (useAssign.valueKind ?? (it.method === 'percent' ? 'نسبة' : p.value_kind)) === 'مبلغ';
      if (it.method === 'family') {
        const fa = familyAmount(p, get('family_mode'), emp.family, d, issues);
        if (!fa) continue;
        full = useAssign ? money(useAssign.value) : fa.amount; explain.family = fa.detail;
      } else if (assignIsAmount) {
        full = money(useAssign!.value);
      } else if (it.method === 'tiered' && !useAssign) {
        const src = p.level_source; const fieldName = src === 'education_degrees' ? 'education_level' : src === 'responsibility_allowances' ? (p.level_field || 'primary_responsibility') : 'work_location';
        const raw = get(fieldName);
        if (isMissing(raw)) { issues.push({ code: 'NO_LEVEL', message: `${it.name}: الحقل فارغ`, itemCode: it.code, date: d }); continue; }
        const refId = ctx.lookups[src]?.get(normAr(raw));
        const level = (p.levels || []).find((l: any) => Number(l.ref_id) === refId && l.value !== null && l.value !== undefined);
        if (!level) {
          if (!(src === 'responsibility_allowances' && /^بلا /.test(normAr(raw)))) issues.push({ code: 'NO_LEVEL', message: `${it.name}: «${raw}» بلا مستوى`, itemCode: it.code, date: d });
          continue;
        }
        explain.level = level.label;
        if (p.value_kind === 'مبلغ') full = money(level.value);
        else { base = baseOf(p.base); r = rate(level.value); full = applyRate(base, r); }
      } else if (it.method === 'percent' || (it.method === 'tiered' && useAssign) || (kind === 'نسبة')) {
        const rv = useAssign ? useAssign.value : p.value;
        if (rv === null || rv === undefined) continue;
        r = rate(rv);
        if (p.caps?.max_rate !== undefined && p.caps.max_rate !== null) r = minM(r, rate(p.caps.max_rate));
        if (p.caps?.min_rate !== undefined && p.caps.min_rate !== null && useAssign) r = maxM(r, rate(p.caps.min_rate));
        base = baseOf(p.base); full = applyRate(base, r);
      } else if (it.method === 'flat' || it.method === 'manual') {
        const values = (it.method === 'manual' ? assigns : [useAssign]).filter(Boolean) as AssignmentIn[];
        const total = values.length ? sum(values.map(a => money(a.value))) : (p.value !== null && p.value !== undefined ? money(p.value) : null);
        if (total === null) continue;
        full = total; if (it.method === 'manual') explain.assignments = values.map(a => a.id);
      }
      if (full === null) continue;
      if (p.caps?.max_amount !== undefined && p.caps.max_amount !== null) full = minM(full, money(p.caps.max_amount));
      if (p.caps?.min_amount !== undefined && p.caps.min_amount !== null && full > 0n) full = maxM(full, money(p.caps.min_amount));
      if (useAssign) explain.assignment = { id: useAssign.id, kind: useAssign.kind };
      segLines.push({ item: it, v, full, base, r, a: useAssign || (it.method === 'manual' ? null : single), explain });
      amountsByCode.set(it.code, full);
    }

    // سقف 200% (ت9): مجموع المخصصات داخل السقف ≤ ضعفي الاسمي الكامل؛ التخفيض بأولوية المدير (ق-6)
    const capLimit = nominalFull * 2n;
    const inCap = segLines.filter(l => l.item!.direction === '+' && l.v!.props.inside_200_cap);
    let excess = sum(inCap.map(l => l.full)) - capLimit;
    const capLines: { item: ItemIn; v: ItemVersionIn; cut: Micro }[] = [];
    for (const l of inCap) if (l.v!.props.cap_reduction_priority === undefined || l.v!.props.cap_reduction_priority === null)
      issues.push({ code: 'NO_CAP_PRIORITY', message: `${l.item!.name}: داخل السقف بلا أولوية تخفيض؛ يُخفَّض أخيراً`, itemCode: l.item!.code, date: d });
    if (excess > 0n) {
      flags.cap_reached = true;
      const order = [...inCap].sort((a, b) => Number(a.v!.props.cap_reduction_priority ?? 9999) - Number(b.v!.props.cap_reduction_priority ?? 9999));
      for (const l of order) {
        if (excess <= 0n) break;
        const cut = minM(l.full, excess); excess -= cut;
        if (cut > 0n) capLines.push({ item: l.item!, v: l.v!, cut });
      }
    }

    // سطور المقطع × النصيب
    lines.push({ itemId: null, itemCode: 'NOMINAL', itemName: 'الراتب الاسمي', direction: '+', kind: 'nominal', segmentFrom: seg.from, segmentTo: seg.to, share: shareText,
      amount: share(nominalFull), base: null, rate: null, itemVersionId: null, scaleVersionId: sv.id, assignmentId: null,
      explain: { grade, step, full: toDecimal(nominalFull), scale_version: sv.id } });
    for (const l of segLines) {
      lines.push({ itemId: l.item!.id, itemCode: l.item!.code, itemName: l.item!.name, direction: l.item!.direction, kind: l.item!.direction === '-' ? 'deduction' : 'item',
        segmentFrom: seg.from, segmentTo: seg.to, share: shareText, amount: share(l.full), base: l.base, rate: l.r !== null ? (Number(l.r) / Number(RATE_SCALE)).toString() : null,
        itemVersionId: l.v!.id, scaleVersionId: sv.id, assignmentId: l.a?.id ?? null, explain: { ...l.explain, full: toDecimal(l.full) } });
    }
    for (const c of capLines) {
      lines.push({ itemId: c.item.id, itemCode: c.item.code, itemName: `تخفيض ${c.item.name} بسبب سقف 200%`, direction: '+', kind: 'cap',
        segmentFrom: seg.from, segmentTo: seg.to, share: shareText, amount: -share(c.cut), base: capLimit, rate: null,
        itemVersionId: c.v.id, scaleVersionId: sv.id, assignmentId: null, explain: { cap: toDecimal(capLimit), cut_full: toDecimal(c.cut), priority: c.v.props.cap_reduction_priority ?? null } });
    }
  }
  if (!any) { issues.push({ code: 'NOT_IN_PERIOD', message: 'ما عنده أيام مشمولة بالصرف بهذه الفترة والفئة' }); return result(false); }

  // التوقيفات التقاعدية على مستوى الشهر: الوعاء = الاسمي المستحق + السطور الموسومة in_retirement_base
  // لكل مقطع: وعاؤه ونسبته وحجبه بتاريخه، ثم يُجمع ويُقرَّب مرة واحدة (سطر شهري)
  const retire = ctx.items.find(i => i.code === 'RETIRE' && i.categoryId === ctx.categoryId);
  if (retire) {
    const segFroms = [...new Set(lines.filter(l => l.kind === 'nominal').map(l => l.segmentFrom))];
    let amt = 0n, base = 0n, lastV: ItemVersionIn | null = null, anyActive = false, withheldDays = false;
    const parts: any[] = [];
    for (const sf of segFroms) {
      const rv = liveVersion(retire, sf);
      if (!rv || rv.props?.status !== 'فعّال') continue;
      anyActive = true; lastV = rv;
      const flagged = new Set(ctx.items.filter(i => liveVersion(i, sf)?.props?.in_retirement_base).map(i => i.code));
      const b = sum(lines.filter(l => l.segmentFrom === sf && (l.kind === 'nominal' || (l.direction === '+' && flagged.has(l.itemCode)))).map(l => l.amount));
      const w = emp.assignments.some(a => a.itemId === retire.id && a.kind === 'حجب' && covers(a.validFrom, a.validTo, sf));
      const a = w ? 0n : applyRate(b, rate(rv.props.value));
      if (w) withheldDays = true;
      base += b; amt += a; parts.push({ from: sf, base: toDecimal(b), rate: String(rv.props.value), withheld: w });
    }
    if (anyActive && lastV) {
      if (lastV.props.round_line) amt = roundDinar(amt);
      if (withheldDays) flags.general_withheld.push('RETIRE');
      lines.push({ itemId: retire.id, itemCode: 'RETIRE', itemName: retire.name, direction: '-', kind: 'deduction', segmentFrom: start, segmentTo: end, share: 'شهري',
        amount: amt, base, rate: parts.length === 1 ? parts[0].rate : null, itemVersionId: lastV.id, scaleVersionId: null, assignmentId: null,
        explain: { legal_basis: lastV.props.legal_basis, base: toDecimal(base), withheld: withheldDays, rounded: !!lastV.props.round_line, segments: parts } });
    }
  }

  // تقريب استقطاعات الجهات لكل سطر (مجمّعة لكل بند بالشهر)
  const byItem = new Map<string, Line[]>();
  for (const l of lines) if (l.kind === 'deduction' && l.itemCode !== 'RETIRE') byItem.set(l.itemCode, [...(byItem.get(l.itemCode) || []), l]);
  for (const [code, ls] of byItem) {
    const it = ctx.items.find(i => i.code === code)!;
    const v = liveVersion(it, end) || liveVersion(it, start);
    if (!v?.props?.round_line) continue;
    const total = sum(ls.map(l => l.amount)); const rounded = roundDinar(total); const diff = rounded - total;
    if (diff !== 0n) { ls[ls.length - 1].amount += diff; ls[ls.length - 1].explain.rounding = toDecimal(diff); }
  }
  return result(true, flags);
}
