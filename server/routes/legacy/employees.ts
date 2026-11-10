// server/routes/legacy/employees.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

export function registerEmployeesRoutes(app: Express, deps: any) {
  const {
    EMPLOYEE_SORT_COLUMNS, SALARY_TABLE, and, asc, bothCases, buildEmployeeFilterConditions,
    camelToSnake, checkJobTitleInDirectory, classifyDbError, db, desc, enhanceEmployeeRecord,
    eq, findEmployeeByCivilServiceNumber, findEmployeeByCompanyNumber, findEmployeeByServiceRecordNumber, generateUniqueEmployeeIdNumber, isDbConnectionFailure,
    mapKeys, mem, normalizeEmployeePayload, normalizeJobTitleName, processEmployeeEducationData, processEmployeeNameData,
    requireAdmin, requireAuth, requireWriter, respondIfDbWriteError, sanitizeEmployeeData, saveLocalDb,
    schema, sendRouteError, snakeToCamel, sqlCount, syncEmployeeQualificationFromEmployee, syncEmployeeRecord,
    validateCompanyNumberFormat, validateEmployeeImportRow,
  } = deps;

  app.get('/api/employees', requireAuth, async (req, res) => {

    // مسار الترقيم والفلترة من جهة الخادم: يُفعَّل فقط عند وجود معامل page في الطلب، حفاظاً على
    // التوافق التام مع كل الاستدعاءات القديمة الأخرى في النظام (الحضور، الرواتب، التقارير...) التي
    // تستدعي هذا المسار بلا معاملات وتتوقع القائمة الكاملة كما كانت دوماً.
    if (req.query.page !== undefined) {
      try {
        const page = Math.max(1, parseInt(String(req.query.page)) || 1);
        const pageSize = Math.min(500, Math.max(1, parseInt(String(req.query.pageSize)) || 50));
        const sortCol = EMPLOYEE_SORT_COLUMNS[String(req.query.sortBy)] || schema.employees.id;
        const sortDir = String(req.query.sortDir) === 'desc' ? desc : asc;

        const conditions = await buildEmployeeFilterConditions(req.query);
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        let rows: any[] = [];
        let total = 0;
        try {
          const [{ value: totalCount }] = whereClause
            ? await db.select({ value: sqlCount() }).from(schema.employees).where(whereClause)
            : await db.select({ value: sqlCount() }).from(schema.employees);
          total = Number(totalCount) || 0;

          // مهم: .where() يجب أن يُستدعى مباشرة بعد .from() وقبل .orderBy()/.limit()/.offset() -
          // بناء الاستعلام بترتيب مختلف يفشل بصمت في Drizzle ويؤدي لسقوط الاستعلام كاملاً إلى catch (dbErr)
          rows = whereClause
            ? await db.select().from(schema.employees).where(whereClause).orderBy(sortDir(sortCol)).limit(pageSize).offset((page - 1) * pageSize)
            : await db.select().from(schema.employees).orderBy(sortDir(sortCol)).limit(pageSize).offset((page - 1) * pageSize);
        } catch (dbErr: any) {
          console.warn('Database fallback for paginated employees list:', dbErr?.message);
          // احتياطي: فلترة/ترقيم على نسخة الذاكرة عند فشل الاستعلام المباشر لقاعدة البيانات
          rows = mem.inMemoryEmployees.slice((page - 1) * pageSize, page * pageSize);
          total = mem.inMemoryEmployees.length;
        }

        return res.json({
          data: rows.map(enhanceEmployeeRecord),
          total,
          page,
          pageSize,
        });
      } catch (error: any) {
        console.error('Error in paginated employees list:', error);
        return sendRouteError(res, error);
      }
    }

    const statusFilter = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
    try {
      const allEmployees = statusFilter
        ? await db.select().from(schema.employees).where(eq(schema.employees.status, statusFilter)).orderBy(desc(schema.employees.createdAt))
        : await db.select().from(schema.employees).orderBy(desc(schema.employees.createdAt));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(allEmployees.map(enhanceEmployeeRecord));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const memList = statusFilter
      ? mem.inMemoryEmployees.filter(e => String(e.status || 'مستمر') === statusFilter)
      : mem.inMemoryEmployees;
    res.json(memList.map(enhanceEmployeeRecord));
  });

  app.post('/api/employees', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = normalizeEmployeePayload(req.body);
      const mappedData = mapKeys(data, snakeToCamel);
      processEmployeeNameData(mappedData, true);
      processEmployeeEducationData(mappedData);

      // رقم الشركة: تحقق من الصيغة أولاً (6 أرقام، أو حروف مسموحة لعقد/أجر يومي)
      const companyNumberCheck = validateCompanyNumberFormat(mappedData.companyNumber, mappedData.serviceType);
      if (!companyNumberCheck.isValid) {
        return res.status(400).json({ error: companyNumberCheck.error });
      }
      // منع تكرار رقم الشركة بين الموظفين
      const duplicateEmployee = await findEmployeeByCompanyNumber(mappedData.companyNumber);
      if (duplicateEmployee) {
        return res.status(400).json({ error: `رقم الشركة (${String(mappedData.companyNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
      }

      // الرقم الوظيفي (رقم وزارة التخطيط): منع التكرار إن أُدخل فعلياً (ليس فارغاً وليس "سيتم تسجيله لاحقاً")
      if (mappedData.civilServiceNumber) {
        const duplicateCivilServiceNumber = await findEmployeeByCivilServiceNumber(mappedData.civilServiceNumber);
        if (duplicateCivilServiceNumber) {
          return res.status(400).json({ error: `الرقم الوظيفي (${String(mappedData.civilServiceNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
        }
      }

      if (mappedData.serviceRecordNumber) {
        const dupRecord = await findEmployeeByServiceRecordNumber(mappedData.serviceRecordNumber);
        if (dupRecord) {
          return res.status(400).json({ error: `رقم الإضبارة (${String(mappedData.serviceRecordNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
        }
      }

      // رقم هوية الموظف: يُنشأ تلقائياً دوماً عند الإضافة (يتجاهل أي قيمة قد تُرسل من الواجهة لهذا الحقل تحديداً)
      mappedData.employeeIdNumber = await generateUniqueEmployeeIdNumber();

      const cleanData = sanitizeEmployeeData(mappedData);

      if (mappedData.jobTitle || data.job_title) {
        const rawTitle = String(mappedData.jobTitle || data.job_title || '').trim();
        const titleCheck = await checkJobTitleInDirectory(rawTitle);
        if (titleCheck.error) {
          return res.status(400).json({ error: titleCheck.error });
        }
        if (titleCheck.match) {
          mappedData.jobTitle = titleCheck.match.name;
          cleanData.jobTitle = titleCheck.match.name;
          mappedData.jobTitleId = titleCheck.match.id;
        }
      }

      let insertedFromDb: any = null;
      try {
        const [newEmployee] = await db.insert(schema.employees).values(cleanData).returning();
        if (newEmployee && newEmployee.id) {
          insertedFromDb = newEmployee;
        }
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'إضافة الموظف')) return;
      }

      const newId = insertedFromDb?.id || (mem.inMemoryEmployees.length > 0 ? Math.max(...mem.inMemoryEmployees.map(e => parseInt(String(e.id)) || 0)) + 1 : 1);
      const memEmployee: any = {
        id: newId,
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      for (const [k, v] of Object.entries(mappedData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        memEmployee[k] = v;
        memEmployee[camelKey] = v;
        memEmployee[snakeKey] = v;
      }
      for (const [k, v] of Object.entries(cleanData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        memEmployee[k] = v;
        memEmployee[camelKey] = v;
        memEmployee[snakeKey] = v;
      }
      if (insertedFromDb) {
        for (const [k, v] of Object.entries(insertedFromDb)) {
          const camelKey = snakeToCamel(k);
          const snakeKey = camelToSnake(k);
          memEmployee[k] = v;
          memEmployee[camelKey] = v;
          memEmployee[snakeKey] = v;
        }
      }

      syncEmployeeRecord(memEmployee, 'insert');
      await syncEmployeeQualificationFromEmployee(newId, mappedData);
      saveLocalDb();
      res.status(201).json(enhanceEmployeeRecord(memEmployee));
    } catch (error: any) {
      console.error('Error creating employee:', error);
      sendRouteError(res, error);
    }
  });

  app.post('/api/employees/bulk-import', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { employees } = req.body;
      if (!Array.isArray(employees) || employees.length === 0) {
        return res.status(400).json({ error: 'لم يتم تزويد قائمة موظفين صالحة للترحيل' });
      }

      // إصلاح عاجل: قوائم التحقق من القاعدة لا من الذاكرة (فارغة بعد B2e)
      const [ljt, led, lss] = await Promise.all([
        db.select().from(schema.jobTitles), db.select().from(schema.educationDegrees), db.select().from(schema.shiftSystems),
      ]);
      const lookupData = {
        jobTitles: ljt.map(bothCases),
        educationDegrees: led.map(bothCases),
        shiftSystems: lss.map(bothCases),
        salaryScaleMap: SALARY_TABLE
      };

      let insertedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const rejectedRows: any[] = [];
      const processedEmployees: any[] = [];

      for (let idx = 0; idx < employees.length; idx++) {
        const empItem = employees[idx];
        const rowNum = empItem.excelRowNumber || empItem.rowNumber || (idx + 2);
        const action = empItem.action || (empItem.overwrite ? 'update' : 'insert');
        if (action === 'skip') {
          skippedCount++;
          continue;
        }

        const empData = empItem.data || empItem;
        const mappedData = mapKeys(empData, snakeToCamel);
        delete mappedData.id;
        delete mappedData.createdAt;

        // Perform strict validation against authoritative settings tables
        const valResult = validateEmployeeImportRow(mappedData, lookupData);
        if (!valResult.isValid) {
          rejectedRows.push({
            rowNumber: rowNum,
            name: mappedData.fullName || mappedData.firstName || empData.full_name || empData.first_name || 'موظف',
            companyNumber: mappedData.companyNumber || empData.company_number || '',
            reason: valResult.errors.join(' | '),
            errors: valResult.errors
          });
          continue; // Skip this row and do NOT reject the whole file!
        }

        processEmployeeNameData(mappedData, true);
        processEmployeeEducationData(mappedData);

        // لا تُختلق قيم افتراضية للحالة أو نوع الخدمة أو الجنس: الحقل الفارغ يبقى فارغاً («بيانات ناقصة»).

        const cleanData = sanitizeEmployeeData(mappedData);
        let handled = false;

        try {
          const companyNum = mappedData.companyNumber ? String(mappedData.companyNumber).trim() : null;
          const civilNum = mappedData.civilServiceNumber ? String(mappedData.civilServiceNumber).trim() : null;

          let existingEmp = null;
          if (companyNum) {
            const [found] = await db.select().from(schema.employees).where(eq(schema.employees.companyNumber, companyNum));
            existingEmp = found;
          }
          if (!existingEmp && civilNum) {
            const [found] = await db.select().from(schema.employees).where(eq(schema.employees.civilServiceNumber, civilNum));
            existingEmp = found;
          }

          if (existingEmp && action === 'update') {
            const [updated] = await db.update(schema.employees)
              .set(cleanData)
              .where(eq(schema.employees.id, existingEmp.id))
              .returning();

            handled = true;
            updatedCount++;
            if (updated) {
              await syncEmployeeQualificationFromEmployee(updated.id, mappedData);
              syncEmployeeRecord(updated, 'update');
              processedEmployees.push(enhanceEmployeeRecord(updated));
              handled = true;
            }
          } else {
            const [inserted] = await db.insert(schema.employees).values(cleanData).returning();
            handled = true;
            insertedCount++;

            if (inserted) {
              await syncEmployeeQualificationFromEmployee(inserted.id, mappedData);
              syncEmployeeRecord(inserted, 'insert');
              processedEmployees.push(enhanceEmployeeRecord(inserted));
              handled = true;
            }
          }
        } catch (dbErr) {
          if (!isDbConnectionFailure(dbErr)) {
            // خطأ بيانات حقيقي (تكرار، قيد، صيغة): يُرفض الصف ولا يُحسب ضمن المُدرَجين ولا يُكتب في الذاكرة.
            const classified = classifyDbError(dbErr, 'حفظ الصف');
            console.error(`[DB-ERROR] bulk import row ${rowNum}:`, (dbErr as any)?.cause?.message || (dbErr as any)?.message);
            rejectedRows.push({
              rowNumber: rowNum,
              name: mappedData.fullName || mappedData.firstName || empData.full_name || empData.first_name || 'موظف',
              companyNumber: mappedData.companyNumber || empData.company_number || '',
              reason: classified.message,
              errors: [classified.message]
            });
            continue;
          }
          console.warn('Database fallback (offline) for bulk import item');
        }

        if (!handled) {
          const newId = mem.inMemoryEmployees.length > 0 ? Math.max(...mem.inMemoryEmployees.map(e => e.id || 0)) + 1 : 1;
          const memEmp = { id: newId, ...cleanData, createdAt: new Date().toISOString() };
          syncEmployeeRecord(memEmp, 'insert');
          await syncEmployeeQualificationFromEmployee(newId, mappedData);
          processedEmployees.push(enhanceEmployeeRecord(memEmp));
          insertedCount++;
        }
      }

      saveLocalDb();
      res.json({
        success: true,
        totalCount: employees.length,
        acceptedCount: processedEmployees.length,
        rejectedCount: rejectedRows.length,
        insertedCount,
        updatedCount,
        skippedCount,
        rejectedRows,
        employees: processedEmployees
      });
    } catch (error: any) {
      console.error('Error in bulk import:', error);
      sendRouteError(res, error, 'ترحيل الموظفين');
    }
  });

  // إحصائية عدد الموظفين ضمن كل حالة (لبطاقات التنقل بين الحالات في صفحة الموظفين)
  // ملاحظة: يجب أن يُسجَّل هذا المسار قبل app.get('/api/employees/:id') وإلا سيُفسَّر
  // "status-counts" كمعرّف موظف (:id) لأن Express يطابق المسارات بترتيب التسجيل.
  app.get('/api/employees/status-counts', requireAuth, async (req, res) => {
    try {
      const rows = await db
        .select({ status: schema.employees.status, count: sqlCount() })
        .from(schema.employees)
        .groupBy(schema.employees.status);
      const counts: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        const key = r.status || 'غير محدد';
        const n = Number(r.count) || 0;
        counts[key] = (counts[key] || 0) + n;
        total += n;
      }
      return res.json({ counts, total });
    } catch (error: any) {
      console.warn('Database fallback for employee status counts:', error?.message);
      const counts: Record<string, number> = {};
      for (const e of mem.inMemoryEmployees) {
        const key = e.status || e.Status || 'غير محدد';
        counts[key] = (counts[key] || 0) + 1;
      }
      return res.json({ counts, total: mem.inMemoryEmployees.length });
    }
  });

  app.get('/api/employees/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    try {
      const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
      if (employee) {
        return res.json(enhanceEmployeeRecord(employee));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const memEmp = mem.inMemoryEmployees.find(e => parseInt(String(e.id)) === id);
    if (memEmp) {
      return res.json(enhanceEmployeeRecord(memEmp));
    }
    res.status(404).json({ error: 'الموظف غير موجود' });
  });

  app.put('/api/employees/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    const data = normalizeEmployeePayload(req.body);
    const mappedData = mapKeys(data, snakeToCamel);
    processEmployeeNameData(mappedData, false);
    processEmployeeEducationData(mappedData);

    // رقم الشركة: تحقق من الصيغة والتفرد عند التعديل أيضاً (إن أُرسل الحقل ضمن التحديث)
    if (mappedData.companyNumber !== undefined) {
      const companyNumberCheck = validateCompanyNumberFormat(mappedData.companyNumber, mappedData.serviceType);
      if (!companyNumberCheck.isValid) {
        return res.status(400).json({ error: companyNumberCheck.error });
      }
      const duplicateEmployee = await findEmployeeByCompanyNumber(mappedData.companyNumber, id);
      if (duplicateEmployee) {
        return res.status(400).json({ error: `رقم الشركة (${String(mappedData.companyNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
      }
    }

    // الرقم الوظيفي (رقم وزارة التخطيط): يُمنع إدخال رقم مستخدم لموظف آخر، لكن فقط إذا تغيّر الرقم.
    // قرار 2026-11-09: المعرّف الموثوق هو رقم الشركة؛ الرقم الوظيفي غير مفروض فريداً في القاعدة
    // (توجد تكرارات قديمة)، فلا يُقفل تعديل بقية بيانات موظف يحمل رقماً مكرراً قديماً.
    let civilUnchanged = false;
    if (mappedData.civilServiceNumber !== undefined && mappedData.civilServiceNumber) {
      try {
        const [cur] = await db.select({ csn: schema.employees.civilServiceNumber }).from(schema.employees).where(eq(schema.employees.id, id));
        civilUnchanged = !!cur && String(cur.csn ?? '').trim() === String(mappedData.civilServiceNumber).trim();
      } catch { /* القاعدة غير متاحة: يُطبَّق الفحص كالمعتاد */ }
    }
    if (!civilUnchanged && mappedData.civilServiceNumber !== undefined && mappedData.civilServiceNumber) {
      const duplicateCivilServiceNumber = await findEmployeeByCivilServiceNumber(mappedData.civilServiceNumber, id);
      if (duplicateCivilServiceNumber) {
        return res.status(400).json({ error: `الرقم الوظيفي (${String(mappedData.civilServiceNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
      }
    }

    if (mappedData.serviceRecordNumber) {
      try {
        const dupRecord = await findEmployeeByServiceRecordNumber(mappedData.serviceRecordNumber, id);
        if (dupRecord) {
          return res.status(400).json({ error: `رقم الإضبارة (${String(mappedData.serviceRecordNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
        }
      } catch (dupErr) {
        return sendRouteError(res, dupErr, 'التحقق من رقم الإضبارة');
      }
    }

    // رقم هوية الموظف: يُنشأ تلقائياً مرة واحدة فقط عند الإضافة، ولا يُسمح بتعديله يدوياً عبر واجهة التعديل إطلاقاً
    delete mappedData.employeeIdNumber;

    const cleanData = sanitizeEmployeeData(mappedData);

    if (mappedData.jobTitle || data.job_title) {
      const rawTitle = String(mappedData.jobTitle || data.job_title || '').trim();
      // يُفحص العنوان مقابل الدليل فقط إذا تغيّر عن العنوان المحفوظ حالياً (السجلات القديمة لا تُقفل).
      let currentTitle = '';
      try {
        const [cur] = await db.select({ jobTitle: schema.employees.jobTitle }).from(schema.employees).where(eq(schema.employees.id, id));
        currentTitle = String(cur?.jobTitle || '').trim();
      } catch (curErr) {
        if (!isDbConnectionFailure(curErr)) return sendRouteError(res, curErr, 'تعديل الموظف');
        const memCur = mem.inMemoryEmployees.find(e => parseInt(String(e.id)) === id);
        currentTitle = String(memCur?.jobTitle || memCur?.job_title || '').trim();
      }
      if (normalizeJobTitleName(rawTitle) !== normalizeJobTitleName(currentTitle)) {
        let titleCheck: { error: string | null; match: any | null };
        try {
          titleCheck = await checkJobTitleInDirectory(rawTitle);
        } catch (dirErr) {
          return sendRouteError(res, dirErr, 'التحقق من العنوان الوظيفي');
        }
        if (titleCheck.error) {
          return res.status(400).json({ error: titleCheck.error });
        }
        if (titleCheck.match) {
          mappedData.jobTitle = titleCheck.match.name;
          cleanData.jobTitle = titleCheck.match.name;
          mappedData.jobTitleId = titleCheck.match.id;
        }
      }
    }

    let updatedFromDb: any = null;
    let dbAnswered = false;
    try {
      const [updatedEmployee] = Object.keys(cleanData).length > 0
        ? await db.update(schema.employees).set(cleanData).where(eq(schema.employees.id, id)).returning()
        : await db.select().from(schema.employees).where(eq(schema.employees.id, id));
      dbAnswered = true;

      if (updatedEmployee && updatedEmployee.id) {
        updatedFromDb = updatedEmployee;
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل بيانات الموظف')) return;
    }
    if (dbAnswered && !updatedFromDb) {
      return res.status(404).json({ error: 'الموظف غير موجود' });
    }

    const idx = mem.inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === id);
    let updatedRecord: any = null;
    if (idx !== -1) {
      const current = mem.inMemoryEmployees[idx];
      updatedRecord = { ...current };
      for (const [k, v] of Object.entries(mappedData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        updatedRecord[k] = v;
        updatedRecord[camelKey] = v;
        updatedRecord[snakeKey] = v;
      }
      for (const [k, v] of Object.entries(cleanData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        updatedRecord[k] = v;
        updatedRecord[camelKey] = v;
        updatedRecord[snakeKey] = v;
      }
      if (updatedFromDb) {
        for (const [k, v] of Object.entries(updatedFromDb)) {
          const camelKey = snakeToCamel(k);
          const snakeKey = camelToSnake(k);
          updatedRecord[k] = v;
          updatedRecord[camelKey] = v;
          updatedRecord[snakeKey] = v;
        }
      }
      updatedRecord.updatedAt = new Date().toISOString();
      updatedRecord.updated_at = new Date().toISOString();
      mem.inMemoryEmployees[idx] = updatedRecord;
    } else {
      updatedRecord = { id, ...mappedData, ...cleanData, ...(updatedFromDb || {}) };
      mem.inMemoryEmployees.push(updatedRecord);
    }

    await syncEmployeeQualificationFromEmployee(id, mappedData);
    saveLocalDb();
    res.json(enhanceEmployeeRecord(updatedRecord));
  });
}
