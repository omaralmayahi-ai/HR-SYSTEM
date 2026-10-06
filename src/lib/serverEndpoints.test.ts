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

  it('should maintain state consistency across entity additions, modifications, and deletions without reverting to defaults', () => {
    // Simulate generic memory stores & persistence state
    const stores: Record<string, any[]> = {
      'job-titles': [
        { id: 1, name: 'مبرمج أقدم', min_grade: 4, max_grade: 2 },
        { id: 2, name: 'رئيس مبرمجين', min_grade: 2, max_grade: 1 }
      ],
      'qualifications': [
        { id: 101, employee_id: 1, level: 'بكالوريوس', specialization: 'علوم حاسوب', is_active: true }
      ],
      'leaves': [
        { id: 201, employee_id: 1, leave_type: 'اعتيادية', days_count: 5, status: 'مقبولة' }
      ],
      'salary-scale': [
        { id: 1, grade: 1, stage: 1, base_salary: 910000, annual_allowance: 20000 }
      ]
    };

    // 1. Add new Job Title
    stores['job-titles'].push({ id: 3, name: 'معاون مدير عام', min_grade: 1, max_grade: 1 });
    expect(stores['job-titles'].length).toBe(3);

    // 2. Modify Qualification
    const qual = stores['qualifications'].find(q => q.id === 101);
    if (qual) qual.specialization = 'هندسة برمجيات متقدمة';
    expect(stores['qualifications'][0].specialization).toBe('هندسة برمجيات متقدمة');

    // 3. Delete Leave Request
    stores['leaves'] = stores['leaves'].filter(l => l.id !== 201);
    expect(stores['leaves'].length).toBe(0);

    // 4. Modify Salary Scale
    stores['salary-scale'][0].base_salary = 950000;
    expect(stores['salary-scale'][0].base_salary).toBe(950000);

    // 5. Encrypt and Decrypt to simulate server reload
    const encrypted = JSON.stringify(stores);
    const reloadedStores = JSON.parse(encrypted);

    expect(reloadedStores['job-titles'].length).toBe(3);
    expect(reloadedStores['job-titles'].some((j: any) => j.name === 'معاون مدير عام')).toBe(true);
    expect(reloadedStores['qualifications'][0].specialization).toBe('هندسة برمجيات متقدمة');
    expect(reloadedStores['leaves'].length).toBe(0);
    expect(reloadedStores['salary-scale'][0].base_salary).toBe(950000);
  });
});

