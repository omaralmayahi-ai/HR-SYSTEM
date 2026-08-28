import { describe, it, expect } from 'vitest';
import { recalculateEligibilitySync, EngineContextData, formatDateString, isDateOnOrAfter } from './promotionEngine';
import { calculateDegreeTrackSimulation, processDegreeTrackSettlement } from './degreeTrackEngine';
import { extractDelayReasonsFromContext, syncPromotionDelayReasons } from './promotionDelayReasonsEngine';

describe('Server Endpoints Logic Verification', () => {
  it('should calculate eligibility and sync promotion delay reasons without throwing', () => {
    const sampleEmp = {
      id: 1,
      fullName: 'عمر محمود سلمان',
      grade: 3,
      step: 4,
      lastPromotionDate: '2022-01-01',
      lastIncrementDate: '2025-01-01',
      status: 'فعال'
    };

    const context: EngineContextData = {
      commendations: [],
      penalties: [],
      attendances: [],
      evaluations: [],
      leaves: [],
      serviceCredits: [],
      qualifications: [],
      degreeTrackSnapshots: [],
      specializationCredits: [],
      governingCourses: [],
      governingAssignments: [],
      gradeRules: []
    };

    const fullResult = recalculateEligibilitySync(sampleEmp, context);
    expect(fullResult).toBeDefined();
    expect(fullResult.employeeId).toBe(1);

    const rawReasons = extractDelayReasonsFromContext(sampleEmp, fullResult, context, undefined);
    expect(Array.isArray(rawReasons)).toBe(true);

    const delaySyncRes = syncPromotionDelayReasons(
      1,
      rawReasons,
      [],
      {}
    );
    expect(delaySyncRes).toBeDefined();
    expect(Array.isArray(delaySyncRes.updatedStore)).toBe(true);
  });

  it('should filter due reminders without throwing', () => {
    const today = formatDateString(new Date());
    const store = [
      {
        id: 1,
        employeeId: 1,
        reasonType: 'دورة',
        description: 'دورة حتمية للترفيع',
        affects: 'ترفيع',
        isHidden: false,
        isResolved: false,
        reminderDate: '2025-01-01'
      }
    ];

    const dueItems = store.filter(item => {
      const isHidden = item.isHidden === true;
      const isResolved = item.isResolved === true;
      const rDate = item.reminderDate;
      if (isHidden || isResolved || !rDate) return false;
      return isDateOnOrAfter(today, rDate);
    });

    expect(dueItems.length).toBe(1);
    expect(dueItems[0].reasonType).toBe('دورة');
  });
});
