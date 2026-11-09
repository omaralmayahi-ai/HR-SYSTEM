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
