// server/routes/legacy/genericEntities.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

import { bothCases, degreeTrackInputs } from '../../engineContext.ts';

export function registerGenericEntitiesRoutes(app: Express, deps: any) {
  const {
    calculateDegreeTrackSimulation, camelToSnake, db, eq, genericEntitiesMap, genericMemoryStores,
    getTableColumns, jobTitlesCache, loadEngineContext, loadPenaltyTypesForEngine, logRecalcError, mapKeys,
    mem, requireAuth, requireWriter, respondIfDbWriteError, routeRegistry, saveLocalDb,
    schema, sendRouteError, snakeToCamel, toEngineLeave, triggerRecalculateEligibility, updateEmployeeCentralRecord,
  } = deps;

  // المولّد العام: يُسجَّل فقط المسار الذي لم يُعرَّف صراحةً قبله (المسارات الصريحة تسبقه في الأسبقية،
  // وأي نسخة مولّدة لمسار مسجّل مسبقاً ستكون ميتة؛ مسجّل المسارات يمنع التكرار عند الإقلاع).
  Object.entries(genericEntitiesMap).forEach(([endpoint, schemaKey]) => {
    genericMemoryStores[endpoint] = genericMemoryStores[endpoint] || [];
    const listPath = `/api/${endpoint}`;
    const itemPath = `/api/${endpoint}/:id`;

    if (!routeRegistry.has('get', listPath)) {
    app.get(listPath, requireAuth, async (req, res) => {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable) {
          let query = db.select().from(targetTable);
          if (empIdParam && targetTable.employeeId) {
            query = query.where(eq(targetTable.employeeId, parseInt(empIdParam as string))) as any;
          }
          let records = await query;
          // B6 (ق-13): رصيد الاختصاص الملغى من المسؤول ما يظهر (إلا بطلب صريح)
          if (endpoint === 'specialization-credits' && !req.query.include_cancelled) {
            records = records.filter((r: any) => !r.isCancelled);
          }
          return res.json(records.map((r: any) => mapKeys(r, camelToSnake)));
        }
      } catch (err: any) {
        return sendRouteError(res, err, 'قراءة السجلات'); // B2d: لا قراءة من الذاكرة
      }
      let memList = genericMemoryStores[endpoint] || [];
      if (empIdParam) {
        memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
      }

      res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
    });

    }

    if (!routeRegistry.has('post', listPath)) {
    app.post(listPath, requireAuth, requireWriter, async (req, res) => {
      const data = mapKeys(req.body, snakeToCamel);
      let insertedRecord: any = null;
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable) {
          const validColumns = new Set(Object.keys(getTableColumns(targetTable)));
          const cleanData: any = {};
          for (const [k, v] of Object.entries(data)) {
            if (validColumns.has(k) && k !== 'id' && k !== 'createdAt') {
              cleanData[k] = v;
            }
          }
          if (cleanData.employeeId !== undefined) {
            cleanData.employeeId = parseInt(cleanData.employeeId);
          }
          if (cleanData.step !== undefined && typeof cleanData.step === 'string') {
            cleanData.step = parseInt(cleanData.step) || 1;
          }
          if (cleanData.grade !== undefined && typeof cleanData.grade === 'string' && !isNaN(parseInt(cleanData.grade))) {
            cleanData.grade = parseInt(cleanData.grade);
          }
          if (cleanData.years !== undefined) {
            cleanData.years = parseInt(cleanData.years) || 0;
          }
          if (cleanData.months !== undefined) {
            cleanData.months = parseInt(cleanData.months) || 0;
          }
          if (cleanData.days !== undefined) {
            cleanData.days = parseInt(cleanData.days) || 0;
          }

          const [inserted] = await db.insert(targetTable).values(cleanData).returning();
          if (inserted) {
            insertedRecord = inserted;
          }
        }
      } catch (err: any) {
        if (respondIfDbWriteError(res, err, 'إضافة السجل')) return;
      }
      const newId = insertedRecord?.id || (genericMemoryStores[endpoint].reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, ...(insertedRecord ? mapKeys(insertedRecord, camelToSnake) : {}), id: newId, created_at: insertedRecord?.createdAt || new Date().toISOString() };
      genericMemoryStores[endpoint].push(memRecord);

      // If qualification was added and isActive is true, sync to central employee record!
      if (endpoint === 'qualifications') {
        const empId = parseInt(String(cleanSnake.employee_id || data.employeeId));
        if (empId && cleanSnake.is_active !== false && cleanSnake.isActive !== false) {
          await updateEmployeeCentralRecord(empId, {
            education_level: cleanSnake.education_level || cleanSnake.level || data.level,
            educationLevel: cleanSnake.education_level || cleanSnake.level || data.level,
            specialization: cleanSnake.specialization || data.specialization,
            university: cleanSnake.institution || cleanSnake.university || data.university,
            institution: cleanSnake.institution || cleanSnake.university || data.university,
            graduation_year: cleanSnake.graduation_year || data.graduationYear,
            graduationYear: cleanSnake.graduation_year || data.graduationYear,
            education_order: cleanSnake.evaluation_order || cleanSnake.equation_number || cleanSnake.education_order || data.equationNumber || data.evaluationOrder,
            evaluation_order: cleanSnake.evaluation_order || cleanSnake.equation_number || cleanSnake.education_order || data.equationNumber || data.evaluationOrder
          }, { effectiveDate: cleanSnake.equation_date || data.equationDate || cleanSnake.graduation_date || data.graduationDate, reason: 'إضافة شهادة', user: (req as any).user?.username });
        }
      }

      // Trigger real-time promotion/increment recalculation if relevant entity
      const targetEmpId = parseInt(String(cleanSnake.employee_id || cleanSnake.employeeId || data.employeeId));
      if (targetEmpId && !isNaN(targetEmpId)) {
        triggerRecalculateEligibility(targetEmpId).catch(logRecalcError);
      }

      saveLocalDb();
      res.status(201).json(mapKeys(memRecord, camelToSnake));
    });
    }

    if (!routeRegistry.has('put', itemPath)) {
    app.put(itemPath, requireAuth, requireWriter, async (req, res) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف السجل غير صالح' });
      const data = mapKeys(req.body, snakeToCamel);
      let updatedRecord: any = null;
      let dbAnswered = false;
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable && targetTable.id) {
          const validColumns = new Set(Object.keys(getTableColumns(targetTable)));
          const cleanData: any = {};
          for (const [k, v] of Object.entries(data)) {
            if (validColumns.has(k) && k !== 'id' && k !== 'createdAt') {
              cleanData[k] = v;
            }
          }
          if (cleanData.employeeId !== undefined) {
            cleanData.employeeId = parseInt(cleanData.employeeId);
          }
          if (cleanData.step !== undefined && typeof cleanData.step === 'string') {
            cleanData.step = parseInt(cleanData.step) || 1;
          }
          if (cleanData.grade !== undefined && typeof cleanData.grade === 'string' && !isNaN(parseInt(cleanData.grade))) {
            cleanData.grade = parseInt(cleanData.grade);
          }
          if (cleanData.years !== undefined) {
            cleanData.years = parseInt(cleanData.years) || 0;
          }
          if (cleanData.months !== undefined) {
            cleanData.months = parseInt(cleanData.months) || 0;
          }
          if (cleanData.days !== undefined) {
            cleanData.days = parseInt(cleanData.days) || 0;
          }

          const [updated] = await db.update(targetTable).set(cleanData).where(eq(targetTable.id, id)).returning();
          dbAnswered = true;
          if (updated) {
            updatedRecord = updated;
          }
        }
      } catch (err: any) {
        if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      }
      if (dbAnswered && !updatedRecord) {
        return res.status(404).json({ error: 'السجل المطلوب تعديله غير موجود في قاعدة البيانات' });
      }
      const idx = genericMemoryStores[endpoint].findIndex(r => String(r.id) === String(id));
      const cleanSnake = { ...mapKeys(req.body, camelToSnake), ...(updatedRecord ? mapKeys(updatedRecord, camelToSnake) : {}) };
      let savedRecord: any;
      if (idx !== -1) {
        genericMemoryStores[endpoint][idx] = { ...genericMemoryStores[endpoint][idx], ...cleanSnake, id };
        savedRecord = genericMemoryStores[endpoint][idx];
      } else {
        const recordToPush = { ...cleanSnake, id };
        genericMemoryStores[endpoint].push(recordToPush);
        savedRecord = recordToPush;
      }

      // If qualification was updated, sync to employee central record!
      if (endpoint === 'qualifications') {
        const empId = parseInt(String(savedRecord.employee_id || savedRecord.employeeId || data.employeeId));
        if (empId) {
          if (savedRecord.is_active !== false && savedRecord.isActive !== false) {
            await updateEmployeeCentralRecord(empId, {
              education_level: savedRecord.education_level || savedRecord.level || data.level,
              educationLevel: savedRecord.education_level || savedRecord.level || data.level,
              specialization: savedRecord.specialization || data.specialization,
              university: savedRecord.institution || savedRecord.university || data.university,
              institution: savedRecord.institution || savedRecord.university || data.university,
              graduation_year: savedRecord.graduation_year || data.graduationYear,
              graduationYear: savedRecord.graduation_year || data.graduationYear,
              education_order: savedRecord.evaluation_order || savedRecord.equation_number || savedRecord.education_order || data.equationNumber || data.evaluationOrder,
              evaluation_order: savedRecord.evaluation_order || savedRecord.equation_number || savedRecord.education_order || data.equationNumber || data.evaluationOrder
            }, { effectiveDate: savedRecord.equation_date || savedRecord.equationDate || savedRecord.graduation_date || savedRecord.graduationDate, reason: 'تعديل شهادة', user: (req as any).user?.username });
          } else {
            // Find next active qualification
            // B6: من القاعدة (مخزن الذاكرة فارغ منذ B2)
            const nextActive = (await db.select().from(schema.qualifications).where(eq(schema.qualifications.employeeId, empId)))
              .map(bothCases).find(q => String(q.id) !== String(id) && q.isActive !== false);
            if (nextActive) {
              await updateEmployeeCentralRecord(empId, {
                education_level: nextActive.education_level || nextActive.level,
                educationLevel: nextActive.education_level || nextActive.level,
                specialization: nextActive.specialization || '',
                university: nextActive.institution || nextActive.university || '',
                institution: nextActive.institution || nextActive.university || '',
                graduation_year: nextActive.graduation_year || nextActive.graduationYear || 0,
                graduationYear: nextActive.graduation_year || nextActive.graduationYear || 0,
                education_order: nextActive.evaluation_order || nextActive.equation_number || nextActive.education_order || '',
                evaluation_order: nextActive.evaluation_order || nextActive.equation_number || nextActive.education_order || ''
              }, { reason: 'تعطيل شهادة', user: (req as any).user?.username });
            }
          }
        }
      }

      // Trigger real-time promotion/increment recalculation if relevant entity
      const targetEmpId = parseInt(String(savedRecord?.employee_id || savedRecord?.employeeId || data.employeeId));
      if (targetEmpId && !isNaN(targetEmpId)) {
        triggerRecalculateEligibility(targetEmpId).catch(logRecalcError);
      }

      saveLocalDb();
      return res.json(mapKeys(savedRecord, camelToSnake));
    });
    }

    if (!routeRegistry.has('delete', itemPath)) {
    app.delete(itemPath, requireAuth, requireWriter, async (req, res) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف السجل غير صالح' });
      let deletedRecord: any = (genericMemoryStores[endpoint] || []).find(r => String(r.id) === String(id));
      // B6 (ق-13): الرصيد الآلي من التدريب ما يُحذف بل يُلغى، حتى ما يرجع بأول تعديل على التسجيل
      if (endpoint === 'specialization-credits') {
        try {
          const [cr] = await db.select().from(schema.specializationCourseCredits).where(eq(schema.specializationCourseCredits.id, id));
          if (cr && cr.sourceTrainingId != null) {
            await db.update(schema.specializationCourseCredits)
              .set({ isCancelled: true, cancelledReason: String(req.body?.reason || req.query.reason || 'ألغاه المسؤول') })
              .where(eq(schema.specializationCourseCredits.id, id));
            triggerRecalculateEligibility(cr.employeeId).catch(logRecalcError);
            return res.json({ success: true, cancelled: true });
          }
        } catch (err: any) {
          if (respondIfDbWriteError(res, err, 'إلغاء رصيد الاختصاص')) return;
          return sendRouteError(res, err, 'إلغاء رصيد الاختصاص');
        }
      }
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable && targetTable.id) {
          const removed = await db.delete(targetTable).where(eq(targetTable.id, id)).returning();
          if (removed && removed[0]) deletedRecord = deletedRecord || mapKeys(removed[0], camelToSnake);
        }
      } catch (err: any) {
        if (respondIfDbWriteError(res, err, 'حذف السجل')) return;
      }
      genericMemoryStores[endpoint] = (genericMemoryStores[endpoint] || []).filter(r => String(r.id) !== String(id));

      if (endpoint === 'qualifications' && deletedRecord) {
        const empId = parseInt(String(deletedRecord.employee_id || deletedRecord.employeeId));
        if (empId) {
          // B6: من القاعدة (مخزن الذاكرة فارغ منذ B2)
          const remainingActive = (await db.select().from(schema.qualifications).where(eq(schema.qualifications.employeeId, empId)))
            .map(bothCases).filter(q => String(q.id) !== String(id) && q.isActive !== false);
          if (remainingActive.length > 0) {
            const top = remainingActive[0];
            await updateEmployeeCentralRecord(empId, {
              education_level: top.education_level || top.level,
              educationLevel: top.education_level || top.level,
              specialization: top.specialization || '',
              university: top.institution || top.university || '',
              institution: top.institution || top.university || '',
              graduation_year: top.graduation_year || top.graduationYear || 0,
              graduationYear: top.graduation_year || top.graduationYear || 0,
              education_order: top.evaluation_order || top.equation_number || top.education_order || '',
              evaluation_order: top.evaluation_order || top.equation_number || top.education_order || ''
            }, { reason: 'حذف شهادة', user: (req as any).user?.username });
          }
        }
      }

      // Trigger real-time promotion/increment recalculation if relevant entity
      const targetEmpId = parseInt(String(deletedRecord?.employee_id || deletedRecord?.employeeId));
      if (targetEmpId && !isNaN(targetEmpId)) {
        triggerRecalculateEligibility(targetEmpId).catch(logRecalcError);
      }

      saveLocalDb();
      res.json({ success: true });
    });
    }
  });

  // --- Promotion & Increment Eligibility API (المسار الاعتيادي ومسار الشهادات) ---
  app.get('/api/employees/:id/promotion-eligibility', requireAuth, async (req, res) => {
    try {
      const empId = parseInt(req.params.id);
      if (isNaN(empId)) return res.status(400).json({ error: 'ID غير صالح للموظف' });

      const result = await triggerRecalculateEligibility(empId);
      if (!result) return res.status(404).json({ error: 'الموظف غير موجود' });

      return res.json(result);
    } catch (err: any) {
      console.error('Error calculating promotion eligibility:', err);
      sendRouteError(res, err);
    }
  });

  // --- Degree Recognition Track API (Phase 2b) ---

  // 1. Initiate Degree Recognition for In-Service Qualification
  app.post('/api/qualifications/:id/initiate-degree-recognition', requireAuth, requireWriter, async (req, res) => {
    try {
      const qualId = parseInt(req.params.id);
      if (isNaN(qualId)) return res.status(400).json({ error: 'معرّف الشهادة غير صالح' });

      const rawJobTitleId = req.body.job_title_id || req.body.jobTitleId;
      if (!rawJobTitleId) {
        return res.status(400).json({ error: 'العنوان الوظيفي المرتبط مطلوب لبدء مسار احتساب الشهادة (job_title_id)' });
      }
      const jobTitleId = parseInt(String(rawJobTitleId));

      // Find qualification
      let qual = (genericMemoryStores['qualifications'] || []).find(q => parseInt(String(q.id)) === qualId);
      if (!qual) {
        try {
          const dbQuals = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, qualId));
          if (dbQuals && dbQuals.length > 0) qual = dbQuals[0];
        } catch (e) {}
      }
      if (!qual) return res.status(404).json({ error: 'الشهادة غير موجودة' });

      const empId = parseInt(String(qual.employee_id || qual.employeeId));
      let emp = mem.inMemoryEmployees.find(e => parseInt(String(e.id)) === empId);
      if (!emp) {
        try {
          const dbEmps = await db.select().from(schema.employees).where(eq(schema.employees.id, empId));
          if (dbEmps && dbEmps.length > 0) emp = dbEmps[0];
        } catch (e) {}
      }
      if (!emp) return res.status(404).json({ error: 'الموظف صاحب الشهادة غير موجود' });

      // Find Job Title and extract baseline grade and step strictly from job_titles table
      let jobTitle = jobTitlesCache.list.find(t => parseInt(String(t.id)) === jobTitleId);
      if (!jobTitle) {
        try {
          const dbTitles = await db.select().from(schema.jobTitles).where(eq(schema.jobTitles.id, jobTitleId));
          if (dbTitles && dbTitles.length > 0) jobTitle = dbTitles[0];
        } catch (e) {}
      }
      if (!jobTitle) return res.status(400).json({ error: 'العنوان الوظيفي المحدد غير موجود' });

      const baselineGrade = parseInt(String(jobTitle.min_grade ?? jobTitle.minGrade)) || 7;
      const baselineStep = parseInt(String(jobTitle.min_step ?? jobTitle.minStep)) || 1;

      const qualLevel = qual.level || qual.education_level || qual.name || '';
      const actualGradeBefore = parseInt(String(emp.grade)) || 3;
      const actualStepBefore = parseInt(String(emp.step)) || 1;
      const graduationDateUsed = qual.graduation_date || qual.graduationDate || `${qual.graduation_year || 2020}-01-01`;
      const orderDate = qual.equation_date || qual.equationDate || qual.order_date || new Date().toISOString().split('T')[0];

      // Deactivate any existing active snapshot for this employee
      const existingSnapshots = (genericMemoryStores['degree-track-snapshots'] || []).filter(
        s => parseInt(String(s.employee_id || s.employeeId)) === empId
      );
      existingSnapshots.forEach(s => { s.status = 'مكتمل'; });
      try {
        await db.update(schema.degreeTrackSnapshots).set({ status: 'مكتمل' }).where(eq(schema.degreeTrackSnapshots.employeeId, empId));
      } catch (e) {}

      // Create new snapshot
      const newSnapshotData: any = {
        qualificationId: qualId,
        employeeId: empId,
        jobTitleId: jobTitleId,
        actualGradeBefore,
        actualStepBefore,
        baselineGrade,
        baselineStep,
        graduationDateUsed,
        orderDate,
        status: 'نشط',
        notes: req.body.notes || `بدء مسار احتساب شهادة (${qualLevel}) مقترنة بالعنوان الوظيفي (${jobTitle.name}) بدرجة أساس (${baselineGrade}) ومرحلة أساس (${baselineStep})`,
        createdAt: new Date()
      };

      let createdSnapshot: any = null;
      try {
        const [inserted] = await db.insert(schema.degreeTrackSnapshots).values(newSnapshotData).returning();
        if (inserted) createdSnapshot = inserted;
      } catch (e) {
        console.warn('Database fallback for degreeTrackSnapshots');
      }

      if (!createdSnapshot) {
        createdSnapshot = {
          id: (genericMemoryStores['degree-track-snapshots'] || []).length + 1,
          ...mapKeys(newSnapshotData, camelToSnake),
          created_at: new Date().toISOString()
        };
      }

      genericMemoryStores['degree-track-snapshots'] = genericMemoryStores['degree-track-snapshots'] || [];
      genericMemoryStores['degree-track-snapshots'].push(mapKeys(createdSnapshot, camelToSnake));

      // Run simulation engine & save steps
      // B3/إصلاح: مدخلات المحاكاة من القاعدة (كانت من الذاكرة الفارغة بعد B2e، وأنواع العقوبات من
      // قائمة الكود بتأخير 0 للتوبيخ والإنذار). أنواع العقوبات من جدولها أو الافتراضي القانوني.
      const simCtx = await loadEngineContext(db, schema, empId);
      const simResult = calculateDegreeTrackSimulation(createdSnapshot, {
        specializationCredits: simCtx.specializationCredits,
        penalties: simCtx.penalties,
        leaves: simCtx.leaves.map(toEngineLeave),
        attendances: simCtx.attendances,
        penaltyTypes: await loadPenaltyTypesForEngine(),
        weeksPerPromotion: simCtx.weeksPerPromotion, // B6 (ق-13)
      });

      // Clear previous simulation steps for this snapshot and insert new ones
      genericMemoryStores['degree-track-simulation-steps'] = (genericMemoryStores['degree-track-simulation-steps'] || []).filter(
        st => parseInt(String(st.snapshot_id || st.snapshotId)) !== parseInt(String(createdSnapshot.id))
      );

      for (const step of simResult.simulationSteps) {
        const stepDbData = {
          snapshotId: createdSnapshot.id,
          fromGrade: step.fromGrade,
          toGrade: step.toGrade,
          computedDate: step.computedDate,
          weeksConsumed: step.weeksConsumed,
          isBundled: step.isBundled || false,
          status: step.status,
          notes: step.notes || '',
          createdAt: new Date()
        };

        let insertedStep: any = null;
        try {
          const [ins] = await db.insert(schema.degreeTrackSimulationSteps).values(stepDbData).returning();
          if (ins) insertedStep = ins;
        } catch (e) {}

        if (!insertedStep) {
          insertedStep = {
            id: (genericMemoryStores['degree-track-simulation-steps'] || []).length + 1,
            ...mapKeys(stepDbData, camelToSnake),
            created_at: new Date().toISOString()
          };
        }
        genericMemoryStores['degree-track-simulation-steps'].push(mapKeys(insertedStep, camelToSnake));
      }

      // Trigger recalculation of employee eligibility
      await triggerRecalculateEligibility(empId);

      saveLocalDb();
      return res.status(201).json({
        snapshot: mapKeys(createdSnapshot, camelToSnake),
        simulation: simResult
      });
    } catch (err: any) {
      console.error('Error initiating degree recognition:', err);
      sendRouteError(res, err);
    }
  });

  // 2. Get Simulation Report for Snapshot
  app.get('/api/degree-track-snapshots/:id/simulation', requireAuth, async (req, res) => {
    try {
      const snapId = parseInt(req.params.id);
      // B6: كل المدخلات من القاعدة (مخازن الذاكرة فارغة منذ B2)
      const [snapshot] = await db.select().from(schema.degreeTrackSnapshots).where(eq(schema.degreeTrackSnapshots.id, snapId));
      if (!snapshot) return res.status(404).json({ error: 'سجل احتساب الشهادة غير موجود' });

      const empId = parseInt(String(snapshot.employeeId));
      const { inputs } = degreeTrackInputs(await loadEngineContext(db, schema, empId), toEngineLeave);
      const simResult = calculateDegreeTrackSimulation(bothCases(snapshot), inputs);

      return res.json({
        snapshot: mapKeys(snapshot, camelToSnake),
        simulation: simResult
      });
    } catch (err: any) {
      console.error('Error fetching degree track simulation:', err);
      sendRouteError(res, err);
    }
  });

  // 3. Get Active Degree Track for Employee
  app.get('/api/employees/:id/degree-track', requireAuth, async (req, res) => {
    try {
      const empId = parseInt(req.params.id);
      // B6: من القاعدة (كان يرجع «لا مسار نشط» لكل موظف لأن مخزن الذاكرة فارغ)
      const { activeSnap: snapshot, inputs } = degreeTrackInputs(await loadEngineContext(db, schema, empId), toEngineLeave);
      if (!snapshot) return res.json({ hasActiveDegreeTrack: false, snapshot: null, simulation: null });

      const simResult = calculateDegreeTrackSimulation(snapshot, inputs);

      return res.json({
        hasActiveDegreeTrack: true,
        snapshot: mapKeys(snapshot, camelToSnake),
        simulation: simResult
      });
    } catch (err: any) {
      console.error('Error fetching employee degree track:', err);
      sendRouteError(res, err);
    }
  });
}
