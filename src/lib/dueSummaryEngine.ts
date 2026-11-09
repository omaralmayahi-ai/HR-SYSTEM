// src/lib/dueSummaryEngine.ts
/**
 * Due Summary & Read-Only Eligibility Engine
 * محرك احتساب ملخص الاستحقاقات وقراءة الأهلية النقية دون أي آثار جانبية
 */

import {
  recalculateEligibilitySync,
  EngineContextData,
  EmployeeEntity,
  CommendationRecord,
  PenaltyRecord,
  AttendanceRecord,
  EvaluationRecord,
  LeaveRecord,
  ServiceCreditRecord,
  QualificationRecord,
  GoverningCourseRecord,
  GradePromotionRuleRecord
} from './promotionEngine';

export interface DueSummaryCache {
  totalIncrement: number;
  totalPromotion: number;
  totalSettlement: number;
  totalDue: number;
  lastCalculated: number;
}

export interface MemoryContextSources {
  employees: EmployeeEntity[];
  commendations?: CommendationRecord[];
  penalties?: PenaltyRecord[];
  attendances?: AttendanceRecord[];
  evaluations?: EvaluationRecord[];
  leaves?: LeaveRecord[];
  serviceCredits?: ServiceCreditRecord[];
  qualifications?: QualificationRecord[];
  degreeTrackSnapshots?: any[];
  specializationCredits?: any[];
  governingCourses?: GoverningCourseRecord[];
  governingAssignments?: Record<string, any>;
  gradeRules?: GradePromotionRuleRecord[];
  today?: string;
}

/**
 * Builds an O(N) Map indexed by employeeId from multiple array sources
 */
export function buildEmpIdMap(sources: any[][]): Map<number, any[]> {
  const map = new Map<number, any[]>();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!item) continue;
      const rawId = item.employee_id !== undefined ? item.employee_id : (item.employeeId !== undefined ? item.employeeId : item.employeeID);
      const empId = parseInt(String(rawId));
      if (!empId || isNaN(empId)) continue;
      let list = map.get(empId);
      if (!list) {
        list = [];
        map.set(empId, list);
      }
      list.push(item);
    }
  }
  return map;
}

/**
 * Pure Read-Only Promotion & Increment Eligibility Calculation for a single employee
 * Zero DB writes, Zero memory mutations, Zero storage saves, Zero cache invalidations
 */
export function computeEmployeeEligibilityPure(
  employeeId: number | string,
  sources: MemoryContextSources
) {
  if (!employeeId) return null;
  const empIdNum = parseInt(String(employeeId));
  if (isNaN(empIdNum)) return null;

  const emp = (sources.employees || []).find(e => parseInt(String(e.id)) === empIdNum);
  if (!emp) return null;

  const commendations = (sources.commendations || []).filter(c => parseInt(String(c.employee_id || c.employeeId)) === empIdNum);
  const penalties = (sources.penalties || []).filter(p => parseInt(String(p.employee_id || p.employeeId)) === empIdNum);
  const attendances = (sources.attendances || []).filter(a => parseInt(String(a.employee_id || a.employeeId)) === empIdNum);
  const evaluations = (sources.evaluations || []).filter(e => parseInt(String(e.employee_id || e.employeeId)) === empIdNum);
  const leaves = (sources.leaves || []).filter(l => parseInt(String(l.employee_id || l.employeeId)) === empIdNum);
  const serviceCredits = (sources.serviceCredits || []).filter(s => parseInt(String(s.employee_id || s.employeeId)) === empIdNum);
  const qualifications = (sources.qualifications || []).filter(q => parseInt(String(q.employee_id || q.employeeId)) === empIdNum);
  const degreeTrackSnapshots = (sources.degreeTrackSnapshots || []).filter(s => parseInt(String(s.employee_id || s.employeeId)) === empIdNum);
  const specializationCredits = (sources.specializationCredits || []).filter(c => parseInt(String(c.employee_id || c.employeeId)) === empIdNum);

  const context: EngineContextData = {
    commendations,
    penalties,
    attendances,
    evaluations,
    leaves,
    serviceCredits,
    qualifications,
    degreeTrackSnapshots,
    specializationCredits,
    governingCourses: sources.governingCourses || [],
    governingAssignments: sources.governingAssignments || {},
    gradeRules: sources.gradeRules || [],
    today: sources.today
  };

  return recalculateEligibilitySync(emp, context);
}

/**
 * Pure Fast Calculation of the Entire Due List and Summary from Memory
 */
export function computeDueListAndSummaryFromMemory(sources: MemoryContextSources) {
  const employees = sources.employees || [];
  const commendationsMap = buildEmpIdMap([sources.commendations || []]);
  const penaltiesMap = buildEmpIdMap([sources.penalties || []]);
  const attendancesMap = buildEmpIdMap([sources.attendances || []]);
  const evaluationsMap = buildEmpIdMap([sources.evaluations || []]);
  const leavesMap = buildEmpIdMap([sources.leaves || []]);
  const serviceCreditsMap = buildEmpIdMap([sources.serviceCredits || []]);
  const qualificationsMap = buildEmpIdMap([sources.qualifications || []]);
  const degreeTrackSnapshotsMap = buildEmpIdMap([sources.degreeTrackSnapshots || []]);
  const specializationCreditsMap = buildEmpIdMap([sources.specializationCredits || []]);

  let totalIncrement = 0;
  let totalPromotion = 0;
  let totalSettlement = 0;

  const dueForIncrement: any[] = [];
  const dueForPromotion: any[] = [];
  const dueForSettlement: any[] = [];

  for (const emp of employees) {
    try {
      const empId = parseInt(String(emp.id));
      if (!empId || isNaN(empId)) continue;

      const empStatus = emp.status || 'مستمر';
      if (['منتهية_خدمته', 'متقاعد', 'مفصول', 'مستقيل', 'متوفى'].includes(empStatus)) {
        continue;
      }

      const context: EngineContextData = {
        commendations: commendationsMap.get(empId) || [],
        penalties: penaltiesMap.get(empId) || [],
        attendances: attendancesMap.get(empId) || [],
        evaluations: evaluationsMap.get(empId) || [],
        leaves: leavesMap.get(empId) || [],
        serviceCredits: serviceCreditsMap.get(empId) || [],
        qualifications: qualificationsMap.get(empId) || [],
        degreeTrackSnapshots: degreeTrackSnapshotsMap.get(empId) || [],
        specializationCredits: specializationCreditsMap.get(empId) || [],
        governingCourses: sources.governingCourses || [],
        governingAssignments: sources.governingAssignments || {},
        gradeRules: sources.gradeRules || [],
        today: sources.today
      };

      const eligibility = recalculateEligibilitySync(emp, context);

      if (eligibility?.increment?.eligibilityStatus === 'مستحق_للعلاوة' && eligibility?.increment?.isIncrementEligible) {
        totalIncrement++;
        dueForIncrement.push({
          employeeId: empId,
          dueDate: eligibility.increment.nextIncrementDueDate,
          name: emp.fullName || emp.full_name || emp.name
        });
      }

      if (eligibility?.promotion?.eligibilityStatus === 'مستحق_للترفيع' && eligibility?.promotion?.isPromotionEligible) {
        totalPromotion++;
        dueForPromotion.push({
          employeeId: empId,
          dueDate: eligibility.promotion.nextPromotionDueDate,
          name: emp.fullName || emp.full_name || emp.name
        });
      }
    } catch (e) {
      // Continue on isolated individual error
    }
  }

  const summary: DueSummaryCache = {
    totalIncrement,
    totalPromotion,
    totalSettlement,
    totalDue: totalIncrement + totalPromotion + totalSettlement,
    lastCalculated: Date.now()
  };

  return {
    dueForIncrement,
    dueForPromotion,
    dueForSettlement,
    summary
  };
}
