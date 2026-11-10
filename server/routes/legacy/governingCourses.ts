// server/routes/legacy/governingCourses.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';
import type { AuthRequest } from '../../../src/middleware/auth.ts';

export function registerGoverningCoursesRoutes(app: Express, deps: any) {
  const {
    DEFAULT_GOVERNING_COURSES, asc, buildRefContext, checkReferentialUsage, db, ensureGoverningCoursesTable,
    eq, mem, requireAdmin, requireAuth, schema, sendRouteError,
  } = deps;

  app.get('/api/governing-courses', requireAuth, async (req, res) => {
    const gradeQuery = req.query.grade ? parseInt(req.query.grade as string) : undefined;
    try {
      await ensureGoverningCoursesTable();
      let query = db.select().from(schema.governingCourses);
      if (gradeQuery && !isNaN(gradeQuery)) {
        query = db.select().from(schema.governingCourses).where(eq(schema.governingCourses.grade, gradeQuery)) as any;
      }
      let results = await query.orderBy(asc(schema.governingCourses.grade), asc(schema.governingCourses.id));

      if (results.length === 0 && (!gradeQuery || isNaN(gradeQuery))) {
        await db.insert(schema.governingCourses).values(DEFAULT_GOVERNING_COURSES as any).catch(() => {});
        results = await db.select().from(schema.governingCourses).orderBy(asc(schema.governingCourses.grade), asc(schema.governingCourses.id)).catch(() => []);
      }

      if (results.length > 0) {
        const mapped = results.map(r => ({
          id: r.id,
          grade: r.grade,
          courseName: r.courseName || (r as any).course_name,
          course_name: r.courseName || (r as any).course_name,
          courseType: r.courseType || (r as any).course_type || 'تخصصية',
          course_type: r.courseType || (r as any).course_type || 'تخصصية',
          durationDays: r.durationDays !== undefined && r.durationDays !== null ? r.durationDays : ((r as any).duration_days || 5),
          duration_days: r.durationDays !== undefined && r.durationDays !== null ? r.durationDays : ((r as any).duration_days || 5),
          durationHours: r.durationHours !== undefined && r.durationHours !== null ? r.durationHours : ((r as any).duration_hours || 20),
          duration_hours: r.durationHours !== undefined && r.durationHours !== null ? r.durationHours : ((r as any).duration_hours || 20),
          isRequiredForPromotion: r.isRequiredForPromotion !== undefined && r.isRequiredForPromotion !== null ? r.isRequiredForPromotion : ((r as any).is_required_for_promotion ?? true),
          is_required_for_promotion: r.isRequiredForPromotion !== undefined && r.isRequiredForPromotion !== null ? r.isRequiredForPromotion : ((r as any).is_required_for_promotion ?? true),
          minPassingScore: r.minPassingScore !== undefined && r.minPassingScore !== null ? r.minPassingScore : ((r as any).min_passing_score || 60),
          min_passing_score: r.minPassingScore !== undefined && r.minPassingScore !== null ? r.minPassingScore : ((r as any).min_passing_score || 60),
          description: r.description,
          status: r.status || 'فعال',
          createdAt: r.createdAt
        }));

        return res.json(mapped);
      }
    } catch (error: any) {
      // Quiet fallback to in-memory store if DB query fails or table does not exist
    }

    // Graceful fallback to memory store
    let filteredMemory = mem.inMemoryGoverningCourses;
    if (gradeQuery && !isNaN(gradeQuery)) {
      filteredMemory = mem.inMemoryGoverningCourses.filter(c => c.grade === gradeQuery);
    }
    return res.json(filteredMemory);
  });

  app.post('/api/governing-courses', requireAuth, requireAdmin, async (req, res) => {
    const data = req.body;
    const grade = parseInt(data.grade);
    if (isNaN(grade)) return res.status(400).json({ error: 'الدرجة الوظيفية مطلوبة بشكل صحيح' });
    if (!data.courseName && !data.course_name) return res.status(400).json({ error: 'اسم الدورة الحاكمة مطلوب' });

    const courseName = data.courseName || data.course_name;
    const courseType = data.courseType || data.course_type || 'تخصصية';
    const durationDays = parseInt(data.durationDays || data.duration_days || '5');
    const durationHours = parseInt(data.durationHours || data.duration_hours || '20');
    const isRequiredForPromotion = data.isRequiredForPromotion !== undefined ? Boolean(data.isRequiredForPromotion) : (data.is_required_for_promotion !== undefined ? Boolean(data.is_required_for_promotion) : true);
    const minPassingScore = parseInt(data.minPassingScore || data.min_passing_score || '60');
    const description = data.description || '';
    const status = data.status || 'فعال';

    try {
      await ensureGoverningCoursesTable();
      const values = {
        grade,
        courseName,
        courseType,
        durationDays,
        durationHours,
        isRequiredForPromotion,
        minPassingScore,
        description,
        status
      };

      const [inserted] = await db.insert(schema.governingCourses).values(values as any).returning();
      if (inserted) {
        return res.json(inserted);
      }
    } catch (error: any) {
      // Quiet fallback
    }

    const newMemoryItem = {
      id: Date.now(),
      grade,
      courseName,
      course_name: courseName,
      courseType,
      course_type: courseType,
      durationDays,
      duration_days: durationDays,
      durationHours,
      duration_hours: durationHours,
      isRequiredForPromotion,
      is_required_for_promotion: isRequiredForPromotion,
      minPassingScore,
      min_passing_score: minPassingScore,
      description,
      status,
      createdAt: new Date().toISOString()
    };
    mem.inMemoryGoverningCourses.push(newMemoryItem);
    return res.json(newMemoryItem);
  });

  app.put('/api/governing-courses/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;

    if (data.status === 'غير فعال' || data.status === 'معطل') {
      const refCheck = checkReferentialUsage('governing_courses', id, true, await buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }
    }

    const updateValues: any = {};
    if (data.grade !== undefined) updateValues.grade = parseInt(data.grade);
    if (data.courseName !== undefined || data.course_name !== undefined) updateValues.courseName = data.courseName || data.course_name;
    if (data.courseType !== undefined || data.course_type !== undefined) updateValues.courseType = data.courseType || data.course_type;
    if (data.durationDays !== undefined || data.duration_days !== undefined) updateValues.durationDays = parseInt(data.durationDays || data.duration_days);
    if (data.durationHours !== undefined || data.duration_hours !== undefined) updateValues.durationHours = parseInt(data.durationHours || data.duration_hours);
    if (data.isRequiredForPromotion !== undefined) updateValues.isRequiredForPromotion = Boolean(data.isRequiredForPromotion);
    if (data.is_required_for_promotion !== undefined) updateValues.isRequiredForPromotion = Boolean(data.is_required_for_promotion);
    if (data.minPassingScore !== undefined || data.min_passing_score !== undefined) updateValues.minPassingScore = parseInt(data.minPassingScore || data.min_passing_score);
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.status !== undefined) updateValues.status = data.status;

    try {
      await ensureGoverningCoursesTable();
      const [updated] = await db.update(schema.governingCourses)
        .set(updateValues)
        .where(eq(schema.governingCourses.id, id))
        .returning();

      if (updated) {
        return res.json(updated);
      }
    } catch (error: any) {
      // Quiet fallback
    }

    const idx = mem.inMemoryGoverningCourses.findIndex(c => c.id === id);
    if (idx !== -1) {
      mem.inMemoryGoverningCourses[idx] = {
        ...mem.inMemoryGoverningCourses[idx],
        ...updateValues,
        course_name: updateValues.courseName || mem.inMemoryGoverningCourses[idx].courseName,
        course_type: updateValues.courseType || mem.inMemoryGoverningCourses[idx].courseType,
        duration_days: updateValues.durationDays !== undefined ? updateValues.durationDays : mem.inMemoryGoverningCourses[idx].durationDays,
        duration_hours: updateValues.durationHours !== undefined ? updateValues.durationHours : mem.inMemoryGoverningCourses[idx].durationHours,
        is_required_for_promotion: updateValues.isRequiredForPromotion !== undefined ? updateValues.isRequiredForPromotion : mem.inMemoryGoverningCourses[idx].isRequiredForPromotion,
        min_passing_score: updateValues.minPassingScore !== undefined ? updateValues.minPassingScore : mem.inMemoryGoverningCourses[idx].minPassingScore,
      };
      return res.json(mem.inMemoryGoverningCourses[idx]);
    }
    return res.status(404).json({ error: 'Governing course not found' });
  });

  app.delete('/api/governing-courses/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const refCheck = checkReferentialUsage('governing_courses', id, false, await buildRefContext());
    if (!refCheck.canProceed) {
      return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
    }

    try {
      await ensureGoverningCoursesTable();
      await db.delete(schema.governingCourses).where(eq(schema.governingCourses.id, id));
    } catch (error: any) {
      // Quiet fallback
    }

    mem.inMemoryGoverningCourses = mem.inMemoryGoverningCourses.filter(c => c.id !== id);
    return res.json({ success: true });
  });

  app.post('/api/governing-courses/reset-defaults', requireAuth, requireAdmin, async (req, res) => {
    try {
      await ensureGoverningCoursesTable();
      // إعادة الضبط داخل معاملة وبطريقة upsert (بالدرجة + اسم الدورة): تُحدَّث الدورات الافتراضية
      // الموجودة وتُضاف الناقصة، دون حذف الجدول كاملاً (تبقى المعرّفات ثابتة ولا تضيع البيانات عند الفشل).
      const results = await db.transaction(async (tx) => {
        const existing = await tx.select().from(schema.governingCourses);
        for (const item of DEFAULT_GOVERNING_COURSES as any[]) {
          const match = existing.find(r => r.grade === item.grade && String(r.courseName || '').trim() === String(item.courseName).trim());
          if (match) {
            await tx.update(schema.governingCourses).set({ ...item, status: 'فعال' }).where(eq(schema.governingCourses.id, match.id));
          } else {
            await tx.insert(schema.governingCourses).values({ ...item, status: 'فعال' });
          }
        }
        return tx.select().from(schema.governingCourses).orderBy(asc(schema.governingCourses.grade), asc(schema.governingCourses.id));
      });
      try {
        await db.insert(schema.activityLogs).values({ action: 'إعادة ضبط الدورات الحاكمة', userEmail: (req as AuthRequest).user?.username || 'admin', details: `upsert لـ ${DEFAULT_GOVERNING_COURSES.length} دورة افتراضية` });
      } catch (logErr: any) {
        console.warn('[ACTIVITY-LOG] تعذّر تسجيل إعادة ضبط الدورات الحاكمة:', logErr?.message);
      }
      return res.json(results);
    } catch (error: any) {
      return sendRouteError(res, error, 'إعادة ضبط الدورات الحاكمة'); // B2d: لا قراءة من الذاكرة
    }

    mem.inMemoryGoverningCourses = DEFAULT_GOVERNING_COURSES.map((item, idx) => ({
      id: idx + 1,
      grade: item.grade,
      courseName: item.courseName,
      course_name: item.courseName,
      courseType: item.courseType,
      course_type: item.courseType,
      durationDays: item.durationDays,
      duration_days: item.durationDays,
      durationHours: item.durationHours,
      duration_hours: item.durationHours,
      isRequiredForPromotion: item.isRequiredForPromotion,
      is_required_for_promotion: item.isRequiredForPromotion,
      minPassingScore: item.minPassingScore,
      min_passing_score: item.minPassingScore,
      description: item.description,
      status: 'فعال',
      createdAt: new Date().toISOString()
    }));

    return res.json(mem.inMemoryGoverningCourses);
  });
}
