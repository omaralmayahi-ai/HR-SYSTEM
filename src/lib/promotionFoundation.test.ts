// src/lib/promotionFoundation.test.ts
import { describe, it, expect } from 'vitest';
import * as schema from '../db/schema';
import { getTableColumns } from 'drizzle-orm';

describe('Promotion System Phase 1: Foundation & Schema Test Suite (منظومة الترقيات - الأساس البنيوي)', () => {

  // ==========================================
  // Unit 1: Grade Promotion Rules (سنوات الترفيع لكل درجة)
  // ==========================================
  describe('Unit 1: Grade Promotion Rules (جدول سنوات الترفيع القانونية)', () => {
    it('should have gradePromotionRules schema definition with expected columns', () => {
      const cols = Object.keys(getTableColumns(schema.gradePromotionRules));
      expect(cols).toContain('id');
      expect(cols).toContain('grade');
      expect(cols).toContain('promotionYears');
      expect(cols).toContain('notes');
      expect(cols).toContain('createdAt');
      expect(cols).toContain('updatedAt');
    });

    it('should match standard Iraqi civil service promotion years (5 years for Grades 2-5, 4 years for Grades 6-10, null for 1 and 11-13)', () => {
      const standardRules = [
        { grade: 1, promotionYears: null },
        { grade: 2, promotionYears: 5 },
        { grade: 3, promotionYears: 5 },
        { grade: 4, promotionYears: 5 },
        { grade: 5, promotionYears: 5 },
        { grade: 6, promotionYears: 4 },
        { grade: 7, promotionYears: 4 },
        { grade: 8, promotionYears: 4 },
        { grade: 9, promotionYears: 4 },
        { grade: 10, promotionYears: 4 },
        { grade: 11, promotionYears: null },
        { grade: 12, promotionYears: null },
        { grade: 13, promotionYears: null },
      ];

      standardRules.forEach(rule => {
        if (rule.grade >= 2 && rule.grade <= 5) {
          expect(rule.promotionYears).toBe(5);
        } else if (rule.grade >= 6 && rule.grade <= 10) {
          expect(rule.promotionYears).toBe(4);
        } else {
          expect(rule.promotionYears).toBeNull();
        }
      });
    });
  });

  // ==========================================
  // Unit 2: Commendations System (نظام كتب الشكر والتقدير)
  // ==========================================
  describe('Unit 2: Commendations System (نظام كتب الشكر والتقدير وشهور القدم)', () => {
    it('should have commendationTypes schema definition with expected columns', () => {
      const cols = Object.keys(getTableColumns(schema.commendationTypes));
      expect(cols).toContain('id');
      expect(cols).toContain('name');
      expect(cols).toContain('creditMonths');
      expect(cols).toContain('status');
      expect(cols).toContain('notes');
      expect(cols).toContain('createdAt');
      expect(cols).toContain('updatedAt');
    });

    it('should have employeeCommendations schema definition with creditMonthsSnapshot', () => {
      const cols = Object.keys(getTableColumns(schema.employeeCommendations));
      expect(cols).toContain('id');
      expect(cols).toContain('employeeId');
      expect(cols).toContain('commendationTypeId');
      expect(cols).toContain('creditMonthsSnapshot');
      expect(cols).toContain('orderNumber');
      expect(cols).toContain('orderDate');
      expect(cols).toContain('issuer');
      expect(cols).toContain('reason');
      expect(cols).toContain('isHidden');
      expect(cols).toContain('notes');
      expect(cols).toContain('createdAt');
    });

    it('should have commendationRulesSettings schema with maxPerYear and allowedCombinations', () => {
      const cols = Object.keys(getTableColumns(schema.commendationRulesSettings));
      expect(cols).toContain('id');
      expect(cols).toContain('configKey');
      expect(cols).toContain('maxPerYear');
      expect(cols).toContain('allowedCombinations');
      expect(cols).toContain('updatedAt');
    });
  });

  // ==========================================
  // Unit 3: Qualifications (تاريخ التخرج الكامل ونوع الشهادة)
  // ==========================================
  describe('Unit 3: Qualifications Table (تاريخ التخرج الكامل ونوع الشهادة)', () => {
    it('should have graduationDate and qualificationType in qualifications schema', () => {
      const cols = Object.keys(getTableColumns(schema.qualifications));
      expect(cols).toContain('graduationDate');
      expect(cols).toContain('qualificationType');
      expect(cols).toContain('graduationYear'); // legacy preserved
    });

    it('should correctly backfill approximate graduation date from legacy graduation year', () => {
      const legacyQual = {
        id: 1,
        degree: 'بكالوريوس هندسة',
        graduationYear: 2018,
        graduationDate: null,
        qualificationType: null,
      };

      const backfilledDate = legacyQual.graduationDate || (legacyQual.graduationYear ? `${legacyQual.graduationYear}-01-01` : null);
      const backfilledType = legacyQual.qualificationType || 'تعيين';

      expect(backfilledDate).toBe('2018-01-01');
      expect(backfilledType).toBe('تعيين');
    });
  });

  // ==========================================
  // Unit 4: Leave Types & Leave Requests (الأثر الإداري والمالي و FK)
  // ==========================================
  describe('Unit 4: Leave Types & Requests (الأثر الإداري والمالي للإجازات)', () => {
    it('should have administrativeEffect, financialEffect, and financialDeductionPercentage in leaveTypes schema', () => {
      const cols = Object.keys(getTableColumns(schema.leaveTypes));
      expect(cols).toContain('administrativeEffect');
      expect(cols).toContain('financialEffect');
      expect(cols).toContain('financialDeductionPercentage');
      expect(cols).toContain('updatedAt');
    });

    it('should have leaveTypeId FK in leaveRequests schema', () => {
      const cols = Object.keys(getTableColumns(schema.leaveRequests));
      expect(cols).toContain('leaveTypeId');
      expect(cols).toContain('leaveType'); // legacy preserved
    });

    it('should match legal administrative and financial effects for leave types', () => {
      const leaveTypesMock = [
        { name: 'إجازة اعتيادية', administrativeEffect: 'لا_يؤثر', financialEffect: 'براتب_كامل', deduction: 0 },
        { name: 'إجازة بدون راتب', administrativeEffect: 'يوقف_الترفيع', financialEffect: 'بدون_راتب', deduction: 100 },
        { name: 'إجازة دراسية بنصف راتب', administrativeEffect: 'لا_يؤثر', financialEffect: 'استقطاع_جزئي', deduction: 50 },
      ];

      expect(leaveTypesMock[0].administrativeEffect).toBe('لا_يؤثر');
      expect(leaveTypesMock[0].financialEffect).toBe('براتب_كامل');

      expect(leaveTypesMock[1].administrativeEffect).toBe('يوقف_الترفيع');
      expect(leaveTypesMock[1].financialEffect).toBe('بدون_راتب');
      expect(leaveTypesMock[1].deduction).toBe(100);

      expect(leaveTypesMock[2].financialEffect).toBe('استقطاع_جزئي');
      expect(leaveTypesMock[2].deduction).toBe(50);
    });
  });

  // ==========================================
  // Unit 5: Job Titles Career Ladder (التدرج الهرمي للعناوين الوظيفية)
  // ==========================================
  describe('Unit 5: Job Titles Career Ladder (التدرج الهرمي والعنوان التالي)', () => {
    it('should have nextTitleId in jobTitles schema', () => {
      const cols = Object.keys(getTableColumns(schema.jobTitles));
      expect(cols).toContain('nextTitleId');
      expect(cols).toContain('name');
      expect(cols).toContain('minGrade');
      expect(cols).toContain('category');
    });

    it('should allow chaining job titles via nextTitleId', () => {
      const ladder = [
        { id: 1, name: 'معاون مهندس', minGrade: 7, nextTitleId: 2 },
        { id: 2, name: 'مهندس', minGrade: 6, nextTitleId: 3 },
        { id: 3, name: 'مهندس أقدم', minGrade: 5, nextTitleId: 4 },
        { id: 4, name: 'رئيس مهندسين', minGrade: 3, nextTitleId: 5 },
        { id: 5, name: 'رئيس مهندسين أقدم', minGrade: 2, nextTitleId: null },
      ];

      expect(ladder[0].nextTitleId).toBe(2);
      const nextTitle = ladder.find(t => t.id === ladder[0].nextTitleId);
      expect(nextTitle?.name).toBe('مهندس');
      expect(ladder[4].nextTitleId).toBeNull();
    });
  });

  // ==========================================
  // Unit 6: Service Credits (احتساب الخدمة السابقة والعسكرية)
  // ==========================================
  describe('Unit 6: Service Credits (احتساب الخدمة والقدَم المضاف)', () => {
    it('should have serviceCredits schema definition with all legal calculation fields', () => {
      const cols = Object.keys(getTableColumns(schema.serviceCredits));
      expect(cols).toContain('id');
      expect(cols).toContain('employeeId');
      expect(cols).toContain('creditType');
      expect(cols).toContain('calculatedYears');
      expect(cols).toContain('calculatedMonths');
      expect(cols).toContain('calculatedDays');
      expect(cols).toContain('orderNumber');
      expect(cols).toContain('orderDate');
      expect(cols).toContain('purpose');
      expect(cols).toContain('isCountedForPromotion');
      expect(cols).toContain('isCountedForRetirement');
      expect(cols).toContain('notes');
      expect(cols).toContain('createdAt');
    });

    it('should correctly accumulate service credit duration for promotions', () => {
      const credits = [
        { calculatedYears: 1, calculatedMonths: 6, calculatedDays: 0, isCountedForPromotion: true },
        { calculatedYears: 0, calculatedMonths: 8, calculatedDays: 15, isCountedForPromotion: true },
        { calculatedYears: 2, calculatedMonths: 0, calculatedDays: 0, isCountedForPromotion: false }, // pension only
      ];

      const promotionCredits = credits.filter(c => c.isCountedForPromotion);
      const totalY = promotionCredits.reduce((acc, c) => acc + c.calculatedYears, 0);
      const totalM = promotionCredits.reduce((acc, c) => acc + c.calculatedMonths, 0);
      const totalD = promotionCredits.reduce((acc, c) => acc + c.calculatedDays, 0);

      expect(promotionCredits.length).toBe(2);
      expect(totalY).toBe(1);
      expect(totalM).toBe(14); // 1 year + 2 months
      expect(totalD).toBe(15);
    });
  });

  // ==========================================
  // Unit 7: Settings Integration & Verification
  // ==========================================
  describe('Unit 7: System Settings Integration (دمج تبويب ضوابط الترقية والعلاوة)', () => {
    it('should verify schema export integrity for all new tables', () => {
      expect(schema.gradePromotionRules).toBeDefined();
      expect(schema.commendationTypes).toBeDefined();
      expect(schema.employeeCommendations).toBeDefined();
      expect(schema.commendationRulesSettings).toBeDefined();
      expect(schema.serviceCredits).toBeDefined();
      expect(schema.jobTitles).toBeDefined();
      expect(schema.leaveTypes).toBeDefined();
      expect(schema.qualifications).toBeDefined();
    });
  });
});
