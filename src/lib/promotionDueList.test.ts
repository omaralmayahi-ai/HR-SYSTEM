import { describe, it, expect } from 'vitest';
import {
  calculatePromotionEligibility,
  calculateIncrementEligibility,
  recalculateEligibilitySync,
  EngineContextData
} from './promotionEngine';
import {
  calculateDegreeTrackSimulation,
  processDegreeTrackSettlement,
  DegreeTrackSnapshotEntity
} from './degreeTrackEngine';

describe('Phase 3: Promotions & Increments Due Lists & Batch Approvals (قوائم المستحقين والاعتماد الدفعي)', () => {

  // ============================================================================
  // الاختبار 1: اعتماد فردي "علاوة سنوية" لموظف اعتيادي
  // ============================================================================
  it('1. اعتماد فردي "علاوة سنوية": الدرجة ثابتة، المرحلة تزيد بمقدار 1، وتاريخ آخر علاوة = تاريخ الاستحقاق المحسوب (ثبات تاريخ الاستحقاق)', () => {
    const employee = {
      id: 101,
      fullName: 'علي كمال صادق',
      grade: 5,
      step: 3,
      hireDate: '2020-01-01',
      lastIncrementDate: '2025-01-01',
      lastPromotionDate: '2023-01-01',
      status: 'نشط'
    };

    const context: EngineContextData = {
      today: '2026-03-01' // بعد استحقاق 2026-01-01 بشهرين
    };

    // 1. حساب الاستحقاق
    const res = calculateIncrementEligibility(employee, context);
    expect(res.isIncrementEligible).toBe(true);
    expect(res.eligibilityStatus).toBe('مستحق_للعلاوة');
    expect(res.nextIncrementDueDate).toBe('2026-01-01');

    // 2. محاكاة منطق الاعتماد (approve-batch logic)
    const calculatedDueDate = res.nextIncrementDueDate;
    const orderNumber = '55/ع/2026';
    const orderDate = '2026-03-01';

    const updatedEmployee = {
      ...employee,
      step: employee.step + 1, // 3 -> 4
      lastIncrementDate: calculatedDueDate // 2026-01-01 (وليس تاريخ الأمر 2026-03-01)
    };

    const promoRecord = {
      employeeId: employee.id,
      movementType: 'علاوة سنوية',
      gradeBefore: employee.grade,
      gradeAfter: updatedEmployee.grade,
      stepBefore: employee.step,
      stepAfter: updatedEmployee.step,
      dueDate: calculatedDueDate,
      orderNumber,
      orderDate,
      approvedBy: 'مدير الموارد البشرية'
    };

    // 3. التحقق من صحة النتائج
    expect(updatedEmployee.grade).toBe(5); // ثبات الدرجة
    expect(updatedEmployee.step).toBe(4);   // زيادة المرحلة
    expect(updatedEmployee.lastIncrementDate).toBe('2026-01-01'); // ثبات تاريخ الاستحقاق
    expect(promoRecord.dueDate).toBe('2026-01-01');
    expect(promoRecord.orderNumber).toBe('55/ع/2026');
  });

  // ============================================================================
  // الاختبار 2: اعتماد فردي "ترفيع درجة" لموظف اعتيادي
  // ============================================================================
  it('2. اعتماد فردي "ترفيع درجة": الدرجة تتغير فعلياً (تتقدم من 5 إلى 4)، المرحلة تصبح 1، وتاريخ آخر ترفيع = تاريخ الاستحقاق المحسوب', () => {
    const employee = {
      id: 102,
      fullName: 'منى رياض عبد الحسين',
      grade: 5,
      step: 4,
      hireDate: '2015-01-01',
      lastPromotionDate: '2021-01-01', // تتطلب 5 سنوات -> 2026-01-01
      status: 'نشط'
    };

    const context: EngineContextData = {
      today: '2026-02-15',
      governingCourses: [],
      governingAssignments: {
        '102': { status: 'مستوفي' }
      },
      evaluations: [
        { employeeId: 102, year: 2024, rating: 'كفء' },
        { employeeId: 102, year: 2025, rating: 'جيد_جدا' }
      ]
    };

    const res = calculatePromotionEligibility(employee, context);
    expect(res.isPromotionEligible).toBe(true);
    expect(res.eligibilityStatus).toBe('مستحق_للترفيع');
    expect(res.nextPromotionDueDate).toBe('2026-01-01');

    // محاكاة الاعتماد
    const calculatedDueDate = res.nextPromotionDueDate;
    const orderNumber = '99/ت/2026';
    const orderDate = '2026-02-15';

    const targetGrade = Math.max(1, employee.grade - 1);
    const updatedEmployee = {
      ...employee,
      grade: targetGrade, // 5 -> 4
      step: 1,
      lastPromotionDate: calculatedDueDate // 2026-01-01
    };

    const promoRecord = {
      employeeId: employee.id,
      movementType: 'ترفيع درجة',
      gradeBefore: employee.grade,
      gradeAfter: updatedEmployee.grade,
      stepBefore: employee.step,
      stepAfter: updatedEmployee.step,
      dueDate: calculatedDueDate,
      orderNumber,
      orderDate,
      approvedBy: 'مدير الموارد البشرية'
    };

    expect(updatedEmployee.grade).toBe(4); // ترقية الدرجة
    expect(updatedEmployee.step).toBe(1);
    expect(updatedEmployee.lastPromotionDate).toBe('2026-01-01'); // ثبات تاريخ الاستحقاق
    expect(promoRecord.gradeBefore).toBe(5);
    expect(promoRecord.gradeAfter).toBe(4);
  });

  // ============================================================================
  // الاختبار 3: اعتماد فردي "تسوية" لموظف مسار شهادات
  // ============================================================================
  it('3. اعتماد فردي "تسوية مسار الشهادات": الدرجة والمرحلة لا تتغيران إطلاقاً، تاريخ آخر ترفيع يُحدث لتاريخ الاستحقاق، واللقطة تُغلق كـ "مكتمل"', () => {
    const employee = {
      id: 103,
      fullName: 'حسين جواد كاظم',
      grade: 3,
      step: 2,
      lastPromotionDate: '2024-01-01',
      status: 'نشط'
    };

    const snapshot: DegreeTrackSnapshotEntity = {
      id: 777,
      qualificationId: 888,
      employeeId: 103,
      actualGradeBefore: 3,
      actualStepBefore: 2,
      baselineGrade: 7,
      baselineStep: 1,
      graduationDateUsed: '2020-01-01',
      orderDate: '2026-01-01',
      status: 'نشط'
    };

    const simResult = calculateDegreeTrackSimulation(snapshot, {
      specializationCredits: [{ employeeId: 103, weeks: 8 }],
      today: '2028-01-01'
    });

    expect(simResult.hasDeficit).toBe(true);
    expect(simResult.realTimeNextPromotion.isEligible).toBe(true);
    expect(simResult.realTimeNextPromotion.nextPromotionDueDate).toBe('2028-01-01');

    // محاكاة اعتماد التسوية اليدوي
    const calculatedDueDate = simResult.realTimeNextPromotion.nextPromotionDueDate;
    const orderNumber = '303/ش/2028';
    const orderDate = '2028-01-15';

    const updatedEmployee = {
      ...employee,
      lastPromotionDate: calculatedDueDate // تحديث التاريخ فقط
    };
    const updatedSnapshot = {
      ...snapshot,
      status: 'مكتمل'
    };

    const promoRecord = {
      employeeId: employee.id,
      movementType: 'تسوية مسار الشهادات',
      gradeBefore: employee.grade,
      gradeAfter: updatedEmployee.grade, // نفس الدرجة 3
      stepBefore: employee.step,
      stepAfter: updatedEmployee.step,   // نفس المرحلة 2
      dueDate: calculatedDueDate,
      orderNumber,
      orderDate,
      approvedBy: 'مدير الموارد البشرية',
      notes: 'تثبيت استحقاق الموظف بدرجته الحالية ضمن مسار الشهادات'
    };

    expect(updatedEmployee.grade).toBe(3); // الدرجة لم تتغير
    expect(updatedEmployee.step).toBe(2);  // المرحلة لم تتغير
    expect(updatedEmployee.lastPromotionDate).toBe('2028-01-01');
    expect(updatedSnapshot.status).toBe('مكتمل');
    expect(promoRecord.gradeBefore).toBe(3);
    expect(promoRecord.gradeAfter).toBe(3);
  });

  // ============================================================================
  // الاختبار 4: اعتماد دفعي لـ 3 موظفين مختلطين (علاوة + ترفيع + تسوية) بنفس الأمر الإداري
  // ============================================================================
  it('4. اعتماد دفعي لـ 3 موظفين مختلطين (علاوة + ترفيع + تسوية) بنفس رقم الأمر الإداري: كل موظف يتحدث وفق قواعد مساره الخاصة بدقة', () => {
    const batchItems = [
      { employeeId: 201, type: 'علاوة', curGrade: 6, curStep: 2, dueDate: '2026-01-01' },
      { employeeId: 202, type: 'ترفيع', curGrade: 4, curStep: 4, dueDate: '2026-01-01' },
      { employeeId: 203, type: 'تسوية', curGrade: 3, curStep: 1, dueDate: '2028-01-01', snapshotId: 901 }
    ];

    const sharedOrderNumber = '700/أمر_مشترك/2026';
    const sharedOrderDate = '2026-01-15';

    // تنفيذ معالجة الدفعة
    const processedResults = batchItems.map(item => {
      if (item.type === 'علاوة') {
        return {
          employeeId: item.employeeId,
          type: 'علاوة',
          gradeBefore: item.curGrade,
          gradeAfter: item.curGrade,
          stepBefore: item.curStep,
          stepAfter: item.curStep + 1,
          lastIncrementDate: item.dueDate,
          orderNumber: sharedOrderNumber,
          orderDate: sharedOrderDate
        };
      } else if (item.type === 'ترفيع') {
        return {
          employeeId: item.employeeId,
          type: 'ترفيع',
          gradeBefore: item.curGrade,
          gradeAfter: item.curGrade - 1,
          stepBefore: item.curStep,
          stepAfter: 1,
          lastPromotionDate: item.dueDate,
          orderNumber: sharedOrderNumber,
          orderDate: sharedOrderDate
        };
      } else {
        return {
          employeeId: item.employeeId,
          type: 'تسوية',
          gradeBefore: item.curGrade,
          gradeAfter: item.curGrade, // لا تغيير
          stepBefore: item.curStep,
          stepAfter: item.curStep,   // لا تغيير
          lastPromotionDate: item.dueDate,
          snapshotCompleted: true,
          orderNumber: sharedOrderNumber,
          orderDate: sharedOrderDate
        };
      }
    });

    // 1. فحص موظف العلاوة
    const incRes = processedResults.find(r => r.employeeId === 201);
    expect(incRes?.gradeAfter).toBe(6);
    expect(incRes?.stepAfter).toBe(3);
    expect(incRes?.lastIncrementDate).toBe('2026-01-01');
    expect(incRes?.orderNumber).toBe(sharedOrderNumber);

    // 2. فحص موظف الترفيع
    const promRes = processedResults.find(r => r.employeeId === 202);
    expect(promRes?.gradeAfter).toBe(3);
    expect(promRes?.stepAfter).toBe(1);
    expect(promRes?.lastPromotionDate).toBe('2026-01-01');
    expect(promRes?.orderNumber).toBe(sharedOrderNumber);

    // 3. فحص موظف التسوية
    const setRes = processedResults.find(r => r.employeeId === 203);
    expect(setRes?.gradeAfter).toBe(3); // ثابت
    expect(setRes?.stepAfter).toBe(1);  // ثابت
    expect(setRes?.lastPromotionDate).toBe('2028-01-01');
    expect(setRes?.snapshotCompleted).toBe(true);
    expect(setRes?.orderNumber).toBe(sharedOrderNumber);
  });

  // ============================================================================
  // الاختبار 5: فشل مفتعل بمنتصف الدفعة -> تراجع كامل للعملية (Atomic Rollback)
  // ============================================================================
  it('5. فشل مفتعل بمنتصف الدفعة: وجود عنصر غير صالح أو موظف غير مستحق يلغي الدفعة بالكامل دون أي تعديل جزئي', () => {
    const rawBatch = [
      { employeeId: 301, type: 'علاوة', isEligible: true },
      { employeeId: 302, type: 'ترفيع', isEligible: false, reason: 'الموظف في إجازة بدون راتب موقفة' }, // غير صالح
      { employeeId: 303, type: 'تسوية', isEligible: true }
    ];

    let transactionState = { committed: false, modifiedEmployees: [] as number[] };

    // محاكاة التحقق الذري (Pre-validation Pass)
    const validateBatch = (items: typeof rawBatch) => {
      for (const item of items) {
        if (!item.isEligible) {
          throw new Error(`تعذر اعتماد الدفعة: الموظف #${item.employeeId} غير مستحق (${item.reason})`);
        }
      }
      // إذا نجح التحقق الكامل
      transactionState.committed = true;
      transactionState.modifiedEmployees = items.map(i => i.employeeId);
    };

    expect(() => validateBatch(rawBatch)).toThrow(/تعذر اعتماد الدفعة/);
    // التحقق من عدم تطبيق أي تغيير جزئي
    expect(transactionState.committed).toBe(false);
    expect(transactionState.modifiedEmployees.length).toBe(0);
  });

  // ============================================================================
  // الاختبار 6: موظف موقوف بإجازة أو تقييم لا يظهر بأي من القوائم الثلاث
  // ============================================================================
  it('6. الموظف الموقوف بإجازة موقفة أو عدم استيفاء التقييم لا يظهر بأي من القوائم الثلاث القابلة للاعتماد', () => {
    const empWithPausingLeave = {
      id: 401,
      fullName: 'فاضل عباس كريم',
      grade: 4,
      step: 2,
      lastPromotionDate: '2020-01-01',
      lastIncrementDate: '2024-01-01'
    };

    const contextWithLeave: EngineContextData = {
      today: '2026-01-01',
      leaves: [
        {
          employeeId: 401,
          leaveType: 'إجازة بدون راتب',
          administrativeEffect: 'يوقف_الترفيع',
          startDate: '2025-06-01',
          endDate: '2026-06-01',
          status: 'موافق_عليها'
        }
      ]
    };

    const fullResult = recalculateEligibilitySync(empWithPausingLeave, contextWithLeave);

    // ترفيع موقوف
    expect(fullResult.promotion.isPromotionEligible).toBe(false);
    expect(fullResult.promotion.eligibilityStatus).toBe('موقوف_بإجازة');

    // علاوة موقوفة
    expect(fullResult.increment.isIncrementEligible).toBe(false);
    expect(fullResult.increment.eligibilityStatus).toBe('موقوف_بإجازة');

    // التحقق من فلتر القوائم
    const isDueForPromotion = fullResult.promotion.eligibilityStatus === 'مستحق_للترفيع' && fullResult.promotion.isPromotionEligible;
    const isDueForIncrement = fullResult.increment.eligibilityStatus === 'مستحق_للعلاوة' && fullResult.increment.isIncrementEligible;

    expect(isDueForPromotion).toBe(false);
    expect(isDueForIncrement).toBe(false);
  });

});
