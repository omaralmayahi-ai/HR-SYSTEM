// server/routes/legacy/archive.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

export function registerArchiveRoutes(app: Express, deps: any) {
  const {
    EMPLOYEE_RESTORE_MEMKEY_BY_KEY, EMPLOYEE_RESTORE_ORDER, EMPLOYEE_RESTORE_TABLE_BY_KEY, camelToSnake, db, eq,
    genericMemoryStores, inArray, mapKeys, mem, requireAdmin, requireAuth,
    saveLocalDb, schema, snakeToCamel, syncEmployeeRecord,
  } = deps;

  app.post('/api/archive/:id/restore', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    try {
      const [row] = await db.select().from(schema.archivedItems).where(eq(schema.archivedItems.id, id));
      if (!row) {
        return res.status(404).json({ error: 'السجل غير موجود في الأرشيف' });
      }

      if (row.entityType !== 'employee') {
        return res.status(400).json({ error: `استعادة نوع السجلات (${row.entityType}) غير مدعومة حالياً` });
      }

      const parsed = JSON.parse(row.data);
      // توافق مع السجلات المؤرشفة قبل تحديث 1 أيلول 2026: كانت data تحتوي وقتها على كائن الموظف
      // مباشرة دون سجلاته المرتبطة (لأن الحذف كان يُمنع أصلاً عند وجود أي سجلات مرتبطة سابقاً)
      const isLegacyFormat = !parsed.employee && !parsed.related;
      const snapshot = isLegacyFormat ? parsed : parsed.employee;
      const related: Record<string, any[]> = isLegacyFormat ? {} : (parsed.related || {});

      // منع الاستعادة إذا كان هناك موظف حالياً يحمل نفس المعرّف أو نفس رقم الشركة (تضارب بيانات)
      const [existingById] = await db.select().from(schema.employees).where(eq(schema.employees.id, row.entityId));
      if (existingById) {
        return res.status(400).json({ error: 'يوجد موظف آخر مسجَّل حالياً بنفس المعرّف، تعذّرت الاستعادة' });
      }
      if (snapshot.companyNumber) {
        const [existingByCompanyNumber] = await db.select().from(schema.employees).where(eq(schema.employees.companyNumber, snapshot.companyNumber));
        if (existingByCompanyNumber) {
          return res.status(400).json({ error: `رقم الشركة (${snapshot.companyNumber}) مستخدم حالياً من قبل موظف آخر، تعذّرت الاستعادة` });
        }
      }

      const restoreData: any = { ...snapshot, id: row.entityId };
      delete restoreData.createdAt;
      delete restoreData.created_at;

      // إدراج صف الموظف نفسه: هذه الخطوة وحدها حرجة ويجب أن تنجح لتُعتبر الاستعادة ناجحة
      await db.insert(schema.employees).values(restoreData);

      // إدراج كل جدول من الجداول المرتبطة بمعاملة (transaction) مستقلة خاصة به: فشل جدول واحد فقط
      // (كحالات انحراف تعريف الأعمدة القديمة والموثّقة سابقاً بين schema.ts وقاعدة البيانات الفعلية
      // — مثال حي: عمود course_type في training_courses معرَّف في schema.ts لكنه غير موجود فعلياً في
      // الجدول الحي) لا يجوز أن يُسقط استعادة بقية بيانات الموظف بأكملها. هذا يطابق تماماً الفلسفة
      // المعتمدة في بقية نقاط النظام: قاعدة البيانات طبقة "أفضل جهد"، ومخزن الذاكرة المؤقتة (الذي
      // تُزامَن معه كل السجلات المستعادة أدناه بلا استثناء) هو مصدر الحقيقة الفعلي الذي يعمل عليه
      // النظام عند تعذّر الكتابة الحية — تماماً كما كان الحال قبل حذف الموظف أصلاً.
      const dbPersistFailures: Record<string, string> = {};
      for (const key of EMPLOYEE_RESTORE_ORDER) {
        const table = EMPLOYEE_RESTORE_TABLE_BY_KEY[key];
        const rows = (related[key] || []).map((r: any) => {
          const clean = { ...r };
          delete clean.createdAt; delete clean.created_at;
          delete clean.updatedAt; delete clean.updated_at;
          return clean;
        });
        if (table && rows.length > 0) {
          try {
            await db.transaction(async (tx) => {
              // تنظيف احتياطي: حذف أي صف حي قد يحمل نفس المعرّف مسبقاً قبل إعادة الإدراج. هذا يحمي
              // من حالة أرشيف قديم/تالف (كالثغرة التي كانت موجودة قبل 2 أيلول 2026 حين لم تكن بعض
              // الجداول تُحذف فعلياً عند الأرشفة، فتبقى نسخ يتيمة حيّة بنفس المعرّفات) دون أي خطر على
              // بيانات موظفين آخرين، لأن هذه المعرّفات (id) خاصة حصراً بسجلات هذا الموظف المؤرشف.
              const restoreIds = rows.map((r: any) => r.id).filter((v: any) => v != null);
              if (restoreIds.length > 0) {
                await tx.delete(table).where(inArray(table.id, restoreIds));
              }
              await tx.insert(table).values(rows);
            });
          } catch (tableError: any) {
            const tableDetail = tableError?.cause?.message || tableError?.message || String(tableError);
            console.warn(`Database fallback for restoring "${key}" (kept in memory layer only):`, tableDetail);
            dbPersistFailures[key] = tableDetail;
          }
        }
      }

      // مزامنة مخازن الذاكرة المؤقتة: إعادة الموظف وكل سجلاته المرتبطة كما كانت قبل الحذف تماماً
      syncEmployeeRecord(mapKeys(restoreData, snakeToCamel), 'insert');
      for (const [tableKey, memKey] of Object.entries(EMPLOYEE_RESTORE_MEMKEY_BY_KEY)) {
        const rows = related[tableKey] || [];
        if (rows.length === 0) continue;
        genericMemoryStores[memKey] = genericMemoryStores[memKey] || [];
        for (const r of rows) {
          genericMemoryStores[memKey].push({ ...mapKeys(r, snakeToCamel), ...mapKeys(r, camelToSnake) });
        }
      }
      // إعادة ربط أسماء المتغيرات المسمّاة بمخازنها العامة (نفس نمط syncEntityRecord أعلاه)
      mem.inMemoryCareerHistories = genericMemoryStores['career'];
      mem.inMemoryLeaves = genericMemoryStores['leaves'];
      mem.inMemoryPenalties = genericMemoryStores['penalties'];
      mem.inMemoryAppreciations = genericMemoryStores['appreciations'];
      mem.inMemoryPerformanceEvaluations = genericMemoryStores['performance'];
      mem.inMemoryQualifications = genericMemoryStores['qualifications'];
      mem.inMemoryJobAssignments = genericMemoryStores['job-assignments'];
      mem.inMemoryPromotions = genericMemoryStores['promotions'];
      mem.inMemorySalaryAllowances = genericMemoryStores['salary-allowances'];
      mem.inMemoryAnnualEvaluations = genericMemoryStores['annual-evaluations'];
      mem.inMemoryTrainingCourses = genericMemoryStores['training-courses'];
      mem.inMemoryTransfers = genericMemoryStores['transfers'];
      mem.inMemoryRetirements = genericMemoryStores['retirements'];
      mem.inMemoryDocuments = genericMemoryStores['documents'];
      mem.inMemoryServiceRecords = genericMemoryStores['service-records'];
      mem.inMemoryServiceCredits = genericMemoryStores['service-credits'];
      mem.inMemoryDegreeTrackSnapshots = genericMemoryStores['degree-track-snapshots'];
      mem.inMemoryDegreeTrackSimulationSteps = genericMemoryStores['degree-track-simulation-steps'];
      mem.inMemorySpecializationCredits = genericMemoryStores['specialization-credits'];
      mem.inMemoryPromotionDelayReasons = genericMemoryStores['promotion-delay-reasons'];
      genericMemoryStores['promotion_delay_reasons'] = mem.inMemoryPromotionDelayReasons;

      await db.delete(schema.archivedItems).where(eq(schema.archivedItems.id, id));
      saveLocalDb();

      if (Object.keys(dbPersistFailures).length > 0) {
        console.warn('Restore completed with partial DB persistence for employee', row.entityId, '- tables kept in memory layer only:', Object.keys(dbPersistFailures).join(', '));
      }
      res.json({ success: true, restoredId: row.entityId, dbPersistFailures: Object.keys(dbPersistFailures) });
    } catch (error: any) {
      const detail = error?.cause?.message || error?.message || String(error);
      console.error('Error restoring archived item:', detail);
      res.status(500).json({ error: 'تعذّرت استعادة السجل من الأرشيف: ' + detail });
    }
  });

  app.delete('/api/archive/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    try {
      // ملاحظة (تحديث 1 أيلول 2026): الأرشفة (الحذف الأول) تنقل الموظف وكل سجلاته المرتبطة فعلياً
      // خارج الجداول الحية إلى داخل هذا السجل المؤرشف (data) كنسخة JSON كاملة. لذلك "الحذف النهائي"
      // هنا يعني إتلاف هذه النسخة الاحتياطية نفسها بشكل نهائي ولا رجعة فيه — وهذا يحقق تلقائياً ما
      // طُلب: أي ملف كان مشتركاً مع موظفين آخرين (كملف "مدرّب" داخلي مرتبط بدورات تدريبية سُجّلت
      // لموظفين آخرين) سبق حذفه من الجداول الحية عند الأرشفة، بينما تبقى بيانات وسجلات الموظفين
      // الآخرين المرتبطة به (كاسم المدرّب المحفوظ ضمن كل دورة تدريبية) محفوظة دون أي مساس بها.
      const deletedRows = await db.delete(schema.archivedItems).where(eq(schema.archivedItems.id, id)).returning({ id: schema.archivedItems.id });
      if (!deletedRows || deletedRows.length === 0) {
        return res.status(404).json({ error: 'السجل غير موجود في الأرشيف' });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error permanently deleting archived item:', error?.message);
      res.status(500).json({ error: 'تعذّر الحذف النهائي للسجل من الأرشيف' });
    }
  });
}
