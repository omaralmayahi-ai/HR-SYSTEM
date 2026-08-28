// src/lib/promotionDelayReasons.test.ts
import { describe, it, expect } from 'vitest';
import {
  syncPromotionDelayReasons,
  extractDelayReasonsFromContext,
  getDefaultReminderDaysForType,
  DEFAULT_REMINDER_DAYS,
  PromotionDelayReasonEntity,
  RawDelayReason
} from './promotionDelayReasonsEngine';
import { isDateOnOrAfter } from './promotionEngine';

describe('Promotion Delay Reasons & Follow-up Reminders Engine (Phase 4)', () => {
  const customSettings = {
    reminderDaysCourse: 45,
    reminderDaysPenalty: 20,
    reminderDaysLeave: 40,
    reminderDaysEvaluation: 35,
    reminderDaysAbsence: 12,
  };

  const today = '2026-08-28';

  // ==========================================================================
  // Test 1: Configuration & Default Reminder Days
  // ==========================================================================
  it('1. should return configured reminder days or fallback to standard defaults', () => {
    expect(getDefaultReminderDaysForType('دورة')).toBe(DEFAULT_REMINDER_DAYS['دورة']); // 30
    expect(getDefaultReminderDaysForType('عقوبة')).toBe(DEFAULT_REMINDER_DAYS['عقوبة']); // 15
    expect(getDefaultReminderDaysForType('اجازة')).toBe(DEFAULT_REMINDER_DAYS['اجازة']); // 30
    expect(getDefaultReminderDaysForType('تقييم')).toBe(DEFAULT_REMINDER_DAYS['تقييم']); // 30
    expect(getDefaultReminderDaysForType('غياب')).toBe(DEFAULT_REMINDER_DAYS['غياب']); // 10

    // With custom settings
    expect(getDefaultReminderDaysForType('دورة', customSettings)).toBe(45);
    expect(getDefaultReminderDaysForType('عقوبة', customSettings)).toBe(20);
    expect(getDefaultReminderDaysForType('اجازة', customSettings)).toBe(40);
    expect(getDefaultReminderDaysForType('تقييم', customSettings)).toBe(35);
    expect(getDefaultReminderDaysForType('غياب', customSettings)).toBe(12);
  });

  // ==========================================================================
  // Test 2: Extraction of Raw Delay Reasons from Context & Engine Result
  // ==========================================================================
  it('2. should extract active blocker reasons from calculation result', () => {
    const mockEmployee = { id: 101, name: 'علي حسن', grade: 5, step: 2 };
    const mockFullResult: any = {
      promotion: {
        penaltyMonthsAdded: 6,
        absenceDaysAdded: 15,
        gateCheckResults: {
          missingGoverningCourses: ['دورة القيادة الإدارية'],
          evaluationsSatisfied: false,
          evaluationBlockReason: 'حصول الموظف على تقييم مقبول لسنة 2024',
          activePausingLeave: true,
          pausingLeaveDetails: {
            leaveType: 'إجازة بدون راتب',
            startDate: '2025-01-01',
            endDate: '2025-06-01'
          }
        }
      },
      increment: {
        penaltyMonthsAdded: 6,
        absenceDaysAdded: 15
      }
    };

    const reasons = extractDelayReasonsFromContext(mockEmployee, mockFullResult);
    expect(reasons).toHaveLength(5);

    const courseReason = reasons.find(r => r.reasonType === 'دورة');
    expect(courseReason).toBeDefined();
    expect(courseReason?.description).toContain('دورة القيادة الإدارية');
    expect(courseReason?.sourceReferenceId).toBe('course_دورة القيادة الإدارية');

    const leaveReason = reasons.find(r => r.reasonType === 'اجازة');
    expect(leaveReason).toBeDefined();
    expect(leaveReason?.description).toContain('إجازة بدون راتب');

    const evalReason = reasons.find(r => r.reasonType === 'تقييم');
    expect(evalReason).toBeDefined();
    expect(evalReason?.description).toContain('تقييم مقبول لسنة 2024');

    const penaltyReason = reasons.find(r => r.reasonType === 'عقوبة');
    expect(penaltyReason).toBeDefined();
    expect(penaltyReason?.description).toContain('6');

    const absenceReason = reasons.find(r => r.reasonType === 'غياب');
    expect(absenceReason).toBeDefined();
    expect(absenceReason?.description).toContain('15');
  });

  // ==========================================================================
  // Test 3: Scenario 1 — New Reason Generates Auto Reminder Date
  // ==========================================================================
  it('3. Scenario 1: should generate automatic reminder date and isAutoReminder = true for new reasons', () => {
    const rawReasons: RawDelayReason[] = [
      {
        reasonType: 'دورة',
        description: 'عدم اجتياز الدورة التدريبية الحاكمة المقررة للدرجة: (دورة الترفيع)',
        affects: 'ترفيع',
        sourceReferenceId: 'course_دورة الترفيع'
      },
      {
        reasonType: 'عقوبة',
        description: 'تأخير الاستحقاق الإداري لمدة (3) شهر بسبب عقوبة انضباطية نافذة',
        affects: 'كلاهما',
        sourceReferenceId: 'penalty_delay_active'
      }
    ];

    const initialStore: PromotionDelayReasonEntity[] = [];
    const res = syncPromotionDelayReasons(101, rawReasons, initialStore, undefined, today);

    expect(res.added).toHaveLength(2);
    expect(res.updated).toHaveLength(0);
    expect(res.resolved).toHaveLength(0);

    const addedCourse = res.added.find(a => a.reasonType === 'دورة');
    expect(addedCourse).toBeDefined();
    expect(addedCourse?.isAutoReminder).toBe(true);
    expect(addedCourse?.isHidden).toBe(false);
    expect(addedCourse?.isResolved).toBe(false);
    // 2026-08-28 + 30 days = 2026-09-27
    expect(addedCourse?.reminderDate).toBe('2026-09-27');

    const addedPenalty = res.added.find(a => a.reasonType === 'عقوبة');
    expect(addedPenalty).toBeDefined();
    expect(addedPenalty?.isAutoReminder).toBe(true);
    // 2026-08-28 + 15 days = 2026-09-12
    expect(addedPenalty?.reminderDate).toBe('2026-09-12');
  });

  // ==========================================================================
  // Test 4: Scenario 2 & 3 — Recalculation Preserves Manual Date & isHidden
  // ==========================================================================
  it('4. Scenario 2 & 3: recalculation must preserve manually set reminder dates and isHidden status', () => {
    const existingStore: PromotionDelayReasonEntity[] = [
      {
        id: 1,
        employeeId: 101,
        reasonType: 'دورة',
        description: 'وصف قديم للدورة',
        affects: 'ترفيع',
        isHidden: true, // User previously hid this reason
        reminderDate: '2026-11-15', // User previously modified reminder date manually
        isAutoReminder: false,
        isResolved: false,
        resolvedAt: null,
        sourceReferenceId: 'course_دورة الترفيع'
      }
    ];

    const currentRawReasons: RawDelayReason[] = [
      {
        reasonType: 'دورة',
        description: 'وصف محدث للدورة التدريبية الحاكمة',
        affects: 'ترفيع',
        sourceReferenceId: 'course_دورة الترفيع'
      }
    ];

    const res = syncPromotionDelayReasons(101, currentRawReasons, existingStore, undefined, today);

    expect(res.added).toHaveLength(0);
    expect(res.updated).toHaveLength(1);
    expect(res.resolved).toHaveLength(0);

    const updated = res.updated[0];
    expect(updated.description).toBe('وصف محدث للدورة التدريبية الحاكمة');
    // STRICT PRESERVATION CHECKS:
    expect(updated.isHidden).toBe(true);
    expect(updated.reminderDate).toBe('2026-11-15');
    expect(updated.isAutoReminder).toBe(false);
    expect(updated.isResolved).toBe(false);
  });

  // ==========================================================================
  // Test 5: Scenario 4 — Pause Condition Vanishes -> Sets isResolved = true
  // ==========================================================================
  it('5. Scenario 4: should mark vanished delay reasons as resolved with timestamp', () => {
    const existingStore: PromotionDelayReasonEntity[] = [
      {
        id: 1,
        employeeId: 101,
        reasonType: 'دورة',
        description: 'دورة الترفيع',
        affects: 'ترفيع',
        isHidden: false,
        reminderDate: '2026-09-27',
        isAutoReminder: true,
        isResolved: false,
        resolvedAt: null,
        sourceReferenceId: 'course_دورة الترفيع'
      },
      {
        id: 2,
        employeeId: 101,
        reasonType: 'عقوبة',
        description: 'عقوبة تأخير',
        affects: 'كلاهما',
        isHidden: false,
        reminderDate: '2026-09-12',
        isAutoReminder: true,
        isResolved: false,
        resolvedAt: null,
        sourceReferenceId: 'penalty_delay_active'
      }
    ];

    // Suppose the course requirement is now completed, only the penalty remains
    const currentRawReasons: RawDelayReason[] = [
      {
        reasonType: 'عقوبة',
        description: 'عقوبة تأخير',
        affects: 'كلاهما',
        sourceReferenceId: 'penalty_delay_active'
      }
    ];

    const res = syncPromotionDelayReasons(101, currentRawReasons, existingStore, undefined, today);

    expect(res.added).toHaveLength(0);
    expect(res.updated).toHaveLength(1);
    expect(res.resolved).toHaveLength(1);

    const resolved = res.resolved[0];
    expect(resolved.id).toBe(1);
    expect(resolved.reasonType).toBe('دورة');
    expect(resolved.isResolved).toBe(true);
    expect(resolved.resolvedAt).toBeDefined();
    expect(typeof resolved.resolvedAt).toBe('string');
  });

  // ==========================================================================
  // Test 6: Scenario 5 — Overdue Reminders Filtering
  // ==========================================================================
  it('6. Scenario 5: should query due reminders matching reminderDate <= today, unresolved, and unhidden', () => {
    const allReasons: PromotionDelayReasonEntity[] = [
      {
        id: 1,
        employeeId: 101,
        reasonType: 'دورة',
        description: 'دورة مستحقة المراجعة اليوم',
        affects: 'ترفيع',
        isHidden: false,
        reminderDate: '2026-08-28', // Exact match today -> DUE
        isAutoReminder: true,
        isResolved: false,
        resolvedAt: null
      },
      {
        id: 2,
        employeeId: 102,
        reasonType: 'عقوبة',
        description: 'عقوبة انقضى موعد تذكيرها سابقاً',
        affects: 'كلاهما',
        isHidden: false,
        reminderDate: '2026-08-20', // Earlier than today -> OVERDUE (DUE)
        isAutoReminder: false,
        isResolved: false,
        resolvedAt: null
      },
      {
        id: 3,
        employeeId: 103,
        reasonType: 'اجازة',
        description: 'إجازة موعد تذكيرها مستقبلي',
        affects: 'كلاهما',
        isHidden: false,
        reminderDate: '2026-09-15', // Future -> NOT DUE
        isAutoReminder: true,
        isResolved: false,
        resolvedAt: null
      },
      {
        id: 4,
        employeeId: 104,
        reasonType: 'تقييم',
        description: 'تقييم محلول سابقاً',
        affects: 'ترفيع',
        isHidden: false,
        reminderDate: '2026-08-10',
        isAutoReminder: true,
        isResolved: true, // RESOLVED -> NOT DUE
        resolvedAt: '2026-08-25'
      },
      {
        id: 5,
        employeeId: 105,
        reasonType: 'غياب',
        description: 'غياب مخفي من العرض',
        affects: 'كلاهما',
        isHidden: true, // HIDDEN -> NOT DUE
        reminderDate: '2026-08-15',
        isAutoReminder: true,
        isResolved: false,
        resolvedAt: null
      }
    ];

    const dueReminders = allReasons.filter(item => {
      const isHidden = item.isHidden === true;
      const isResolved = item.isResolved === true;
      const rDate = item.reminderDate;
      if (isHidden || isResolved || !rDate) return false;
      return isDateOnOrAfter(today, rDate); // today >= reminderDate
    });

    expect(dueReminders).toHaveLength(2);
    expect(dueReminders.map(d => d.id)).toEqual([1, 2]);
  });
});
