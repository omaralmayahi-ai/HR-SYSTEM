// server/routes/legacy/trainings.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

import { syncSpecializationCredit, resyncTrainingCredits } from '../../trainingSync.ts';

export function registerTrainingsRoutes(app: Express, deps: any) {
  const {
    and, db, desc, enhanceEnrollmentRecord, enhanceTrainingRecord, eq,
    mapKeys, mem, requireAuth, requireWriter, respondIfDbWriteError, saveLocalDb,
    schema, sendRouteError, snakeToCamel, syncEnrollmentToTrainingCourses,
    triggerRecalculateEligibility, logRecalcError,
  } = deps;
  // B6 (ق-13): بعد تغيّر رصيد الاختصاص تُعاد أهلية الموظف
  const recalc = (ids: Array<number | undefined>) => {
    for (const id of new Set(ids.filter(Boolean))) triggerRecalculateEligibility?.(id).catch?.(logRecalcError);
  };

  // Training Courses API
  app.get('/api/trainings', requireAuth, async (req, res) => {
    try {
      const track = req.query.track as string;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const statusParam = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
      const conds: any[] = [];
      if (track) conds.push(eq(schema.trainings.track, track));
      if (year) conds.push(eq(schema.trainings.year, year));
      if (statusParam) conds.push(eq(schema.trainings.status, statusParam));
      const courses = conds.length > 0
        ? await db.select().from(schema.trainings).where(and(...conds)).orderBy(desc(schema.trainings.startDate))
        : await db.select().from(schema.trainings).orderBy(desc(schema.trainings.startDate));
      return res.json(courses.map(enhanceTrainingRecord));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const track = req.query.track as string;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    let list = mem.inMemoryTrainings;
    if (track) list = list.filter(c => c.track === track);
    if (year) list = list.filter(c => c.year === year);
    if (req.query.status && req.query.status !== 'all') list = list.filter(c => String(c.status || '') === String(req.query.status));
    res.json(list.map(enhanceTrainingRecord));
  });

  app.post('/api/trainings', requireAuth, requireWriter, async (req, res) => {
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainerId !== undefined && data.trainerId !== null) {
      if (typeof data.trainerId === 'string') {
        data.trainerId = data.trainerId.trim() ? parseInt(data.trainerId) || null : null;
      } else if (typeof data.trainerId === 'number' && isNaN(data.trainerId)) {
        data.trainerId = null;
      }
    } else {
      data.trainerId = null;
    }
    if (data.year !== undefined) data.year = parseInt(data.year) || 2026;
    if (data.days !== undefined) data.days = parseInt(data.days) || 1;
    if (data.hours !== undefined) data.hours = parseInt(data.hours) || 0;

    let newCourse: any = null;
    try {
      const [inserted] = await db.insert(schema.trainings).values(data).returning();
      newCourse = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create training course');
    }
    const newId = newCourse?.id || (mem.inMemoryTrainings.reduce((max, c) => Math.max(max, parseInt(c.id) || 0), 0) || 0) + 1;
    const memCourse = { id: newId, ...data, ...(newCourse || {}), created_at: new Date().toISOString() };
    const existingIdx = mem.inMemoryTrainings.findIndex(c => parseInt(String(c.id)) === newId);
    if (existingIdx !== -1) {
      mem.inMemoryTrainings[existingIdx] = memCourse;
    } else {
      mem.inMemoryTrainings.push(memCourse);
    }
    saveLocalDb();
    res.status(201).json(enhanceTrainingRecord(memCourse));
  });

  app.put('/api/trainings/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainerId !== undefined && data.trainerId !== null) {
      if (typeof data.trainerId === 'string') {
        data.trainerId = data.trainerId.trim() ? parseInt(data.trainerId) || null : null;
      } else if (typeof data.trainerId === 'number' && isNaN(data.trainerId)) {
        data.trainerId = null;
      }
    }
    if (data.year !== undefined) data.year = parseInt(data.year) || 2026;
    if (data.days !== undefined) data.days = parseInt(data.days) || 1;
    if (data.hours !== undefined) data.hours = parseInt(data.hours) || 0;

    let updatedFromDb: any = null;
    try {
      const affected = await db.transaction(async (tx: any) => {
        const [updated] = await tx.update(schema.trainings).set(data).where(eq(schema.trainings.id, id)).returning();
        updatedFromDb = updated;
        // B6 (ق-13): فئة الدورة أو مدتها ممكن تغيّرت
        return updated ? resyncTrainingCredits(tx, schema, { eq, and }, id) : [];
      });
      recalc(affected);
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update training');
    }
    const idx = mem.inMemoryTrainings.findIndex(c => parseInt(String(c.id)) === id);
    let record: any;
    if (idx !== -1) {
      mem.inMemoryTrainings[idx] = { ...mem.inMemoryTrainings[idx], ...data, ...(updatedFromDb || {}) };
      record = mem.inMemoryTrainings[idx];
    } else {
      record = { id, ...data, ...(updatedFromDb || {}) };
      mem.inMemoryTrainings.push(record);
    }
    saveLocalDb();
    res.json(enhanceTrainingRecord(record));
  });

  app.delete('/api/trainings/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const affected = await db.transaction(async (tx: any) => {
        await tx.delete(schema.trainings).where(eq(schema.trainings.id, id));
        // B6 (ق-13): الدورة انحذفت؛ الأرصدة الآلية منها تنحذف (إلا الملغاة)
        return resyncTrainingCredits(tx, schema, { eq, and }, id);
      });
      recalc(affected);
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete training');
    }
    mem.inMemoryTrainings = mem.inMemoryTrainings.filter(c => parseInt(String(c.id)) !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // Training Enrollments API
  app.get('/api/trainings/enrollments', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      const trainingId = req.query.trainingId ? parseInt(req.query.trainingId as string) : undefined;
      let query = db.select().from(schema.trainingEnrollments);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.employeeId, employeeId)) as any;
      } else if (trainingId && !isNaN(trainingId)) {
        query = db.select().from(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.trainingId, trainingId)) as any;
      }
      const enrollments = await query.orderBy(desc(schema.trainingEnrollments.createdAt));
      return res.json(enrollments.map(enhanceEnrollmentRecord));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
    const trainingId = req.query.trainingId ? parseInt(req.query.trainingId as string) : undefined;
    let list = mem.inMemoryEnrollments;
    if (employeeId) list = list.filter(e => e.employeeId === employeeId || e.employee_id === employeeId);
    if (trainingId) list = list.filter(e => e.trainingId === trainingId || e.training_id === trainingId);
    res.json(list.map(enhanceEnrollmentRecord));
  });

  app.post('/api/trainings/enroll', requireAuth, requireWriter, async (req, res) => {
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainingId) data.trainingId = parseInt(data.trainingId);
    if (data.employeeId) data.employeeId = parseInt(data.employeeId) || null;
    data.enrollmentDate = data.enrollmentDate || new Date().toISOString().split('T')[0];

    let newEnroll: any = null;
    try {
      newEnroll = await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(schema.trainingEnrollments).values(data).returning();
        if (inserted) await syncEnrollmentToTrainingCourses(tx, schema, { eq, and }, inserted);
        if (inserted) await syncSpecializationCredit(tx, schema, { eq, and }, inserted); // B6 (ق-13)
        return inserted;
      });
      recalc([newEnroll?.employeeId]);
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تسجيل المتدرب في الدورة')) return;
    }

    const newId = newEnroll?.id || (mem.inMemoryEnrollments.reduce((max, e) => Math.max(max, parseInt(e.id) || 0), 0) || 0) + 1;
    const memEnroll = { id: newId, ...data, ...(newEnroll || {}), created_at: new Date().toISOString() };
    const existingIdx = mem.inMemoryEnrollments.findIndex(e => parseInt(String(e.id)) === newId);
    if (existingIdx !== -1) {
      mem.inMemoryEnrollments[existingIdx] = memEnroll;
    } else {
      mem.inMemoryEnrollments.push(memEnroll);
    }
    saveLocalDb();
    res.status(201).json(enhanceEnrollmentRecord(memEnroll));
  });

  app.put('/api/trainings/enrollments/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainingId) data.trainingId = parseInt(data.trainingId);
    if (data.employeeId) data.employeeId = parseInt(data.employeeId) || null;

    let updatedFromDb: any = null;
    let dbAnswered = false;
    try {
      // تعديل التسجيل ومزامنة نتيجته إلى دورات الموظف (upsert بالموظف + الدورة) في معاملة واحدة
      updatedFromDb = await db.transaction(async (tx) => {
        const [updated] = await tx.update(schema.trainingEnrollments).set(data).where(eq(schema.trainingEnrollments.id, id)).returning();
        if (updated) await syncEnrollmentToTrainingCourses(tx, schema, { eq, and }, updated);
        if (updated) await syncSpecializationCredit(tx, schema, { eq, and }, updated); // B6 (ق-13)
        return updated;
      });
      dbAnswered = true;
      recalc([updatedFromDb?.employeeId]);
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل نتيجة المتدرب')) return;
    }
    if (dbAnswered && !updatedFromDb) {
      return res.status(404).json({ error: 'سجل التسجيل في الدورة غير موجود' });
    }

    const idx = mem.inMemoryEnrollments.findIndex(e => parseInt(String(e.id)) === id);
    let record: any;
    if (idx !== -1) {
      mem.inMemoryEnrollments[idx] = { ...mem.inMemoryEnrollments[idx], ...data, ...(updatedFromDb || {}) };
      record = mem.inMemoryEnrollments[idx];
    } else {
      record = { id, ...data, ...(updatedFromDb || {}) };
      mem.inMemoryEnrollments.push(record);
    }
    saveLocalDb();
    res.json(enhanceEnrollmentRecord(record));
  });

  app.delete('/api/trainings/enrollments/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const removedEnr = await db.transaction(async (tx: any) => {
        const [enr] = await tx.select().from(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.id, id));
        await tx.delete(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.id, id));
        // B6 (ق-13): حذف التسجيل يحذف رصيد الاختصاص الآلي المرتبط (ما لم يكن ملغى من المسؤول)
        if (enr) await syncSpecializationCredit(tx, schema, { eq, and }, enr);
        return enr;
      });
      recalc([removedEnr?.employeeId]);
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete enrollment');
    }
    mem.inMemoryEnrollments = mem.inMemoryEnrollments.filter(e => parseInt(String(e.id)) !== id);
    saveLocalDb();
    res.json({ success: true });
  });
}
