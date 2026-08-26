import { describe, it, expect } from 'vitest';
import { 
  calculateSalary, 
  SALARY_TABLE, 
  EDUCATION_ALLOWANCES, 
  RESPONSIBILITY_ALLOWANCE_RATES, 
  SPOUSE_ALLOWANCE, 
  CHILD_ALLOWANCE, 
  RETIREMENT_RATE 
} from './salaryTable.js';

describe('Salary Calculation Engine (محرك حساب الرواتب)', () => {

  // 1. الحالة الأساسية (الأبسط): موظف بدون مخصصات إضافية
  it('should correctly calculate base salary and default retirement for Grade 1 Step 1 employee without extras', () => {
    const employee = {
      grade: 1,
      step: 1,
      marital_status: 'أعزب',
      children_count: 0
    };

    const result = calculateSalary(employee);

    expect(result.base_salary).toBe(910000);
    expect(result.degree_allowance).toBe(0);
    expect(result.spouse_allowance).toBe(0);
    expect(result.children_allowance).toBe(0);
    expect(result.position_allowance).toBe(0);
    expect(result.total_allowances).toBe(0);

    // 10% retirement deduction on 910,000 = 91,000
    expect(result.retirement_deduction).toBe(91000);
    expect(result.total_deductions).toBe(91000);

    // Net salary = 910,000 - 91,000 = 819,000
    expect(result.net_salary).toBe(819000);
  });

  it('should correctly calculate base salary for Grade 5 Step 2 employee', () => {
    const employee = {
      grade: 5,
      step: 2,
      marital_status: 'أعزب',
      children_count: 0
    };

    const result = calculateSalary(employee);

    expect(result.base_salary).toBe(435000);
    expect(result.retirement_deduction).toBe(43500);
    expect(result.net_salary).toBe(435000 - 43500);
  });

  // 2. موظف بمخصص شهادة علمية (دكتوراه، ماجستير، بكالوريوس)
  it('should add correct education allowance for PhD (دكتوراه)', () => {
    const employee = {
      grade: 3,
      step: 1,
      education_level: 'دكتوراه',
      marital_status: 'أعزب'
    };

    const result = calculateSalary(employee);

    expect(result.base_salary).toBe(600000);
    expect(result.degree_allowance).toBe(350000);
    expect(result.total_allowances).toBe(350000);
    expect(result.retirement_deduction).toBe(60000); // 10% of 600,000
    expect(result.net_salary).toBe(600000 + 350000 - 60000);
  });

  it('should add correct education allowance for Master degree (ماجستير)', () => {
    const employee = {
      grade: 4,
      step: 1,
      education_level: 'ماجستير',
      marital_status: 'أعزب'
    };

    const result = calculateSalary(employee);

    expect(result.base_salary).toBe(509000);
    expect(result.degree_allowance).toBe(250000);
    expect(result.total_allowances).toBe(250000);
  });

  it('should add correct education allowance for Bachelor degree (بكالوريوس)', () => {
    const employee = {
      grade: 7,
      step: 1,
      education_level: 'بكالوريوس',
      marital_status: 'أعزب'
    };

    const result = calculateSalary(employee);

    expect(result.base_salary).toBe(296000);
    expect(result.degree_allowance).toBe(150000);
    expect(result.total_allowances).toBe(150000);
  });

  // 3. موظف متزوج وله أطفال
  it('should grant spouse allowance (75,000) and child allowance (30,000/child) for married employee with 2 children', () => {
    const employee = {
      grade: 6,
      step: 1,
      marital_status: 'متزوج',
      children_count: 2
    };

    const result = calculateSalary(employee);

    expect(result.base_salary).toBe(362000);
    expect(result.spouse_allowance).toBe(75000);
    expect(result.children_allowance).toBe(60000); // 2 * 30,000
    expect(result.total_allowances).toBe(75000 + 60000);
    expect(result.retirement_deduction).toBe(36200); // 10% of base 362,000
    expect(result.net_salary).toBe(362000 + 135000 - 36200);
  });

  it('should cap children allowance to maximum of 4 children by default', () => {
    const employee = {
      grade: 6,
      step: 1,
      marital_status: 'متزوج',
      children_count: 6 // 6 children
    };

    const result = calculateSalary(employee);

    expect(result.spouse_allowance).toBe(75000);
    // Capped at 4 children * 30,000 = 120,000
    expect(result.children_allowance).toBe(120000);
    expect(result.total_allowances).toBe(75000 + 120000);
  });

  // 4. استقطاع التقاعد بالنسبة الافتراضية
  it('should deduct exactly 10% retirement from base salary', () => {
    const employee = {
      grade: 2,
      step: 3,
      marital_status: 'أعزب'
    };

    const result = calculateSalary(employee);

    expect(result.base_salary).toBe(757000);
    expect(result.retirement_deduction).toBe(75700);
    expect(result.net_salary).toBe(757000 - 75700);
  });

  // 5. سيناريو شامل يجمع كافة العناصر (شهادة + زوجية + أطفال + منصب + استقطاعات إضافية)
  it('should compute full salary equation correctly with all components combined', () => {
    const employee = {
      grade: 4,
      step: 1,
      education_level: 'ماجستير',
      marital_status: 'متزوج',
      children_count: 3,
      primary_responsibility: 'مدير قسم' // 25% of base salary
    };

    const extraAllowances = 20000;
    const loanDeduction = 50000;
    const penaltyDeduction = 15000;
    const absenceDeduction = 10000;
    const otherDeductions = 5000;

    const result = calculateSalary(
      employee, 
      extraAllowances, 
      loanDeduction, 
      penaltyDeduction, 
      absenceDeduction, 
      otherDeductions
    );

    const expectedBase = 509000;
    const expectedDegree = 250000;
    const expectedPosition = Math.round(509000 * 0.25); // 127250
    const expectedSpouse = 75000;
    const expectedChildren = 3 * 30000; // 90000
    const expectedTotalAllowances = expectedDegree + expectedPosition + expectedSpouse + expectedChildren + extraAllowances; // 250000 + 127250 + 75000 + 90000 + 20000 = 562250

    const expectedRetirement = Math.round(509000 * 0.10); // 50900
    const expectedTotalDeductions = expectedRetirement + loanDeduction + penaltyDeduction + absenceDeduction + otherDeductions; // 50900 + 50000 + 15000 + 10000 + 5000 = 130900

    const expectedNet = expectedBase + expectedTotalAllowances - expectedTotalDeductions; // 509000 + 562250 - 130900 = 940350

    expect(result.base_salary).toBe(expectedBase);
    expect(result.degree_allowance).toBe(expectedDegree);
    expect(result.position_allowance).toBe(expectedPosition);
    expect(result.spouse_allowance).toBe(expectedSpouse);
    expect(result.children_allowance).toBe(expectedChildren);
    expect(result.total_allowances).toBe(expectedTotalAllowances);
    expect(result.retirement_deduction).toBe(expectedRetirement);
    expect(result.total_deductions).toBe(expectedTotalDeductions);
    expect(result.net_salary).toBe(expectedNet);
  });

  // 6. حالة حافة (Edge Case): تجاوز سلم الرواتب من قاعدة البيانات (Database Override)
  it('should prioritize customSalaryTable from database over default hardcoded scale', () => {
    const employee = {
      grade: 1,
      step: 1,
      marital_status: 'أعزب'
    };

    // Custom scale loaded from DB setting Grade 1 Step 1 to 1,200,000 instead of default 910,000
    const customSalaryTable = {
      1: {
        1: 1200000
      }
    };

    const result = calculateSalary(employee, 0, 0, 0, 0, 0, customSalaryTable);

    expect(result.base_salary).toBe(1200000);
    // Retirement deduction should be calculated on the overridden DB base salary (10% of 1,200,000 = 120,000)
    expect(result.retirement_deduction).toBe(120000);
    expect(result.net_salary).toBe(1200000 - 120000);
  });

  // 7. مخصصات الدرجة العلمية بنسبة مئوية من قاعدة البيانات (Custom Education Degrees from DB)
  it('should calculate education allowance using custom percentage degrees from DB when provided', () => {
    const employee = {
      grade: 3,
      step: 1,
      education_level: 'ماجستير'
    };

    const customDegrees = [
      {
        name: 'ماجستير',
        allowance_rate: 30, // 30% of base salary instead of flat 250,000
        is_higher_education: true,
        higher_allowance_rate: 10 // +10% higher degree bonus
      }
    ];

    const result = calculateSalary(employee, 0, 0, 0, 0, 0, null, null, customDegrees);

    const expectedBase = 600000;
    const expectedDegree = Math.round(600000 * 0.30); // 180000
    const expectedHigher = Math.round(600000 * 0.10); // 60000

    expect(result.base_salary).toBe(expectedBase);
    expect(result.degree_allowance).toBe(expectedDegree);
    expect(result.higher_degree_allowance).toBe(expectedHigher);
    expect(result.total_allowances).toBe(expectedDegree + expectedHigher);
  });

});
