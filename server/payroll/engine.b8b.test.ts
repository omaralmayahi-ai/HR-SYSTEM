// B8b: حالات الاستحقاق والأقساط والمحجوز والرصيد المدين وحماية الصافي — اختبارات مرجعية بلا قاعدة بيانات.
import { describe, it, expect } from 'vitest';
import { computeEmployee, type EngineCtx, type EmployeeIn, type ItemIn, type StateDef } from './engine.ts';
import { money, toDecimal, roundDinar, applyRate, rate, mulDiv } from './money.ts';

const D = (m: bigint) => toDecimal(m);
const item = (id: number, code: string, direction: '+' | '-', method: string, props: any, extra: Partial<ItemIn> = {}): ItemIn => ({
  id, code, name: code, direction, classification: 'ثابت', assignmentMode: 'تلقائي', method, categoryId: 1,
  versions: [{ id: id * 10, validFrom: '2020-01-01', validTo: null, props: { status: 'فعّال', verification: 'مؤكد', legal_basis: 'اختبار', ...props } }], ...extra,
});
const CERT = item(1, 'CERT', '+', 'tiered', { level_source: 'education_degrees', value_kind: 'نسبة', base: ['NOMINAL'], inside_200_cap: true, cap_reduction_priority: 2, calc_order: 10,
  levels: [{ ref_id: 1, label: 'بكالوريوس', value: 45 }, { ref_id: 2, label: 'ماجستير', value: 75 }] });
const RISK = item(5, 'RISK', '+', 'percent', { value_kind: 'نسبة', value: 160, base: ['NOMINAL'], inside_200_cap: true, cap_reduction_priority: 1, calc_order: 20 }, { classification: 'تقديري' });
const FAMILY = item(3, 'FAMILY', '+', 'family', { inside_200_cap: false, calc_order: 50, family: { spouse_amount: 50000, child_amount: 10000, max_children: 4, son_age: 18, son_student_age: 24 } });
const RETIRE = item(4, 'RETIRE', '-', 'percent', { value_kind: 'نسبة', value: 10, round_line: true }, { classification: 'عام' });
const LOAN = item(6, 'LOAN', '-', 'installments', { deduction_priority: 4 }, { assignmentMode: 'بأمر', classification: 'مؤقت' });
const COURT = item(7, 'COURT', '-', 'manual', { deduction_priority: 1, mandatory: true, monthly: true }, { assignmentMode: 'بأمر', classification: 'مؤقت' });
const UNION = item(8, 'UNION', '-', 'flat', { value_kind: 'مبلغ', value: 5000, deduction_priority: 5 });
const RELEASE = item(9, 'HELD_RELEASE', '+', 'manual', { monthly: true }, { assignmentMode: 'بأمر', classification: 'مؤقت' });

const S = (id: number, code: string, nominalPct: string, extra: Partial<StateDef> = {}): StateDef => ({
  id, code, name: code, nominalPct, heldPct: '0', defaultBehavior: 'يتبع', itemBehaviors: {}, retirement: 'على المستحق', precedence: 10, verification: 'مؤكد', ...extra,
});
const HALF = S(1, 'نصف راتب', '50');
const UNPAID = S(2, 'بدون راتب', '0', { defaultBehavior: 'يتوقف', retirement: 'لا تُستوفى' });
const SUSP = S(3, 'سحب اليد', '50', { heldPct: '50', precedence: 50 });

const ctxOf = (items: ItemIn[], month = 4): EngineCtx => ({
  year: 2026, month, categoryId: 1,
  scale: { versions: [{ id: 2, effectiveFrom: '2008-05-12' }], amounts: new Map([[2, new Map([['7-1', money(296000)], ['6-1', money(362000)]])]]) },
  items, lookups: { education_degrees: new Map([['بكالوريوس', 1], ['ماجستير', 2]]), work_locations: new Map(), responsibility_allowances: new Map() },
  orgParents: new Map(), eligibleStatuses: new Set(['مستمر']), categoryRules: [{ serviceType: 'دائم', contractType: null, categoryId: 1 }],
  states: new Map([[1, HALF], [2, UNPAID], [3, SUSP]]),
});
const emp = (over: Partial<EmployeeIn> = {}, tl: Record<string, any> = {}): EmployeeIn => ({
  id: 1, serviceStart: '2015-01-01', assignments: [], family: { members: [{ id: 3, relation: 'زوجة', birthDate: null }], facts: [], extensions: [] },
  timeline: Object.fromEntries(Object.entries({ grade: 7, step: 1, status: 'مستمر', service_type: 'دائم', education_level: 'بكالوريوس', family_mode: 'كامل', ...tl })
    .map(([k, v]) => [k, Array.isArray(v) ? v : [{ from: null, value: v }]])),
  ...over,
});
const line = (r: any, code: string, kind?: string) => r.lines.filter((l: any) => l.itemCode === code && (!kind || l.kind === kind)).reduce((a: bigint, l: any) => a + l.amount, 0n);

describe('B8b حالات الاستحقاق', () => {
  it('حالة 13: إجازة بنصف راتب 10 أيام من 30 ⇒ الاسمي المستحق 246,667 وكل بند حسب سلوكه', () => {
    const fam = { ...FAMILY, versions: [{ ...FAMILY.versions[0], props: { ...FAMILY.versions[0].props, state_behavior: { 'نصف راتب': 'كامل' } } }] };
    const r = computeEmployee(emp({ states: [{ from: '2026-04-11', to: '2026-04-20', stateId: 1, source: 'إجازة' }] }), ctxOf([CERT, fam]));
    expect(D(roundDinar(line(r, 'NOMINAL')))).toBe('246667.000000');
    // الشهادة تتبع نسبة الراتب، والعائلية كاملة بإعداد البند
    expect(D(roundDinar(line(r, 'CERT')))).toBe(D(roundDinar(money(296000 * 0.45) * 20n / 30n + money(296000 * 0.45 * 0.5) * 10n / 30n)));
    // العائلية كاملة رغم المقاطع (مجموع المقاطع بفرق جزء من مليون يذوب بتقريب الصافي)
    expect(D(roundDinar(line(r, 'FAMILY')))).toBe('50000.000000');
    expect(r.flags.states).toEqual(['نصف راتب']);
  });
  it('حالة 14: ترفيع + تغيّر شهادة + إجازة بنصف راتب ⇒ ثلاثة مقاطع أو أكثر، والسقف على الكامل قبل الحالة', () => {
    const r = computeEmployee(emp({ states: [{ from: '2026-04-21', to: '2026-04-30', stateId: 1, source: 'إجازة' }] },
      { grade: [{ from: null, value: 7 }, { from: '2026-04-11', value: 6 }], education_level: [{ from: null, value: 'بكالوريوس' }, { from: '2026-04-16', value: 'ماجستير' }] }), ctxOf([CERT, RISK]));
    expect(r.flags.segments).toBeGreaterThanOrEqual(4);
    // المقطع الأخير: سقف على الكامل (75%+160% > 200%) ثم نصف
    const lastCap = r.lines.filter((l: any) => l.kind === 'cap' && l.segmentFrom === '2026-04-21');
    expect(lastCap.length).toBe(1);
    expect(lastCap[0].explain.cut_full).toBe(D(money(362000 * 0.35)));
    expect(lastCap[0].amount).toBe(-mulDiv(applyRate(money(362000 * 0.35), rate('50')), 10n, 30n));
  });
  it('بدون راتب: الاسمي والمخصصات تتوقف والتقاعد ما يُستوفى لأيامها', () => {
    const r = computeEmployee(emp({ states: [{ from: '2026-04-01', to: '2026-04-15', stateId: 2, source: 'إجازة' }] }), ctxOf([CERT, RETIRE]));
    expect(D(line(r, 'NOMINAL'))).toBe(D(money(296000) * 15n / 30n));
    expect(D(line(r, 'RETIRE'))).toBe(D(roundDinar(money(296000) * 15n / 30n / 10n)));
  });
  it('سحب اليد: 50% يُصرف و50% محجوز خارج الصافي، وصرف المحجوز مقصوص على الرصيد (حالة 16)', () => {
    const r = computeEmployee(emp({ states: [{ from: '2026-04-16', to: '2026-04-30', stateId: 3, source: 'حالة الموظف' }] }), ctxOf([]));
    expect(D(line(r, 'HELD', 'held'))).toBe(D(money(148000) * 15n / 30n));
    expect(r.net).toBe(roundDinar(money(296000) * 15n / 30n + money(148000) * 15n / 30n));
    const rel = computeEmployee(emp({ assignments: [{ id: 50, itemId: 9, kind: 'منح', valueKind: 'مبلغ', value: '100000', validFrom: '2026-04-01', validTo: '2026-04-30' }],
      balances: { installmentsPaid: new Map(), held: money(74000), debit: 0n } }), ctxOf([RELEASE]));
    expect(D(line(rel, 'HELD_RELEASE', 'held_release'))).toBe('74000.000000');
    expect(rel.issues.some(i => i.code === 'HELD_RELEASE_CAPPED')).toBe(true);
  });
});

describe('B8b الأقساط والصافي', () => {
  const loan = (id: number, principal: number, installment: number) => ({ id, itemId: 6, kind: 'منح', valueKind: 'مبلغ', value: null, validFrom: '2026-01-01', validTo: null, principal: String(principal), installment: String(installment), installmentsCount: null });
  it('حالة 17: سلفتان متزامنتان تُستقطعان معاً وتنتهي كل منهما عند رصيدها', () => {
    const r = computeEmployee(emp({ assignments: [loan(1, 300000, 100000), loan(2, 200000, 50000)], balances: { installmentsPaid: new Map([[1, money(250000)], [2, money(50000)]]), held: 0n, debit: 0n } }), ctxOf([LOAN]));
    const ls = r.lines.filter((l: any) => l.itemCode === 'LOAN');
    expect(ls.map((l: any) => [l.assignmentId, D(l.amount)])).toEqual([[1, '50000.000000'], [2, '50000.000000']]);
    const done = computeEmployee(emp({ assignments: [loan(1, 300000, 100000)], balances: { installmentsPaid: new Map([[1, money(300000)]]), held: 0n, debit: 0n } }), ctxOf([LOAN]));
    expect(done.lines.some((l: any) => l.itemCode === 'LOAN')).toBe(false);
  });
  it('حالة 18: تأجيل جزئي من الأدنى أولوية، والإلزامية ما تتأجل، والسالب رصيد مدين', () => {
    const court = { id: 70, itemId: 7, kind: 'منح', valueKind: 'مبلغ', value: '200000', validFrom: '2026-01-01', validTo: null };
    const r = computeEmployee(emp({ assignments: [court, loan(1, 1000000, 100000)] }), ctxOf([LOAN, COURT, UNION, RETIRE]));
    // 296,000 − 29,600 تقاعد − 200,000 قضائي (إلزامي) − 5,000 نقابة (بلا رصيد يحمله فما تتأجل) = 61,400 ⇒ القسط يتأجل جزئياً
    expect(line(r, 'UNION')).toBe(money(5000));
    expect(D(line(r, 'LOAN'))).toBe('61400.000000');
    expect(line(r, 'COURT')).toBe(money(200000));
    expect(r.net).toBe(0n);
    expect(r.flags.deferred.map((x: any) => x.item)).toEqual(['LOAN']);
    // قضائي أكبر من الراتب ⇒ سالب يُرحَّل
    const big = computeEmployee(emp({ assignments: [{ ...court, value: '400000' }] }), ctxOf([COURT, RETIRE]));
    expect(big.net).toBe(0n);
    expect(D(big.negative)).toBe('133600.000000');
    const next = computeEmployee(emp({ balances: { installmentsPaid: new Map(), held: 0n, debit: money(133600) } }), ctxOf([]));
    expect(D(line(next, 'DEBIT_CARRY', 'debit_carry'))).toBe('133600.000000');
  });

});

describe('B8b مراجعة', () => {
  const loan = (id: number, principal: number, extra: any = {}) => ({ id, itemId: 6, kind: 'منح', valueKind: 'مبلغ', value: null, validFrom: '2026-01-01', validTo: null, principal: String(principal), installment: null, installmentsCount: 3, ...extra });
  const LOANR = { ...LOAN, versions: [{ ...LOAN.versions[0], props: { ...LOAN.versions[0].props, round_line: true } }] };
  it('H2: سلفتان على بند مقرَّب ⇒ كل قسط مقرَّب بنفسه، والأخير ما يتجاوز الباقي', () => {
    const r = computeEmployee(emp({ assignments: [loan(1, 100000), loan(2, 100000)], balances: { installmentsPaid: new Map([[2, money(99999.5)]]), held: 0n, debit: 0n } }), ctxOf([LOANR]));
    const ls = r.lines.filter((l: any) => l.itemCode === 'LOAN').map((l: any) => D(l.amount));
    expect(ls).toEqual(['33333.000000', '0.500000']);
  });
  it('H1: تأجيل قسط مقرَّب بدنانير كاملة', () => {
    const court = { id: 70, itemId: 7, kind: 'منح', valueKind: 'مبلغ', value: '296000.5', validFrom: '2026-01-01', validTo: null };
    const r = computeEmployee(emp({ assignments: [court, loan(1, 300000)] }), ctxOf([LOANR, COURT]));
    expect(line(r, 'LOAN') % money(1)).toBe(0n);
  });
  it('M1: قسط انتهت مدته وباقيه قائم يستمر وينبَّه', () => {
    const r = computeEmployee(emp({ assignments: [loan(1, 300000, { validTo: '2026-03-31', installment: '100000', installmentsCount: null })], balances: { installmentsPaid: new Map([[1, money(150000)]]), held: 0n, debit: 0n } }), ctxOf([LOAN]));
    expect(D(line(r, 'LOAN'))).toBe('100000.000000');
    expect(r.issues.some(i => i.code === 'INSTALLMENT_EXTENDED')).toBe(true);
  });
  it('M2: استقطاع بنسبة من الاسمي يتبع الحالة', () => {
    const HEALTH = item(11, 'HEALTH', '-', 'percent', { value_kind: 'نسبة', value: 10, base: ['NOMINAL'] }, { classification: 'عام' });
    const r = computeEmployee(emp({ states: [{ from: '2026-04-01', to: '2026-04-30', stateId: 1, source: 'إجازة' }] }), ctxOf([HEALTH]));
    expect(D(line(r, 'HEALTH'))).toBe('14800.000000');
  });
  it('M3: بند شهري بأمر يتوقف بإجازة بدون راتب للشهر كله', () => {
    const MON = item(12, 'MON', '+', 'manual', { monthly: true }, { assignmentMode: 'بأمر' });
    const r = computeEmployee(emp({ assignments: [{ id: 80, itemId: 12, kind: 'منح', valueKind: 'مبلغ', value: '50000', validFrom: '2026-01-01', validTo: null }],
      states: [{ from: '2026-04-01', to: '2026-04-30', stateId: 2, source: 'إجازة' }] }), ctxOf([MON]));
    expect(line(r, 'MON')).toBe(0n);
  });
});

describe('B8c المحرك', () => {
  it('العمل الإضافي: الوعاء × الساعات × المعامل ÷ ساعات الشهر، بحد 3 ساعات يومياً', () => {
    const OT = item(13, 'OVERTIME', '+', 'hours', { factor: 1.5, hours_divisor: 210 }, { assignmentMode: 'بأمر', classification: 'تقديري' });
    const a = (h: string) => ({ id: 90, itemId: 13, kind: 'منح', valueKind: 'مبلغ', value: h, validFrom: '2026-04-01', validTo: '2026-04-30' });
    const r = computeEmployee(emp({ assignments: [a('20')] }), ctxOf([OT]));
    expect(D(line(r, 'OVERTIME'))).toBe(D(applyRate(mulDiv(money(296000), money(20), money(210)), rate('150'))));
    const capped = computeEmployee(emp({ assignments: [a('200')] }), ctxOf([OT]));
    expect(capped.issues.some(i => i.code === 'OVERTIME_CAPPED')).toBe(true);
    expect(line(capped, 'OVERTIME')).toBe(applyRate(mulDiv(money(296000), money(90), money(210)), rate('150')));
  });
  it('الفروق الرجعية تُدرج سطوراً وما تدخل وعاء تقاعد الشهر الجاري (ق-8)', () => {
    const r = computeEmployee(emp({ retro: [{ originPeriodId: 7, originYm: '2026/01', key: 'NOMINAL', itemId: null, itemCode: 'NOMINAL', itemName: 'الراتب الاسمي', direction: '+', amount: money(66000) }] }), ctxOf([RETIRE]));
    expect(D(line(r, 'NOMINAL', 'retro'))).toBe('66000.000000');
    expect(D(line(r, 'RETIRE'))).toBe('29600.000000');
    expect(r.net).toBe(money(296000 - 29600 + 66000));
  });
});
