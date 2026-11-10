// server/trainingSync.ts
// Sync of a passed training enrolment into the employee's training_courses record.
// Both result vocabularies in use are accepted: the Training screen writes "ناجح"/"راسب";
// older server code used "اجتاز"/"مشارك".

const PASSING_RESULTS = new Set(['ناجح', 'اجتاز', 'مشارك', 'ناجحة', 'مجتاز']);

export function isPassingEnrollmentResult(result: any): boolean {
  if (result === null || result === undefined) return false;
  return PASSING_RESULTS.has(String(result).trim());
}

/** Builds the training_courses row for an enrolment (keyed by employee + source training id). */
export function buildTrainingCourseFromEnrollment(course: any, enrollment: any) {
  const location = course.location || (course.locationType === 'موقعي' ? 'داخل الشركة' : (course.locationType ? 'خارج الشركة' : 'غير معروف'));
  return {
    employeeId: enrollment.employeeId,
    sourceTrainingId: course.id,
    courseName: course.courseName,
    courseType: course.courseType || 'حضوري',
    provider: course.provider || 'قسم التدريب والتطوير',
    location,
    startDate: course.startDate || '',
    endDate: course.endDate || course.startDate || '',
    durationDays: parseInt(String(course.days ?? '')) || 0,
    average: enrollment.score !== undefined && enrollment.score !== null ? String(enrollment.score) : '',
    grade: enrollment.grade || enrollment.result || null,
    rank: 'مشارك'
  };
}

/**
 * Upserts (or removes, when the result is no longer a pass) the synced training_courses row
 * for one enrolment. Must run inside the caller's transaction (`tx`) so errors surface.
 */
export async function syncEnrollmentToTrainingCourses(tx: any, schema: any, ops: { eq: any; and: any }, enrollment: any) {
  if (!enrollment || !enrollment.employeeId || !enrollment.trainingId) return { action: 'skipped' as const };
  const { eq, and } = ops;
  const existing = await tx.select().from(schema.trainingCourses).where(and(
    eq(schema.trainingCourses.employeeId, enrollment.employeeId),
    eq(schema.trainingCourses.sourceTrainingId, enrollment.trainingId)
  ));

  if (!isPassingEnrollmentResult(enrollment.result)) {
    if (existing.length > 0) {
      await tx.delete(schema.trainingCourses).where(and(
        eq(schema.trainingCourses.employeeId, enrollment.employeeId),
        eq(schema.trainingCourses.sourceTrainingId, enrollment.trainingId)
      ));
      return { action: 'removed' as const };
    }
    return { action: 'skipped' as const };
  }

  const [course] = await tx.select().from(schema.trainings).where(eq(schema.trainings.id, enrollment.trainingId)).limit(1);
  if (!course) return { action: 'skipped' as const };
  const row = buildTrainingCourseFromEnrollment(course, enrollment);

  if (existing.length > 0) {
    await tx.update(schema.trainingCourses).set(row).where(eq(schema.trainingCourses.id, existing[0].id));
    // Clean up duplicates created by older versions (one insert per edit)
    for (const extra of existing.slice(1)) {
      await tx.delete(schema.trainingCourses).where(eq(schema.trainingCourses.id, extra.id));
    }
    return { action: 'updated' as const };
  }
  await tx.insert(schema.trainingCourses).values(row);
  return { action: 'inserted' as const };
}

/** B6 (ق-13): عدد أسابيع دورة الاختصاص من مدتها (الأسبوع = 5 أيام عمل؛ الشهر = 4 أسابيع). */
export function specializationWeeksOf(course: any): number {
  const v = Number(course?.durationValue ?? course?.duration_value ?? 0);
  const unit = String(course?.durationUnit ?? course?.duration_unit ?? 'بالأيام');
  if (!(v > 0)) {
    const days = Number(course?.days ?? 0);
    return days > 0 ? Math.max(1, Math.floor(days / 5)) : 0;
  }
  if (unit.includes('أسابيع') || unit.includes('اسابيع') || unit.includes('أسبوع')) return Math.floor(v);
  if (unit.includes('أشهر') || unit.includes('اشهر') || unit.includes('شهر')) return Math.floor(v * 4);
  return Math.max(1, Math.floor(v / 5));
}

export function isSpecializationCourse(course: any): boolean {
  return /اختصاص/.test(String(course?.category ?? ''));
}

/**
 * B6 (ق-13): رصيد دورة الاختصاص يتولّد آلياً إذا للموظف تسجيل مجتاز (أي تسجيل، لأن التسجيل قد يتكرر)
 * بدورة فئتها «اختصاص»، ويُحذف إذا ما بقى تسجيل مجتاز أو تغيّرت الدورة. الرصيد الملغى من المسؤول
 * (is_cancelled) ما يُعاد إنشاؤه ولا يُحذف. يرجع معرّف الموظف المتأثر لإعادة احتساب الأهلية.
 */
export async function syncSpecializationCredit(tx: any, schema: any, ops: { eq: any; and: any }, ref: { employeeId?: any; trainingId?: any }) {
  const employeeId = Number(ref?.employeeId), trainingId = Number(ref?.trainingId);
  if (!employeeId || !trainingId) return { action: 'skipped' as const };
  const { eq, and } = ops;
  const C = schema.specializationCourseCredits;
  const where = and(eq(C.employeeId, employeeId), eq(C.sourceTrainingId, trainingId));
  const [existing] = await tx.select().from(C).where(where);
  if (existing?.isCancelled) return { action: 'kept-cancelled' as const, employeeId };
  const [course] = await tx.select().from(schema.trainings).where(eq(schema.trainings.id, trainingId)).limit(1);
  const enrollments = await tx.select().from(schema.trainingEnrollments)
    .where(and(eq(schema.trainingEnrollments.employeeId, employeeId), eq(schema.trainingEnrollments.trainingId, trainingId)));
  const passed = enrollments.some((e: any) => isPassingEnrollmentResult(e.result));
  const weeks = course && isSpecializationCourse(course) ? specializationWeeksOf(course) : 0;
  if (!passed || weeks <= 0) {
    if (existing) { await tx.delete(C).where(where); return { action: 'removed' as const, employeeId }; }
    return { action: 'skipped' as const };
  }
  const row = {
    employeeId, sourceTrainingId: trainingId, source: 'آلي من التدريب',
    weeks, courseName: course.courseName, courseDate: course.endDate || course.startDate || null,
    provider: course.provider || null, notes: 'رصيد آلي من دورة اختصاص مجتازة (ق-13)',
  };
  if (existing) {
    const same = existing.weeks === row.weeks && existing.courseName === row.courseName && existing.courseDate === row.courseDate;
    if (!same) await tx.update(C).set(row).where(eq(C.id, existing.id));
    return { action: same ? 'unchanged' as const : 'updated' as const, employeeId };
  }
  await tx.insert(C).values(row);
  return { action: 'inserted' as const, employeeId };
}

/** بعد تعديل دورة أو حذفها: إعادة مزامنة أرصدة كل موظف مسجّل بها أو له رصيد آلي منها. */
export async function resyncTrainingCredits(tx: any, schema: any, ops: { eq: any; and: any }, trainingId: number): Promise<number[]> {
  const { eq } = ops;
  const enr = await tx.select({ e: schema.trainingEnrollments.employeeId }).from(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.trainingId, trainingId));
  const cr = await tx.select({ e: schema.specializationCourseCredits.employeeId }).from(schema.specializationCourseCredits).where(eq(schema.specializationCourseCredits.sourceTrainingId, trainingId));
  const ids = [...new Set([...enr, ...cr].map((r: any) => Number(r.e)).filter(Boolean))];
  const affected: number[] = [];
  for (const employeeId of ids) {
    const r: any = await syncSpecializationCredit(tx, schema, ops, { employeeId, trainingId });
    if (r.action === 'inserted' || r.action === 'updated' || r.action === 'removed') affected.push(employeeId);
  }
  return affected;
}
