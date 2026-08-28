// src/lib/degreeTrackEngine.ts
/**
 * Degree Track Recognition Engine (Phase 2b)
 * محرك مسار احتساب الشهادات الحاصل عليها الموظف أثناء الخدمة
 * 
 * القواعد الصارمة:
 * 1. المحاكاة الافتراضية للفترة المقضية: تبدأ من الدرجة الأساس (Baseline) المقررة للشهادة،
 *    وتتقدم بنظام دورة كل سنتين (24 شهراً لكل ترفيع).
 * 2. رصيد دورة الاختصاص: كل ترفيع (محاكاة أو حقيقي) يتطلب أسبوعين من رصيد تدريب اختصاص تراكمي.
 *    تراكم 4 أسابيع يتيح الترفيع بدرجتين معاً (أمر واحد).
 * 3. استثناء الـ 10 سنوات فأكثر: إذا كانت الفترة المقضية >= 10 سنوات بالضبط (120 شهراً)،
 *    يُمنح أول ترفيعين معاً بدورة اختصاص واحدة فقط (أسبوعين)، وترجع الترفيعات اللاحقة للقاعدة العامة.
 * 4. ثبات الدرجة الفعلية الحالية: إذا كانت الدرجة الفعلية الحالية (مثل 3) أفضل من الدرجة المحسوبة بالمحاكاة (مثل 4)،
 *    فإن درجة الموظف الفعلية لا تنزل أبداً، بل يُسجل "عجز دورة"، ويُكمل الاستحقاق الحقيقي القادم (3 إلى 2)
 *    في الزمن الحقيقي (سنتين) بانطلاق ثابت من تاريخ آخر ترفيع محاكاة، مع سريان العقوبات والإجازات في الزمن الحقيقي.
 */

import {
  addMonthsToDate,
  addDaysToDate,
  parseDateString,
  formatDateString,
  isDateOnOrAfter,
  isDateBetween,
  DEFAULT_PENALTY_DELAYS,
} from './promotionEngine';

export interface DegreeTrackSnapshotEntity {
  id?: number | string;
  qualificationId: number | string;
  qualification_id?: number | string;
  employeeId: number | string;
  employee_id?: number | string;
  jobTitleId?: number | string;
  job_title_id?: number | string;
  actualGradeBefore: number;
  actual_grade_before?: number;
  actualStepBefore: number;
  actual_step_before?: number;
  baselineGrade: number;
  baseline_grade?: number;
  baselineStep: number;
  baseline_step?: number;
  graduationDateUsed: string;
  graduation_date_used?: string;
  orderDate: string;
  order_date?: string;
  status?: string; // 'نشط' | 'مكتمل'
  notes?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: any;
}

export interface DegreeTrackSimulationStep {
  id?: number | string;
  snapshotId?: number | string;
  snapshot_id?: number | string;
  fromGrade: number;
  from_grade?: number;
  toGrade: number;
  to_grade?: number;
  computedDate: string;
  computed_date?: string;
  weeksConsumed: number;
  weeks_consumed?: number;
  isBundled?: boolean;
  is_bundled?: boolean;
  status: 'ممنوح_بالمحاكاة' | 'معلق_لعدم_استيفاء_الدورة';
  notes?: string;
}

export interface SpecializationCreditEntity {
  id?: number | string;
  employeeId: number | string;
  employee_id?: number | string;
  snapshotId?: number | string | null;
  snapshot_id?: number | string | null;
  weeks: number;
  courseDate?: string;
  course_date?: string;
  courseName?: string;
  course_name?: string;
  provider?: string;
  notes?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: any;
}

export interface DegreeTrackSimulationResult {
  snapshotId?: number | string;
  employeeId: number | string;
  jobTitleId?: number | string;
  graduationDateUsed: string;
  orderDate: string;
  spentPeriodMonths: number;
  spentPeriodYears: number;
  isTenYearExceptionApplied: boolean;
  baselineGrade: number;
  baselineStep: number;
  actualGradeBefore: number;
  actualStepBefore: number;
  totalSpecializationWeeksAvailable: number;
  specializationWeeksConsumed: number;
  specializationWeeksRemaining: number;
  simulationSteps: DegreeTrackSimulationStep[];
  simulatedGradeReached: number;
  lastSimulatedPromotionDate: string;
  hasDeficit: boolean;
  deficitCycles: number;
  realTimeNextPromotion: {
    settlementGrade: number;
    fromGrade?: number;
    toGrade?: number;
    anchorStartDate: string;
    baseDurationMonths: number;
    nextPromotionDueDate: string;
    eligibilityStatus: string;
    isEligible: boolean;
    hasSpecializationPrerequisite: boolean;
    specializationPrerequisiteSatisfied: boolean;
    statusReason: string;
    penaltiesDelayMonths: number;
    absenceDaysAdded: number;
    activePausingLeave: boolean;
  };
}

/**
 * @deprecated مهملة (Deprecated): كانت مبنية على افتراض خاطئ بتخمين الدرجة الأساس من اسم الشهادة.
 * الدرجة والمرحلة الأساس تُحدد حصراً من العنوان الوظيفي المعتمد (job_titles.min_grade / min_step)
 * الذي يختاره مسؤول الموارد البشرية عند بدء عملية احتساب الشهادة، ولا تُستخدم هذه المصفوفة في المسار الفعلي.
 */
export const DEFAULT_DEGREE_BASELINES: Record<string, { grade: number; step: number }> = {
  'دكتوراه': { grade: 5, step: 1 },
  'ماجستير': { grade: 6, step: 1 },
  'دبلوم عالي': { grade: 6, step: 1 },
  'بكالوريوس': { grade: 7, step: 1 },
  'بكالوريوس هندسة': { grade: 7, step: 2 },
  'بكالوريوس صيدلة': { grade: 7, step: 2 },
  'بكالوريوس طب عام': { grade: 7, step: 3 },
  'دبلوم': { grade: 8, step: 1 },
  'دبلوم فني': { grade: 8, step: 1 },
  'إعدادية': { grade: 8, step: 1 },
  'اعدادية': { grade: 8, step: 1 },
  'متوسطة': { grade: 9, step: 1 },
  'ابتدائية': { grade: 10, step: 1 },
  'يقرأ ويكتب': { grade: 10, step: 1 },
  'بدون شهادة': { grade: 10, step: 1 },
};

/**
 * @deprecated مهملة (Deprecated): لا يجوز استنتاج الدرجة الأساس من نص اسم الشهادة.
 * تم الاحتفاظ بالدالة كـ Fallback للتوافقية القديمة فقط، ومسار الاحتساب الفعلي يعتمد حصراً على job_titles.
 */
export function resolveDegreeBaseline(degreeName?: string): { grade: number; step: number } {
  if (!degreeName) return { grade: 7, step: 1 };
  const trimmed = degreeName.trim();
  const sortedEntries = Object.entries(DEFAULT_DEGREE_BASELINES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, val] of sortedEntries) {
    if (trimmed.includes(key)) {
      return val;
    }
  }
  return { grade: 7, step: 1 };
}

/**
 * Calculate available specialization course credit weeks
 */
export function getAvailableSpecializationCredits(
  employeeId: number | string,
  credits: SpecializationCreditEntity[] = []
): { totalWeeks: number } {
  const empCredits = credits.filter(
    c => String(c.employeeId || c.employee_id) === String(employeeId)
  );
  const totalWeeks = empCredits.reduce((sum, c) => sum + (parseInt(String(c.weeks), 10) || 0), 0);
  return { totalWeeks };
}

/**
 * Helper to compute high-precision difference in months between two dates
 */
export function calculateExactPeriodMonths(startDateStr: string, endDateStr: string): number {
  const d1 = parseDateString(startDateStr);
  const d2 = parseDateString(endDateStr);

  const yearsDiff = d2.getUTCFullYear() - d1.getUTCFullYear();
  const monthsDiff = d2.getUTCMonth() - d1.getUTCMonth();
  const daysDiff = d2.getUTCDate() - d1.getUTCDate();

  let totalMonths = yearsDiff * 12 + monthsDiff;
  // If the day in d2 is less than d1, the current month is not full
  if (daysDiff < 0) {
    totalMonths -= 1;
  }
  return Math.max(0, totalMonths);
}

/**
 * Central Degree Track Simulation Engine
 */
export function calculateDegreeTrackSimulation(
  snapshot: DegreeTrackSnapshotEntity,
  context: {
    specializationCredits?: SpecializationCreditEntity[];
    penalties?: any[];
    penaltyTypes?: Record<string, number>;
    attendances?: any[];
    leaves?: any[];
    evaluations?: any[];
    today?: string;
  } = {}
): DegreeTrackSimulationResult {
  const today = context.today || formatDateString(new Date());

  const employeeId = snapshot.employeeId || snapshot.employee_id || 0;
  const actualGradeBefore = snapshot.actualGradeBefore !== undefined ? snapshot.actualGradeBefore : (snapshot.actual_grade_before || 3);
  const actualStepBefore = snapshot.actualStepBefore !== undefined ? snapshot.actualStepBefore : (snapshot.actual_step_before || 1);
  const baselineGrade = snapshot.baselineGrade !== undefined ? snapshot.baselineGrade : (snapshot.baseline_grade || 7);
  const baselineStep = snapshot.baselineStep !== undefined ? snapshot.baselineStep : (snapshot.baseline_step || 1);
  const graduationDateUsed = snapshot.graduationDateUsed || snapshot.graduation_date_used || '2020-01-01';
  const orderDate = snapshot.orderDate || snapshot.order_date || '2026-01-01';

  // 1. Calculate spent period (الفترة المقضية)
  const spentPeriodMonths = calculateExactPeriodMonths(graduationDateUsed, orderDate);
  const spentPeriodYears = Math.floor(spentPeriodMonths / 12);

  // 2. Check 10-Year Exception (>= 10 years exactly = 120 months)
  const isTenYearExceptionApplied = spentPeriodMonths >= 120;

  // 3. Specialization course credit calculation
  const { totalWeeks: totalSpecializationWeeksAvailable } = getAvailableSpecializationCredits(
    employeeId,
    context.specializationCredits || []
  );

  let remainingWeeks = totalSpecializationWeeksAvailable;
  let weeksConsumedTotal = 0;

  // 4. Run Simulation Cycles (2 years = 24 months per cycle)
  const possibleCycles = Math.floor(spentPeriodMonths / 24);
  const simulationSteps: DegreeTrackSimulationStep[] = [];

  let currentSimGrade = baselineGrade;
  let currentDate = graduationDateUsed;
  let lastSimulatedPromotionDate = graduationDateUsed;
  const penalties = context.penalties || [];
  const penaltyTypeMap = context.penaltyTypes || DEFAULT_PENALTY_DELAYS;

  for (let cycle = 1; cycle <= possibleCycles; cycle++) {
    if (currentSimGrade <= 1) break; // Reached top of scale

    const nextSimGrade = currentSimGrade - 1;

    // Check penalties occurring in this simulation cycle interval
    let cyclePenaltyDelayMonths = 0;
    const cycleBaseEndDate = addMonthsToDate(currentDate, 24);

    penalties.forEach(p => {
      const status = p.status || 'نافذ';
      if (status !== 'نافذ' && status !== 'active') return;
      const pDate = p.penaltyDate || p.penalty_date || p.orderDate || p.order_date;
      if (pDate && isDateBetween(pDate, currentDate, cycleBaseEndDate)) {
        const pType = p.penaltyType || p.penalty_type || '';
        const delay = p.delayMonths !== undefined ? p.delayMonths : (p.delay_months !== undefined ? p.delay_months : (penaltyTypeMap[pType] || 0));
        cyclePenaltyDelayMonths += delay;
      }
    });

    const computedDate = addMonthsToDate(currentDate, 24 + cyclePenaltyDelayMonths);

    // Determine required training weeks for this step
    let requiredWeeks = 2; // General rule: 2 weeks per promotion
    let isBundled = false;

    if (isTenYearExceptionApplied) {
      if (cycle === 1) {
        // First step in 10-year exception consumes 2 weeks for the first 2 promotions
        requiredWeeks = 2;
        isBundled = true;
      } else if (cycle === 2) {
        // Second step is bundled with the first (0 additional weeks required)
        requiredWeeks = 0;
        isBundled = true;
      } else {
        // Subsequent steps (3, 4, ...) revert to general rule (2 weeks each)
        requiredWeeks = 2;
        isBundled = false;
      }
    }

    if (remainingWeeks >= requiredWeeks) {
      remainingWeeks -= requiredWeeks;
      weeksConsumedTotal += requiredWeeks;

      simulationSteps.push({
        snapshotId: snapshot.id,
        fromGrade: currentSimGrade,
        toGrade: nextSimGrade,
        computedDate,
        weeksConsumed: requiredWeeks,
        isBundled,
        status: 'ممنوح_بالمحاكاة',
        notes: isBundled
          ? (cycle === 1 ? 'ممنوح بالمحاكاة ضمن استثناء الـ 10 سنوات (الترفيع الأول والثاني بدورة واحدة)' : 'ممنوح بالمحاكاة ومدمج مع الترفيع السابق ضمن استثناء الـ 10 سنوات')
          : (cyclePenaltyDelayMonths > 0
            ? `ممنوح بالمحاكاة باستهلاك ${requiredWeeks} أسابيع رصيد اختصاص مع تأخير ${cyclePenaltyDelayMonths} شهر بسبب عقوبة نافذة أثناء الفترة المقضية`
            : `ممنوح بالمحاكاة باستهلاك ${requiredWeeks} أسابيع رصيد اختصاص`),
      });

      currentSimGrade = nextSimGrade;
      currentDate = computedDate;
      lastSimulatedPromotionDate = computedDate;
    } else {
      // Missing course credit blocks further simulation steps
      simulationSteps.push({
        snapshotId: snapshot.id,
        fromGrade: currentSimGrade,
        toGrade: nextSimGrade,
        computedDate,
        weeksConsumed: 0,
        isBundled: false,
        status: 'معلق_لعدم_استيفاء_الدورة',
        notes: `الترفيع الافتراضي من الدرجة (${currentSimGrade}) إلى (${nextSimGrade}) معلق لعدم كفاية رصيد دورات الاختصاص (المتاح: ${remainingWeeks} أسابيع، المطلوب: ${requiredWeeks} أسابيع)`,
      });
      break; // Stop further simulation progression
    }
  }

  const simulatedGradeReached = currentSimGrade;

  // 5. Deficit & Real-Time Next Promotion Calculation
  // If actualGradeBefore is better/higher than simulatedGradeReached (e.g. 3 < 4)
  const hasDeficit = actualGradeBefore < simulatedGradeReached;
  const deficitCycles = hasDeficit ? (simulatedGradeReached - actualGradeBefore) : 0;
  const snapshotStatus = hasDeficit ? 'نشط' : 'مكتمل';

  // The settlement grade is the employee's actual current grade (no grade change!)
  const settlementGrade = actualGradeBefore;

  // The anchor date is fixed at the last simulated promotion date (e.g. date reaching grade 4)
  const anchorStartDate = lastSimulatedPromotionDate;
  const baseDurationMonths = 24; // Standard 2 years for degree track promotion

  // 6. Evaluate Real-Time Modifiers since anchorStartDate
  // A. Penalties
  let penaltiesDelayMonths = 0;

  penalties.forEach(p => {
    const status = p.status || 'نافذ';
    if (status !== 'نافذ' && status !== 'active') return;
    const pDate = p.penaltyDate || p.penalty_date || p.orderDate || p.order_date;
    if (pDate && isDateOnOrAfter(pDate, anchorStartDate)) {
      const pType = p.penaltyType || p.penalty_type || '';
      const delay = p.delayMonths !== undefined ? p.delayMonths : (p.delay_months !== undefined ? p.delay_months : (penaltyTypeMap[pType] || 0));
      penaltiesDelayMonths += delay;
    }
  });

  // B. Absences (exact days)
  const attendances = context.attendances || [];
  let absenceDaysAdded = 0;

  attendances.forEach(a => {
    const status = (a.status || '').trim();
    const isAbsence =
      status === 'غائب' ||
      status === 'غياب' ||
      status === 'غياب_بدون_عذر' ||
      status === 'غياب بدون عذر' ||
      status === 'absence';
    if (isAbsence && a.date && isDateOnOrAfter(a.date, anchorStartDate)) {
      const count = a.count !== undefined ? a.count : (a.days !== undefined ? a.days : (a.durationDays !== undefined ? a.durationDays : (a.duration_days !== undefined ? a.duration_days : 1)));
      absenceDaysAdded += count;
    }
  });

  // C. Pausing Leaves
  const leaves = context.leaves || [];
  let activePausingLeave = false;
  let pausingLeaveTitle = '';

  leaves.forEach(lv => {
    const adminEffect = lv.administrativeEffect || lv.administrative_effect || '';
    const isPausing = adminEffect === 'يوقف_الترفيع' || adminEffect === 'pause_promotion';
    if (!isPausing) return;
    const sDate = lv.startDate || lv.start_date || '';
    const eDate = lv.endDate || lv.end_date || '';
    const isApproved = lv.status === 'موافق_عليها' || lv.status === 'ساري' || lv.status === 'نشط' || lv.status === 'approved' || !lv.status;
    const isInDateRange = sDate && eDate ? isDateBetween(today, sDate, eDate) : true;

    if (isApproved && isInDateRange) {
      activePausingLeave = true;
      pausingLeaveTitle = lv.leaveType || lv.leave_type || 'إجازة موقفة للترفيع';
    }
  });

  // D. Compute Final Next Promotion Due Date in Real Time
  let nextPromotionDueDate = addMonthsToDate(anchorStartDate, baseDurationMonths + penaltiesDelayMonths);
  if (absenceDaysAdded > 0) {
    nextPromotionDueDate = addDaysToDate(nextPromotionDueDate, absenceDaysAdded);
  }

  // E. Specialization Course Prerequisite Check for the Real-Time Promotion
  // Needs 2 weeks of remaining credit
  const specializationPrerequisiteSatisfied = remainingWeeks >= 2;

  // F. Final Eligibility Status Resolution
  let eligibilityStatus = 'مؤهل';
  let statusReason = '';
  let isEligible = false;

  const isTimeReached = isDateOnOrAfter(today, nextPromotionDueDate);

  if (activePausingLeave) {
    eligibilityStatus = 'موقوف_بإجازة';
    statusReason = `تثبيت استحقاق الموظف بدرجته الحالية (${settlementGrade}) ضمن مسار احتساب الشهادة موقوف لوجود الموظف في (${pausingLeaveTitle})`;
    isEligible = false;
  } else if (!specializationPrerequisiteSatisfied) {
    eligibilityStatus = 'معلق_لعدم_استيفاء_دورة_الاختصاص';
    statusReason = `تثبيت استحقاق الموظف بدرجته الحالية (${settlementGrade}) ضمن مسار احتساب الشهادة معلق لعدم استيفاء دورة الاختصاص المطلوبة (المتاح: ${remainingWeeks} أسابيع، المطلوب: 2 أسبوع)`;
    isEligible = false;
  } else if (isTimeReached) {
    eligibilityStatus = 'مستحق_للترفيع';
    statusReason = `استوفى الموظف شروط تثبيت الاستحقاق بدرجته الحالية (${settlementGrade}) مع استيفاء دورة الاختصاص ضمن مسار احتساب الشهادة`;
    isEligible = true;
  } else {
    eligibilityStatus = 'مؤهل';
    statusReason = `الموظف مؤهل لتثبيت استحقاقه بدرجته الحالية (${settlementGrade}) بتاريخ (${nextPromotionDueDate}) ضمن مسار احتساب الشهادة`;
    isEligible = true;
  }

  return {
    snapshotId: snapshot.id,
    employeeId,
    jobTitleId: snapshot.jobTitleId || snapshot.job_title_id,
    graduationDateUsed,
    orderDate,
    spentPeriodMonths,
    spentPeriodYears,
    isTenYearExceptionApplied,
    baselineGrade,
    baselineStep,
    actualGradeBefore,
    actualStepBefore,
    totalSpecializationWeeksAvailable,
    specializationWeeksConsumed: weeksConsumedTotal,
    specializationWeeksRemaining: remainingWeeks,
    simulationSteps,
    simulatedGradeReached,
    lastSimulatedPromotionDate,
    hasDeficit,
    deficitCycles,
    snapshotStatus,
    realTimeNextPromotion: {
      settlementGrade,
      fromGrade: settlementGrade,
      toGrade: settlementGrade,
      anchorStartDate,
      baseDurationMonths,
      nextPromotionDueDate,
      eligibilityStatus,
      isEligible,
      hasSpecializationPrerequisite: true,
      specializationPrerequisiteSatisfied,
      statusReason,
      penaltiesDelayMonths,
      absenceDaysAdded,
      activePausingLeave,
    },
  };
}

// ============================================================================
// Degree Track Deficit Settlement (تسوية العجز التلقائية / اليدوية)
// ============================================================================

export interface DegreeTrackSettlementApproval {
  id?: number | string;
  employeeId: number | string;
  movementType: string;
  gradeBefore: number | string;
  gradeAfter: number | string;
  stepBefore: number | string;
  stepAfter: number | string;
  dueDate: string;
  orderNumber: string | null;
  orderDate: string;
  approvedBy: string;
  seniorityReason?: string;
  directorApproval?: string;
  managerRecommendation?: string;
  notes?: string;
  createdAt?: string | Date;
}

export interface SettlementOptions {
  autoSettlementEnabled?: boolean;
  today?: string;
  executionUser?: string;
  onSuccess?: (result: SettlementExecutionResult) => Promise<void> | void;
  onError?: (error: any, empId: number | string) => Promise<void> | void;
}

export interface SettlementExecutionResult {
  success: boolean;
  settled: boolean;
  employeeId: number | string;
  reason?: string;
  error?: string;
  updatedEmployee?: any;
  updatedSnapshot?: any;
  approvalRecord?: DegreeTrackSettlementApproval;
}

/**
 * Process deficit settlement for a single employee in the degree recognition track.
 * Safely executes inside an isolated try/catch block.
 */
export function processDegreeTrackSettlement(
  employee: any,
  snapshot: DegreeTrackSnapshotEntity,
  simResult: DegreeTrackSimulationResult,
  options: SettlementOptions = {}
): SettlementExecutionResult {
  const empId = employee?.id || snapshot?.employeeId || snapshot?.employee_id;
  
  try {
    if (!employee || !snapshot || !simResult) {
      throw new Error(`بيانات الموظف أو سجل احتساب الشهادة غير مكتملة (ID: ${empId})`);
    }

    // 1. Check if auto settlement is enabled
    if (options.autoSettlementEnabled !== true) {
      return {
        success: true,
        settled: false,
        employeeId: empId,
        reason: 'التسوية التلقائية غير مفعلة (الوضع اليدوي الافتراضي — بانتظار اعتماد الموارد البشرية)'
      };
    }

    // 2. Check if snapshot is already completed
    if (snapshot.status === 'مكتمل') {
      return {
        success: true,
        settled: false,
        employeeId: empId,
        reason: 'سجل احتساب الشهادة مكتمل ومسوّى سابقاً'
      };
    }

    // 3. Check conditions: deficit exists, time reached, specialization course satisfied, no active pausing leave
    const isEligible = Boolean(simResult.hasDeficit && simResult.realTimeNextPromotion?.isEligible);
    if (!isEligible) {
      return {
        success: true,
        settled: false,
        employeeId: empId,
        reason: `شروط التسوية غير مستوفاة حالياً: ${simResult.realTimeNextPromotion?.statusReason || 'غير مستحق'}`
      };
    }

    const executionDate = options.today || new Date().toISOString().split('T')[0];
    const settlementDueDate = simResult.realTimeNextPromotion.nextPromotionDueDate || executionDate;

    // 4. Construct updated employee entity (update last_promotion_date)
    const updatedEmployee = {
      ...employee,
      lastPromotionDate: settlementDueDate,
      last_promotion_date: settlementDueDate,
      promotionEligibilityStatus: 'مكتمل_بالتسوية',
      promotion_eligibility_status: 'مكتمل_بالتسوية'
    };

    // 5. Construct updated snapshot entity (status = 'مكتمل')
    const updatedSnapshot = {
      ...snapshot,
      status: 'مكتمل',
      notes: snapshot.notes 
        ? `${snapshot.notes} | تمت التسوية الآلية للعجز بنجاح بتاريخ ${executionDate}`
        : `تمت التسوية الآلية للعجز بنجاح بتاريخ ${executionDate}`
    };

    // 6. Construct promotion approval record (fixation event without grade change)
    const currentGrade = employee.grade !== undefined ? employee.grade : (snapshot.actualGradeBefore || snapshot.actual_grade_before);
    const currentStep = parseInt(String(employee.step !== undefined ? employee.step : (snapshot.actualStepBefore || snapshot.actual_step_before))) || 1;

    const approvalRecord: DegreeTrackSettlementApproval = {
      employeeId: empId,
      movementType: 'ترفيع درجة',
      gradeBefore: currentGrade,
      gradeAfter: currentGrade,
      stepBefore: currentStep,
      stepAfter: currentStep,
      dueDate: settlementDueDate,
      orderNumber: null,
      orderDate: executionDate,
      approvedBy: 'نظام آلي — تسوية تلقائية',
      directorApproval: 'نظام آلي — تسوية تلقائية',
      managerRecommendation: 'نظام آلي — تسوية تلقائية',
      seniorityReason: 'تسوية مسار احتساب الشهادة أثناء الخدمة',
      notes: 'تسوية عجز مسار الشهادة وتثبيت الاستحقاق بعد استيفاء المدة ودورة الاختصاص',
      createdAt: new Date()
    };

    return {
      success: true,
      settled: true,
      employeeId: empId,
      reason: 'تمت التسوية التلقائية للعجز بنجاح',
      updatedEmployee,
      updatedSnapshot,
      approvalRecord
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error(`[DEGREE_TRACK_AUTO_SETTLEMENT_ERROR] Failed for employee #${empId}:`, errorMsg);
    return {
      success: false,
      settled: false,
      employeeId: empId,
      error: errorMsg,
      reason: `فشل تنفيذ التسوية التلقائية: ${errorMsg}`
    };
  }
}

/**
 * Batch processor for all degree track employees.
 * Guarantees 100% complete isolation: any failure in one employee never blocks or interrupts others.
 */
export function processBatchDegreeTrackAutoSettlement(
  employees: any[],
  snapshots: DegreeTrackSnapshotEntity[],
  contextMap: {
    specializationCredits?: any[];
    penalties?: any[];
    leaves?: any[];
    attendances?: any[];
    [key: string]: any;
  } = {},
  options: SettlementOptions = {}
): {
  totalProcessed: number;
  totalSettled: number;
  totalFailed: number;
  totalSkipped: number;
  results: SettlementExecutionResult[];
} {
  const results: SettlementExecutionResult[] = [];
  let totalSettled = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const emp of (employees || [])) {
    try {
      const empId = emp?.id;
      if (!empId) {
        totalSkipped++;
        continue;
      }

      // Find active snapshot for this employee
      const activeSnapshot = (snapshots || []).find(
        s => String(s.employeeId || s.employee_id) === String(empId) && (s.status === 'نشط' || !s.status)
      );

      if (!activeSnapshot) {
        totalSkipped++;
        continue;
      }

      // Filter context for this employee
      const empSpecialization = (contextMap.specializationCredits || []).filter(
        c => String(c.employeeId || c.employee_id) === String(empId)
      );
      const empPenalties = (contextMap.penalties || []).filter(
        p => String(p.employeeId || p.employee_id) === String(empId)
      );
      const empLeaves = (contextMap.leaves || []).filter(
        l => String(l.employeeId || l.employee_id) === String(empId)
      );
      const empAttendances = (contextMap.attendances || []).filter(
        a => String(a.employeeId || a.employee_id) === String(empId)
      );

      // Run simulation
      const simResult = calculateDegreeTrackSimulation(activeSnapshot, {
        specializationCredits: empSpecialization,
        penalties: empPenalties,
        leaves: empLeaves,
        attendances: empAttendances,
        today: options.today
      });

      // Run isolated settlement
      const res = processDegreeTrackSettlement(emp, activeSnapshot, simResult, options);
      results.push(res);

      if (res.settled) {
        totalSettled++;
      } else if (!res.success) {
        totalFailed++;
      } else {
        totalSkipped++;
      }
    } catch (empErr: any) {
      // Isolated catch for unexpected outer errors per employee
      totalFailed++;
      const empId = emp?.id || 'unknown';
      const errorMsg = empErr?.message || String(empErr);
      console.error(`[BATCH_AUTO_SETTLEMENT_ISOLATION_GUARD] Error for employee #${empId}:`, errorMsg);
      results.push({
        success: false,
        settled: false,
        employeeId: empId,
        error: errorMsg,
        reason: `خطأ معزول أثناء معالجة الموظف: ${errorMsg}`
      });
    }
  }

  return {
    totalProcessed: results.length,
    totalSettled,
    totalFailed,
    totalSkipped,
    results
  };
}

