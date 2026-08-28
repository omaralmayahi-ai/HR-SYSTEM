// src/lib/promotionDelayReasonsEngine.ts
/**
 * Promotion & Increment Delay Reasons Engine (Phase 4: Transparency & Reminders)
 * محرك إدارة وتتبع موانع وأسباب تأخير الترفيع والعلاوة والتذكيرات المدارة
 */

import {
  formatDateString,
  addDaysToDate,
  FullEligibilityResponse,
  EngineContextData,
  EmployeeEntity
} from './promotionEngine';

export interface PromotionDelayReasonEntity {
  id?: number;
  employeeId: number;
  employee_id?: number;
  reasonType: 'دورة' | 'عقوبة' | 'اجازة' | 'تقييم' | 'غياب';
  reason_type?: 'دورة' | 'عقوبة' | 'اجازة' | 'تقييم' | 'غياب';
  description: string;
  affects: 'ترفيع' | 'علاوة' | 'كلاهما';
  isHidden: boolean;
  is_hidden?: boolean;
  reminderDate: string | null;
  reminder_date?: string | null;
  isAutoReminder: boolean;
  is_auto_reminder?: boolean;
  isResolved: boolean;
  is_resolved?: boolean;
  resolvedAt: string | null;
  resolved_at?: string | null;
  sourceReferenceId?: string | null;
  source_reference_id?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface RawDelayReason {
  reasonType: 'دورة' | 'عقوبة' | 'اجازة' | 'تقييم' | 'غياب';
  description: string;
  affects: 'ترفيع' | 'علاوة' | 'كلاهما';
  sourceReferenceId: string;
}

export interface ReminderDurationSettings {
  reminderDaysCourse?: number;
  reminder_days_course?: number;
  reminderDaysPenalty?: number;
  reminder_days_penalty?: number;
  reminderDaysLeave?: number;
  reminder_days_leave?: number;
  reminderDaysEvaluation?: number;
  reminder_days_evaluation?: number;
  reminderDaysAbsence?: number;
  reminder_days_absence?: number;
  [key: string]: any;
}

export const DEFAULT_REMINDER_DAYS = {
  'دورة': 30,
  'عقوبة': 15,
  'اجازة': 30,
  'تقييم': 30,
  'غياب': 10,
};

export function getDefaultReminderDaysForType(
  type: 'دورة' | 'عقوبة' | 'اجازة' | 'تقييم' | 'غياب',
  settings?: ReminderDurationSettings
): number {
  if (!settings) return DEFAULT_REMINDER_DAYS[type] || 30;

  switch (type) {
    case 'دورة':
      return settings.reminderDaysCourse ?? settings.reminder_days_course ?? DEFAULT_REMINDER_DAYS['دورة'];
    case 'عقوبة':
      return settings.reminderDaysPenalty ?? settings.reminder_days_penalty ?? DEFAULT_REMINDER_DAYS['عقوبة'];
    case 'اجازة':
      return settings.reminderDaysLeave ?? settings.reminder_days_leave ?? DEFAULT_REMINDER_DAYS['اجازة'];
    case 'تقييم':
      return settings.reminderDaysEvaluation ?? settings.reminder_days_evaluation ?? DEFAULT_REMINDER_DAYS['تقييم'];
    case 'غياب':
      return settings.reminderDaysAbsence ?? settings.reminder_days_absence ?? DEFAULT_REMINDER_DAYS['غياب'];
    default:
      return 30;
  }
}

/**
 * Extracts active delay/pause reasons from engine context and calculation results
 */
export function extractDelayReasonsFromContext(
  employee: EmployeeEntity,
  fullResult: FullEligibilityResponse,
  context: EngineContextData = {},
  degreeTrackSimResult?: any
): RawDelayReason[] {
  const reasons: RawDelayReason[] = [];

  // 1. Missing Governing Courses
  const missingCourses = fullResult?.promotion?.gateCheckResults?.missingGoverningCourses || [];
  missingCourses.forEach(cName => {
    reasons.push({
      reasonType: 'دورة',
      description: `عدم اجتياز الدورة التدريبية الحاكمة المقررة للدرجة: (${cName})`,
      affects: 'ترفيع',
      sourceReferenceId: `course_${cName}`
    });
  });

  // 2. Active Pausing Leaves
  if (fullResult?.promotion?.gateCheckResults?.activePausingLeave) {
    const lvDetails = fullResult.promotion.gateCheckResults.pausingLeaveDetails;
    const leaveName = lvDetails?.leaveType || 'إجازة بدون راتب موقفة';
    reasons.push({
      reasonType: 'اجازة',
      description: `وجود الموظف في (${leaveName}) من ${lvDetails?.startDate || '—'} إلى ${lvDetails?.endDate || '—'} المانعة للترقية`,
      affects: 'كلاهما',
      sourceReferenceId: `leave_pausing_${lvDetails?.startDate || 'active'}`
    });
  }

  // 3. Performance Evaluation Blockage
  if (fullResult?.promotion?.gateCheckResults?.evaluationsSatisfied === false) {
    const reasonText = fullResult.promotion.gateCheckResults.evaluationBlockReason || 'حصول الموظف على تقييم أداء غير مستوفٍ لشروط الترفيع';
    reasons.push({
      reasonType: 'تقييم',
      description: reasonText,
      affects: 'ترفيع',
      sourceReferenceId: 'eval_unsatisfactory'
    });
  }

  // 4. Penalties causing delay
  const penaltyDelayPromo = fullResult?.promotion?.penaltyMonthsAdded || 0;
  const penaltyDelayIncr = fullResult?.increment?.penaltyMonthsAdded || 0;
  if (penaltyDelayPromo > 0 || penaltyDelayIncr > 0) {
    const months = Math.max(penaltyDelayPromo, penaltyDelayIncr);
    reasons.push({
      reasonType: 'عقوبة',
      description: `تأخير الاستحقاق الإداري لمدة (${months}) شهر بسبب عقوبة انضباطية نافذة`,
      affects: penaltyDelayPromo > 0 && penaltyDelayIncr > 0 ? 'كلاهما' : (penaltyDelayPromo > 0 ? 'ترفيع' : 'علاوة'),
      sourceReferenceId: 'penalty_delay_active'
    });
  }

  // 5. Unexcused Absences causing delay
  const absDaysPromo = fullResult?.promotion?.absenceDaysAdded || 0;
  const absDaysIncr = fullResult?.increment?.absenceDaysAdded || 0;
  if (absDaysPromo > 0 || absDaysIncr > 0) {
    const days = Math.max(absDaysPromo, absDaysIncr);
    reasons.push({
      reasonType: 'غياب',
      description: `تأخير الاستحقاق بمقدار (${days}) يوم بسبب أيام غياب بدون عذر خلال فترة الخدمة`,
      affects: 'كلاهما',
      sourceReferenceId: 'absence_delay_active'
    });
  }

  // 6. Degree Track Deficit (if active)
  if (degreeTrackSimResult && degreeTrackSimResult.hasDeficit && !degreeTrackSimResult.realTimeNextPromotion?.isEligible) {
    reasons.push({
      reasonType: 'دورة',
      description: `مسار احتساب الشهادة: ${degreeTrackSimResult.realTimeNextPromotion?.statusReason || 'عدم استيفاء المدة الأصغرية أو دورة الاختصاص'}`,
      affects: 'ترفيع',
      sourceReferenceId: `degree_track_deficit`
    });
  }

  return reasons;
}

/**
 * Upsert synchronization engine:
 * 1. Matches existing reasons by employee_id + reason_type + source_reference_id.
 * 2. Preserves is_hidden, reminder_date, and is_auto_reminder across recalculations.
 * 3. Creates new records with default reminder dates based on settings.
 * 4. Resolves (is_resolved = true, resolved_at = now) reasons that no longer appear.
 */
export function syncPromotionDelayReasons(
  employeeId: number | string,
  rawReasons: RawDelayReason[],
  existingStore: PromotionDelayReasonEntity[],
  settings?: ReminderDurationSettings,
  todayStr?: string
): {
  updatedStore: PromotionDelayReasonEntity[];
  added: PromotionDelayReasonEntity[];
  updated: PromotionDelayReasonEntity[];
  resolved: PromotionDelayReasonEntity[];
} {
  const empId = parseInt(String(employeeId));
  const today = todayStr || formatDateString(new Date());
  const nowTimestamp = new Date().toISOString();

  const storeCopy = [...existingStore];
  const added: PromotionDelayReasonEntity[] = [];
  const updated: PromotionDelayReasonEntity[] = [];
  const resolved: PromotionDelayReasonEntity[] = [];

  const matchedExistingIds = new Set<number | string>();

  // Process each currently active raw reason
  for (const raw of rawReasons) {
    const existingIdx = storeCopy.findIndex(item => {
      const matchEmp = parseInt(String(item.employeeId || item.employee_id)) === empId;
      const matchType = (item.reasonType || item.reason_type) === raw.reasonType;
      const matchRef = (item.sourceReferenceId || item.source_reference_id) === raw.sourceReferenceId;
      return matchEmp && matchType && matchRef;
    });

    if (existingIdx !== -1) {
      // Existing reason: update description/affects and ensure active, but PRESERVE is_hidden, reminder_date, is_auto_reminder
      const cur = storeCopy[existingIdx];
      matchedExistingIds.add(cur.id || existingIdx);

      const updatedRecord: PromotionDelayReasonEntity = {
        ...cur,
        description: raw.description,
        affects: raw.affects,
        isResolved: false,
        is_resolved: false,
        resolvedAt: null,
        resolved_at: null,
        updatedAt: nowTimestamp,
        updated_at: nowTimestamp,
        // PRESERVED VALUES:
        isHidden: cur.isHidden !== undefined ? cur.isHidden : (cur.is_hidden ?? false),
        is_hidden: cur.isHidden !== undefined ? cur.isHidden : (cur.is_hidden ?? false),
        reminderDate: cur.reminderDate !== undefined ? cur.reminderDate : (cur.reminder_date ?? null),
        reminder_date: cur.reminderDate !== undefined ? cur.reminderDate : (cur.reminder_date ?? null),
        isAutoReminder: cur.isAutoReminder !== undefined ? cur.isAutoReminder : (cur.is_auto_reminder ?? true),
        is_auto_reminder: cur.isAutoReminder !== undefined ? cur.isAutoReminder : (cur.is_auto_reminder ?? true),
      };

      storeCopy[existingIdx] = updatedRecord;
      updated.push(updatedRecord);
    } else {
      // Brand new reason: calculate reminder_date automatically
      const defaultDays = getDefaultReminderDaysForType(raw.reasonType, settings);
      const computedReminderDate = addDaysToDate(today, defaultDays);

      const maxId = storeCopy.reduce((max, it) => Math.max(max, parseInt(String(it.id || 0))), 0);
      const newId = maxId + 1;

      const newRecord: PromotionDelayReasonEntity = {
        id: newId,
        employeeId: empId,
        employee_id: empId,
        reasonType: raw.reasonType,
        reason_type: raw.reasonType,
        description: raw.description,
        affects: raw.affects,
        isHidden: false,
        is_hidden: false,
        reminderDate: computedReminderDate,
        reminder_date: computedReminderDate,
        isAutoReminder: true,
        is_auto_reminder: true,
        isResolved: false,
        is_resolved: false,
        resolvedAt: null,
        resolved_at: null,
        sourceReferenceId: raw.sourceReferenceId,
        source_reference_id: raw.sourceReferenceId,
        createdAt: nowTimestamp,
        created_at: nowTimestamp,
        updatedAt: nowTimestamp,
        updated_at: nowTimestamp,
      };

      storeCopy.push(newRecord);
      added.push(newRecord);
      matchedExistingIds.add(newId);
    }
  }

  // Check previously existing records for this employee that are no longer present -> Mark resolved
  for (let i = 0; i < storeCopy.length; i++) {
    const item = storeCopy[i];
    const matchEmp = parseInt(String(item.employeeId || item.employee_id)) === empId;
    const isCurrentlyUnresolved = item.isResolved === false || item.is_resolved === false || (item.isResolved === undefined && item.is_resolved === undefined);

    if (matchEmp && isCurrentlyUnresolved) {
      const idKey = item.id || i;
      if (!matchedExistingIds.has(idKey)) {
        const resolvedRecord: PromotionDelayReasonEntity = {
          ...item,
          isResolved: true,
          is_resolved: true,
          resolvedAt: nowTimestamp,
          resolved_at: nowTimestamp,
          updatedAt: nowTimestamp,
          updated_at: nowTimestamp,
        };
        storeCopy[i] = resolvedRecord;
        resolved.push(resolvedRecord);
      }
    }
  }

  return {
    updatedStore: storeCopy,
    added,
    updated,
    resolved
  };
}
