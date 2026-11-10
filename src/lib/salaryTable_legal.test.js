import { describe, it, expect } from 'vitest';
import {
  calculateSalary,
  checkEmployeeMatchesRule,
  evaluateChildEligibility,
  getItemCategory,
  getEligibleSpouseCount,
  formatCurrency,
  ITEM_CATEGORIES,
  LEGAL_EDUCATION_DEGREES,
  RESPONSIBILITY_ALLOWANCE_RATES,
  SPOUSE_ALLOWANCE,
  CHILD_ALLOWANCE,
  RETIREMENT_RATE,
} from './salaryTable.js';

// Grade 3 step 1 = 600,000 in the default scale
const emp = (extra = {}) => ({ id: 7, grade: 3, step: 1, marital_status: 'أعزب', children_count: 0, ...extra });

// The old "Iraq default package" from AllowancesSettings (before the fix)
const OLD_PRESET_PACKAGE = [
  { id: 1, name: 'مخصصات الزوجية المقطوعة', type: 'allowance', calcType: 'flat', value: 50000, status: 'فعال' },
  { id: 2, name: 'مخصصات الأطفال (لكل طفل)', type: 'allowance', calcType: 'flat', value: 10000, status: 'فعال' },
  { id: 3, name: 'مخصصات شهادة بكالوريوس', type: 'allowance', calcType: 'percentage', value: 45, status: 'فعال' },
  { id: 4, name: 'مخصصات شهادة ماجستير', type: 'allowance', calcType: 'percentage', value: 75, status: 'فعال' },
  { id: 5, name: 'مخصصات شهادة دكتوراه', type: 'allowance', calcType: 'percentage', value: 100, status: 'فعال' },
  { id: 6, name: 'مخصصات منصب / إشرافية', type: 'allowance', calcType: 'percentage', value: 15, status: 'فعال' },
  { id: 8, name: 'مخصصات شهادة دبلوم', type: 'allowance', calcType: 'percentage', value: 20, status: 'فعال' },
  { id: 9, name: 'استقطاع توفير التقاعد الوطني', type: 'deduction', calcType: 'percentage', value: 10, status: 'فعال' },
  { id: 10, name: 'استقطاع ضريبة الدخل المباشرة', type: 'deduction', calcType: 'percentage', value: 5, status: 'فعال' },
];

describe('Retirement is deducted exactly once (10%)', () => {
  it('does not add the legacy retirement record on top of the computed retirement', () => {
    const r = calculateSalary(emp(), { allowancesDeductions: OLD_PRESET_PACKAGE });
    expect(r.retirement_deduction).toBe(60000);
    expect(r.general_custom_deductions).toBe(0);
    expect(r.total_deductions).toBe(60000);
    expect(r.deductions_breakdown.filter(d => d.category === 'retirement')).toHaveLength(1);
  });

  it('recognises the retirement record by explicit category regardless of its name', () => {
    const items = [{ id: 'r', name: 'صندوق التوقيفات', category: 'retirement', type: 'deduction', calcType: 'percentage', value: 10, status: 'فعال' }];
    const r = calculateSalary(emp(), { allowancesDeductions: items });
    expect(r.retirement_deduction).toBe(60000);
    expect(r.total_deductions).toBe(60000);
  });

  it('defaults to 10% with no settings at all', () => {
    expect(RETIREMENT_RATE).toBe(0.10);
    expect(calculateSalary(emp()).retirement_deduction).toBe(60000);
  });

  it('honours an explicit retirement stop', () => {
    const r = calculateSalary(emp(), { retirementStatus: 'inactive' });
    expect(r.retirement_deduction).toBe(0);
  });
});

describe('Preset certificate / position / tax records are not double-counted', () => {
  it('pays the certificate from the degree table only (45% for bachelor), not again from preset records', () => {
    const r = calculateSalary(emp({ education_level: 'بكالوريوس', primary_responsibility: 'مدير قسم' }), { allowancesDeductions: OLD_PRESET_PACKAGE });
    expect(r.degree_allowance).toBe(270000); // 45% of 600,000
    expect(r.position_allowance).toBe(120000); // 20% of 600,000
    expect(r.general_custom_allowances).toBe(0);
    expect(r.total_allowances).toBe(270000 + 120000);
    expect(r.warnings.some(w => w.includes('مخصصات منصب / إشرافية'))).toBe(true);
  });

  it('does not apply the 5% flat "income tax" record (tax engine not implemented)', () => {
    const r = calculateSalary(emp(), { allowancesDeductions: OLD_PRESET_PACKAGE });
    expect(r.tax_deduction).toBe(0);
    expect(r.deductions_breakdown.some(d => d.name.includes('ضريبة'))).toBe(false);
    expect(r.warnings.some(w => w.includes('ضريبة'))).toBe(true);
  });
});

describe('Explicit category instead of keyword detection', () => {
  it('does not treat "مخصصات المولدات" as a child allowance', () => {
    expect(getItemCategory({ name: 'مخصصات المولدات', type: 'allowance' })).toBe(ITEM_CATEGORIES.GENERAL);
    const items = [{ id: 'gen', name: 'مخصصات المولدات', type: 'allowance', calcType: 'flat', value: 25000, status: 'فعال' }];
    const r = calculateSalary(emp({ children_count: 1 }), { allowancesDeductions: items });
    expect(r.general_custom_allowances).toBe(25000);
    expect(r.children_allowance).toBe(CHILD_ALLOWANCE);
  });

  it('does not treat a name merely containing "تقاعد" as the retirement record', () => {
    expect(getItemCategory({ name: 'استقطاع سلفة المتقاعدين', type: 'deduction' })).toBe(ITEM_CATEGORIES.GENERAL);
  });

  it('uses the explicit category field', () => {
    const items = [{ id: 's', name: 'بدل عائلي', category: 'spouse', type: 'allowance', calcType: 'flat', value: 60000, status: 'فعال' }];
    const r = calculateSalary(emp({ marital_status: 'متزوج' }), { allowancesDeductions: items });
    expect(r.spouse_allowance).toBe(60000);
    expect(r.general_custom_allowances).toBe(0);
  });

  it('keeps backward compatibility with known whole names', () => {
    expect(getItemCategory({ name: 'استقطاع توفير التقاعد الوطني', type: 'deduction' })).toBe('retirement');
    expect(getItemCategory({ name: 'مخصصات الأطفال (لكل طفل)', type: 'allowance' })).toBe('child');
    expect(getItemCategory({ name: 'مخصصات الزوجية المقطوعة', type: 'allowance' })).toBe('spouse');
  });
});

describe('Eligibility conditions fail closed', () => {
  it('does not grant an item whose rule cannot be evaluated and reports a warning', () => {
    const items = [{ id: 'x', name: 'مخصص خطورة', type: 'allowance', calcType: 'flat', value: 90000, status: 'فعال', rules: '{not json' }];
    const r = calculateSalary(emp(), { allowancesDeductions: items });
    expect(r.general_custom_allowances).toBe(0);
    expect(r.warnings.some(w => w.includes('مخصص خطورة'))).toBe(true);
  });

  it('checkEmployeeMatchesRule returns false on a malformed rule', () => {
    const warnings = [];
    expect(checkEmployeeMatchesRule(emp(), 5, { blockedEmployees: 'all' }, warnings)).toBe(false);
    expect(warnings).toHaveLength(1);
  });

  it('honours the block list', () => {
    expect(checkEmployeeMatchesRule(emp(), 5, { blockedEmployees: ['7'] })).toBe(false);
    expect(checkEmployeeMatchesRule(emp(), 5, { blockedEmployees: ['8'] })).toBe(true);
  });
});

describe('Missing grade / step', () => {
  it('returns missing_data instead of assuming grade 1', () => {
    const r = calculateSalary({ step: 1, marital_status: 'أعزب' });
    expect(r.status).toBe('missing_data');
    expect(r.missing_data).toBe(true);
    expect(r.net_salary).toBeNull();
    expect(r.reason).toContain('الدرجة');
  });

  it('returns missing_data when the step is missing', () => {
    const r = calculateSalary({ grade: 5 });
    expect(r.status).toBe('missing_data');
    expect(r.reason).toContain('المرحلة');
  });

  it('returns missing_data when the grade/step is not in the scale (no 250,000 default)', () => {
    const r = calculateSalary({ grade: 40, step: 1 });
    expect(r.status).toBe('missing_data');
    expect(r.base_salary).toBeNull();
  });

  it('formatCurrency shows «بيانات ناقصة» for a missing amount', () => {
    expect(formatCurrency(null)).toBe('بيانات ناقصة');
  });
});

describe('Legal defaults (Law 22/2008)', () => {
  it('certificate presets follow art. 11 without a higher-degree extra', () => {
    const rate = (n) => LEGAL_EDUCATION_DEGREES.find(d => d.name === n).allowance_rate;
    expect(rate('دكتوراه')).toBe(100);
    expect(rate('ماجستير')).toBe(75);
    expect(rate('دبلوم عالي')).toBe(55);
    expect(rate('بكالوريوس')).toBe(45);
    expect(rate('دبلوم فني')).toBe(35);
    expect(rate('إعدادية')).toBe(25);
    expect(rate('متوسطة')).toBe(15);
    expect(rate('ابتدائية')).toBe(15);
    expect(rate('يقرأ ويكتب')).toBe(15);
    expect(LEGAL_EDUCATION_DEGREES.every(d => d.higher_allowance_rate === 0)).toBe(true);
  });

  it('PhD is paid 100% once (not 200%) with the default table', () => {
    const r = calculateSalary(emp({ education_level: 'دكتوراه' }));
    expect(r.degree_allowance).toBe(600000);
    expect(r.higher_degree_allowance).toBe(0);
  });

  it('responsibility fallback follows art. 10', () => {
    expect(RESPONSIBILITY_ALLOWANCE_RATES['معاون مدير عام']).toBe(0.30);
    expect(RESPONSIBILITY_ALLOWANCE_RATES['مدير']).toBe(0.25);
    expect(RESPONSIBILITY_ALLOWANCE_RATES['مدير قسم']).toBe(0.20);
    expect(RESPONSIBILITY_ALLOWANCE_RATES['مسؤول شعبة']).toBe(0.15);
  });

  it('does not pay an unverified responsibility rate and warns instead', () => {
    const r = calculateSalary(emp({ primary_responsibility: 'مدير عام' }));
    expect(r.position_allowance).toBe(0);
    expect(r.warnings.some(w => w.includes('يُتحقق'))).toBe(true);
  });

  it('spouse 50,000 and child 10,000 up to 4', () => {
    expect(SPOUSE_ALLOWANCE).toBe(50000);
    expect(CHILD_ALLOWANCE).toBe(10000);
    const r = calculateSalary(emp({ marital_status: 'متزوج', children_count: 6 }));
    expect(r.spouse_allowance).toBe(50000);
    expect(r.children_allowance).toBe(40000);
  });

  it('dependent allowance covers widow/widower/divorced woman (art. 14 as amended) but not a divorced man', () => {
    expect(getEligibleSpouseCount({ marital_status: 'أرملة' })).toBe(1);
    expect(getEligibleSpouseCount({ marital_status: 'أرمل' })).toBe(1);
    expect(getEligibleSpouseCount({ marital_status: 'مطلقة' })).toBe(1);
    expect(getEligibleSpouseCount({ marital_status: 'مطلق' })).toBe(0);
    expect(getEligibleSpouseCount({ marital_status: 'أعزب' })).toBe(0);
  });

  it('child eligibility: daughter needs recorded unmarried & not-employed status; son stops at 24', () => {
    const at = new Date(2026, 9, 1);
    expect(evaluateChildEligibility({ birth_date: '2005-01-01', gender: 'أنثى', marital_status: 'غير متزوجة', is_employed: false }, at).eligible).toBe(true);
    expect(evaluateChildEligibility({ birth_date: '2005-01-01', gender: 'أنثى' }, at).eligible).toBe(false);
    expect(evaluateChildEligibility({ birth_date: '2005-01-01', gender: 'أنثى', marital_status: 'متزوجة' }, at).eligible).toBe(false);
    const son24 = { birth_date: '2002-01-01', gender: 'ذكر', extension_order_number: '1', extension_start_date: '2025-01-01', extension_end_date: '2027-12-31' };
    expect(evaluateChildEligibility(son24, at).eligible).toBe(false);
    expect(evaluateChildEligibility({ gender: 'ذكر' }, at).eligible).toBe(false); // unknown birth date
  });
});

describe('Decimal percentages', () => {
  it('applies 2.5% exactly', () => {
    const items = [{ id: 'd', name: 'اشتراك', type: 'deduction', calcType: 'percentage', value: '2.5', status: 'فعال' }];
    const r = calculateSalary(emp(), { allowancesDeductions: items, retirementStatus: 'inactive' });
    expect(r.general_custom_deductions).toBe(15000);
  });

  it('accepts a decimal retirement rate from the record', () => {
    const items = [{ id: 'r', name: 'استقطاع التقاعد', type: 'deduction', calcType: 'percentage', value: 10.5, status: 'فعال' }];
    const r = calculateSalary(emp(), { allowancesDeductions: items });
    expect(r.retirement_deduction).toBe(63000);
  });
});

describe('Shared payroll settings helpers', () => {
  it('treats "مستمر" (the DB default) as active and excludes other statuses', async () => {
    const { isPayrollActiveEmployee } = await import('./salaryTable.js');
    expect(isPayrollActiveEmployee({ status: 'مستمر' })).toBe(true);
    expect(isPayrollActiveEmployee({ status: 'فعال' })).toBe(true);
    expect(isPayrollActiveEmployee({ status: 'مستقيل' })).toBe(false);
    expect(isPayrollActiveEmployee({ status: 'متقاعد' })).toBe(false);
    expect(isPayrollActiveEmployee({})).toBe(false);
  });

  it('loadPayrollSettings builds the scale map and surfaces errors instead of swallowing them', async () => {
    const { loadPayrollSettings } = await import('./salaryTable.js');
    const api = {
      entities: {
        SalaryScale: { list: async () => [{ grade: 5, step: 1, amount: 500000 }] },
        AllowanceDeduction: { list: async () => [] },
        EducationDegree: { list: async () => { throw new Error('500'); } },
        ResponsibilityAllowance: { list: async () => [] },
        WorkLocation: { list: async () => [] },
      },
      settings: { get: async () => ({ maxChildrenCount: 3 }) },
    };
    const { options, errors } = await loadPayrollSettings(api);
    expect(options.customSalaryTable[5][1]).toBe(500000);
    expect(options.systemSettings.maxChildrenCount).toBe(3);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('جدول الشهادات');
    const r = calculateSalary({ grade: 5, step: 1 }, options);
    expect(r.base_salary).toBe(500000);
  });
});

describe('B4a: payroll eligibility from the status table', () => {
  it('reads payroll_eligible and keeps empty status excluded', async () => {
    const { isPayrollActiveEmployee } = await import('./salaryTable.js');
    const statuses = [
      { name: 'مستمر', payroll_eligible: true, is_default: true },
      { name: 'مجاز', payroll_eligible: true },
      { name: 'منسب', payroll_eligible: false },
    ];
    expect(isPayrollActiveEmployee({ status: 'مجاز' }, statuses)).toBe(true);
    expect(isPayrollActiveEmployee({ status: 'منسب' }, statuses)).toBe(false);
    expect(isPayrollActiveEmployee({ status: 'فعال' }, statuses)).toBe(false);
    expect(isPayrollActiveEmployee({}, statuses)).toBe(false);
    // نداء filter يمرّر الفهرس كوسيط ثانٍ: ما يكسر السلوك القديم
    expect([{ status: 'مستمر' }].filter(isPayrollActiveEmployee)).toHaveLength(1);
  });
});
