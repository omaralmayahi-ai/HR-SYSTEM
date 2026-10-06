// src/lib/governingCoursesEngine.js
/**
 * محرك احتساب ومطابقة الاستيفاء التراكمي للدورات التدريبية الحاكمة والإعفاءات
 * Governing Courses & Training Cumulative Fulfillment Engine
 */

export const DEFAULT_DYNAMIC_EXEMPTION_RULES = [
  { id: '1', title: 'حملة شهادة الدكتوراه', qualification: 'دكتوراه', isExempt: true, impact: 'إعفاء تام من كافة الدورات الحتمية', notes: 'يُعتبر مستوفياً لكافة شروط التدريب حكماً لأغراض الترقية' },
  { id: '2', title: 'حملة شهادة الماجستير', qualification: 'ماجستير', isExempt: true, impact: 'إعفاء تام من كافة الدورات الحتمية', notes: 'يُعتبر مستوفياً لكافة شروط التدريب حكماً لأغراض الترقية' },
  { id: '3', title: 'حملة شهادة الدبلوم العالي المعادل للماجستير', qualification: 'دبلوم عالي', isExempt: true, impact: 'إعفاء تام من كافة الدورات الحتمية', notes: 'يُعتبر مستوفياً لكافة شروط التدريب حكماً لأغراض الترقية' },
  { id: '4', title: 'المؤهلات ما دون الإعدادية (المتوسطة والابتدائية وبدون مؤهل)', qualification: 'متوسطة فما دون', isExempt: true, impact: 'إعفاء تام من شرط الدورات الحاكمة', notes: 'لا تشترط الدورات الحتمية لهذه الفئات الوظيفية لأغراض الترقية' },
];

export const DEFAULT_GRADE_TRAINING_REQUIREMENTS = {
  '8': [
    { id: 'g8-1', category: 'اختصاص', requiredDays: 5, requiredHours: 20, notes: 'دورة فنية / تخصصية في مجال عمل الموظف', mandatory: true },
    { id: 'g8-2', category: 'إدارية', requiredDays: 5, requiredHours: 20, notes: 'مبادئ الإدارة والوظيفة العامة', mandatory: true },
    { id: 'g8-3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 3, requiredHours: 12, notes: 'السلامة والصحة المهنية', mandatory: true },
    { id: 'g8-4', category: 'حاسوب وتكنولوجيا', requiredDays: 5, requiredHours: 20, notes: 'تطبيقات الحاسوب والمراسلات الرقمية', mandatory: false },
  ],
  '7': [
    { id: 'g7-1', category: 'اختصاص', requiredDays: 5, requiredHours: 20, notes: 'دورة اختصاص متقدمة', mandatory: true },
    { id: 'g7-2', category: 'إدارية', requiredDays: 5, requiredHours: 20, notes: 'الإدارة الوسطى وتطوير العمل المؤسسي', mandatory: true },
    { id: 'g7-3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 3, requiredHours: 12, notes: 'إجراءات السلامة الصناعية والمكتبية', mandatory: true },
    { id: 'g7-4', category: 'حاسوب وتكنولوجيا', requiredDays: 5, requiredHours: 20, notes: 'التحول الرقمي وأنظمة العمل', mandatory: false },
  ],
  '6': [
    { id: 'g6-1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, notes: 'اختصاص مهني مكثف (أسبوعين / 10 أيام أو دورتين منفصلتين)', mandatory: true },
    { id: 'g6-2', category: 'إدارية أو حاسوب', requiredDays: 5, requiredHours: 20, notes: 'إدارية متوسطة أو حاسوب متقدم أو إحصاء', mandatory: true },
    { id: 'g6-3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 3, requiredHours: 12, notes: 'إدارة المخاطر والسلامة المهنية', mandatory: true },
  ],
  '5': [
    { id: 'g5-1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, notes: 'اختصاص تخصصي نوعي (أسبوعين أو تراكمي)', mandatory: true },
    { id: 'g5-2', category: 'إدارية أو لغة أو حاسوب', requiredDays: 5, requiredHours: 20, notes: 'إدارية متقدمة أو لغة إنجليزية أو حاسوب', mandatory: true },
    { id: 'g5-3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, notes: 'سلامة متقدمة وتصاريح العمل', mandatory: true },
  ],
  '4': [
    { id: 'g4-1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, notes: 'اختصاص متقدم (أسبوعين / 10 أيام)', mandatory: true },
    { id: 'g4-2', category: 'إدارية متقدمة / قيادية', requiredDays: 5, requiredHours: 20, notes: 'إدارة فرق العمل والقيادة الإشرافية', mandatory: true },
    { id: 'g4-3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, notes: 'إدارة السلامة المهنية ومكافحة الحوادث', mandatory: true },
  ],
  '3': [
    { id: 'g3-1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, notes: 'اختصاص قيادي متقدم (أسبوعين - 10 أيام)', mandatory: true },
    { id: 'g3-2', category: 'إدارية متقدمة أو حاسوب أو لغة', requiredDays: 5, requiredHours: 20, notes: 'إدارية متقدمة أو لغة أجنبية أو حاسوب متخصص', mandatory: true },
    { id: 'g3-3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, notes: 'إدارة السلامة والأثر البيئي للمشاريع', mandatory: true },
  ],
  '2': [
    { id: 'g2-1', category: 'اختصاص متقدمة', requiredDays: 10, requiredHours: 40, notes: 'اختصاص استشاري متقدم (أسبوعين - 10 أيام)', mandatory: true },
    { id: 'g2-2', category: 'إدارية متقدمة / إدارة وقيادة', requiredDays: 5, requiredHours: 20, notes: 'إدارة عليا وقيادة استراتيجية (أسبوع على الأقل)', mandatory: true },
    { id: 'g2-3', category: 'تفاوض ولجان أجنبية', requiredDays: 5, requiredHours: 20, notes: 'تفاوض أو تعويض بلجان/اجتماعات مع شركات أجنبية بكتاب رسمي', mandatory: false },
  ],
};

export const GRADE_ARABIC_NAMES = {
  1: 'الأولى',
  2: 'الثانية',
  3: 'الثالثة',
  4: 'الرابعة',
  5: 'الخامسة',
  6: 'السادسة',
  7: 'السابعة',
  8: 'الثامنة',
  9: 'التاسعة',
  10: 'العاشرة',
  11: 'الدرجة العليا (أ)',
  12: 'الدرجة العليا (ب)',
};

export function getArabicGradeLabel(grade) {
  const gNum = parseInt(grade);
  if (!isNaN(gNum) && GRADE_ARABIC_NAMES[gNum]) return `الدرجة ${GRADE_ARABIC_NAMES[gNum]}`;
  return grade ? `الدرجة ${grade}` : '—';
}

/**
 * فحص ما إذا كان الموظف معفى من الدورات الحاكمة استناداً لضوابط وقواعد الإعفاء المركزية
 */
export function checkEmployeeExemption(emp, exemptionRules = null, employeeAssignments = {}) {
  if (!emp) return { isExempt: false, reason: 'بيانات الموظف غير متوفرة', source: 'none' };

  const empId = String(emp.id || '');
  const assignment = employeeAssignments[empId];

  // 1. تحقق من الاستثناء المباشر المسجل في جدول التكليفات الفردية للموظف
  if (assignment) {
    if (assignment.status === 'معفى' || assignment.status === 'معفى_كامل') {
      return {
        isExempt: true,
        reason: assignment.exemptionReason || 'إعفاء فردي رسمي مسجل بموجب أمر إداري',
        orderNumber: assignment.exemptionOrderNumber || '',
        orderDate: assignment.exemptionOrderDate || '',
        source: 'manual_assignment',
        sourceLabel: 'قرار إعفاء فردي مباشر',
      };
    }
    if (assignment.status === 'مستوفي' || assignment.status === 'ناجح') {
      return {
        isExempt: false,
        isForceCompleted: true,
        reason: 'مستوفي بقرار لجنة التدريب المركزي',
        source: 'manual_assignment',
        sourceLabel: 'استيفاء بقرار لجنة التدريب',
      };
    }
  }

  // تهيئة بيانات الموظف للمطابقة
  const eduLevel = String(emp.education_level || emp.educationLevel || emp.qualification || emp.certificate || '').trim();
  const eduNorm = eduLevel.toLowerCase();
  const currentGradeNum = parseInt(emp.grade || emp.currentGrade || emp.current_grade) || 8;
  const targetGradeNum = Math.max(1, currentGradeNum - 1);
  const jobTitle = String(emp.job_title || emp.jobTitle || '').trim().toLowerCase();

  // 2. التحقق من الضوابط والقواعد الديناميكية من إدارة قواعد الإعفاء (Dynamic Exemption Rules)
  if (exemptionRules) {
    // أ. جدول إعفاء المؤهلات والشهادات الدراسية (qualificationsExemptions)
    const qualRules = exemptionRules.qualificationsExemptions || [];
    for (const qr of qualRules) {
      const qName = (qr.name || qr.qualification || qr.title || '').trim().toLowerCase().replace(/^ال/, '');
      const isMatch = qName && (
        eduNorm.includes(qName) || 
        qName.includes(eduNorm) || 
        (qName.includes('دون') && (eduNorm.includes('متوسطة') || eduNorm.includes('ابتدائية') || eduNorm.includes('يقرأ') || eduNorm.includes('دون') || eduNorm.includes('أمي') || eduNorm === 'لا يوجد'))
      );

      if (isMatch) {
        if (qr.isExempt === true || qr.is_exempt === true || (qr.exemptionType && qr.exemptionType !== 'لا يوجد إعفاء' && qr.exemptionType !== 'لا_يوجد_إعفاء')) {
          return {
            isExempt: true,
            reason: qr.notes || `معفى بموجب ضوابط التحصيل الدراسي: ${qr.name || eduLevel}`,
            rule: qr,
            source: 'qualification_rule',
            sourceLabel: `ضابط المؤهل الدراسي (${qr.name || eduLevel})`,
          };
        }
      }
    }

    // ب. جدول إعفاء الدرجات والعناوين الوظيفية والخدمة (gradeTitleExemptions)
    const gradeTitleRules = exemptionRules.gradeTitleExemptions || [];
    for (const gtr of gradeTitleRules) {
      if (gtr.isExempt !== true && gtr.is_exempt !== true) continue;
      const gtrId = String(gtr.id || '').toLowerCase();
      const gtrName = String(gtr.name || '').toLowerCase();

      // الدرجات الخاصة (11، 12، 13 أو خاصة)
      if ((gtrId.includes('special') || gtrName.includes('خاصة')) && currentGradeNum >= 11) {
        return {
          isExempt: true,
          reason: gtr.notes || 'معفى بموجب ضابط الدرجات الخاصة والعليا',
          rule: gtr,
          source: 'grade_title_rule',
          sourceLabel: 'ضابط الدرجات الخاصة',
        };
      }
      // الدرجة الأولى
      if ((gtrId === 'grade_1' || gtrName.includes('الأولى') || gtrName.includes('الدرجة 1')) && currentGradeNum === 1) {
        return {
          isExempt: true,
          reason: gtr.notes || 'معفى أو مستثنى بضابط كبار الموظفين / الدرجة الأولى',
          rule: gtr,
          source: 'grade_title_rule',
          sourceLabel: 'ضابط الدرجة الأولى',
        };
      }
      // العنوان الإداري القيادي (مدير / مدير أقدم / رئيس مهندسين)
      if ((gtrId.includes('manager') || gtrName.includes('مدير') || gtrName.includes('رئيس مهندسين')) && (jobTitle.includes('مدير') || jobTitle.includes('رئيس مهندسين') || jobTitle.includes('معاون مدير'))) {
        return {
          isExempt: true,
          reason: gtr.notes || 'معفى ببديل كامل للعنوان الإداري القيادي',
          rule: gtr,
          source: 'grade_title_rule',
          sourceLabel: 'ضابط العنوان القيادي',
        };
      }
    }

    // ج. القواعد العامة المخصصة (rules array)
    const genRules = exemptionRules.rules || [];
    for (const rule of genRules) {
      if (rule.isExempt === false || rule.is_exempt === false || rule.exemptionType === 'لا_يوجد_إعفاء' || rule.exemptionType === 'لا يوجد إعفاء') continue;

      if (Array.isArray(rule.qualifications) && rule.qualifications.length > 0) {
        const hasQual = rule.qualifications.some(q => {
          const qClean = String(q).trim().toLowerCase().replace(/^ال/, '');
          if (qClean === 'الكل' || qClean === 'all') return true;
          return eduNorm.includes(qClean) || qClean.includes(eduNorm) || (qClean.includes('دون') && (eduNorm.includes('متوسطة') || eduNorm.includes('ابتدائية') || eduNorm.includes('دون')));
        });

        if (hasQual) {
          let hasGrade = true;
          if (Array.isArray(rule.grades) && rule.grades.length > 0 && !rule.grades.includes('الكل') && !rule.grades.includes('all')) {
            hasGrade = rule.grades.some(g => String(g) === String(currentGradeNum) || String(g) === String(targetGradeNum));
          }
          if (hasGrade) {
            return {
              isExempt: true,
              reason: rule.legalBasis || rule.notes || rule.title || `معفى بموجب ضابط الإعفاء: ${rule.title}`,
              rule,
              source: 'custom_rule',
              sourceLabel: rule.title,
            };
          }
        }
      }
    }
  }

  // 3. القواعد المرجعية الافتراضية لقانون الخدمة المدنية (Statutory Fallbacks)
  if (eduNorm.includes('دكتوراه') || eduNorm.includes('phd') || eduNorm.includes('دكتوراة')) {
    return { isExempt: true, reason: 'حملة شهادة الدكتوراه معفون من الدورات الحتمية بحكم القانون', source: 'default_statutory', sourceLabel: 'ضابط شهادة الدكتوراه' };
  }
  if (eduNorm.includes('ماجستير') || eduNorm.includes('master') || eduNorm.includes('ماجستر')) {
    return { isExempt: true, reason: 'حملة شهادة الماجستير معفون من الدورات الحتمية بحكم القانون', source: 'default_statutory', sourceLabel: 'ضابط شهادة الماجستير' };
  }
  if (eduNorm.includes('دبلوم عالي')) {
    return { isExempt: true, reason: 'حملة شهادة الدبلوم العالي المعادل للماجستير معفون من الدورات الحتمية', source: 'default_statutory', sourceLabel: 'ضابط الدبلوم العالي' };
  }
  if (
    eduNorm.includes('متوسطة') ||
    eduNorm.includes('ابتدائية') ||
    eduNorm.includes('دون') ||
    eduNorm.includes('يقرأ') ||
    eduNorm.includes('أمي') ||
    eduNorm.includes('امي') ||
    eduNorm === 'لا يوجد'
  ) {
    return { isExempt: true, reason: 'المؤهلات ما دون الإعدادية مستثناة من شرط الدورات الحاكمة للترقية', source: 'default_statutory', sourceLabel: 'المؤهلات ما دون الإعدادية' };
  }

  return { isExempt: false, reason: 'مشمول بالدورات التدريبية الحاكمة لاستحقاق الترفيع', source: 'included', sourceLabel: 'مشمول بالحتميات' };
}

/**
 * مطابقة تصنيف الدورة مع متطلب الدرجة
 * يدعم الاستدعاء بمرونة:
 * matchesRequirementCategory(reqCategory, courseCategory, courseName)
 * أو matchesRequirementCategory(courseCategory, courseName, reqCategory)
 * أو matchesRequirementCategory(reqCategory, courseCategory)
 */
export function matchesRequirementCategory(paramA, paramB, paramC = '') {
  let rCat = String(paramA || '').trim().toLowerCase();
  let cCat = String(paramB || '').trim().toLowerCase();
  let cName = String(paramC || '').trim().toLowerCase();

  // If called in reverse order (e.g. courseCategory, courseName, reqCategory)
  if (paramC && (paramC.includes('اختصاص') || paramC.includes('إدار') || paramC.includes('ادار') || paramC.includes('سلام') || paramC.includes('حاس') || paramC.includes('لغ') || paramC.includes('مال'))) {
    if (!paramA.includes('اختصاص') && !paramA.includes('إدار') && !paramA.includes('ادار') && !paramA.includes('سلام') && !paramA.includes('حاس') && !paramA.includes('لغ') && !paramA.includes('مال')) {
      rCat = String(paramC).trim().toLowerCase();
      cCat = String(paramA).trim().toLowerCase();
      cName = String(paramB).trim().toLowerCase();
    }
  }

  const courseText = `${cCat} ${cName}`.trim().toLowerCase();
  if (!rCat || !courseText) return false;

  // Direct match
  if (cCat && (cCat === rCat || cCat.includes(rCat) || rCat.includes(cCat))) return true;
  if (cName && (cName.includes(rCat) || rCat.includes(cName))) return true;

  // 1. Specialization
  if (rCat.includes('اختصاص') || rCat.includes('تخصص') || rCat.includes('فني') || rCat.includes('هندس')) {
    if (
      courseText.includes('اختصاص') ||
      courseText.includes('تخصص') ||
      courseText.includes('فني') ||
      courseText.includes('هندس') ||
      courseText.includes('مختبر') ||
      courseText.includes('صيانة') ||
      courseText.includes('تشغيل') ||
      courseText.includes('جيولوجيا') ||
      courseText.includes('حفر') ||
      courseText.includes('إنتاج')
    ) {
      return true;
    }
  }

  // 2. Administrative / Leadership
  if (rCat.includes('إدار') || rCat.includes('ادار') || rCat.includes('قياد') || rCat.includes('قانون') || rCat.includes('إشراف') || rCat.includes('اشراف')) {
    if (
      courseText.includes('إدار') ||
      courseText.includes('ادار') ||
      courseText.includes('قياد') ||
      courseText.includes('قانون') ||
      courseText.includes('إشراف') ||
      courseText.includes('اشراف') ||
      courseText.includes('تنظيم') ||
      courseText.includes('تحقيق') ||
      courseText.includes('عقود') ||
      courseText.includes('مشتريات') ||
      courseText.includes('تخطيط') ||
      courseText.includes('تطوير')
    ) {
      return true;
    }
  }

  // 3. HSE / Safety & Environment
  if (rCat.includes('hse') || rCat.includes('سلام') || rCat.includes('بيئ') || rCat.includes('صحة مهنية') || rCat.includes('دفاع')) {
    if (
      courseText.includes('hse') ||
      courseText.includes('سلام') ||
      courseText.includes('بيئ') ||
      courseText.includes('صحة مهنية') ||
      courseText.includes('دفاع') ||
      courseText.includes('إسعاف') ||
      courseText.includes('حرائق') ||
      courseText.includes('مخاطر')
    ) {
      return true;
    }
  }

  // 4. Computer / IT
  if (rCat.includes('حاسوب') || rCat.includes('حاسب') || rCat.includes('تكنول') || rCat.includes('برمج') || rCat.includes('it')) {
    if (
      courseText.includes('حاسوب') ||
      courseText.includes('حاسب') ||
      courseText.includes('تكنول') ||
      courseText.includes('برمج') ||
      courseText.includes('it') ||
      courseText.includes('اكسل') ||
      courseText.includes('excel') ||
      courseText.includes('word') ||
      courseText.includes('شبكات') ||
      courseText.includes('سيبراني') ||
      courseText.includes('نظام')
    ) {
      return true;
    }
  }

  // 5. Languages & Negotiation
  if (rCat.includes('لغ') || rCat.includes('انكليز') || rCat.includes('إنجليز') || rCat.includes('تفاوض') || rCat.includes('لجان')) {
    if (
      courseText.includes('لغ') ||
      courseText.includes('انكليز') ||
      courseText.includes('إنجليز') ||
      courseText.includes('تفاوض') ||
      courseText.includes('لجان') ||
      courseText.includes('english') ||
      courseText.includes('ترجمة')
    ) {
      return true;
    }
  }

  // 6. Finance & Accounting
  if (rCat.includes('مال') || rCat.includes('محاسب') || rCat.includes('تدقيق')) {
    if (
      courseText.includes('مال') ||
      courseText.includes('محاسب') ||
      courseText.includes('تدقيق') ||
      courseText.includes('موازنة') ||
      courseText.includes('رواتب') ||
      courseText.includes('جرد')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * تجميع وتوحيد كافة دورات الموظف من المصادر الثلاثة:
 * 1. trainingCourses (جدول الدورات المباشرة للموظف)
 * 2. trainings + trainingEnrollments (برامج التدريب المركزية)
 * 3. specializationCredits (دورات الاختصاص المعتمدة)
 */
export function getUnifiedEmployeeCourses(emp, trainingCourses = [], trainingsList = [], enrollmentsList = [], specializationCredits = []) {
  if (!emp) return [];
  const empId = String(emp.id || '');
  const currentGrade = parseInt(emp.grade || emp.currentGrade || emp.current_grade) || 8;

  const list = [];
  const seenKeys = new Set();

  // 1. دورات ملف الموظف المباشرة (trainingCourses)
  (trainingCourses || []).forEach((tc) => {
    if (!tc) return;
    const tcEmpId = String(tc.employee_id || tc.employeeId || '');
    if (tcEmpId && tcEmpId !== empId) return;

    const name = tc.course_name || tc.courseName || 'دورة تدريبية';
    const sDate = tc.start_date || tc.startDate || '';
    const eDate = tc.end_date || tc.endDate || '';
    const yr = tc.year || (sDate ? sDate.substring(0, 4) : new Date().getFullYear().toString());
    const days = parseInt(tc.days || tc.duration_days || tc.durationDays) || (tc.duration ? parseInt(tc.duration) : 5);
    const hours = parseInt(tc.hours || tc.training_hours || tc.duration_hours) || (days * 4);
    const gradeAtTime = parseInt(tc.grade_at_time || tc.gradeAtTime || tc.grade) || currentGrade;
    const category = tc.category || tc.course_category || (name.includes('إدار') ? 'إدارية' : name.includes('سلام') ? 'سلامة وبيئة (H.S.E)' : name.includes('حاس') ? 'حاسوب وتكنولوجيا' : 'اختصاص');
    const result = tc.result || tc.status || 'اجتاز';
    const isPassed = result === 'اجتاز' || result === 'ناجح' || result === 'مكتمل' || result === 'معفى';

    const key = `tc_${tc.id || `${name}_${sDate}`}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      list.push({
        id: tc.id || key,
        source: 'training_course',
        sourceLabel: 'ملف الموظف',
        courseName: name,
        course_name: name,
        category,
        days,
        hours,
        year: yr,
        startDate: sDate,
        start_date: sDate,
        endDate: eDate,
        end_date: eDate,
        gradeAtTime,
        institution: tc.institution || tc.provider || 'مركز التدريب والتطوير',
        orderNumber: tc.order_number || tc.orderNumber || '',
        orderDate: tc.order_date || tc.orderDate || '',
        result,
        isPassed,
        notes: tc.notes || '',
      });
    }
  });

  // 2. برامج وخطط التدريب المركزية (Trainings & Enrollments)
  const empEnrollments = (enrollmentsList || []).filter((en) => {
    return en && String(en.employee_id || en.employeeId) === empId;
  });

  empEnrollments.forEach((en) => {
    const trainingId = en.training_id || en.trainingId;
    const parentTraining = (trainingsList || []).find((t) => t && (t.id === trainingId || String(t.id) === String(trainingId))) || {};

    const name = en.course_name || en.courseName || parentTraining.course_name || parentTraining.courseName || parentTraining.title || parentTraining.name || 'برنامج تدريبي';
    const sDate = en.start_date || en.startDate || parentTraining.start_date || parentTraining.startDate || '';
    const eDate = en.end_date || en.endDate || parentTraining.end_date || parentTraining.endDate || '';
    const yr = parentTraining.year || (sDate ? sDate.substring(0, 4) : new Date().getFullYear().toString());

    let days = parseInt(en.days || en.duration_days || parentTraining.duration_days || parentTraining.duration) || 5;
    if (parentTraining.duration_unit === 'بالأسابيع' || parentTraining.durationUnit === 'بالأسابيع') {
      days = (parseInt(parentTraining.duration) || 1) * 5;
    }
    const hours = parseInt(en.hours || en.training_hours || parentTraining.hours) || (days * 4);
    const gradeAtTime = parseInt(en.grade_at_time || en.gradeAtTime || parentTraining.target_grade) || currentGrade;

    let category = en.category || parentTraining.course_categories || parentTraining.courseCategories || parentTraining.category;
    if (Array.isArray(category)) category = category.join('، ');
    category = category || (name.includes('إدار') ? 'إدارية' : name.includes('سلام') ? 'سلامة وبيئة (H.S.E)' : name.includes('حاس') ? 'حاسوب وتكنولوجيا' : 'اختصاص');

    const result = en.status || en.evaluation_result || en.result || (en.completed ? 'اجتاز' : 'مستمر');
    const isPassed = en.completed === true || result === 'اجتاز' || result === 'ناجح' || result === 'مكتمل' || result === 'معفى';

    const key = `en_${en.id || `${trainingId}_${name}_${sDate}`}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      list.push({
        id: en.id || key,
        source: 'central_training',
        sourceLabel: 'الخطة التدريبية المركزية',
        courseName: name,
        course_name: name,
        category: String(category),
        days,
        hours,
        year: yr,
        startDate: sDate,
        start_date: sDate,
        endDate: eDate,
        end_date: eDate,
        gradeAtTime,
        institution: parentTraining.location || parentTraining.location_type || 'مركز التدريب والتطوير',
        orderNumber: en.order_number || en.orderNumber || parentTraining.order_number || '',
        orderDate: en.order_date || en.orderDate || parentTraining.order_date || '',
        result,
        isPassed,
        notes: en.notes || parentTraining.notes || '',
      });
    }
  });

  // 3. دورات الاختصاص المعتمدة (Specialization Credits)
  (specializationCredits || []).forEach((sc) => {
    if (!sc) return;
    const scEmpId = String(sc.employee_id || sc.employeeId || '');
    if (scEmpId && scEmpId !== empId) return;

    const name = sc.course_name || sc.courseName || 'دورة اختصاص';
    const sDate = sc.start_date || sc.startDate || '';
    const eDate = sc.end_date || sc.endDate || '';
    const yr = sc.year || (sDate ? sDate.substring(0, 4) : new Date().getFullYear().toString());
    const weeks = parseInt(sc.weeks) || 1;
    const days = weeks * 5;
    const hours = days * 4;
    const gradeAtTime = parseInt(sc.grade_at_time || sc.gradeAtTime) || currentGrade;

    const key = `sc_${sc.id || `${name}_${sDate}`}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      list.push({
        id: sc.id || key,
        source: 'specialization_credit',
        sourceLabel: 'دورة اختصاص معتمدة',
        courseName: name,
        course_name: name,
        category: 'اختصاص',
        days,
        hours,
        year: yr,
        startDate: sDate,
        start_date: sDate,
        endDate: eDate,
        end_date: eDate,
        gradeAtTime,
        institution: sc.institution || 'دورة تخصصية معتمدة',
        orderNumber: sc.order_number || sc.orderNumber || '',
        orderDate: sc.order_date || sc.orderDate || '',
        result: 'اجتاز',
        isPassed: true,
        notes: sc.notes || `دورة اختصاص محتسبة (${weeks} أسبوع)`,
      });
    }
  });

  // Sort descending by startDate or year
  return list.sort((a, b) => {
    const dtA = String(a.startDate || a.year || '');
    const dtB = String(b.startDate || b.year || '');
    return dtB.localeCompare(dtA);
  });
}

/**
 * احتساب تفاصيل الاستيفاء التراكمي الشامل للموظف
 */
export function calculateEmployeeGoverningFulfillment({
  emp,
  gradeRequirements = {},
  exemptionRules = null,
  employeeAssignments = {},
  trainingCourses = [],
  trainingsList = [],
  enrollmentsList = [],
  specializationCredits = []
}) {
  if (!emp) return null;

  const currentGradeNum = parseInt(emp.grade || emp.currentGrade || emp.current_grade) || 8;
  const targetGradeNum = Math.max(1, currentGradeNum - 1);

  // 1. التحقق من الإعفاء
  const exemptionInfo = checkEmployeeExemption(emp, exemptionRules, employeeAssignments);

  // 2. جلب الحتميات المقررة للدرجة
  const reqGradeKey = String(currentGradeNum);
  const gradeReqs = gradeRequirements[reqGradeKey] || DEFAULT_GRADE_TRAINING_REQUIREMENTS[reqGradeKey] || [];

  // 3. جلب وتوحيد كافة دورات الموظف المجتازة والمكتملة
  const allCourses = getUnifiedEmployeeCourses(emp, trainingCourses, trainingsList, enrollmentsList, specializationCredits);
  const passedCourses = allCourses.filter((c) => c.isPassed);

  // 4. مطابقة واحتساب الاستيفاء التراكمي لكل متطلب
  const reqEvaluations = gradeReqs.map((req) => {
    // تجميع كافة الدورات المجتازة المطابقة لهذا المتطلب
    const matchedCourses = passedCourses.filter((c) => {
      return matchesRequirementCategory(req.category, c.category, c.courseName);
    });

    const totalDaysAchieved = matchedCourses.reduce((sum, c) => sum + (c.days || 0), 0);
    const totalHoursAchieved = matchedCourses.reduce((sum, c) => sum + (c.hours || 0), 0);

    const isDaysMet = totalDaysAchieved >= req.requiredDays;
    const isHoursMet = totalHoursAchieved >= (req.requiredHours || req.requiredDays * 4);
    const isSatisfied = exemptionInfo.isExempt || (isDaysMet && isHoursMet);

    const remainingDays = Math.max(0, req.requiredDays - totalDaysAchieved);
    const remainingHours = Math.max(0, (req.requiredHours || req.requiredDays * 4) - totalHoursAchieved);

    const progressRatio = Math.min(1, Math.max(0, totalDaysAchieved / (req.requiredDays || 1)));

    return {
      requirement: req,
      category: req.category,
      requiredDays: req.requiredDays,
      requiredHours: req.requiredHours || req.requiredDays * 4,
      totalDaysAchieved,
      totalHoursAchieved,
      isSatisfied,
      isExempt: exemptionInfo.isExempt,
      remainingDays,
      remainingHours,
      progressRatio,
      matchedCourses,
      notes: req.notes,
      mandatory: req.mandatory !== false,
    };
  });

  // 5. احتساب النسبة المئوية العامة وحالة الجاهزية للترقية
  let totalMandatoryCount = reqEvaluations.filter((r) => r.mandatory).length;
  let satisfiedMandatoryCount = reqEvaluations.filter((r) => r.mandatory && r.isSatisfied).length;
  let satisfiedCount = reqEvaluations.filter((r) => r.isSatisfied).length;

  let progressPercent = 0;
  if (exemptionInfo.isExempt) {
    progressPercent = 100;
  } else if (gradeReqs.length === 0) {
    progressPercent = 100;
  } else {
    const totalProgressSum = reqEvaluations.reduce((sum, r) => sum + r.progressRatio, 0);
    progressPercent = Math.round((totalProgressSum / gradeReqs.length) * 100);
  }

  const isSatisfied = exemptionInfo.isExempt || progressPercent >= 100 || (totalMandatoryCount > 0 && satisfiedMandatoryCount === totalMandatoryCount);

  let fulfillmentStatusKey = 'غير_مستوفي'; // 'معفى' | 'مستوفي_كامل' | 'مستوفي_جزئي' | 'غير_مستوفي'
  let fulfillmentStatusLabel = 'غير مستوفي (0%)';
  let fulfillmentBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';

  if (exemptionInfo.isExempt) {
    fulfillmentStatusKey = 'معفى';
    fulfillmentStatusLabel = 'معفى من الدورات التدريبية 🛡️';
    fulfillmentBadgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
  } else if (isSatisfied) {
    fulfillmentStatusKey = 'مستوفي_كامل';
    fulfillmentStatusLabel = 'مستوفي بالكامل (جاهز للترقية) 🏆';
    fulfillmentBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (progressPercent > 0 || reqEvaluations.some((r) => r.totalDaysAchieved > 0)) {
    fulfillmentStatusKey = 'مستوفي_جزئي';
    fulfillmentStatusLabel = `مستوفي جزئياً (${progressPercent}%) ⏳`;
    fulfillmentBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
  }

  const satisfiedRequirements = reqEvaluations.filter(r => r.isSatisfied);
  const pendingRequirements = reqEvaluations.filter(r => !r.isSatisfied);

  const allMatchedCoursesMap = new Map();
  reqEvaluations.forEach(r => {
    (r.matchedCourses || []).forEach(mc => {
      const key = mc.id || `${mc.courseName}_${mc.startDate}`;
      if (!allMatchedCoursesMap.has(key)) {
        allMatchedCoursesMap.set(key, {
          ...mc,
          matchedCategory: r.category
        });
      }
    });
  });
  const contributingCourses = Array.from(allMatchedCoursesMap.values());

  return {
    emp,
    currentGradeNum,
    targetGradeNum,
    currentGradeLabel: getArabicGradeLabel(currentGradeNum),
    targetGradeLabel: getArabicGradeLabel(targetGradeNum),
    exemptionInfo,
    gradeReqs,
    reqEvaluations,
    satisfiedRequirements,
    pendingRequirements,
    contributingCourses,
    allCourses,
    passedCourses,
    progressPercent,
    isSatisfied,
    isFullyReady: isSatisfied,
    satisfiedCount,
    totalRequirements: gradeReqs.length,
    fulfillmentStatusKey,
    fulfillmentStatusLabel,
    fulfillmentBadgeClass,
  };
}
