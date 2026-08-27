/**
 * src/lib/promotionEngine.ts
 * ============================================================================
 * محرك احتساب استحقاق العلاوات السنوية والترقيات والترفيعات (المسار الاعتيادي)
 * وفق قانون الخدمة المدنية العراقي وسلم رواتب 2023 الموحد.
 * ============================================================================
 * 
 * القواعد الصارمة للمرحلة 2أ:
 * 1. المسار الاعتيادي فقط: إذا كان الموظف حاصلاً على شهادة أثناء الخدمة
 *    (qualification_type === 'أثناء الخدمة')، يتم استثناؤه مؤقتاً وتعيين حالته
 *    كـ "غير_مدعوم_حاليا" لحين بناء مسار احتساب الشهادات بالمرحلة اللاحقة.
 * 2. المحرك يحسب فقط ولا يغير الدرجة (grade) أو المرحلة (step) إطلاقاً.
 * 3. الحساب آني (Real-time) وقابل للاستدعاء الفوري عبر recalculateEligibility.
 * 4. مبدأ ثبات تاريخ الاستحقاق: تاريخ الاستحقاق القانوني يبقى ثابتاً كنقطة انطلاق
 *    للدورة التالية حتى وإن تأخر صدور الأمر الإداري إدارياً.
 * 5. نقل أثر الخدمة المحتسبة: أي مؤثر (كتاب شكر، عقوبة، إلخ) يقع تاريخه بعد
 *    تاريخ الاستحقاق الجديد المخفض بالخدمة يُرحل تلقائياً كـ "مؤجل للدورة القادمة".
 */

// Types & Interfaces
export interface EmployeeEntity {
  id: number | string;
  fullName?: string;
  full_name?: string;
  name?: string;
  grade: number;
  step: number;
  gradeDate?: string | null;
  grade_date?: string | null;
  lastPromotionDate?: string | null;
  last_promotion_date?: string | null;
  lastIncrementDate?: string | null;
  last_increment_date?: string | null;
  nextPromotionDueDate?: string | null;
  next_promotion_due_date?: string | null;
  nextIncrementDueDate?: string | null;
  next_increment_due_date?: string | null;
  currentAppointmentDate?: string | null;
  current_appointment_date?: string | null;
  firstAppointmentDate?: string | null;
  first_appointment_date?: string | null;
  appointmentDate?: string | null;
  appointment_date?: string | null;
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
  orderNumber?: string;
  order_number?: string;
  orderDate?: string;
  order_date?: string;
  purpose?: string; // 'علاوة_وترفيع', 'تقاعد_فقط', 'علاوة_فقط'
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
  today?: string; // YYYY-MM-DD for deterministic testing
}

export interface DeferredImpactItem {
  type: 'commendation' | 'penalty' | 'absence' | 'service_credit';
  originalDate: string;
  effect: string;
  description: string;
  months?: number;
  days?: number;
}

export interface IncrementEligibilityResult {
  nextIncrementDueDate: string | null;
  baseDueDate: string | null;
  lastIncrementDate: string | null;
  eligibilityStatus: 'مستحق_للعلاوة' | 'غير_مستحق_حاليا' | 'متوقف_بعقوبة' | 'غير_مدعوم_حاليا' | 'نهاية_المرحلة';
  commendationMonthsDeducted: number;
  penaltyMonthsAdded: number;
  absenceDaysAdded: number;
  isSupported: boolean;
  statusReason?: string;
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
    | 'غير_مستحق_حالياً'
    | 'مؤجل_لعدم_استيفاء_الدورات'
    | 'متوقف_بسبب_التقييم'
    | 'موقوف_بإجازة'
    | 'نهاية_السلم_الوظيفي'
    | 'غير_مدعوم_حاليا';
  statusReason?: string;
  isSupported: boolean;
  commendationMonthsDeducted: number;
  penaltyMonthsAdded: number;
  absenceDaysAdded: number;
  serviceCreditDurationDeducted: {
    years: number;
    months: number;
    days: number;
  };
  gateCheckResults: PromotionGateCheckResults;
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

export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean) return null;
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMonthsToDate(dateStr: string, months: number): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  const target = new Date(d.getTime());
  target.setMonth(target.getMonth() + months);
  return formatDateString(target);
}

export function addDaysToDate(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  const target = new Date(d.getTime());
  target.setDate(target.getDate() + days);
  return formatDateString(target);
}

export function subMonthsFromDate(dateStr: string, months: number): string {
  return addMonthsToDate(dateStr, -months);
}

export function isDateOnOrAfter(dateStrA: string, dateStrB: string): boolean {
  const a = parseDate(dateStrA);
  const b = parseDate(dateStrB);
  if (!a || !b) return false;
  return a.getTime() >= b.getTime();
}

export function isDateBetween(targetDate: string, startDate: string, endDate: string): boolean {
  const t = parseDate(targetDate);
  const s = parseDate(startDate);
  const e = parseDate(endDate);
  if (!t || !s || !e) return false;
  return t.getTime() >= s.getTime() && t.getTime() <= e.getTime();
}

// Standard Iraqi Fallback Penalty Delays
const DEFAULT_PENALTY_DELAYS: Record<string, number> = {
  'لفت نظر': 0,
  'إنذار': 3,
  'إنذار خطي': 3,
  'قطع راتب': 0,
  'توبيخ': 6,
  'إنقاص راتب': 12,
  'تنزيل درجة': 24,
  'فصل': 0,
  'عزل': 0,
};

// Standard Iraqi Fallback Grade Promotion Years
const DEFAULT_GRADE_PROMOTION_YEARS: Record<number, number | null> = {
  1: null,
  2: 5,
  3: 5,
  4: 5,
  5: 5,
  6: 4,
  7: 4,
  8: 4,
  9: 4,
  10: 4,
  11: null,
  12: null,
  13: null,
};

// ============================================================================
// Main Calculation Logic: Increment Eligibility
// ============================================================================

export function calculateIncrementEligibility(
  employee: EmployeeEntity,
  context: EngineContextData = {}
): IncrementEligibilityResult {
  const today = context.today || formatDateString(new Date());

  // 1. Check in-service qualification boundary (المسار الاعتيادي فقط)
  const quals = context.qualifications || [];
  const hasInServiceDegree = quals.some(
    q => (q.qualificationType === 'أثناء الخدمة' || q.qualification_type === 'أثناء الخدمة')
  );

  if (hasInServiceDegree) {
    return {
      nextIncrementDueDate: null,
      baseDueDate: null,
      lastIncrementDate: employee.lastIncrementDate || employee.last_increment_date || null,
      eligibilityStatus: 'غير_مدعوم_حاليا',
      commendationMonthsDeducted: 0,
      penaltyMonthsAdded: 0,
      absenceDaysAdded: 0,
      isSupported: false,
      statusReason: 'الموظف مرتبط بمسار احتساب شهادة أثناء الخدمة — مسار احتساب الشهادات قيد التطوير في المرحلة القادمة',
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
  const baseDueDate = addMonthsToDate(lastIncr, 12);

  // 3. Modifiers: Commendations since lastIncrementDate
  const commendations = context.commendations || [];
  let commendationMonths = 0;
  let appliedCommendationsCount = 0;

  commendations.forEach(c => {
    const isHidden = c.isHidden === true || c.is_hidden === true;
    if (isHidden) return;
    const orderDate = c.orderDate || c.order_date;
    if (orderDate && isDateOnOrAfter(orderDate, lastIncr)) {
      let months = c.creditMonthsSnapshot || c.credit_months_snapshot;
      if (months === undefined || months === null) {
        // Parse from seniority impact text if snapshot is missing
        const impact = c.seniorityImpact || c.seniority_impact || '';
        if (impact.includes('شهرين') || impact.includes('2')) months = 2;
        else if (impact.includes('6') || impact.includes('ستة')) months = 6;
        else if (impact.includes('شهر') || impact.includes('1')) months = 1;
        else months = 0;
      }
      commendationMonths += months;
      appliedCommendationsCount++;
    }
  });

  // 4. Modifiers: Penalties delay since lastIncrementDate
  const penalties = context.penalties || [];
  const penaltyTypeMap = context.penaltyTypes || DEFAULT_PENALTY_DELAYS;
  let penaltyDelayMonths = 0;
  let appliedPenaltiesCount = 0;

  penalties.forEach(p => {
    const status = p.status || 'نافذ';
    if (status !== 'نافذ' && status !== 'active') return;
    const pDate = p.penaltyDate || p.penalty_date;
    if (pDate && isDateOnOrAfter(pDate, lastIncr)) {
      const pType = p.penaltyType || p.penalty_type || '';
      const delay = p.delayMonths !== undefined ? p.delayMonths : (p.delay_months !== undefined ? p.delay_months : (penaltyTypeMap[pType] || 0));
      penaltyDelayMonths += delay;
      if (delay > 0) appliedPenaltiesCount++;
    }
  });

  // 5. Modifiers: Attendance Absences since lastIncrementDate (exact days, not rounded)
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
    if (isAbsence && a.date && isDateOnOrAfter(a.date, lastIncr)) {
      absenceDays += 1;
    }
  });

  // 6. Calculate Final Next Increment Due Date
  // Next Date = Base (12m) - Commendations (m) + Penalties (m) + Absences (exact days)
  let computedDate = addMonthsToDate(lastIncr, 12 - commendationMonths + penaltyDelayMonths);
  if (absenceDays > 0) {
    computedDate = addDaysToDate(computedDate, absenceDays);
  }

  // 7. Determine Increment Eligibility Status
  let eligibilityStatus: IncrementEligibilityResult['eligibilityStatus'] = 'غير_مستحق_حاليا';
  let statusReason = '';

  if (penaltyDelayMonths > 0 && isDateOnOrAfter(computedDate, today)) {
    eligibilityStatus = 'متوقف_بعقوبة';
    statusReason = `العلاوة مؤخرة لمدة ${penaltyDelayMonths} شهر بسبب عقوبة إدارية نافذة`;
  } else if (isDateOnOrAfter(today, computedDate)) {
    eligibilityStatus = 'مستحق_للعلاوة';
    statusReason = 'استوفى الموظف المدة الزمنية المستحقة للعلاوة السنوية';
  } else {
    eligibilityStatus = 'غير_مستحق_حاليا';
    statusReason = 'لم يحن تاريخ استحقاق العلاوة السنوية بعد';
  }

  return {
    nextIncrementDueDate: computedDate,
    baseDueDate,
    lastIncrementDate: lastIncr,
    eligibilityStatus,
    commendationMonthsDeducted: commendationMonths,
    penaltyMonthsAdded: penaltyDelayMonths,
    absenceDaysAdded: absenceDays,
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
    q => (q.qualificationType === 'أثناء الخدمة' || q.qualification_type === 'أثناء الخدمة')
  );

  if (hasInServiceDegree) {
    return {
      nextPromotionDueDate: null,
      baseDueDate: null,
      lastPromotionDate: employee.lastPromotionDate || employee.last_promotion_date || null,
      requiredYears: null,
      eligibilityStatus: 'غير_مدعوم_حاليا',
      statusReason: 'الموظف مرتبط بمسار احتساب شهادة أثناء الخدمة — مسار احتساب الشهادات قيد التطوير في المرحلة القادمة',
      isSupported: false,
      commendationMonthsDeducted: 0,
      penaltyMonthsAdded: 0,
      absenceDaysAdded: 0,
      serviceCreditDurationDeducted: { years: 0, months: 0, days: 0 },
      gateCheckResults: {
        governingCoursesSatisfied: false,
        missingGoverningCourses: [],
        evaluationsSatisfied: false,
        lastEvaluationsGrades: [],
        activePausingLeave: false,
        pausingLeaveDetails: null,
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
      statusReason: 'الموظف في نهاية السلم الوظيفي للترقيات الاعتيادية (الدرجة الأولى / العليا)',
      isSupported: true,
      commendationMonthsDeducted: 0,
      penaltyMonthsAdded: 0,
      absenceDaysAdded: 0,
      serviceCreditDurationDeducted: { years: 0, months: 0, days: 0 },
      gateCheckResults: {
        governingCoursesSatisfied: true,
        missingGoverningCourses: [],
        evaluationsSatisfied: true,
        lastEvaluationsGrades: [],
        activePausingLeave: false,
        pausingLeaveDetails: null,
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
      creditYears += sc.calculatedYears || sc.calculated_years || 0;
      creditMonths += sc.calculatedMonths || sc.calculated_months || 0;
      creditDays += sc.calculatedDays || sc.calculated_days || 0;
    }
  });

  const totalCreditMonths = creditYears * 12 + creditMonths;
  // Calculate the nominal accelerated due date resulting strictly from the service credit reduction
  let creditAdjustedDate = addMonthsToDate(lastPromo, Math.max(0, baseTotalMonths - totalCreditMonths));
  if (creditDays > 0) {
    creditAdjustedDate = addDaysToDate(creditAdjustedDate, -creditDays);
  }

  /**
   * =========================================================================
   * 5. CRITICAL LOGIC: Service Credit Deferral (ترحيل ونقل أثر الفترة المختصرة)
   * =========================================================================
   * عندما تُحتسب خدمة للموظف (Service Credit)، فإنها تُقرّب تاريخ الاستحقاق
   * من (baseDueDate) إلى (creditAdjustedDate).
   * 
   * الفترة الواقعة بين (creditAdjustedDate) و (baseDueDate) هي "الفترة التي تم
   * اختصارها وتجاوزها قانونياً".
   * 
   * أي كتاب شكر أو عقوبة أو غياب أو تقييم يقع تاريخ أمره بعد (creditAdjustedDate):
   * لا يجوز تطبيق أثره على الدورة الحالية لأن استحقاق هذه الدورة قد تحقق بالفعل
   * بالخدمة المحتسبة، وتطبيقه هنا يمثل هدراً لحق الموظف أو أثراً غير قانوني.
   * 
   * بدلاً من ذلك، يتم تسجيل هذا الأثر في قائمة (deferredItems) وترحيله ليُطبَّق
   * تلقائياً في دورة الترفيع التالية (Next Promotion Cycle)!
   */
  const deferredItems: DeferredImpactItem[] = [];

  // 6. Evaluate Commendations for Promotion
  const commendations = context.commendations || [];
  let commendationMonths = 0;
  let appliedCommendationsCount = 0;

  commendations.forEach(c => {
    const isHidden = c.isHidden === true || c.is_hidden === true;
    if (isHidden) return;
    const orderDate = c.orderDate || c.order_date;
    if (!orderDate || !isDateOnOrAfter(orderDate, lastPromo)) return;

    let months = c.creditMonthsSnapshot || c.credit_months_snapshot;
    if (months === undefined || months === null) {
      const impact = c.seniorityImpact || c.seniority_impact || '';
      if (impact.includes('شهرين') || impact.includes('2')) months = 2;
      else if (impact.includes('6') || impact.includes('ستة')) months = 6;
      else if (impact.includes('شهر') || impact.includes('1')) months = 1;
      else months = 0;
    }
    if (months <= 0) return;

    // Check if this commendation falls within the shortened window (after creditAdjustedDate)
    if (totalCreditMonths > 0 && isDateOnOrAfter(orderDate, creditAdjustedDate)) {
      deferredItems.push({
        type: 'commendation',
        originalDate: orderDate,
        months,
        effect: `+${months} شهر قدَم مؤجل للدورة التالية`,
        description: `كتاب شكر رقم (${c.orderNumber || c.order_number || '—'}) بتاريخ (${orderDate}) مؤجل للترفيع القادم لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
      });
    } else {
      commendationMonths += months;
      appliedCommendationsCount++;
    }
  });

  // 7. Evaluate Penalties for Promotion
  const penalties = context.penalties || [];
  const penaltyTypeMap = context.penaltyTypes || DEFAULT_PENALTY_DELAYS;
  let penaltyDelayMonths = 0;
  let appliedPenaltiesCount = 0;

  penalties.forEach(p => {
    const status = p.status || 'نافذ';
    if (status !== 'نافذ' && status !== 'active') return;
    const pDate = p.penaltyDate || p.penalty_date;
    if (!pDate || !isDateOnOrAfter(pDate, lastPromo)) return;

    const pType = p.penaltyType || p.penalty_type || '';
    const delay = p.delayMonths !== undefined ? p.delayMonths : (p.delay_months !== undefined ? p.delay_months : (penaltyTypeMap[pType] || 0));
    if (delay <= 0) return;

    if (totalCreditMonths > 0 && isDateOnOrAfter(pDate, creditAdjustedDate)) {
      deferredItems.push({
        type: 'penalty',
        originalDate: pDate,
        months: delay,
        effect: `تأخير ${delay} شهر مؤجل للدورة التالية`,
        description: `عقوبة (${pType}) بتاريخ (${pDate}) مؤجلة لدورة الترفيع التالية لاكتمال الاستحقاق الحالي باحتساب الخدمة.`,
      });
    } else {
      penaltyDelayMonths += delay;
      appliedPenaltiesCount++;
    }
  });

  // 8. Evaluate Absences for Promotion
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

    if (totalCreditMonths > 0 && isDateOnOrAfter(a.date, creditAdjustedDate)) {
      deferredItems.push({
        type: 'absence',
        originalDate: a.date,
        days: 1,
        effect: 'يوم غياب مؤجل للدورة التالية',
        description: `غياب يوم (${a.date}) مؤجل للدورة التالية لاكتمال الاستحقاق الحالي بالخدمة المحتسبة.`,
      });
    } else {
      absenceDays += 1;
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

  // =========================================================================
  // 10. Gate Conditions (الشروط الحاكمة الإلزامية للترفيع)
  // =========================================================================

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
      const cStatus = progress[cName]?.status;
      if (cStatus !== 'ناجح' && cStatus !== 'معفى' && cStatus !== 'اجتاز') {
        governingCoursesSatisfied = false;
        missingGoverningCourses.push(cName);
      }
    });
  }

  // B. Performance Evaluations Gate (تقييم الأداء لآخر سنتين)
  const evaluations = (context.evaluations || [])
    .filter(ev => ev.grade || ev.totalScore !== undefined || ev.total_score !== undefined)
    .sort((a, b) => {
      const yrA = parseInt(String(a.year)) || 0;
      const yrB = parseInt(String(b.year)) || 0;
      return yrB - yrA;
    });

  const lastTwoEvaluations = evaluations.slice(0, 2);
  let evaluationsSatisfied = true;
  let evaluationBlockReason = '';
  const lastEvaluationsGrades: string[] = [];

  lastTwoEvaluations.forEach(ev => {
    const g = (ev.grade || '').trim();
    const score = ev.totalScore !== undefined ? ev.totalScore : (ev.total_score !== undefined ? ev.total_score : (parseInt(String(ev.score)) || 100));
    lastEvaluationsGrades.push(g || `${score}%`);
    if (g === 'مقبول' || g === 'ضعيف' || g === 'غير مرضي' || score < 60) {
      evaluationsSatisfied = false;
      evaluationBlockReason = `حصول الموظف على تقييم (${g || score + '%'}) في تقييم أداء سنة (${ev.year || '—'})`;
    }
  });

  // C. Pausing Leave Gate (الإجازات الموقفة للترفيع حالياً)
  const leaves = context.leaves || [];
  let activePausingLeave = false;
  let pausingLeaveDetails: PromotionGateCheckResults['pausingLeaveDetails'] = null;

  leaves.forEach(lv => {
    const adminEffect = lv.administrativeEffect || lv.administrative_effect || '';
    const isPausing = adminEffect === 'يوقف_الترفيع' || adminEffect === 'pause_promotion';
    const sDate = lv.startDate || lv.start_date || '';
    const eDate = lv.endDate || lv.end_date || '';
    if (isPausing && sDate && eDate && isDateBetween(today, sDate, eDate)) {
      activePausingLeave = true;
      pausingLeaveDetails = {
        leaveType: lv.leaveType || lv.leave_type || 'إجازة موقفة للترفيع',
        startDate: sDate,
        endDate: eDate,
      };
    }
  });

  // =========================================================================
  // 11. Final Status Resolution
  // =========================================================================
  const isTimeEligible = isDateOnOrAfter(today, finalDueDate);
  let eligibilityStatus: PromotionEligibilityResult['eligibilityStatus'] = 'غير_مستحق_حالياً';
  let statusReason = '';

  if (activePausingLeave) {
    eligibilityStatus = 'موقوف_بإجازة';
    statusReason = `الترفيع موقوف لوجود الموظف في (${pausingLeaveDetails?.leaveType}) حتى تاريخ (${pausingLeaveDetails?.endDate})`;
  } else if (!evaluationsSatisfied) {
    eligibilityStatus = 'متوقف_بسبب_التقييم';
    statusReason = `الترفيع متوقف إدارياً بسبب تقييم الأداء: ${evaluationBlockReason}`;
  } else if (!governingCoursesSatisfied) {
    eligibilityStatus = 'مؤجل_لعدم_استيفاء_الدورات';
    statusReason = `الترفيع مؤجل لعدم اجتياز الدورات التدريبية الحاكمة للدرجة: (${missingGoverningCourses.join('، ')})`;
  } else if (isTimeEligible) {
    eligibilityStatus = 'مستحق_للترفيع';
    statusReason = 'الموظف مستوفٍ لكافة الشروط القانونية والزمنية واستحقاق الترفيع نافذ';
  } else {
    eligibilityStatus = 'غير_مستحق_حالياً';
    statusReason = `الموظف غير مستحق حالياً، تاريخ الاستحقاق القادم هو (${finalDueDate})`;
  }

  return {
    nextPromotionDueDate: finalDueDate,
    baseDueDate,
    lastPromotionDate: lastPromo,
    requiredYears,
    eligibilityStatus,
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
    gateCheckResults: {
      governingCoursesSatisfied,
      missingGoverningCourses,
      evaluationsSatisfied,
      lastEvaluationsGrades,
      evaluationBlockReason: evaluationBlockReason || undefined,
      activePausingLeave,
      pausingLeaveDetails,
    },
    deferredItems,
    appliedCommendationsCount,
    appliedPenaltiesCount,
    appliedAbsenceDays: absenceDays,
  };
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
