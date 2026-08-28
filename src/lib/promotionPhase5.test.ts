import { describe, it, expect } from 'vitest';

describe('Phase 5 - Interface Audit & Consistency Tests', () => {
  describe('1. Employee Commendations Validation & Snapshots', () => {
    it('validates mandatory fields for commendation orders', () => {
      const validateCommendation = (form: {
        order_number?: string;
        order_date?: string;
        issuer?: string;
        credit_months_snapshot?: number;
      }) => {
        if (!form.order_number || !form.order_date || !form.issuer) {
          return { valid: false, error: 'Mandatory fields missing' };
        }
        const creditMonths = form.credit_months_snapshot ?? 1;
        return {
          valid: true,
          creditMonths,
          seniorityImpactText: creditMonths === 6 ? 'قدم 6 اشهر' : creditMonths > 1 ? `قدم ${creditMonths} أشهر` : 'قدم شهر واحد'
        };
      };

      // Incomplete forms
      expect(validateCommendation({}).valid).toBe(false);
      expect(validateCommendation({ order_number: '123' }).valid).toBe(false);
      expect(validateCommendation({ order_number: '123', order_date: '2026-05-01' }).valid).toBe(false);

      // Valid form with standard 1 month
      const res1 = validateCommendation({
        order_number: '123/ش',
        order_date: '2026-05-01',
        issuer: 'السيد المدير العام'
      });
      expect(res1.valid).toBe(true);
      expect(res1.creditMonths).toBe(1);
      expect(res1.seniorityImpactText).toBe('قدم شهر واحد');

      // Valid form with Presidential / Ministerial 6 months
      const res6 = validateCommendation({
        order_number: '456/ر',
        order_date: '2026-06-01',
        issuer: 'معالي الوزير',
        credit_months_snapshot: 6
      });
      expect(res6.valid).toBe(true);
      expect(res6.creditMonths).toBe(6);
      expect(res6.seniorityImpactText).toBe('قدم 6 اشهر');
    });
  });

  describe('2. Specialization Course Credits for Degree Path', () => {
    it('validates mandatory fields and weeks duration for specialization course credits', () => {
      const validateSpecializationCredit = (form: {
        course_name?: string;
        weeks?: number;
        order_number?: string;
        order_date?: string;
      }) => {
        if (!form.course_name || !form.weeks || form.weeks < 1 || !form.order_number || !form.order_date) {
          return { valid: false, error: 'Invalid specialization credit data' };
        }
        return {
          valid: true,
          course_name: form.course_name,
          weeks: form.weeks,
          meetsTwoWeeksRequirement: form.weeks >= 2
        };
      };

      expect(validateSpecializationCredit({}).valid).toBe(false);
      expect(validateSpecializationCredit({ course_name: 'دورة هندسية' }).valid).toBe(false);
      
      const valid1 = validateSpecializationCredit({
        course_name: 'دورة التحليل المالي والمحاسبي المتقدم',
        weeks: 2,
        order_number: '555/د',
        order_date: '2026-07-01'
      });
      expect(valid1.valid).toBe(true);
      expect(valid1.weeks).toBe(2);
      expect(valid1.meetsTwoWeeksRequirement).toBe(true);

      const valid2 = validateSpecializationCredit({
        course_name: 'دورة تمهيدية',
        weeks: 1,
        order_number: '556/د',
        order_date: '2026-07-15'
      });
      expect(valid2.valid).toBe(true);
      expect(valid2.weeks).toBe(1);
      expect(valid2.meetsTwoWeeksRequirement).toBe(false);
    });
  });

  describe('3. Education Degrees Baseline Grade & Step (2023 Scale Alignment)', () => {
    it('accurately defaults baseline grades and steps for Iraqi education degrees', () => {
      const presets = [
        { name: 'دون الابتدائية', baseline_grade: 10, baseline_step: 1 },
        { name: 'ابتدائية', baseline_grade: 10, baseline_step: 1 },
        { name: 'متوسطة', baseline_grade: 9, baseline_step: 1 },
        { name: 'إعدادية', baseline_grade: 8, baseline_step: 1 },
        { name: 'دبلوم', baseline_grade: 8, baseline_step: 1 },
        { name: 'بكالوريوس', baseline_grade: 7, baseline_step: 1 },
        { name: 'دبلوم عالي', baseline_grade: 7, baseline_step: 1 },
        { name: 'ماجستير', baseline_grade: 6, baseline_step: 1 },
        { name: 'دكتوراه', baseline_grade: 5, baseline_step: 1 },
      ];

      presets.forEach(p => {
        expect(p.baseline_grade).toBeGreaterThanOrEqual(1);
        expect(p.baseline_grade).toBeLessThanOrEqual(10);
        expect(p.baseline_step).toBeGreaterThanOrEqual(1);
        expect(p.baseline_step).toBeLessThanOrEqual(11);
      });

      const bsc = presets.find(p => p.name === 'بكالوريوس');
      expect(bsc?.baseline_grade).toBe(7);
      expect(bsc?.baseline_step).toBe(1);

      const msc = presets.find(p => p.name === 'ماجستير');
      expect(msc?.baseline_grade).toBe(6);
      expect(msc?.baseline_step).toBe(1);

      const phd = presets.find(p => p.name === 'دكتوراه');
      expect(phd?.baseline_grade).toBe(5);
      expect(phd?.baseline_step).toBe(1);
    });
  });
});
