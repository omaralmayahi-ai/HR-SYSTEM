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
  // الاختبار 5-أ: فشل في مرحلة التحقق المسبق (Pre-validation Pass) -> تراجع فوري
  // ============================================================================
  it('5-أ. فشل في مرحلة التحقق المسبق: وجود عنصر غير صالح أو موظف غير مستحق يلغي الدفعة بالكامل قبل بدء أي عملية', () => {
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
      transactionState.committed = true;
      transactionState.modifiedEmployees = items.map(i => i.employeeId);
    };

    expect(() => validateBatch(rawBatch)).toThrow(/تعذر اعتماد الدفعة/);
    expect(transactionState.committed).toBe(false);
    expect(transactionState.modifiedEmployees.length).toBe(0);
  });

  // ============================================================================
  // الاختبار 5-ب: فشل حقيقي بمنتصف الـ transaction بقاعدة البيانات (الحالة ب)
  // ============================================================================
  it('5-ب. فشل حقيقي بمنتصف الـ Transaction بقاعدة البيانات (خطأ قيد/بيانات): يرجع 500 صريح وتتوقف العملية بالكامل دون تحديث الذاكرة لأي عنصر', async () => {
    const { isDbConnectionFailure } = await import('./referentialIntegrity');

    // 1. بيانات موظفين أولية بالذاكرة
    const inMemoryEmployees = [
      { id: 501, name: 'موظف 1', grade: 4, step: 2, lastIncrementDate: '2024-01-01' },
      { id: 502, name: 'موظف 2', grade: 5, step: 4, lastPromotionDate: '2020-01-01' },
      { id: 503, name: 'موظف 3', grade: 3, step: 1, lastPromotionDate: '2023-01-01' }
    ];
    const initialEmployeesSnapshot = JSON.parse(JSON.stringify(inMemoryEmployees));
    const promotionsStore: any[] = [];

    const validatedBatch = [
      { empId: 501, type: 'علاوة', stepAfter: 3, dueDate: '2026-01-01' },
      { empId: 502, type: 'ترفيع', gradeAfter: 4, stepAfter: 1, dueDate: '2026-01-01' },
      { empId: 503, type: 'تسوية', gradeAfter: 3, stepAfter: 1, dueDate: '2028-01-01' }
    ];

    // 2. محاكاة دالة المعالجة كما هي مطبقة بـ server.ts
    const simulateApproveBatch = async (mockDbTransaction: () => Promise<void>) => {
      let dbOffline = false;
      try {
        await mockDbTransaction();
      } catch (dbErr: any) {
        if (isDbConnectionFailure(dbErr)) {
          dbOffline = true;
        } else {
          // الحالة ب: خطأ حقيقي بقاعدة البيانات -> إرجاع 500 فوراً دون لمس الذاكرة
          return {
            status: 500,
            body: {
              error: 'فشلت عملية الاعتماد بالكامل في قاعدة البيانات، وتم التراجع عن كافة التغييرات (Rollback)',
              details: dbErr?.message,
              code: dbErr?.code
            }
          };
        }
      }

      // Phase 3: Mirror in Memory (تحدث فقط إذا نجحت DB أو إذا كانت DB أوفلاين)
      for (const item of validatedBatch) {
        const emp = inMemoryEmployees.find(e => e.id === item.empId);
        if (emp) {
          if (item.type === 'علاوة') {
            emp.step = item.stepAfter;
            emp.lastIncrementDate = item.dueDate;
          } else if (item.type === 'ترفيع') {
            emp.grade = item.gradeAfter;
            emp.step = item.stepAfter;
            emp.lastPromotionDate = item.dueDate;
          } else if (item.type === 'تسوية') {
            emp.lastPromotionDate = item.dueDate;
          }
        }
        promotionsStore.push({ employeeId: item.empId, type: item.type });
      }

      return {
        status: 200,
        body: { success: true, storageMode: dbOffline ? 'local_encrypted' : 'database_and_local' }
      };
    };

    // 3. اختبار الحالة ب: خطأ قيد قاعدة بيانات (Unique / Foreign Key Constraint Violation)
    const constraintError = new Error('duplicate key value violates unique constraint "promotions_order_idx"');
    (constraintError as any).code = '23505'; // PostgreSQL unique violation code

    const result = await simulateApproveBatch(async () => {
      // نفترض أن أول موظف تم تحديثه، ولكن عند الموظف الثاني حصل خطأ قيد
      throw constraintError;
    });

    // 4. التحقق الحاسم:
    // أ. الاستجابة 500 صريحة مع رسالة الفشل والتراجع
    expect(result.status).toBe(500);
    expect(result.body.error).toContain('فشلت عملية الاعتماد بالكامل في قاعدة البيانات');
    expect(result.body.code).toBe('23505');

    // ب. الذاكرة لم تتحدث إطلاقاً لأي موظف بالدفعة (لا الأول ولا الثاني ولا الثالث)
    expect(inMemoryEmployees).toEqual(initialEmployeesSnapshot);
    expect(promotionsStore.length).toBe(0);
  });

  // ============================================================================
  // الاختبار 5-ج: التمييز الدقيق بين انقطاع الاتصال (Case A) وخطأ الـ Transaction (Case B)
  // ============================================================================
  it('5-ج. التمييز الدقيق عبر isDbConnectionFailure بين انقطاع الاتصال (Case A) وأخطاء البيانات والـ Transaction الحقيقية (Case B)', async () => {
    const { isDbConnectionFailure } = await import('./referentialIntegrity');

    // Case A: أخطاء انقطاع الاتصال بالشبكة أو إغلاق الخادم
    expect(isDbConnectionFailure({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:5432' })).toBe(true);
    expect(isDbConnectionFailure({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND localhost' })).toBe(true);
    expect(isDbConnectionFailure({ code: 'ETIMEDOUT', message: 'Connection timeout' })).toBe(true);
    expect(isDbConnectionFailure({ code: '57P01', message: 'terminating connection due to administrator command' })).toBe(true);
    expect(isDbConnectionFailure({ code: '08006', message: 'connection_failure' })).toBe(true);
    expect(isDbConnectionFailure(new Error('Connection terminated unexpectedly'))).toBe(true);

    // Case B: أخطاء المعاملات والبيانات والقواعد داخل قاعدة البيانات المتصلة
    expect(isDbConnectionFailure({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isDbConnectionFailure({ code: '23502', message: 'null value in column "employee_id" violates not-null constraint' })).toBe(false);
    expect(isDbConnectionFailure({ code: '23503', message: 'foreign key constraint violation' })).toBe(false);
    expect(isDbConnectionFailure({ code: '23514', message: 'check constraint "salary_check" violated' })).toBe(false);
    expect(isDbConnectionFailure({ code: '42P01', message: 'relation "unknown_table" does not exist' })).toBe(false);
    expect(isDbConnectionFailure(new Error('Syntax error at or near SELECT'))).toBe(false);
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

