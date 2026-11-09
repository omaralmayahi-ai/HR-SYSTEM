import { describe, it, expect } from 'vitest';
import { calculateSalary } from './salaryTable';

describe('Decimal Percentages in Allowances and Deductions (النسب المئوية العشرية)', () => {
  const sampleEmployee = {
    id: 101,
    grade: 3,
    step: 1, // Base salary for Grade 3 Step 1 is 600,000 IQD
    marital_status: 'أعزب',
    children_count: 0,
    education_level: 'بكالوريوس',
    primary_responsibility: 'عضو ارتباط'
  };

  it('calculates custom deduction with 1.5% percentage correctly without rounding to integer', () => {
    const customDeductions = [
      {
        id: 'ded_1_5',
        name: 'استقطاع صندوق التكافل العشري',
        type: 'deduction',
        calcType: 'percentage',
        value: 1.5,
        status: 'فعال'
      }
    ];

    const result = calculateSalary(sampleEmployee, { allowancesDeductions: customDeductions });
    expect(result.base_salary).toBe(600000);
    
    // 600,000 * 1.5% = 9,000 IQD
    expect(result.general_custom_deductions).toBe(9000);
    
    const dedItem = result.deductions_breakdown.find((d: any) => d.id === 'ded_1_5');
    expect(dedItem).toBeDefined();
    expect(dedItem.amount).toBe(9000);
    expect(dedItem.details).toContain('1.5%');
  });

  it('calculates custom allowance with 1.5% percentage correctly', () => {
    const customAllowances = [
      {
        id: 'all_1_5',
        name: 'مخصص تميز فني عشري',
        type: 'allowance',
        calcType: 'percentage',
        value: 1.5,
        status: 'فعال'
      }
    ];

    const result = calculateSalary(sampleEmployee, { allowancesDeductions: customAllowances });
    expect(result.base_salary).toBe(600000);
    
    // 600,000 * 1.5% = 9,000 IQD
    expect(result.general_custom_allowances).toBe(9000);
    
    const allItem = result.allowances_breakdown.find((a: any) => a.id === 'all_1_5');
    expect(allItem).toBeDefined();
    expect(allItem.amount).toBe(9000);
    expect(allItem.details).toContain('1.5%');
  });

  it('maintains support for integer percentage like 5% and 1%', () => {
    const customItems = [
      {
        id: 'ded_5',
        name: 'استقطاع نقابة 5%',
        type: 'deduction',
        calcType: 'percentage',
        value: 5,
        status: 'فعال'
      },
      {
        id: 'all_1',
        name: 'مخصص مهني 1%',
        type: 'allowance',
        calcType: 'percentage',
        value: 1,
        status: 'فعال'
      }
    ];

    const result = calculateSalary(sampleEmployee, { allowancesDeductions: customItems });
    // 600,000 * 5% = 30,000 IQD
    expect(result.general_custom_deductions).toBe(30000);
    // 600,000 * 1% = 6,000 IQD
    expect(result.general_custom_allowances).toBe(6000);
  });

  it('handles fractional decimal percentages like 2.75% and 0.5%', () => {
    const customItems = [
      {
        id: 'ded_2_75',
        name: 'استقطاع نسبي 2.75%',
        type: 'deduction',
        calcType: 'percentage',
        value: 2.75,
        status: 'فعال'
      },
      {
        id: 'all_0_5',
        name: 'مخصص نسبي 0.5%',
        type: 'allowance',
        calcType: 'percentage',
        value: 0.5,
        status: 'فعال'
      }
    ];

    const result = calculateSalary(sampleEmployee, { allowancesDeductions: customItems });
    // 600,000 * 2.75% = 16,500 IQD
    expect(result.general_custom_deductions).toBe(16500);
    // 600,000 * 0.5% = 3,000 IQD
    expect(result.general_custom_allowances).toBe(3000);
  });

  it('calculates education degree with decimal allowance rate', () => {
    const customDegrees = [
      {
        name: 'دبلوم عالي تخصصي',
        is_higher_education: false,
        allowance_rate: 37.5,
        baseline_grade: 6,
        baseline_step: 1
      }
    ];

    const emp = {
      ...sampleEmployee,
      education_level: 'دبلوم عالي تخصصي'
    };

    const result = calculateSalary(emp, { customEducationDegrees: customDegrees });
    // 600,000 * 37.5% = 225,000 IQD
    expect(result.degree_allowance).toBe(225000);
  });
});
