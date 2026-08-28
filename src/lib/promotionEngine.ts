// src/lib/promotionEngine.ts
/**
 * Promotion & Increment Calculation Engine (Phase 2a: Standard Track Engine)
 * محرك احتساب استحقاق الترفيع والعلاوات السنوية — المسار الاعتيادي
 * 
 * القواعد الصارمة:
 * 1. المسار الاعتيادي فقط: استبعاد موظفي احتساب الشهادات أثناء الخدمة مع تعليمهم كـ "غير مدعوم حالياً".
 * 2. المحرك يحسب فقط ولا ينفّذ (ممنوع تعديل grade أو step).
 * 3. الحساب آني ودقيق (دقة اليوم الواحد للغياب، دقة الشهر للقدم والتأخير).
 * 4. نقل أثر احتساب الخدمة: أي حدث من المؤثرات الخمسة (كتب شكر، عقوبات، غياب، تقييم، إجازات موقفة)
 *    يقع في الفترة المختصرة باحتساب الخدمة يؤجل للدورة التالية بـ deferredItems ولا يطبَّق على الدورة الحالية.
 * 5. احتساب الخدمة ينطبق على العلاوة والترفيع معاً.
 * 6. الشروط الحاكمة (Gate Conditions): الدورات الحتمية، تقييم الأداء (لا مقبول/ضعيف)، الإجازات الموقفة.
 */

export interface EmployeeEntity {
  id: number | string;
  fullName?: string;
  full_name?: string;
  name?: string;
  grade?: number | string;
  step?: number | string;
  lastPromotionDate?: string;
  last_promotion_date?: string;
  lastIncrementDate?: string;
  last_increment_date?: string;
  firstAppointmentDate?: string;
  first_appointment_date?: string;
  currentAppointmentDate?: string;
  current_appointment_date?: string;
  appointmentDate?: string;
  appointment_date?: string;
  gradeDate?: string;
  grade_date?: string;
  status?: string;
  [key: string]: any;
}

export interface CommendationRecord {
  id?: number | string;
  employeeId?: number | string;
  employee_id?: number | string;
  creditMonthsSnapshot?: number;
  credit_months_snapshot?: number;
  seniorityImpact?: string;
  seniority_impact?: string;
  orderDate?: string;
  order_date?: string;
  orderNumber?: string;
  order_number?: string;
  issuer?: string;
  reason?: string;
  isHidden?: boolean;
  is_hidden?: boolean;
  [key: string]: any;
}

export interface PenaltyRecord {
  id?: number | string;
  employeeId?: number | string;
  employee_id?: number | string;
  penaltyType?: string;
  penalty_type?: string;
  delayMonths?: number;
  delay_months?: number;
  penaltyDate?: string;
  penalty_date?: string;
  orderDate?: string;
  order_date?: string;
  orderNumber?: string;
  order_number?: string;
  status?: string;
  [key: string]: any;
}

export interface AttendanceRecord {
  id?: number | string;
  employeeId?: number | string;
  employee_id?: number | string;
  date?: string;
  status?: string; // 'غائب', 'غياب', 'غياب_بدون_عذر', 'absence'
  count?: number;
  days?: number;
  durationDays?: number;
  duration_days?: number;
  [key: string]: any;
}

export interface EvaluationRecord {
  id?: number | string;
  employeeId?: number | string;
  employee_id?: number | string;
  year?: number | string;
  totalScore?: number;
  total_score?: number;
  score?: number | string;
  grade?: string; // 'ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'
  rating?: string;
  evaluationGrade?: string;
  evaluation_grade?: string;
  status?: string;
  evaluationDate?: string;
  evaluation_date?: string;
  [key: string]: any;
}

export interface LeaveRecord {
  id?: number | string;
  employeeId?: number | string;
  employee_id?: number | string;
  leaveTypeId?: number | string;
  leave_type_id?: number | string;
  leaveType?: string;
  leave_type?: string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  administrativeEffect?: string;
  administrative_effect?: string; // 'لا_يؤثر', 'يوقف_الترفيع', 'يؤخر_العلاوة'
  status?: string;
  [key: string]: any;
}

export interface ServiceCreditRecord {
  id?: number | string;
  employeeId?: number | string;
  employee_id?: number | string;
  creditType?: string;
  credit_type?: string;
  calculatedYears?: number;
  calculated_years?: number;
  calculatedMonths?: number;
  calculated_months?: number;
  calculatedDays?: number;
  calculated_days?: number;
  years?: number;
  months?: number;
  days?: number;
  orderNumber?: string;
  order_number?: string;
  orderDate?: string;
  order_date?: string;
  purpose?: string; // 'علاوة_وترفيع', 'تقاعد_وترقية_وعلاوة', 'promotion_allowance_pension', 'تقاعد_فقط', 'علاوة_فقط'
  isCountedForPromotion?: boolean;
  is_counted_for_promotion?: boolean;
  isCountedForRetirement?: boolean;
  is_counted_for_retirement?: boolean;
  [key: string]: any;
}

export interface QualificationRecord {
  id?: number | string;
  employeeId?: number | string;
  employee_id?: number | string;
  qualificationType?: string;
  qualification_type?: string; // 'تعيين', 'أثناء الخدمة'
  educationLevel?: string;
  education_level?: string;
  graduationDate?: string;
  graduation_date?: string;
  graduationYear?: number;
  graduation_year?: number;
  isActive?: boolean;
  is_active?: boolean;
  [key: string]: any;
}

export interface GoverningCourseRecord {
  id?: number | string;
  grade?: number;
  courseName?: string;
  course_name?: string;
  isRequiredForPromotion?: boolean;
  is_required_for_promotion?: boolean;
  status?: string;
  [key: string]: any;
}

export interface GradePromotionRuleRecord {
  grade: number;
  promotionYears: number | null;
  promotion_years?: number | null;
  notes?: string;
}

export interface EngineContextData {
  commendations?: CommendationRecord[];
  penalties?: PenaltyRecord[];
  penaltyTypes?: Record<string, number>; // e.g. { 'إنذار': 3, 'توبيخ': 6 }
  attendances?: AttendanceRecord[];
  evaluations?: EvaluationRecord[];
  leaves?: LeaveRecord[];
  serviceCredits?: ServiceCreditRecord[];
  qualifications?: QualificationRecord[];
  governingCourses?: GoverningCourseRecord[];
  governingAssignments?: Record<string, any>;
  gradeRules?: GradePromotionRuleRecord[];
  degreeTrackSnapshot?: any;
  degreeTrackSnapshots?: any[];
  specializationCredits?: any[];
  today?: string; // YYYY-MM-DD for deterministic testing
}

export interface DeferredImpactItem {
  id?: number | string;
  type: 'commendation' | 'penalty' | 'absence' | 'evaluation' | 'leave' | 'service_credit';
  originalDate?: string;
  year?: number | string;
  effect: string;
  description: string;
  reason?: string;
  status?: string;
  months?: number;
  creditMonths?: number;
  days?: number;
  score?: number | string;
  grade?: string;
  leaveType?: string;
}

export interface IncrementEligibilityResult {
  nextIncrementDueDate: string | null;
  baseDueDate: string | null;
  lastIncrementDate: string | null;
  eligibilityStatus: 'مستحق_للعلاوة' | 'مؤهل' | 'غير_مستحق_حاليا' | 'متوقف_بعقوبة' | 'غير_مدعوم_حاليا' | 'نهاية_المرحلة';
  isIncrementEligible?: boolean;
  commendationMonthsDeducted: number;
  penaltyMonthsAdded: number;
  absenceDaysAdded: number;
  serviceCreditDurationDeducted: {
    years: number;
    months: number;
    days: number;
  };
  modifiers?: {
    commendationMonths: number;
    penaltyDelayMonths: number;
    absenceDays: number;
    serviceCreditMonths: number;
  };
  deferredItems: DeferredImpactItem[];
  isSupported: boolean;
  statusReason?: string;
  unsupportedReason?: string;
  appliedCommendationsCount: number;
  appliedPenaltiesCount: number;
  appliedAbsenceDays: number;
}

export interface PromotionGateCheckResults {
  governingCoursesSatisfied: boolean;
  missingGoverningCourses: string[];
  evaluationsSatisfied: boolean;
  lastEvaluationsGrades: string[];
  evaluationBlockReason?: string;
  activePausingLeave: boolean;
  noActivePausingLeaves?: boolean;
  pausingLeaveDetails?: {
    leaveType: string;
    startDate: string;
    endDate: string;
  } | null;
}

export interface PromotionEligibilityResult {
  nextPromotionDueDate: string | null;
  baseDueDate: string | null;
  lastPromotionDate: string | null;
  requiredYears: number | null;
  eligibilityStatus:
    | 'مستحق_للترفيع'
    | 'مؤهل'
    | 'غير_مستحق_حالياً'
    | 'مؤجل_لعدم_استيفاء_الدورات'
    | 'متوقف_بسبب_التقييم'
    | 'موقوف_بإجازة'
    | 'نهاية_السلم_الوظيفي'
    | 'غير_مدعوم_حاليا';
  isPromotionEligible?: boolean;
  statusReason?: string;
  unsupportedReason?: string;
  isSupported: boolean;
  commendationMonthsDeducted: number;
  penaltyMonthsAdded: number;
  absenceDaysAdded: number;
  serviceCreditDurationDeducted: {
    years: number;
    months: number;
    days: number;
  };
  modifiers?: {
    commendationMonths: number;
    penaltyDelayMonths: number;
    absenceDays: number;
    serviceCreditMonths: number;
  };
  gateCheckResults: PromotionGateCheckResults;
  gateChecks?: {
    governingCoursesSatisfied: boolean;
    evaluationsSatisfied: boolean;
    noActivePausingLeaves: boolean;
  };
  deferredItems: DeferredImpactItem[];
  appliedCommendationsCount: number;
  appliedPenaltiesCount: number;
  appliedAbsenceDays: number;
}

export interface FullEligibilityResponse {
  employeeId: number | string;
  employeeName: string;
  grade: number;
  step: number;
  isSupported: boolean;
  unsupportedReason?: string;
  increment: IncrementEligibilityResult;
  promotion: PromotionEligibilityResult;
  calculatedAt: string;
}

// ============================================================================
// Helper Date Functions (Pure & High-Precision)
// ============================================================================

export function parseDateString(dateStr: any): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? new Date() : dateStr;
  const str = String(dateStr).trim().split('T')[0];
  const parts = str.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(Date.UTC(y, m, d));
    }
  }
  const dt = new Date(str);
  return isNaN(dt.getTime()) ? new Date() : dt;
}

export function formatDateString(date: any): string {
  if (!date) return '';
  if (typeof date === 'string') {
    const clean = date.trim().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  }
  const dt = date instanceof Date ? date : new Date(date);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMonthsToDate(dateStr: string, monthsToAdd: number): string {
  const dt = parseDateString(dateStr);
  const targetYear = dt.getUTCFullYear();
  const targetMonth = dt.getUTCMonth() + monthsToAdd;
  const targetDay = dt.getUTCDate();

  const tempDate = new Date(Date.UTC(targetYear, targetMonth, 1));
  const maxDaysInMonth = new Date(
    Date.UTC(tempDate.getUTCFullYear(), tempDate.getUTCMonth() + 1, 0)
  ).getUTCDate();

  const finalDay = Math.min(targetDay, maxDaysInMonth);
  tempDate.setUTCDate(finalDay);

  return formatDateString(tempDate);
}

export function addDaysToDate(dateStr: string, daysToAdd: number): string {
  const dt = parseDateString(dateStr);
  dt.setUTCDate(dt.getUTCDate() + daysToAdd);
  return formatDateString(dt);
}

export function isDateOnOrAfter(dateStr: any, refDateStr: any): boolean {
  if (!dateStr || !refDateStr) return false;
  return parseDateString(dateStr).getTime() >= parseDateString(refDateStr).getTime();
}

export function isDateBetween(dateStr: string, startDateStr: string, endDateStr: string): boolean {
  const t = parseDateString(dateStr).getTime();
  return (
    t >= parseDateString(startDateStr).getTime() &&
    t <= parseDateString(endDateStr).getTime()
  );
}

// Default standard Iraqi Civil Service rule years
export const DEFAULT_GRADE_PROMOTION_YEARS: Record<number, number | null> = {
  1: null, // الدرجة الأولى نهاية السلم
  2: 5,
  3: 5,
  4: 5,
  5: 5,
  6: 4,
  7: 4,
  8: 4,
  9: 4,
  10: 4,
};

// Default legal article 8 delay penalties
export const DEFAULT_PENALTY_DELAYS: Record<string, number> = {
  'لفت النظر': 3,
  'لفت نظر': 3,
  'الإنذار': 6,
  'إنذار': 6,
  'إنذار خطي': 6,
  'قطع الراتب': 5,
  'قطع راتب': 5,
  'التوبيخ': 12,
  'توبيخ': 12,
  'إنقاص الراتب': 24,
  'إنقاص راتب': 24,
  'تنزيل الدرجة': 36,
  'تنزيل درجة': 36,
  'الفصل': 0,
  'العزل': 0,
};

// ============================================================================
// Gate Conditions Checker
// ============================================================================

export function checkGateConditions(
  employee: EmployeeEntity,
  context: EngineContextData = {},
  cutoffDate?: string,
  outDeferredItems?: DeferredImpactItem[]
): PromotionGateCheckResults {
  const today = context.today || formatDateString(new Date());
  const gradeNum = parseInt(String(employee.grade)) || 10;

  // A. Governing Courses Gate (الدورات الحاكمة)
  const governingCourses = (context.governingCourses || []).filter(
    c => (c.grade === gradeNum || !c.grade) && (c.isRequiredForPromotion !== false && c.is_required_for_promotion !== false) && (c.status === 'فعال' || !c.status)
  );
  const assignments = context.governingAssignments || {};
  const empAssignment = assignments[String(employee.id)];

  let governingCoursesSatisfied = true;
  const missingGoverningCourses: string[] = [];

  if (empAssignment && (empAssignment.status === 'معفى_كامل' || empAssignment.status === 'معفى' || empAssignment.status === 'مستوفي' || empAssignment.status === 'ناجح')) {
    governingCoursesSatisfied = true;
  } else if (governingCourses.length > 0) {
    const progress = empAssignment?.courseProgress || {};
    governingCourses.forEach(gc => {
      const cName = gc.courseName || gc.course_name || '';
      const cId = String(gc.id || '');
      const prog = progress[cName] || (cId ? progress[cId] : undefined);
      const isDone = prog?.completed === true || prog?.status === 'ناجح' || prog?.status === 'معفى' || prog?.status === 'اجتاز';
      if (!isDone) {
        governingCoursesSatisfied = false;
        missingGoverningCourses.push(cName);
      }
    });
  }

  // B. Performance Evaluations Gate (تقييم الأداء لآخر سنتين)
  const evaluations = (context.evaluations || [])
    .filter(ev => ev.grade || ev.rating || ev.evaluationGrade || ev.evaluation_grade || ev.totalScore !== undefined || ev.total_score !== undefined || ev.score !== undefined)
    .sort((a, b) => {
      const yrA = parseInt(String(a.year)) || 0;
      const yrB = parseInt(String(b.year)) || 0;
      return yrB - yrA;
    });

  const cutoffYear = cutoffDate ? parseDateString(cutoffDate).getUTCFullYear() : undefined;
  let evaluationsSatisfied = true;
  let evaluationBlockReason = '';
  const lastEvaluationsGrades: string[] = [];
  let evaluatedCount = 0;

  for (const ev of evaluations) {
    const evYear = parseInt(String(ev.year)) || 0;
    const evDate = ev.evaluationDate || ev.evaluation_date;
    const isAfterCutoff = cutoffDate ? ((cutoffYear && evYear > cutoffYear) || (evDate && isDateOnOrAfter(evDate, cutoffDate))) : false;

    const g = (ev.grade || ev.rating || ev.evaluationGrade || ev.evaluation_grade || '').trim();
    const score = ev.totalScore !== undefined ? ev.totalScore : (ev.total_score !== undefined ? ev.total_score : (ev.score !== undefined ? parseInt(String(ev.score)) : undefined));
    const isUnsatisfactory = g === 'مقبول' || g === 'ضعيف' || g === 'غير مرضي' || (score !== undefined && score < 60);

    if (isAfterCutoff) {
      if (isUnsatisfactory && outDeferredItems) {
        outDeferredItems.push({
          id: ev.id,
          type: 'evaluation',
          year: ev.year,
          grade: g,
          score,
          effect: `تقييم أداء (${g || score + '%'}) مؤجل لدورة الاستحقاق التالية`,
          reason: `تقييم أداء لسنة (${ev.year || '—'}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
          status: 'مؤجل_للدورة_التالية',
          description: `تقييم أداء (${g || score + '%'}) لسنة (${ev.year || '—'}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
        });
      }
      continue; // Skip evaluating for current cycle gate check!
    }

    if (evaluatedCount < 2) {
      lastEvaluationsGrades.push(g || `${score}%`);
      if (isUnsatisfactory) {
        evaluationsSatisfied = false;
        evaluationBlockReason = `حصول الموظف على تقييم (${g || score + '%'}) في تقييم أداء سنة (${ev.year || '—'})`;
      }
      evaluatedCount++;
    }
  }

  // C. Pausing Leave Gate (الإجازات الموقفة للترفيع حالياً)
  const leaves = context.leaves || [];
  let activePausingLeave = false;
  let pausingLeaveDetails: PromotionGateCheckResults['pausingLeaveDetails'] = null;

  leaves.forEach(lv => {
    const adminEffect = lv.administrativeEffect || lv.administrative_effect || '';
    const isPausing = adminEffect === 'يوقف_الترفيع' || adminEffect === 'pause_promotion';
    if (!isPausing) return;
    const sDate = lv.startDate || lv.start_date || '';
    const eDate = lv.endDate || lv.end_date || '';
    const isApproved = lv.status === 'موافق_عليها' || lv.status === 'ساري' || lv.status === 'نشط' || lv.status === 'approved' || !lv.status;
    if (!isApproved) return;

    const isAfterCutoff = cutoffDate && sDate ? isDateOnOrAfter(sDate, cutoffDate) : false;
    if (isAfterCutoff) {
      if (outDeferredItems) {
        outDeferredItems.push({
          id: lv.id,
          type: 'leave',
          originalDate: sDate,
          leaveType: lv.leaveType || lv.leave_type || 'إجازة موقفة للترفيع',
          effect: `إجازة موقفة مؤجلة لدورة الاستحقاق التالية`,
          reason: `إجازة (${lv.leaveType || lv.leave_type || 'موقفة'}) بدأت بتاريخ (${sDate}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
          status: 'مؤجل_للدورة_التالية',
          description: `إجازة (${lv.leaveType || lv.leave_type || 'موقفة'}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
        });
      }
      return;
    }

    const isInDateRange = sDate && eDate ? isDateBetween(today, sDate, eDate) : true;
    if (isInDateRange) {
      activePausingLeave = true;
      pausingLeaveDetails = {
        leaveType: lv.leaveType || lv.leave_type || 'إجازة موقفة للترفيع',
        startDate: sDate,
        endDate: eDate,
      };
    }
  });

  return {
    governingCoursesSatisfied,
    missingGoverningCourses,
    evaluationsSatisfied,
    lastEvaluationsGrades,
    evaluationBlockReason: evaluationBlockReason || undefined,
    activePausingLeave,
    noActivePausingLeaves: !activePausingLeave,
    pausingLeaveDetails,
  };
}

// ============================================================================
// Main Calculation Logic: Increment Eligibility (العلاوة السنوية)
// ============================================================================

export function calculateIncrementEligibility(
  employee: EmployeeEntity,
  context: EngineContextData = {}
): IncrementEligibilityResult {
  const today = context.today || formatDateString(new Date());

  // 1. Check in-service qualification boundary (المسار الاعتيادي فقط)
  const quals = context.qualifications || [];
  const hasInServiceDegree = quals.some(
    q => (q.qualificationType === 'أثناء الخدمة' || q.qualification_type === 'أثناء الخدمة') && (q.isActive !== false && q.is_active !== false)
  );

  if (hasInServiceDegree) {
    return {
      nextIncrementDueDate: null,
      baseDueDate: null,
      lastIncrementDate: employee.lastIncrementDate || employee.last_increment_date || null,
      eligibilityStatus: 'غير_مدعوم_حاليا',
      isIncrementEligible: false,
      commendationMonthsDeducted: 0,
      penaltyMonthsAdded: 0,
      absenceDaysAdded: 0,
      serviceCreditDurationDeducted: { years: 0, months: 0, days: 0 },
      modifiers: {
        commendationMonths: 0,
        penaltyDelayMonths: 0,
        absenceDays: 0,
        serviceCreditMonths: 0,
      },
      deferredItems: [],
      isSupported: false,
      statusReason: 'الموظف مرتبط بمسار احتساب الشهادات أثناء الخدمة — مسار احتساب الشهادات قيد التطوير في المرحلة القادمة',
      unsupportedReason: 'الموظف مرتبط بمسار احتساب الشهادات أثناء الخدمة — مسار احتساب الشهادات قيد التطوير في المرحلة القادمة',
      appliedCommendationsCount: 0,
      appliedPenaltiesCount: 0,
      appliedAbsenceDays: 0,
    };
  }

  // 2. Determine base last increment date
  const lastIncr =
    employee.lastIncrementDate ||
    employee.last_increment_date ||
    employee.gradeDate ||
    employee.grade_date ||
    employee.currentAppointmentDate ||
    employee.current_appointment_date ||
    employee.firstAppointmentDate ||
    employee.first_appointment_date ||
    employee.appointmentDate ||
    employee.appointment_date ||
    today;

  // Base rule: 12 months for annual increment
  const baseTotalMonths = 12;
  const baseDueDate = addMonthsToDate(lastIncr, baseTotalMonths);

  // 3. Service Credit Reduction for Increment (احتساب الخدمة المقررة للعلاوة)
  const serviceCredits = context.serviceCredits || [];
  let creditYears = 0;
  let creditMonths = 0;
  let creditDays = 0;

  serviceCredits.forEach(sc => {
    const isCounted = sc.isCountedForPromotion !== false && sc.is_counted_for_promotion !== false;
    const purpose = sc.purpose || '';
    const isPensionOnly = purpose === 'تقاعد_فقط' || purpose === 'pension_only';
    const isPromotionOnly = purpose === 'ترفيع_فقط' || purpose === 'promotion_only';
    if (isCounted && !isPensionOnly && !isPromotionOnly) {
      creditYears += sc.calculatedYears !== undefined ? sc.calculatedYears : (sc.calculated_years !== undefined ? sc.calculated_years : (sc.years || 0));
      creditMonths += sc.calculatedMonths !== undefined ? sc.calculatedMonths : (sc.calculated_months !== undefined ? sc.calculated_months : (sc.months || 0));
      creditDays += sc.calculatedDays !== undefined ? sc.calculatedDays : (sc.calculated_days !== undefined ? sc.calculated_days : (sc.days || 0));
    }
  });

  const totalCreditMonths = creditYears * 12 + creditMonths;
  const effectiveMonthsAfterCredit = Math.max(0, baseTotalMonths - totalCreditMonths);
  const creditAdjustedDate = addMonthsToDate(lastIncr, effectiveMonthsAfterCredit);

  const deferredItems: DeferredImpactItem[] = [];

  // 4. Modifiers: Commendations since lastIncrementDate
  const commendations = context.commendations || [];
  let commendationMonths = 0;
  let appliedCommendationsCount = 0;

  commendations.forEach(c => {
    const isHidden = c.isHidden === true || c.is_hidden === true;
    if (isHidden) return;
    const orderDate = c.orderDate || c.order_date;
    if (!orderDate || !isDateOnOrAfter(orderDate, lastIncr)) return;

    let months = c.creditMonthsSnapshot !== undefined ? c.creditMonthsSnapshot : c.credit_months_snapshot;
    if (months === undefined || months === null) {
      const impact = c.seniorityImpact || c.seniority_impact || '';
      if (impact.includes('شهرين') || impact.includes('2')) months = 2;
      else if (impact.includes('6') || impact.includes('ستة')) months = 6;
      else if (impact.includes('شهر') || impact.includes('1')) months = 1;
      else months = 0;
    }
    if (months <= 0) return;

    if (totalCreditMonths > 0 && isDateOnOrAfter(orderDate, creditAdjustedDate)) {
      deferredItems.push({
        id: c.id,
        type: 'commendation',
        originalDate: orderDate,
        months,
        creditMonths: months,
        effect: `+${months} شهر قدَم مؤجل لدورة الاستحقاق التالية`,
        reason: `كتاب شكر رقم (${c.orderNumber || c.order_number || '—'}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
        status: 'مؤجل_للدورة_التالية',
        description: `كتاب شكر رقم (${c.orderNumber || c.order_number || '—'}) بتاريخ (${orderDate}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
      });
    } else {
      commendationMonths += months;
      appliedCommendationsCount++;
    }
  });

  // 5. Modifiers: Penalties delay since lastIncrementDate
  const penalties = context.penalties || [];
  const penaltyTypeMap = context.penaltyTypes || DEFAULT_PENALTY_DELAYS;
  let penaltyDelayMonths = 0;
  let appliedPenaltiesCount = 0;

  penalties.forEach(p => {
    const status = p.status || 'نافذ';
    if (status !== 'نافذ' && status !== 'active') return;
    const pDate = p.penaltyDate || p.penalty_date || p.orderDate || p.order_date;
    if (!pDate || !isDateOnOrAfter(pDate, lastIncr)) return;

    const pType = p.penaltyType || p.penalty_type || '';
    const delay = p.delayMonths !== undefined ? p.delayMonths : (p.delay_months !== undefined ? p.delay_months : (penaltyTypeMap[pType] || 0));
    if (delay <= 0) return;

    if (totalCreditMonths > 0 && isDateOnOrAfter(pDate, creditAdjustedDate)) {
      deferredItems.push({
        id: p.id,
        type: 'penalty',
        originalDate: pDate,
        months: delay,
        effect: `تأخير ${delay} شهر مؤجل لدورة الاستحقاق التالية`,
        reason: `عقوبة (${pType}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
        status: 'مؤجل_للدورة_التالية',
        description: `عقوبة (${pType}) بتاريخ (${pDate}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
      });
    } else {
      penaltyDelayMonths += delay;
      appliedPenaltiesCount++;
    }
  });

  // 6. Modifiers: Attendance Absences since lastIncrementDate (exact days, not rounded)
  const attendances = context.attendances || [];
  let absenceDays = 0;

  attendances.forEach(a => {
    const status = (a.status || '').trim();
    const isAbsence =
      status === 'غائب' ||
      status === 'غياب' ||
      status === 'غياب_بدون_عذر' ||
      status === 'غياب بدون عذر' ||
      status === 'absence';
    if (!isAbsence || !a.date || !isDateOnOrAfter(a.date, lastIncr)) return;

    const count = a.count !== undefined ? a.count : (a.days !== undefined ? a.days : (a.durationDays !== undefined ? a.durationDays : (a.duration_days !== undefined ? a.duration_days : 1)));

    if (totalCreditMonths > 0 && isDateOnOrAfter(a.date, creditAdjustedDate)) {
      deferredItems.push({
        id: a.id,
        type: 'absence',
        originalDate: a.date,
        days: count,
        effect: `${count} يوم غياب مؤجل لدورة الاستحقاق التالية`,
        reason: `غياب (${count}) يوم مؤجل لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي بالخدمة المحتسبة.`,
        status: 'مؤجل_للدورة_التالية',
        description: `غياب (${count}) يوم بتاريخ (${a.date}) مؤجل لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي بالخدمة المحتسبة.`,
      });
    } else {
      absenceDays += count;
    }
  });

  // 7. Calculate Final Next Increment Due Date
  const effectiveNetMonths = Math.max(0, baseTotalMonths - totalCreditMonths - commendationMonths + penaltyDelayMonths);
  let computedDate = addMonthsToDate(lastIncr, effectiveNetMonths);
  if (creditDays > 0) {
    computedDate = addDaysToDate(computedDate, -creditDays);
  }
  if (absenceDays > 0) {
    computedDate = addDaysToDate(computedDate, absenceDays);
  }

  // 8. Determine Increment Eligibility Status
  const leaves = context.leaves || [];
  let activePausingLeave = false;
  let pausingLeaveTitle = '';
  leaves.forEach(lv => {
    const adminEffect = lv.administrativeEffect || lv.administrative_effect || '';
    const isPausing = adminEffect === 'يوقف_الترفيع' || adminEffect === 'pause_promotion' || adminEffect === 'يوقف_العلاوة_والترفيع';
    if (!isPausing) return;
    const sDate = lv.startDate || lv.start_date || '';
    const eDate = lv.endDate || lv.end_date || '';
    const isApproved = lv.status === 'موافق_عليها' || lv.status === 'ساري' || lv.status === 'نشط' || lv.status === 'approved' || !lv.status;
    const isInDateRange = sDate && eDate ? isDateBetween(today, sDate, eDate) : true;
    if (isApproved && isInDateRange) {
      activePausingLeave = true;
      pausingLeaveTitle = lv.leaveType || lv.leave_type || 'إجازة موقفة';
    }
  });

  let eligibilityStatus: IncrementEligibilityResult['eligibilityStatus'] = 'مؤهل';
  let statusReason = '';
  let isIncrementEligible = false;

  if (activePausingLeave) {
    eligibilityStatus = 'موقوف_بإجازة';
    statusReason = `العلاوة موقوفة لوجود الموظف في (${pausingLeaveTitle})`;
    isIncrementEligible = false;
  } else if (penaltyDelayMonths > 0 && !isDateOnOrAfter(today, computedDate)) {
    eligibilityStatus = 'متوقف_بعقوبة';
    statusReason = `العلاوة مؤخرة لمدة ${penaltyDelayMonths} شهر بسبب عقوبة إدارية نافذة`;
    isIncrementEligible = false;
  } else if (isDateOnOrAfter(today, computedDate)) {
    eligibilityStatus = 'مستحق_للعلاوة';
    statusReason = 'استوفى الموظف المدة الزمنية المستحقة للعلاوة السنوية';
    isIncrementEligible = true;
  } else {
    eligibilityStatus = 'مؤهل';
    statusReason = 'الموظف مستوفٍ للشروط ومؤهل لاستحقاق العلاوة بتاريخ الاستحقاق';
    isIncrementEligible = true;
  }

  return {
    nextIncrementDueDate: computedDate,
    baseDueDate,
    lastIncrementDate: lastIncr,
    eligibilityStatus,
    isIncrementEligible,
    commendationMonthsDeducted: commendationMonths,
    penaltyMonthsAdded: penaltyDelayMonths,
    absenceDaysAdded: absenceDays,
    serviceCreditDurationDeducted: {
      years: creditYears,
      months: creditMonths,
      days: creditDays,
    },
    modifiers: {
      commendationMonths,
      penaltyDelayMonths,
      absenceDays,
      serviceCreditMonths: totalCreditMonths,
    },
    deferredItems,
    isSupported: true,
    statusReason,
    appliedCommendationsCount,
    appliedPenaltiesCount,
    appliedAbsenceDays: absenceDays,
  };
}

// ============================================================================
// Main Calculation Logic: Promotion Eligibility (with Service Credit Deferral & Gates)
// ============================================================================

export function calculatePromotionEligibility(
  employee: EmployeeEntity,
  context: EngineContextData = {}
): PromotionEligibilityResult {
  const today = context.today || formatDateString(new Date());
  const gradeNum = parseInt(String(employee.grade)) || 10;

  // 1. Check in-service qualification boundary (المسار الاعتيادي فقط)
  const quals = context.qualifications || [];
  const hasInServiceDegree = quals.some(
    q => (q.qualificationType === 'أثناء الخدمة' || q.qualification_type === 'أثناء الخدمة') && (q.isActive !== false && q.is_active !== false)
  );

  // Check if active degree track snapshot exists for this employee
  const matchingSnapshot = context.degreeTrackSnapshot ||
    (context.degreeTrackSnapshots || []).find(
      s => String(s.employeeId || s.employee_id) === String(employee.id) && (s.status === 'نشط' || !s.status)
    );

  if (hasInServiceDegree && matchingSnapshot) {
    // Import and execute Degree Track Recognition Engine (Phase 2b)
    const { calculateDegreeTrackSimulation } = require('./degreeTrackEngine');
    const simResult = calculateDegreeTrackSimulation(matchingSnapshot, context);
    const rt = simResult.realTimeNextPromotion;

    return {
      nextPromotionDueDate: rt.nextPromotionDueDate,
      baseDueDate: addMonthsToDate(rt.anchorStartDate, rt.baseDurationMonths),
      lastPromotionDate: rt.anchorStartDate,
      requiredYears: 2,
      eligibilityStatus: rt.eligibilityStatus as any,
      isPromotionEligible: rt.isEligible,
      statusReason: rt.statusReason,
      isSupported: true,
      commendationMonthsDeducted: 0,
      penaltyMonthsAdded: rt.penaltiesDelayMonths,
      absenceDaysAdded: rt.absenceDaysAdded,
      serviceCreditDurationDeducted: { years: 0, months: 0, days: 0 },
      modifiers: {
        commendationMonths: 0,
        penaltyDelayMonths: rt.penaltiesDelayMonths,
        absenceDays: rt.absenceDaysAdded,
        serviceCreditMonths: 0,
      },
      gateCheckResults: {
        governingCoursesSatisfied: true,
        missingGoverningCourses: [],
        evaluationsSatisfied: true,
        lastEvaluationsGrades: [],
        activePausingLeave: rt.activePausingLeave,
        noActivePausingLeaves: !rt.activePausingLeave,
        pausingLeaveDetails: null,
      },
      gateChecks: {
        governingCoursesSatisfied: true,
        evaluationsSatisfied: true,
        noActivePausingLeaves: !rt.activePausingLeave,
      },
      deferredItems: [],
      appliedCommendationsCount: 0,
      appliedPenaltiesCount: 0,
      appliedAbsenceDays: rt.absenceDaysAdded,
    };
  }

  if (hasInServiceDegree) {
    return {
      nextPromotionDueDate: null,
      baseDueDate: null,
      lastPromotionDate: employee.lastPromotionDate || employee.last_promotion_date || null,
      requiredYears: null,
      eligibilityStatus: 'غير_مدعوم_حاليا',
      isPromotionEligible: false,
      statusReason: 'الموظف مرتبط بمسار احتساب الشهادات أثناء الخدمة — مسار احتساب الشهادات قيد التطوير في المرحلة القادمة',
      unsupportedReason: 'الموظف مرتبط بمسار احتساب الشهادات أثناء الخدمة — مسار احتساب الشهادات قيد التطوير في المرحلة القادمة',
      isSupported: false,
      commendationMonthsDeducted: 0,
      penaltyMonthsAdded: 0,
      absenceDaysAdded: 0,
      serviceCreditDurationDeducted: { years: 0, months: 0, days: 0 },
      modifiers: {
        commendationMonths: 0,
        penaltyDelayMonths: 0,
        absenceDays: 0,
        serviceCreditMonths: 0,
      },
      gateCheckResults: {
        governingCoursesSatisfied: false,
        missingGoverningCourses: [],
        evaluationsSatisfied: false,
        lastEvaluationsGrades: [],
        activePausingLeave: false,
        noActivePausingLeaves: false,
        pausingLeaveDetails: null,
      },
      gateChecks: {
        governingCoursesSatisfied: false,
        evaluationsSatisfied: false,
        noActivePausingLeaves: false,
      },
      deferredItems: [],
      appliedCommendationsCount: 0,
      appliedPenaltiesCount: 0,
      appliedAbsenceDays: 0,
    };
  }

  // 2. Check top of career ladder (الدرجة الأولى أو الدرجات الخاصة لا تخضع لترفيع اعتيادي أعلى)
  const gradeRules = context.gradeRules || [];
  const foundRule = gradeRules.find(r => r.grade === gradeNum);
  let requiredYears = foundRule !== undefined ? foundRule.promotionYears : (DEFAULT_GRADE_PROMOTION_YEARS[gradeNum] !== undefined ? DEFAULT_GRADE_PROMOTION_YEARS[gradeNum] : (gradeNum >= 2 && gradeNum <= 5 ? 5 : 4));

  if (gradeNum === 1 || gradeNum >= 11 || requiredYears === null) {
    return {
      nextPromotionDueDate: null,
      baseDueDate: null,
      lastPromotionDate: employee.lastPromotionDate || employee.last_promotion_date || null,
      requiredYears: null,
      eligibilityStatus: 'نهاية_السلم_الوظيفي',
      isPromotionEligible: false,
      statusReason: 'الموظف في نهاية السلم الوظيفي للترقيات الاعتيادية (الدرجة الأولى / العليا)',
      isSupported: true,
      commendationMonthsDeducted: 0,
      penaltyMonthsAdded: 0,
      absenceDaysAdded: 0,
      serviceCreditDurationDeducted: { years: 0, months: 0, days: 0 },
      modifiers: {
        commendationMonths: 0,
        penaltyDelayMonths: 0,
        absenceDays: 0,
        serviceCreditMonths: 0,
      },
      gateCheckResults: {
        governingCoursesSatisfied: true,
        missingGoverningCourses: [],
        evaluationsSatisfied: true,
        lastEvaluationsGrades: [],
        activePausingLeave: false,
        noActivePausingLeaves: true,
        pausingLeaveDetails: null,
      },
      gateChecks: {
        governingCoursesSatisfied: true,
        evaluationsSatisfied: true,
        noActivePausingLeaves: true,
      },
      deferredItems: [],
      appliedCommendationsCount: 0,
      appliedPenaltiesCount: 0,
      appliedAbsenceDays: 0,
    };
  }

  // 3. Determine base last promotion date
  const lastPromo =
    employee.lastPromotionDate ||
    employee.last_promotion_date ||
    employee.gradeDate ||
    employee.grade_date ||
    employee.currentAppointmentDate ||
    employee.current_appointment_date ||
    employee.firstAppointmentDate ||
    employee.first_appointment_date ||
    employee.appointmentDate ||
    employee.appointment_date ||
    today;

  // Base rule: last_promotion_date + (required_years * 12 months)
  const baseTotalMonths = requiredYears * 12;
  const baseDueDate = addMonthsToDate(lastPromo, baseTotalMonths);

  // 4. Service Credit Reduction (احتساب الخدمة السابقة / المضافة)
  const serviceCredits = context.serviceCredits || [];
  let creditYears = 0;
  let creditMonths = 0;
  let creditDays = 0;

  serviceCredits.forEach(sc => {
    const isPromotionCounted = sc.isCountedForPromotion !== false && sc.is_counted_for_promotion !== false;
    const purpose = sc.purpose || '';
    const isPensionOnly = purpose === 'تقاعد_فقط' || purpose === 'pension_only';
    if (isPromotionCounted && !isPensionOnly) {
      creditYears += sc.calculatedYears !== undefined ? sc.calculatedYears : (sc.calculated_years !== undefined ? sc.calculated_years : (sc.years || 0));
      creditMonths += sc.calculatedMonths !== undefined ? sc.calculatedMonths : (sc.calculated_months !== undefined ? sc.calculated_months : (sc.months || 0));
      creditDays += sc.calculatedDays !== undefined ? sc.calculatedDays : (sc.calculated_days !== undefined ? sc.calculated_days : (sc.days || 0));
    }
  });

  const totalCreditMonths = creditYears * 12 + creditMonths;

  // Compute the accelerated due date after service credit reduction
  const effectiveMonthsAfterCredit = Math.max(0, baseTotalMonths - totalCreditMonths);
  const creditAdjustedDate = addMonthsToDate(lastPromo, effectiveMonthsAfterCredit);

  // 5. Track items and deferred items for all 5 modifiers
  const deferredItems: DeferredImpactItem[] = [];

  // 6. Evaluate Commendations for Promotion (Modifier 1)
  const commendations = context.commendations || [];
  let commendationMonths = 0;
  let appliedCommendationsCount = 0;

  commendations.forEach(c => {
    const isHidden = c.isHidden === true || c.is_hidden === true;
    if (isHidden) return;
    const orderDate = c.orderDate || c.order_date;
    if (!orderDate || !isDateOnOrAfter(orderDate, lastPromo)) return;

    let months = c.creditMonthsSnapshot !== undefined ? c.creditMonthsSnapshot : c.credit_months_snapshot;
    if (months === undefined || months === null) {
      const impact = c.seniorityImpact || c.seniority_impact || '';
      if (impact.includes('شهرين') || impact.includes('2')) months = 2;
      else if (impact.includes('6') || impact.includes('ستة')) months = 6;
      else if (impact.includes('شهر') || impact.includes('1')) months = 1;
      else months = 0;
    }
    if (months <= 0) return;

    if (totalCreditMonths > 0 && isDateOnOrAfter(orderDate, creditAdjustedDate)) {
      deferredItems.push({
        id: c.id,
        type: 'commendation',
        originalDate: orderDate,
        months,
        creditMonths: months,
        effect: `+${months} شهر قدَم مؤجل لدورة الاستحقاق التالية`,
        reason: `كتاب شكر رقم (${c.orderNumber || c.order_number || '—'}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
        status: 'مؤجل_للدورة_التالية',
        description: `كتاب شكر رقم (${c.orderNumber || c.order_number || '—'}) بتاريخ (${orderDate}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
      });
    } else {
      commendationMonths += months;
      appliedCommendationsCount++;
    }
  });

  // 7. Evaluate Penalties for Promotion (Modifier 2)
  const penalties = context.penalties || [];
  const penaltyTypeMap = context.penaltyTypes || DEFAULT_PENALTY_DELAYS;
  let penaltyDelayMonths = 0;
  let appliedPenaltiesCount = 0;

  penalties.forEach(p => {
    const status = p.status || 'نافذ';
    if (status !== 'نافذ' && status !== 'active') return;
    const pDate = p.penaltyDate || p.penalty_date || p.orderDate || p.order_date;
    if (!pDate || !isDateOnOrAfter(pDate, lastPromo)) return;

    const pType = p.penaltyType || p.penalty_type || '';
    const delay = p.delayMonths !== undefined ? p.delayMonths : (p.delay_months !== undefined ? p.delay_months : (penaltyTypeMap[pType] || 0));
    if (delay <= 0) return;

    if (totalCreditMonths > 0 && isDateOnOrAfter(pDate, creditAdjustedDate)) {
      deferredItems.push({
        id: p.id,
        type: 'penalty',
        originalDate: pDate,
        months: delay,
        effect: `تأخير ${delay} شهر مؤجل لدورة الاستحقاق التالية`,
        reason: `عقوبة (${pType}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
        status: 'مؤجل_للدورة_التالية',
        description: `عقوبة (${pType}) بتاريخ (${pDate}) مؤجلة لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
      });
    } else {
      penaltyDelayMonths += delay;
      appliedPenaltiesCount++;
    }
  });

  // 8. Evaluate Absences for Promotion (Modifier 3)
  const attendances = context.attendances || [];
  let absenceDays = 0;

  attendances.forEach(a => {
    const status = (a.status || '').trim();
    const isAbsence =
      status === 'غائب' ||
      status === 'غياب' ||
      status === 'غياب_بدون_عذر' ||
      status === 'غياب بدون عذر' ||
      status === 'absence';
    if (!isAbsence || !a.date || !isDateOnOrAfter(a.date, lastPromo)) return;

    const count = a.count !== undefined ? a.count : (a.days !== undefined ? a.days : (a.durationDays !== undefined ? a.durationDays : (a.duration_days !== undefined ? a.duration_days : 1)));

    if (totalCreditMonths > 0 && isDateOnOrAfter(a.date, creditAdjustedDate)) {
      deferredItems.push({
        id: a.id,
        type: 'absence',
        originalDate: a.date,
        days: count,
        effect: `${count} يوم غياب مؤجل لدورة الاستحقاق التالية`,
        reason: `غياب (${count}) يوم مؤجل لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي بالخدمة المحتسبة.`,
        status: 'مؤجل_للدورة_التالية',
        description: `غياب (${count}) يوم بتاريخ (${a.date}) مؤجل لدورة الاستحقاق التالية لاكتمال الاستحقاق الحالي بالخدمة المحتسبة.`,
      });
    } else {
      absenceDays += count;
    }
  });

  // 9. Calculate Final Next Promotion Due Date
  // Final Due Date = lastPromo + (Required Months - Service Credit Months - Commendation Months + Penalty Months) + Absence Days
  const effectiveNetMonths = Math.max(0, baseTotalMonths - totalCreditMonths - commendationMonths + penaltyDelayMonths);
  let finalDueDate = addMonthsToDate(lastPromo, effectiveNetMonths);
  if (creditDays > 0) {
    finalDueDate = addDaysToDate(finalDueDate, -creditDays);
  }
  if (absenceDays > 0) {
    finalDueDate = addDaysToDate(finalDueDate, absenceDays);
  }

  // 10. Gate Conditions (الشروط الحاكمة الإلزامية للترفيع) - with cutoffDate for Evaluations & Leaves (Modifiers 4 & 5)
  const cutoffDate = totalCreditMonths > 0 ? creditAdjustedDate : undefined;
  const gateCheckResults = checkGateConditions(employee, context, cutoffDate, deferredItems);

  // 11. Final Status Resolution
  const isTimeEligible = isDateOnOrAfter(today, finalDueDate);
  let eligibilityStatus: PromotionEligibilityResult['eligibilityStatus'] = 'مؤهل';
  let statusReason = '';
  let isPromotionEligible = false;

  if (gateCheckResults.activePausingLeave) {
    eligibilityStatus = 'موقوف_بإجازة';
    statusReason = `الترفيع موقوف لوجود الموظف في (${gateCheckResults.pausingLeaveDetails?.leaveType}) حتى تاريخ (${gateCheckResults.pausingLeaveDetails?.endDate})`;
    isPromotionEligible = false;
  } else if (!gateCheckResults.evaluationsSatisfied) {
    eligibilityStatus = 'متوقف_بسبب_التقييم';
    statusReason = `الترفيع متوقف إدارياً بسبب تقييم الأداء: ${gateCheckResults.evaluationBlockReason}`;
    isPromotionEligible = false;
  } else if (!gateCheckResults.governingCoursesSatisfied) {
    eligibilityStatus = 'مؤجل_لعدم_استيفاء_الدورات';
    statusReason = `الترفيع مؤجل لعدم اجتياز الدورات التدريبية الحاكمة للدرجة: (${gateCheckResults.missingGoverningCourses.join('، ')})`;
    isPromotionEligible = false;
  } else if (isTimeEligible) {
    eligibilityStatus = 'مستحق_للترفيع';
    statusReason = 'الموظف مستوفٍ لكافة الشروط القانونية والزمنية واستحقاق الترفيع نافذ';
    isPromotionEligible = true;
  } else {
    eligibilityStatus = 'مؤهل';
    statusReason = `الموظف مستوفٍ للشروط ومؤهل للترفيع بتاريخ الاستحقاق (${finalDueDate})`;
    isPromotionEligible = true;
  }

  return {
    nextPromotionDueDate: finalDueDate,
    baseDueDate,
    lastPromotionDate: lastPromo,
    requiredYears,
    eligibilityStatus,
    isPromotionEligible,
    statusReason,
    isSupported: true,
    commendationMonthsDeducted: commendationMonths,
    penaltyMonthsAdded: penaltyDelayMonths,
    absenceDaysAdded: absenceDays,
    serviceCreditDurationDeducted: {
      years: creditYears,
      months: creditMonths,
      days: creditDays,
    },
    modifiers: {
      commendationMonths,
      penaltyDelayMonths,
      absenceDays,
      serviceCreditMonths: totalCreditMonths,
    },
    gateCheckResults,
    gateChecks: {
      governingCoursesSatisfied: gateCheckResults.governingCoursesSatisfied,
      evaluationsSatisfied: gateCheckResults.evaluationsSatisfied,
      noActivePausingLeaves: gateCheckResults.noActivePausingLeaves ?? !gateCheckResults.activePausingLeave,
    },
    deferredItems,
    appliedCommendationsCount,
    appliedPenaltiesCount,
    appliedAbsenceDays: absenceDays,
  };
}

export function isEmployeeEligibleForPromotion(
  employee: EmployeeEntity,
  context: EngineContextData = {}
): boolean {
  const result = calculatePromotionEligibility(employee, context);
  return Boolean(result.isPromotionEligible);
}

// ============================================================================
// Central Synchronous & Real-Time Orchestrator
// ============================================================================

export function recalculateEligibilitySync(
  employee: EmployeeEntity,
  context: EngineContextData = {}
): FullEligibilityResponse {
  const incrResult = calculateIncrementEligibility(employee, context);
  const promoResult = calculatePromotionEligibility(employee, context);

  const isSupported = incrResult.isSupported && promoResult.isSupported;
  const unsupportedReason = !isSupported
    ? (incrResult.statusReason || promoResult.statusReason)
    : undefined;

  return {
    employeeId: employee.id,
    employeeName: employee.fullName || employee.full_name || employee.name || `موظف #${employee.id}`,
    grade: parseInt(String(employee.grade)) || 10,
    step: parseInt(String(employee.step)) || 1,
    isSupported,
    unsupportedReason,
    increment: incrResult,
    promotion: promoResult,
    calculatedAt: new Date().toISOString(),
  };
}
