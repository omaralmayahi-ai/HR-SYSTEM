import { describe, it, expect } from 'vitest';
import {
  matchesRequirementCategory,
  getUnifiedEmployeeCourses,
  checkEmployeeExemption,
  calculateEmployeeGoverningFulfillment,
  DEFAULT_GRADE_TRAINING_REQUIREMENTS
} from './governingCoursesEngine';

describe('Governing Courses & Training Integration Engine (محرك الحتميات التدريبية والاستيفاء التراكمي)', () => {
  describe('1. Category Matching Logic (دقة مطابقة التصنيفات)', () => {
    it('matches exact and partial category names for technical specialization', () => {
      expect(matchesRequirementCategory('اختصاص', 'اختصاص فني')).toBe(true);
      expect(matchesRequirementCategory('اختصاص متقدمة', 'اختصاص')).toBe(true);
      expect(matchesRequirementCategory('اختصاص', 'دورة التحليل الفني التخصصية')).toBe(true);
    });

    it('matches administrative and leadership courses', () => {
      expect(matchesRequirementCategory('إدارية', 'إدارية')).toBe(true);
      expect(matchesRequirementCategory('إدارية متقدمة / إدارة وقيادة', 'إدارية')).toBe(true);
      expect(matchesRequirementCategory('إدارية أو حاسوب', 'إدارية')).toBe(true);
      expect(matchesRequirementCategory('إدارية أو حاسوب', 'حاسوب')).toBe(true);
    });

    it('matches HSE and safety courses', () => {
      expect(matchesRequirementCategory('سلامة وبيئة (H.S.E)', 'سلامة وبيئة')).toBe(true);
      expect(matchesRequirementCategory('سلامة وبيئة (H.S.E)', 'HSE')).toBe(true);
      expect(matchesRequirementCategory('سلامة وبيئة (H.S.E)', 'السلامة والصحة المهنية')).toBe(true);
    });

    it('matches IT, languages and financial courses', () => {
      expect(matchesRequirementCategory('حاسوب وتكنولوجيا', 'حاسبة وتطبيقات')).toBe(true);
      expect(matchesRequirementCategory('تفاوض ولجان خارجية', 'لغة وتفاوض')).toBe(true);
      expect(matchesRequirementCategory('مالية ومحاسبية', 'محاسبة وتدقيق')).toBe(true);
    });
  });

  describe('2. Unified Course Collection from Multiple Sources (توحيد السجلات من كافة المصادر)', () => {
    const mockEmployee = { id: 101, full_name: 'علي حسن', grade: 7 };

    const directCourses = [
      {
        id: 1,
        employee_id: 101,
        course_name: 'دورة صيانة متقدمة',
        category: 'اختصاص',
        days: 5,
        hours: 20,
        year: 2025,
        grade_at_time: 7,
        result: 'اجتاز',
        order_number: 'د/100',
        order_date: '2025-02-01',
        institution: 'معهد التدريب النفطي'
      }
    ];

    const centralTrainings = [
      {
        id: 201,
        title: 'البرنامج الإداري المتقدم للقيادات الوسطى',
        course_categories: 'إدارية',
        duration_days: 5,
        hours: 20,
        year: 2025,
        organizer: 'مركز التطوير الإداري',
        order_number: 'ت/500'
      }
    ];

    const enrollments = [
      {
        id: 301,
        training_id: 201,
        employee_id: 101,
        status: 'مكتمل',
        completed: true,
        evaluation_result: 'ناجح'
      }
    ];

    const specCredits = [
      {
        id: 401,
        employee_id: 101,
        course_name: 'دورة السلامة الميدانية في المواقع النفطية',
        weeks: 1, // 5 days / 20 hours
        order_number: 'س/300',
        order_date: '2025-06-01'
      }
    ];

    it('aggregates all 3 sources into normalized unified courses', () => {
      const unified = getUnifiedEmployeeCourses(mockEmployee, directCourses, centralTrainings, enrollments, specCredits);
      expect(unified).toHaveLength(3);

      // Check direct course
      expect(unified.some(c => c.source === 'training_course' && c.courseName === 'دورة صيانة متقدمة')).toBe(true);

      // Check central training enrollment
      expect(unified.some(c => c.source === 'central_training' && c.courseName === 'البرنامج الإداري المتقدم للقيادات الوسطى')).toBe(true);

      // Check specialization credit
      const sc = unified.find(c => c.source === 'specialization_credit');
      expect(sc).toBeDefined();
      expect(sc.days).toBe(5);
      expect(sc.hours).toBe(20);
      expect(sc.isPassed).toBe(true);
    });
  });

  describe('3. Exemption Verification Rules (فحص قواعد وضوابط الإعفاء)', () => {
    it('exempts employees with higher degrees (PhD, Master, Higher Diploma)', () => {
      const phdEmp = { id: 1, education_level: 'دكتوراه هندسة كيمياوية' };
      const resPhd = checkEmployeeExemption(phdEmp);
      expect(resPhd.isExempt).toBe(true);
      expect(resPhd.reason).toContain('دكتوراه');

      const mscEmp = { id: 2, qualification: 'ماجستير إدارة أعمال' };
      const resMsc = checkEmployeeExemption(mscEmp);
      expect(resMsc.isExempt).toBe(true);
    });

    it('exempts employees with intermediate qualification and below', () => {
      const middleEmp = { id: 3, education_level: 'متوسطة' };
      expect(checkEmployeeExemption(middleEmp).isExempt).toBe(true);

      const primaryEmp = { id: 4, education_level: 'ابتدائية' };
      expect(checkEmployeeExemption(primaryEmp).isExempt).toBe(true);

      const noQualEmp = { id: 5, education_level: 'يقرأ ويكتب' };
      expect(checkEmployeeExemption(noQualEmp).isExempt).toBe(true);
    });

    it('does not exempt Bachelor or Diploma holders without special decision', () => {
      const bscEmp = { id: 6, education_level: 'بكالوريوس علوم حاسوب' };
      expect(checkEmployeeExemption(bscEmp).isExempt).toBe(false);

      const dipEmp = { id: 7, education_level: 'دبلوم فني' };
      expect(checkEmployeeExemption(dipEmp).isExempt).toBe(false);
    });

    it('respects administrative manual exemption assignment', () => {
      const emp = { id: 8, education_level: 'بكالوريوس' };
      const assignments = {
        '8': {
          status: 'معفى',
          exemptionReason: 'قرار مجلس إدارة استثنائي',
          exemptionOrderNumber: 'م/1234',
          exemptionOrderDate: '2025-01-15'
        }
      };
      const res = checkEmployeeExemption(emp, null, assignments);
      expect(res.isExempt).toBe(true);
      expect(res.reason).toBe('قرار مجلس إدارة استثنائي');
      expect(res.orderNumber).toBe('م/1234');
    });
  });

  describe('4. Cumulative Promotion Fulfillment Gate (حساب الاستيفاء التراكمي للترقية القادمة)', () => {
    it('returns 100% and satisfied for exempt employees', () => {
      const exemptEmp = { id: 10, grade: 7, education_level: 'دكتوراه' };
      const result = calculateEmployeeGoverningFulfillment({ emp: exemptEmp });
      expect(result.isSatisfied).toBe(true);
      expect(result.progressPercent).toBe(100);
      expect(result.fulfillmentStatusLabel).toContain('معفى');
    });

    it('evaluates cumulative fulfillment for Grade 7 to Grade 6', () => {
      const emp = { id: 20, grade: 7, education_level: 'بكالوريوس' };

      // Grade 7 requires 4 packs of 5 days: الاختصاص (5d), إدارية (5d), HSE (5d), حاسوب (5d)
      const courses = [
        // Employee took two 3-day and 2-day courses for specialization (total = 5 days)
        {
          id: 1,
          employee_id: 20,
          course_name: 'معدات نفطية 1',
          category: 'اختصاص',
          days: 3,
          hours: 12,
          result: 'اجتاز',
          is_passed: true
        },
        {
          id: 2,
          employee_id: 20,
          course_name: 'معدات نفطية 2',
          category: 'اختصاص',
          days: 2,
          hours: 8,
          result: 'اجتاز',
          is_passed: true
        },
        // Administrative course (5 days)
        {
          id: 3,
          employee_id: 20,
          course_name: 'مهارات القيادة الإدارية',
          category: 'إدارية',
          days: 5,
          hours: 20,
          result: 'اجتاز',
          is_passed: true
        }
      ];

      const result = calculateEmployeeGoverningFulfillment({
        emp,
        trainingCourses: courses
      });

      // Specialization (5/5) and Administrative (5/5) completed (2/4 satisfied = 50%)
      expect(result.isSatisfied).toBe(false);
      expect(result.progressPercent).toBe(50);
      expect(result.satisfiedCount).toBe(2);
      expect(result.totalRequirements).toBe(4);

      // Check specialization pack evaluation
      const specReq = result.reqEvaluations.find(r => r.category === 'اختصاص');
      expect(specReq.isSatisfied).toBe(true);
      expect(specReq.totalDaysAchieved).toBe(5);
      expect(specReq.matchedCourses).toHaveLength(2);

      // Check missing HSE pack
      const hseReq = result.reqEvaluations.find(r => r.category.includes('سلامة'));
      expect(hseReq.isSatisfied).toBe(false);
      expect(hseReq.remainingDays).toBe(3);
    });

    it('achieves 100% and ready when all required packs are fulfilled', () => {
      const emp = { id: 30, grade: 8, education_level: 'بكالوريوس' };

      const allCourses = [
        { id: 1, employee_id: 30, course_name: 'دورة هندسية', category: 'اختصاص', days: 5, hours: 20, result: 'اجتاز' },
        { id: 2, employee_id: 30, course_name: 'دورة الإدارة العامة', category: 'إدارية', days: 5, hours: 20, result: 'اجتاز' },
        { id: 3, employee_id: 30, course_name: 'إدارة السلامة والصحة المهنية', category: 'سلامة وبيئة (H.S.E)', days: 5, hours: 20, result: 'اجتاز' },
        { id: 4, employee_id: 30, course_name: 'تطبيقات الحاسبة المتقدمة', category: 'حاسوب وتكنولوجيا', days: 5, hours: 20, result: 'اجتاز' }
      ];

      const result = calculateEmployeeGoverningFulfillment({
        emp,
        trainingCourses: allCourses
      });

      expect(result.isSatisfied).toBe(true);
      expect(result.progressPercent).toBe(100);
      expect(result.satisfiedCount).toBe(4);
      expect(result.fulfillmentStatusLabel).toContain('مستوفي بالكامل');
    });

    it('correctly evaluates Grade 4 to Grade 3 promotion with separated satisfied and pending requirements', () => {
      // Omar Mahmoud Salman (Grade 4 -> Target: Grade 3)
      const emp = { id: 40, full_name: 'عمر محمود سلمان', grade: 4, education_level: 'بكالوريوس هندسة' };

      // Suppose he only took the specialization course (10 days)
      const courses = [
        { id: 101, employee_id: 40, course_name: 'دورة اختصاص متقدمة في الهندسة النفطية', category: 'اختصاص', days: 10, hours: 40, result: 'اجتاز' }
      ];

      const result = calculateEmployeeGoverningFulfillment({
        emp,
        trainingCourses: courses
      });

      expect(result.currentGradeNum).toBe(4);
      expect(result.targetGradeNum).toBe(3);
      expect(result.currentGradeLabel).toBe('الدرجة الرابعة');
      expect(result.targetGradeLabel).toBe('الدرجة الثالثة');
      expect(result.isSatisfied).toBe(false);

      // Separated satisfied vs pending
      expect(result.satisfiedRequirements.length).toBeGreaterThan(0);
      expect(result.pendingRequirements.length).toBeGreaterThan(0);

      // Check specialization is in satisfiedRequirements
      const satisfiedSpec = result.satisfiedRequirements.find(r => r.category.includes('اختصاص'));
      expect(satisfiedSpec).toBeDefined();
      expect(satisfiedSpec.totalDaysAchieved).toBe(10);

      // Check pending requirement exists
      const pendingAdminOrHse = result.pendingRequirements.find(r => r.category.includes('إدارية') || r.category.includes('سلامة'));
      expect(pendingAdminOrHse).toBeDefined();
      expect(pendingAdminOrHse.remainingDays).toBeGreaterThan(0);
    });

    it('dynamically adapts when dynamic exemption rules are modified or added', () => {
      const bscEmp = { id: 50, grade: 4, education_level: 'بكالوريوس إدارة أعمال' };
      
      // Default: Not exempt
      expect(checkEmployeeExemption(bscEmp).isExempt).toBe(false);

      // When admin adds an exemption rule for Bachelor or Grade 4
      const customRules = {
        qualificationsExemptions: [
          { id: 'bachelor', name: 'البكالوريوس', isExempt: true, exemptionType: 'كامل', notes: 'قرار استثنائي لإعفاء حملة البكالوريوس للدورة الحالية' }
        ],
        gradeTitleExemptions: [],
        rules: []
      };

      const exemptResult = checkEmployeeExemption(bscEmp, customRules);
      expect(exemptResult.isExempt).toBe(true);
      expect(exemptResult.reason).toContain('قرار استثنائي');

      // Check calculateEmployeeGoverningFulfillment with dynamic exemption
      const fulfillment = calculateEmployeeGoverningFulfillment({
        emp: bscEmp,
        exemptionRules: customRules
      });
      expect(fulfillment.isSatisfied).toBe(true);
      expect(fulfillment.progressPercent).toBe(100);
      expect(fulfillment.fulfillmentStatusKey).toBe('معفى');
    });
  });
});
