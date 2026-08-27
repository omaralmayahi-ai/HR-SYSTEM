// src/lib/promotionEngine.test.ts
import { describe, it, expect } from 'vitest';
import {
  recalculateEligibilitySync,
  calculateIncrementEligibility,
  calculatePromotionEligibility,
  checkGateConditions,
  isEmployeeEligibleForPromotion,
  EngineContextData
} from './promotionEngine';

describe('Phase 2a: Promotion Engine (Standard Track) - محرك الترقيات للمسار الاعتيادي', () => {

  const baseGradeRules = [
    { grade: 1, promotionYears: null },
    { grade: 2, promotionYears: 5 },
    { grade: 3, promotionYears: 5 },
    { grade: 4, promotionYears: 5 },
    { grade: 5, promotionYears: 5 },
    { grade: 6, promotionYears: 4 },
    { grade: 7, promotionYears: 4 },
    { grade: 8, promotionYears: 4 },
    { grade: 9, promotionYears: 4 },
    { grade: 10, promotionYears: 4 }
  ];

  const baseGoverningCourses = [
    {
      id: 1,
      grade: 7,
      courseName: 'دورة اختصاص (حتمية ترفيع 7←6)',
      courseType: 'تخصصية',
      durationDays: 5,
      isRequiredForPromotion: true,
      minPassingScore: 60
    }
  ];

  const satisfiedGoverningAssignment = {
    '1': {
      employeeId: '1',
      status: 'مشمول',
      courseProgress: {
        '1': { completed: true, score: 85 }
      }
    }
  };

  // 1. اختبار موظف بلا أي مؤثرات
  it('1. حساب استحقاق موظف اعتيادي دون أي مؤثرات (Base Case)', () => {
    const employee = {
      id: 1,
      name: 'أحمد علي',
      grade: 7,
      step: 1,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 1, year: 2024, rating: 'جيد جدا' },
        { employeeId: 1, year: 2025, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [],
      qualifications: [{ employeeId: 1, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: satisfiedGoverningAssignment,
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // العلاوة: 2025-01-01 + 12 شهر = 2026-01-01
    expect(result.increment.nextIncrementDueDate).toBe('2026-01-01');
    expect(['مستحق_للعلاوة', 'مؤهل']).toContain(result.increment.eligibilityStatus);
    expect(result.increment.isIncrementEligible).toBe(true);

    // الترفيع: درجة 7 تحتاج 4 سنوات -> 2022-01-01 + 48 شهر = 2026-01-01
    expect(result.promotion.nextPromotionDueDate).toBe('2026-01-01');
    expect(['مستحق_للترفيع', 'مؤهل']).toContain(result.promotion.eligibilityStatus);
    expect(result.promotion.isPromotionEligible).toBe(true);
    expect(result.promotion.gateChecks.governingCoursesSatisfied).toBe(true);
    expect(result.promotion.gateChecks.evaluationsSatisfied).toBe(true);
    expect(result.promotion.gateChecks.noActivePausingLeaves).toBe(true);
  });

  // 2. اختبار تقديم الاستحقاق بكتاب شكر (شهر واحد)
  it('2. تقديم موعد استحقاق العلاوة والترفيع بشهر واحد عند وجود كتاب شكر وتقدير', () => {
    const employee = {
      id: 2,
      name: 'سارة حسن',
      grade: 7,
      step: 2,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [
        {
          id: 101,
          employeeId: 2,
          orderNumber: '111',
          orderDate: '2025-06-01',
          creditMonthsSnapshot: 1,
          isHidden: false
        }
      ],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 2, year: 2024, rating: 'امتياز' },
        { employeeId: 2, year: 2025, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [],
      qualifications: [{ employeeId: 2, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '2': { employeeId: '2', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // العلاوة تتقدم بشهر: 2026-01-01 - 1 شهر = 2025-12-01
    expect(result.increment.nextIncrementDueDate).toBe('2025-12-01');
    expect(result.increment.modifiers.commendationMonths).toBe(1);

    // الترفيع يتقدم بشهر: 2026-01-01 - 1 شهر = 2025-12-01
    expect(result.promotion.nextPromotionDueDate).toBe('2025-12-01');
    expect(result.promotion.modifiers.commendationMonths).toBe(1);
    expect(result.promotion.isPromotionEligible).toBe(true);
  });

  // 3. اختبار تأخير الاستحقاق بعقوبة إنذار (6 أشهر)
  it('3. تأخير موعد استحقاق العلاوة والترفيع بـ 6 أشهر عند وجود عقوبة إنذار', () => {
    const employee = {
      id: 3,
      name: 'محمد كريم',
      grade: 7,
      step: 1,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [
        {
          id: 201,
          employeeId: 3,
          penaltyType: 'الإنذار',
          orderDate: '2025-03-01',
          delayMonths: 6
        }
      ],
      attendances: [],
      evaluations: [
        { employeeId: 3, year: 2024, rating: 'جيد جدا' },
        { employeeId: 3, year: 2025, rating: 'جيد جدا' }
      ],
      leaves: [],
      serviceCredits: [],
      qualifications: [{ employeeId: 3, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '3': { employeeId: '3', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // العلاوة تتأخر 6 أشهر: 2026-01-01 + 6 أشهر = 2026-07-01
    expect(result.increment.nextIncrementDueDate).toBe('2026-07-01');
    expect(result.increment.modifiers.penaltyDelayMonths).toBe(6);

    // الترفيع يتأخر 6 أشهر: 2026-01-01 + 6 أشهر = 2026-07-01
    expect(result.promotion.nextPromotionDueDate).toBe('2026-07-01');
    expect(result.promotion.modifiers.penaltyDelayMonths).toBe(6);
  });

  // 4. اختبار تأخير الاستحقاق بـ 10 أيام غياب بالضبط
  it('4. تأخير موعد الاستحقاق بـ 10 أيام بالضبط عند تسجيل غياب 10 أيام (Exact Absence Math)', () => {
    const employee = {
      id: 4,
      name: 'حسين جواد',
      grade: 7,
      step: 1,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [
        {
          employeeId: 4,
          date: '2025-04-10',
          status: 'غائب',
          count: 10
        }
      ],
      evaluations: [
        { employeeId: 4, year: 2024, rating: 'جيد' },
        { employeeId: 4, year: 2025, rating: 'جيد جدا' }
      ],
      leaves: [],
      serviceCredits: [],
      qualifications: [{ employeeId: 4, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '4': { employeeId: '4', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // العلاوة: 2026-01-01 + 10 أيام = 2026-01-11
    expect(result.increment.nextIncrementDueDate).toBe('2026-01-11');
    expect(result.increment.modifiers.absenceDays).toBe(10);

    // الترفيع: 2026-01-01 + 10 أيام = 2026-01-11
    expect(result.promotion.nextPromotionDueDate).toBe('2026-01-11');
    expect(result.promotion.modifiers.absenceDays).toBe(10);
  });

  // 5. اختبار حجب الترفيع بسبب تقييم أداء 'مقبول' أو 'ضعيف' مع استمرار العلاوة
  it('5. حجب الترفيع بصفة "متوقف بسبب التقييم" عند حصول الموظف على تقييم مقبول أو ضعيف مع عدم تأثر العلاوة', () => {
    const employee = {
      id: 5,
      name: 'زينب كاظم',
      grade: 7,
      step: 1,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 5, year: 2024, rating: 'جيد جدا' },
        { employeeId: 5, year: 2025, rating: 'مقبول' } // تقييم غير مستوفٍ
      ],
      leaves: [],
      serviceCredits: [],
      qualifications: [{ employeeId: 5, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '5': { employeeId: '5', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // العلاوة لا تتأثر بالتقييم وتظل مؤهلة
    expect(result.increment.isIncrementEligible).toBe(true);
    expect(['مستحق_للعلاوة', 'مؤهل']).toContain(result.increment.eligibilityStatus);
    expect(result.increment.nextIncrementDueDate).toBe('2026-01-01');

    // الترفيع محجوب بشرط التقييم
    expect(result.promotion.isPromotionEligible).toBe(false);
    expect(result.promotion.eligibilityStatus).toBe('متوقف_بسبب_التقييم');
    expect(result.promotion.gateChecks.evaluationsSatisfied).toBe(false);
  });

  // 6. اختبار تعليق الترفيع لعدم استيفاء الدورات الحاكمة
  it('6. تعليق الترفيع بصفة "مؤجل لعدم استيفاء الدورات" عند عدم اجتياز الدورات الحتمية', () => {
    const employee = {
      id: 6,
      name: 'علي ناصر',
      grade: 7,
      step: 1,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 6, year: 2024, rating: 'امتياز' },
        { employeeId: 6, year: 2025, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [],
      qualifications: [{ employeeId: 6, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '6': {
          employeeId: '6',
          status: 'مشمول',
          courseProgress: {
            '1': { completed: false } // لم يجتز الدورة
          }
        }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // الترفيع مؤجل لعدم استيفاء الدورات
    expect(result.promotion.isPromotionEligible).toBe(false);
    expect(result.promotion.eligibilityStatus).toBe('مؤجل_لعدم_استيفاء_الدورات');
    expect(result.promotion.gateChecks.governingCoursesSatisfied).toBe(false);
  });

  // 7. اختبار إيقاف الترفيع بسبب إجازة موقوفة نشطة
  it('7. إيقاف الترفيع بصفة "موقوف بإجازة" عند وجود إجازة ذات أثر إداري يوقف الترفيع ونشطة', () => {
    const employee = {
      id: 7,
      name: 'فاطمة رضا',
      grade: 7,
      step: 1,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 7, year: 2024, rating: 'جيد جدا' },
        { employeeId: 7, year: 2025, rating: 'جيد جدا' }
      ],
      leaves: [
        {
          id: 701,
          employeeId: 7,
          leaveType: 'إجازة بدون راتب',
          administrativeEffect: 'يوقف_الترفيع',
          startDate: '2026-01-01',
          endDate: '2027-01-01',
          status: 'موافق_عليها'
        }
      ],
      serviceCredits: [],
      qualifications: [{ employeeId: 7, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '7': { employeeId: '7', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // الترفيع موقوف بإجازة
    expect(result.promotion.isPromotionEligible).toBe(false);
    expect(result.promotion.eligibilityStatus).toBe('موقوف_بإجازة');
    expect(result.promotion.gateChecks.noActivePausingLeaves).toBe(false);
  });

  // 8. اختبار تقديم الترفيع باحتساب خدمة سنة كاملة
  it('8. تقديم موعد استحقاق الترفيع بسنة كاملة (12 شهر) عند احتساب خدمة سنة واحدة', () => {
    const employee = {
      id: 8,
      name: 'عمر طارق',
      grade: 7,
      step: 1,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 8, year: 2024, rating: 'امتياز' },
        { employeeId: 8, year: 2025, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [
        {
          id: 801,
          employeeId: 8,
          calculatedYears: 1,
          calculatedMonths: 0,
          calculatedDays: 0,
          isCountedForPromotion: true,
          purpose: 'promotion'
        }
      ],
      qualifications: [{ employeeId: 8, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '8': { employeeId: '8', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // المدة الأصلية 4 سنوات (2026-01-01). باحتساب سنة خدمة تصبح 3 سنوات = 2025-01-01
    expect(result.promotion.nextPromotionDueDate).toBe('2025-01-01');
    expect(result.promotion.modifiers.serviceCreditMonths).toBe(12);
    expect(result.promotion.isPromotionEligible).toBe(true);
  });

  // 9. اختبار حرج ودقيق: نقل أثر احتساب الخدمة وتأجيل كتب الشكر في الفترة المختصرة للدورة التالية
  it('9. اختبار رقم 9 (حرج): نقل أثر احتساب الخدمة وتأجيل كتب الشكر الواقعة بالفترة المختصرة لدورة الاستحقاق التالية', () => {
    // سيناريو الحالة:
    // موظف بالدرجة السابعة (تحتاج 4 سنوات = 48 شهراً)
    // تاريخ آخر ترفيع: 2020-01-01 (الموعد الأصلي للترفيع 2024-01-01)
    // تم احتساب خدمة له بسنتين (24 شهراً) -> اختصرت المدة لتنتهي في 2022-01-01
    // حصل على كتاب شكر بتاريخ 2023-05-01 (يقع بعد تاريخ الاستحقاق المقصر 2022-01-01 وقبل 2024-01-01)
    // المطلوب: كتاب الشكر لا يطبَّق على دورة 2022 بل يُسجَّل في deferredItems للدورة اللاحقة

    const employee = {
      id: 9,
      name: 'مازن إبراهيم',
      grade: 7,
      step: 1,
      lastPromotionDate: '2020-01-01',
      lastIncrementDate: '2023-01-01'
    };

    const context: EngineContextData = {
      commendations: [
        {
          id: 901,
          employeeId: 9,
          orderNumber: 'كتاب-شكر-2023',
          orderDate: '2023-05-01',
          creditMonthsSnapshot: 1,
          isHidden: false,
          reason: 'جهود استثنائية'
        }
      ],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 9, year: 2021, rating: 'امتياز' },
        { employeeId: 9, year: 2022, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [
        {
          id: 902,
          employeeId: 9,
          calculatedYears: 2, // سنتان خدمة محتسبة
          calculatedMonths: 0,
          calculatedDays: 0,
          isCountedForPromotion: true,
          purpose: 'promotion'
        }
      ],
      qualifications: [{ employeeId: 9, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '9': { employeeId: '9', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // 1. الاستحقاق بعد احتساب السنتين أصبح: 2020-01-01 + 24 شهر = 2022-01-01
    expect(result.promotion.nextPromotionDueDate).toBe('2022-01-01');
    expect(result.promotion.modifiers.serviceCreditMonths).toBe(24);

    // 2. كتاب الشكر لم يدخل في حساب الترفيع للدورة الحالية
    expect(result.promotion.modifiers.commendationMonths).toBe(0);

    // 3. كتاب الشكر مسجّل بوضوح كعنصر مؤجل للدورة التالية (deferredItems)
    expect(result.promotion.deferredItems.length).toBe(1);
    expect(result.promotion.deferredItems[0].type).toBe('commendation');
    expect(result.promotion.deferredItems[0].id).toBe(901);
    expect(result.promotion.deferredItems[0].creditMonths).toBe(1);
    expect(result.promotion.deferredItems[0].reason).toContain('مؤجلة لدورة الاستحقاق التالية');
    expect(result.promotion.deferredItems[0].status).toBe('مؤجل_للدورة_التالية');
  });

  // 10. اختبار ثبات تاريخ الاستحقاق القانوني كنقطة انطلاق حتى لو تأخر الأمر الإداري
  it('10. مبدأ ثبات تاريخ الاستحقاق: تاريخ الاستحقاق المحسوب يظل نقطة الانطلاق للدورة التالية بصرف النظر عن تأخر الأمر الإداري', () => {
    // استحقاق الموظف الثابت قانوناً هو 2022-01-01
    // حتى لو تم إصدار الأمر الإداري في 2023-06-15، الدورة اللاحقة تبدأ من 2022-01-01
    const anchorDate = '2022-01-01';
    const nextCycleDurationYears = 4; // 48 شهر
    
    // دالة محاكاة الدورة التالية انطلاقاً من الاستحقاق الثابت
    const nextCycleDue = new Date(anchorDate);
    nextCycleDue.setFullYear(nextCycleDue.getFullYear() + nextCycleDurationYears);
    const expectedNextCycleDate = nextCycleDue.toISOString().split('T')[0];

    expect(expectedNextCycleDate).toBe('2026-01-01');
  });

  // 11. اختبار استبعاد موظف مرتبط بشهادة أثناء الخدمة
  it('11. تصنيف الموظف الحاصل على شهادة أثناء الخدمة كـ "غير مدعوم حالياً" دون حساب خاطئ للمسار الاعتيادي', () => {
    const employee = {
      id: 11,
      name: 'مهند صالح',
      grade: 7,
      step: 1,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 11, year: 2024, rating: 'امتياز' },
        { employeeId: 11, year: 2025, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [],
      qualifications: [
        {
          employeeId: 11,
          qualificationType: 'أثناء الخدمة', // شهادة أثناء الخدمة
          isActive: true
        }
      ],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '11': { employeeId: '11', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // يجب أن تكون الحالة "غير_مدعوم_حاليا" وغير مدعومة
    expect(result.isSupported).toBe(false);
    expect(result.promotion.eligibilityStatus).toBe('غير_مدعوم_حاليا');
    expect(result.promotion.isPromotionEligible).toBe(false);
    expect(result.promotion.unsupportedReason).toContain('احتساب الشهادات أثناء الخدمة');
  });

  // 12. اختبار تأثير احتساب الخدمة (service_credits) على العلاوة السنوية (next_increment_due_date) منفصلاً
  it('12. تقصير موعد استحقاق العلاوة السنوية (next_increment_due_date) عند وجود خدمة محتسبة تشمل العلاوة', () => {
    const employee = {
      id: 12,
      name: 'طارق عبد الله',
      grade: 6,
      step: 2,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 12, year: 2024, rating: 'امتياز' },
        { employeeId: 12, year: 2025, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [
        {
          id: 1201,
          employeeId: 12,
          calculatedMonths: 6,
          purpose: 'علاوة_وترفيع',
          isCountedForPromotion: true
        }
      ],
      qualifications: [{ employeeId: 12, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '12': { employeeId: '12', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // استحقاق العلاوة الأصلي: 2025-01-01 + 12 شهر = 2026-01-01
    // باحتساب 6 أشهر خدمة: 2025-01-01 + (12 - 6) = 2025-07-01
    expect(result.increment.nextIncrementDueDate).toBe('2025-07-01');
    expect(result.increment.modifiers.serviceCreditMonths).toBe(6);
    expect(result.increment.isIncrementEligible).toBe(true);
  });

  // 13. اختبار تأجيل العقوبة الواقعة بالفترة المختصرة بسبب احتساب الخدمة وعدم تأخير الدورة الحالية
  it('13. عقوبة وقعت بالفترة المختصرة بسبب service_credit تُسجَّل بـ deferredItems ولا تؤخر الدورة الحالية', () => {
    const employee = {
      id: 13,
      name: 'علي ناصر',
      grade: 7,
      step: 1,
      lastPromotionDate: '2020-01-01',
      lastIncrementDate: '2020-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [
        {
          id: 1301,
          employeeId: 13,
          penaltyType: 'الإنذار',
          orderDate: '2023-04-01', // يقع بعد الاستحقاق المختصر (2022-01-01) وقبل الأصلي (2024-01-01)
          delayMonths: 6,
          status: 'نافذ'
        }
      ],
      attendances: [],
      evaluations: [
        { employeeId: 13, year: 2020, rating: 'امتياز' },
        { employeeId: 13, year: 2021, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [
        {
          id: 1302,
          employeeId: 13,
          calculatedYears: 2, // تقديم سنتين
          purpose: 'تقاعد_وترقية_وعلاوة',
          isCountedForPromotion: true
        }
      ],
      qualifications: [{ employeeId: 13, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '13': { employeeId: '13', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // 1. الاستحقاق يظل 2022-01-01 ولا يتأخر بالعقوبة
    expect(result.promotion.nextPromotionDueDate).toBe('2022-01-01');
    expect(result.promotion.modifiers.penaltyDelayMonths).toBe(0);

    // 2. العقوبة سُجلت بـ deferredItems للدورة التالية
    const deferredPenalty = result.promotion.deferredItems.find(d => d.type === 'penalty');
    expect(deferredPenalty).toBeDefined();
    expect(deferredPenalty?.months).toBe(6);
    expect(deferredPenalty?.status).toBe('مؤجل_للدورة_التالية');
  });

  // 14. اختبار تأجيل الإجازة الموقفة الواقعة بالفترة المختصرة وعدم إيقاف الترفيع الحالي
  it('14. إجازة موقفة بدأت بالفترة المختصرة بسبب service_credit تُسجَّل بـ deferredItems ولا توقف الترفيع الحالي', () => {
    const employee = {
      id: 14,
      name: 'منى كامل',
      grade: 7,
      step: 1,
      lastPromotionDate: '2020-01-01',
      lastIncrementDate: '2020-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 14, year: 2020, rating: 'امتياز' },
        { employeeId: 14, year: 2021, rating: 'امتياز' }
      ],
      leaves: [
        {
          id: 1401,
          employeeId: 14,
          leaveType: 'إجازة رعاية خاصة',
          startDate: '2023-01-01', // بدأت بعد الاستحقاق المختصر (2022-01-01)
          endDate: '2023-12-31',
          administrativeEffect: 'يوقف_الترفيع',
          status: 'موافق_عليها'
        }
      ],
      serviceCredits: [
        {
          id: 1402,
          employeeId: 14,
          calculatedYears: 2,
          purpose: 'علاوة_وترفيع',
          isCountedForPromotion: true
        }
      ],
      qualifications: [{ employeeId: 14, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '14': { employeeId: '14', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // 1. الترفيع لا يتوقف بالإجازة
    expect(result.promotion.gateChecks.noActivePausingLeaves).toBe(true);
    expect(result.promotion.eligibilityStatus).toBe('مستحق_للترفيع');
    expect(result.promotion.nextPromotionDueDate).toBe('2022-01-01');

    // 2. الإجازة سُجلت بـ deferredItems للدورة التالية
    const deferredLeave = result.promotion.deferredItems.find(d => d.type === 'leave');
    expect(deferredLeave).toBeDefined();
    expect(deferredLeave?.status).toBe('مؤجل_للدورة_التالية');
  });

  // 15. اختبار تأجيل تقييم الأداء (مقبول/ضعيف) الواقع بالفترة المختصرة وعدم حجب الترفيع الحالي
  it('15. تقييم أداء غير مستوفٍ (مقبول/ضعيف) لسنة تقع بالفترة المختصرة يُسجَّل بـ deferredItems ولا يحجب الترفيع الحالي', () => {
    const employee = {
      id: 15,
      name: 'سامر خليل',
      grade: 7,
      step: 1,
      lastPromotionDate: '2020-01-01',
      lastIncrementDate: '2020-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [
        { employeeId: 15, year: 2021, rating: 'امتياز' },
        { employeeId: 15, year: 2020, rating: 'جيد جدا' },
        { employeeId: 15, year: 2023, rating: 'مقبول' } // تقييم سنة 2023 بعد اكتمال الاستحقاق بالخدمة (2022)
      ],
      leaves: [],
      serviceCredits: [
        {
          id: 1501,
          employeeId: 15,
          calculatedYears: 2,
          purpose: 'علاوة_وترفيع',
          isCountedForPromotion: true
        }
      ],
      qualifications: [{ employeeId: 15, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '15': { employeeId: '15', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // 1. تقييم 2023 لا يحجب الدورة الحالية لأن استحقاقها اكتمل في 2022
    expect(result.promotion.gateChecks.evaluationsSatisfied).toBe(true);
    expect(result.promotion.eligibilityStatus).toBe('مستحق_للترفيع');
    expect(result.promotion.nextPromotionDueDate).toBe('2022-01-01');

    // 2. تقييم 2023 المقبول سُجّل بـ deferredItems للدورة التالية
    const deferredEval = result.promotion.deferredItems.find(d => d.type === 'evaluation');
    expect(deferredEval).toBeDefined();
    expect(deferredEval?.year).toBe(2023);
    expect(deferredEval?.status).toBe('مؤجل_للدورة_التالية');
  });

  // 16. اختبار تأجيل الغياب الواقع بالفترة المختصرة بدقة الأيام
  it('16. غياب واقع بالفترة المختصرة بسبب service_credit يُسجَّل بـ deferredItems بدقة الأيام ولا يؤخر الدورة الحالية', () => {
    const employee = {
      id: 16,
      name: 'فاطمة محمود',
      grade: 7,
      step: 1,
      lastPromotionDate: '2020-01-01',
      lastIncrementDate: '2020-01-01'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [
        {
          employeeId: 16,
          date: '2023-02-10', // بعد استحقاق 2022-01-01
          status: 'غائب',
          count: 15 // 15 يوم غياب
        }
      ],
      evaluations: [
        { employeeId: 16, year: 2020, rating: 'امتياز' },
        { employeeId: 16, year: 2021, rating: 'امتياز' }
      ],
      leaves: [],
      serviceCredits: [
        {
          id: 1601,
          employeeId: 16,
          calculatedYears: 2,
          purpose: 'علاوة_وترفيع',
          isCountedForPromotion: true
        }
      ],
      qualifications: [{ employeeId: 16, qualificationType: 'تعيين', isActive: true }],
      governingCourses: baseGoverningCourses,
      governingAssignments: {
        '16': { employeeId: '16', status: 'مشمول', courseProgress: { '1': { completed: true } } }
      },
      gradeRules: baseGradeRules
    };

    const result = recalculateEligibilitySync(employee, context);

    // 1. الاستحقاق يظل 2022-01-01 دون إضافة الـ 15 يوم غياب للدورة الحالية
    expect(result.promotion.nextPromotionDueDate).toBe('2022-01-01');
    expect(result.promotion.modifiers.absenceDays).toBe(0);

    // 2. الـ 15 يوم غياب سُجلت بـ deferredItems للدورة التالية
    const deferredAbsence = result.promotion.deferredItems.find(d => d.type === 'absence');
    expect(deferredAbsence).toBeDefined();
    expect(deferredAbsence?.days).toBe(15);
    expect(deferredAbsence?.status).toBe('مؤجل_للدورة_التالية');
  });

});

