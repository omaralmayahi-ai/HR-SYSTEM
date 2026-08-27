// src/lib/degreeTrackEngine.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateDegreeTrackSimulation,
  resolveDegreeBaseline,
  getAvailableSpecializationCredits,
  calculateExactPeriodMonths,
  DegreeTrackSnapshotEntity,
  SpecializationCreditEntity
} from './degreeTrackEngine';

describe('Phase 2b: Degree Track Recognition Engine (محرك مسار احتساب الشهادات أثناء الخدمة)', () => {

  // 1. الاختبار المرجعي الشامل (Reference Scenario)
  it('1. السيناريو المرجعي الكامل: موظف بدرجة 3 واحتساب بكالوريوس 6 سنوات فترة مقضية -> محاكاة 4 -> عجز دورة واحدة وانطلاق حقيقي لسنتين', () => {
    // موظف بالدرجة 3 والمرحلة 1 فعلياً
    // تخرج 2020، أمر الاحتساب 2026 -> الفترة المقضية = 6 سنوات = 3 دورات محاكاة (7 -> 6 -> 5 -> 4)
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 101,
      qualificationId: 501,
      employeeId: 1,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7, // بكالوريوس
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    // رصيد دورات اختصاص: 8 أسابيع (كافية للمحاكاة والترفيع الحقيقي)
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 1, weeks: 4, courseName: 'دورة هندسية متقدمة 1' },
      { employeeId: 1, weeks: 4, courseName: 'دورة هندسية متقدمة 2' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    // 1. التحقق من حساب الفترة المقضية
    expect(result.spentPeriodYears).toBe(6);
    expect(result.spentPeriodMonths).toBe(72);
    expect(result.isTenYearExceptionApplied).toBe(false);

    // 2. التحقق من خطوات المحاكاة الثلاث
    expect(result.simulationSteps.length).toBe(3);
    expect(result.simulationSteps[0]).toMatchObject({
      fromGrade: 7,
      toGrade: 6,
      computedDate: '2022-01-01',
      weeksConsumed: 2,
      status: 'ممنوح_بالمحاكاة'
    });
    expect(result.simulationSteps[1]).toMatchObject({
      fromGrade: 6,
      toGrade: 5,
      computedDate: '2024-01-01',
      weeksConsumed: 2,
      status: 'ممنوح_بالمحاكاة'
    });
    expect(result.simulationSteps[2]).toMatchObject({
      fromGrade: 5,
      toGrade: 4,
      computedDate: '2026-01-01',
      weeksConsumed: 2,
      status: 'ممنوح_بالمحاكاة'
    });

    // 3. التحقق من الدرجة المحسوبة بالمحاكاة ورصيد الأسابيع
    expect(result.simulatedGradeReached).toBe(4);
    expect(result.specializationWeeksConsumed).toBe(6);
    expect(result.specializationWeeksRemaining).toBe(2);

    // 4. التحقق من كشف العجز (درجة 3 الفعلية أفضل من 4 المحسوبة)
    expect(result.hasDeficit).toBe(true);
    expect(result.deficitCycles).toBe(1);

    // 5. التحقق من ثبات درجة الموظف الحالية وعدم نزولها لـ 4
    expect(result.actualGradeBefore).toBe(3);
    expect(result.realTimeNextPromotion.fromGrade).toBe(3);
    expect(result.realTimeNextPromotion.toGrade).toBe(2);

    // 6. التحقق من نقطة انطلاق السنتين الحقيقيتين (تاريخ الوصول لدرجة 4: 2026-01-01)
    expect(result.realTimeNextPromotion.anchorStartDate).toBe('2026-01-01');
    expect(result.realTimeNextPromotion.baseDurationMonths).toBe(24);
    expect(result.realTimeNextPromotion.nextPromotionDueDate).toBe('2028-01-01');
    expect(result.realTimeNextPromotion.specializationPrerequisiteSatisfied).toBe(true);
  });

  // 2. اختبار تراكم رصيد أسابيع دورات الاختصاص المنفصلة
  it('2. الرصيد التراكمي: تجميع أسابيع منفصلة (أسبوع + أسبوع = أسبوعين) يمنح ترفيعاً واحداً بالمحاكاة', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 102,
      qualificationId: 502,
      employeeId: 2,
      actualGradeBefore: 6,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2022-01-01',
      orderDate: '2026-01-01', // 4 سنوات = دورتان نظرياً
      status: 'نشط'
    };

    // دورات منفصلة: أسبوع واحد + أسبوع واحد = أسبوعين
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 2, weeks: 1, courseName: 'دورة تمهيدية أ' },
      { employeeId: 2, weeks: 1, courseName: 'دورة تمهيدية ب' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    expect(result.totalSpecializationWeeksAvailable).toBe(2);
    // تمنح الدورة الأولى فقط (7 -> 6) لاستهلاك الأسبوعين
    expect(result.simulationSteps[0].status).toBe('ممنوح_بالمحاكاة');
    expect(result.simulationSteps[0].weeksConsumed).toBe(2);
    // الدورة الثانية (6 -> 5) تصبح معلقة لعدم كفاية الرصيد
    expect(result.simulationSteps[1].status).toBe('معلق_لعدم_استيفاء_الدورة');
    expect(result.simulatedGradeReached).toBe(6);
    expect(result.specializationWeeksRemaining).toBe(0);
  });

  // 3. اختبار استهلاك 4 أسابيع رصيد لمنح ترفيعين معاً
  it('3. تراكم 4 أسابيع رصيد يمنح ترفيعين متتاليين بالمحاكاة (7 إلى 5)', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 103,
      qualificationId: 503,
      employeeId: 3,
      actualGradeBefore: 5,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2022-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 3, weeks: 4, courseName: 'دورة تخصصية شاملة 4 أسابيع' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    expect(result.simulationSteps.length).toBe(2);
    expect(result.simulationSteps[0].status).toBe('ممنوح_بالمحاكاة');
    expect(result.simulationSteps[1].status).toBe('ممنوح_بالمحاكاة');
    expect(result.simulatedGradeReached).toBe(5);
    expect(result.specializationWeeksConsumed).toBe(4);
  });

  // 4. اختبار حجب الترفيع الافتراضي عند انعدام رصيد دورة الاختصاص
  it('4. عدم وجود رصيد دورات اختصاص يوقف سلسلة المحاكاة بالكامل عند الدرجة الأساس', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 104,
      qualificationId: 504,
      employeeId: 4,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits: [], // رصيد صفري
      today: '2026-01-01'
    });

    expect(result.totalSpecializationWeeksAvailable).toBe(0);
    expect(result.simulationSteps[0].status).toBe('معلق_لعدم_استيفاء_الدورة');
    expect(result.simulatedGradeReached).toBe(7); // توقف عند الأساس
  });

  // 5. اختبار استثناء الـ 10 سنوات فأكثر مع دورة اختصاص واحدة (أسبوعين)
  it('5. استثناء الـ 10 سنوات فأكثر: فترة مقضية 10 سنوات مع أسبوعين رصيد تمنح أول ترفيعين معاً بدورة واحدة وتعلق الباقي', () => {
    // فترة مقضية 10 سنوات بالتمام والكمال: 2016-01-01 إلى 2026-01-01 = 120 شهراً
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 105,
      qualificationId: 505,
      employeeId: 5,
      actualGradeBefore: 2,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2016-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    // الموظف لديه دورة واحدة فقط (أسبوعان رصيد)
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 5, weeks: 2, courseName: 'دورة اختصاص وحيدة' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    expect(result.isTenYearExceptionApplied).toBe(true);
    expect(result.spentPeriodMonths).toBe(120);

    // الترفيعان الأول والثاني (7->6 و 6->5) ممنوحان معاً باستهلاك الدورة الواحدة
    expect(result.simulationSteps[0]).toMatchObject({
      fromGrade: 7,
      toGrade: 6,
      computedDate: '2018-01-01',
      weeksConsumed: 2,
      isBundled: true,
      status: 'ممنوح_بالمحاكاة'
    });
    expect(result.simulationSteps[1]).toMatchObject({
      fromGrade: 6,
      toGrade: 5,
      computedDate: '2020-01-01',
      weeksConsumed: 0,
      isBundled: true,
      status: 'ممنوح_بالمحاكاة'
    });

    // الترفيع الثالث (5->4) معلق لعدم كفاية الرصيد حسب القاعدة العامة
    expect(result.simulationSteps[2]).toMatchObject({
      fromGrade: 5,
      toGrade: 4,
      computedDate: '2022-01-01',
      status: 'معلق_لعدم_استيفاء_الدورة'
    });

    expect(result.simulatedGradeReached).toBe(5);
    expect(result.specializationWeeksConsumed).toBe(2);
  });

  // 6. اختبار الحد الدقيق لاستثناء الـ 10 سنوات (9 سنوات و 11 شهراً لا تفعل الاستثناء)
  it('6. اختبار الحد للاستثناء: فترة مقضية 9 سنوات و 11 شهراً تخضع للقاعدة العامة بالكامل ولا تفعل الاستثناء', () => {
    // 2016-02-01 إلى 2026-01-01 = 119 شهراً (< 120 شهراً)
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 106,
      qualificationId: 506,
      employeeId: 6,
      actualGradeBefore: 2,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2016-02-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    // دورة واحدة (أسبوعان رصيد)
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 6, weeks: 2, courseName: 'دورة اختصاص وحيدة' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    // الاستثناء غير مفعل
    expect(result.isTenYearExceptionApplied).toBe(false);
    expect(result.spentPeriodMonths).toBe(119);

    // تمنح ترفيعاً واحداً فقط (7 -> 6)، والترفيع الثاني (6 -> 5) معلق
    expect(result.simulationSteps[0].status).toBe('ممنوح_بالمحاكاة');
    expect(result.simulationSteps[0].isBundled).toBe(false);
    expect(result.simulationSteps[1].status).toBe('معلق_لعدم_استيفاء_الدورة');
    expect(result.simulatedGradeReached).toBe(6);
  });

  // 7. اختبار تأثير العقوبات والغياب أثناء مرحلة العجز الحقيقية
  it('7. تأخير موعد الترفيع الحقيقي بالعقوبة والغياب أثناء فترة السنتين الحقيقيتين', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 107,
      qualificationId: 507,
      employeeId: 7,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01', // وصول لدرجة 4 بالمحاكاة في 2026-01-01
      status: 'نشط'
    };

    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 7, weeks: 10, courseName: 'رصيد كافٍ' }
    ];

    // عقوبة إنذار (تأخير 6 أشهر) + غياب 5 أيام بعد 2026-01-01
    const penalties = [
      { employeeId: 7, penaltyType: 'الإنذار', orderDate: '2026-03-01', delayMonths: 6, status: 'نافذ' }
    ];
    const attendances = [
      { employeeId: 7, date: '2026-04-10', status: 'غائب', count: 5 }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      penalties,
      attendances,
      today: '2026-01-01'
    });

    // الانطلاق: 2026-01-01 + 24 شهر + 6 أشهر تأخير + 5 أيام غياب = 2028-07-06
    expect(result.realTimeNextPromotion.anchorStartDate).toBe('2026-01-01');
    expect(result.realTimeNextPromotion.penaltiesDelayMonths).toBe(6);
    expect(result.realTimeNextPromotion.absenceDaysAdded).toBe(5);
    expect(result.realTimeNextPromotion.nextPromotionDueDate).toBe('2028-07-06');
  });

  // 8. اختبار الإجازة الموقفة أثناء مرحلة العجز الحقيقية
  it('8. إيقاف الترفيع الحقيقي بصفة "موقوف بإجازة" عند وجود إجازة موقفة سارية', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 108,
      qualificationId: 508,
      employeeId: 8,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 8, weeks: 8, courseName: 'رصيد كافٍ' }
    ];

    const leaves = [
      {
        employeeId: 8,
        leaveType: 'إجازة رعاية خاصة',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        administrativeEffect: 'يوقف_الترفيع',
        status: 'موافق_عليها'
      }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      leaves,
      today: '2026-06-01'
    });

    expect(result.realTimeNextPromotion.activePausingLeave).toBe(true);
    expect(result.realTimeNextPromotion.eligibilityStatus).toBe('موقوف_بإجازة');
    expect(result.realTimeNextPromotion.isEligible).toBe(false);
  });

  // 9. اختبار ثبات نقطة الانطلاق من تاريخ المحاكاة وليس تاريخ صدور الأمر المتأخر
  it('9. مبدأ ثبات نقطة الانطلاق: السنتان الحقيقيتان تبدآن من تاريخ ترفيع المحاكاة وليس من تاريخ صدور الأمر الإداري المتأخر', () => {
    // تخرج 2018، أمر الاحتساب صدر في 2024-06-01 (فترة مقضية 6.5 سنوات -> 3 دورات محاكاة)
    // وصول لدرجة 4 بالمحاكاة في 2024-01-01
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 109,
      qualificationId: 509,
      employeeId: 9,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2018-01-01',
      orderDate: '2024-06-01', // أمر صدر بمنتصف 2024 بعد اكتمال الـ 3 دورات
      status: 'نشط'
    };

    // 8 أسابيع رصيد: 6 أسابيع للمحاكاة (3 دورات) + أسبوعان للترفيع الحقيقي
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 9, weeks: 8, courseName: 'رصيد 8 أسابيع' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-06-01'
    });

    // تاريخ آخر ترفيع محاكاة هو 2024-01-01
    expect(result.lastSimulatedPromotionDate).toBe('2024-01-01');
    // الاستحقاق الحقيقي لسنتين يبدأ من 2024-01-01 ويستحق في 2026-01-01
    expect(result.realTimeNextPromotion.anchorStartDate).toBe('2024-01-01');
    expect(result.realTimeNextPromotion.nextPromotionDueDate).toBe('2026-01-01');
    // بما أن تاريخ اليوم 2026-06-01 هو بعد 2026-01-01 -> مستحق للترفيع
    expect(result.realTimeNextPromotion.eligibilityStatus).toBe('مستحق_للترفيع');
    expect(result.realTimeNextPromotion.isEligible).toBe(true);
  });

  // 10. اختبار دقة تعيين الدرجة الأساس ومرحلة الأساس القانونية للشهادات
  it('10. مطابقة الدرجة الأساس القانونية ومرحلة الأساس لمختلف التحصيلات الدراسية', () => {
    expect(resolveDegreeBaseline('دكتوراه هندسة')).toEqual({ grade: 5, step: 1 });
    expect(resolveDegreeBaseline('ماجستير علوم حاسوب')).toEqual({ grade: 6, step: 1 });
    expect(resolveDegreeBaseline('دبلوم عالي')).toEqual({ grade: 6, step: 1 });
    expect(resolveDegreeBaseline('بكالوريوس قانون')).toEqual({ grade: 7, step: 1 });
    expect(resolveDegreeBaseline('بكالوريوس هندسة')).toEqual({ grade: 7, step: 2 });
    expect(resolveDegreeBaseline('بكالوريوس طب عام')).toEqual({ grade: 7, step: 3 });
    expect(resolveDegreeBaseline('دبلوم فني')).toEqual({ grade: 8, step: 1 });
    expect(resolveDegreeBaseline('إعدادية علمي')).toEqual({ grade: 8, step: 1 });
    expect(resolveDegreeBaseline('متوسطة')).toEqual({ grade: 9, step: 1 });
    expect(resolveDegreeBaseline('ابتدائية')).toEqual({ grade: 10, step: 1 });
  });

});
