// server/routes/legacy/leaves2.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';
import type { AuthRequest } from '../../../src/middleware/auth.ts';

export function registerLeaves2Routes(app: Express, deps: any) {
  const {
    LEAVE_STATUS, adjustLeaveBalance, and, camelToSnake, db, deductLeaveBalanceOnApproval,
    desc, eq, genericMemoryStores, getTableColumns, isApprovedLeaveStatus, isRejectedOrCancelledLeaveStatus,
    logRecalcError, mapKeys, mem, normalizeLeaveStatus, presentLeave, requireAuth,
    requireWriter, respondIfDbWriteError, schema, sendRouteError, snakeToCamel, syncEntityRecord,
    triggerRecalculateEligibility,
  } = deps;

  app.post('/api/leaves', requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        mappedData.daysCount = parseFloat(mappedData.daysCount);
      }
      if (mappedData.remainingBalance !== undefined && mappedData.remainingBalance !== null) {
        mappedData.remainingBalance = parseFloat(mappedData.remainingBalance);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'يجب تحديد الموظف (employee_id) لطلب الإجازة' });
      }

      mappedData.status = normalizeLeaveStatus(mappedData.status) || LEAVE_STATUS.PENDING;
      // صاحب دور «موظف» يقدّم طلباً فقط ولا يعتمده لنفسه
      if (req.user?.role === 'employee') mappedData.status = LEAVE_STATUS.PENDING;

      const validCols = new Set(Object.keys(getTableColumns(schema.leaveRequests)));
      const dbData: any = {};
      for (const [k, v] of Object.entries(mappedData)) if (validCols.has(k)) dbData[k] = v;

      let newLeave: any = null;
      try {
        const [inserted] = await db.insert(schema.leaveRequests).values(dbData).returning();
        newLeave = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ طلب الإجازة')) return;
      }

      if (mappedData.status === LEAVE_STATUS.APPROVED) {
        await deductLeaveBalanceOnApproval(mappedData.employeeId, mappedData.daysCount || 0, mappedData.leaveType);
      }

      const newId = newLeave?.id || (genericMemoryStores['leaves']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = { ...mapKeys(req.body, camelToSnake), status: mappedData.status };
      const memRecord = { ...cleanSnake, ...(newLeave ? mapKeys(newLeave, camelToSnake) : {}), id: newId, created_at: newLeave?.createdAt || new Date().toISOString() };
      syncEntityRecord('leaves', memRecord, 'insert');

      res.status(201).json(presentLeave(newLeave || memRecord));
    } catch (error: any) {
      console.error('Error creating leave:', error);
      sendRouteError(res, error, 'حفظ طلب الإجازة');
    }
  });

  app.put('/api/leaves/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'معرّف طلب الإجازة غير صالح' });
      }
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        mappedData.daysCount = parseFloat(mappedData.daysCount);
      }
      if (mappedData.status !== undefined) {
        mappedData.status = normalizeLeaveStatus(mappedData.status) || LEAVE_STATUS.PENDING;
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      const validCols = new Set(Object.keys(getTableColumns(schema.leaveRequests)));
      const dbData: any = {};
      for (const [k, v] of Object.entries(mappedData)) if (validCols.has(k)) dbData[k] = v;

      const memPrev = (genericMemoryStores['leaves'] || []).find(r => String(r.id) === String(id));
      let previous: any = memPrev ? mapKeys(memPrev, snakeToCamel) : null;
      let updatedLeave: any = null;
      let dbAnswered = false;
      try {
        updatedLeave = await db.transaction(async (tx) => {
          const [prev] = await tx.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
          if (!prev) return null;
          previous = prev;
          if (Object.keys(dbData).length === 0) return prev;
          const [updated] = await tx.update(schema.leaveRequests)
            .set(dbData)
            .where(eq(schema.leaveRequests.id, id))
            .returning();
          return updated;
        });
        dbAnswered = true;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل طلب الإجازة')) return;
      }
      if (dbAnswered && !updatedLeave) {
        return res.status(404).json({ error: 'طلب الإجازة غير موجود' });
      }

      const merged = { ...(previous || {}), ...mappedData, ...(updatedLeave || {}) };
      const wasApproved = isApprovedLeaveStatus(previous?.status);
      const nowApproved = isApprovedLeaveStatus(merged.status);
      if (!wasApproved && nowApproved) {
        await deductLeaveBalanceOnApproval(parseInt(String(merged.employeeId)), parseFloat(String(merged.daysCount || 0)) || 0, merged.leaveType);
      } else if (wasApproved && isRejectedOrCancelledLeaveStatus(merged.status)) {
        await adjustLeaveBalance(parseInt(String(merged.employeeId)), parseFloat(String(merged.daysCount || 0)) || 0, merged.leaveType, 1);
      }

      const cleanSnake = { ...mapKeys(req.body, camelToSnake), ...(mappedData.status !== undefined ? { status: mappedData.status } : {}) };
      const memRecord = { ...cleanSnake, ...(updatedLeave ? mapKeys(updatedLeave, camelToSnake) : {}), id };
      syncEntityRecord('leaves', memRecord, 'update');

      res.json(presentLeave(updatedLeave || memRecord));
    } catch (error: any) {
      console.error('Error updating leave request:', error);
      sendRouteError(res, error, 'تعديل طلب الإجازة');
    }
  });

  app.delete('/api/leaves/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف طلب الإجازة غير صالح' });
      const memPrev = (genericMemoryStores['leaves'] || []).find(r => String(r.id) === String(id));
      let removed: any = memPrev ? mapKeys(memPrev, snakeToCamel) : null;
      try {
        const rows = await db.delete(schema.leaveRequests).where(eq(schema.leaveRequests.id, id)).returning();
        if (rows[0]) removed = rows[0];
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف طلب الإجازة')) return;
      }
      if (removed && isApprovedLeaveStatus(removed.status)) {
        await adjustLeaveBalance(parseInt(String(removed.employeeId)), parseFloat(String(removed.daysCount || 0)) || 0, removed.leaveType, 1);
      }
      syncEntityRecord('leaves', { id }, 'delete');
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting leave:', error);
      sendRouteError(res, error, 'حذف طلب الإجازة');
    }
  });

  // Penalties API
  app.get('/api/penalties', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      let query = db.select().from(schema.penalties);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.penalties).where(eq(schema.penalties.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.penalties.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['penalties'] || mem.inMemoryPenalties || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/penalties', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        const dc = parseInt(String(mappedData.daysCount));
        if (mappedData.daysCount !== null && String(mappedData.daysCount).trim() !== '' && (isNaN(dc) || dc < 0)) {
          return res.status(400).json({ error: 'عدد أيام القطع يجب أن يكون رقماً صحيحاً موجباً' });
        }
        mappedData.daysCount = isNaN(dc) ? null : dc;
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'يجب تحديد الموظف (employee_id) للعقوبة' });
      }

      let newPenalty: any = null;
      try {
        const [inserted] = await db.insert(schema.penalties).values(mappedData).returning();
        newPenalty = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create penalty');
      }

      const newId = newPenalty?.id || (genericMemoryStores['penalties']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('penalties', memRecord, 'insert');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(logRecalcError);
      }

      res.status(201).json(mapKeys(newPenalty || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating penalty:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/penalties/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        const dc = parseInt(String(mappedData.daysCount));
        if (mappedData.daysCount !== null && String(mappedData.daysCount).trim() !== '' && (isNaN(dc) || dc < 0)) {
          return res.status(400).json({ error: 'عدد أيام القطع يجب أن يكون رقماً صحيحاً موجباً' });
        }
        mappedData.daysCount = isNaN(dc) ? null : dc;
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      let updatedPenalty: any = null;
      try {
        const [updated] = await db.update(schema.penalties).set(mappedData).where(eq(schema.penalties.id, id)).returning();
        updatedPenalty = updated;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for update penalty');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('penalties', memRecord, 'update');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(logRecalcError);
      }

      res.json(mapKeys(updatedPenalty || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating penalty:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/penalties/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const existing = (genericMemoryStores['penalties'] || []).find(r => String(r.id) === String(id));
      try {
        await db.delete(schema.penalties).where(eq(schema.penalties.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
        console.warn('Database fallback for delete penalty');
      }
      syncEntityRecord('penalties', { id }, 'delete');

      const empId = parseInt(String(existing?.employee_id || existing?.employeeId || '0'));
      if (empId) {
        triggerRecalculateEligibility(empId).catch(logRecalcError);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting penalty:', error);
      sendRouteError(res, error);
    }
  });

  // Appreciations API (كتب الشكر والتقدير)
  app.get('/api/appreciations', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      let query = db.select().from(schema.appreciations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.appreciations).where(eq(schema.appreciations.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.appreciations.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['appreciations'] || mem.inMemoryAppreciations || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/appreciations', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'employee_id is required' });
      }

      let newAppreciation: any = null;
      try {
        const [inserted] = await db.insert(schema.appreciations).values(mappedData).returning();
        newAppreciation = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create appreciation');
      }

      const newId = newAppreciation?.id || (genericMemoryStores['appreciations']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('appreciations', memRecord, 'insert');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(logRecalcError);
      }

      res.status(201).json(mapKeys(newAppreciation || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating appreciation:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/appreciations/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      let updatedApprec: any = null;
      try {
        const [updated] = await db.update(schema.appreciations).set(mappedData).where(eq(schema.appreciations.id, id)).returning();
        updatedApprec = updated;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for update appreciation');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('appreciations', memRecord, 'update');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(logRecalcError);
      }

      res.json(mapKeys(updatedApprec || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating appreciation:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/appreciations/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const existing = (genericMemoryStores['appreciations'] || []).find(r => String(r.id) === String(id));
      try {
        await db.delete(schema.appreciations).where(eq(schema.appreciations.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
        console.warn('Database fallback for delete appreciation');
      }
      syncEntityRecord('appreciations', { id }, 'delete');

      const empId = parseInt(String(existing?.employee_id || existing?.employeeId || '0'));
      if (empId) {
        triggerRecalculateEligibility(empId).catch(logRecalcError);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting appreciation:', error);
      sendRouteError(res, error);
    }
  });

  // Performance Evaluations API
  app.get('/api/performance', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      const statusParam = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
      const conds: any[] = [];
      if (employeeId && !isNaN(employeeId)) conds.push(eq(schema.performanceEvaluations.employeeId, employeeId));
      if (statusParam) conds.push(eq(schema.performanceEvaluations.status, statusParam));
      const results = conds.length > 0
        ? await db.select().from(schema.performanceEvaluations).where(and(...conds)).orderBy(desc(schema.performanceEvaluations.createdAt))
        : await db.select().from(schema.performanceEvaluations).orderBy(desc(schema.performanceEvaluations.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['performance'] || mem.inMemoryPerformanceEvaluations || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    if (req.query.status && req.query.status !== 'all') {
      memList = memList.filter(item => String(item.status || 'مرفوع للاعتماد') === String(req.query.status));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/performance', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.totalScore !== undefined) {
        mappedData.totalScore = parseInt(mappedData.totalScore);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'employee_id is required' });
      }

      const evalYear = String(mappedData.year || (mappedData.evaluationDate ? new Date(mappedData.evaluationDate).getFullYear() : new Date().getFullYear()));

      // Check if duplicate evaluation exists for same employee in same year
      let existingEval = false;
      try {
        const existing = await db.select().from(schema.performanceEvaluations).where(
          and(
            eq(schema.performanceEvaluations.employeeId, mappedData.employeeId),
            eq(schema.performanceEvaluations.year, evalYear)
          )
        );
        if (existing.length > 0) existingEval = true;
      } catch (e) {
        const memList = genericMemoryStores['performance'] || mem.inMemoryPerformanceEvaluations || [];
        existingEval = memList.some(r => parseInt(String(r.employee_id || r.employeeId)) === mappedData.employeeId && String(r.year) === evalYear);
      }

      if (existingEval) {
        return res.status(400).json({
          error: `الموظف لديه تقييم أداء مسجل سابقاً لسنة ${evalYear}. لا يُسمح بإدخال أكثر من تقييم واحد للموظف خلال نفس السنة التقييمية.`
        });
      }

      let newEval: any = null;
      try {
        const [inserted] = await db.insert(schema.performanceEvaluations).values(mappedData).returning();
        newEval = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create performance evaluation');
      }

      const newId = newEval?.id || (genericMemoryStores['performance']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, year: evalYear, created_at: new Date().toISOString() };
      syncEntityRecord('performance', memRecord, 'insert');

      res.status(201).json(mapKeys(newEval || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating performance evaluation:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/performance/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      let updatedEval: any = null;
      try {
        const [updated] = await db.update(schema.performanceEvaluations)
          .set(mappedData)
          .where(eq(schema.performanceEvaluations.id, id))
          .returning();
        updatedEval = updated;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for update performance evaluation');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('performance', memRecord, 'update');

      res.json(mapKeys(updatedEval || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating performance evaluation:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/performance/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      try {
        await db.delete(schema.performanceEvaluations).where(eq(schema.performanceEvaluations.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
        console.warn('Database fallback for delete performance evaluation');
      }
      syncEntityRecord('performance', { id }, 'delete');
      res.json({ success: true, message: 'تم حذف التقييم بنجاح' });
    } catch (error: any) {
      console.error('Error deleting performance evaluation:', error);
      sendRouteError(res, error);
    }
  });

  // Career Histories API
  app.get('/api/career', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    if (!employeeId || isNaN(employeeId)) {
      return res.status(400).json({ error: 'Missing or invalid employeeId' });
    }
    try {
      const results = await db.select()
        .from(schema.careerHistories)
        .where(eq(schema.careerHistories.employeeId, employeeId))
        .orderBy(desc(schema.careerHistories.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const store = genericMemoryStores['career'] || mem.inMemoryCareerHistories || [];
    const filtered = store.filter(item => parseInt(String(item.employee_id || item.employeeId)) === employeeId);
    res.json(filtered.map(r => mapKeys(r, camelToSnake)));
  });

  app.post('/api/career', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'employee_id is required' });
      }

      let newHistory: any = null;
      try {
        const [inserted] = await db.insert(schema.careerHistories).values(mappedData).returning();
        newHistory = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create career history');
      }

      const newId = newHistory?.id || (genericMemoryStores['career']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('career', memRecord, 'insert');

      res.status(201).json(mapKeys(newHistory || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating career history:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/career/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      try {
        await db.delete(schema.careerHistories).where(eq(schema.careerHistories.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
        console.warn('Database fallback for delete career history');
      }
      syncEntityRecord('career', { id }, 'delete');
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting career history:', error);
      sendRouteError(res, error);
    }
  });
}
