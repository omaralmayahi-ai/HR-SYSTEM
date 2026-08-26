// src/lib/referentialIntegrity.test.ts
import { describe, it, expect } from 'vitest';
import { checkReferentialUsage, validateEmployeeImportRow } from './referentialIntegrity';

describe('Referential Integrity & Usage Prevention (الحماية المرجعية لمنع الحذف/الإيقاف)', () => {
  const sampleEmployees = [
    {
      id: 1,
      fullName: 'عمر محمود سلمان',
      jobTitle: 'مهندس أقدم',
      shiftSystemId: 10,
      educationLevel: 'بكالوريوس',
      primaryResponsibility: 'مسؤول قسم',
      grade: 5,
      step: 3,
      status: 'مستمر'
    },
    {
      id: 2,
      fullName: 'أحمد علي حسن',
      jobTitle: 'مبرمج',
      shiftSystemId: 11,
      educationLevel: 'ماجستير',
      primaryResponsibility: 'مسؤول شعبة',
      grade: 6,
      step: 2,
      status: 'مستمر'
    }
  ];

  it('1. should reject deleting/deactivating a job_title used by active employees with Arabic count message', () => {
    const context = {
      employees: sampleEmployees,
      entities: {
        job_titles: [{ id: 101, name: 'مهندس أقدم', status: 'فعال' }]
      }
    };

    const deleteCheck = checkReferentialUsage('job_titles', 101, false, context);
    expect(deleteCheck.canProceed).toBe(false);
    expect(deleteCheck.count).toBe(1);
    expect(deleteCheck.message).toContain('لا يمكن حذف هذا العنوان الوظيفي، مستخدم حالياً من قبل 1 موظف');

    const deactivationCheck = checkReferentialUsage('job_titles', 101, true, context);
    expect(deactivationCheck.canProceed).toBe(false);
    expect(deactivationCheck.message).toContain('لا يمكن إيقاف / تعطيل هذا العنوان الوظيفي');
  });

  it('2. should permit deleting an unused job_title', () => {
    const context = {
      employees: sampleEmployees,
      entities: {
        job_titles: [{ id: 999, name: 'طبيب استشاري', status: 'فعال' }]
      }
    };

    const res = checkReferentialUsage('job_titles', 999, false, context);
    expect(res.canProceed).toBe(true);
    expect(res.count).toBe(0);
  });

  it('3. should reject deleting/deactivating a shift_system in use', () => {
    const context = {
      employees: sampleEmployees,
      entities: {
        shift_systems: [{ id: 10, name: 'مناوبة 1*3' }]
      }
    };

    const res = checkReferentialUsage('shift_systems', 10, false, context);
    expect(res.canProceed).toBe(false);
    expect(res.count).toBe(1);
    expect(res.message).toContain('لا يمكن حذف نظام المناوبة هذا، مسند حالياً لـ 1 موظف');
  });

  it('4. should reject deleting/deactivating a continuous allowance in use and allow unused', () => {
    const context = {
      employees: sampleEmployees,
      entities: {
        allowances_deductions: [
          { id: 201, name: 'مخصصات هندسية', type: 'allowance', status: 'فعال' },
          { id: 202, name: 'مخصصات بحرية', type: 'allowance', status: 'فعال' }
        ]
      },
      allowanceRules: {
        '201': { titles: ['مهندس أقدم'] },
        '202': { titles: ['قبطان بحري'] }
      }
    };

    const usedCheck = checkReferentialUsage('allowances_deductions', 201, false, context);
    expect(usedCheck.canProceed).toBe(false);
    expect(usedCheck.count).toBe(1);
    expect(usedCheck.message).toContain('لا يمكن حذف هذا المخصص');

    const unusedCheck = checkReferentialUsage('allowances_deductions', 202, false, context);
    expect(unusedCheck.canProceed).toBe(true);
    expect(unusedCheck.count).toBe(0);
  });

  it('5. should allow auto-deactivation of temporary allowances without conflict (استثناء المخصصات المؤقتة)', () => {
    const context = {
      employees: sampleEmployees,
      entities: {
        allowances_deductions: [{ id: 301, name: 'مكافأة عيد الأضحى', type: 'allowance', status: 'فعال' }]
      },
      temporaryMeta: {
        '301': { isTemporary: true, timingType: 'single', paymentMonth: 6, paymentYear: 2026 }
      }
    };

    // Deactivation for temporary allowance (e.g. from auto-expiration engine) MUST be permitted!
    const deactivationRes = checkReferentialUsage('allowances_deductions', 301, true, context);
    expect(deactivationRes.canProceed).toBe(true);

    // But full delete while employees are eligible should still be guarded
    const deleteRes = checkReferentialUsage('allowances_deductions', 301, false, context);
    expect(deleteRes.canProceed).toBe(false);
  });

  it('6. should reject deleting an in-use education degree and in-use responsibility allowance', () => {
    const context = {
      employees: sampleEmployees,
      entities: {
        education_degrees: [{ id: 401, name: 'بكالوريوس' }],
        responsibility_allowances: [{ id: 501, name: 'مسؤول قسم' }]
      }
    };

    const eduCheck = checkReferentialUsage('education_degrees', 401, false, context);
    expect(eduCheck.canProceed).toBe(false);
    expect(eduCheck.count).toBe(1);

    const respCheck = checkReferentialUsage('responsibility_allowances', 501, false, context);
    expect(respCheck.canProceed).toBe(false);
    expect(respCheck.count).toBe(1);
  });

  it('7. should reject deleting an in-use penalty type with active penalties', () => {
    const context = {
      employees: sampleEmployees,
      penalties: [
        { id: 1, employeeId: 1, penaltyType: 'توبيخ إداري', status: 'نافذ' }
      ],
      entities: {
        penalty_types: [{ id: 601, name: 'توبيخ إداري' }]
      }
    };

    const penaltyCheck = checkReferentialUsage('penalty_types', 601, false, context);
    expect(penaltyCheck.canProceed).toBe(false);
    expect(penaltyCheck.count).toBe(1);
    expect(penaltyCheck.message).toContain('عقوبة إدارية نافذة');
  });

  it('8. should reject deleting an evaluation form used in ongoing evaluation cycles', () => {
    const context = {
      employees: sampleEmployees,
      performanceEvaluations: [
        { id: 1, employeeId: 1, formId: 701, formTitle: 'استمارة الوظائف الهندسية', status: 'مرفوع للاعتماد' }
      ],
      entities: {
        evaluation_forms: [{ id: 701, title: 'استمارة الوظائف الهندسية' }]
      }
    };

    const formCheck = checkReferentialUsage('evaluation_forms', 701, false, context);
    expect(formCheck.canProceed).toBe(false);
    expect(formCheck.count).toBe(1);
    expect(formCheck.message).toContain('دورة تقييم جارية');
  });
});

describe('Excel Import Row Validation (تحقق استيراد الموظفين من إكسل)', () => {
  const lookupData = {
    jobTitles: [
      { id: 1, name: 'مهندس أقدم', status: 'فعال' },
      { id: 2, name: 'مترجم', status: 'معطل' }
    ],
    educationDegrees: [
      { id: 1, name: 'بكالوريوس' },
      { id: 2, name: 'ماجستير' }
    ],
    shiftSystems: [
      { id: 1, name: 'مناوبة 1*3' },
      { id: 2, name: 'مناوبة 7*7' }
    ],
    salaryScaleMap: {
      '5': { '1': 429000, '2': 435000, '3': 441000 },
      '6': { '1': 362000, '2': 368000 }
    }
  };

  it('should accept a completely valid row', () => {
    const validRow = {
      firstName: 'عمر',
      companyNumber: '5001',
      jobTitle: 'مهندس أقدم',
      educationLevel: 'بكالوريوس',
      shiftSystemName: 'مناوبة 1*3',
      workShiftType: 'مناوب',
      grade: '5',
      step: '2'
    };

    const result = validateEmployeeImportRow(validRow, lookupData);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should reject a row with non-existent or inactive job title with precise error', () => {
    const rowWithFakeTitle = {
      firstName: 'سامي',
      companyNumber: '5002',
      jobTitle: 'محاسب عام غير مسجل',
      educationLevel: 'بكالوريوس',
      grade: '5',
      step: '1'
    };

    const result1 = validateEmployeeImportRow(rowWithFakeTitle, lookupData);
    expect(result1.isValid).toBe(false);
    expect(result1.errors[0]).toContain("غير موجود بدليل العناوين الوظيفية");

    const rowWithDisabledTitle = {
      firstName: 'سامي',
      companyNumber: '5003',
      jobTitle: 'مترجم',
      educationLevel: 'بكالوريوس',
      grade: '5',
      step: '1'
    };

    const result2 = validateEmployeeImportRow(rowWithDisabledTitle, lookupData);
    expect(result2.isValid).toBe(false);
    expect(result2.errors[0]).toContain("معطل في دليل العناوين الوظيفية");
  });

  it('should reject a row with non-existent education degree or invalid shift system', () => {
    const row = {
      firstName: 'هند',
      companyNumber: '5004',
      jobTitle: 'مهندس أقدم',
      educationLevel: 'دبلوم بريطاني غير معتمد',
      shiftSystemName: 'مناوبة وهمية',
      workShiftType: 'مناوب',
      grade: '5',
      step: '1'
    };

    const result = validateEmployeeImportRow(row, lookupData);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('التحصيل الدراسي'))).toBe(true);
    expect(result.errors.some(e => e.includes('نظام المناوبة'))).toBe(true);
  });

  it('should reject a row with grade or step out of salary scale bounds', () => {
    const rowWithBadGrade = {
      firstName: 'ليث',
      companyNumber: '5005',
      jobTitle: 'مهندس أقدم',
      educationLevel: 'بكالوريوس',
      grade: '18',
      step: '20'
    };

    const result = validateEmployeeImportRow(rowWithBadGrade, lookupData);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('سلم الرواتب'))).toBe(true);
  });
});
