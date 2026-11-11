// B8a2: اختبارات مرجعية لمحرك الرواتب (المتطلبات 24) بلا قاعدة بيانات.
import { describe, it, expect } from 'vitest';
import { computeEmployee, type EngineCtx, type EmployeeIn, type ItemIn } from './engine.ts';
import { money, toDecimal, divRound, applyRate, rate, roundDinar } from './money.ts';

const D = (m: bigint) => toDecimal(m);
const amounts = new Map<string, bigint>([['7-1', money(296000)], ['6-1', money(362000)], ['5-1', money(429000)], ['9-1', money(100000)]]);
const item = (id: number, code: string, direction: '+' | '-', method: string, props: any, extra: Partial<ItemIn> = {}): ItemIn => ({
  id, code, name: code, direction, classification: 'ثابت', assignmentMode: 'تلقائي', method, categoryId: 1,
  versions: [{ id: id * 10, validFrom: '2026-01-01', validTo: null, props: { status: 'فعّال', verification: 'مؤكد', legal_basis: 'اختبار', ...props } }], ...extra,
});
const CERT = item(1, 'CERT', '+', 'tiered', { level_source: 'education_degrees', value_kind: 'نسبة', base: ['NOMINAL'], inside_200_cap: true, cap_reduction_priority: 2, calc_order: 10, levels: [{ ref_id: 1, label: 'بكالوريوس', value: 45 }] });
const GEO = item(2, 'GEO', '+', 'tiered', { level_source: 'work_locations', value_kind: 'مبلغ', inside_200_cap: true, cap_reduction_priority: 3, calc_order: 30, levels: [{ ref_id: 7, label: 'مركز محافظة', value: 20000 }], conditions: [[{ field: 'free_transport', op: 'يساوي', value: false }]] });
const FAMILY = item(3, 'FAMILY', '+', 'family', { inside_200_cap: false, calc_order: 50, family: { spouse_amount: 50000, child_amount: 10000, max_children: 4, son_age: 18, son_student_age: 24 } });
const RETIRE = item(4, 'RETIRE', '-', 'percent', { value_kind: 'نسبة', value: 10, base: ['RETIREMENT_BASE'], round_line: true }, { classification: 'عام' });

const ctxOf = (items: ItemIn[], month = 3): EngineCtx => ({
  year: 2026, month, categoryId: 1,
  scale: { versions: [{ id: 2, effectiveFrom: '2008-05-12' }], amounts: new Map([[2, amounts]]) },
  items,
  lookups: { education_degrees: new Map([['بكالوريوس', 1]]), work_locations: new Map([['مركز محافظه', 7]]), responsibility_allowances: new Map() },
  orgParents: new Map(), eligibleStatuses: new Set(['مستمر']),
  categoryRules: [{ serviceType: 'دائم', contractType: null, categoryId: 1 }],
});
const emp = (over: Partial<EmployeeIn> = {}, tl: Record<string, any> = {}): EmployeeIn => ({
  id: 1, serviceStart: '2015-01-01', assignments: [],
  family: { members: [{ id: 1, relation: 'ابن', birthDate: '2016-01-01' }, { id: 2, relation: 'بنت', birthDate: '2018-01-01' }, { id: 3, relation: 'زوجة', birthDate: null }], facts: [], extensions: [] },
  timeline: Object.fromEntries(Object.entries({ grade: 7, step: 1, status: 'مستمر', service_type: 'دائم', education_level: 'بكالوريوس', work_location: 'مركز محافظة', free_transport: false, family_mode: 'كامل', ...tl })
    .map(([k, v]) => [k, Array.isArray(v) ? v : [{ from: null, value: v }]])),
  ...over,
});
const line = (r: any, code: string) => r.lines.filter((l: any) => l.itemCode === code).reduce((a: bigint, l: any) => a + l.amount, 0n);

describe('المال بلا أعداد عائمة', () => {
  it('القسمة تقرّب النصف بعيداً عن الصفر', () => {
    expect(divRound(5n, 2n)).toBe(3n); expect(divRound(-5n, 2n)).toBe(-3n); expect(divRound(4n, 3n)).toBe(1n);
    expect(D(money('133200.5'))).toBe('133200.500000');
    expect(D(applyRate(money(296000), rate(45)))).toBe('133200.000000');
    expect(D(roundDinar(money('100.5')))).toBe('101.000000');
  });
});

describe('محرك الرواتب: الحالة أ (المتطلبات 24.1) دون الضريبة', () => {
  it('الدرجة 7/1، بكالوريوس، متزوج بطفلين، مركز محافظة: الصافي 489,600', () => {
    const r = computeEmployee(emp(), ctxOf([CERT, GEO, FAMILY, RETIRE]));
    expect(r.computed).toBe(true);
    expect(D(r.nominal)).toBe('296000.000000');
    expect(D(line(r, 'CERT'))).toBe('133200.000000');
    expect(D(line(r, 'FAMILY'))).toBe('70000.000000');
    expect(D(line(r, 'GEO'))).toBe('20000.000000');
    expect(D(r.allowances)).toBe('223200.000000');
    expect(D(line(r, 'RETIRE'))).toBe('29600.000000');
    expect(D(r.net)).toBe('489600.000000');
    const cert = r.lines.find(l => l.itemCode === 'CERT')!;
    expect(cert.explain).toMatchObject({ level: 'بكالوريوس', legal_basis: 'اختبار' });
  });
});

describe('محرك الرواتب: الحالات', () => {
  it('حالة 3: موظف بلا درجة ما يُحتسب ويُبلَّغ', () => {
    const r = computeEmployee(emp({}, { grade: null }), ctxOf([CERT, RETIRE]));
    expect(r.computed).toBe(false);
    expect(r.issues[0].code).toBe('NO_GRADE');
  });
  it('حالة 4: خطأ تقييم شرط ما يمنح البند ويُبلَّغ', () => {
    const r = computeEmployee(emp({}, { free_transport: null }), ctxOf([GEO, RETIRE]));
    expect(line(r, 'GEO')).toBe(0n);
    expect(r.issues.some(i => i.code === 'EVAL_FAILED' && i.itemCode === 'GEO')).toBe(true);
  });
  it('حالة 9: ترفيع يوم 16 من شهر 31 يوماً ⇒ مقطعان 15/31 و16/31', () => {
    const r = computeEmployee(emp({}, { grade: [{ from: null, value: 7 }, { from: '2026-03-16', value: 6 }] }), ctxOf([RETIRE]));
    const noms = r.lines.filter(l => l.kind === 'nominal');
    expect(noms.map(l => l.share)).toEqual(['15/31', '16/31']);
    const expected = divRound(money(296000) * 15n, 31n) + divRound(money(362000) * 16n, 31n);
    expect(r.nominal).toBe(expected);
    expect(r.net).toBe(roundDinar(r.netExact)); // الصافي مقرّب، والسطور بكسورها
  });
  it('سقف 200%: التخفيض بأولوية المدير والعائلية خارج السقف', () => {
    const A = item(5, 'A', '+', 'percent', { value_kind: 'نسبة', value: 150, base: ['NOMINAL'], inside_200_cap: true, cap_reduction_priority: 2, calc_order: 1 });
    const B = item(6, 'B', '+', 'percent', { value_kind: 'نسبة', value: 100, base: ['NOMINAL'], inside_200_cap: true, cap_reduction_priority: 1, calc_order: 2 });
    const r = computeEmployee(emp({}, { grade: 9 }), ctxOf([A, B, FAMILY]));
    const cap = r.lines.filter(l => l.kind === 'cap');
    expect(cap).toHaveLength(1);
    expect(cap[0].itemCode).toBe('B');
    expect(D(cap[0].amount)).toBe('-50000.000000');
    expect(D(line(r, 'FAMILY'))).toBe('70000.000000');
    expect(r.flags.cap_reached).toBe(true);
  });
  it('حجب بند عام (ق-3) يصفّره ويُعلَّم', () => {
    const r = computeEmployee(emp({ assignments: [{ id: 9, itemId: 4, kind: 'حجب', valueKind: null, value: '0', validFrom: '2026-01-01', validTo: null }] }), ctxOf([RETIRE]));
    expect(line(r, 'RETIRE')).toBe(0n);
    expect(r.flags.general_withheld).toContain('RETIRE');
  });
  it('الحجب يتقدم على تعديل فردي بنفس الفترة', () => {
    const ov = { ...CERT, versions: [{ ...CERT.versions[0], props: { ...CERT.versions[0].props, individual_override: true, withholdable: true } }] };
    const r = computeEmployee(emp({ assignments: [
      { id: 5, itemId: 1, kind: 'تعديل', valueKind: 'نسبة', value: '55', validFrom: '2026-01-01', validTo: '2026-12-31' },
      { id: 6, itemId: 1, kind: 'حجب', valueKind: null, value: '0', validFrom: '2026-01-01', validTo: null }] }), ctxOf([ov]));
    expect(line(r, 'CERT')).toBe(0n);
  });
  it('الإسناد الفردي يتقدم على القاعدة', () => {
    const r = computeEmployee(emp({ assignments: [{ id: 5, itemId: 1, kind: 'تعديل', valueKind: 'نسبة', value: '55', validFrom: '2026-01-01', validTo: '2026-12-31' }] }), ctxOf([{ ...CERT, versions: [{ ...CERT.versions[0], props: { ...CERT.versions[0].props, individual_override: true } }] }]));
    expect(D(line(r, 'CERT'))).toBe(D(applyRate(money(296000), rate(55))));
  });
  it('البنود المسودة ما تدخل الاحتساب (مب8)', () => {
    const draft = { ...CERT, versions: [{ ...CERT.versions[0], props: { ...CERT.versions[0].props, status: 'مسودة' } }] };
    expect(line(computeEmployee(emp(), ctxOf([draft])), 'CERT')).toBe(0n);
  });
  it('العائلية: الابن 18–24 بلا «يدرس» ما يُحتسب، والبنت البالغة بلا حقائق تُبلَّغ', () => {
    const fam = { members: [{ id: 1, relation: 'ابن', birthDate: '2005-01-01' }, { id: 2, relation: 'بنت', birthDate: '2004-01-01' }], facts: [], extensions: [] };
    const r = computeEmployee(emp({ family: fam }), ctxOf([FAMILY]));
    expect(D(line(r, 'FAMILY'))).toBe('50000.000000');
    expect(r.issues.some(i => i.code === 'DAUGHTER_FACTS_MISSING')).toBe(true);
    const fam2 = { ...fam, facts: [{ memberId: 1, fact: 'يدرس', value: true, validFrom: null }, { memberId: 2, fact: 'متزوج', value: false, validFrom: null }, { memberId: 2, fact: 'موظف', value: false, validFrom: null }] };
    expect(D(line(computeEmployee(emp({ family: fam2 }), ctxOf([FAMILY])), 'FAMILY'))).toBe('70000.000000');
  });
  it('نمط العائلية غير محدد ⇒ ما تُمنح ويُبلَّغ', () => {
    const r = computeEmployee(emp({}, { family_mode: null }), ctxOf([FAMILY]));
    expect(line(r, 'FAMILY')).toBe(0n);
    expect(r.issues.some(i => i.code === 'FAMILY_MODE_MISSING')).toBe(true);
  });
  it('حالة غير مشمولة بالصرف أو فئة أخرى ⇒ ما يُحتسب', () => {
    expect(computeEmployee(emp({}, { status: 'متقاعد' }), ctxOf([])).computed).toBe(false);
    expect(computeEmployee(emp({}, { service_type: 'عقد' }), ctxOf([])).computed).toBe(false);
  });
  it('استقطاع جهة يُقرَّب لسطره الشهري، والصافي يُقرَّب', () => {
    const UNION = item(8, 'UNION', '-', 'flat', { value_kind: 'مبلغ', value: 5000, round_line: true }, { assignmentMode: 'تلقائي' });
    const r = computeEmployee(emp({}, { grade: [{ from: null, value: 7 }, { from: '2026-03-16', value: 6 }] }), ctxOf([UNION]));
    expect(line(r, 'UNION') % 1_000_000n).toBe(0n);
    expect(r.net % 1_000_000n).toBe(0n);
  });
  it('مراجعة م-H2: إسناد بمبلغ صريح على بند متدرج يُصرف مبلغاً لا نسبة', () => {
    const geo = { ...GEO, versions: [{ ...GEO.versions[0], props: { ...GEO.versions[0].props, individual_override: true } }] };
    const r = computeEmployee(emp({ assignments: [{ id: 7, itemId: 2, kind: 'تعديل', valueKind: 'مبلغ', value: '25000', validFrom: '2026-01-01', validTo: null }] }), ctxOf([geo]));
    expect(D(line(r, 'GEO'))).toBe('25000.000000');
  });
  it('مراجعة L2: إسناد على بند تلقائي ونسخته ما تسمح بالتعديل الفردي ⇒ تُطبّق القاعدة وتُبلَّغ', () => {
    const r = computeEmployee(emp({ assignments: [{ id: 5, itemId: 1, kind: 'تعديل', valueKind: 'نسبة', value: '55', validFrom: '2026-01-01', validTo: null }] }), ctxOf([CERT]));
    expect(D(line(r, 'CERT'))).toBe(D(applyRate(money(296000), rate(45))));
    expect(r.issues.some(i => i.code === 'OVERRIDE_IGNORED')).toBe(true);
  });
  it('مراجعة M1: التقاعد لكل مقطع — حجب جزئي وتغيّر النسبة بنص الشهر', () => {
    const half = computeEmployee(emp({ assignments: [{ id: 9, itemId: 4, kind: 'حجب', valueKind: null, value: '0', validFrom: '2026-01-01', validTo: '2026-03-15' }] }), ctxOf([RETIRE]));
    // 16/31 من 29,600 = 15,277.42 ⇒ يُقرَّب 15,277
    expect(D(line(half, 'RETIRE'))).toBe(D(roundDinar(applyRate(divRound(money(296000) * 16n, 31n), rate(10)))));
    const r2 = { ...RETIRE, versions: [{ ...RETIRE.versions[0], validTo: '2026-03-15' }, { id: 41, validFrom: '2026-03-16', validTo: null, props: { ...RETIRE.versions[0].props, value: 12 } }] };
    const r = computeEmployee(emp(), ctxOf([r2]));
    const a = applyRate(divRound(money(296000) * 15n, 31n), rate(10)) + applyRate(divRound(money(296000) * 16n, 31n), rate(12));
    expect(D(line(r, 'RETIRE'))).toBe(D(roundDinar(a)));
  });
  it('مراجعة M4: حد عمر الابن من إعداد البند (21) يقطع الشهر بعيد الميلاد', () => {
    const fam21 = { ...FAMILY, versions: [{ ...FAMILY.versions[0], props: { ...FAMILY.versions[0].props, family: { spouse_amount: 0, child_amount: 10000, max_children: 4, son_age: 21, son_student_age: 24 } } }] };
    const r = computeEmployee(emp({ family: { members: [{ id: 1, relation: 'ابن', birthDate: '2005-03-10' }], facts: [], extensions: [] } }), ctxOf([fam21]));
    expect(D(line(r, 'FAMILY'))).toBe(D(divRound(money(10000) * 9n, 31n)));
  });
});
