import { describe, it, expect } from 'vitest';
import {
  calculateDegreeTrackSimulation,
  resolveDegreeBaseline,
  getAvailableSpecializationCredits,
  calculateExactPeriodMonths,
  processDegreeTrackSettlement,
  processBatchDegreeTrackAutoSettlement,
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
  // اختبار 12: تعيين الدرجة والمرحلة الأساس بناءً على العنوان الوظيفي (job_titles) والتوافقية القديمة
  // ============================================================================
  it('12. تعيين الدرجة والمرحلة الأساس بناءً على العنوان الوظيفي المعتمد jobTitleId ومرحلة الأساس min_step', () => {
    // محاكاة عنوان وظيفي مقترن (مثلاً: مهندس min_grade: 7, min_step: 2)
    const snapshotEngineer: DegreeTrackSnapshotEntity = {
      id: 991,
      qualificationId: 881,
      employeeId: 15,
      jobTitleId: 1, // معرف العنوان الوظيفي
      actualGradeBefore: 4,
      actualStepBefore: 1,
      baselineGrade: 7, // مستخرج من job_titles.min_grade
      baselineStep: 2,  // مستخرج من job_titles.min_step
      graduationDateUsed: '2022-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const result = calculateDegreeTrackSimulation(snapshotEngineer, {
      specializationCredits: [{ employeeId: 15, weeks: 4, courseName: 'دورة هندسية' }],
      today: '2026-01-01'
    });

    expect(result.jobTitleId).toBe(1);
    expect(result.baselineGrade).toBe(7);
    expect(result.baselineStep).toBe(2);
    expect(result.simulatedGradeReached).toBe(5); // 7 -> 6 -> 5 (دورتان كل سنتين)

    // التحقق من أن resolveDegreeBaseline القديمة تعمل كـ Deprecated Fallback للتوافقية
    expect(resolveDegreeBaseline('دكتوراه هندسة')).toEqual({ grade: 5, step: 1 });
    expect(resolveDegreeBaseline('ماجستير علوم حاسوب')).toEqual({ grade: 6, step: 1 });
    expect(resolveDegreeBaseline('بكالوريوس هندسة')).toEqual({ grade: 7, step: 2 });
  });

  // ============================================================================
  // اختبار 13: التسوية التلقائية عند تفعيل الإعداد (degreeTrackAutoSettlement = true)
  // ============================================================================
  it('13. التسوية التلقائية لمسار الشهادات: موظف يستوفي شروطه -> يُسوّى تلقائياً، وتُغلق اللقطة كـ "مكتمل"، ويُنشأ سجل موافقة بعلامة "نظام آلي — تسوية تلقائية"', () => {
    const employee = {
      id: 201,
      fullName: 'أحمد علي حسن',
      grade: 3,
      step: 1,
      lastPromotionDate: '2024-01-01'
    };

    const snapshot: DegreeTrackSnapshotEntity = {
      id: 301,
      qualificationId: 401,
      employeeId: 201,
      jobTitleId: 1,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    // حساب المحاكاة بتاريخ الاستحقاق الفعلي 2028-01-01 (بعد سنتين من أمر 2026)
    const simResult = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits: [{ employeeId: 201, weeks: 8, courseName: 'دورات تخصصية' }],
      today: '2028-01-01'
    });

    expect(simResult.hasDeficit).toBe(true);
    expect(simResult.realTimeNextPromotion.isEligible).toBe(true);

    // تنفيذ التسوية مع autoSettlementEnabled = true
    const settlementResult = processDegreeTrackSettlement(employee, snapshot, simResult, {
      autoSettlementEnabled: true,
      today: '2028-01-01'
    });

    expect(settlementResult.success).toBe(true);
    expect(settlementResult.settled).toBe(true);
    expect(settlementResult.updatedSnapshot.status).toBe('مكتمل');
    expect(settlementResult.updatedEmployee.lastPromotionDate).toBe('2028-01-01');
    expect(settlementResult.approvalRecord).toBeDefined();
    expect(settlementResult.approvalRecord?.approvedBy).toBe('نظام آلي — تسوية تلقائية');
    expect(settlementResult.approvalRecord?.orderNumber).toBeNull();
    expect(settlementResult.approvalRecord?.orderDate).toBe('2028-01-01');
    expect(settlementResult.approvalRecord?.gradeBefore).toBe(3);
    expect(settlementResult.approvalRecord?.gradeAfter).toBe(3); // تثبيت دون تغيير درجة
  });

  // ============================================================================
  // اختبار 14: الوضع اليدوي الافتراضي الآمن (degreeTrackAutoSettlement = false)
  // ============================================================================
  it('14. الوضع اليدوي الافتراضي: نفس الموظف بنفس الشروط -> يبقى اللقطة نشطة دون تسوية تلقائية بانتظار اعتماد الموارد البشرية اليدوي', () => {
    const employee = {
      id: 202,
      fullName: 'سعد كريم خضير',
      grade: 3,
      step: 1,
      lastPromotionDate: '2024-01-01'
    };

    const snapshot: DegreeTrackSnapshotEntity = {
      id: 302,
      qualificationId: 402,
      employeeId: 202,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const simResult = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits: [{ employeeId: 202, weeks: 8, courseName: 'دورات تخصصية' }],
      today: '2028-01-01'
    });

    // تنفيذ مع autoSettlementEnabled = false
    const settlementResult = processDegreeTrackSettlement(employee, snapshot, simResult, {
      autoSettlementEnabled: false,
      today: '2028-01-01'
    });

    expect(settlementResult.success).toBe(true);
    expect(settlementResult.settled).toBe(false);
    expect(settlementResult.reason).toContain('التسوية التلقائية غير مفعلة');
    expect(snapshot.status).toBe('نشط'); // لم يتغير
    expect(employee.lastPromotionDate).toBe('2024-01-01'); // لم يتغير
  });

  // ============================================================================
  // اختبار 15: عزل الأخطاء التام عند فشل أو تلف بيانات موظف (Crucial Isolation Test)
  // ============================================================================
  it('15. عزل الأخطاء التام: محاكاة خطأ مفتعل في بيانات موظف تالفة ضمن دفعة -> ينحصر الخطأ بالموظف فقط، وتستمر معالجة باقي الموظفين بنجاح 100%، ويبقى الموظف المتعثر بالقائمة اليدوية', () => {
    const employees = [
      { id: 1001, fullName: 'موظف سليم 1', grade: 3, step: 1, lastPromotionDate: '2024-01-01' },
      { id: 1002, fullName: 'موظف تالف البيانات', grade: null, step: null, lastPromotionDate: 'INVALID_DATE' }, // بيانات تالفة
      { id: 1003, fullName: 'موظف سليم 2', grade: 4, step: 2, lastPromotionDate: '2024-01-01' },
    ];

    const snapshots: DegreeTrackSnapshotEntity[] = [
      {
        id: 501,
        qualificationId: 601,
        employeeId: 1001,
        actualGradeBefore: 3,
        actualStepBefore: 1,
        baselineGrade: 7,
        baselineStep: 1,
        graduationDateUsed: '2020-01-01',
        orderDate: '2026-01-01',
        status: 'نشط'
      },
      {
        id: 502,
        qualificationId: 602,
        employeeId: 1002,
        actualGradeBefore: 3,
        actualStepBefore: 1,
        baselineGrade: 7,
        baselineStep: 1,
        graduationDateUsed: 'INVALID_GRADUATION_DATE', // تاريخ تالف يُحدث خطأ
        orderDate: '2026-01-01',
        status: 'نشط'
      },
      {
        id: 503,
        qualificationId: 603,
        employeeId: 1003,
        actualGradeBefore: 4,
        actualStepBefore: 2,
        baselineGrade: 7,
        baselineStep: 1,
        graduationDateUsed: '2022-01-01',
        orderDate: '2026-01-01',
        status: 'نشط'
      }
    ];

    const contextMap = {
      specializationCredits: [
        { employeeId: 1001, weeks: 8 }, // 6 أسابيع للمحاكاة (3 دورات) + 2 أسبوع للمرحلة الحقيقية
        { employeeId: 1002, weeks: 0 },
        { employeeId: 1003, weeks: 6 }  // 4 أسابيع للمحاكاة (دورتان) + 2 أسبوع للمرحلة الحقيقية
      ]
    };

    // تشغيل المعالجة الدفعية
    const batchResult = processBatchDegreeTrackAutoSettlement(employees, snapshots, contextMap, {
      autoSettlementEnabled: true,
      today: '2028-01-01'
    });

    expect(batchResult.totalProcessed).toBe(3);
    // الموظف 1001 والموظف 1003 تمت تسويتهما بنجاح
    expect(batchResult.totalSettled).toBe(2);
    
    // فحص نتائج الموظف 1001 السليم
    const emp1Res = batchResult.results.find(r => r.employeeId === 1001);
    expect(emp1Res?.settled).toBe(true);
    expect(emp1Res?.approvalRecord?.approvedBy).toBe('نظام آلي — تسوية تلقائية');

    // فحص نتائج الموظف 1003 السليم
    const emp3Res = batchResult.results.find(r => r.employeeId === 1003);
    expect(emp3Res?.settled).toBe(true);
    expect(emp3Res?.approvalRecord?.approvedBy).toBe('نظام آلي — تسوية تلقائية');

    // فحص الموظف 1002 التالف: لم يكسر النظام وبقي غير مُسوّى ليظهر بالقائمة اليدوية
    const emp2Res = batchResult.results.find(r => r.employeeId === 1002);
    expect(emp2Res?.settled).toBe(false);
    expect(snapshots.find(s => s.employeeId === 1002)?.status).toBe('نشط'); // اللقطة بقيت نشطة
  });

  // ============================================================================
  // اختبار 16: تبديل الإعداد من تلقائي ليدوي أثناء التشغيل (Toggle Transition)
  // ============================================================================
  it('16. أمان التبديل: موظف سُوّي آلياً قبل التبديل يبقى مُسوّى كـ "مكتمل"، وموظف يستحق بعد التبديل ليدوي يبقى بالقائمة اليدوية دون تسوية', () => {
    // موظف أ: سُوّي أثناء تفعيل الآلي
    const empA = { id: 3001, fullName: 'موظف أ', grade: 3, step: 1 };
    const snapA: DegreeTrackSnapshotEntity = {
      id: 701,
      qualificationId: 801,
      employeeId: 3001,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };
    const simA = calculateDegreeTrackSimulation(snapA, {
      specializationCredits: [{ employeeId: 3001, weeks: 8 }], // 6 أسابيع محاكاة + 2 أسبوع حقيقي
      today: '2028-01-01'
    });

    const resA = processDegreeTrackSettlement(empA, snapA, simA, { autoSettlementEnabled: true, today: '2028-01-01' });
    expect(resA.settled).toBe(true);
    snapA.status = 'مكتمل'; // تم الإغلاق

    // تم تبديل الإعداد الآن إلى يدوي (autoSettlementEnabled = false)
    // 1. إعادة فحص موظف أ: لا تراجع ولا مساس بالسجل المكتمل
    const resAAfterToggle = processDegreeTrackSettlement(empA, snapA, simA, { autoSettlementEnabled: false, today: '2028-06-01' });
    expect(resAAfterToggle.settled).toBe(false);
    expect(snapA.status).toBe('مكتمل'); // بقى مكتملاً

    // 2. موظف ب: استحق بعد التبديل ليدوي
    const empB = { id: 3002, fullName: 'موظف ب', grade: 3, step: 1, lastPromotionDate: '2024-01-01' };
    const snapB: DegreeTrackSnapshotEntity = {
      id: 702,
      qualificationId: 802,
      employeeId: 3002,
      actualGradeBefore: 3,
      actualStepBefore: 1,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };
    const simB = calculateDegreeTrackSimulation(snapB, {
      specializationCredits: [{ employeeId: 3002, weeks: 8 }], // 6 أسابيع محاكاة + 2 أسبوع حقيقي
      today: '2028-06-01'
    });
    const resB = processDegreeTrackSettlement(empB, snapB, simB, { autoSettlementEnabled: false, today: '2028-06-01' });
    expect(resB.settled).toBe(false);
    expect(snapB.status).toBe('نشط'); // يبقى بالقائمة اليدوية
  });

});


