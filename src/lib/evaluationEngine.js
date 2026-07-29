// src/lib/evaluationEngine.js

/**
 * Standard Performance Grade Rating Scale
 * ممتاز: 90–100 | جيد جداً: 80–89 | جيد: 70–79 | متوسط: 60–69 | مقبول: 50–59 | ضعيف: أقل من 50
 */
export const EVALUATION_GRADE_SCALE = [
  { min: 90, max: 100, label: 'ممتاز', color: 'emerald', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { min: 80, max: 89, label: 'جيد جداً', color: 'blue', bg: 'bg-blue-100 text-blue-800 border-blue-200' },
  { min: 70, max: 79, label: 'جيد', color: 'indigo', bg: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { min: 60, max: 69, label: 'متوسط', color: 'amber', bg: 'bg-amber-100 text-amber-800 border-amber-200' },
  { min: 50, max: 59, label: 'مقبول', color: 'orange', bg: 'bg-orange-100 text-orange-800 border-orange-200' },
  { min: 0, max: 49, label: 'ضعيف', color: 'rose', bg: 'bg-rose-100 text-rose-800 border-rose-200' },
];

export function getEvaluationGrade(score) {
  const num = Number(score) || 0;
  if (num >= 90) return 'ممتاز';
  if (num >= 80) return 'جيد جداً';
  if (num >= 70) return 'جيد';
  if (num >= 60) return 'متوسط';
  if (num >= 50) return 'مقبول';
  return 'ضعيف';
}

/**
 * Check if employee holds a higher degree (ماجستير، دكتوراه، دبلوم عالي)
 */
export function isHigherDegree(educationLevel) {
  if (!educationLevel) return false;
  const str = String(educationLevel).trim().toLowerCase();
  return (
    str.includes('ماجستير') ||
    str.includes('دكتوراه') ||
    str.includes('دكتوراة') ||
    str.includes('دبلوم عالي') ||
    str.includes('الدبلوم العالي') ||
    str.includes('master') ||
    str.includes('phd') ||
    str.includes('doctorate')
  );
}

/**
 * Parse job grade string/number to numerical value (1 to 10)
 * Note: Grade 1 is higher than Grade 4 in Iraqi civil service
 */
export function parseGradeNumber(gradeInput) {
  if (gradeInput === null || gradeInput === undefined || gradeInput === '') return 10;
  if (typeof gradeInput === 'number') return gradeInput;
  const str = String(gradeInput).trim();
  const numMatch = str.match(/\d+/);
  if (numMatch) return parseInt(numMatch[0], 10);

  if (str.includes('الأولى') || str.includes('الاولى')) return 1;
  if (str.includes('الثانية')) return 2;
  if (str.includes('الثالثة')) return 3;
  if (str.includes('الرابعة')) return 4;
  if (str.includes('الخامسة')) return 5;
  if (str.includes('السادسة')) return 6;
  if (str.includes('السابعة')) return 7;
  if (str.includes('الثامنة')) return 8;
  if (str.includes('التاسعة')) return 9;
  if (str.includes('العاشرة')) return 10;
  return 10;
}

/**
 * Check if employee holds active supervisory responsibility
 */
export function isSupervisoryPosition(employee) {
  if (!employee) return false;
  const resp = (
    employee.primary_responsibility ||
    employee.primaryResponsibility ||
    employee.job_responsibility ||
    employee.jobResponsibility ||
    employee.responsibility ||
    ''
  ).trim();

  if (!resp || resp === 'بلا مسؤولية' || resp === 'لا يوجد' || resp === 'بدون مسؤولية') {
    return false;
  }

  const supervisoryKeywords = [
    'مدير', 'رئيس', 'مسؤول', 'معاون', 'قيادي', 'إشرافي', 'مشرف'
  ];

  return supervisoryKeywords.some(kw => resp.includes(kw));
}

/**
 * Determine the target evaluation form for an employee based on configurable criteria:
 * 1. Supervisory Responsibility: Assigned to FORM_1 (or form configured for supervisory responsibility), regardless of degree.
 * 2. Executive / Subordinate (High school or higher): Assigned to FORM_2 (no supervisory responsibility + Preparatory degree or higher).
 * 3. Vocational / Crafts (Below high school): Assigned to FORM_3 (no supervisory responsibility + Middle school or lower).
 * Custom forms check applicable_responsibilities and applicable_qualifications.
 */
export function determineTargetForm(employee, availableForms = []) {
  if (!employee || !Array.isArray(availableForms) || availableForms.length === 0) {
    return { form: null, formCode: null, reason: 'لا توجد بيانات موظف أو استمارات متاحة' };
  }

  const activeForms = availableForms.filter(f => f.status === 'فعال' || !f.status);
  const formsToSearch = activeForms.length > 0 ? activeForms : availableForms;

  // Raw employee attributes
  const resp = (
    employee.primary_responsibility ||
    employee.primaryResponsibility ||
    employee.job_responsibility ||
    employee.jobResponsibility ||
    employee.responsibility ||
    'بلا مسؤولية'
  ).trim();

  const education = (
    employee.education_level ||
    employee.educationLevel ||
    'إعدادية'
  ).trim();

  const parseJsonArray = (val, defaultVal = []) => {
    if (!val) return defaultVal;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        return defaultVal;
      }
    }
    return defaultVal;
  };

  // Helper to normalize strings for comparison
  const normalizeStr = (str) => {
    if (!str) return '';
    return String(str)
      .trim()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .toLowerCase();
  };

  const normResp = normalizeStr(resp);
  const normEdu = normalizeStr(education);

  // First pass: Check every active form for strict matching on configured rules
  for (const form of formsToSearch) {
    let defaultResp = ['بلا مسؤولية'];
    let defaultQual = ['بكالوريوس', 'إعدادية'];

    const titleLower = form.title ? form.title.toLowerCase() : '';
    if (titleLower.includes('form_1') || titleLower.includes('القيادية')) {
      defaultResp = ['مدير عام', 'معاون مدير عام', 'مدير هيئة', 'مدير قسم مركزي', 'مدير قسم', 'مسؤول شعبة'];
      defaultQual = ['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم', 'إعدادية', 'متوسطة', 'ابتدائية', 'يقرأ ويكتب', 'أمي'];
    } else if (titleLower.includes('form_2') || titleLower.includes('إعدادية')) {
      defaultResp = ['بلا مسؤولية', 'مسؤول وحدة', 'مسؤول وجبة'];
      defaultQual = ['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم', 'إعدادية'];
    } else if (titleLower.includes('form_3') || titleLower.includes('متوسطة')) {
      defaultResp = ['بلا مسؤولية', 'مسؤول وحدة', 'مسؤول وجبة'];
      defaultQual = ['متوسطة', 'ابتدائية', 'يقرأ ويكتب', 'أمي'];
    }

    const appResp = parseJsonArray(form.applicable_responsibilities || form.applicableResponsibilities, defaultResp);
    const appQual = parseJsonArray(form.applicable_qualifications || form.applicableQualifications, defaultQual);

    // Check responsibility match
    const respMatches = appResp.some(r => {
      const nr = normalizeStr(r);
      return nr === normResp || (normResp !== 'بلا مسؤولية' && (nr.includes(normResp) || normResp.includes(nr)));
    });

    // Check qualification match
    const qualMatches = appQual.some(q => {
      const nq = normalizeStr(q);
      return nq === normEdu || nq.includes(normEdu) || normEdu.includes(nq);
    });

    if (respMatches && qualMatches) {
      let code = 'CUSTOM';
      if (form.title.includes('FORM_1') || form.title.includes('القيادية')) code = 'FORM_1';
      else if (form.title.includes('FORM_2') || form.title.includes('إعدادية')) code = 'FORM_2';
      else if (form.title.includes('FORM_3') || form.title.includes('متوسطة')) code = 'FORM_3';

      return {
        ...form,
        form,
        formCode: code,
        reason: `تخصيص تلقائي وفق شروط الاستمارة (المسؤولية: "${resp}" | الشهادة: "${education}")`
      };
    }
  }

  // Fallback: Select best matching form based on supervisory vs non-supervisory and education
  const isSupervisoryHigh = ['مدير عام', 'معاون مدير عام', 'مدير هيئة', 'مدير قسم مركزي', 'مدير قسم', 'مسؤول شعبة'].some(
    r => normalizeStr(r) === normResp
  );

  if (isSupervisoryHigh) {
    const f1 = formsToSearch.find(f => f.title.includes('FORM_1') || f.title.includes('القيادية'));
    if (f1) return { ...f1, form: f1, formCode: 'FORM_1', reason: `تخصيص كمسؤول قيادي/إشرافي (${resp})` };
  }

  const isHighSchoolOrHigher = ['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم', 'إعدادية'].some(
    q => normalizeStr(q) === normEdu || normEdu.includes(normalizeStr(q))
  );

  if (isHighSchoolOrHigher) {
    const f2 = formsToSearch.find(f => f.title.includes('FORM_2') || f.title.includes('إعدادية'));
    if (f2) return { ...f2, form: f2, formCode: 'FORM_2', reason: `تخصيص ككادر تنفيذي (${education})` };
  } else {
    const f3 = formsToSearch.find(f => f.title.includes('FORM_3') || f.title.includes('متوسطة'));
    if (f3) return { ...f3, form: f3, formCode: 'FORM_3', reason: `تخصيص لكوادر المهن الحرفية/الخدمية (${education})` };
  }

  const defaultForm = formsToSearch[0];
  return {
    ...defaultForm,
    form: defaultForm,
    formCode: 'CUSTOM',
    reason: 'الاستمارة المتاحة بالنظام.'
  };
}

/**
 * Check if the HSE conditional rule applies for an employee & form
 * Rule: Holds higher degree (is_higher_degree = true) AND job_grade <= 4
 * Max score for HSE becomes 5 instead of 8, and course participation clause is excluded.
 */
export function shouldApplyHseCondition(employee, form) {
  if (!employee || !form) return false;

  const isForm1Or2 = (
    form.id === 1 ||
    form.id === 2 ||
    (form.title && (form.title.includes('FORM_1') || form.title.includes('FORM_2'))) ||
    (form.category && (form.category.includes('القيادية') || form.category.includes('التنفيذي')))
  );

  if (!isForm1Or2) return false;

  const education = employee.education_level || employee.educationLevel || '';
  const higherDeg = isHigherDegree(education);
  const gradeNum = parseGradeNumber(employee.grade);

  return higherDeg && gradeNum <= 4;
}

/**
 * Get adjusted form structure for evaluation engine
 * Adjusts HSE criteria maxScore to 5 if conditional rule applies.
 */
export function getAdjustedFormStructure(form, employee) {
  if (!form) return null;
  const sections = typeof form.sections === 'string' ? JSON.parse(form.sections) : (form.sections || []);
  const applyHseCap = shouldApplyHseCondition(employee, form);

  const adjustedSections = sections.map(sec => {
    const criteria = (sec.criteria || []).map(crit => {
      const isHseItem = (
        crit.isHseConditional ||
        crit.id === 'c1_6_hse' ||
        crit.id === 'c1_5_hse' ||
        crit.id === 'hse_item' ||
        crit.name.includes('الصحة والسلامة والبيئة') ||
        crit.name.includes('(HSE)')
      );

      if (isHseItem && applyHseCap) {
        return {
          ...crit,
          maxScore: 5,
          originalMaxScore: crit.maxScore || 8,
          isHseCapApplied: true,
          notice: 'تم تخفيض الحد الأقصى إلى 5 نقاط لحملة الشهادات العليا (الدرجة 4 فأعلى) واستبعاد فقرة دورة HSE.',
        };
      }

      return {
        ...crit,
        isHseCapApplied: false,
      };
    });

    const secWeight = criteria.reduce((sum, c) => sum + (c.maxScore || 0), 0);
    return {
      ...sec,
      criteria,
      weight: secWeight,
    };
  });

  const adjustedMaxScore = adjustedSections.reduce((sum, s) => sum + s.weight, 0);

  return {
    ...form,
    sections: adjustedSections,
    adjustedMaxScore,
    isHseConditionActive: applyHseCap,
  };
}
