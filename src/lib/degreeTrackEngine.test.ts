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

  // ============================================================================
  // الاختبار 1: السيناريو المرجعي الكامل
  // ============================================================================
  it('1. السيناريو المرجعي الكامل: موظف بدرجة 3، شهادة تعيد لدرجة أساس 7، فترة مقضية 6 سنوات، رصيد كافٍ لـ3 ترفيعات -> محاكاة 4، عجز دورة، وثبات درجة الموظف الفعلية 3', () => {
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

    // رصيد دورات اختصاص: 8 أسابيع (كافية للمحاكاة بـ6 أسابيع + أسبوعين للترفيع الحقيقي)
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 1, weeks: 4, courseName: 'دورة هندسية متقدمة 1' },
      { employeeId: 1, weeks: 4, courseName: 'دورة هندسية متقدمة 2' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    // 1. التحقق من حساب الفترة المقضية بدقة
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
    expect(result.snapshotStatus).toBe('نشط');

    // 5. التحقق من ثبات درجة الموظف الفعلية بالنظام (تبقى 3 دون أي تغيير)
    expect(result.actualGradeBefore).toBe(3);
    expect(result.realTimeNextPromotion.fromGrade).toBe(3);
    expect(result.realTimeNextPromotion.toGrade).toBe(2);

    // 6. التحقق من نقطة انطلاق السنتين الحقيقيتين (تاريخ الوصول لدرجة 4 بالمحاكاة: 2026-01-01)
    expect(result.realTimeNextPromotion.anchorStartDate).toBe('2026-01-01');
    expect(result.realTimeNextPromotion.baseDurationMonths).toBe(24);
    expect(result.realTimeNextPromotion.nextPromotionDueDate).toBe('2028-01-01');
    expect(result.realTimeNextPromotion.specializationPrerequisiteSatisfied).toBe(true);
  });

  // ============================================================================
  // الاختبار 2: رصيد أسابيع غير كافٍ
  // ============================================================================
  it('2. رصيد أسابيع غير كافٍ: فترة مقضية تكفي لـ3 دورات زمنياً لكن رصيد الاختصاص يكفي لدورتين فقط -> يتوقف عند دورتين', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 102,
      qualificationId: 502,
      employeeId: 2,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01', // 6 سنوات = 3 دورات زمنياً
      status: 'نشط'
    };

    // رصيد يكفي لدورتين فقط (4 أسابيع)
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 2, weeks: 4, courseName: 'دورة 4 أسابيع' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    expect(result.simulationSteps.length).toBe(3);
    expect(result.simulationSteps[0].status).toBe('ممنوح_بالمحاكاة');
    expect(result.simulationSteps[1].status).toBe('ممنوح_بالمحاكاة');
    expect(result.simulationSteps[2].status).toBe('معلق_لعدم_استيفاء_الدورة');
    expect(result.simulatedGradeReached).toBe(5); // توقف عند الدرجة 5 بدل 4
    expect(result.specializationWeeksConsumed).toBe(4);
    expect(result.specializationWeeksRemaining).toBe(0);
  });

  // ============================================================================
  // الاختبار 3: رصيد تراكمي من دورات متعددة غير متواصلة
  // ============================================================================
  it('3. رصيد تراكمي من دورات متعددة غير متواصلة (أسبوع + أسبوع = أسبوعين) يمنح ترفيعاً واحداً بالمحاكاة', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 103,
      qualificationId: 503,
      employeeId: 3,
      actualGradeBefore: 6,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2022-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    // دورات في تواريخ وأماكن مختلفة: أسبوع + أسبوع
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 3, weeks: 1, courseDate: '2023-05-01', courseName: 'دورة ورشة عمل أ' },
      { employeeId: 3, weeks: 1, courseDate: '2024-11-15', courseName: 'دورة ورشة عمل ب' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    expect(result.totalSpecializationWeeksAvailable).toBe(2);
    expect(result.simulationSteps[0].status).toBe('ممنوح_بالمحاكاة');
    expect(result.simulationSteps[0].weeksConsumed).toBe(2);
    expect(result.simulationSteps[1].status).toBe('معلق_لعدم_استيفاء_الدورة');
    expect(result.simulatedGradeReached).toBe(6);
  });

  // ============================================================================
  // الاختبار 4: رصيد كافٍ لترفيعين دفعة واحدة (4 أسابيع)
  // ============================================================================
  it('4. رصيد كافٍ لترفيعين دفعة واحدة (4 أسابيع) يمنح ترفيعين متتاليين بالمحاكاة من 7 إلى 5', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 104,
      qualificationId: 504,
      employeeId: 4,
      actualGradeBefore: 5,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2022-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 4, weeks: 4, courseName: 'دورة تخصصية شاملة 4 أسابيع' }
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

  // ============================================================================
  // الاختبار 5: عقوبة وقعت أثناء الفترة المقضية (المحاكاة)
  // ============================================================================
  it('5. عقوبة وقعت أثناء الفترة المقضية (المحاكاة) تؤثر فوراً بإضافة تأخير ولا تُتجاهل ولا تُؤجَّل', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 105,
      qualificationId: 505,
      employeeId: 5,
      actualGradeBefore: 5,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2024-01-01',
      status: 'نشط'
    };

    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 5, weeks: 4, courseName: 'رصيد كافٍ' }
    ];

    // عقوبة توبيخ (تأخير 6 أشهر) صادرة في 2021-06-01 أثناء الدورة الأولى (2020-2022)
    const penalties = [
      { employeeId: 5, penaltyType: 'توبيخ', orderDate: '2021-06-01', delayMonths: 6, status: 'نافذ' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      penalties,
      today: '2026-01-01'
    });

    // الدورة الأولى تأخر موعدها المحسوب من 2022-01-01 إلى 2022-07-01 (إضافة 6 أشهر)
    expect(result.simulationSteps[0].computedDate).toBe('2022-07-01');
    expect(result.simulationSteps[0].notes).toContain('تأخير 6 شهر بسبب عقوبة نافذة');
  });

  // ============================================================================
  // الاختبار 6: تقييم أداء "مقبول" أثناء الفترة المقضية
  // ============================================================================
  it('6. تقييم أداء (مقبول / ضعيف) وقع أثناء الفترة المقضية لا يؤثر إطلاقاً على المحاكاة ويُتجاهل بالكامل', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 106,
      qualificationId: 506,
      employeeId: 6,
      actualGradeBefore: 5,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2022-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 6, weeks: 4, courseName: 'رصيد كافٍ' }
    ];

    const evaluations = [
      { employeeId: 6, year: 2023, rating: 'مقبول', score: 62 },
      { employeeId: 6, year: 2024, rating: 'ضعيف', score: 45 }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      evaluations,
      today: '2026-01-01'
    });

    // المحاكاة تستمر بدون أي تأخير أو تعليق
    expect(result.simulationSteps[0].computedDate).toBe('2024-01-01');
    expect(result.simulationSteps[1].computedDate).toBe('2026-01-01');
    expect(result.simulatedGradeReached).toBe(5);
  });

  // ============================================================================
  // الاختبار 7: كتاب شكر وقع أثناء الفترة المقضية
  // ============================================================================
  it('7. كتاب شكر وتقدير وقع أثناء الفترة المقضية لا يسرّع المحاكاة إطلاقاً ويُتجاهل بالكامل', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 107,
      qualificationId: 507,
      employeeId: 7,
      actualGradeBefore: 5,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2022-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 7, weeks: 4, courseName: 'رصيد كافٍ' }
    ];

    const commendations = [
      { employeeId: 7, orderNumber: '1122', orderDate: '2023-06-01', months: 1 }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      commendations: commendations as any,
      today: '2026-01-01'
    });

    // المدة تبقى سنتين كاملتين (24 شهراً) لكل دورة محاكاة
    expect(result.simulationSteps[0].computedDate).toBe('2024-01-01');
    expect(result.simulationSteps[1].computedDate).toBe('2026-01-01');
  });

  // ============================================================================
  // الاختبار 8: إجازة موقفة وقعت أثناء المرحلة الحقيقية
  // ============================================================================
  it('8. إجازة موقفة وقعت أثناء المرحلة الحقيقية (بعد استنفاد المحاكاة) توقف الترفيع الحقيقي فوراً', () => {
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

  // ============================================================================
  // الاختبار 9: عدم استيفاء رصيد دورة الاختصاص بالمرحلة الحقيقية
  // ============================================================================
  it('9. عدم استيفاء رصيد دورة الاختصاص الكافي بالمرحلة الحقيقية يحجب الترفيع حتى لو انقضت السنتان بالكامل', () => {
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 109,
      qualificationId: 509,
      employeeId: 9,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    // رصيد 6 أسابيع فقط: استُهلكت بالكامل في المحاكاة (3 دورات)، والمتبقي = 0
    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 9, weeks: 6, courseName: 'رصيد للمحاكاة فقط' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2028-06-01' // انقضت أكثر من سنتين كاملتين
    });

    expect(result.specializationWeeksRemaining).toBe(0);
    expect(result.realTimeNextPromotion.specializationPrerequisiteSatisfied).toBe(false);
    expect(result.realTimeNextPromotion.eligibilityStatus).toBe('معلق_لعدم_استيفاء_دورة_الاختصاص');
    expect(result.realTimeNextPromotion.isEligible).toBe(false);
  });

  // ============================================================================
  // الاختبار 10: موظف تصل محاكاته بالضبط لدرجته الفعلية (بدون عجز)
  // ============================================================================
  it('10. موظف تصل محاكاته بالضبط لدرجته الفعلية (بدون عجز) -> status = مكتمل فوراً وينتقل مباشرة لنظام كل سنتين الحقيقي', () => {
    // موظف درجته الفعلية 4، المحاكاة وصلت لدرجة 4
    const snapshot: DegreeTrackSnapshotEntity = {
      id: 110,
      qualificationId: 510,
      employeeId: 10,
      actualGradeBefore: 4,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const specializationCredits: SpecializationCreditEntity[] = [
      { employeeId: 10, weeks: 8, courseName: 'رصيد كافٍ' }
    ];

    const result = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits,
      today: '2026-01-01'
    });

    expect(result.simulatedGradeReached).toBe(4);
    expect(result.hasDeficit).toBe(false);
    expect(result.deficitCycles).toBe(0);
    expect(result.snapshotStatus).toBe('مكتمل');
    expect(result.realTimeNextPromotion.fromGrade).toBe(4);
    expect(result.realTimeNextPromotion.toGrade).toBe(3);
    expect(result.realTimeNextPromotion.anchorStartDate).toBe('2026-01-01');
    expect(result.realTimeNextPromotion.nextPromotionDueDate).toBe('2028-01-01');
  });

  // ============================================================================
  // الاختبار 11: استثناء الـ 10 سنوات فأكثر واختبار الحد (Boundary Test)
  // ============================================================================
  it('11. استثناء الـ 10 سنوات فأكثر واختبار الحد: 10 سنوات تمنح أول ترفيعين بدورة واحدة، و9 سنوات و11 شهراً تخضع للقاعدة العامة', () => {
    // الحالة أ: 10 سنوات بالضبط (120 شهراً) مع أسبوعين رصيد
    const snap10Years: DegreeTrackSnapshotEntity = {
      id: 111,
      qualificationId: 511,
      employeeId: 11,
      actualGradeBefore: 2,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2016-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const credits2Weeks: SpecializationCreditEntity[] = [
      { employeeId: 11, weeks: 2, courseName: 'دورة وحيدة أسبوعين' }
    ];

    const result10 = calculateDegreeTrackSimulation(snap10Years, {
      specializationCredits: credits2Weeks,
      today: '2026-01-01'
    });

    expect(result10.isTenYearExceptionApplied).toBe(true);
    expect(result10.spentPeriodMonths).toBe(120);
    // الترفيعان الأول والثاني ممنوحان معاً بدورة واحدة
    expect(result10.simulationSteps[0]).toMatchObject({
      fromGrade: 7,
      toGrade: 6,
      weeksConsumed: 2,
      isBundled: true,
      status: 'ممنوح_بالمحاكاة'
    });
    expect(result10.simulationSteps[1]).toMatchObject({
      fromGrade: 6,
      toGrade: 5,
      weeksConsumed: 0,
      isBundled: true,
      status: 'ممنوح_بالمحاكاة'
    });
    // الترفيع الثالث معلق لعدم كفاية الرصيد
    expect(result10.simulationSteps[2].status).toBe('معلق_لعدم_استيفاء_الدورة');
    expect(result10.simulatedGradeReached).toBe(5);

    // الحالة ب: 9 سنوات و11 شهراً (119 شهراً) مع أسبوعين رصيد
    const snapBoundary: DegreeTrackSnapshotEntity = {
      id: 112,
      qualificationId: 512,
      employeeId: 12,
      actualGradeBefore: 2,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2016-02-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const creditsBoundary: SpecializationCreditEntity[] = [
      { employeeId: 12, weeks: 2, courseName: 'دورة وحيدة أسبوعين' }
    ];

    const resultBoundary = calculateDegreeTrackSimulation(snapBoundary, {
      specializationCredits: creditsBoundary,
      today: '2026-01-01'
    });

    expect(resultBoundary.isTenYearExceptionApplied).toBe(false);
    expect(resultBoundary.spentPeriodMonths).toBe(119);
    // يمنح ترفيعاً واحداً فقط (7 -> 6)، والترفيع الثاني (6 -> 5) معلق
    expect(resultBoundary.simulationSteps[0].status).toBe('ممنوح_بالمحاكاة');
    expect(resultBoundary.simulationSteps[0].isBundled).toBe(false);
    expect(resultBoundary.simulationSteps[1].status).toBe('معلق_لعدم_استيفاء_الدورة');
    expect(resultBoundary.simulatedGradeReached).toBe(6);
  });

  // ============================================================================
  // اختبار إضافي: دقة تعيين الدرجة الأساس القانونية
  // ============================================================================
  it('12. مطابقة الدرجة الأساس القانونية ومرحلة الأساس لمختلف التحصيلات الدراسية', () => {
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
