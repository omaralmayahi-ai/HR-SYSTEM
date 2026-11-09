import { describe, it, expect } from 'vitest';
import { 
  calculateSalary, 
  isChildEligible,
  getEligibleSpouseCount
} from './salaryTable.js';

describe('Family & Dynamic Allowances Calculation Engine (المخصصات العائلية والمستمرة والمؤقتة)', () => {

  // 1. مخصص الزوجية (ذكر وأنثى متزوجين)
  describe('المخصص الزوجي (Marital Allowance)', () => {
    it('should grant marital allowance to married male employee', () => {
      const maleEmp = {
        grade: 5,
        step: 1,
        gender: 'ذكر',
        marital_status: 'متزوج',
        children_count: 0
      };
      const result = calculateSalary(maleEmp);
      expect(result.spouse_allowance).toBe(50000);
      expect(result.allowances_breakdown.some(item => item.name.includes('الزوجية') && item.amount === 50000)).toBe(true);
    });

    it('should grant marital allowance to married female employee (مساواة ومخصص عائلي شامل)', () => {
      const femaleEmp = {
        grade: 5,
        step: 1,
        gender: 'أنثى',
        marital_status: 'متزوجة',
        children_count: 0
      };
      const result = calculateSalary(femaleEmp);
      expect(result.spouse_allowance).toBe(50000);
      expect(result.allowances_breakdown.some(item => item.name.includes('الزوجية') && item.amount === 50000)).toBe(true);
    });

    it('should correctly calculate percentage-based marital allowance when configured', () => {
      const emp = {
        grade: 1,
        step: 1, // base salary = 910000
        marital_status: 'متزوج'
      };
      const customOverrides = [
        {
          id: 'spouse-percent-rule',
          name: 'المخصص الزوجي',
          type: 'allowance',
          calc_type: 'percentage',
          value: 10, // 10% of base salary
          status: 'فعال'
        }
      ];
      const result = calculateSalary(emp, { allowancesDeductions: customOverrides });
      expect(result.spouse_allowance).toBe(91000); // 10% of 910000
    });
  });

  // 2. مخصص الأطفال والحدود العمرية والتمديدات
  describe('مخصص الأولاد وتمديد مخصص الولد (Children Allowance & Extensions)', () => {
    it('should calculate child allowance for children under 18 years', () => {
      const emp = {
        grade: 5,
        step: 1,
        marital_status: 'متزوج',
        children_count: 2,
        children_details: JSON.stringify([
          { name: 'أحمد', birth_date: '2015-05-10', gender: 'ذكر' },
          { name: 'مريم', birth_date: '2018-09-20', gender: 'أنثى' }
        ])
      };
      const result = calculateSalary(emp, { targetYear: 2026, targetMonth: 10 });
      expect(result.children_allowance).toBe(20000); // 2 children * 10,000
    });

    it('should exclude children above 18 without active extension', () => {
      const emp = {
        grade: 5,
        step: 1,
        children_count: 2,
        children_details: JSON.stringify([
          { name: 'سامر', birth_date: '2000-01-01', gender: 'ذكر', extension_reason: 'لا يوجد' }, // age 26 > 18
          { name: 'ليلى', birth_date: '2016-01-01', gender: 'أنثى' } // age 10 < 18
        ])
      };
      const result = calculateSalary(emp, { targetYear: 2026, targetMonth: 10 });
      expect(result.children_allowance).toBe(10000); // only 1 eligible child
    });

    it('should grant child allowance to child above 18 if extension is active with valid dates', () => {
      const emp = {
        grade: 5,
        step: 1,
        children_count: 1,
        children_details: JSON.stringify([
          { 
            name: 'حسين', 
            birth_date: '2005-01-01', // age 21
            gender: 'ذكر',
            extension_order_number: '123/ق',
            extension_order_date: '2025-01-01',
            extension_start_date: '2025-01-01',
            extension_end_date: '2027-12-31',
            extension_reason: 'طالب جامعي'
          }
        ])
      };
      // For payroll period 2026-10 (within 2025-2027), extension is active
      const result = calculateSalary(emp, { targetYear: 2026, targetMonth: 10 });
      expect(result.children_allowance).toBe(10000);
      expect(result.allowances_breakdown.some(item => item.name.includes('الأطفال') && item.amount === 10000)).toBe(true);
    });

    it('should halt child allowance once extension expires', () => {
      const emp = {
        grade: 5,
        step: 1,
        children_count: 1,
        children_details: JSON.stringify([
          { 
            name: 'حسين', 
            birth_date: '2005-01-01', // age 21
            gender: 'ذكر',
            extension_order_number: '123/ق',
            extension_order_date: '2024-01-01',
            extension_start_date: '2024-01-01',
            extension_end_date: '2025-12-31', // expired before 2026-10
            extension_reason: 'طالب جامعي'
          }
        ])
      };
      const result = calculateSalary(emp, { targetYear: 2026, targetMonth: 10 });
      expect(result.children_allowance).toBe(0);
    });

    it('should respect customizable max children limit and child amount', () => {
      const emp = {
        grade: 5,
        step: 1,
        children_count: 6,
        children_details: JSON.stringify([
          { name: '1', birth_date: '2015-01-01' },
          { name: '2', birth_date: '2016-01-01' },
          { name: '3', birth_date: '2017-01-01' },
          { name: '4', birth_date: '2018-01-01' },
          { name: '5', birth_date: '2019-01-01' },
          { name: '6', birth_date: '2020-01-01' }
        ])
      };
      const customOverrides = [
        {
          name: 'مخصص الأطفال',
          type: 'allowance',
          value: 15000,
          rules: { maxChildrenCount: 3 },
          status: 'فعال'
        }
      ];
      const result = calculateSalary(emp, { allowancesDeductions: customOverrides });
      expect(result.children_allowance).toBe(45000); // 3 * 15,000
    });
  });

  // 3. النفاذ الزمني (تاريخ النفاذ وتاريخ الإيقاف) والسجلات التاريخية
  describe('النفاذ الزمني وتاريخ الإيقاف (Effective Dates & History Integrity)', () => {
    it('should NOT apply allowance before its effective date', () => {
      const emp = { grade: 5, step: 1 };
      const customOverrides = [
        {
          id: 'future-risk-allowance',
          name: 'مخصص خطورة جديد',
          type: 'allowance',
          calc_type: 'flat',
          value: 100000,
          effective_date: '2026-11-01', // starts in Nov 2026
          status: 'فعال'
        }
      ];
      // Test for Oct 2026
      const resultOct = calculateSalary(emp, { 
        allowancesDeductions: customOverrides,
        targetYear: 2026, 
        targetMonth: 10 
      });
      expect(resultOct.allowances_breakdown.some(item => item.name === 'مخصص خطورة جديد')).toBe(false);

      // Test for Nov 2026
      const resultNov = calculateSalary(emp, { 
        allowancesDeductions: customOverrides,
        targetYear: 2026, 
        targetMonth: 11 
      });
      expect(resultNov.allowances_breakdown.some(item => item.name === 'مخصص خطورة جديد' && item.amount === 100000)).toBe(true);
    });

    it('should retain allowance for past periods before deactivation date but halt for future periods', () => {
      const emp = { grade: 5, step: 1 };
      const customOverrides = [
        {
          id: 'stopped-transport-allowance',
          name: 'مخصص نقل خاص',
          type: 'allowance',
          calc_type: 'flat',
          value: 50000,
          effective_date: '2026-01-01',
          deactivated_at: '2026-06-01', // stopped from June 2026
          status: 'متوقف'
        }
      ];
      // Past period (May 2026) -> Should still receive allowance in historical calc
      const resultMay = calculateSalary(emp, { 
        allowancesDeductions: customOverrides,
        targetYear: 2026, 
        targetMonth: 5 
      });
      expect(resultMay.allowances_breakdown.some(item => item.name === 'مخصص نقل خاص' && item.amount === 50000)).toBe(true);

      // Future period (July 2026) -> Should NOT receive allowance
      const resultJuly = calculateSalary(emp, { 
        allowancesDeductions: customOverrides,
        targetYear: 2026, 
        targetMonth: 7 
      });
      expect(resultJuly.allowances_breakdown.some(item => item.name === 'مخصص نقل خاص')).toBe(false);
    });
  });

  // 4. انعكاس المحددات والشروط (الكل vs الفئات المحددة)
  describe('انعكاس المحددات والشروط على الموظفين (Targeting & Categories)', () => {
    it('should apply allowance to ALL employees when no categories or constraints are defined', () => {
      const emp1 = { grade: 1, department: 'قسم تقنية المعلومات' };
      const emp2 = { grade: 7, department: 'القسم القانوني' };
      const generalAllowance = [
        {
          id: 'general-bonus',
          name: 'منحة غلاء معيشة عامة',
          type: 'allowance',
          calc_type: 'flat',
          value: 75000,
          rules: {}, // no constraints
          status: 'فعال'
        }
      ];
      const res1 = calculateSalary(emp1, { allowancesDeductions: generalAllowance });
      const res2 = calculateSalary(emp2, { allowancesDeductions: generalAllowance });
      expect(res1.allowances_breakdown.some(i => i.name === 'منحة غلاء معيشة عامة')).toBe(true);
      expect(res2.allowances_breakdown.some(i => i.name === 'منحة غلاء معيشة عامة')).toBe(true);
    });

    it('should apply allowance ONLY to matching department employees when constrained', () => {
      const itEmp = { grade: 3, department: 'قسم تقنية المعلومات' };
      const legalEmp = { grade: 3, department: 'القسم القانوني' };
      const itAllowance = [
        {
          id: 'it-special-allowance',
          name: 'مخصصات كادر تكنولوجيا المعلومات',
          type: 'allowance',
          calc_type: 'flat',
          value: 120000,
          rules: { departments: ['قسم تقنية المعلومات'] },
          status: 'فعال'
        }
      ];
      const resIT = calculateSalary(itEmp, { allowancesDeductions: itAllowance });
      const resLegal = calculateSalary(legalEmp, { allowancesDeductions: itAllowance });
      expect(resIT.allowances_breakdown.some(i => i.name === 'مخصصات كادر تكنولوجيا المعلومات')).toBe(true);
      expect(resLegal.allowances_breakdown.some(i => i.name === 'مخصصات كادر تكنولوجيا المعلومات')).toBe(false);
    });

    it('should prevent duplicate allowance entries in same salary period', () => {
      const emp = { grade: 5, step: 1 };
      const duplicateAllowances = [
        {
          id: 'dup-allowance-1',
          name: 'مخصص مخاطر العمل',
          type: 'allowance',
          calc_type: 'flat',
          value: 50000,
          status: 'فعال'
        },
        {
          id: 'dup-allowance-1', // same ID duplicate in payload
          name: 'مخصص مخاطر العمل',
          type: 'allowance',
          calc_type: 'flat',
          value: 50000,
          status: 'فعال'
        }
      ];
      const res = calculateSalary(emp, { allowancesDeductions: duplicateAllowances });
      const count = res.allowances_breakdown.filter(i => i.name === 'مخصص مخاطر العمل').length;
      expect(count).toBe(1);
    });
  });
});
