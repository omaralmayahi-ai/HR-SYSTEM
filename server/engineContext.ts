import { employeeColumnsWithoutPhoto } from './util/employeeColumns.ts';
// server/engineContext.ts — مدخلات محرك الاستحقاق من القاعدة (إصلاح عاجل بعد B2، مراجعة B3: Blocker)
//
// كان triggerRecalculateEligibility يبني سياق المحرك (العقوبات، الإجازات، التقييمات، كتب الشكر، الشهادات،
// احتساب الخدمة، مسار الشهادة، الدورات الحاكمة، قواعد الترفيع) من مخازن الذاكرة. قبل B2 كانت تُملأ من
// local_storage.json (بيانات متأخرة)، وبعد B2e صارت فارغة عند الإقلاع ← موظف معاقب يظهر مستحقاً.
// الآن: كل شيء من القاعدة، لكل موظف، وأي فشل قراءة يُرمى (لا احتساب على بيانات ناقصة).
import { eq } from 'drizzle-orm';

const camelToSnake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

/** السجل بصيغتيه (camelCase من drizzle + snake_case) كما كانت مخازن الذاكرة تحفظه. */
export function bothCases<T extends Record<string, any>>(r: T): T & Record<string, any> {
  if (!r || typeof r !== 'object') return r;
  const out: Record<string, any> = { ...r };
  for (const [k, v] of Object.entries(r)) {
    const s = camelToSnake(k);
    if (!(s in out)) out[s] = v;
  }
  return out as any;
}

const parseJson = (v: any, fallback: any) => {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

export interface LoadedEngineContext {
  employee: any | null;
  weeksPerPromotion?: number; // B6 (ق-13)
  commendationTypes?: any[]; // B7 (ق-9)
  commendations: any[];
  penalties: any[];
  attendances: any[];
  evaluations: any[];
  leaves: any[];
  serviceCredits: any[];
  qualifications: any[];
  degreeTrackSnapshots: any[];
  specializationCredits: any[];
  governingCourses: any[];
  governingAssignments: Record<string, any>;
  gradeRules: any[];
  delayReasons: any[];
  commendationRules: Record<string, any> | null;
}

interface RawTables {
  emps: any[]; empCommendations: any[]; appreciations: any[]; penalties: any[]; attendance: any[];
  performance: any[]; annual: any[]; leaves: any[]; serviceCredits: any[]; serviceRecords: any[];
  qualifications: any[]; snapshots: any[]; specCredits: any[]; courses: any[]; assignments: any[];
  gradeRules: any[]; delayReasons: any[]; commendationRules: any[];
}

function assemble(t: RawTables): LoadedEngineContext {
  const governingAssignments: Record<string, any> = {};
  for (const row of t.assignments) {
    governingAssignments[row.employeeId] = {
      employeeId: row.employeeId,
      status: row.status || 'مشمول',
      exemptionReason: row.exemptionReason || '',
      exemptionOrderNumber: row.exemptionOrderNumber || '',
      exemptionOrderDate: row.exemptionOrderDate || '',
      assignedCourses: parseJson(row.assignedCourses, []),
      courseProgress: parseJson(row.courseProgress, {}),
      notes: row.notes || '',
    };
  }
  const cr = t.commendationRules[0];
  return {
    employee: t.emps[0] ? bothCases(t.emps[0]) : null,
    commendations: [...t.empCommendations, ...t.appreciations].map(bothCases),
    penalties: t.penalties.map(bothCases),
    attendances: t.attendance.map(bothCases),
    evaluations: [...t.performance, ...t.annual].map(bothCases),
    leaves: t.leaves.map(bothCases),
    serviceCredits: [...t.serviceCredits, ...t.serviceRecords].map(bothCases),
    qualifications: t.qualifications.map(bothCases),
    degreeTrackSnapshots: t.snapshots.map(bothCases),
    specializationCredits: t.specCredits.map(bothCases),
    governingCourses: t.courses.map((r: any) => bothCases({
      ...r,
      courseType: r.courseType || 'تخصصية',
      durationDays: r.durationDays ?? 5,
      durationHours: r.durationHours ?? 20,
      isRequiredForPromotion: r.isRequiredForPromotion ?? true,
      minPassingScore: r.minPassingScore ?? 60,
      status: r.status || 'فعال',
    })),
    governingAssignments,
    gradeRules: t.gradeRules.map(bothCases),
    delayReasons: t.delayReasons.map((r: any) => ({ ...r })),
    commendationRules: cr ? { ...bothCases(cr), degreeTrackAutoSettlement: Boolean(cr.degreeTrackAutoSettlement), degree_track_auto_settlement: Boolean(cr.degreeTrackAutoSettlement) } : null,
  };
}

const PER_EMPLOYEE: Array<[keyof RawTables, string]> = [
  ['empCommendations', 'employeeCommendations'], ['appreciations', 'appreciations'], ['penalties', 'penalties'],
  ['attendance', 'attendance'], ['performance', 'performanceEvaluations'], ['annual', 'annualEvaluations'],
  ['leaves', 'leaveRequests'], ['serviceCredits', 'serviceCredits'], ['serviceRecords', 'serviceRecords'],
  ['qualifications', 'qualifications'], ['snapshots', 'degreeTrackSnapshots'], ['specCredits', 'specializationCourseCredits'],
  ['assignments', 'governingCourseEmployeeAssignments'], ['delayReasons', 'promotionDelayReasons'],
];

/** سياق موظف واحد (المسارات الفردية: إضافة عقوبة، اعتماد، عرض أسباب التأخير). */
export async function loadEngineContext(db: any, schema: any, empId: number): Promise<LoadedEngineContext> {
  const results = await Promise.all([
    db.select().from(schema.employees).where(eq(schema.employees.id, empId)),
    ...PER_EMPLOYEE.map(([, tbl]) => db.select().from(schema[tbl]).where(eq(schema[tbl].employeeId, empId))),
    db.select().from(schema.governingCourses),
    db.select().from(schema.gradePromotionRules),
    db.select().from(schema.commendationRulesSettings).limit(1),
    loadWeeksPerPromotion(db, schema),
    schema.commendationTypes ? db.select().from(schema.commendationTypes) : Promise.resolve([]),
  ]);
  const t: any = { emps: results[0] };
  PER_EMPLOYEE.forEach(([key], i) => { t[key] = results[i + 1]; });
  const n = PER_EMPLOYEE.length + 1;
  t.courses = results[n]; t.gradeRules = results[n + 1]; t.commendationRules = results[n + 2];
  return { ...assemble(t as RawTables), weeksPerPromotion: results[n + 3], commendationTypes: (results[n + 4] || []).map(bothCases) };
}

/**
 * سياق كل الموظفين بقراءة واحدة لكل جدول (قائمة الاستحقاق: 6225 موظفاً).
 * بدلها كانت ستكون 18 استعلاماً لكل موظف.
 */
export async function loadAllEngineContexts(db: any, schema: any) {
  const results = await Promise.all([
    (employeeColumnsWithoutPhoto(schema) ? db.select(employeeColumnsWithoutPhoto(schema)) : db.select()).from(schema.employees), // أداء: بلا الصورة
    ...PER_EMPLOYEE.map(([, tbl]) => db.select().from(schema[tbl])),
    db.select().from(schema.governingCourses),
    db.select().from(schema.gradePromotionRules),
    db.select().from(schema.commendationRulesSettings).limit(1),
    loadWeeksPerPromotion(db, schema),
    schema.commendationTypes ? db.select().from(schema.commendationTypes) : Promise.resolve([]),
  ]);
  const employees: any[] = results[0];
  const grouped: Record<string, Map<number, any[]>> = {};
  PER_EMPLOYEE.forEach(([key], i) => {
    const m = new Map<number, any[]>();
    for (const r of results[i + 1]) { const k = Number(r.employeeId); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    grouped[key] = m;
  });
  const n = PER_EMPLOYEE.length + 1;
  const shared = { courses: results[n], gradeRules: results[n + 1], commendationRules: results[n + 2] };
  const byId = new Map<number, any>(employees.map((e: any) => [Number(e.id), e]));
  return {
    employees,
    get(empId: number): LoadedEngineContext {
      const t: any = { emps: byId.has(empId) ? [byId.get(empId)] : [], ...shared };
      for (const [key] of PER_EMPLOYEE) t[key] = grouped[key].get(empId) || [];
      return { ...assemble(t as RawTables), weeksPerPromotion: results[n + 3], commendationTypes: (results[n + 4] || []).map(bothCases) };
    },
  };
}

/**
 * مدخلات محاكاة مسار الشهادة من سياق القاعدة (بدل مخازن الذاكرة الفارغة منذ B2).
 * `mapLeave` = toEngineLeave (يُمرَّر لتجنب استيراد دائري).
 */
export function degreeTrackInputs(ctx: LoadedEngineContext | null | undefined, mapLeave: (l: any) => any) {
  const snaps = ctx?.degreeTrackSnapshots || [];
  const activeSnap = snaps.find((s: any) => s.status === 'نشط' || !s.status) || null;
  return {
    activeSnap,
    inputs: {
      specializationCredits: ctx?.specializationCredits || [],
      penalties: ctx?.penalties || [],
      leaves: (ctx?.leaves || []).map(mapLeave),
      attendances: ctx?.attendances || [],
      weeksPerPromotion: ctx?.weeksPerPromotion ?? 2,
    },
  };
}

export const WEEKS_PER_PROMOTION_KEY = 'degree_track.weeks_per_promotion';

/** B6 (ق-13): أسابيع دورة الاختصاص لكل ترفيع من الإعدادات (الافتراضي 2). */
export async function loadWeeksPerPromotion(db: any, schema: any): Promise<number> {
  if (!schema?.appSettingsDocuments) return 2;
  const [row] = await db.select().from(schema.appSettingsDocuments).where(eq(schema.appSettingsDocuments.key, WEEKS_PER_PROMOTION_KEY));
  const w = Number(row?.value?.weeks);
  return Number.isFinite(w) && w >= 0 ? w : 2;
}
