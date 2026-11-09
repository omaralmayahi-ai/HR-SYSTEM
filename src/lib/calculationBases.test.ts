import { describe, it, expect } from 'vitest';
import { calculateSalary } from './salaryTable';

describe('Independent Calculation Bases for Allowances and Deductions', () => {
  const baseEmployee = {
    id: 101,
    full_name: 'علي حسن أحمد',
    employee_number: 'EMP-001',
    grade: 5,
    step: 1, // Salary table Grade 5, Step 1 = 429000 IQD in standard table, or specified
    marital_status: 'أعزب',
    children_count: 0,
    education_level: null,
    primary_responsibility: null,
    work_location: null,
  };

  const customSalaryTable = {
    5: { 1: 500000 }
  };

  it('1. Calculates percentage allowances and deductions from Nominal Salary (الراتب الاسمي)', () => {
    const customItems = [
      {
        id: 1,
        name: 'مخصص مخاطر مهنية',
        type: 'allowance',
        calcType: 'percentage',
        calculationBase: 'nominal',
        value: 10, // 10% of 500,000 = 50,000
        status: 'فعال'
      },
      {
        id: 2,
        name: 'استقطاع صندوق التكافل',
        type: 'deduction',
        calcType: 'percentage',
        calculationBase: 'nominal',
        value: 2, // 2% of 500,000 = 10,000
        status: 'فعال'
      }
    ];

    const result = calculateSalary(baseEmployee, {
      customSalaryTable,
      allowancesDeductions: customItems,
      retirementStatus: 'inactive' // Disable retirement to isolate
    });

    expect(result.base_salary).toBe(500000);
    expect(result.general_custom_allowances).toBe(50000);
    expect(result.total_allowances).toBe(50000);
    expect(result.general_custom_deductions).toBe(10000);
    expect(result.total_deductions).toBe(10000);
    expect(result.net_salary).toBe(500000 + 50000 - 10000); // 540,000

    const allowanceEntry = result.allowances_breakdown.find(a => a.id === 1);
    expect(allowanceEntry).toBeDefined();
    expect(allowanceEntry.amount).toBe(50000);
    expect(allowanceEntry.calculationBase).toBe('nominal');
    expect(allowanceEntry.baseAmount).toBe(500000);

    const deductionEntry = result.deductions_breakdown.find(d => d.id === 2);
    expect(deductionEntry).toBeDefined();
    expect(deductionEntry.amount).toBe(10000);
    expect(deductionEntry.calculationBase).toBe('nominal');
    expect(deductionEntry.baseAmount).toBe(500000);
  });

  it('2. Calculates percentage allowances from Gross Salary before deductions (الراتب الكلي قبل الاستقطاعات)', () => {
    const customItems = [
      {
        id: 10,
        name: 'مخصص إشرافي مقطوع',
        type: 'allowance',
        calcType: 'flat',
        value: 100000,
        status: 'فعال'
      },
      {
        id: 11,
        name: 'مخصص موقع عمل نسبي من الكلي',
        type: 'allowance',
        calcType: 'percentage',
        calculationBase: 'gross',
        value: 10, // Base = 500,000 + 100,000 = 600,000 -> 10% = 60,000
        status: 'فعال'
      }
    ];

    const result = calculateSalary(baseEmployee, {
      customSalaryTable,
      allowancesDeductions: customItems,
      retirementStatus: 'inactive'
    });

    expect(result.base_salary).toBe(500000);
    expect(result.general_custom_allowances).toBe(160000); // 100,000 + 60,000
    expect(result.total_allowances).toBe(160000);
    expect(result.net_salary).toBe(660000);

    const grossAllowanceEntry = result.allowances_breakdown.find(a => a.id === 11);
    expect(grossAllowanceEntry).toBeDefined();
    expect(grossAllowanceEntry.amount).toBe(60000);
    expect(grossAllowanceEntry.calculationBase).toBe('gross');
    expect(grossAllowanceEntry.baseAmount).toBe(600000);
    expect(grossAllowanceEntry.details).toContain('من الراتب الكلي قبل الاستقطاعات');
  });

  it('3. Calculates percentage deductions from Net Salary after other deductions without self-inclusion (صافي الراتب بعد الاستقطاعات الأخرى)', () => {
    const customItems = [
      {
        id: 20,
        name: 'مخصص مهني ثابت',
        type: 'allowance',
        calcType: 'flat',
        value: 100000, // Gross = 500,000 + 100,000 = 600,000
        status: 'فعال'
      },
      {
        id: 21,
        name: 'استقطاع اشتراك ثابت',
        type: 'deduction',
        calcType: 'flat',
        value: 30000,
        status: 'فعال'
      },
      {
        id: 22,
        name: 'استقطاع صندوق التضامن النسبي من الصافي',
        type: 'deduction',
        calcType: 'percentage',
        calculationBase: 'net',
        value: 5, // 5% of Net after other deductions
        status: 'فعال'
      }
    ];

    // Other deductions: Retirement (10% of 500,000 = 50,000) + Fixed 30,000 = 80,000
    // Gross = 600,000
    // Net before deduction #22 = 600,000 - 80,000 = 520,000
    // Deduction #22 (5% of 520,000) = 26,000
    // Final Net Salary = 520,000 - 26,000 = 494,000

    const result = calculateSalary(baseEmployee, {
      customSalaryTable,
      allowancesDeductions: customItems,
      retirementStatus: 'active' // 10% retirement active
    });

    expect(result.base_salary).toBe(500000);
    expect(result.total_allowances).toBe(100000);
    expect(result.retirement_deduction).toBe(50000);
    expect(result.general_custom_deductions).toBe(30000 + 26000); // 56,000
    expect(result.total_deductions).toBe(50000 + 56000); // 106,000
    expect(result.net_salary).toBe(494000);

    const netDeductionEntry = result.deductions_breakdown.find(d => d.id === 22);
    expect(netDeductionEntry).toBeDefined();
    expect(netDeductionEntry.amount).toBe(26000);
    expect(netDeductionEntry.calculationBase).toBe('net');
    expect(netDeductionEntry.baseAmount).toBe(520000); // Strictly excludes itself
    expect(netDeductionEntry.details).toContain('من صافي الراتب بعد الاستقطاعات الأخرى');
  });

  it('4. Keeps flat amount (مبلغ مقطوع) items completely unchanged regardless of calculation base', () => {
    const customItems = [
      {
        id: 31,
        name: 'مخصص مقطوع ثابت',
        type: 'allowance',
        calcType: 'flat',
        calculationBase: 'gross', // should be ignored
        value: 75000,
        status: 'فعال'
      },
      {
        id: 32,
        name: 'استقطاع مقطوع ثابت',
        type: 'deduction',
        calcType: 'flat',
        calculationBase: 'net', // should be ignored
        value: 25000,
        status: 'فعال'
      }
    ];

    const result = calculateSalary(baseEmployee, {
      customSalaryTable,
      allowancesDeductions: customItems,
      retirementStatus: 'inactive'
    });

    expect(result.general_custom_allowances).toBe(75000);
    expect(result.general_custom_deductions).toBe(25000);
    expect(result.net_salary).toBe(500000 + 75000 - 25000); // 550,000

    const aEntry = result.allowances_breakdown.find(a => a.id === 31);
    expect(aEntry.amount).toBe(75000);
    expect(aEntry.calcType).toBe('flat');

    const dEntry = result.deductions_breakdown.find(d => d.id === 32);
    expect(dEntry.amount).toBe(25000);
    expect(dEntry.calcType).toBe('flat');
  });

  it('5. Independent configuration does not affect other items, and breakdown displays accurate details', () => {
    const customItems = [
      {
        id: 41,
        name: 'مخصص أ (اسمي)',
        type: 'allowance',
        calcType: 'percentage',
        calculationBase: 'nominal',
        value: 10, // 10% of 500,000 = 50,000
        status: 'فعال'
      },
      {
        id: 42,
        name: 'مخصص ب (كلي)',
        type: 'allowance',
        calcType: 'percentage',
        calculationBase: 'gross',
        value: 5, // 5% of (500,000 + 50,000) = 5% of 550,000 = 27,500
        status: 'فعال'
      },
      {
        id: 43,
        name: 'استقطاع أ (اسمي)',
        type: 'deduction',
        calcType: 'percentage',
        calculationBase: 'nominal',
        value: 2, // 2% of 500,000 = 10,000
        status: 'فعال'
      },
      {
        id: 44,
        name: 'استقطاع ب (كلي)',
        type: 'deduction',
        calcType: 'percentage',
        calculationBase: 'gross',
        value: 2, // 2% of Total Gross (500,000 + 50,000 + 27,500 = 577,500) = 11,550
        status: 'فعال'
      },
      {
        id: 45,
        name: 'استقطاع ج (صافي)',
        type: 'deduction',
        calcType: 'percentage',
        calculationBase: 'net',
        value: 10, // 10% of Net after other deductions
        status: 'فعال'
      }
    ];

    // Gross = 500,000 + 50,000 + 27,500 = 577,500
    // Deductions so far (no retirement):
    // Stq A = 10,000
    // Stq B = 11,550
    // Deductions so far = 21,550
    // Net before Stq C = 577,500 - 21,550 = 555,950
    // Stq C = 10% of 555,950 = 55,595
    // Total Deductions = 21,550 + 55,595 = 77,145
    // Net Salary = 577,500 - 77,145 = 500,355

    const result = calculateSalary(baseEmployee, {
      customSalaryTable,
      allowancesDeductions: customItems,
      retirementStatus: 'inactive'
    });

    expect(result.general_custom_allowances).toBe(50000 + 27500); // 77,500
    expect(result.total_allowances).toBe(77500);
    expect(result.general_custom_deductions).toBe(10000 + 11550 + 55595); // 77,145
    expect(result.total_deductions).toBe(77145);
    expect(result.net_salary).toBe(500355);

    // Verify all breakdown metadata
    expect(result.allowances_breakdown.find(a => a.id === 41).baseAmount).toBe(500000);
    expect(result.allowances_breakdown.find(a => a.id === 42).baseAmount).toBe(550000);
    expect(result.deductions_breakdown.find(d => d.id === 43).baseAmount).toBe(500000);
    expect(result.deductions_breakdown.find(d => d.id === 44).baseAmount).toBe(577500);
    expect(result.deductions_breakdown.find(d => d.id === 45).baseAmount).toBe(555950);
  });
});
