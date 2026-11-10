// B7: قواعد كتب الشكر (ق-9) والعقوبات (ق-10)
import { describe, it, expect } from 'vitest';
import { applyCommendationRules, calculateIncrementEligibility, calculatePromotionEligibility } from './promotionEngine';

const letter = (id: number, date: string, extra: any = {}) => ({ id, orderDate: date, creditMonthsSnapshot: 1, commendationTypeId: 1, ...extra });

describe('ق-9: شمول كتاب الشكر وسقفه السنوي', () => {
  it('السقف العام يطبّق على السنة الميلادية والأقدم أولاً', () => {
    const cs = [letter(1, '2024-05-01'), letter(2, '2024-01-01'), letter(3, '2024-03-01'), letter(4, '2024-12-01'), letter(5, '2025-01-01')];
    const r = applyCommendationRules(cs as any, 'increment', { commendationMaxPerYear: 3 } as any);
    expect(r.eligible.map((c: any) => c.id)).toEqual([2, 3, 1, 5]);
    expect(r.excluded.map((x: any) => x.c.id)).toEqual([4]);
  });

  it('سقف النوع قيد إضافي داخل السقف العام', () => {
    const types = [{ id: 9, annualCap: 1 }];
    const cs = [letter(1, '2024-01-01', { commendationTypeId: 9 }), letter(2, '2024-02-01', { commendationTypeId: 9 }), letter(3, '2024-03-01')];
    const r = applyCommendationRules(cs as any, 'promotion', { commendationTypes: types, commendationMaxPerYear: 3 } as any);
    expect(r.eligible.map((c: any) => c.id)).toEqual([1, 3]);
  });

  it('سقف نوع أكبر من العام لا يتجاوز العام', () => {
    const types = [{ id: 9, annualCap: 5 }];
    const cs = [1, 2, 3, 4, 5].map(i => letter(i, `2024-0${i}-01`, { commendationTypeId: 9 }));
    const r = applyCommendationRules(cs as any, 'increment', { commendationTypes: types, commendationMaxPerYear: 3 } as any);
    expect(r.eligible).toHaveLength(3);
  });

  it('الكتاب المسجل بالجدولين يُحتسب مرة ويُفضَّل السجل ذو النوع', () => {
    const types = [{ id: 9, appliesTo: 'ترفيع' }];
    const a = { id: 1, employeeId: 5, orderNumber: '12', orderDate: '2024-02-01', creditMonthsSnapshot: 1 };
    const b = { id: 7, employeeId: 5, orderNumber: '12', orderDate: '2024-02-01', creditMonthsSnapshot: 1, commendationTypeId: 9, appliesToSnapshot: 'ترفيع' };
    const inc = applyCommendationRules([a, b] as any, 'increment', { commendationTypes: types } as any);
    expect(inc.eligible).toHaveLength(0);
    const pro = applyCommendationRules([a, b] as any, 'promotion', { commendationTypes: types } as any);
    expect(pro.eligible.map((c: any) => c.id)).toEqual([7]);
  });

  it('المخفي وكتاب الشكر المعنوي لا يستهلكان من السقف', () => {
    const cs = [letter(1, '2025-01-01', { isHidden: true }), letter(2, '2025-02-01', { isHidden: true }), letter(3, '2025-03-01', { creditMonthsSnapshot: 0 }), letter(4, '2025-04-01')];
    const r = applyCommendationRules(cs as any, 'increment', { commendationMaxPerYear: 1 } as any);
    expect(r.excluded).toHaveLength(0);
  });

  it('لقطة الشمول وقت التسجيل تتقدم على نوع الكتاب الحالي', () => {
    const types = [{ id: 1, appliesTo: 'كلاهما' }];
    const cs = [letter(1, '2024-01-01', { appliesToSnapshot: 'ترفيع' }), letter(2, '2024-02-01')];
    const inc = applyCommendationRules(cs as any, 'increment', { commendationTypes: types } as any);
    expect(inc.eligible.map((c: any) => c.id)).toEqual([2]);
    const pro = applyCommendationRules(cs as any, 'promotion', { commendationTypes: types } as any);
    expect(pro.eligible.map((c: any) => c.id)).toEqual([1, 2]);
  });

  it('بلا سقف ولا أنواع: كل الكتب تُحتسب', () => {
    const cs = [1, 2, 3, 4, 5].map(i => letter(i, `2024-0${i}-01`));
    expect(applyCommendationRules(cs as any, 'increment', {} as any).eligible).toHaveLength(5);
  });

  it('الكتاب المتجاوز للسقف يظهر غير محتسب في المؤجلات', () => {
    const emp = { id: 1, grade: 7, step: 2, lastPromotionDate: '2022-01-01', lastIncrementDate: '2023-12-01' };
    const cs = [1, 2, 3, 4].map(i => letter(i, `2024-0${i}-15`));
    const r: any = calculateIncrementEligibility(emp as any, { commendations: cs as any, commendationMaxPerYear: 3, today: '2024-07-01' } as any);
    expect(JSON.stringify(r.deferredItems || [])).toContain('غير_محتسب');
  });
});

describe('ق-10: تُطبّق العقوبة الأشد فقط', () => {
  const emp = { id: 1, grade: 7, step: 2, lastPromotionDate: '2022-01-01', lastIncrementDate: '2025-01-01' };
  const pen = (id: number, type: string, date: string, extra: any = {}) => ({ id, penaltyType: type, penaltyDate: date, status: 'نافذ', ...extra });

  it('توبيخ + إنذار = تأخير التوبيخ وحده (لا مجموع)', () => {
    const r = calculateIncrementEligibility(emp as any, { penalties: [pen(1, 'التوبيخ', '2025-02-01'), pen(2, 'الإنذار', '2025-03-01')], today: '2025-04-01' } as any);
    expect(r.penaltyMonthsAdded).toBe(12);
  });

  it('لقطة التأخير المحفوظة مع العقوبة تُعتمد', () => {
    const r = calculateIncrementEligibility(emp as any, { penalties: [pen(1, 'نوع مخصص', '2025-02-01', { delayMonths: 7 }), pen(2, 'الإنذار', '2025-03-01')], today: '2025-04-01' } as any);
    expect(r.penaltyMonthsAdded).toBe(7);
  });

  it('العقوبة الملغاة بأمر لا أثر لها', () => {
    const r = calculateIncrementEligibility(emp as any, { penalties: [pen(1, 'التوبيخ', '2025-02-01', { status: 'ملغي بأمر إداري' })], today: '2025-04-01' } as any);
    expect(r.penaltyMonthsAdded).toBe(0);
  });

  it('الترفيع أيضاً يأخذ الأشد', () => {
    const e2 = { ...emp, lastPromotionDate: '2024-06-01' };
    const r: any = calculatePromotionEligibility(e2 as any, { penalties: [pen(1, 'التوبيخ', '2025-02-01'), pen(2, 'الإنذار', '2025-03-01')], today: '2025-04-01' } as any);
    expect(r.penaltyMonthsAdded).toBe(12);
  });
});
