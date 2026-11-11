// server/routes/legacy/qualifications.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

export function registerQualificationsRoutes(app: Express, deps: any) {
  const {
    and, bothCases, camelToSnake, db, desc, eq,
    findMatchingJobTitleForPromotion, genericMemoryStores, jobTitlesCache, logRecalcError, mapKeys, mem,
    requireAuth, requireWriter, respondIfDbWriteError, saveLocalDb, schema, sendRouteError,
    snakeToCamel, syncEmployeeEducationQualification, syncEntityRecord, triggerRecalculateEligibility, updateEmployeeCentralRecord,
  } = deps;

  // 1. Qualifications API
  app.get('/api/qualifications', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.qualifications);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.qualifications).where(eq(schema.qualifications.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.qualifications.createdAt));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        const resultsMapped = results.map(r => ({
          ...r,
          education_level: r.level,
          level: r.level,
          institution: r.university,
          university: r.university,
          graduation_year: r.graduationYear,
          graduationYear: r.graduationYear,
          evaluation_order: r.equationNumber || '',
          evaluationOrder: r.equationNumber || '',
          equation_number: r.equationNumber || '',
          equationNumber: r.equationNumber || '',
          education_order: r.equationNumber || '',
          educationOrder: r.equationNumber || '',
          is_active: r.isActive ?? true,
          isActive: r.isActive ?? true,
        }));
        return res.json(resultsMapped);
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }

    let list = genericMemoryStores['qualifications'] || mem.inMemoryQualifications || [];
    if (employeeId) {
      list = list.filter(q => parseInt(String(q.employee_id || q.employeeId)) === employeeId);
    }
    res.json(list.map(q => {
      const emp = mem.inMemoryEmployees.find(e => parseInt(String(e.id)) === parseInt(String(q.employee_id || q.employeeId)));
      let ord = q.equation_number || q.equationNumber || q.evaluation_order || q.evaluationOrder || q.education_order || q.educationOrder || '';
      if ((!ord || ord === 'لا يوجد' || ord === 'غير متوفر') && emp && (q.education_level === emp.education_level || q.level === emp.education_level || list.length === 1)) {
        const empOrd = emp.education_order || emp.educationOrder || emp.evaluation_order || emp.evaluationOrder || emp.equation_number || emp.equationNumber || '';
        if (empOrd && empOrd !== 'لا يوجد' && empOrd !== 'غير متوفر') {
          ord = empOrd;
        }
      }
      return {
        ...q,
        education_level: q.level || q.education_level,
        level: q.level || q.education_level,
        institution: q.university || q.institution,
        university: q.university || q.institution,
        graduation_year: q.graduation_year || q.graduationYear,
        graduationYear: q.graduation_year || q.graduationYear,
        evaluation_order: ord,
        evaluationOrder: ord,
        equation_number: ord,
        equationNumber: ord,
        education_order: ord,
        educationOrder: ord,
        is_active: q.is_active !== false && q.isActive !== false,
        isActive: q.is_active !== false && q.isActive !== false,
      };
    }));
  });

  app.post('/api/qualifications', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
    
    const level = data.level || data.education_level || data.educationLevel || 'بكالوريوس';
    const isActiveVal = data.is_active !== undefined ? Boolean(data.is_active) : (data.isActive !== undefined ? Boolean(data.isActive) : true);
    const orderNum = data.equation_number || data.equationNumber || data.evaluation_order || data.evaluationOrder || data.education_order || data.educationOrder || data.order_number || data.orderNumber || '';
    const orderDate = data.equation_date || data.equationDate || data.order_date || data.orderDate || '';

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.qualifications).values({
        employeeId,
        level,
        specialization: data.specialization,
        subSpecialization: data.sub_specialization || data.subSpecialization,
        university: data.university || data.institution,
        country: data.country || 'العراق',
        graduationYear: parseInt(data.graduation_year || data.graduationYear || '0'),
        average: data.average,
        grade: data.grade,
        equationNumber: orderNum,
        equationDate: orderDate,
        isActive: isActiveVal,
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create qualification');
    }

    const store = genericMemoryStores['qualifications'] || mem.inMemoryQualifications || [];
    const newId = record?.id || (store.reduce((max, q) => Math.max(max, parseInt(q.id) || 0), 0) || 0) + 1;
    const memItem = {
      id: newId,
      employee_id: employeeId,
      employeeId,
      level,
      education_level: level,
      specialization: data.specialization || '',
      sub_specialization: data.sub_specialization || '',
      university: data.university || data.institution || '',
      institution: data.university || data.institution || '',
      country: data.country || 'العراق',
      graduation_year: parseInt(data.graduation_year || data.graduationYear || '0'),
      graduationYear: parseInt(data.graduation_year || data.graduationYear || '0'),
      average: data.average || '',
      grade: data.grade || '',
      equation_number: orderNum,
      equationNumber: orderNum,
      evaluation_order: orderNum,
      evaluationOrder: orderNum,
      education_order: orderNum,
      educationOrder: orderNum,
      equation_date: orderDate,
      is_active: isActiveVal,
      isActive: isActiveVal,
      created_at: new Date().toISOString()
    };
    syncEntityRecord('qualifications', memItem, 'insert');
    await syncEmployeeEducationQualification(employeeId, { user: (req as any).user?.username, reason: 'تغيير بسجل الشهادات' });

    const recordMapped = {
      ...memItem,
      ...(record || {}),
      education_level: record?.level || level,
      level: record?.level || level,
      institution: record?.university || memItem.university,
      university: record?.university || memItem.university,
      graduation_year: record?.graduationYear || memItem.graduation_year,
      graduationYear: record?.graduationYear || memItem.graduation_year,
      evaluation_order: record?.equationNumber || orderNum,
      evaluationOrder: record?.equationNumber || orderNum,
      equation_number: record?.equationNumber || orderNum,
      equationNumber: record?.equationNumber || orderNum,
      education_order: record?.equationNumber || orderNum,
      educationOrder: record?.equationNumber || orderNum,
      is_active: record?.isActive ?? isActiveVal,
      isActive: record?.isActive ?? isActiveVal,
    };
    res.status(201).json(recordMapped);
  });

  app.put('/api/qualifications/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    const orderNum = data.equation_number ?? data.equationNumber ?? data.evaluation_order ?? data.evaluationOrder ?? data.education_order ?? data.educationOrder ?? data.order_number ?? data.orderNumber;
    const orderDt = data.equation_date ?? data.equationDate ?? data.order_date ?? data.orderDate;

    let updatedRec: any = null;
    try {
      const updateValues: any = {};
      if (data.level || data.education_level) updateValues.level = data.level || data.education_level;
      if (data.specialization !== undefined) updateValues.specialization = data.specialization;
      if (data.sub_specialization || data.subSpecialization) updateValues.subSpecialization = data.sub_specialization || data.subSpecialization;
      if (data.university || data.institution) updateValues.university = data.university || data.institution;
      if (data.country !== undefined) updateValues.country = data.country;
      if (data.graduation_year || data.graduationYear) updateValues.graduationYear = parseInt(data.graduation_year || data.graduationYear);
      if (data.is_active !== undefined) updateValues.isActive = Boolean(data.is_active);
      if (data.isActive !== undefined) updateValues.isActive = Boolean(data.isActive);
      if (orderNum !== undefined) updateValues.equationNumber = orderNum;
      if (orderDt !== undefined) updateValues.equationDate = orderDt;

      const [updated] = await db.update(schema.qualifications)
        .set(updateValues)
        .where(eq(schema.qualifications.id, id))
        .returning();
      updatedRec = updated;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update qualification');
    }

    const store = genericMemoryStores['qualifications'] || mem.inMemoryQualifications || [];
    const existing = store.find(q => parseInt(String(q.id)) === id);
    const resolvedOrder = orderNum !== undefined ? orderNum : (existing?.equation_number || existing?.evaluation_order || '');
    const memItem = {
      ...(existing || {}),
      ...data,
      id,
      level: data.education_level || data.level || existing?.level,
      education_level: data.education_level || data.level || existing?.education_level,
      university: data.institution || data.university || existing?.university,
      institution: data.institution || data.university || existing?.institution,
      graduation_year: data.graduation_year || data.graduationYear || existing?.graduation_year,
      graduationYear: data.graduation_year || data.graduationYear || existing?.graduationYear,
      equation_number: resolvedOrder,
      equationNumber: resolvedOrder,
      evaluation_order: resolvedOrder,
      evaluationOrder: resolvedOrder,
      education_order: resolvedOrder,
      educationOrder: resolvedOrder,
    };
    syncEntityRecord('qualifications', memItem, 'update');

    const empId = parseInt(String(updatedRec?.employeeId || memItem.employee_id || memItem.employeeId));
    if (empId) {
      await syncEmployeeEducationQualification(empId, { user: (req as any).user?.username, reason: 'تغيير بسجل الشهادات' });
      triggerRecalculateEligibility(empId).catch(logRecalcError);
    }
    saveLocalDb();

    res.json({
      ...memItem,
      ...(updatedRec || {}),
      education_level: updatedRec?.level || memItem.level,
      level: updatedRec?.level || memItem.level,
      institution: updatedRec?.university || memItem.university,
      university: updatedRec?.university || memItem.university,
      graduation_year: updatedRec?.graduationYear || memItem.graduation_year,
      graduationYear: updatedRec?.graduationYear || memItem.graduation_year,
      evaluation_order: updatedRec?.equationNumber || resolvedOrder,
      evaluationOrder: updatedRec?.equationNumber || resolvedOrder,
      equation_number: updatedRec?.equationNumber || resolvedOrder,
      equationNumber: updatedRec?.equationNumber || resolvedOrder,
      education_order: updatedRec?.equationNumber || resolvedOrder,
      educationOrder: updatedRec?.equationNumber || resolvedOrder,
      is_active: updatedRec?.isActive ?? (memItem.is_active !== false && memItem.isActive !== false),
      isActive: updatedRec?.isActive ?? (memItem.is_active !== false && memItem.isActive !== false),
    });
  });

  app.patch('/api/qualifications/:id/toggle', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    let updatedRec: any = null;
    let empId: number = 0;
    try {
      const existing = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, id));
      if (existing.length > 0) {
        empId = existing[0].employeeId;
        const newActiveState = !(existing[0].isActive ?? true);
        const [updated] = await db.update(schema.qualifications)
          .set({ isActive: newActiveState })
          .where(eq(schema.qualifications.id, id))
          .returning();
        updatedRec = updated;
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for toggle qualification');
    }

    const store = genericMemoryStores['qualifications'] || mem.inMemoryQualifications || [];
    const existing = store.find(q => parseInt(String(q.id)) === id);
    if (existing) {
      const currentActive = existing.is_active !== false && existing.isActive !== false;
      const newActive = !currentActive;
      existing.is_active = newActive;
      existing.isActive = newActive;
      if (!empId) empId = parseInt(String(existing.employee_id || existing.employeeId));
      syncEntityRecord('qualifications', existing, 'update');
    }

    if (empId) {
      await syncEmployeeEducationQualification(empId, { user: (req as any).user?.username, reason: 'تغيير بسجل الشهادات' });
      triggerRecalculateEligibility(empId).catch(logRecalcError);
    }
    saveLocalDb();

    if (updatedRec) {
      return res.json({
        ...updatedRec,
        education_level: updatedRec.level,
        level: updatedRec.level,
        institution: updatedRec.university,
        university: updatedRec.university,
        graduation_year: updatedRec.graduationYear,
        graduationYear: updatedRec.graduationYear,
        evaluation_order: updatedRec.equationNumber || '',
        evaluationOrder: updatedRec.equationNumber || '',
        equation_number: updatedRec.equationNumber || '',
        equationNumber: updatedRec.equationNumber || '',
        education_order: updatedRec.equationNumber || '',
        educationOrder: updatedRec.equationNumber || '',
        is_active: updatedRec.isActive ?? true,
        isActive: updatedRec.isActive ?? true,
      });
    }

    if (existing) return res.json(existing);
    res.status(404).json({ error: 'Qualification not found' });
  });

  app.delete('/api/qualifications/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    let empId: number = 0;
    try {
      const existing = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, id));
      if (existing.length > 0) {
        empId = existing[0].employeeId;
        await db.delete(schema.qualifications).where(eq(schema.qualifications.id, id));
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete qualification');
    }

    const store = genericMemoryStores['qualifications'] || mem.inMemoryQualifications || [];
    const memItem = store.find(q => parseInt(String(q.id)) === id);
    if (!empId && memItem) empId = parseInt(String(memItem.employee_id || memItem.employeeId));

    syncEntityRecord('qualifications', { id }, 'delete');

    if (empId) {
      await syncEmployeeEducationQualification(empId, { user: (req as any).user?.username, reason: 'تغيير بسجل الشهادات' });
      triggerRecalculateEligibility(empId).catch(logRecalcError);
    }
    saveLocalDb();

    res.json({ success: true });
  });


  // 2. Job Assignments API
  app.get('/api/job-assignments', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.jobAssignments);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.jobAssignments).where(eq(schema.jobAssignments.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.jobAssignments.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['job-assignments'] || mem.inMemoryJobAssignments || [];
    if (employeeId) list = list.filter(j => parseInt(String(j.employee_id || j.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/job-assignments', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.jobAssignments).values({
        employeeId,
        grade: data.grade || 'العاشرة',
        step: parseInt(data.step || '1'),
        jobTitle: data.job_title || data.jobTitle || 'موظف',
        division: data.division,
        department: data.department,
        section: data.section,
        confirmationDate: data.confirmation_date || data.confirmationDate || new Date().toISOString().split('T')[0],
        assignmentType: data.assignment_type || data.assignmentType || 'تعيين',
        actionType: data.action_type || data.actionType || 'تكليف',
        orderNumber: data.order_number || data.orderNumber,
        orderDate: data.order_date || data.orderDate,
        responsibility: data.responsibility || data.primary_responsibility || data.primaryResponsibility || 'بلا مسؤولية',
        primaryResponsibility: data.primary_responsibility || data.primaryResponsibility || data.responsibility || 'بلا مسؤولية',
        actingResponsibility: data.acting_responsibility || data.actingResponsibility || 'بلا وكالة',
        actingEndDate: data.acting_end_date || data.actingEndDate || null,
        deputyLevel: data.deputy_level || data.deputyLevel || 'لا يوجد',
        serviceType: data.service_type || data.serviceType || 'دائم',
        notes: data.notes || '',
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create job assignment');
    }

    // Sync with Central Employee Record
    const empUpdate: any = {};
    if (data.job_title || data.jobTitle) empUpdate.jobTitle = data.job_title || data.jobTitle;
    if (data.department) empUpdate.department = data.department;
    if (data.section) empUpdate.section = data.section;
    if (data.responsibility || data.primary_responsibility || data.primaryResponsibility) {
      empUpdate.jobResponsibility = data.primary_responsibility || data.primaryResponsibility || data.responsibility;
      empUpdate.primaryResponsibility = data.primary_responsibility || data.primaryResponsibility || data.responsibility;
    }
    if (data.acting_responsibility || data.actingResponsibility) {
      empUpdate.actingResponsibility = data.acting_responsibility || data.actingResponsibility;
    }
    if (data.deputy_level || data.deputyLevel) {
      empUpdate.deputyLevel = data.deputy_level || data.deputyLevel;
    }
    if (data.grade) empUpdate.grade = data.grade;
    if (data.step) empUpdate.step = parseInt(data.step);
    if (data.confirmation_date || data.confirmationDate) empUpdate.currentAppointmentDate = data.confirmation_date || data.confirmationDate;
    if (data.order_number || data.orderNumber) empUpdate.appointmentOrder = data.order_number || data.orderNumber;
    await updateEmployeeCentralRecord(employeeId, empUpdate, { effectiveDate: data.order_date || data.orderDate || data.confirmation_date || data.confirmationDate, reason: 'تكليف/تنسيب', user: (req as any).user?.username });

    const store = genericMemoryStores['job-assignments'] || mem.inMemoryJobAssignments || [];
    const newId = record?.id || (store.reduce((max, j) => Math.max(max, parseInt(j.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('job-assignments', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/job-assignments/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.jobAssignments).set(mappedData).where(eq(schema.jobAssignments.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update job assignment');
    }
    const memItem = { id, ...data };
    syncEntityRecord('job-assignments', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/job-assignments/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.jobAssignments).where(eq(schema.jobAssignments.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete job assignment');
    }
    syncEntityRecord('job-assignments', { id }, 'delete');
    res.json({ success: true });
  });


  // 3. Promotions & Increments API
  app.get('/api/promotions', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.promotionsIncrements);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.promotionsIncrements).where(eq(schema.promotionsIncrements.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.promotionsIncrements.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['promotions'] || mem.inMemoryPromotions || [];
    if (employeeId) list = list.filter(p => parseInt(String(p.employee_id || p.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/promotions', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.promotionsIncrements).values({
        employeeId,
        movementType: data.movement_type || data.movementType,
        gradeBefore: data.grade_before || data.gradeBefore,
        gradeAfter: data.grade_after || data.gradeAfter,
        stepBefore: data.step_before ? parseInt(data.step_before) : (data.stepBefore ? parseInt(data.stepBefore) : null),
        stepAfter: data.step_after ? parseInt(data.step_after) : (data.stepAfter ? parseInt(data.stepAfter) : null),
        dueDate: data.due_date || data.dueDate || new Date().toISOString().split('T')[0],
        orderNumber: data.order_number || data.orderNumber,
        orderDate: data.order_date || data.orderDate,
        seniorityMonths: data.seniority_months ? parseInt(data.seniority_months) : (data.seniorityMonths ? parseInt(data.seniorityMonths) : null),
        seniorityReason: data.seniority_reason || data.seniorityReason,
        managerRecommendation: data.manager_recommendation || data.managerRecommendation || 'لا',
        directorApproval: data.director_approval || data.directorApproval || 'لا',
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create promotion');
    }

    // Sync Grade, Step and Date with Central Employee Record
    const movementType = String(data.movement_type || data.movementType || '').trim();
    const actionDate = data.order_date || data.orderDate || data.due_date || data.dueDate;

    const empUpdate: any = {};
    if (data.grade_after || data.gradeAfter) empUpdate.grade = data.grade_after || data.gradeAfter;
    if (data.step_after || data.stepAfter) empUpdate.step = parseInt(data.step_after || data.stepAfter);
    if (actionDate) {
      empUpdate.gradeDate = actionDate;
    }

    if (movementType.includes('ترفيع')) {
      if (actionDate) empUpdate.lastPromotionDate = actionDate;
      const targetGradeNum = parseInt(String(data.grade_after || data.gradeAfter));
      if (!isNaN(targetGradeNum)) {
        // إصلاح عاجل: الموظف والعناوين من القاعدة (كانت من الذاكرة ← لا يُحدَّث العنوان بعد الترفيع)
        const [curEmpRow] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
        const titlesNow = (await db.select().from(schema.jobTitles)).map(bothCases);
        const curEmp: any = curEmpRow ? bothCases(curEmpRow) : null;
        const resolvedTitle = findMatchingJobTitleForPromotion(curEmp, targetGradeNum, titlesNow.length ? titlesNow : jobTitlesCache.list);
        if (resolvedTitle) {
          empUpdate.jobTitle = resolvedTitle.name;
          empUpdate.job_title = resolvedTitle.name;
          empUpdate.jobTitleId = resolvedTitle.id;
          empUpdate.job_title_id = resolvedTitle.id;
        }
      }
    } else if (movementType.includes('علاوة')) {
      if (actionDate) empUpdate.lastIncrementDate = actionDate;
    } else {
      if (actionDate) {
        empUpdate.lastPromotionDate = actionDate;
        empUpdate.lastIncrementDate = actionDate;
      }
    }
    await updateEmployeeCentralRecord(employeeId, empUpdate, { effectiveDate: actionDate, reason: movementType || 'حركة ترفيع/علاوة', user: (req as any).user?.username });

    const store = genericMemoryStores['promotions'] || mem.inMemoryPromotions || [];
    const newId = record?.id || (store.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('promotions', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/promotions/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.promotionsIncrements).set(mappedData).where(eq(schema.promotionsIncrements.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update promotion');
    }
    const memItem = { id, ...data };
    syncEntityRecord('promotions', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/promotions/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.promotionsIncrements).where(eq(schema.promotionsIncrements.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete promotion');
    }
    syncEntityRecord('promotions', { id }, 'delete');
    res.json({ success: true });
  });


  // 4. Salary Allowances API
  app.get('/api/salary-allowances', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.salaryAllowances);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.salaryAllowances).where(eq(schema.salaryAllowances.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.salaryAllowances.createdAt));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(results.map(r => ({
          ...r,
          allowance_type: r.allowanceType,
          order_number: r.orderNumber,
          employee_id: r.employeeId,
        })));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['salary-allowances'] || mem.inMemorySalaryAllowances || [];
    if (employeeId) list = list.filter(s => parseInt(String(s.employee_id || s.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/salary-allowances', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const values = {
        employeeId,
        baseSalary: data.base_salary || data.baseSalary,
        costOfLiving: data.cost_of_living || data.costOfLiving,
        positionAllowance: data.position_allowance || data.positionAllowance,
        degreeAllowance: data.degree_allowance || data.degreeAllowance,
        hazardTransport: data.hazard_transport || data.hazardTransport,
        universityTechnical: data.university_technical || data.universityTechnical,
        retirementDeduction: data.retirement_deduction || data.retirementDeduction,
        taxDeduction: data.tax_deduction || data.taxDeduction,
        insuranceDeduction: data.insurance_deduction || data.insuranceDeduction,
        loansDeduction: data.loans_deduction || data.loansDeduction,
        netSalary: data.net_salary || data.netSalary,
        bankAccount: data.bank_account || data.bankAccount,
        bankName: data.bank_name || data.bankName,
        allowanceType: data.allowance_type || data.allowanceType,
        percentage: data.percentage !== undefined ? parseInt(data.percentage) : null,
        amount: data.amount !== undefined ? parseInt(data.amount) : null,
        orderNumber: data.order_number || data.orderNumber,
        status: data.status || 'مستمر',
      };

      const [inserted] = await db.insert(schema.salaryAllowances).values(values).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create salary allowance');
    }

    const store = genericMemoryStores['salary-allowances'] || mem.inMemorySalaryAllowances || [];
    const newId = record?.id || (store.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('salary-allowances', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/salary-allowances/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.salaryAllowances).set(mappedData).where(eq(schema.salaryAllowances.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update salary allowance');
    }
    const memItem = { id, ...data };
    syncEntityRecord('salary-allowances', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/salary-allowances/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.salaryAllowances).where(eq(schema.salaryAllowances.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete salary allowance');
    }
    syncEntityRecord('salary-allowances', { id }, 'delete');
    res.json({ success: true });
  });


  // 5. Annual Evaluations API
  app.get('/api/annual-evaluations', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.annualEvaluations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.annualEvaluations).where(eq(schema.annualEvaluations.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.annualEvaluations.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['annual-evaluations'] || mem.inMemoryAnnualEvaluations || [];
    if (employeeId) list = list.filter(e => parseInt(String(e.employee_id || e.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/annual-evaluations', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.annualEvaluations).values({
        employeeId,
        year: parseInt(data.year || '2026'),
        grade: data.grade || 'كفوء',
        evaluationAuthority: data.evaluation_authority || data.evaluationAuthority,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        requiredCourses: data.required_courses || data.requiredCourses,
        employeeOpinion: data.employee_opinion || data.employeeOpinion,
        notes: data.notes,
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create annual evaluation');
    }

    const store = genericMemoryStores['annual-evaluations'] || mem.inMemoryAnnualEvaluations || [];
    const newId = record?.id || (store.reduce((max, e) => Math.max(max, parseInt(e.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('annual-evaluations', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/annual-evaluations/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.annualEvaluations).set(mappedData).where(eq(schema.annualEvaluations.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update annual evaluation');
    }
    const memItem = { id, ...data };
    syncEntityRecord('annual-evaluations', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/annual-evaluations/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.annualEvaluations).where(eq(schema.annualEvaluations.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete annual evaluation');
    }
    syncEntityRecord('annual-evaluations', { id }, 'delete');
    res.json({ success: true });
  });


  // 6. Training Courses API
  app.get('/api/training-courses', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.trainingCourses);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.trainingCourses).where(eq(schema.trainingCourses.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.trainingCourses.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['training-courses'] || mem.inMemoryTrainingCourses || [];
    if (employeeId) list = list.filter(t => parseInt(String(t.employee_id || t.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/training-courses', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.trainingCourses).values({
        employeeId,
        courseName: data.course_name || data.courseName || '',
        courseType: data.course_type || data.courseType || 'حضوري',
        provider: data.provider || '',
        location: data.location || 'داخل العراق',
        startDate: data.start_date || data.startDate || new Date().toISOString().split('T')[0],
        endDate: data.end_date || data.endDate || new Date().toISOString().split('T')[0],
        durationDays: parseInt(data.duration_days || data.durationDays || '1'),
        average: data.average,
        grade: data.grade,
        rank: data.rank,
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create training course');
    }

    const store = genericMemoryStores['training-courses'] || mem.inMemoryTrainingCourses || [];
    const newId = record?.id || (store.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('training-courses', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/training-courses/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.trainingCourses).set(mappedData).where(eq(schema.trainingCourses.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update training course');
    }
    const memItem = { id, ...data };
    syncEntityRecord('training-courses', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/training-courses/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.trainingCourses).where(eq(schema.trainingCourses.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete training course');
    }
    syncEntityRecord('training-courses', { id }, 'delete');
    res.json({ success: true });
  });


  // 7. Transfers API
  app.get('/api/transfers', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.transfers);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.transfers).where(eq(schema.transfers.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.transfers.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['transfers'] || mem.inMemoryTransfers || [];
    if (employeeId) list = list.filter(t => parseInt(String(t.employee_id || t.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/transfers', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.transfers).values({
        employeeId,
        transferType: data.transfer_type || data.transferType || 'نقل داخلي',
        fromEntity: data.from_entity || data.fromEntity || '',
        toEntity: data.to_entity || data.toEntity || '',
        startDate: data.start_date || data.startDate || new Date().toISOString().split('T')[0],
        endDate: data.end_date || data.endDate,
        orderNumber: data.order_number || data.orderNumber || '',
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create transfer');
    }

    // Sync transfer target department / work location with central employee record
    const toTarget = data.to_entity || data.toEntity || '';
    if (toTarget) {
      await updateEmployeeCentralRecord(employeeId, {
        department: toTarget,
        workLocation: toTarget
      }, { effectiveDate: data.start_date || data.startDate, reason: 'نقل', user: (req as any).user?.username });
    }

    const store = genericMemoryStores['transfers'] || mem.inMemoryTransfers || [];
    const newId = record?.id || (store.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('transfers', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/transfers/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.transfers).set(mappedData).where(eq(schema.transfers.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update transfer');
    }
    const memItem = { id, ...data };
    syncEntityRecord('transfers', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/transfers/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.transfers).where(eq(schema.transfers.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete transfer');
    }
    syncEntityRecord('transfers', { id }, 'delete');
    res.json({ success: true });
  });


  // 8. Retirements API
  app.get('/api/retirements', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.retirements);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.retirements).where(eq(schema.retirements.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.retirements.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['retirements'] || mem.inMemoryRetirements || [];
    if (employeeId) list = list.filter(r => parseInt(String(r.employee_id || r.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/retirements', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [existing] = await db.select().from(schema.retirements).where(eq(schema.retirements.employeeId, employeeId));
      const values = {
        employeeId,
        retirementDate: data.retirement_date || data.retirementDate || new Date().toISOString().split('T')[0],
        reason: data.reason || 'بلوغ السن القانونية',
        serviceDuration: data.service_duration || data.serviceDuration,
        pensionAmount: data.pension_amount || data.pensionAmount,
        pensionOrderNumber: data.pension_order_number || data.pensionOrderNumber,
        pensionOrderDate: data.pension_order_date || data.pensionOrderDate,
      };

      if (existing) {
        [record] = await db.update(schema.retirements)
          .set(values)
          .where(eq(schema.retirements.id, existing.id))
          .returning();
      } else {
        [record] = await db.insert(schema.retirements).values(values).returning();
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for create/update retirement');
    }

    // Sync retirement status with central employee record
    await updateEmployeeCentralRecord(employeeId, {
      status: 'متقاعد',
      retirementNumber: data.pension_order_number || data.pensionOrderNumber || 'إحالة إلى التقاعد'
    }, { effectiveDate: data.retirement_date || data.retirementDate, reason: 'إحالة على التقاعد', user: (req as any).user?.username });

    const store = genericMemoryStores['retirements'] || mem.inMemoryRetirements || [];
    const existingIdx = store.findIndex(r => parseInt(String(r.employee_id || r.employeeId)) === employeeId);
    const newId = record?.id || (existingIdx !== -1 ? store[existingIdx].id : ((store.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1));
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('retirements', memItem, existingIdx !== -1 ? 'update' : 'insert');

    res.json(mapKeys(record || memItem, camelToSnake));
  });

  app.delete('/api/retirements/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.retirements).where(eq(schema.retirements.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete retirement');
    }
    syncEntityRecord('retirements', { id }, 'delete');
    res.json({ success: true });
  });


  // 9. Documents API
  app.get('/api/documents', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.documents);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.documents).where(eq(schema.documents.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.documents.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['documents'] || mem.inMemoryDocuments || [];
    if (employeeId) list = list.filter(d => parseInt(String(d.employee_id || d.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/documents', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.documents).values({
        employeeId,
        docType: data.doc_type || data.docType || 'أخرى',
        filePath: data.file_path || data.filePath || '',
        entryDate: data.entry_date || data.entryDate || new Date().toISOString().split('T')[0],
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create document');
    }

    const store = genericMemoryStores['documents'] || mem.inMemoryDocuments || [];
    const newId = record?.id || (store.reduce((max, d) => Math.max(max, parseInt(d.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('documents', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.delete('/api/documents/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.documents).where(eq(schema.documents.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete document');
    }
    syncEntityRecord('documents', { id }, 'delete');
    res.json({ success: true });
  });

  // --- Service Records (احتساب الخدمة وتمديد الخدمة) API ---
  app.get('/api/service-records', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.serviceRecords);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.serviceRecords).where(eq(schema.serviceRecords.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.serviceRecords.createdAt));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(results.map(r => ({
          ...r,
          employee_id: r.employeeId,
          record_type: r.recordType,
          order_number: r.orderNumber,
          order_date: r.orderDate,
          created_at: r.createdAt
        })));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = mem.inMemoryServiceRecords;
    if (employeeId) list = list.filter(r => r.employee_id === employeeId || r.employeeId === employeeId);
    res.json(list);
  });

  app.post('/api/service-records', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    const recordType = data.record_type || data.recordType || 'احتساب خدمة';
    const orderNumber = data.order_number || data.orderNumber || '';
    const orderDate = data.order_date || data.orderDate || '';
    const years = parseInt(data.years) || 0;
    const months = parseInt(data.months) || 0;
    const days = parseInt(data.days) || 0;
    const reason = data.reason || '';

    let record = null;
    try {
      const [inserted] = await db.insert(schema.serviceRecords).values({
        employeeId,
        recordType,
        orderNumber,
        orderDate,
        years,
        months,
        days,
        purpose: data.purpose || 'promotion_allowance_pension',
        reason,
        notes: data.notes || '',
      }).returning();
      record = inserted;

      // Sync employee record if record type is extension
      if (recordType === 'تمديد خدمة') {
        const emp = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
        if (emp.length > 0) {
          const currentEmp = emp[0];
          const newStatus = currentEmp.status === 'متقاعد' ? 'متقاعد مع تمديد' : (currentEmp.status || 'مستمر');
          await db.update(schema.employees).set({
            retirementExtensionOrderNumber: orderNumber,
            retirementExtensionOrderDate: orderDate,
            retirementExtensionYears: years,
            retirementExtensionMonths: months,
            retirementExtensionNote: reason,
            status: newStatus,
          }).where(eq(schema.employees.id, employeeId));
        }
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create service record');
    }

    const newId = mem.inMemoryServiceRecords.length > 0 ? Math.max(...mem.inMemoryServiceRecords.map(r => r.id || 0)) + 1 : 1;
    const memRecord = {
      id: record?.id || newId,
      employee_id: employeeId,
      employeeId,
      record_type: recordType,
      recordType,
      order_number: orderNumber,
      orderNumber,
      order_date: orderDate,
      orderDate,
      years,
      months,
      days,
      purpose: data.purpose || 'promotion_allowance_pension',
      reason,
      notes: data.notes || '',
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    mem.inMemoryServiceRecords.push(memRecord);
    saveLocalDb();

    triggerRecalculateEligibility(employeeId).catch(logRecalcError);
    const formatted = record ? {
      ...record,
      employee_id: record.employeeId,
      record_type: record.recordType,
      order_number: record.orderNumber,
      order_date: record.orderDate,
      created_at: record.createdAt
    } : memRecord;
    res.json(formatted);
  });

  app.put('/api/service-records/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    const updateData: any = {};
    if (data.record_type !== undefined || data.recordType !== undefined) {
      updateData.recordType = data.record_type || data.recordType;
    }
    if (data.order_number !== undefined || data.orderNumber !== undefined) {
      updateData.orderNumber = data.order_number || data.orderNumber;
    }
    if (data.order_date !== undefined || data.orderDate !== undefined) {
      updateData.orderDate = data.order_date || data.orderDate;
    }
    if (data.years !== undefined) updateData.years = parseInt(data.years) || 0;
    if (data.months !== undefined) updateData.months = parseInt(data.months) || 0;
    if (data.days !== undefined) updateData.days = parseInt(data.days) || 0;
    if (data.purpose !== undefined) updateData.purpose = data.purpose;
    if (data.reason !== undefined) updateData.reason = data.reason;
    if (data.notes !== undefined) updateData.notes = data.notes;

    let updated = null;
    try {
      const [resDb] = await db.update(schema.serviceRecords)
        .set(updateData)
        .where(eq(schema.serviceRecords.id, id))
        .returning();
      updated = resDb;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update service record');
    }

    const idx = mem.inMemoryServiceRecords.findIndex(r => r.id === id);
    if (idx !== -1) {
      mem.inMemoryServiceRecords[idx] = {
        ...mem.inMemoryServiceRecords[idx],
        ...updateData,
        ...data,
        id
      };
      saveLocalDb();
      if (!updated) updated = mem.inMemoryServiceRecords[idx];
    }

    if (updated?.employeeId || updated?.employee_id) {
      triggerRecalculateEligibility(updated.employeeId || updated.employee_id).catch(logRecalcError);
    }
    const formatted = updated ? {
      ...updated,
      employee_id: updated.employeeId || updated.employee_id,
      record_type: updated.recordType || updated.record_type,
      order_number: updated.orderNumber || updated.order_number,
      order_date: updated.orderDate || updated.order_date,
      created_at: updated.createdAt || updated.created_at
    } : updated;
    res.json(formatted);
  });

  app.delete('/api/service-records/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    
    let recordToDelete = mem.inMemoryServiceRecords.find(r => r.id === id);
    try {
      const existing = await db.select().from(schema.serviceRecords).where(eq(schema.serviceRecords.id, id));
      if (existing.length > 0) {
        recordToDelete = existing[0];
        await db.delete(schema.serviceRecords).where(eq(schema.serviceRecords.id, id));

        if (recordToDelete.recordType === 'تمديد خدمة') {
          const remainingExts = await db.select().from(schema.serviceRecords).where(and(
            eq(schema.serviceRecords.employeeId, recordToDelete.employeeId),
            eq(schema.serviceRecords.recordType, 'تمديد خدمة')
          ));

          if (remainingExts.length === 0) {
            await db.update(schema.employees).set({
              retirementExtensionOrderNumber: null,
              retirementExtensionOrderDate: null,
              retirementExtensionYears: 0,
              retirementExtensionMonths: 0,
              retirementExtensionNote: null,
            }).where(eq(schema.employees.id, recordToDelete.employeeId));
          } else {
            const latest = remainingExts[remainingExts.length - 1];
            await db.update(schema.employees).set({
              retirementExtensionOrderNumber: latest.orderNumber,
              retirementExtensionOrderDate: latest.orderDate,
              retirementExtensionYears: latest.years,
              retirementExtensionMonths: latest.months,
              retirementExtensionNote: latest.reason || latest.notes,
            }).where(eq(schema.employees.id, recordToDelete.employeeId));
          }
        }
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete service record');
    }

    mem.inMemoryServiceRecords = mem.inMemoryServiceRecords.filter(r => r.id !== id);
    saveLocalDb();

    if (recordToDelete?.employeeId || recordToDelete?.employee_id) {
      triggerRecalculateEligibility(recordToDelete.employeeId || recordToDelete.employee_id).catch(logRecalcError);
    }
    res.json({ success: true });
  });
}
