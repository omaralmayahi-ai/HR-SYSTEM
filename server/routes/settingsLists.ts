// server/routes/settingsLists.ts — قوائم الإعدادات (B3، الدفعة 2، نقل حرفي)
// سلّم الرواتب، قواعد الترفيع، أنواع كتب الشكر وسجلها وضوابطها، المخصصات والاستقطاعات، الشهادات،
// المسؤوليات، أنواع الإجازات، أنواع العقوبات، نماذج التقييم، أنظمة المناوبة، العناوين الوظيفية.
// نُقل حرفياً من server.ts؛ فروع الذاكرة الباقية فيه (بعد فشل القاعدة فقط، والبوابة تمنعها) تُحذف
// مجالاً مجالاً في PR لاحق. ما يحتاجه من server.ts يصل عبر deps صراحة.
import type { Express } from 'express';
import type { AuthRequest } from '../../src/middleware/auth.ts';

export function registerSettingsListRoutes(app: Express, deps: any) {
  const { SALARY_TABLE, asc, bothCases, camelToSnake, checkReferentialUsage, db, desc, eq, inMemoryEmployees, jobTitlesCache, logRecalcError, mapKeys, registerLookupRoutes, registerWorkLocationRoutes, requireAdmin, requireAuth, requireWriter, respondIfDbWriteError, routeCtx, saveLocalDb, schema, sendRouteError, snakeToCamel, sql, triggerRecalculateEligibility } = deps;

  // --- In-Memory Stores for Offline/Fallback Development ---
  let inMemorySalaryScale: any[] = [];
  function getUnifiedSalaryScaleDefaults() {
    const records: any[] = [];
    let idCounter = 1;
    for (let g = 1; g <= 10; g++) {
      for (let s = 1; s <= 11; s++) {
        records.push({
          id: idCounter++,
          grade: g,
          step: s,
          amount: (SALARY_TABLE as any)[g]?.[s] || 250000,
          effectiveFrom: '2026-08-27', // تاريخ بداية التتبع (خط الأساس)
          effective_from: '2026-08-27',
          createdAt: new Date().toISOString()
        });
      }
    }
    return records;
  }

  let inMemoryGradePromotionRules: any[] = [
    { id: 1, grade: 1, promotion_years: null, promotionYears: null, notes: 'قمة السلم الوظيفي - لا يوجد ترفيع أعلى' },
    { id: 2, grade: 2, promotion_years: 5, promotionYears: 5, notes: 'الدرجة الثانية إلى الأولى' },
    { id: 3, grade: 3, promotion_years: 5, promotionYears: 5, notes: 'الدرجة الثالثة إلى الثانية' },
    { id: 4, grade: 4, promotion_years: 5, promotionYears: 5, notes: 'الدرجة الرابعة إلى الثالثة' },
    { id: 5, grade: 5, promotion_years: 5, promotionYears: 5, notes: 'الدرجة الخامسة إلى الرابعة' },
    { id: 6, grade: 6, promotion_years: 4, promotionYears: 4, notes: 'الدرجة السادسة إلى الخامسة' },
    { id: 7, grade: 7, promotion_years: 4, promotionYears: 4, notes: 'الدرجة السابعة إلى السادسة' },
    { id: 8, grade: 8, promotion_years: 4, promotionYears: 4, notes: 'الدرجة الثامنة إلى السابعة' },
    { id: 9, grade: 9, promotion_years: 4, promotionYears: 4, notes: 'الدرجة التاسعة إلى الثامنة' },
    { id: 10, grade: 10, promotion_years: 4, promotionYears: 4, notes: 'الدرجة العاشرة إلى التاسعة' },
    { id: 11, grade: 11, promotion_years: null, promotionYears: null, notes: 'درجة خاصة / عليا أ' },
    { id: 12, grade: 12, promotion_years: null, promotionYears: null, notes: 'درجة خاصة / عليا ب' },
    { id: 13, grade: 13, promotion_years: null, promotionYears: null, notes: 'درجة خاصة / عليا ج' },
  ];

  let inMemoryCommendationTypes: any[] = [
    { id: 1, name: 'كتاب شكر وتقدير اعتيادي / مدير عام', credit_months: 1, creditMonths: 1, status: 'فعال', notes: 'يمنح قدماً لمدة شهر واحد' },
    { id: 2, name: 'كتاب شكر وتقدير وزاري', credit_months: 1, creditMonths: 1, status: 'فعال', notes: 'يمنح قدماً لمدة شهر واحد' },
    { id: 3, name: 'كتاب شكر وتقدير استثنائي (رئاسي / رئيس مجلس الوزراء)', credit_months: 6, creditMonths: 6, status: 'فعال', notes: 'يمنح قدماً لمدة 6 أشهر' }
  ];

  let inMemoryEmployeeCommendations: any[] = [];

  let inMemoryCommendationRulesSettings: any = {
    id: 1,
    config_key: 'default_commendation_rules',
    configKey: 'default_commendation_rules',
    max_per_year: 3,
    maxPerYear: 3,
    allowed_combinations: JSON.stringify([
      { label: "3 كتب عادية (شهر واحد)", maxCount: 3, creditMonths: 1 },
      { label: "كتابان عاديان + كتاب استثنائي (6 أشهر)", maxCount: 3, rules: [{ count: 2, creditMonths: 1 }, { count: 1, creditMonths: 6 }] },
      { label: "كتابان استثنائيان (6 أشهر)", maxCount: 2, rules: [{ count: 2, creditMonths: 6 }] }
    ]),
    allowedCombinations: JSON.stringify([
      { label: "3 كتب عادية (شهر واحد)", maxCount: 3, creditMonths: 1 },
      { label: "كتابان عاديان + كتاب استثنائي (6 أشهر)", maxCount: 3, rules: [{ count: 2, creditMonths: 1 }, { count: 1, creditMonths: 6 }] },
      { label: "كتابان استثنائيان (6 أشهر)", maxCount: 2, rules: [{ count: 2, creditMonths: 6 }] }
    ]),
    degreeTrackAutoSettlement: false,
    degree_track_auto_settlement: false,
    reminderDaysCourse: 30,
    reminder_days_course: 30,
    reminderDaysPenalty: 15,
    reminder_days_penalty: 15,
    reminderDaysLeave: 30,
    reminder_days_leave: 30,
    reminderDaysEvaluation: 30,
    reminder_days_evaluation: 30,
    reminderDaysAbsence: 10,
    reminder_days_absence: 10
  };

  let inMemoryAllowancesDeductions: any[] = [
    { id: 1, name: 'مخصصات زوجية', type: 'allowance', calcType: 'flat', value: 50000, status: 'فعال' },
    { id: 2, name: 'مخصصات أطفال (لكل طفل)', type: 'allowance', calcType: 'flat', value: 10000, status: 'فعال' },
    { id: 3, name: 'مخصصات خطورة مهنية', type: 'allowance', calcType: 'percentage', value: 20, status: 'فعال' },
    { id: 4, name: 'مخصصات موقع جغرافي / نأي', type: 'allowance', calcType: 'flat', value: 50000, status: 'فعال' },
    { id: 5, name: 'استقطاع التقاعد الإلزامي', type: 'deduction', calcType: 'percentage', value: 10, status: 'فعال' },
    { id: 6, name: 'استقطاع ضريبة الدخل', type: 'deduction', calcType: 'percentage', value: 3, status: 'فعال' },
    { id: 7, name: 'استقطاع صندوق التكافل الاجتماعي', type: 'deduction', calcType: 'flat', value: 10000, status: 'فعال' }
  ];

  let inMemoryEducationDegrees: any[] = [
    { id: 1, name: 'دكتوراه', allowance_rate: 100, is_higher_education: true, higher_allowance_rate: 100, baseline_grade: 5, baseline_step: 1, status: 'فعال' },
    { id: 2, name: 'ماجستير', allowance_rate: 75, is_higher_education: true, higher_allowance_rate: 75, baseline_grade: 6, baseline_step: 1, status: 'فعال' },
    { id: 3, name: 'دبلوم عالي', allowance_rate: 65, is_higher_education: true, higher_allowance_rate: 65, baseline_grade: 6, baseline_step: 1, status: 'فعال' },
    { id: 4, name: 'بكالوريوس', allowance_rate: 45, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 7, baseline_step: 1, status: 'فعال' },
    { id: 5, name: 'دبلوم فني', allowance_rate: 35, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1, status: 'فعال' },
    { id: 6, name: 'إعدادية', allowance_rate: 25, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1, status: 'فعال' },
    { id: 7, name: 'متوسطة', allowance_rate: 15, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 9, baseline_step: 1, status: 'فعال' },
    { id: 8, name: 'ابتدائية', allowance_rate: 0, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1, status: 'فعال' },
    { id: 9, name: 'يقرأ ويكتب', allowance_rate: 0, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1, status: 'فعال' }
  ];

  let inMemoryResponsibilityAllowances: any[] = [
    { id: 1, name: 'مدير عام', allowance_rate: 50, status: 'فعال' },
    { id: 2, name: 'معاون مدير عام', allowance_rate: 40, status: 'فعال' },
    { id: 3, name: 'مدير هيئة', allowance_rate: 35, status: 'فعال' },
    { id: 4, name: 'مدير قسم مركزي', allowance_rate: 30, status: 'فعال' },
    { id: 5, name: 'مدير قسم', allowance_rate: 25, status: 'فعال' },
    { id: 6, name: 'مسؤول شعبة', allowance_rate: 20, status: 'فعال' },
    { id: 7, name: 'مسؤول وحدة', allowance_rate: 15, status: 'فعال' },
    { id: 8, name: 'مسؤول وجبة', allowance_rate: 10, status: 'فعال' },
    { id: 9, name: 'بلا مسؤولية', allowance_rate: 0, status: 'فعال' }
  ];




  let inMemoryShiftSystems: any[] = [
    { id: 1, name: 'دوام صباحي اعتيادي (5 أيام عمل / يومين راحة)', work_days: 5, rest_days: 2, allowance_amount: 0, status: 'فعال' },
    { id: 2, name: 'نظام مناوبة حقول (14 يوم عمل / 14 يوم استراحة)', work_days: 14, rest_days: 14, allowance_amount: 100000, status: 'فعال' },
    { id: 3, name: 'نظام مناوبة أسبوعي (7 أيام عمل / 7 أيام استراحة)', work_days: 7, rest_days: 7, allowance_amount: 50000, status: 'فعال' }
  ];

  let inMemoryLeaveTypes: any[] = [
    { 
      id: 1, 
      name: 'إجازة اعتيادية براتب تام', 
      max_days: 36, 
      maxDays: 36, 
      administrative_effect: 'لا_يؤثر', 
      administrativeEffect: 'لا_يؤثر', 
      financial_effect: 'براتب_كامل', 
      financialEffect: 'براتب_كامل', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: false,
      affectsCommendations: false,
      salary_payment_type: 'منح_الراتب_كامل',
      salaryPaymentType: 'منح_الراتب_كامل',
      effects_options: JSON.stringify(['منح_الراتب_كامل']),
      effectsOptions: JSON.stringify(['منح_الراتب_كامل']),
      description: 'تمنح برصيد اعتيادي سنوي بمعدل يومين ونصف عن كل شهر خدمة فعلي متراكم', 
      status: 'فعال' 
    },
    { 
      id: 2, 
      name: 'إجازة مرضية براتب تام', 
      max_days: 120, 
      maxDays: 120, 
      administrative_effect: 'لا_يؤثر', 
      administrativeEffect: 'لا_يؤثر', 
      financial_effect: 'براتب_كامل', 
      financialEffect: 'براتب_كامل', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: false,
      affectsCommendations: false,
      salary_payment_type: 'منح_الراتب_كامل',
      salaryPaymentType: 'منح_الراتب_كامل',
      effects_options: JSON.stringify(['منح_الراتب_كامل']),
      effectsOptions: JSON.stringify(['منح_الراتب_كامل']),
      description: 'بتقارير طبية معتمدة من اللجان الرسمية المختصة', 
      status: 'فعال' 
    },
    { 
      id: 3, 
      name: 'إجازة أمومة ورعاية طفل', 
      max_days: 365, 
      maxDays: 365, 
      administrative_effect: 'لا_يؤثر', 
      administrativeEffect: 'لا_يؤثر', 
      financial_effect: 'براتب_ومخصصات_ثابتة', 
      financialEffect: 'براتب_ومخصصات_ثابتة', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: false,
      affectsCommendations: false,
      salary_payment_type: 'منح_الراتب_والمخصصات_الثابتة_فقط',
      salaryPaymentType: 'منح_الراتب_والمخصصات_الثابتة_فقط',
      effects_options: JSON.stringify(['منح_الراتب_والمخصصات_الثابتة_فقط']),
      effectsOptions: JSON.stringify(['منح_الراتب_والمخصصات_الثابتة_فقط']),
      description: 'للموظفات لرعاية الطفل بموجب قانون الخدمة المدنية', 
      status: 'فعال' 
    },
    { 
      id: 4, 
      name: 'إجازة حج بيت الله الحرام', 
      max_days: 30, 
      maxDays: 30, 
      administrative_effect: 'لا_يؤثر', 
      administrativeEffect: 'لا_يؤثر', 
      financial_effect: 'براتب_كامل', 
      financialEffect: 'براتب_كامل', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: false,
      affectsCommendations: false,
      salary_payment_type: 'منح_الراتب_كامل',
      salaryPaymentType: 'منح_الراتب_كامل',
      effects_options: JSON.stringify(['منح_الراتب_كامل']),
      effectsOptions: JSON.stringify(['منح_الراتب_كامل']),
      description: 'لمرة واحدة طوال الخدمة الوظيفية براتب تام', 
      status: 'فعال' 
    },
    { 
      id: 5, 
      name: 'إجازة دراسية لتطوير الكفاءات', 
      max_days: 730, 
      maxDays: 730, 
      administrative_effect: 'توقف_منح_كتب_الشكر', 
      administrativeEffect: 'توقف_منح_كتب_الشكر', 
      financial_effect: 'براتب_ومخصصات_ثابتة', 
      financialEffect: 'براتب_ومخصصات_ثابتة', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: true,
      affectsCommendations: true,
      salary_payment_type: 'منح_الراتب_والمخصصات_الثابتة_فقط',
      salaryPaymentType: 'منح_الراتب_والمخصصات_الثابتة_فقط',
      effects_options: JSON.stringify(['كتب_الشكر', 'منح_الراتب_والمخصصات_الثابتة_فقط']),
      effectsOptions: JSON.stringify(['كتب_الشكر', 'منح_الراتب_والمخصصات_الثابتة_فقط']),
      description: 'لإكمال الدراسات العليا داخل أو خارج العراق وتوقف منح كتب الشكر والتقدير أثناء التمتع بها', 
      status: 'فعال' 
    },
    { 
      id: 6, 
      name: 'إجازة بدون راتب (طارئة / مصاحبة)', 
      max_days: 365, 
      maxDays: 365, 
      administrative_effect: 'يوقف_الترفيع_والعلاوة_وكتب_الشكر', 
      administrativeEffect: 'يوقف_الترفيع_والعلاوة_وكتب_الشكر', 
      financial_effect: 'بدون_راتب', 
      financialEffect: 'بدون_راتب', 
      financial_deduction_percentage: 100,
      financialDeductionPercentage: 100,
      affects_increment: true,
      affectsIncrement: true,
      affects_promotion: true,
      affectsPromotion: true,
      affects_commendations: true,
      affectsCommendations: true,
      salary_payment_type: 'بدون_راتب',
      salaryPaymentType: 'بدون_راتب',
      effects_options: JSON.stringify(['العلاوة_السنوية', 'الترفيع', 'كتب_الشكر', 'بدون_راتب']),
      effectsOptions: JSON.stringify(['العلاوة_السنوية', 'الترفيع', 'كتب_الشكر', 'بدون_راتب']),
      description: 'إجازة استثنائية بدون راتب توقف الترفيع والعلاوة وتوقف منح كتب الشكر والتقدير', 
      status: 'فعال' 
    }
  ];

  // --- Penalty Types Canonical Data & In-Memory Store ---
  let inMemoryPenaltyTypes: any[] = [
    { id: 1, name: 'لفت نظر', deduction_type: 'بدون قطع مالي', deduction_value: 'بدون قطع مالي', delay_months: 0, delay_rule: 'لا يؤخر', description: 'تنبيه الموظف إلى التقصير', status: 'فعال' },
    { id: 2, name: 'إنذار', deduction_type: 'بدون قطع مالي', deduction_value: 'بدون قطع مالي', delay_months: 0, delay_rule: 'لا يؤخر', description: 'توجيه إنذار رسمي للموظف', status: 'فعال' },
    { id: 3, name: 'قطع راتب', deduction_type: 'قطع راتب لأيام محددة', deduction_value: 'حسب الأيام', delay_months: 0, delay_rule: 'لا يؤخر', description: 'استقطاع الراتب الاسمي لعدة أيام', status: 'فعال' },
    { id: 4, name: 'توبيخ', deduction_type: 'بدون قطع مالي', deduction_value: 'بدون قطع مالي', delay_months: 0, delay_rule: 'لا يؤخر', description: 'توبيخ رسمي موثق في إضبارة الخدمة', status: 'فعال' },
    { id: 5, name: 'إنقاص راتب', deduction_type: 'نسبة مئوية', deduction_value: '10%', delay_months: 6, delay_rule: 'تأخير الترفيع 6 أشهر', description: 'إنقاص الراتب بنسبة محددة لمدة معلومة', status: 'فعال' },
    { id: 6, name: 'تنزيل درجة', deduction_type: 'تنزيل درجة وظيفية', deduction_value: 'درجة واحدة', delay_months: 24, delay_rule: 'تنزيل درجة وتأخير الترفيع سنتين', description: 'تنزيل الموظف إلى الدرجة الأدنى مباشرة', status: 'فعال' },
    { id: 7, name: 'فصل', deduction_type: 'إنهاء خدمة مؤقت', deduction_value: 'فصل مؤقت', delay_months: 0, delay_rule: 'فصل', description: 'فصل الموظف للمدة القانونية المحددة', status: 'فعال' },
    { id: 8, name: 'عزل', deduction_type: 'إنهاء خدمة نهائي', deduction_value: 'عزل نهائي', delay_months: 0, delay_rule: 'عزل', description: 'عزل الموظف نهائياً من الوظيفة العامة', status: 'فعال' }
  ];

  // --- Job Titles Canonical Data & In-Memory Store ---
  const DEFAULT_JOB_TITLES = [
    { id: 1, name: 'رئيس مهندسين أقدم', category: 'هندسي', min_grade: 1, min_step: 1, status: 'فعال', notes: '' },
    { id: 2, name: 'رئيس مهندسين', category: 'هندسي', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 3, name: 'مهندس أقدم', category: 'هندسي', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 4, name: 'مهندس', category: 'هندسي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 5, name: 'معاون مهندس', category: 'هندسي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 6, name: 'رئيس مبرمجين أقدم', category: 'حاسبات وتقنية', min_grade: 1, min_step: 1, status: 'فعال', notes: '' },
    { id: 7, name: 'رئيس مبرمجين', category: 'حاسبات وتقنية', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 8, name: 'مبرمج أقدم', category: 'حاسبات وتقنية', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 9, name: 'مبرمج', category: 'حاسبات وتقنية', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 10, name: 'معاون مبرمج', category: 'حاسبات وتقنية', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 11, name: 'مدير عام', category: 'إداري', min_grade: 1, min_step: 1, status: 'فعال', notes: '' },
    { id: 12, name: 'مدير أقدم', category: 'إداري', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 13, name: 'مدير', category: 'إداري', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 14, name: 'رئيس ملاحظين', category: 'إداري', min_grade: 4, min_step: 1, status: 'فعال', notes: '' },
    { id: 15, name: 'ملاحظ', category: 'إداري', min_grade: 5, min_step: 1, status: 'فعال', notes: '' },
    { id: 16, name: 'معاون ملاحظ', category: 'إداري', min_grade: 6, min_step: 1, status: 'فعال', notes: '' },
    { id: 17, name: 'كاتب طابعة', category: 'إداري', min_grade: 8, min_step: 1, status: 'فعال', notes: '' },
    { id: 18, name: 'رئيس مدققين أقدم', category: 'مالي', min_grade: 1, min_step: 1, status: 'فعال', notes: '' },
    { id: 19, name: 'رئيس مدققين', category: 'مالي', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 20, name: 'مدقق أقدم', category: 'مالي', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 21, name: 'مدقق حسابات', category: 'مالي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 22, name: 'محاسب', category: 'مالي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 23, name: 'معاون محاسب', category: 'مالي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 24, name: 'رئيس مشاورين قانونيين', category: 'قانوني', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 25, name: 'مشاور قانوني أقدم', category: 'قانوني', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 26, name: 'مشاور قانوني', category: 'قانوني', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 27, name: 'معاون مشاور قانوني', category: 'قانوني', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 28, name: 'طبيب اختصاص', category: 'طبي وصحي', min_grade: 5, min_step: 1, status: 'فعال', notes: '' },
    { id: 29, name: 'طبيب ممارس', category: 'طبي وصحي', min_grade: 6, min_step: 1, status: 'فعال', notes: '' },
    { id: 30, name: 'ممرض جامعي', category: 'طبي وصحي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 31, name: 'فني أقدم', category: 'فني', min_grade: 6, min_step: 1, status: 'فعال', notes: '' },
    { id: 32, name: 'فني', category: 'فني', min_grade: 8, min_step: 1, status: 'فعال', notes: '' },
    { id: 33, name: 'حرفي أقدم', category: 'مهني وحرفي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 34, name: 'حرفي', category: 'مهني وحرفي', min_grade: 8, min_step: 1, status: 'فعال', notes: '' },
    { id: 35, name: 'سائق', category: 'خدمات', min_grade: 8, min_step: 1, status: 'فعال', notes: '' },
    { id: 36, name: 'حارس أمني', category: 'أمن وحماية', min_grade: 9, min_step: 1, status: 'فعال', notes: '' },
    { id: 37, name: 'موظف خدمة', category: 'خدمات', min_grade: 10, min_step: 1, status: 'فعال', notes: '' }
  ];

  if (!jobTitlesCache.list || jobTitlesCache.list.length === 0) {
    jobTitlesCache.list = DEFAULT_JOB_TITLES.map(t => ({ ...t, minGrade: t.min_grade, minStep: t.min_step }));
  }

  // إصلاح عاجل (مراجعة B3: Blocker): فحص الارتباط قبل الحذف من القاعدة. كان يقرأ مخازن الذاكرة
  // (فارغة بعد B2e) فيسمح بحذف مخصص/شهادة/عنوان مستعمل فعلاً من موظفين.
  async function buildRefContext() {
    const all = (t: any) => db.select().from(t).then((rows: any[]) => rows.map(bothCases));
    const [employees, jobAssignments, qualifications, penalties, performanceEvaluations, assignments,
      jobTitles, shiftSystems, allowances, degrees, responsibilities, penaltyTypes, evaluationForms, governingCourses] = await Promise.all([
      all(schema.employees), all(schema.jobAssignments), all(schema.qualifications), all(schema.penalties),
      all(schema.performanceEvaluations), all(schema.governingCourseEmployeeAssignments),
      all(schema.jobTitles), all(schema.shiftSystems), all(schema.allowancesDeductions), all(schema.educationDegrees),
      all(schema.responsibilityAllowances), all(schema.penaltyTypes), all(schema.evaluationForms), all(schema.governingCourses),
    ]);
    const forms = evaluationForms.length ? evaluationForms : CANONICAL_SEED_FORMS;
    return {
      employees,
      jobAssignments,
      qualifications,
      penalties,
      performanceEvaluations,
      governingCourseAssignments: assignments,
      entities: {
        'job_titles': jobTitles, 'job-titles': jobTitles,
        'shift_systems': shiftSystems, 'shift-systems': shiftSystems,
        'allowances_deductions': allowances, 'allowances-deductions': allowances,
        'education_degrees': degrees, 'education-degrees': degrees,
        'responsibility_allowances': responsibilities, 'responsibility-allowances': responsibilities,
        'penalty_types': penaltyTypes, 'penalty-types': penaltyTypes,
        'evaluation_forms': forms, 'evaluation-forms': forms,
        'governing_courses': governingCourses, 'governing-courses': governingCourses,
      }
    };
  }

  // --- Job Titles API (العناوين الوظيفية والمهنية) ---
  app.get('/api/job-titles', requireAuth, async (req, res) => {
    try {
      const statusParam = req.query.status as string;
      let query = db.select().from(schema.jobTitles).orderBy(asc(schema.jobTitles.name));
      if (statusParam) {
        query = query.where(eq(schema.jobTitles.status, statusParam)) as any;
      }
      let records = await query;
      if (records && records.length > 0) {
        return res.json(records.map(r => mapKeys(r, camelToSnake)));
      } else {
        // B5 (ق-7): ما تُزرع عناوين من الكود؛ الدليل يُبنى من العناوين المعتمدة ويُكمَّل يدوياً
        return res.json([]);
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const statusParam = req.query.status as string;
    let list = jobTitlesCache.list;
    if (statusParam) {
      list = list.filter(t => t.status === statusParam);
    }
    res.json(list.map(t => mapKeys(t, camelToSnake)));
  });

  app.post('/api/job-titles', requireAuth, requireWriter, async (req, res) => {
    const { name, category, min_grade, minGrade, min_step, minStep, next_title_id, nextTitleId, status, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم العنوان الوظيفي مطلوب' });
    }
    const trimmedName = name.trim();
    const normalizeArabic = (text: string) => {
      if (!text) return '';
      return text
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ىي]/g, 'ي')
        .replace(/[ةه]/g, 'ه')
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

    // Uniqueness validation check
    let existingTitles: any[] = jobTitlesCache.list || [];
    try {
      const dbList = await db.select().from(schema.jobTitles);
      if (dbList && dbList.length > 0) existingTitles = dbList;
    } catch (e) {}

    const normInput = normalizeArabic(trimmedName);
    const isDuplicate = existingTitles.some(t => t.name && normalizeArabic(t.name) === normInput);
    if (isDuplicate) {
      return res.status(400).json({
        error: 'اسم العنوان الوظيفي مسجل مسبقاً في النظام، يجب أن يكون كل عنوان وظيفي مميزاً وفريداً.'
      });
    }

    const mGrade = min_grade !== undefined ? parseInt(min_grade) : (minGrade !== undefined ? parseInt(minGrade) : 7);
    const mStep = min_step !== undefined ? parseInt(min_step) : (minStep !== undefined ? parseInt(minStep) : 1);
    const nxtId = next_title_id !== undefined ? (next_title_id ? parseInt(next_title_id) : null) : (nextTitleId !== undefined ? (nextTitleId ? parseInt(nextTitleId) : null) : null);

    const extras = parseTitleExtras(req.body || {}, mGrade);
    if (extras.error) return res.status(400).json({ error: extras.error });
    try {
      const [newRecord] = await db.insert(schema.jobTitles).values({
        name: trimmedName,
        category: category || 'عام',
        minGrade: mGrade,
        minStep: mStep,
        nextTitleId: nxtId,
        status: status || 'فعال',
        notes: notes || '',
        ...extras.values,
      }).returning();
      if (newRecord) {
        saveLocalDb();
        return res.status(201).json(mapKeys(newRecord, camelToSnake));
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'إضافة العنوان الوظيفي')) return;
    }
    const newId = jobTitlesCache.list.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) + 1;
    const memItem = {
      id: newId,
      name: trimmedName,
      category: category || 'عام',
      min_grade: mGrade,
      minGrade: mGrade,
      min_step: mStep,
      minStep: mStep,
      next_title_id: nxtId,
      nextTitleId: nxtId,
      status: status || 'فعال',
      notes: notes || '',
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    jobTitlesCache.list.push(memItem);
    saveLocalDb();
    res.status(201).json(mapKeys(memItem, camelToSnake));
  });

  app.put('/api/job-titles/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, category, min_grade, minGrade, min_step, minStep, next_title_id, nextTitleId, status, notes } = req.body;
      const normalizeArabic = (text: string) => {
        if (!text) return '';
        return text
          .replace(/[أإآا]/g, 'ا')
          .replace(/[ىي]/g, 'ي')
          .replace(/[ةه]/g, 'ه')
          .replace(/[\u064B-\u065F]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      };

      // Uniqueness validation check on rename
      if (name && name.trim()) {
        const trimmedName = name.trim();
        const normInput = normalizeArabic(trimmedName);
        let existingTitles: any[] = jobTitlesCache.list || [];
        try {
          const dbList = await db.select().from(schema.jobTitles);
          if (dbList && dbList.length > 0) existingTitles = dbList;
        } catch (e) {}

        const isDuplicate = existingTitles.some(t => 
          parseInt(t.id) !== id && t.name && normalizeArabic(t.name) === normInput
        );
        if (isDuplicate) {
          return res.status(400).json({
            error: 'اسم العنوان الوظيفي مسجل مسبقاً في النظام، يجب أن يكون كل عنوان وظيفي مميزاً وفريداً.'
          });
        }
      }

      const mGrade = min_grade !== undefined ? parseInt(min_grade) : (minGrade !== undefined ? parseInt(minGrade) : undefined);
      const mStep = min_step !== undefined ? parseInt(min_step) : (minStep !== undefined ? parseInt(minStep) : undefined);
      const nxtId = next_title_id !== undefined ? (next_title_id ? parseInt(next_title_id) : null) : (nextTitleId !== undefined ? (nextTitleId ? parseInt(nextTitleId) : null) : undefined);

      // Comprehensive referential guard: check if deactivating an in-use job title
      if (status === 'معطل' || status === 'غير فعال') {
        let dbEmployees = inMemoryEmployees || [];
        let dbTitles = jobTitlesCache.list || [];
        try {
          const dbEmpList = await db.select().from(schema.employees);
          if (dbEmpList && dbEmpList.length > 0) dbEmployees = dbEmpList;
          const dbTitleList = await db.select().from(schema.jobTitles);
          if (dbTitleList && dbTitleList.length > 0) dbTitles = dbTitleList;
        } catch (e) {}

        const baseRef = await buildRefContext();
        const refCtx = {
          ...baseRef,
          employees: dbEmployees,
          entities: {
            ...baseRef.entities,
            'job_titles': dbTitles,
            'job-titles': dbTitles
          }
        };

        const refCheck = checkReferentialUsage('job_titles', id, true, refCtx);
        if (!refCheck.canProceed) {
          return res.status(400).json({ 
            error: refCheck.message, 
            details: refCheck.affectedSummary,
            count: refCheck.count,
            affectedEmployees: refCheck.affectedEmployees || []
          });
        }
      }

      // Get existing title name before updating to perform cascading rename if changed
      let oldTitle = jobTitlesCache.list.find(t => parseInt(String(t.id)) === id);
      try {
        const dbList = await db.select().from(schema.jobTitles).where(eq(schema.jobTitles.id, id));
        if (dbList && dbList.length > 0) oldTitle = dbList[0];
      } catch (e) {}
      const oldName = oldTitle?.name ? String(oldTitle.name).trim() : '';
      const newName = name ? name.trim() : oldName;

      try {
        const updateData: any = { updatedAt: new Date() };
        if (name) updateData.name = newName;
        if (category !== undefined) updateData.category = category;
        if (mGrade !== undefined) updateData.minGrade = mGrade;
        if (mStep !== undefined) updateData.minStep = mStep;
        if (nxtId !== undefined) updateData.nextTitleId = nxtId;
        if (status !== undefined) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;
        const extras = parseTitleExtras(req.body || {}, mGrade !== undefined ? mGrade : (oldTitle?.minGrade ?? oldTitle?.min_grade));
        const effMax = extras.values.gradeMax !== undefined ? extras.values.gradeMax : (oldTitle?.gradeMax ?? oldTitle?.grade_max ?? null);
        if (mGrade !== undefined && effMax != null && effMax > mGrade) {
          return res.status(400).json({ error: `الدرجة الدنيا (${mGrade}) لازم رقمها أكبر من أو يساوي الدرجة العليا المسجلة للعنوان (${effMax})` });
        }
        if (extras.error) return res.status(400).json({ error: extras.error });
        Object.assign(updateData, extras.values);

        // تعديل العنوان + تحديث العنوان الحالي للموظفين الحاملين للاسم القديم داخل معاملة واحدة.
        // ملاحظة: لا تُعدَّل سجلات job_assignments إطلاقاً؛ فهي أوامر تاريخية صدرت بالاسم القديم.
        const updated = await db.transaction(async (tx) => {
          const [row] = await tx.update(schema.jobTitles)
            .set(updateData)
            .where(eq(schema.jobTitles.id, id))
            .returning();
          if (row && oldName && newName && oldName !== newName) {
            await tx.update(schema.employees)
              .set({ jobTitle: newName, updatedAt: new Date() })
              .where(eq(schema.employees.jobTitle, oldName));
          }
          return row;
        });

        if (!updated) {
          return res.status(404).json({ error: 'العنوان الوظيفي غير موجود' });
        }

        if (oldName && newName && oldName !== newName) {
          (inMemoryEmployees || []).forEach(emp => {
            const curTitle = String(emp.jobTitle || emp.job_title || '').trim();
            if (curTitle === oldName) {
              emp.jobTitle = newName;
              emp.job_title = newName;
              emp.updatedAt = new Date().toISOString();
              emp.updated_at = new Date().toISOString();
            }
          });
        }
        const memIdx = jobTitlesCache.list.findIndex(r => parseInt(String(r.id)) === id);
        if (memIdx !== -1) jobTitlesCache.list[memIdx] = { ...jobTitlesCache.list[memIdx], ...mapKeys(updated, camelToSnake), ...updated };
        saveLocalDb();
        return res.json(mapKeys(updated, camelToSnake));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'تعديل العنوان الوظيفي')) return;
      }

      const idx = jobTitlesCache.list.findIndex(r => parseInt(String(r.id)) === id);
      if (idx !== -1) {
        jobTitlesCache.list[idx] = {
          ...jobTitlesCache.list[idx],
          name: newName,
          category: category !== undefined ? category : jobTitlesCache.list[idx].category,
          min_grade: mGrade !== undefined ? mGrade : jobTitlesCache.list[idx].min_grade,
          minGrade: mGrade !== undefined ? mGrade : jobTitlesCache.list[idx].minGrade,
          min_step: mStep !== undefined ? mStep : jobTitlesCache.list[idx].min_step,
          minStep: mStep !== undefined ? mStep : jobTitlesCache.list[idx].minStep,
          next_title_id: nxtId !== undefined ? nxtId : jobTitlesCache.list[idx].next_title_id,
          nextTitleId: nxtId !== undefined ? nxtId : jobTitlesCache.list[idx].nextTitleId,
          status: status !== undefined ? status : jobTitlesCache.list[idx].status,
          notes: notes !== undefined ? notes : jobTitlesCache.list[idx].notes,
          updated_at: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // If title name was updated, cascade in in-memory storage
        if (oldName && newName && oldName !== newName) {
          (inMemoryEmployees || []).forEach(emp => {
            const curTitle = String(emp.jobTitle || emp.job_title || '').trim();
            const curTitleId = parseInt(String(emp.jobTitleId || emp.job_title_id || '0'));
            if ((oldName && curTitle === oldName) || (curTitleId && curTitleId === id)) {
              emp.jobTitle = newName;
              emp.job_title = newName;
              emp.jobTitleId = id;
              emp.job_title_id = id;
              emp.updatedAt = new Date().toISOString();
              emp.updated_at = new Date().toISOString();
            }
          });
          // سجلات التكليف (job_assignments) تاريخية ولا تُعاد كتابتها عند إعادة تسمية العنوان.
        }

        saveLocalDb();
        return res.json(mapKeys(jobTitlesCache.list[idx], camelToSnake));
      }
      res.json({ id, name: newName, category, min_grade: mGrade, min_step: mStep, next_title_id: nxtId, status, notes });
    } catch (err: any) {
      console.error('Error updating job title:', err);
      sendRouteError(res, err, 'تعديل العنوان الوظيفي');
    }
  });

  app.delete('/api/job-titles/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'معرف العنوان الوظيفي غير صالح' });
      }

      // Comprehensive referential guard: check if deleting an in-use job title
      let dbEmployees = inMemoryEmployees || [];
      let dbTitles = jobTitlesCache.list || [];
      try {
        const dbEmpList = await db.select().from(schema.employees);
        if (dbEmpList && dbEmpList.length > 0) dbEmployees = dbEmpList;
        const dbTitleList = await db.select().from(schema.jobTitles);
        if (dbTitleList && dbTitleList.length > 0) dbTitles = dbTitleList;
      } catch (e) {}

      const baseRef = await buildRefContext();
      const refCtx = {
        ...baseRef,
        employees: dbEmployees,
        entities: {
          ...baseRef.entities,
          'job_titles': dbTitles,
          'job-titles': dbTitles
        }
      };

      const refCheck = checkReferentialUsage('job_titles', id, false, refCtx);
      if (!refCheck.canProceed) {
        return res.status(400).json({ 
          error: refCheck.message, 
          details: refCheck.affectedSummary,
          count: refCheck.count,
          affectedEmployees: refCheck.affectedEmployees || []
        });
      }

      try {
        await db.delete(schema.jobTitles).where(eq(schema.jobTitles.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف العنوان الوظيفي')) return;
      }
      jobTitlesCache.list = jobTitlesCache.list.filter(r => r.id !== id);
      saveLocalDb();
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting job title:', err);
      sendRouteError(res, err, 'حذف العنوان الوظيفي');
    }
  });



  // B7 (ق-9): شمول كتاب الشكر (علاوة/ترفيع/كلاهما) وسقفه السنوي الخاص
  function parseCommendationTypeExtras(body: any): { error?: string; values: any } {
    const values: any = {};
    const applies = body.applies_to ?? body.appliesTo;
    if (applies !== undefined) {
      if (!['كلاهما', 'علاوة', 'ترفيع'].includes(String(applies))) return { error: 'الشمول: كلاهما أو علاوة أو ترفيع', values };
      values.appliesTo = String(applies);
    }
    const cap = body.annual_cap ?? body.annualCap;
    if (cap !== undefined) {
      const n = cap === '' || cap === null ? null : parseInt(cap);
      if (n !== null && (isNaN(n) || n < 1 || n > 50)) return { error: 'السقف السنوي رقم بين 1 و50 أو فارغ', values };
      values.annualCap = n;
    }
    return { values };
  }

  // B5 (ق-7): مدى الدرجة والسند وتواريخ النفاذ للعنوان الوظيفي
  function parseTitleExtras(body: any, minGradeVal: number | undefined): { error?: string; values: any } {
    const values: any = {};
    const iso = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    if (body.grade_max !== undefined || body.gradeMax !== undefined) {
      const raw = body.grade_max ?? body.gradeMax;
      const g = raw === '' || raw === null ? null : parseInt(raw);
      if (g !== null && (isNaN(g) || g < 1 || g > 13)) return { error: 'أعلى درجة للعنوان بين 1 و13', values };
      if (g !== null && minGradeVal !== undefined && !isNaN(minGradeVal) && g > minGradeVal) return { error: 'الدرجة العليا للعنوان رقمها أصغر من أو يساوي درجته الدنيا (الدرجة 1 أعلى درجة)', values };
      values.gradeMax = g;
    }
    if (body.legal_basis !== undefined || body.legalBasis !== undefined) values.legalBasis = String(body.legal_basis ?? body.legalBasis ?? '').trim() || null;
    if (body.valid_from !== undefined) values.validFrom = iso(body.valid_from);
    if (body.valid_to !== undefined) values.validTo = iso(body.valid_to);
    return { values };
  }

  // B4d: مسارات سلّم الرواتب انتقلت إلى server/routes/salaryScale.ts (إصدارات)

  // --- Grade Promotion Rules API (سنوات الترفيع القانونية لكل درجة) ---
  app.get('/api/grade-promotion-rules', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.gradePromotionRules).orderBy(asc(schema.gradePromotionRules.grade));
      if (records && records.length > 0) {
        return res.json(records.map(r => mapKeys(r, camelToSnake)));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(inMemoryGradePromotionRules.map(r => mapKeys(r, camelToSnake)));
  });

  app.put('/api/grade-promotion-rules/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { promotion_years, promotionYears, notes } = req.body;
    const pYears = promotion_years !== undefined ? (promotion_years === null || promotion_years === '' ? null : parseInt(promotion_years)) : (promotionYears !== undefined ? (promotionYears === null || promotionYears === '' ? null : parseInt(promotionYears)) : undefined);
    
    try {
      const updateData: any = { updatedAt: new Date() };
      if (pYears !== undefined) updateData.promotionYears = pYears;
      if (notes !== undefined) updateData.notes = notes;

      const [updated] = await db.update(schema.gradePromotionRules)
        .set(updateData)
        .where(eq(schema.gradePromotionRules.id, id))
        .returning();
      if (updated) {
        const idx = inMemoryGradePromotionRules.findIndex(r => r.id === id || r.grade === id);
        if (idx !== -1) {
          inMemoryGradePromotionRules[idx] = { ...inMemoryGradePromotionRules[idx], ...mapKeys(updated, camelToSnake), ...updated };
        }
        saveLocalDb();
        return res.json(mapKeys(updated, camelToSnake));
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update grade promotion rule');
    }

    const idx = inMemoryGradePromotionRules.findIndex(r => r.id === id || r.grade === id);
    if (idx !== -1) {
      if (pYears !== undefined) {
        inMemoryGradePromotionRules[idx].promotionYears = pYears;
        inMemoryGradePromotionRules[idx].promotion_years = pYears;
      }
      if (notes !== undefined) inMemoryGradePromotionRules[idx].notes = notes;
      inMemoryGradePromotionRules[idx].updatedAt = new Date().toISOString();
      saveLocalDb();
      return res.json(mapKeys(inMemoryGradePromotionRules[idx], camelToSnake));
    }

    res.json({ id, promotion_years: pYears, notes });
  });

  app.put('/api/grade-promotion-rules', requireAuth, requireAdmin, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Body must be an array of rules' });
    }
    try {
      for (const item of items) {
        const g = parseInt(item.grade);
        const pYears = item.promotion_years !== undefined ? (item.promotion_years === null || item.promotion_years === '' ? null : parseInt(item.promotion_years)) : (item.promotionYears !== undefined ? (item.promotionYears === null || item.promotionYears === '' ? null : parseInt(item.promotionYears)) : null);
        await db.insert(schema.gradePromotionRules).values({
          grade: g,
          promotionYears: pYears,
          notes: item.notes || ''
        }).onConflictDoUpdate({
          target: schema.gradePromotionRules.grade,
          set: {
            promotionYears: pYears,
            notes: item.notes || '',
            updatedAt: new Date()
          }
        });
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for bulk grade promotion rules');
    }

    items.forEach(item => {
      const idx = inMemoryGradePromotionRules.findIndex(r => r.grade === parseInt(item.grade) || r.id === parseInt(item.id));
      const pYears = item.promotion_years !== undefined ? (item.promotion_years === null || item.promotion_years === '' ? null : parseInt(item.promotion_years)) : (item.promotionYears !== undefined ? (item.promotionYears === null || item.promotionYears === '' ? null : parseInt(item.promotionYears)) : null);
      if (idx !== -1) {
        inMemoryGradePromotionRules[idx].promotionYears = pYears;
        inMemoryGradePromotionRules[idx].promotion_years = pYears;
        if (item.notes !== undefined) inMemoryGradePromotionRules[idx].notes = item.notes;
      }
    });
    saveLocalDb();
    res.json({ success: true, count: items.length });
  });

  // --- Commendation Types API (أنواع كتب الشكر والتقدير) ---
  app.get('/api/commendation-types', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.commendationTypes).orderBy(asc(schema.commendationTypes.id));
      return res.json(records.map(r => mapKeys(r, camelToSnake)));
    } catch (e) {
      return sendRouteError(res, e, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(inMemoryCommendationTypes.map(r => mapKeys(r, camelToSnake)));
  });

  app.post('/api/commendation-types', requireAuth, requireAdmin, async (req, res) => {
    const { name, credit_months, creditMonths, status, notes } = req.body;
    const cMonths = parseInt(credit_months ?? creditMonths ?? 1);
    const extras = parseCommendationTypeExtras(req.body || {});
    if (extras.error) return res.status(400).json({ error: extras.error });
    try {
      const [inserted] = await db.insert(schema.commendationTypes).values({
        name,
        creditMonths: cMonths,
        ...extras.values,
        status: status || 'فعال',
        notes: notes || '',
      }).returning();
      if (inserted) {
        inMemoryCommendationTypes.push(mapKeys(inserted, camelToSnake));
        saveLocalDb();
        return res.status(201).json(mapKeys(inserted, camelToSnake));
      }
    } catch (e) {
      if (respondIfDbWriteError(res, e, 'حفظ السجل')) return;
      console.warn('Database fallback for create commendation-type');
    }
    const newId = inMemoryCommendationTypes.length + 1;
    const mem = { id: newId, name, credit_months: cMonths, creditMonths: cMonths, status: status || 'فعال', notes: notes || '' };
    inMemoryCommendationTypes.push(mem);
    saveLocalDb();
    res.status(201).json(mem);
  });

  app.put('/api/commendation-types/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, credit_months, creditMonths, status, notes } = req.body;
    const cMonths = credit_months !== undefined ? parseInt(credit_months) : (creditMonths !== undefined ? parseInt(creditMonths) : undefined);
    try {
      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (cMonths !== undefined) updateData.creditMonths = cMonths;
      const extras = parseCommendationTypeExtras(req.body || {});
      if (extras.error) return res.status(400).json({ error: extras.error });
      Object.assign(updateData, extras.values);
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const [updated] = await db.update(schema.commendationTypes)
        .set(updateData)
        .where(eq(schema.commendationTypes.id, id))
        .returning();
      if (updated) {
        const idx = inMemoryCommendationTypes.findIndex(r => r.id === id);
        if (idx !== -1) inMemoryCommendationTypes[idx] = { ...inMemoryCommendationTypes[idx], ...mapKeys(updated, camelToSnake) };
        saveLocalDb();
        return res.json(mapKeys(updated, camelToSnake));
      }
    } catch (e) {
      if (respondIfDbWriteError(res, e, 'تعديل السجل')) return;
      console.warn('Database fallback for update commendation-type');
    }
    const idx = inMemoryCommendationTypes.findIndex(r => r.id === id);
    if (idx !== -1) {
      if (name !== undefined) inMemoryCommendationTypes[idx].name = name;
      if (cMonths !== undefined) {
        inMemoryCommendationTypes[idx].credit_months = cMonths;
        inMemoryCommendationTypes[idx].creditMonths = cMonths;
      }
      if (status !== undefined) inMemoryCommendationTypes[idx].status = status;
      if (notes !== undefined) inMemoryCommendationTypes[idx].notes = notes;
      saveLocalDb();
      return res.json(inMemoryCommendationTypes[idx]);
    }
    res.json({ id, name, status });
  });

  app.delete('/api/commendation-types/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.commendationTypes).where(eq(schema.commendationTypes.id, id));
    } catch (e) {
      if (respondIfDbWriteError(res, e, 'حذف السجل')) return;
      console.warn('Database fallback for delete commendation-type');
    }
    inMemoryCommendationTypes = inMemoryCommendationTypes.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Employee Commendations API (سجل كتب الشكر الممنوحة للموظفين) ---
  app.get('/api/employee-commendations', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.employeeCommendations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.employeeCommendations).where(eq(schema.employeeCommendations.employeeId, employeeId)) as any;
      }
      const records = await query.orderBy(desc(schema.employeeCommendations.createdAt));
      return res.json(records.map(r => mapKeys(r, camelToSnake)));
    } catch (e) {
      return sendRouteError(res, e, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = inMemoryEmployeeCommendations;
    if (employeeId) list = list.filter(r => r.employee_id === employeeId || r.employeeId === employeeId);
    res.json(list);
  });

  app.post('/api/employee-commendations', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let creditMonthsSnapshot = data.credit_months_snapshot !== undefined ? parseInt(data.credit_months_snapshot) : (data.creditMonthsSnapshot !== undefined ? parseInt(data.creditMonthsSnapshot) : undefined);
    // B7: نوع الكتاب من القاعدة (كان من مخزن ذاكرة فارغ منذ B2، فكل كتاب ياخذ شهراً واحداً)
    let appliesToSnapshot = 'كلاهما';
    if (data.commendation_type_id || data.commendationTypeId) {
      const typeId = parseInt(data.commendation_type_id || data.commendationTypeId);
      const [foundType] = await db.select().from(schema.commendationTypes).where(eq(schema.commendationTypes.id, typeId));
      if (!foundType) return res.status(400).json({ error: 'نوع كتاب الشكر غير موجود' });
      // أشهر القدَم من النوع؛ تجاوزها يدوياً للمدير فقط
      if (creditMonthsSnapshot === undefined || isNaN(creditMonthsSnapshot) || (req as any).user?.role !== 'admin') creditMonthsSnapshot = foundType.creditMonths ?? 1;
      appliesToSnapshot = foundType.appliesTo || 'كلاهما';
    }
    if (creditMonthsSnapshot === undefined || isNaN(creditMonthsSnapshot) || creditMonthsSnapshot < 0 || creditMonthsSnapshot > 24) creditMonthsSnapshot = 1;

    try {
      const [inserted] = await db.insert(schema.employeeCommendations).values({
        employeeId,
        commendationTypeId: data.commendation_type_id ? parseInt(data.commendation_type_id) : (data.commendationTypeId ? parseInt(data.commendationTypeId) : null),
        creditMonthsSnapshot,
        appliesToSnapshot,
        orderNumber: data.order_number || data.orderNumber,
        orderDate: data.order_date || data.orderDate,
        issuer: data.issuer || 'الوزارة',
        reason: data.reason || '',
        isHidden: data.is_hidden === true || data.isHidden === true,
        notes: data.notes || '',
      }).returning();
      if (inserted) {
        inMemoryEmployeeCommendations.push(mapKeys(inserted, camelToSnake));
        saveLocalDb();
        triggerRecalculateEligibility(employeeId).catch(logRecalcError);
        return res.status(201).json(mapKeys(inserted, camelToSnake));
      }
    } catch (e) {
      if (respondIfDbWriteError(res, e, 'حفظ السجل')) return;
      console.warn('Database fallback for create employee-commendation');
    }
    const newId = inMemoryEmployeeCommendations.length + 1;
    const mem = { id: newId, employee_id: employeeId, ...data, credit_months_snapshot: creditMonthsSnapshot, creditMonthsSnapshot, created_at: new Date().toISOString() };
    inMemoryEmployeeCommendations.push(mem);
    saveLocalDb();
    triggerRecalculateEligibility(employeeId).catch(logRecalcError);
    res.status(201).json(mem);
  });

  app.put('/api/employee-commendations/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    const data = req.body;
    try {
      const updateData: any = {};
      if (data.order_number !== undefined || data.orderNumber !== undefined) updateData.orderNumber = data.order_number || data.orderNumber;
      if (data.order_date !== undefined || data.orderDate !== undefined) updateData.orderDate = data.order_date || data.orderDate;
      if (data.issuer !== undefined) updateData.issuer = data.issuer;
      if (data.reason !== undefined) updateData.reason = data.reason;
      if (data.is_hidden !== undefined || data.isHidden !== undefined) updateData.isHidden = data.is_hidden ?? data.isHidden;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if ((data.credit_months_snapshot !== undefined || data.creditMonthsSnapshot !== undefined) && (req as any).user?.role === 'admin') {
        const m = parseInt(data.credit_months_snapshot ?? data.creditMonthsSnapshot);
        if (isNaN(m) || m < 0 || m > 24) return res.status(400).json({ error: 'أشهر القدَم بين 0 و24' });
        updateData.creditMonthsSnapshot = m; // B7: تصحيح اللقطة للمدير فقط
      }
      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: 'لا حقول للتعديل' });

      const [updated] = await db.update(schema.employeeCommendations)
        .set(updateData)
        .where(eq(schema.employeeCommendations.id, id))
        .returning();
      if (updated) {
        const idx = inMemoryEmployeeCommendations.findIndex(r => r.id === id);
        if (idx !== -1) inMemoryEmployeeCommendations[idx] = { ...inMemoryEmployeeCommendations[idx], ...mapKeys(updated, camelToSnake) };
        saveLocalDb();
        if (updated.employeeId) triggerRecalculateEligibility(updated.employeeId).catch(logRecalcError);
        return res.json(mapKeys(updated, camelToSnake));
      }
    } catch (e) {
      if (respondIfDbWriteError(res, e, 'تعديل السجل')) return;
      console.warn('Database fallback for update employee-commendation');
    }
    const idx = inMemoryEmployeeCommendations.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryEmployeeCommendations[idx] = { ...inMemoryEmployeeCommendations[idx], ...data };
      saveLocalDb();
      const empId = inMemoryEmployeeCommendations[idx].employee_id || inMemoryEmployeeCommendations[idx].employeeId;
      if (empId) triggerRecalculateEligibility(empId).catch(logRecalcError);
      return res.json(inMemoryEmployeeCommendations[idx]);
    }
    res.json({ id, ...data });
  });

  app.delete('/api/employee-commendations/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    const existing = inMemoryEmployeeCommendations.find(r => r.id === id);
    try {
      await db.delete(schema.employeeCommendations).where(eq(schema.employeeCommendations.id, id));
    } catch (e) {
      if (respondIfDbWriteError(res, e, 'حذف السجل')) return;
      console.warn('Database fallback for delete employee-commendation');
    }
    inMemoryEmployeeCommendations = inMemoryEmployeeCommendations.filter(r => r.id !== id);
    saveLocalDb();
    if (existing?.employee_id || existing?.employeeId) {
      triggerRecalculateEligibility(existing.employee_id || existing.employeeId).catch(logRecalcError);
    }
    res.json({ success: true });
  });

  // --- Commendation Rules Settings API (إعدادات وضوابط كتب الشكر) ---
  app.get('/api/commendation-rules-settings', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.commendationRulesSettings).where(eq(schema.commendationRulesSettings.configKey, 'default_commendation_rules'));
      if (records && records.length > 0) {
        const item = records[0];
        inMemoryCommendationRulesSettings = {
          ...inMemoryCommendationRulesSettings,
          ...mapKeys(item, camelToSnake),
          degreeTrackAutoSettlement: Boolean(item.degreeTrackAutoSettlement),
          degree_track_auto_settlement: Boolean(item.degreeTrackAutoSettlement),
          reminderDaysCourse: item.reminderDaysCourse ?? 30,
          reminder_days_course: item.reminderDaysCourse ?? 30,
          reminderDaysPenalty: item.reminderDaysPenalty ?? 15,
          reminder_days_penalty: item.reminderDaysPenalty ?? 15,
          reminderDaysLeave: item.reminderDaysLeave ?? 30,
          reminder_days_leave: item.reminderDaysLeave ?? 30,
          reminderDaysEvaluation: item.reminderDaysEvaluation ?? 30,
          reminder_days_evaluation: item.reminderDaysEvaluation ?? 30,
          reminderDaysAbsence: item.reminderDaysAbsence ?? 10,
          reminder_days_absence: item.reminderDaysAbsence ?? 10
        };
        return res.json(mapKeys(inMemoryCommendationRulesSettings, camelToSnake));
      }
    } catch (e) {
      return sendRouteError(res, e, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(mapKeys(inMemoryCommendationRulesSettings, camelToSnake));
  });

  app.put('/api/commendation-rules-settings', requireAuth, requireAdmin, async (req, res) => {
    const {
      max_per_year, maxPerYear,
      allowed_combinations, allowedCombinations,
      degree_track_auto_settlement, degreeTrackAutoSettlement,
      reminder_days_course, reminderDaysCourse,
      reminder_days_penalty, reminderDaysPenalty,
      reminder_days_leave, reminderDaysLeave,
      reminder_days_evaluation, reminderDaysEvaluation,
      reminder_days_absence, reminderDaysAbsence
    } = req.body;

    const maxVal = max_per_year !== undefined ? parseInt(max_per_year) : (maxPerYear !== undefined ? parseInt(maxPerYear) : 3);
    const combos = typeof (allowed_combinations || allowedCombinations) === 'object' ? JSON.stringify(allowed_combinations || allowedCombinations) : (allowed_combinations || allowedCombinations || '');
    const autoSettlementVal = Boolean(degree_track_auto_settlement ?? degreeTrackAutoSettlement);

    const rCourse = parseInt(reminder_days_course ?? reminderDaysCourse ?? inMemoryCommendationRulesSettings.reminderDaysCourse ?? 30);
    const rPenalty = parseInt(reminder_days_penalty ?? reminderDaysPenalty ?? inMemoryCommendationRulesSettings.reminderDaysPenalty ?? 15);
    const rLeave = parseInt(reminder_days_leave ?? reminderDaysLeave ?? inMemoryCommendationRulesSettings.reminderDaysLeave ?? 30);
    const rEval = parseInt(reminder_days_evaluation ?? reminderDaysEvaluation ?? inMemoryCommendationRulesSettings.reminderDaysEvaluation ?? 30);
    const rAbs = parseInt(reminder_days_absence ?? reminderDaysAbsence ?? inMemoryCommendationRulesSettings.reminderDaysAbsence ?? 10);

    try {
      await db.insert(schema.commendationRulesSettings).values({
        configKey: 'default_commendation_rules',
        maxPerYear: maxVal,
        allowedCombinations: combos,
        degreeTrackAutoSettlement: autoSettlementVal,
        reminderDaysCourse: rCourse,
        reminderDaysPenalty: rPenalty,
        reminderDaysLeave: rLeave,
        reminderDaysEvaluation: rEval,
        reminderDaysAbsence: rAbs,
      }).onConflictDoUpdate({
        target: schema.commendationRulesSettings.configKey,
        set: {
          maxPerYear: maxVal,
          allowedCombinations: combos,
          degreeTrackAutoSettlement: autoSettlementVal,
          reminderDaysCourse: rCourse,
          reminderDaysPenalty: rPenalty,
          reminderDaysLeave: rLeave,
          reminderDaysEvaluation: rEval,
          reminderDaysAbsence: rAbs,
          updatedAt: new Date()
        }
      });
    } catch (e) {
      if (respondIfDbWriteError(res, e, 'تعديل السجل')) return;
      console.warn('Database fallback for update commendation-rules-settings');
    }
    inMemoryCommendationRulesSettings = {
      ...inMemoryCommendationRulesSettings,
      max_per_year: maxVal,
      maxPerYear: maxVal,
      allowed_combinations: combos,
      allowedCombinations: combos,
      degree_track_auto_settlement: autoSettlementVal,
      degreeTrackAutoSettlement: autoSettlementVal,
      reminder_days_course: rCourse,
      reminderDaysCourse: rCourse,
      reminder_days_penalty: rPenalty,
      reminderDaysPenalty: rPenalty,
      reminder_days_leave: rLeave,
      reminderDaysLeave: rLeave,
      reminder_days_evaluation: rEval,
      reminderDaysEvaluation: rEval,
      reminder_days_absence: rAbs,
      reminderDaysAbsence: rAbs
    };
    saveLocalDb();
    res.json(mapKeys(inMemoryCommendationRulesSettings, camelToSnake));
  });

  // --- Allowances and Deductions API ---
  // فئة البند الصريحة يرسلها محرك الرواتب (src/lib/salaryTable.js ITEM_CATEGORIES). نص حر صغير؛ الفارغ = NULL.
  function normalizeAllowanceCategory(v: any): string | null {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    return t ? t.slice(0, 50) : null;
  }
  app.get('/api/allowances-deductions', requireAuth, async (req, res) => {
    // البنود المؤرشفة (is_archived) لا تظهر ولا تدخل حساب الرواتب إلا بطلب صريح ?include_archived=1.
    // قبل B1b كان العمود غير معرّف في schema.ts فكانت البنود المؤرشفة تُعاد كأنها فعّالة.
    const includeArchived = String(req.query.include_archived || '') === '1';
    const notArchived = (r: any) => includeArchived || !(r?.isArchived === true || r?.is_archived === true);
    try {
      const records = await db.select().from(schema.allowancesDeductions)
        .where(includeArchived ? undefined : sql`${schema.allowancesDeductions.isArchived} IS NOT TRUE`)
        .orderBy(asc(schema.allowancesDeductions.id));
      return res.json(records);
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json((inMemoryAllowancesDeductions || []).filter(notArchived));
  });

  app.post('/api/allowances-deductions', requireAuth, requireAdmin, async (req, res) => {
    const { name, type, calcType, value, status, calculationBase, calculation_base, deactivatedAt, deactivated_at } = req.body;
    const calcBase = calculationBase || calculation_base || 'nominal';
    const deactAt = deactivatedAt || deactivated_at || null;
    const category = normalizeAllowanceCategory(req.body?.category ?? req.body?.item_category ?? req.body?.itemCategory);
    const numValue = parseFloat(value);
    if (!name || !type || !calcType || !Number.isFinite(numValue)) {
      return res.status(400).json({ error: 'بيانات ناقصة: الاسم والنوع وطريقة الاحتساب والقيمة (رقم عشري) مطلوبة' });
    }
    try {
      const [newRecord] = await db.insert(schema.allowancesDeductions).values({
        name,
        type,
        calcType,
        value: numValue,
        category,
        calculationBase: calcBase,
        deactivatedAt: deactAt,
        status: status || 'فعال',
      }).returning();
      if (newRecord) return res.status(201).json(newRecord);
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create allowance');
    }
    const memItem = {
      id: inMemoryAllowancesDeductions.length + 1,
      name,
      type,
      calcType,
      value: numValue,
      category,
      calculationBase: calcBase,
      calculation_base: calcBase,
      deactivatedAt: deactAt,
      deactivated_at: deactAt,
      status: status || 'فعال',
      createdAt: new Date().toISOString()
    };
    inMemoryAllowancesDeductions.push(memItem);
    saveLocalDb();
    res.status(201).json(memItem);
  });

  app.put('/api/allowances-deductions/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, type, calcType, value, status, calculationBase, calculation_base, deactivatedAt, deactivated_at } = req.body;
    const calcBase = calculationBase !== undefined ? calculationBase : calculation_base;
    const deactAt = deactivatedAt !== undefined ? deactivatedAt : deactivated_at;
    const rawCategory = req.body?.category !== undefined ? req.body.category : (req.body?.item_category !== undefined ? req.body.item_category : req.body?.itemCategory);
    const category = rawCategory !== undefined ? normalizeAllowanceCategory(rawCategory) : undefined;
    if (value !== undefined && !Number.isFinite(parseFloat(value))) {
      return res.status(400).json({ error: 'قيمة البند يجب أن تكون رقماً (يُسمح بالكسور العشرية)' });
    }

    if (status === 'موقوف' || status === 'غير فعال' || status === 'معطل') {
      const refCheck = checkReferentialUsage('allowances_deductions', id, true, await buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }
    }

    try {
      const [updated] = await db.update(schema.allowancesDeductions)
        .set({
          name,
          type,
          calcType,
          value: value !== undefined ? parseFloat(value) : undefined,
          calculationBase: calcBase !== undefined ? calcBase : undefined,
          category,
          deactivatedAt: deactAt !== undefined ? deactAt : undefined,
          status: status !== undefined ? status : undefined,
        })
        .where(eq(schema.allowancesDeductions.id, id))
        .returning();
      if (updated) return res.json(updated);
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update allowance');
    }
    const idx = inMemoryAllowancesDeductions.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryAllowancesDeductions[idx] = {
        ...inMemoryAllowancesDeductions[idx],
        name: name || inMemoryAllowancesDeductions[idx].name,
        type: type || inMemoryAllowancesDeductions[idx].type,
        calcType: calcType || inMemoryAllowancesDeductions[idx].calcType,
        value: value !== undefined ? parseFloat(value) : inMemoryAllowancesDeductions[idx].value,
        calculationBase: calcBase !== undefined ? calcBase : inMemoryAllowancesDeductions[idx].calculationBase,
        calculation_base: calcBase !== undefined ? calcBase : inMemoryAllowancesDeductions[idx].calculation_base,
        category: category !== undefined ? category : (inMemoryAllowancesDeductions[idx].category ?? null),
        deactivatedAt: deactAt !== undefined ? deactAt : inMemoryAllowancesDeductions[idx].deactivatedAt,
        deactivated_at: deactAt !== undefined ? deactAt : inMemoryAllowancesDeductions[idx].deactivated_at,
        status: status || inMemoryAllowancesDeductions[idx].status
      };
      saveLocalDb();
      return res.json(inMemoryAllowancesDeductions[idx]);
    }
    res.json({ id, name, type, calcType, value, status });
  });

  app.delete('/api/allowances-deductions/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);

    const refCheck = checkReferentialUsage('allowances_deductions', id, false, await buildRefContext());
    if (!refCheck.canProceed) {
      return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
    }

    try {
      await db.delete(schema.allowancesDeductions).where(eq(schema.allowancesDeductions.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete allowance');
    }
    inMemoryAllowancesDeductions = inMemoryAllowancesDeductions.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Work Locations / Service Types / Employee Statuses — B3: server/routes/workLocations.ts, lookups.ts ---
  registerWorkLocationRoutes(app, routeCtx);
  registerLookupRoutes(app, routeCtx);

  // --- Education Degrees API ---
  app.get('/api/education-degrees', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.educationDegrees).orderBy(asc(schema.educationDegrees.id));
      return res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(inMemoryEducationDegrees);
  });

  app.post('/api/education-degrees', requireAuth, requireAdmin, async (req, res) => {
    const { 
      name, 
      is_higher_education, isHigherEducation, 
      allowance_rate, allowanceRate, 
      higher_allowance_rate, higherAllowanceRate, 
      baseline_grade, baselineGrade, 
      baseline_step, baselineStep 
    } = req.body;

    const isHigher = is_higher_education !== undefined ? is_higher_education === true : isHigherEducation === true;
    const allRate = allowance_rate !== undefined ? parseFloat(allowance_rate) : (allowanceRate !== undefined ? parseFloat(allowanceRate) : 0);
    const hAllRate = higher_allowance_rate !== undefined ? parseFloat(higher_allowance_rate) : (higherAllowanceRate !== undefined ? parseFloat(higherAllowanceRate) : 0);
    const bGrade = baseline_grade !== undefined ? parseInt(baseline_grade) : (baselineGrade !== undefined ? parseInt(baselineGrade) : 7);
    const bStep = baseline_step !== undefined ? parseInt(baseline_step) : (baselineStep !== undefined ? parseInt(baselineStep) : 1);

    try {
      const [newRecord] = await db.insert(schema.educationDegrees).values({
        name,
        isHigherEducation: isHigher,
        allowanceRate: allRate,
        higherAllowanceRate: hAllRate,
        baselineGrade: bGrade,
        baselineStep: bStep,
      }).returning();
      if (newRecord) return res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create education degree');
    }
    const memItem = {
      id: inMemoryEducationDegrees.length + 1,
      name,
      is_higher_education: isHigher,
      isHigherEducation: isHigher,
      allowance_rate: allRate,
      allowanceRate: allRate,
      higher_allowance_rate: hAllRate,
      higherAllowanceRate: hAllRate,
      baseline_grade: bGrade,
      baselineGrade: bGrade,
      baseline_step: bStep,
      baselineStep: bStep,
      status: 'فعال',
      created_at: new Date().toISOString()
    };
    inMemoryEducationDegrees.push(memItem);
    saveLocalDb();
    res.status(201).json(memItem);
  });

  app.put('/api/education-degrees/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { 
      name, 
      is_higher_education, isHigherEducation, 
      allowance_rate, allowanceRate, 
      higher_allowance_rate, higherAllowanceRate, 
      baseline_grade, baselineGrade, 
      baseline_step, baselineStep, 
      status 
    } = req.body;

    if (status === 'معطل' || status === 'غير فعال') {
      const refCheck = checkReferentialUsage('education_degrees', id, true, await buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }
    }

    const isHigher = is_higher_education !== undefined ? is_higher_education === true : (isHigherEducation !== undefined ? isHigherEducation === true : undefined);
    const allRate = allowance_rate !== undefined ? parseFloat(allowance_rate) : (allowanceRate !== undefined ? parseFloat(allowanceRate) : undefined);
    const hAllRate = higher_allowance_rate !== undefined ? parseFloat(higher_allowance_rate) : (higherAllowanceRate !== undefined ? parseFloat(higherAllowanceRate) : undefined);
    const bGrade = baseline_grade !== undefined ? parseInt(baseline_grade) : (baselineGrade !== undefined ? parseInt(baselineGrade) : undefined);
    const bStep = baseline_step !== undefined ? parseInt(baseline_step) : (baselineStep !== undefined ? parseInt(baselineStep) : undefined);

    try {
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (isHigher !== undefined) updateData.isHigherEducation = isHigher;
      if (allRate !== undefined) updateData.allowanceRate = allRate;
      if (hAllRate !== undefined) updateData.higherAllowanceRate = hAllRate;
      if (bGrade !== undefined) updateData.baselineGrade = bGrade;
      if (bStep !== undefined) updateData.baselineStep = bStep;

      const [updated] = await db.update(schema.educationDegrees)
        .set(updateData)
        .where(eq(schema.educationDegrees.id, id))
        .returning();
      if (updated) {
        const idx = inMemoryEducationDegrees.findIndex(r => r.id === id);
        if (idx !== -1) inMemoryEducationDegrees[idx] = { ...inMemoryEducationDegrees[idx], ...mapKeys(updated, camelToSnake) };
        saveLocalDb();
        return res.json(mapKeys(updated, camelToSnake));
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update education degree');
    }
    const idx = inMemoryEducationDegrees.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryEducationDegrees[idx] = {
        ...inMemoryEducationDegrees[idx],
        name: name || inMemoryEducationDegrees[idx].name,
        is_higher_education: isHigher !== undefined ? isHigher : inMemoryEducationDegrees[idx].is_higher_education,
        isHigherEducation: isHigher !== undefined ? isHigher : inMemoryEducationDegrees[idx].isHigherEducation,
        allowance_rate: allRate !== undefined ? allRate : inMemoryEducationDegrees[idx].allowance_rate,
        allowanceRate: allRate !== undefined ? allRate : inMemoryEducationDegrees[idx].allowanceRate,
        higher_allowance_rate: hAllRate !== undefined ? hAllRate : inMemoryEducationDegrees[idx].higher_allowance_rate,
        higherAllowanceRate: hAllRate !== undefined ? hAllRate : inMemoryEducationDegrees[idx].higherAllowanceRate,
        baseline_grade: bGrade !== undefined ? bGrade : (inMemoryEducationDegrees[idx].baseline_grade || inMemoryEducationDegrees[idx].baselineGrade || 7),
        baselineGrade: bGrade !== undefined ? bGrade : (inMemoryEducationDegrees[idx].baselineGrade || inMemoryEducationDegrees[idx].baseline_grade || 7),
        baseline_step: bStep !== undefined ? bStep : (inMemoryEducationDegrees[idx].baseline_step || inMemoryEducationDegrees[idx].baselineStep || 1),
        baselineStep: bStep !== undefined ? bStep : (inMemoryEducationDegrees[idx].baselineStep || inMemoryEducationDegrees[idx].baseline_step || 1),
        status: status !== undefined ? status : inMemoryEducationDegrees[idx].status,
      };
      saveLocalDb();
      return res.json(inMemoryEducationDegrees[idx]);
    }
    res.json({ id, name, is_higher_education: isHigher, allowance_rate: allRate, higher_allowance_rate: hAllRate, baseline_grade: bGrade, baseline_step: bStep, status });
  });

  app.delete('/api/education-degrees/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);

    const refCheck = checkReferentialUsage('education_degrees', id, false, await buildRefContext());
    if (!refCheck.canProceed) {
      return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
    }

    try {
      await db.delete(schema.educationDegrees).where(eq(schema.educationDegrees.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete education degree');
    }
    inMemoryEducationDegrees = inMemoryEducationDegrees.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Responsibility Allowances API ---
  app.get('/api/responsibility-allowances', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.responsibilityAllowances).orderBy(asc(schema.responsibilityAllowances.id));
      return res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(inMemoryResponsibilityAllowances);
  });

  app.post('/api/responsibility-allowances', requireAuth, requireAdmin, async (req, res) => {
    const { name, allowance_rate } = req.body;
    try {
      const [newRecord] = await db.insert(schema.responsibilityAllowances).values({
        name,
        allowanceRate: allowance_rate !== undefined ? parseFloat(allowance_rate) : 0,
      }).returning();
      if (newRecord) return res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create responsibility allowance');
    }
    const memItem = {
      id: inMemoryResponsibilityAllowances.length + 1,
      name,
      allowance_rate: allowance_rate !== undefined ? parseFloat(allowance_rate) : 0,
      status: 'فعال',
      created_at: new Date().toISOString()
    };
    inMemoryResponsibilityAllowances.push(memItem);
    saveLocalDb();
    res.status(201).json(memItem);
  });

  app.put('/api/responsibility-allowances/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, allowance_rate, status } = req.body;

    if (status === 'معطل' || status === 'غير فعال') {
      const refCheck = checkReferentialUsage('responsibility_allowances', id, true, await buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }
    }

    try {
      const [updated] = await db.update(schema.responsibilityAllowances)
        .set({
          name,
          allowanceRate: allowance_rate !== undefined ? parseFloat(allowance_rate) : undefined,
        })
        .where(eq(schema.responsibilityAllowances.id, id))
        .returning();
      if (updated) return res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update responsibility allowance');
    }
    const idx = inMemoryResponsibilityAllowances.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryResponsibilityAllowances[idx] = {
        ...inMemoryResponsibilityAllowances[idx],
        name: name || inMemoryResponsibilityAllowances[idx].name,
        allowance_rate: allowance_rate !== undefined ? parseFloat(allowance_rate) : inMemoryResponsibilityAllowances[idx].allowance_rate
      };
      saveLocalDb();
      return res.json(inMemoryResponsibilityAllowances[idx]);
    }
    res.json({ id, name, allowance_rate });
  });

  app.delete('/api/responsibility-allowances/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);

    const refCheck = checkReferentialUsage('responsibility_allowances', id, false, await buildRefContext());
    if (!refCheck.canProceed) {
      return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
    }

    try {
      await db.delete(schema.responsibilityAllowances).where(eq(schema.responsibilityAllowances.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete responsibility allowance');
    }
    inMemoryResponsibilityAllowances = inMemoryResponsibilityAllowances.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Leave Types API ---
  app.get('/api/leave-types', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.leaveTypes).orderBy(asc(schema.leaveTypes.id));
      return res.json(records.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(inMemoryLeaveTypes.map(r => mapKeys(r, camelToSnake)));
  });

  app.post('/api/leave-types', requireAuth, requireAdmin, async (req, res) => {
    const { 
      name, maxDays, max_days, description, status, 
      administrativeEffect, administrative_effect, 
      financialEffect, financial_effect, 
      financialDeductionPercentage, financial_deduction_percentage,
      affectsIncrement, affects_increment,
      affectsPromotion, affects_promotion,
      affectsCommendations, affects_commendations,
      salaryPaymentType, salary_payment_type,
      effectsOptions, effects_options
    } = req.body;

    const mDays = maxDays !== undefined ? (maxDays ? parseInt(maxDays) : null) : (max_days !== undefined ? (max_days ? parseInt(max_days) : null) : null);
    const affInc = Boolean(affectsIncrement ?? affects_increment ?? false);
    const affPromo = Boolean(affectsPromotion ?? affects_promotion ?? false);
    const affComm = Boolean(affectsCommendations ?? affects_commendations ?? false);
    const salType = salaryPaymentType || salary_payment_type || (financialEffect === 'بدون_راتب' ? 'بدون_راتب' : financialEffect === 'براتب_ومخصصات_ثابتة' ? 'منح_الراتب_والمخصصات_الثابتة_فقط' : financialEffect === 'استقطاع_جزئي' ? 'استقطاع_جزئي' : 'منح_الراتب_كامل');

    let adminEff = administrativeEffect || administrative_effect || '';
    if (!adminEff || adminEff === 'لا_يؤثر') {
      const parts: string[] = [];
      if (affPromo) parts.push('يوقف الترفيع');
      if (affInc) parts.push('يؤخر العلاوة');
      if (affComm) parts.push('يوقف كتب الشكر');
      adminEff = parts.length > 0 ? parts.join(' و ') : 'لا_يؤثر';
    }

    const finEff = financialEffect || financial_effect || (salType === 'بدون_راتب' ? 'بدون_راتب' : salType === 'منح_الراتب_والمخصصات_الثابتة_فقط' ? 'براتب_ومخصصات_ثابتة' : salType === 'استقطاع_جزئي' ? 'استقطاع_جزئي' : 'براتب_كامل');
    const finDedPct = parseFloat(financialDeductionPercentage ?? financial_deduction_percentage ?? (salType === 'بدون_راتب' ? 100 : 0)) || 0;
    const effOptsStr = typeof effectsOptions === 'string' ? effectsOptions : typeof effects_options === 'string' ? effects_options : JSON.stringify(effectsOptions || effects_options || []);

    let newRec: any = null;
    try {
      const [newRecord] = await db.insert(schema.leaveTypes).values({
        name,
        maxDays: mDays,
        administrativeEffect: adminEff,
        financialEffect: finEff,
        financialDeductionPercentage: finDedPct,
        affectsIncrement: affInc,
        affectsPromotion: affPromo,
        affectsCommendations: affComm,
        salaryPaymentType: salType,
        effectsOptions: effOptsStr,
        description,
        status: status || 'فعال',
      }).returning();
      newRec = newRecord;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create leave type');
    }

    const newId = newRec?.id || (inMemoryLeaveTypes.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
    const memItem = {
      id: newId,
      name,
      max_days: mDays,
      maxDays: mDays,
      administrative_effect: adminEff,
      administrativeEffect: adminEff,
      financial_effect: finEff,
      financialEffect: finEff,
      financial_deduction_percentage: finDedPct,
      financialDeductionPercentage: finDedPct,
      affects_increment: affInc,
      affectsIncrement: affInc,
      affects_promotion: affPromo,
      affectsPromotion: affPromo,
      affects_commendations: affComm,
      affectsCommendations: affComm,
      salary_payment_type: salType,
      salaryPaymentType: salType,
      effects_options: effOptsStr,
      effectsOptions: effOptsStr,
      description,
      status: status || 'فعال',
      createdAt: new Date().toISOString()
    };
    inMemoryLeaveTypes.push(memItem);
    saveLocalDb();
    res.status(201).json(mapKeys(newRec || memItem, camelToSnake));
  });

  app.put('/api/leave-types/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { 
      name, maxDays, max_days, description, status, 
      administrativeEffect, administrative_effect, 
      financialEffect, financial_effect, 
      financialDeductionPercentage, financial_deduction_percentage,
      affectsIncrement, affects_increment,
      affectsPromotion, affects_promotion,
      affectsCommendations, affects_commendations,
      salaryPaymentType, salary_payment_type,
      effectsOptions, effects_options
    } = req.body;

    const mDays = maxDays !== undefined ? (maxDays ? parseInt(maxDays) : null) : (max_days !== undefined ? (max_days ? parseInt(max_days) : null) : undefined);
    const affInc = affectsIncrement !== undefined ? Boolean(affectsIncrement) : (affects_increment !== undefined ? Boolean(affects_increment) : undefined);
    const affPromo = affectsPromotion !== undefined ? Boolean(affectsPromotion) : (affects_promotion !== undefined ? Boolean(affects_promotion) : undefined);
    const affComm = affectsCommendations !== undefined ? Boolean(affectsCommendations) : (affects_commendations !== undefined ? Boolean(affects_commendations) : undefined);
    const salType = salaryPaymentType !== undefined ? salaryPaymentType : salary_payment_type;
    const effOptsStr = effectsOptions !== undefined ? (typeof effectsOptions === 'string' ? effectsOptions : JSON.stringify(effectsOptions)) : (effects_options !== undefined ? (typeof effects_options === 'string' ? effects_options : JSON.stringify(effects_options)) : undefined);

    let adminEff = administrativeEffect !== undefined ? administrativeEffect : administrative_effect;
    if (adminEff === undefined && (affInc !== undefined || affPromo !== undefined || affComm !== undefined)) {
      const parts: string[] = [];
      if (affPromo) parts.push('يوقف الترفيع');
      if (affInc) parts.push('يؤخر العلاوة');
      if (affComm) parts.push('يوقف كتب الشكر');
      adminEff = parts.length > 0 ? parts.join(' و ') : 'لا_يؤثر';
    }

    let finEff = financialEffect !== undefined ? financialEffect : financial_effect;
    if (finEff === undefined && salType !== undefined) {
      finEff = salType === 'بدون_راتب' ? 'بدون_راتب' : salType === 'منح_الراتب_والمخصصات_الثابتة_فقط' ? 'براتب_ومخصصات_ثابتة' : salType === 'استقطاع_جزئي' ? 'استقطاع_جزئي' : 'براتب_كامل';
    }
    const finDedPct = financialDeductionPercentage !== undefined ? parseFloat(financialDeductionPercentage) : (financial_deduction_percentage !== undefined ? parseFloat(financial_deduction_percentage) : (salType === 'بدون_راتب' ? 100 : undefined));

    let updatedRec: any = null;
    try {
      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (mDays !== undefined) updateData.maxDays = mDays;
      if (adminEff !== undefined) updateData.administrativeEffect = adminEff;
      if (finEff !== undefined) updateData.financialEffect = finEff;
      if (finDedPct !== undefined) updateData.financialDeductionPercentage = finDedPct;
      if (affInc !== undefined) updateData.affectsIncrement = affInc;
      if (affPromo !== undefined) updateData.affectsPromotion = affPromo;
      if (affComm !== undefined) updateData.affectsCommendations = affComm;
      if (salType !== undefined) updateData.salaryPaymentType = salType;
      if (effOptsStr !== undefined) updateData.effectsOptions = effOptsStr;
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;

      const [updated] = await db.update(schema.leaveTypes)
        .set(updateData)
        .where(eq(schema.leaveTypes.id, id))
        .returning();
      updatedRec = updated;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update leave type');
    }

    const idx = inMemoryLeaveTypes.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryLeaveTypes[idx] = {
        ...inMemoryLeaveTypes[idx],
        name: name !== undefined ? name : inMemoryLeaveTypes[idx].name,
        max_days: mDays !== undefined ? mDays : inMemoryLeaveTypes[idx].max_days,
        maxDays: mDays !== undefined ? mDays : inMemoryLeaveTypes[idx].maxDays,
        administrative_effect: adminEff !== undefined ? adminEff : inMemoryLeaveTypes[idx].administrative_effect,
        administrativeEffect: adminEff !== undefined ? adminEff : inMemoryLeaveTypes[idx].administrativeEffect,
        financial_effect: finEff !== undefined ? finEff : inMemoryLeaveTypes[idx].financial_effect,
        financialEffect: finEff !== undefined ? finEff : inMemoryLeaveTypes[idx].financialEffect,
        financial_deduction_percentage: finDedPct !== undefined ? finDedPct : inMemoryLeaveTypes[idx].financial_deduction_percentage,
        financialDeductionPercentage: finDedPct !== undefined ? finDedPct : inMemoryLeaveTypes[idx].financialDeductionPercentage,
        affects_increment: affInc !== undefined ? affInc : inMemoryLeaveTypes[idx].affects_increment,
        affectsIncrement: affInc !== undefined ? affInc : inMemoryLeaveTypes[idx].affectsIncrement,
        affects_promotion: affPromo !== undefined ? affPromo : inMemoryLeaveTypes[idx].affects_promotion,
        affectsPromotion: affPromo !== undefined ? affPromo : inMemoryLeaveTypes[idx].affectsPromotion,
        affects_commendations: affComm !== undefined ? affComm : inMemoryLeaveTypes[idx].affects_commendations,
        affectsCommendations: affComm !== undefined ? affComm : inMemoryLeaveTypes[idx].affectsCommendations,
        salary_payment_type: salType !== undefined ? salType : inMemoryLeaveTypes[idx].salary_payment_type,
        salaryPaymentType: salType !== undefined ? salType : inMemoryLeaveTypes[idx].salaryPaymentType,
        effects_options: effOptsStr !== undefined ? effOptsStr : inMemoryLeaveTypes[idx].effects_options,
        effectsOptions: effOptsStr !== undefined ? effOptsStr : inMemoryLeaveTypes[idx].effectsOptions,
        description: description !== undefined ? description : inMemoryLeaveTypes[idx].description,
        status: status !== undefined ? status : inMemoryLeaveTypes[idx].status
      };
      saveLocalDb();
      return res.json(mapKeys(inMemoryLeaveTypes[idx], camelToSnake));
    }
    saveLocalDb();
    res.json(mapKeys(updatedRec || { id, name, maxDays: mDays, description, status }, camelToSnake));
  });

  app.delete('/api/leave-types/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.leaveTypes).where(eq(schema.leaveTypes.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete leave type');
    }
    inMemoryLeaveTypes = inMemoryLeaveTypes.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Penalty Types API (أنواع العقوبات الإدارية - المادة 8 قانون 14 لسنة 1991) ---
  const LEGAL_ARTICLE_8_PENALTIES = [
    {
      name: 'لفت النظر',
      delayMonths: 3,
      description: 'إشعار الموظف تحريرياً بالمخالفة وتوجيهه لتحسين سلوكه الوظيفي',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'الإنذار',
      delayMonths: 6,
      description: 'إشعار تحريري بالمخالفة وتحذيره من الإخلال بواجباته مستقبلاً',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'قطع الراتب',
      delayMonths: 5,
      description: 'حسم القسط اليومي من الراتب بأمر تحريري يذكر فيه المخالفة (حتى 10 أيام كحد أقصى)',
      salaryDeductionDays: 10,
      status: 'فعال'
    },
    {
      name: 'التوبيخ',
      delayMonths: 12,
      description: 'إشعار تحريري بالمخالفة وأسباب عدم رضا السلوك، مع طلب تحسينه',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'إنقاص الراتب',
      delayMonths: 24,
      description: 'قطع نسبة لا تتجاوز 10% من الراتب بأمر تحريري يشعر الموظف بالفعل المرتكب (لمدة 6 أشهر - سنتين)',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'تنزيل الدرجة',
      delayMonths: 36,
      description: 'تنزيل الراتب إلى الحد الأدنى للدرجة الأدنى مباشرة، مع منحه العلاوات المكتسبة سابقاً',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'الفصل',
      delayMonths: 0,
      description: 'تنحية الموظف عن الوظيفة مؤقتاً (من سنة إلى 3 سنوات)؛ تُفرض عند تكرار عقوبات مرتين خلال 5 سنوات',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'العزل',
      delayMonths: 0,
      description: 'تنحية نهائية عن الوظيفة مع منع إعادة التوظيف في دوائر الدولة؛ تُفرض بقرار مسبب من الوزير',
      salaryDeductionDays: 0,
      status: 'فعال'
    }
  ];

  const LEGAL_ARTICLE_8_MAP: Record<string, { deductionType: string; deductionValue: string; delayRule: string }> = {
    'لفت النظر': {
      deductionType: 'بدون قطع مالي',
      deductionValue: 'بدون قطع مالي',
      delayRule: '3 أشهر'
    },
    'الإنذار': {
      deductionType: 'بدون قطع مالي',
      deductionValue: 'بدون قطع مالي',
      delayRule: '6 أشهر'
    },
    'إنذار خطي': {
      deductionType: 'بدون قطع مالي',
      deductionValue: 'بدون قطع مالي',
      delayRule: '6 أشهر'
    },
    'قطع الراتب': {
      deductionType: 'حسم القسط اليومي',
      deductionValue: 'حتى 10 أيام كحد أقصى',
      delayRule: 'حالتان: • ≤5 أيام قطع ← 5 أشهر | • أكثر من 5 أيام ← شهر واحد عن كل يوم قطع'
    },
    'التوبيخ': {
      deductionType: 'بدون قطع مالي',
      deductionValue: 'بدون قطع مالي',
      delayRule: '12 شهر (سنة واحدة)'
    },
    'إنقاص الراتب': {
      deductionType: 'نسبة مئوية %',
      deductionValue: 'نسبة لا تتجاوز 10% (لمدة 6 أشهر - سنتين)',
      delayRule: '24 شهر (سنتان)'
    },
    'تنزيل الدرجة': {
      deductionType: 'لا ينطبق (تأثير وظيفي)',
      deductionValue: 'لا ينطبق',
      delayRule: 'يُعاد لراتبه السابق بعد 3 سنوات من فرض العقوبة'
    },
    'الفصل': {
      deductionType: 'لا ينطبق (إبعاد مؤقت)',
      deductionValue: 'مدة الفصل من سنة إلى 3 سنوات',
      delayRule: 'مدة الفصل من سنة إلى 3 سنوات'
    },
    'العزل': {
      deductionType: 'لا ينطبق (نهائي)',
      deductionValue: 'لا ينطبق',
      delayRule: 'لا ينطبق (تنحية نهائية)'
    }
  };

  const enrichPenaltyRecord = (record: any) => {
    const meta = LEGAL_ARTICLE_8_MAP[record.name] || {
      deductionType: record.salaryDeductionDays > 0 ? 'حسم القسط اليومي' : 'بدون قطع مالي',
      deductionValue: record.salaryDeductionDays > 0 ? `${record.salaryDeductionDays} أيام` : 'بدون قطع مالي',
      delayRule: record.delayMonths > 0 ? `${record.delayMonths} أشهر` : 'لا يوجد تأخير'
    };
    return {
      ...record,
      deductionType: meta.deductionType,
      deductionValue: meta.deductionValue,
      delayRule: meta.delayRule
    };
  };

  // قراءة فقط: لا يحذف هذا المسار ولا يعيد زرع أي بيانات (أُلغي ?reset=true ومسح الجدول عند فراغه).
  // إعادة الزرع القانوني تتم حصراً عبر POST /api/penalty-types/reset-legal (للمسؤول).
  app.get('/api/penalty-types', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.penaltyTypes).orderBy(asc(schema.penaltyTypes.id));
      return res.json(mapKeys(records.map(enrichPenaltyRecord), camelToSnake));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة أنواع العقوبات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(mapKeys((inMemoryPenaltyTypes && inMemoryPenaltyTypes.length > 0 ? inMemoryPenaltyTypes : LEGAL_ARTICLE_8_PENALTIES).map(enrichPenaltyRecord), camelToSnake));
  });

  app.post('/api/penalty-types/reset-legal', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      // upsert بالاسم داخل معاملة: تُحدَّث أنواع المادة 8 الموجودة وتُضاف الناقصة. لا يُمسح الجدول، فتبقى
      // المعرّفات ثابتة والأنواع المضافة يدوياً محفوظة، وأي فشل يُرجع كل شيء كما كان.
      const records = await db.transaction(async (tx) => {
        const existing = await tx.select().from(schema.penaltyTypes);
        for (const item of LEGAL_ARTICLE_8_PENALTIES) {
          const match = existing.find(r => String(r.name || '').trim() === item.name);
          if (match) {
            await tx.update(schema.penaltyTypes).set(item).where(eq(schema.penaltyTypes.id, match.id));
          } else {
            await tx.insert(schema.penaltyTypes).values(item);
          }
        }
        return tx.select().from(schema.penaltyTypes).orderBy(asc(schema.penaltyTypes.id));
      });
      const enrichedRecords = records.map(enrichPenaltyRecord);
      inMemoryPenaltyTypes = enrichedRecords;
      saveLocalDb();
      try {
        await db.insert(schema.activityLogs).values({ action: 'إعادة الضبط القانوني لأنواع العقوبات', userEmail: req.user?.username || 'admin', details: `upsert لـ ${LEGAL_ARTICLE_8_PENALTIES.length} نوعاً (المادة 8)` });
      } catch (logErr: any) {
        console.warn('[ACTIVITY-LOG] تعذّر تسجيل إعادة ضبط أنواع العقوبات:', logErr?.message);
      }
      res.json(mapKeys(enrichedRecords, camelToSnake));
    } catch (error: any) {
      console.error('Error resetting penalty types:', error?.message);
      sendRouteError(res, error, 'إعادة الضبط القانوني لأنواع العقوبات');
    }
  });

  app.post('/api/penalty-types', requireAuth, requireAdmin, async (req, res) => {
    try {
      const data = mapKeys(req.body, snakeToCamel);
      const { name, delayMonths, description, salaryDeductionDays, status } = data;
      if (!name) return res.status(400).json({ error: 'اسم نوع العقوبة مطلوب' });
      let savedRecord: any = null;
      try {
        const [newRecord] = await db.insert(schema.penaltyTypes).values({
          name,
          delayMonths: delayMonths ? parseInt(delayMonths) : 0,
          description: description || '',
          salaryDeductionDays: salaryDeductionDays ? parseInt(salaryDeductionDays) : 0,
          status: status || 'فعال',
        }).returning();
        savedRecord = newRecord;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create penalty type');
      }

      const newId = savedRecord?.id || (inMemoryPenaltyTypes.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const memItem = {
        id: newId,
        name,
        delay_months: delayMonths ? parseInt(delayMonths) : 0,
        delayMonths: delayMonths ? parseInt(delayMonths) : 0,
        description: description || '',
        salary_deduction_days: salaryDeductionDays ? parseInt(salaryDeductionDays) : 0,
        salaryDeductionDays: salaryDeductionDays ? parseInt(salaryDeductionDays) : 0,
        status: status || 'فعال',
        created_at: new Date().toISOString()
      };
      inMemoryPenaltyTypes.push(memItem);
      saveLocalDb();
      res.status(201).json(mapKeys(enrichPenaltyRecord(savedRecord || memItem), camelToSnake));
    } catch (error: any) {
      console.error('Error creating penalty type:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/penalty-types/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });
      const data = mapKeys(req.body, snakeToCamel);
      const { name, delayMonths, description, salaryDeductionDays, status } = data;

      if (status === 'غير فعال' || status === 'معطل') {
        const refCheck = checkReferentialUsage('penalty_types', id, true, await buildRefContext());
        if (!refCheck.canProceed) {
          return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
        }
      }

      let updatedRecord: any = null;
      try {
        const [updated] = await db.update(schema.penaltyTypes)
          .set({
            name: name !== undefined ? name : undefined,
            delayMonths: delayMonths !== undefined ? (delayMonths ? parseInt(delayMonths) : 0) : undefined,
            description: description !== undefined ? description : undefined,
            salaryDeductionDays: salaryDeductionDays !== undefined ? (salaryDeductionDays ? parseInt(salaryDeductionDays) : 0) : undefined,
            status: status !== undefined ? status : undefined,
          })
          .where(eq(schema.penaltyTypes.id, id))
          .returning();
        updatedRecord = updated;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for update penalty type');
      }

      const idx = inMemoryPenaltyTypes.findIndex(r => r.id === id);
      if (idx !== -1) {
        inMemoryPenaltyTypes[idx] = {
          ...inMemoryPenaltyTypes[idx],
          name: name !== undefined ? name : inMemoryPenaltyTypes[idx].name,
          delay_months: delayMonths !== undefined ? parseInt(delayMonths) : inMemoryPenaltyTypes[idx].delay_months,
          delayMonths: delayMonths !== undefined ? parseInt(delayMonths) : inMemoryPenaltyTypes[idx].delayMonths,
          description: description !== undefined ? description : inMemoryPenaltyTypes[idx].description,
          salary_deduction_days: salaryDeductionDays !== undefined ? parseInt(salaryDeductionDays) : inMemoryPenaltyTypes[idx].salary_deduction_days,
          salaryDeductionDays: salaryDeductionDays !== undefined ? parseInt(salaryDeductionDays) : inMemoryPenaltyTypes[idx].salaryDeductionDays,
          status: status !== undefined ? status : inMemoryPenaltyTypes[idx].status,
        };
      }
      saveLocalDb();
      res.json(mapKeys(enrichPenaltyRecord(updatedRecord || inMemoryPenaltyTypes[idx] || { id, ...data }), camelToSnake));
    } catch (error: any) {
      console.error('Error updating penalty type:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/penalty-types/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });

      const refCheck = checkReferentialUsage('penalty_types', id, false, await buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }

      try {
        await db.delete(schema.penaltyTypes).where(eq(schema.penaltyTypes.id, id));
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حذف السجل')) return;
        console.warn('Database fallback for delete penalty type');
      }
      inMemoryPenaltyTypes = inMemoryPenaltyTypes.filter(r => r.id !== id);
      saveLocalDb();
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting penalty type:', error);
      sendRouteError(res, error);
    }
  });

  // --- Evaluation Forms API (استمارات تقييم الأداء حسب الفئات) ---
  const CANONICAL_SEED_FORMS = [
    {
      title: 'استمارة تقييم أداء شاغلي الوظائف القيادية والإشرافية (FORM_1)',
      category: 'الوظائف القيادية والإشرافية',
      targetGrades: 'الدرجات (الأولى - الخامسة) مع مسؤولية إشرافية',
      applicableResponsibilities: JSON.stringify(['مدير عام', 'معاون مدير عام', 'مدير هيئة', 'مدير قسم مركزي', 'مدير قسم', 'مسؤول شعبة']),
      applicableQualifications: JSON.stringify(['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم', 'إعدادية', 'متوسطة', 'ابتدائية', 'يقرأ ويكتب', 'أمي']),
      maxScore: 100,
      passingScore: 50,
      description: 'خاصة بالمدراء ومسؤولي الشُّعب فأعلى ممن يملكون مسؤولية إشرافية (18 عنصرًا، المجموع 100)',
      status: 'فعال',
      sections: JSON.stringify([
        {
          id: 's1',
          title: 'محور الأداء الوظيفي',
          weight: 49,
          criteria: [
            { id: 'c1_1', name: 'المساهمة في تحقيق أهداف المنظمة', maxScore: 6 },
            { id: 'c1_2', name: 'المهارة في التخطيط ومتابعة التنفيذ', maxScore: 6 },
            { id: 'c1_3', name: 'المهارة في اتخاذ القرارات', maxScore: 6 },
            { id: 'c1_4', name: 'المعرفة والالتزام بالتشريعات النافذة والمحافظة على سرية المعلومات', maxScore: 6 },
            { id: 'c1_5', name: 'القدرة على توجيه ومتابعة تنفيذ المرؤوسين وترتيب الأولويات بالعمل', maxScore: 6 },
            { id: 'c1_6_hse', name: 'الالتزام بتعليمات وإجراءات الصحة والسلامة والبيئة (HSE)', maxScore: 8, isHseConditional: true },
            { id: 'c1_7', name: 'القابلية على تطوير الذات وتأهيل وتدريب المرؤوسين ضمن برامج تطويرية حديثة', maxScore: 6 },
            { id: 'c1_8', name: 'معرفة استخدام تكنولوجيا المعلومات في العمل', maxScore: 5 }
          ]
        },
        {
          id: 's2',
          title: 'محور الصفات الشخصية',
          weight: 36,
          criteria: [
            { id: 'c2_1', name: 'الاهتمام بالمظهر وحسن التصرف', maxScore: 4 },
            { id: 'c2_2', name: 'القدرة على الحوار وعرض الرأي', maxScore: 5 },
            { id: 'c2_3', name: 'القدرة على التعامل مع ضغوطات العمل', maxScore: 5 },
            { id: 'c2_4', name: 'تحمل المسؤولية', maxScore: 5 },
            { id: 'c2_5', name: 'الشخصية القيادية', maxScore: 6 },
            { id: 'c2_6', name: 'تقديم أفكار إبداعية', maxScore: 6 },
            { id: 'c2_7', name: 'المستوى في اللغة الإنكليزية', maxScore: 5 }
          ]
        },
        {
          id: 's3',
          title: 'محور علاقات العمل',
          weight: 15,
          criteria: [
            { id: 'c3_1', name: 'العلاقة مع الرؤساء', maxScore: 5 },
            { id: 'c3_2', name: 'العلاقة مع الزملاء', maxScore: 5 },
            { id: 'c3_3', name: 'العلاقة مع المرؤوسين', maxScore: 5 }
          ]
        }
      ])
    },
    {
      title: 'استمارة تقييم أداء الموظفين والمهنيين (شهادة إعدادية فأعلى) (FORM_2)',
      category: 'الكادر التنفيذي والتخصصي (شهادة إعدادية فأعلى)',
      targetGrades: 'الدرجات (1 - 8) - بلا مسؤولية إشرافية',
      applicableResponsibilities: JSON.stringify(['بلا مسؤولية', 'مسؤول وحدة', 'مسؤول وجبة']),
      applicableQualifications: JSON.stringify(['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم', 'إعدادية']),
      maxScore: 100,
      passingScore: 50,
      description: 'للمرؤوسين درجة 8→1 من حملة شهادة إعدادية فأعلى بلا مسؤولية إشرافية (16 عنصرًا، المجموع 100)',
      status: 'فعال',
      sections: JSON.stringify([
        {
          id: 's1',
          title: 'محور الأداء الوظيفي',
          weight: 51,
          criteria: [
            { id: 'c1_1', name: 'المعرفة الكاملة بأهداف وسياسات التشكيل والعاملين به', maxScore: 7 },
            { id: 'c1_2', name: 'المشاركة في وضع الخطط وتنفيذها ضمن الوقت المحدد', maxScore: 6 },
            { id: 'c1_3', name: 'المعرفة والالتزام بالتشريعات النافذة والمحافظة على سرية المعلومات', maxScore: 7 },
            { id: 'c1_4', name: 'مدى تنفيذ القرارات والتوجيهات الصادرة من الجهات المسؤولة', maxScore: 6 },
            { id: 'c1_5_hse', name: 'الالتزام بتعليمات وإجراءات الصحة والسلامة والبيئة (HSE)', maxScore: 8, isHseConditional: true },
            { id: 'c1_6', name: 'القابلية على ترتيب الأولويات وإدارة الوقت', maxScore: 7 },
            { id: 'c1_7', name: 'القابلية على تطوير الذات والاستفادة من التجارب والبرامج التدريبية النافذة', maxScore: 5 },
            { id: 'c1_8', name: 'معرفة استخدام تكنولوجيا المعلومات في العمل', maxScore: 5 }
          ]
        },
        {
          id: 's2',
          title: 'محور الصفات الشخصية',
          weight: 36,
          criteria: [
            { id: 'c2_1', name: 'الاهتمام بالمظهر وحسن التصرف', maxScore: 6 },
            { id: 'c2_2', name: 'القدرة على الحوار وإبداء الرأي', maxScore: 7 },
            { id: 'c2_3', name: 'القدرة على التعامل مع ضغوطات العمل', maxScore: 6 },
            { id: 'c2_4', name: 'القدرة على الإبداع والابتكار', maxScore: 5 },
            { id: 'c2_5', name: 'تقدير وتحمل المسؤولية الأعلى', maxScore: 7 },
            { id: 'c2_6', name: 'المستوى باللغة الإنكليزية', maxScore: 5 }
          ]
        },
        {
          id: 's3',
          title: 'محور علاقات العمل',
          weight: 13,
          criteria: [
            { id: 'c3_1', name: 'العلاقة مع الرؤساء', maxScore: 7 },
            { id: 'c3_2', name: 'العلاقة مع الزملاء', maxScore: 6 }
          ]
        }
      ])
    },
    {
      title: 'استمارة تقييم أداء الكوادر والمهن الحرفية (شهادة متوسطة فأدنى) (FORM_3)',
      category: 'المهن الحرفية والخدمية (شهادة متوسطة فأدنى)',
      targetGrades: 'كافة الدرجات - بلا مسؤولية إشرافية',
      applicableResponsibilities: JSON.stringify(['بلا مسؤولية', 'مسؤول وحدة', 'مسؤول وجبة']),
      applicableQualifications: JSON.stringify(['متوسطة', 'ابتدائية', 'يقرأ ويكتب', 'أمي']),
      maxScore: 100,
      passingScore: 50,
      description: 'للمهن الحرفية والخدمية بكافة الدرجات من حملة شهادة متوسطة فأدنى بلا مسؤولية إشرافية (13 عنصرًا، المجموع 100)',
      status: 'فعال',
      sections: JSON.stringify([
        {
          id: 's1',
          title: 'محور الأداء الوظيفي',
          weight: 63,
          criteria: [
            { id: 'c1_1', name: 'الالتزام بمواعيد العمل الرسمية', maxScore: 10 },
            { id: 'c1_2', name: 'الالتزام بتعليمات وإجراءات الصحة والسلامة والبيئة (HSE)', maxScore: 9 },
            { id: 'c1_3', name: 'المحافظة على وسائل العمل المتاحة', maxScore: 9 },
            { id: 'c1_4', name: 'مدى التكيف مع ظروف العمل المختلفة', maxScore: 9 },
            { id: 'c1_5', name: 'القدرة على تنفيذ الأعمال ضمن الوقت المحدد', maxScore: 9 },
            { id: 'c1_6', name: 'نوعية وكمية العمل المنجز خلال فترة التقييم', maxScore: 9 },
            { id: 'c1_7', name: 'المهارات في تطوير الأداء واستخدام تقنيات حديثة في العمل', maxScore: 8 }
          ]
        },
        {
          id: 's2',
          title: 'محور الصفات الشخصية',
          weight: 26,
          criteria: [
            { id: 'c2_1', name: 'الاهتمام بالمظهر وحسن التصرف', maxScore: 6 },
            { id: 'c2_2', name: 'القدرة على تحمل المسؤولية والإبداع', maxScore: 7 },
            { id: 'c2_3', name: 'العمل بروح الفريق', maxScore: 7 },
            { id: 'c2_4', name: 'القابلية على إنجاز الأعمال بدون متابعة مباشرة', maxScore: 6 }
          ]
        },
        {
          id: 's3',
          title: 'محور علاقات العمل',
          weight: 11,
          criteria: [
            { id: 'c3_1', name: 'العلاقة مع الرؤساء', maxScore: 5 },
            { id: 'c3_2', name: 'العلاقة مع الزملاء', maxScore: 6 }
          ]
        }
      ])
    }
  ];

  app.get('/api/evaluation-forms', requireAuth, async (req, res) => {
    try {
      let records = await db.select().from(schema.evaluationForms).orderBy(asc(schema.evaluationForms.id));
      if (records.length === 0) {
        for (const form of CANONICAL_SEED_FORMS) {
          await db.insert(schema.evaluationForms).values(form).catch(() => {});
        }
        records = await db.select().from(schema.evaluationForms).orderBy(asc(schema.evaluationForms.id));
      }
      if (records && records.length > 0) {
        return res.json(mapKeys(records, camelToSnake));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(mapKeys(CANONICAL_SEED_FORMS.map((f, i) => ({ id: i + 1, ...f })), camelToSnake));
  });

  app.post('/api/evaluation-forms/seed-defaults', requireAuth, requireAdmin, async (req, res) => {
    try {
      for (const form of CANONICAL_SEED_FORMS) {
        const [existing] = await db.select().from(schema.evaluationForms).where(eq(schema.evaluationForms.title, form.title));
        if (!existing) {
          await db.insert(schema.evaluationForms).values(form);
        } else {
          await db.update(schema.evaluationForms).set({
            category: form.category,
            targetGrades: form.targetGrades,
            applicableResponsibilities: form.applicableResponsibilities,
            applicableQualifications: form.applicableQualifications,
            maxScore: form.maxScore,
            passingScore: form.passingScore,
            description: form.description,
            sections: form.sections,
            status: 'فعال'
          }).where(eq(schema.evaluationForms.id, existing.id));
        }
      }
      const records = await db.select().from(schema.evaluationForms).orderBy(asc(schema.evaluationForms.id));
      res.json({ success: true, message: 'تم إعادة ضبط وسيد القوالب الثلاثة القياسية بنجاح', data: records.map(r => mapKeys(r, camelToSnake)) });
    } catch (error: any) {
      console.error('Error seeding canonical forms:', error);
      sendRouteError(res, error);
    }
  });

  app.post('/api/evaluation-forms', requireAuth, requireAdmin, async (req, res) => {
    try {
      const data = mapKeys(req.body, snakeToCamel);
      const {
        title,
        category,
        targetGrades,
        applicableResponsibilities,
        applicableQualifications,
        maxScore,
        passingScore,
        description,
        sections,
        status,
        enableWeaknesses,
        enableStrengths,
        enableTrainingNeeds,
        enableEmployeeOpinion
      } = data;
      if (!title) return res.status(400).json({ error: 'عنوان استمارة التقييم مطلوب' });
      if (!category) return res.status(400).json({ error: 'الفئة الوظيفية المستهدفة مطلوبة' });

      const [newRecord] = await db.insert(schema.evaluationForms).values({
        title: title.trim(),
        category: category.trim(),
        targetGrades: targetGrades || 'جميع الدرجات',
        applicableResponsibilities: typeof applicableResponsibilities === 'object' ? JSON.stringify(applicableResponsibilities) : applicableResponsibilities,
        applicableQualifications: typeof applicableQualifications === 'object' ? JSON.stringify(applicableQualifications) : applicableQualifications,
        maxScore: maxScore ? parseInt(maxScore) : 100,
        passingScore: passingScore ? parseInt(passingScore) : 50,
        description: description || '',
        sections: typeof sections === 'object' ? JSON.stringify(sections) : (sections || '[]'),
        enableWeaknesses: Boolean(enableWeaknesses),
        enableStrengths: Boolean(enableStrengths),
        enableTrainingNeeds: Boolean(enableTrainingNeeds),
        enableEmployeeOpinion: Boolean(enableEmployeeOpinion),
        status: status || 'فعال',
      }).returning();
      res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating evaluation form:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/evaluation-forms/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });
      const data = mapKeys(req.body, snakeToCamel);
      const {
        title,
        category,
        targetGrades,
        applicableResponsibilities,
        applicableQualifications,
        maxScore,
        passingScore,
        description,
        sections,
        status,
        enableWeaknesses,
        enableStrengths,
        enableTrainingNeeds,
        enableEmployeeOpinion
      } = data;

      if (status === 'غير فعال' || status === 'معطل') {
        const refCheck = checkReferentialUsage('evaluation_forms', id, true, await buildRefContext());
        if (!refCheck.canProceed) {
          return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
        }
      }

      const [updated] = await db.update(schema.evaluationForms)
        .set({
          title: title !== undefined ? title : undefined,
          category: category !== undefined ? category : undefined,
          targetGrades: targetGrades !== undefined ? targetGrades : undefined,
          applicableResponsibilities: applicableResponsibilities !== undefined ? (typeof applicableResponsibilities === 'object' ? JSON.stringify(applicableResponsibilities) : applicableResponsibilities) : undefined,
          applicableQualifications: applicableQualifications !== undefined ? (typeof applicableQualifications === 'object' ? JSON.stringify(applicableQualifications) : applicableQualifications) : undefined,
          maxScore: maxScore !== undefined ? (maxScore ? parseInt(maxScore) : 100) : undefined,
          passingScore: passingScore !== undefined ? (passingScore ? parseInt(passingScore) : 50) : undefined,
          description: description !== undefined ? description : undefined,
          sections: sections !== undefined ? (typeof sections === 'object' ? JSON.stringify(sections) : sections) : undefined,
          enableWeaknesses: enableWeaknesses !== undefined ? Boolean(enableWeaknesses) : undefined,
          enableStrengths: enableStrengths !== undefined ? Boolean(enableStrengths) : undefined,
          enableTrainingNeeds: enableTrainingNeeds !== undefined ? Boolean(enableTrainingNeeds) : undefined,
          enableEmployeeOpinion: enableEmployeeOpinion !== undefined ? Boolean(enableEmployeeOpinion) : undefined,
          status: status !== undefined ? status : undefined,
        })
        .where(eq(schema.evaluationForms.id, id))
        .returning();
      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.error('Error updating evaluation form:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/evaluation-forms/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });

      const refCheck = checkReferentialUsage('evaluation_forms', id, false, await buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }

      await db.delete(schema.evaluationForms).where(eq(schema.evaluationForms.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting evaluation form:', error);
      sendRouteError(res, error);
    }
  });

  // --- Shift Systems API ---
  const DEFAULT_SHIFT_SYSTEMS = [
    { id: 1, name: 'شفت 24/72 (يوم عمل مقابل 3 أيام استراحة)', work_days: 1, rest_days: 3, shift_hours_type: '24h', daily_hours: 24, description: 'نظام المناوبة المستمرة 24 ساعة عمل يعقبها 72 ساعة راحة' },
    { id: 2, name: 'شفت 12/24 (12 ساعة عمل مقابل 24 ساعة استراحة)', work_days: 1, rest_days: 1, shift_hours_type: '12h', daily_hours: 12, description: 'نظام مناوبة 12 ساعة' },
    { id: 3, name: 'دوام صباحي اعتيادي (8 ساعات)', work_days: 5, rest_days: 2, shift_hours_type: '8h', daily_hours: 8, description: 'الدوام الصباحي الرسمي المعتاد' }
  ];

  app.get('/api/shift-systems', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.shiftSystems).orderBy(asc(schema.shiftSystems.id));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(mapKeys(records, camelToSnake));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(DEFAULT_SHIFT_SYSTEMS);
  });

  app.post('/api/shift-systems', requireAuth, requireAdmin, async (req, res) => {
    try {
      const {
        name,
        work_days,
        rest_days,
        shift_hours_type,
        daily_hours,
        description,
      } = req.body;

      try {
        const [newRecord] = await db.insert(schema.shiftSystems).values({
          name,
          workDays: work_days !== undefined ? parseInt(work_days) : 1,
          restDays: rest_days !== undefined ? parseInt(rest_days) : 3,
          shiftHoursType: shift_hours_type || '24h',
          dailyHours: daily_hours !== undefined ? parseInt(daily_hours) : 24,
          description: description || '',
        }).returning();

        if (newRecord) return res.status(201).json(mapKeys(newRecord, camelToSnake));
      } catch (err) {
        if (respondIfDbWriteError(res, err, 'حفظ السجل')) return;
        console.warn('Database fallback for create shift system');
      }

      res.status(201).json({ id: Date.now(), ...req.body });
    } catch (error: any) {
      console.error('Error creating shift system:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/shift-systems/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const {
        name,
        work_days,
        rest_days,
        shift_hours_type,
        daily_hours,
        description,
        status
      } = req.body;

      if (status === 'معطل' || status === 'غير فعال') {
        const refCheck = checkReferentialUsage('shift_systems', id, true, await buildRefContext());
        if (!refCheck.canProceed) {
          return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
        }
      }

      try {
        const [updated] = await db.update(schema.shiftSystems)
          .set({
            name: name !== undefined ? name : undefined,
            workDays: work_days !== undefined ? parseInt(work_days) : undefined,
            restDays: rest_days !== undefined ? parseInt(rest_days) : undefined,
            shiftHoursType: shift_hours_type !== undefined ? shift_hours_type : undefined,
            dailyHours: daily_hours !== undefined ? parseInt(daily_hours) : undefined,
            description: description !== undefined ? description : undefined,
          })
          .where(eq(schema.shiftSystems.id, id))
          .returning();

        if (updated) return res.json(mapKeys(updated, camelToSnake));
      } catch (err) {
        if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
        console.warn('Database fallback for update shift system');
      }

      res.json({ id, ...req.body });
    } catch (error: any) {
      console.error('Error updating shift system:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/shift-systems/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const refCheck = checkReferentialUsage('shift_systems', id, false, await buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }

      try {
        await db.delete(schema.shiftSystems).where(eq(schema.shiftSystems.id, id));
      } catch (err) {
        if (respondIfDbWriteError(res, err, 'حذف السجل')) return;
        console.warn('Database fallback for delete shift system');
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting shift system:', error);
      sendRouteError(res, error);
    }
  });

  return {
    buildRefContext,
    getCommendationRulesSettings: () => inMemoryCommendationRulesSettings,
    getGradePromotionRulesDefaults: () => inMemoryGradePromotionRules,
    CANONICAL_SEED_FORMS,
  };
}
