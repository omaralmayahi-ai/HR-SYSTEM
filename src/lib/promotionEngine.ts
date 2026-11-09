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

import { calculateDegreeTrackSimulation } from './degreeTrackEngine';

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
  penaltyTypes?: PenaltyTypesInput; // خريطة { 'إنذار': 6 } أو سجلات penalty_types من الإعدادات
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
  gradeRequirements?: Record<string, any[]>;
  trainingCourses?: any[];
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
  eligibilityStatus: 'مستحق_للعلاوة' | 'مؤهل' | 'غير_مستحق_حاليا' | 'متوقف_بعقوبة' | 'موقوف_بإجازة' | 'غير_مدعوم_حاليا' | 'نهاية_المرحلة' | 'بيانات_ناقصة';
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
  blockingLeaveDaysAdded?: number;
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
    | 'غير_مدعوم_حاليا'
    | 'بيانات_ناقصة';
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
  blockingLeaveDaysAdded?: number;
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
  grade: number | null;
  step: number | null;
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
// Shared rule helpers (العقوبات، الإجازات، الخدمة المحتسبة)
// ============================================================================

export interface PenaltyTypeSetting {
  id?: number | string;
  name: string;
  delayMonths?: number | null;
  delay_months?: number | null;
  salaryDeductionDays?: number | null;
  salary_deduction_days?: number | null;
  status?: string;
  [key: string]: any;
}

/** يقبل خريطة {الاسم: أشهر التأخير} أو مصفوفة سجلات penalty_types من قاعدة البيانات */
export type PenaltyTypesInput = Record<string, number> | PenaltyTypeSetting[] | undefined | null;

function normalizePenaltyName(name: string): string {
  return String(name || '')
    .replace(/\(.*?\)/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^ال/, '');
}

export function isSalaryCutPenalty(name: string): boolean {
  return normalizePenaltyName(name).startsWith('قطع') && normalizePenaltyName(name).includes('راتب');
}

export function isDemotionPenalty(name: string): boolean {
  return normalizePenaltyName(name).startsWith('تنزيل');
}

/** حد أدنى لتأخير قطع الراتب (5 أشهر حتى 5 أيام قطع) */
export const SALARY_CUT_BASE_DELAY_MONTHS = 5;
export const SALARY_CUT_BASE_DAYS = 5;

/**
 * تأخير عقوبة قطع الراتب حسب عدد أيام القطع — قانون انضباط موظفي الدولة 14/1991 م8/ثالثاً:
 * 5 أشهر إن لم يتجاوز القطع 5 أيام، ويُزاد شهر عن كل يوم يتجاوز الخمسة.
 * أي: التأخير = 5 + max(0, الأيام − 5).
 * «يُتحقق»: المعادلة مأخوذة من مصدر ثانوي (محاماة نت، مراجعة R2/R3) ولم يُطابق النص الرسمي في الوقائع العراقية.
 */
export function salaryCutDelayMonths(days: number | null | undefined): number {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return SALARY_CUT_BASE_DELAY_MONTHS;
  return SALARY_CUT_BASE_DELAY_MONTHS + Math.max(0, Math.ceil(d) - SALARY_CUT_BASE_DAYS);
}

function lookupPenaltyType(pType: string, penaltyTypes: PenaltyTypesInput): { delayMonths?: number; deductionDays?: number } | null {
  const target = normalizePenaltyName(pType);
  if (!target) return null;
  if (Array.isArray(penaltyTypes)) {
    const found = penaltyTypes.find(t => normalizePenaltyName(t?.name) === target);
    if (!found) return null;
    const dm = found.delayMonths ?? found.delay_months;
    const dd = found.salaryDeductionDays ?? found.salary_deduction_days;
    return {
      delayMonths: dm === null || dm === undefined ? undefined : Number(dm),
      deductionDays: dd === null || dd === undefined ? undefined : Number(dd),
    };
  }
  const map = penaltyTypes || DEFAULT_PENALTY_DELAYS;
  if (map[pType] !== undefined) return { delayMonths: Number(map[pType]) };
  const key = Object.keys(map).find(k => normalizePenaltyName(k) === target);
  return key !== undefined ? { delayMonths: Number(map[key]) } : null;
}

/** هل العقوبة نافذة الأثر؟ (نافذ، ولم يُقبل الطعن بها) */
export function isPenaltyInEffect(p: PenaltyRecord): boolean {
  const status = String(p.status || 'نافذ').trim();
  if (status !== 'نافذ' && status !== 'active') return false;
  const appeal = String(p.appealStatus || p.appeal_status || '').trim();
  if (appeal && appeal.includes('مقبول') && !appeal.includes('غير')) return false;
  if (appeal === 'accepted') return false;
  return true;
}

/**
 * أشهر التأخير التي ترتبها العقوبة على العلاوة/الترفيع.
 * - تنزيل الدرجة: ليس تأخيراً (يُنفَّذ كحركة تُنزل الراتب) ⇒ 0 هنا.
 * - قطع الراتب: يتدرج بعدد أيام القطع (م8/ثالثاً).
 * - غير ذلك: قيمة السجل نفسه إن وُجدت، ثم إعدادات أنواع العقوبات، ثم الجدول الافتراضي.
 */
export function resolvePenaltyDelayMonths(p: PenaltyRecord, penaltyTypes?: PenaltyTypesInput): number {
  const pType = String(p.penaltyType || p.penalty_type || '');
  if (isDemotionPenalty(pType)) return 0;

  const setting = lookupPenaltyType(pType, penaltyTypes) || (Array.isArray(penaltyTypes) ? lookupPenaltyType(pType, DEFAULT_PENALTY_DELAYS) : null);

  if (isSalaryCutPenalty(pType)) {
    const recDays = p.salaryDeductionDays ?? p.salary_deduction_days ?? p.daysCount ?? p.days_count ?? p.deductionDays ?? p.deduction_days;
    const days = recDays !== undefined && recDays !== null && Number(recDays) > 0 ? Number(recDays) : setting?.deductionDays;
    return salaryCutDelayMonths(days);
  }

  const own = p.delayMonths !== undefined && p.delayMonths !== null ? p.delayMonths : p.delay_months;
  if (own !== undefined && own !== null && !Number.isNaN(Number(own))) return Number(own);
  return setting?.delayMonths && setting.delayMonths > 0 ? setting.delayMonths : 0;
}

/** حالات الإجازة المعتمدة (توحيد المفردات: الواجهة «معتمد»، الخادم «مقبولة»، قديماً «موافق_عليها») */
export function isApprovedLeaveStatus(status: any): boolean {
  const s = String(status ?? '').trim();
  if (!s) return true;
  return ['معتمد', 'معتمدة', 'مقبولة', 'مقبول', 'موافق_عليها', 'موافق عليها', 'ساري', 'نشط', 'approved'].includes(s);
}

function isUnpaidLeave(lv: LeaveRecord): boolean {
  const pay = String(lv.salaryPaymentType || lv.salary_payment_type || lv.financialEffect || lv.financial_effect || '');
  const name = String(lv.leaveType || lv.leave_type || '');
  return pay === 'بدون_راتب' || name.includes('بدون راتب');
}

export function isLeaveBlocking(lv: LeaveRecord, target: 'increment' | 'promotion'): boolean {
  const adminEffect = String(lv.administrativeEffect || lv.administrative_effect || '');
  if (isUnpaidLeave(lv)) return true;
  if (Boolean(lv.affectsPromotion ?? lv.affects_promotion)) return true;
  if (adminEffect === 'يوقف_الترفيع' || adminEffect === 'pause_promotion' || adminEffect.includes('الترفيع')) return true;
  if (target === 'increment') {
    if (Boolean(lv.affectsIncrement ?? lv.affects_increment)) return true;
    if (adminEffect === 'يوقف_العلاوة_والترفيع' || adminEffect.includes('العلاوة')) return true;
  }
  return false;
}

function daysInclusive(startStr: string, endStr: string): number {
  const ms = parseDateString(endStr).getTime() - parseDateString(startStr).getTime();
  return Math.floor(ms / 86400000) + 1;
}

/**
 * أيام الإجازات الموقفة (بدون راتب أو ذات أثر يوقف العلاوة/الترفيع) الواقعة بعد بداية الدورة:
 * لا تُحسب خدمةً، فتُضاف إلى تاريخ الاستحقاق بعدد أيامها (R2 #6، R3 #9).
 * الإجازة التي تبدأ بعد تاريخ القطع (cutoff) تؤجل للدورة التالية.
 */
export function computeBlockingLeaveExtension(
  leaves: LeaveRecord[],
  anchorDate: string,
  target: 'increment' | 'promotion',
  cutoffDate?: string
): { days: number; leaves: Array<{ id?: any; leaveType: string; startDate: string; endDate: string; days: number }> } {
  let total = 0;
  const applied: Array<{ id?: any; leaveType: string; startDate: string; endDate: string; days: number }> = [];
  (leaves || []).forEach(lv => {
    if (!isLeaveBlocking(lv, target) || !isApprovedLeaveStatus(lv.status)) return;
    const sDate = lv.startDate || lv.start_date || '';
    const eDate = lv.endDate || lv.end_date || '';
    if (!sDate || !eDate) return;
    if (!isDateOnOrAfter(eDate, anchorDate)) return; // انتهت قبل بداية الدورة
    if (cutoffDate && isDateOnOrAfter(sDate, cutoffDate)) return; // مؤجلة للدورة التالية
    const from = isDateOnOrAfter(sDate, anchorDate) ? sDate : anchorDate;
    const d = daysInclusive(from, eDate);
    if (d <= 0) return;
    total += d;
    applied.push({ id: lv.id, leaveType: String(lv.leaveType || lv.leave_type || 'إجازة موقفة'), startDate: sDate, endDate: eDate, days: d });
  });
  return { days: total, leaves: applied };
}

function creditPart(sc: ServiceCreditRecord, camel: 'calculatedYears' | 'calculatedMonths' | 'calculatedDays', snake: string, plain: string): number {
  const v = sc[camel] !== undefined && sc[camel] !== null ? sc[camel] : (sc[snake] !== undefined && sc[snake] !== null ? sc[snake] : sc[plain]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function serviceCreditAppliesTo(sc: ServiceCreditRecord, target: 'increment' | 'promotion'): boolean {
  if (sc.isCountedForPromotion === false || sc.is_counted_for_promotion === false) return false;
  const purpose = String(sc.purpose || '').trim();
  if (purpose === 'تقاعد_فقط' || purpose === 'pension_only') return false;
  if (target === 'increment' && (purpose === 'ترفيع_فقط' || purpose === 'promotion_only')) return false;
  if (target === 'promotion' && (purpose === 'علاوة_فقط' || purpose === 'increment_only' || purpose === 'allowance_only')) return false;
  return true;
}

/**
 * الخدمة المحتسبة تُطبَّق مرة واحدة فقط: على الدورة التي يقع فيها تاريخ أمرها
 * (تاريخ الأمر بعد تاريخ بداية الدورة). السجل الذي يسبق أمره بداية الدورة استُهلك في دورة سابقة.
 * السجل بلا تاريخ أمر لا يمكن نسبته إلى دورة فلا يُطبَّق (ويُعاد ضمن missingOrderDate).
 */
export function collectCycleServiceCredits(
  credits: ServiceCreditRecord[],
  anchorDate: string,
  target: 'increment' | 'promotion'
): { years: number; months: number; days: number; latestOrderDate: string | null; missingOrderDate: ServiceCreditRecord[] } {
  let years = 0, months = 0, days = 0;
  let latestOrderDate: string | null = null;
  const missingOrderDate: ServiceCreditRecord[] = [];
  (credits || []).forEach(sc => {
    if (!serviceCreditAppliesTo(sc, target)) return;
    const od = sc.orderDate || sc.order_date;
    if (!od) { missingOrderDate.push(sc); return; }
    if (!isDateOnOrAfter(od, anchorDate) || formatDateString(od) === formatDateString(anchorDate)) return;
    years += creditPart(sc, 'calculatedYears', 'calculated_years', 'years');
    months += creditPart(sc, 'calculatedMonths', 'calculated_months', 'months');
    days += creditPart(sc, 'calculatedDays', 'calculated_days', 'days');
    if (!latestOrderDate || isDateOnOrAfter(od, latestOrderDate)) latestOrderDate = formatDateString(od);
  });
  return { years, months, days, latestOrderDate, missingOrderDate };
}

export function parseGradeValue(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 1 && n <= 13 ? n : null;
}

export function parseStepValue(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** الغياب غير المبرر الذي يؤخر الاستحقاق (يشمل مفردة الواجهة «غائب بدون إذن») */
export function isUnexcusedAbsenceStatus(status: string): boolean {
  const s = String(status || '').trim();
  return ['غائب', 'غياب', 'غياب_بدون_عذر', 'غياب بدون عذر', 'غائب بدون إذن', 'غائب بدون اذن', 'غائب_بدون_إذن', 'absence'].includes(s);
}

/** آخر مرحلة في الدرجة (سلم 22/2008: 11 مرحلة لكل درجة) */
export const MAX_STEP_PER_GRADE = 11;

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
  const gradeNum = parseGradeValue(employee.grade);

  // A. Governing Courses Gate (الدورات الحاكمة)
  const governingCourses = (context.governingCourses || []).filter(
    c => (c.grade === gradeNum || !c.grade) && (c.isRequiredForPromotion !== false && c.is_required_for_promotion !== false) && (c.status === 'فعال' || !c.status)
  );
  const assignments = context.governingAssignments || {};
  const empAssignment = assignments[String(employee.id)];

  let governingCoursesSatisfied = true;
  const missingGoverningCourses: string[] = [];

  // Check degree qualification exemption: Higher degrees and Intermediate & below are exempt
  const eduLevel = String(employee.education_level || employee.educationLevel || employee.qualification || '').trim();
  const isExemptByDegree = ['دكتوراه', 'ماجستير', 'دبلوم عالي', 'متوسطة', 'متوسطة فما دون', 'ابتدائية', 'بدون مؤهل', 'يقرأ ويكتب', 'امي', 'أمي'].some(lvl => eduLevel.includes(lvl));

  if (isExemptByDegree || (empAssignment && (empAssignment.status === 'معفى_كامل' || empAssignment.status === 'معفى' || empAssignment.status === 'مستوفي' || empAssignment.status === 'ناجح'))) {
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
  } else if (context.gradeRequirements && context.gradeRequirements[String(gradeNum)]) {
    const reqs = context.gradeRequirements[String(gradeNum)] || [];
    const passedCourses = (context.trainingCourses || []).filter(
      (c: any) => (String(c.employeeId || c.employee_id || '') === String(employee.id)) &&
        (c.result === 'اجتاز' || c.result === 'ناجح' || c.result === 'معفى' || c.completed === true || c.isPassed === true)
    );

    reqs.forEach((req: any) => {
      if (req.mandatory === false || req.isMandatory === false) return;
      const rCat = String(req.category || '').trim().toLowerCase();
      const matched = passedCourses.filter((c: any) => {
        const cCat = String(c.category || '').trim().toLowerCase();
        const cName = String(c.courseName || c.course_name || '').trim().toLowerCase();
        return (cCat && (cCat.includes(rCat) || rCat.includes(cCat))) || (cName && (cName.includes(rCat) || rCat.includes(cName)));
      });
      const totalDays = matched.reduce((sum: number, c: any) => sum + (parseInt(c.days || c.duration_days) || 5), 0);
      const reqDays = parseInt(req.requiredDays) || 5;
      if (totalDays < reqDays) {
        governingCoursesSatisfied = false;
        const rem = reqDays - totalDays;
        missingGoverningCourses.push(`${req.category} (متبقي ${rem} يوم)`);
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
    if (!isLeaveBlocking(lv, 'promotion')) return;
    const sDate = lv.startDate || lv.start_date || '';
    const eDate = lv.endDate || lv.end_date || '';
    if (!isApprovedLeaveStatus(lv.status)) return;

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

function emptyIncrementResult(
  status: IncrementEligibilityResult['eligibilityStatus'],
  reason: string,
  lastIncr: string | null,
  extra: Partial<IncrementEligibilityResult> = {}
): IncrementEligibilityResult {
  return {
    nextIncrementDueDate: null,
    baseDueDate: null,
    lastIncrementDate: lastIncr,
    eligibilityStatus: status,
    isIncrementEligible: false,
    commendationMonthsDeducted: 0,
    penaltyMonthsAdded: 0,
    absenceDaysAdded: 0,
    serviceCreditDurationDeducted: { years: 0, months: 0, days: 0 },
    modifiers: { commendationMonths: 0, penaltyDelayMonths: 0, absenceDays: 0, serviceCreditMonths: 0 },
    deferredItems: [],
    isSupported: true,
    statusReason: reason,
    blockingLeaveDaysAdded: 0,
    appliedCommendationsCount: 0,
    appliedPenaltiesCount: 0,
    appliedAbsenceDays: 0,
    ...extra,
  };
}

function resolveLastIncrementDate(employee: EmployeeEntity): string | null {
  return (
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
    null
  );
}

function resolveLastPromotionDate(employee: EmployeeEntity): string | null {
  return (
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
    null
  );
}

function isValidDateString(d: any): boolean {
  if (!d) return false;
  const str = String(d).trim().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  return !isNaN(new Date(str).getTime());
}

export function calculateIncrementEligibility(
  employee: EmployeeEntity,
  context: EngineContextData = {}
): IncrementEligibilityResult {
  const today = context.today || formatDateString(new Date());

  // ملاحظة: شهادة «أثناء الخدمة» لا تحجب العلاوة (مسار الشهادة يخص الترفيع فقط)

  // 1. Base last increment date — لا يُختلق تاريخ (لا today)
  const lastIncrRaw = resolveLastIncrementDate(employee);
  const gradeNum = parseGradeValue(employee.grade);
  const stepNum = parseStepValue(employee.step);
  if (!lastIncrRaw || !isValidDateString(lastIncrRaw) || gradeNum === null || stepNum === null) {
    const missing: string[] = [];
    if (gradeNum === null) missing.push('الدرجة');
    if (stepNum === null) missing.push('المرحلة');
    if (!lastIncrRaw || !isValidDateString(lastIncrRaw)) missing.push('تاريخ آخر علاوة / تاريخ الدرجة أو التعيين');
    return emptyIncrementResult('بيانات_ناقصة', `بيانات ناقصة لاحتساب العلاوة: ${missing.join('، ')}`, lastIncrRaw && isValidDateString(lastIncrRaw) ? formatDateString(lastIncrRaw) : null);
  }
  const lastIncr = formatDateString(lastIncrRaw);

  // 1-b. نهاية الدرجة: المرحلة الأخيرة لا تمنح علاوة 11→11 بلا أثر.
  // م9 من قانون 22/2008 (علاوة بمقدار علاوة الدرجة الأعلى خارج الجدول) غير منفذة بعد — تحتاج قرار المالك.
  if (stepNum >= MAX_STEP_PER_GRADE) {
    return emptyIncrementResult(
      'نهاية_المرحلة',
      `الموظف في المرحلة الأخيرة (${stepNum}) من الدرجة (${gradeNum}) — لا علاوة ضمن الجدول؛ تُعالَج وفق م9 من قانون الرواتب 22/2008 (غير منفذة آلياً بعد)`,
      lastIncr
    );
  }

  // Base rule: 12 months for annual increment
  const baseTotalMonths = 12;
  const baseDueDate = addMonthsToDate(lastIncr, baseTotalMonths);

  // 3. Service Credit (مرة واحدة: الدورة التي يقع فيها تاريخ أمر الاحتساب فقط)
  const credit = collectCycleServiceCredits(context.serviceCredits || [], lastIncr, 'increment');
  const creditYears = credit.years;
  const creditMonths = credit.months;
  const creditDays = credit.days;

  const totalCreditMonths = creditYears * 12 + creditMonths;
  const effectiveMonthsAfterCredit = Math.max(0, baseTotalMonths - totalCreditMonths);
  const creditAdjustedDate = addMonthsToDate(lastIncr, effectiveMonthsAfterCredit);

  const deferredItems: DeferredImpactItem[] = [];
  credit.missingOrderDate.forEach(sc => {
    deferredItems.push({
      id: sc.id,
      type: 'service_credit',
      effect: 'خدمة محتسبة غير مطبقة',
      reason: 'سجل خدمة محتسبة بلا تاريخ أمر — لا يمكن نسبته إلى دورة استحقاق (بيانات ناقصة)',
      status: 'بيانات_ناقصة',
      description: 'سجل خدمة محتسبة بلا تاريخ أمر — لا يمكن نسبته إلى دورة استحقاق (بيانات ناقصة)',
    });
  });

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
  let penaltyDelayMonths = 0;
  let appliedPenaltiesCount = 0;

  penalties.forEach(p => {
    if (!isPenaltyInEffect(p)) return;
    const pDate = p.penaltyDate || p.penalty_date || p.orderDate || p.order_date;
    if (!pDate || !isDateOnOrAfter(pDate, lastIncr)) return;

    const pType = p.penaltyType || p.penalty_type || '';
    const delay = resolvePenaltyDelayMonths(p, context.penaltyTypes);
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
    if (!isUnexcusedAbsenceStatus(status) || !a.date || !isDateOnOrAfter(a.date, lastIncr)) return;

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

  // 7. Blocking / unpaid leaves extend the due date by their days
  const leaves = context.leaves || [];
  const leaveExt = computeBlockingLeaveExtension(leaves, lastIncr, 'increment', totalCreditMonths > 0 ? creditAdjustedDate : undefined);

  // 8. Calculate Final Next Increment Due Date
  const effectiveNetMonths = Math.max(0, baseTotalMonths - totalCreditMonths - commendationMonths + penaltyDelayMonths);
  let computedDate = addMonthsToDate(lastIncr, effectiveNetMonths);
  if (creditDays > 0) {
    computedDate = addDaysToDate(computedDate, -creditDays);
  }
  // الخدمة المحتسبة لا تجعل الاستحقاق يسبق تاريخ أمرها (وإلا عادت فطُبقت على الدورة التالية أيضاً)
  if (credit.latestOrderDate && !isDateOnOrAfter(computedDate, credit.latestOrderDate)) {
    computedDate = credit.latestOrderDate;
  }
  if (absenceDays > 0) {
    computedDate = addDaysToDate(computedDate, absenceDays);
  }
  if (leaveExt.days > 0) {
    computedDate = addDaysToDate(computedDate, leaveExt.days);
  }

  // 9. Determine Increment Eligibility Status
  let activePausingLeave = false;
  let pausingLeaveTitle = '';
  leaves.forEach(lv => {
    if (!isLeaveBlocking(lv, 'increment')) return;
    const sDate = lv.startDate || lv.start_date || '';
    const eDate = lv.endDate || lv.end_date || '';
    const isInDateRange = sDate && eDate ? isDateBetween(today, sDate, eDate) : (sDate ? isDateOnOrAfter(today, sDate) : true);
    if (isApprovedLeaveStatus(lv.status) && isInDateRange) {
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
  if (leaveExt.days > 0) {
    statusReason += ` (أُضيف ${leaveExt.days} يوم إجازة موقفة/بدون راتب إلى تاريخ الاستحقاق)`;
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
    blockingLeaveDaysAdded: leaveExt.days,
    appliedCommendationsCount,
    appliedPenaltiesCount,
    appliedAbsenceDays: absenceDays,
  };
}

// ============================================================================
// Main Calculation Logic: Promotion Eligibility (with Service Credit Deferral & Gates)
// ============================================================================

function emptyPromotionResult(
  status: PromotionEligibilityResult['eligibilityStatus'],
  reason: string,
  lastPromo: string | null,
  requiredYears: number | null
): PromotionEligibilityResult {
  return {
    nextPromotionDueDate: null,
    baseDueDate: null,
    lastPromotionDate: lastPromo,
    requiredYears,
    eligibilityStatus: status,
    isPromotionEligible: false,
    statusReason: reason,
    isSupported: true,
    commendationMonthsDeducted: 0,
    penaltyMonthsAdded: 0,
    absenceDaysAdded: 0,
    serviceCreditDurationDeducted: { years: 0, months: 0, days: 0 },
    modifiers: { commendationMonths: 0, penaltyDelayMonths: 0, absenceDays: 0, serviceCreditMonths: 0 },
    gateCheckResults: {
      governingCoursesSatisfied: false,
      missingGoverningCourses: [],
      evaluationsSatisfied: false,
      lastEvaluationsGrades: [],
      activePausingLeave: false,
      noActivePausingLeaves: true,
      pausingLeaveDetails: null,
    },
    blockingLeaveDaysAdded: 0,
    gateChecks: { governingCoursesSatisfied: false, evaluationsSatisfied: false, noActivePausingLeaves: true },
    deferredItems: [],
    appliedCommendationsCount: 0,
    appliedPenaltiesCount: 0,
    appliedAbsenceDays: 0,
  };
}

export function calculatePromotionEligibility(
  employee: EmployeeEntity,
  context: EngineContextData = {}
): PromotionEligibilityResult {
  const today = context.today || formatDateString(new Date());
  const gradeNum = parseGradeValue(employee.grade);

  // 1. مسار احتساب الشهادة أثناء الخدمة: يُتبع فقط ما دامت لقطة المسار «نشط».
  // بعد التسوية (مكتمل) يعود الموظف للمسار الاعتيادي (قاعدة معتمدة من المالك).
  const isActiveSnapshot = (sn: any) => sn && (sn.status === 'نشط' || !sn.status);
  const matchingSnapshot = (isActiveSnapshot(context.degreeTrackSnapshot) ? context.degreeTrackSnapshot : null) ||
    (context.degreeTrackSnapshots || []).find(
      s => String(s.employeeId || s.employee_id) === String(employee.id) && isActiveSnapshot(s)
    );

  if (matchingSnapshot) {
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

  if (gradeNum === null) {
    return emptyPromotionResult('بيانات_ناقصة', 'بيانات ناقصة لاحتساب الترفيع: الدرجة غير مسجلة أو غير صالحة', employee.lastPromotionDate || employee.last_promotion_date || null, null);
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

  // 3. Determine base last promotion date — لا يُختلق تاريخ (لا today)
  const lastPromoRaw = resolveLastPromotionDate(employee);
  if (!lastPromoRaw || !isValidDateString(lastPromoRaw)) {
    return emptyPromotionResult('بيانات_ناقصة', 'بيانات ناقصة لاحتساب الترفيع: تاريخ آخر ترفيع / تاريخ الدرجة أو التعيين غير مسجل', null, requiredYears);
  }
  const lastPromo = formatDateString(lastPromoRaw);

  // Base rule: last_promotion_date + (required_years * 12 months)
  const baseTotalMonths = requiredYears * 12;
  const baseDueDate = addMonthsToDate(lastPromo, baseTotalMonths);

  // 4. Service Credit (مرة واحدة: الدورة التي يقع فيها تاريخ أمر الاحتساب فقط)
  const credit = collectCycleServiceCredits(context.serviceCredits || [], lastPromo, 'promotion');
  const creditYears = credit.years;
  const creditMonths = credit.months;
  const creditDays = credit.days;

  const totalCreditMonths = creditYears * 12 + creditMonths;

  // Compute the accelerated due date after service credit reduction
  const effectiveMonthsAfterCredit = Math.max(0, baseTotalMonths - totalCreditMonths);
  const creditAdjustedDate = addMonthsToDate(lastPromo, effectiveMonthsAfterCredit);

  // 5. Track items and deferred items for all 5 modifiers
  const deferredItems: DeferredImpactItem[] = [];
  credit.missingOrderDate.forEach(sc => {
    deferredItems.push({
      id: sc.id,
      type: 'service_credit',
      effect: 'خدمة محتسبة غير مطبقة',
      reason: 'سجل خدمة محتسبة بلا تاريخ أمر — لا يمكن نسبته إلى دورة استحقاق (بيانات ناقصة)',
      status: 'بيانات_ناقصة',
      description: 'سجل خدمة محتسبة بلا تاريخ أمر — لا يمكن نسبته إلى دورة استحقاق (بيانات ناقصة)',
    });
  });

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
  let penaltyDelayMonths = 0;
  let appliedPenaltiesCount = 0;

  penalties.forEach(p => {
    if (!isPenaltyInEffect(p)) return;
    const pDate = p.penaltyDate || p.penalty_date || p.orderDate || p.order_date;
    if (!pDate || !isDateOnOrAfter(pDate, lastPromo)) return;

    const pType = p.penaltyType || p.penalty_type || '';
    const delay = resolvePenaltyDelayMonths(p, context.penaltyTypes);
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
    if (!isUnexcusedAbsenceStatus(status) || !a.date || !isDateOnOrAfter(a.date, lastPromo)) return;

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
  // الخدمة المحتسبة لا تجعل الاستحقاق يسبق تاريخ أمرها (ضمان التطبيق مرة واحدة)
  if (credit.latestOrderDate && !isDateOnOrAfter(finalDueDate, credit.latestOrderDate)) {
    finalDueDate = credit.latestOrderDate;
  }
  if (absenceDays > 0) {
    finalDueDate = addDaysToDate(finalDueDate, absenceDays);
  }
  // الإجازات الموقفة/بدون راتب لا تُحسب خدمة: تمدد الاستحقاق بعدد أيامها
  const leaveExt = computeBlockingLeaveExtension(context.leaves || [], lastPromo, 'promotion', totalCreditMonths > 0 ? creditAdjustedDate : undefined);
  if (leaveExt.days > 0) {
    finalDueDate = addDaysToDate(finalDueDate, leaveExt.days);
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
  if (leaveExt.days > 0) {
    statusReason += ` (أُضيف ${leaveExt.days} يوم إجازة موقفة/بدون راتب إلى تاريخ الاستحقاق)`;
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
    blockingLeaveDaysAdded: leaveExt.days,
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
    grade: parseGradeValue(employee.grade),
    step: parseStepValue(employee.step),
    isSupported,
    unsupportedReason,
    increment: incrResult,
    promotion: promoResult,
    calculatedAt: new Date().toISOString(),
  };
}
