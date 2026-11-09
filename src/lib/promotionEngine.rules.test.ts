// اختبارات قواعد محرك الاستحقاق بعد مراجعة R2/R3
import { describe, it, expect } from 'vitest';
import {
  calculateIncrementEligibility,
  calculatePromotionEligibility,
  recalculateEligibilitySync,
  resolvePenaltyDelayMonths,
  salaryCutDelayMonths,
  EngineContextData,
} from './promotionEngine';
import { calculateDegreeTrackSimulation } from './degreeTrackEngine';

const okGate: Partial<EngineContextData> = {
  evaluations: [{ year: 2024, rating: 'امتياز' }, { year: 2025, rating: 'امتياز' }],
  governingCourses: [],
};

describe('الخدمة المحتسبة تُطبَّق مرة واحدة (R2 #1)', () => {
  const credit = { id: 1, calculatedMonths: 6, purpose: 'علاوة_وترفيع', orderDate: '2025-03-01' };

  it('تُطبَّق على الدورة التي يقع فيها تاريخ أمرها', () => {
    const emp = { id: 1, grade: 6, step: 2, lastIncrementDate: '2025-01-01', lastPromotionDate: '2023-01-01' };
    const r = calculateIncrementEligibility(emp, { serviceCredits: [credit], today: '2025-08-01' });
    expect(r.nextIncrementDueDate).toBe('2025-07-01');
    expect(r.modifiers?.serviceCreditMonths).toBe(6);
  });

  it('لا تُطبَّق مرة ثانية بعد منح العلاوة (الدورة التالية تبدأ بعد تاريخ أمرها)', () => {
    const emp = { id: 1, grade: 6, step: 3, lastIncrementDate: '2025-07-01', lastPromotionDate: '2023-01-01' };
    const r = calculateIncrementEligibility(emp, { serviceCredits: [credit], today: '2025-08-01' });
    expect(r.nextIncrementDueDate).toBe('2026-07-01');
    expect(r.modifiers?.serviceCreditMonths).toBe(0);
  });

  it('الخدمة الأكبر من الدورة لا تجعل الاستحقاق يسبق تاريخ أمرها ولا تتكرر', () => {
    const big = { id: 2, calculatedYears: 2, purpose: 'علاوة_وترفيع', orderDate: '2025-05-01' };
    const emp = { id: 1, grade: 6, step: 2, lastIncrementDate: '2025-01-01', lastPromotionDate: '2023-01-01' };
    const r1 = calculateIncrementEligibility(emp, { serviceCredits: [big], today: '2025-06-01' });
    expect(r1.nextIncrementDueDate).toBe('2025-05-01');
    const r2 = calculateIncrementEligibility({ ...emp, step: 3, lastIncrementDate: r1.nextIncrementDueDate! }, { serviceCredits: [big], today: '2025-06-01' });
    expect(r2.nextIncrementDueDate).toBe('2026-05-01');
  });

  it('السجل بلا تاريخ أمر لا يُطبَّق ويُعلَّم بيانات ناقصة', () => {
    const emp = { id: 1, grade: 6, step: 2, lastIncrementDate: '2025-01-01' };
    const r = calculateIncrementEligibility(emp, { serviceCredits: [{ id: 9, calculatedMonths: 6 }], today: '2025-02-01' });
    expect(r.nextIncrementDueDate).toBe('2026-01-01');
    expect(r.deferredItems.some(d => d.type === 'service_credit' && d.status === 'بيانات_ناقصة')).toBe(true);
  });

  it('السجل المكرر في service_records و service_credits يُحتسب مرة واحدة', () => {
    const emp = { id: 1, grade: 6, step: 2, lastIncrementDate: '2025-01-01' };
    const rec = { years: 0, months: 3, days: 0, order_number: '55', order_date: '2025-02-01', purpose: 'promotion_allowance_pension' };
    const mirror = { calculated_years: 0, calculated_months: 3, calculated_days: 0, order_number: '55', order_date: '2025-02-01', purpose: 'علاوة_وترفيع' };
    const r = calculateIncrementEligibility(emp, { serviceCredits: [rec, mirror], today: '2025-03-01' });
    expect(r.modifiers?.serviceCreditMonths).toBe(3);
    expect(r.nextIncrementDueDate).toBe('2025-10-01');
  });

  it('الغرض «علاوة_فقط» لا يُحتسب للترفيع', () => {
    const emp = { id: 1, grade: 7, step: 2, lastPromotionDate: '2022-01-01', lastIncrementDate: '2025-01-01' };
    const r = calculatePromotionEligibility(emp, { ...okGate, serviceCredits: [{ calculatedMonths: 6, purpose: 'علاوة_فقط', orderDate: '2023-01-01' }], today: '2025-01-01' });
    expect(r.nextPromotionDueDate).toBe('2026-01-01');
  });
});

describe('نهاية الدرجة (المرحلة 11)', () => {
  it('تعيد «نهاية_المرحلة» بدل علاوة 11→11', () => {
    const r = calculateIncrementEligibility({ id: 1, grade: 5, step: 11, lastIncrementDate: '2020-01-01' }, { today: '2026-01-01' });
    expect(r.eligibilityStatus).toBe('نهاية_المرحلة');
    expect(r.isIncrementEligible).toBe(false);
    expect(r.nextIncrementDueDate).toBeNull();
  });
});

describe('بيانات ناقصة بلا قيم مختلقة', () => {
  it('درجة مفقودة ⇒ بيانات_ناقصة (لا درجة 10)', () => {
    const res = recalculateEligibilitySync({ id: 1, step: 2, lastPromotionDate: '2022-01-01', lastIncrementDate: '2025-01-01' }, { today: '2026-01-01' });
    expect(res.grade).toBeNull();
    expect(res.promotion.eligibilityStatus).toBe('بيانات_ناقصة');
    expect(res.increment.eligibilityStatus).toBe('بيانات_ناقصة');
    expect(res.promotion.nextPromotionDueDate).toBeNull();
  });

  it('تواريخ مفقودة ⇒ بيانات_ناقصة (لا تاريخ اليوم)', () => {
    const res = recalculateEligibilitySync({ id: 1, grade: 7, step: 2 }, { today: '2026-01-01' });
    expect(res.increment.eligibilityStatus).toBe('بيانات_ناقصة');
    expect(res.increment.nextIncrementDueDate).toBeNull();
    expect(res.promotion.eligibilityStatus).toBe('بيانات_ناقصة');
    expect(res.promotion.nextPromotionDueDate).toBeNull();
  });

  it('مسار الشهادة: تاريخ تخرج مفقود ⇒ بيانات_ناقصة (لا 2020-01-01)', () => {
    const sim = calculateDegreeTrackSimulation({ id: 1, qualificationId: 1, employeeId: 1, actualGradeBefore: 5, baselineGrade: 7, orderDate: '2025-01-01' } as any, {});
    expect(sim.snapshotStatus).toBe('بيانات_ناقصة');
    expect(sim.realTimeNextPromotion.eligibilityStatus).toBe('بيانات_ناقصة');
    expect(sim.realTimeNextPromotion.isEligible).toBe(false);
  });
});

describe('الإجازة الموقفة/بدون راتب تمدد الاستحقاق (R2 #6، R3 #9)', () => {
  const emp = { id: 1, grade: 7, step: 2, lastPromotionDate: '2022-01-01', lastIncrementDate: '2025-01-01' };
  const unpaid = { id: 5, leaveType: 'إجازة بدون راتب', startDate: '2025-03-01', endDate: '2025-03-30', status: 'معتمد' };

  it('بعد انتهائها تُضاف أيامها إلى تاريخ العلاوة', () => {
    const r = calculateIncrementEligibility(emp, { leaves: [unpaid], today: '2025-06-01' });
    expect(r.blockingLeaveDaysAdded).toBe(30);
    expect(r.nextIncrementDueDate).toBe('2026-01-31');
    expect(r.eligibilityStatus).not.toBe('موقوف_بإجازة');
  });

  it('وتُضاف إلى تاريخ الترفيع', () => {
    const r = calculatePromotionEligibility(emp, { ...okGate, leaves: [unpaid], today: '2025-06-01' });
    expect(r.nextPromotionDueDate).toBe('2026-01-31');
  });

  it('الإجازة المعلقة لا أثر لها', () => {
    const r = calculateIncrementEligibility(emp, { leaves: [{ ...unpaid, status: 'معلق' }], today: '2025-06-01' });
    expect(r.nextIncrementDueDate).toBe('2026-01-01');
  });

  it('أثناء سريانها: موقوف_بإجازة للعلاوة', () => {
    const r = calculateIncrementEligibility(emp, { leaves: [unpaid], today: '2025-03-10' });
    expect(r.eligibilityStatus).toBe('موقوف_بإجازة');
  });
});

describe('مسار الشهادة أثناء الخدمة لا يخفي الموظف', () => {
  const emp = { id: 7, grade: 5, step: 2, lastPromotionDate: '2021-01-01', lastIncrementDate: '2025-01-01' };
  const quals = [{ employeeId: 7, qualificationType: 'أثناء الخدمة', isActive: true }];

  it('العلاوة تُحسب رغم وجود لقطة نشطة', () => {
    const snap = { id: 1, employeeId: 7, qualificationId: 1, status: 'نشط', actualGradeBefore: 5, baselineGrade: 7, graduationDateUsed: '2018-01-01', orderDate: '2024-01-01' };
    const r = calculateIncrementEligibility(emp, { qualifications: quals, degreeTrackSnapshots: [snap], today: '2026-02-01' });
    expect(r.eligibilityStatus).toBe('مستحق_للعلاوة');
    expect(r.nextIncrementDueDate).toBe('2026-01-01');
  });

  it('بعد التسوية (مكتمل) يعود الموظف للمسار الاعتيادي للترفيع', () => {
    const snap = { id: 1, employeeId: 7, qualificationId: 1, status: 'مكتمل', actualGradeBefore: 5, baselineGrade: 7, graduationDateUsed: '2018-01-01', orderDate: '2024-01-01' };
    const r = calculatePromotionEligibility(emp, { ...okGate, qualifications: quals, degreeTrackSnapshots: [snap], today: '2026-02-01' });
    expect(r.isSupported).toBe(true);
    expect(r.requiredYears).toBe(5);
    expect(r.nextPromotionDueDate).toBe('2026-01-01');
    expect(r.eligibilityStatus).toBe('مستحق_للترفيع');
  });

  it('مع لقطة نشطة يُتبع مسار الشهادة', () => {
    const snap = { id: 1, employeeId: 7, qualificationId: 1, status: 'نشط', actualGradeBefore: 5, baselineGrade: 7, graduationDateUsed: '2018-01-01', orderDate: '2024-01-01' };
    const r = calculatePromotionEligibility(emp, { ...okGate, qualifications: quals, degreeTrackSnapshots: [snap], today: '2026-02-01' });
    expect(r.requiredYears).toBe(2);
  });
});

describe('العقوبات (قانون الانضباط 14/1991 م8)', () => {
  it('قطع الراتب يتدرج بالأيام: 5 أشهر حتى 5 أيام ثم شهر لكل يوم', () => {
    expect(salaryCutDelayMonths(3)).toBe(5);
    expect(salaryCutDelayMonths(5)).toBe(5);
    expect(salaryCutDelayMonths(8)).toBe(8);
    expect(resolvePenaltyDelayMonths({ penaltyType: 'قطع الراتب', days_count: 7 })).toBe(7);
    expect(resolvePenaltyDelayMonths({ penaltyType: 'قطع الراتب (يوم)', days_count: 2 })).toBe(5);
  });

  it('قطع الراتب يأخذ أيام القطع من إعدادات النوع إن لم تُسجل على العقوبة', () => {
    const types = [{ name: 'قطع الراتب', delayMonths: 5, salaryDeductionDays: 10 }];
    expect(resolvePenaltyDelayMonths({ penaltyType: 'قطع الراتب' }, types)).toBe(10);
  });

  it('تنزيل الدرجة ليس تأخير 36 شهراً', () => {
    expect(resolvePenaltyDelayMonths({ penaltyType: 'تنزيل الدرجة' })).toBe(0);
    expect(resolvePenaltyDelayMonths({ penaltyType: 'تنزيل الدرجة' }, [{ name: 'تنزيل الدرجة', delayMonths: 36 }])).toBe(0);
  });

  it('تُقرأ أشهر التأخير من إعدادات أنواع العقوبات', () => {
    const types = [{ name: 'الإنذار', delay_months: 4 }];
    expect(resolvePenaltyDelayMonths({ penaltyType: 'إنذار' }, types)).toBe(4);
  });

  it('العقوبة المقبول الطعن بها لا أثر لها', () => {
    const emp = { id: 1, grade: 7, step: 2, lastPromotionDate: '2022-01-01', lastIncrementDate: '2025-01-01' };
    const pen = { id: 1, penaltyType: 'التوبيخ', penaltyDate: '2025-02-01', status: 'نافذ' };
    const r1 = calculateIncrementEligibility(emp, { penalties: [pen], today: '2025-03-01' });
    expect(r1.penaltyMonthsAdded).toBe(12);
    const r2 = calculateIncrementEligibility(emp, { penalties: [{ ...pen, appeal_status: 'مقبول الطعن' }], today: '2025-03-01' });
    expect(r2.penaltyMonthsAdded).toBe(0);
    const r3 = calculateIncrementEligibility(emp, { penalties: [{ ...pen, appeal_status: 'مرفوض الطعن' }], today: '2025-03-01' });
    expect(r3.penaltyMonthsAdded).toBe(12);
  });
});
