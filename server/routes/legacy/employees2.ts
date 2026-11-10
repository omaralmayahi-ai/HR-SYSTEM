// server/routes/legacy/employees2.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

import { countRelatedRecords } from '../../employeeDeletion.ts';

export function registerEmployees2Routes(app: Express, deps: any) {
  const {
    EMPLOYEE_CASCADE_TABLES, buildEmployeeCascadeSnapshot, camelToSnake, checkEmployeeRelatedRecords, db, desc,
    eq, inArray, mapKeys, mem, removeEmployeeFromMemoryStores, requireAdmin,
    requireAuth, saveLocalDb, schema, syncEmployeeRecord,
  } = deps;

  app.delete('/api/employees/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // جلب نسخة كاملة من بيانات الموظف قبل الحذف لأرشفتها: الحذف هنا ليس نهائياً، بل نقل — هو وجميع
    // سجلاته المرتبطة بكل مفاصل النظام دفعة واحدة — إلى أرشيف المحذوفات (archived_items)، حسب طلب
    // دقيق بتاريخ 1 أيلول 2026: لم يعد الحذف يُمنع لوجود سجلات مرتبطة، بل تُنقل معه جميعها للأرشيف،
    // ومن هناك إما استعادة كاملة أو حذف نهائي لا رجعة فيه.
    let employeeSnapshot: any = null;
    try {
      const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
      if (employee) employeeSnapshot = employee;
    } catch (error: any) {
      console.warn('Database fallback for employee snapshot before archive');
    }
    if (!employeeSnapshot) {
      employeeSnapshot = mem.inMemoryEmployees.find((e: any) => parseInt(String(e.id)) === id) || null;
    }
    if (!employeeSnapshot) {
      return res.status(404).json({ error: 'الموظف غير موجود' });
    }

    // التقاط ملخّص وصفي (لعرضه فقط في الاستجابة) + نسخة كاملة من كل السجلات المرتبطة قبل حذف أي شيء
    const relatedCheck = await checkEmployeeRelatedRecords(id);
    const relatedSnapshot = await buildEmployeeCascadeSnapshot(id);

    // B4a (ق-15): ما يُحذف موظف عنده أي سجل؛ تُنهى خدمته بتغيير حالته. الحذف للإدخال الخاطئ فقط.
    const relatedCounts = countRelatedRecords(relatedSnapshot);
    if (relatedCounts.total > 0) {
      return res.status(409).json({
        error: `لا يمكن حذف الموظف لأن عنده سجلات (${relatedCounts.total}). غيّر حالته إلى حالة غير فعّالة (مثل متقاعد أو مستقيل) بدل الحذف.`,
        code: 'EMPLOYEE_HAS_RECORDS',
        breakdown: relatedCounts.byTable,
      });
    }

    let archivedRowId: number | null = null;
    try {
      const [archivedRow] = await db.insert(schema.archivedItems).values({
        entityType: 'employee',
        entityId: id,
        entityLabel: employeeSnapshot.fullName || employeeSnapshot.full_name || `موظف #${id}`,
        data: JSON.stringify({ employee: employeeSnapshot, related: relatedSnapshot }),
        deletedBy: req.user?.username || req.user?.email || null,
        deletedByName: (req.user as any)?.fullName || (req.user as any)?.name || req.user?.username || req.user?.email || null,
      }).returning({ id: schema.archivedItems.id });
      archivedRowId = archivedRow?.id ?? null;
    } catch (archiveError: any) {
      console.error('CRITICAL: failed to archive employee before delete, aborting delete:', archiveError?.message);
      return res.status(500).json({ error: 'تعذّر نقل الموظف إلى أرشيف المحذوفات؛ تم إلغاء عملية الحذف حفاظاً على سلامة البيانات. الرجاء المحاولة لاحقاً.' });
    }

    // حذف فعلي داخل معاملة واحدة (transaction): يُحذف صراحةً كل جدول من الجداول الـ23 المرتبطة
    // بالموظف (EMPLOYEE_CASCADE_TABLES) يدوياً بالكود، دون أي اعتماد على قيد cascade في قاعدة
    // البيانات — فحسب تدقيق حي أُجري بتاريخ 2 أيلول 2026، فقط 11 من أصل 23 جدولاً تملك فعلياً قيد
    // "ON DELETE CASCADE" حقيقياً في قاعدة البيانات الفعلية (رغم أن schema.ts يُعرّف هذا القيد على
    // الجداول الـ23 كلها)؛ الجداول الـ12 الباقية (career_histories, leave_requests, penalties,
    // appreciations, performance_evaluations, training_enrollments, salary_records, attendance,
    // qualifications, job_assignments, employee_commendations, service_records) عمودها عادي بلا
    // أي قيد مفتاح خارجي إطلاقاً. الاعتماد على الافتراض السابق كان يترك سجلات هذه الجداول الـ12
    // حيّة يتيمة بعد حذف الموظف (تسبب تحديداً في فشل الاستعادة لاحقاً بخطأ تكرار مفتاح أساسي عند
    // إعادة إدراجها بنفس معرّفاتها). الحذف الصريح هنا مأمون تماماً حتى للجداول التي تملك cascade
    // فعلياً (حذف صفر صف هو ببساطة عملية لا تُغيّر شيئاً). كذلك تُحذف يدوياً الجداول التي لا تملك
    // قيد cascade فعلياً أصلاً (trainers, governingCourseEmployeeAssignments) حتى تكون عملية الحجب
    // شاملة فعلاً كما طُلب.
    let deleteConfirmed = false;
    let deleteErrorDetail: string | null = null;
    try {
      await db.transaction(async (tx) => {
        // خطوات محاكاة مسار الشهادات ترتبط بلقطة (snapshot_id) لا بالموظف مباشرة، فيجب حذفها قبل
        // حذف لقطات المسار نفسها (degreeTrackSnapshots) لتفادي أي تعارض في ترتيب الحذف
        const snapshotIds = (relatedSnapshot['degreeTrackSnapshots'] || []).map((s: any) => s.id).filter((v: any) => v != null);
        if (snapshotIds.length > 0) {
          await tx.delete(schema.degreeTrackSimulationSteps).where(inArray(schema.degreeTrackSimulationSteps.snapshotId, snapshotIds));
        }
        for (const cfg of EMPLOYEE_CASCADE_TABLES) {
          await tx.delete(cfg.table).where(eq(cfg.column, id));
        }
        await tx.delete(schema.trainers).where(eq(schema.trainers.employeeId, id));
        await tx.delete(schema.governingCourseEmployeeAssignments).where(eq(schema.governingCourseEmployeeAssignments.employeeId, String(id)));
        const deletedRows = await tx.delete(schema.employees).where(eq(schema.employees.id, id)).returning({ id: schema.employees.id });
        deleteConfirmed = Array.isArray(deletedRows) && deletedRows.length > 0;
        if (!deleteConfirmed) {
          throw new Error('EMPLOYEE_DELETE_NOT_CONFIRMED');
        }
      });
    } catch (error: any) {
      deleteErrorDetail = error?.cause?.message || error?.message || String(error);
      console.warn('Database fallback / rollback for cascade delete employee:', deleteErrorDetail);
      deleteConfirmed = false;
    }

    if (!deleteConfirmed) {
      try {
        const [stillThere] = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.id, id));
        if (stillThere) {
          if (archivedRowId) {
            try { await db.delete(schema.archivedItems).where(eq(schema.archivedItems.id, archivedRowId)); } catch {}
          }
          return res.status(500).json({ error: 'تعذّر حذف قيد الموظف وسجلاته فعلياً من قاعدة البيانات؛ تم التراجع عن نقله إلى الأرشيف حفاظاً على تطابق البيانات.' + (deleteErrorDetail ? (' التفاصيل: ' + deleteErrorDetail) : '') });
        }
      } catch (verifyError: any) {
        console.warn('Could not verify employee deletion, proceeding with in-memory sync:', verifyError?.message);
      }
    }

    syncEmployeeRecord({ id }, 'delete');
    removeEmployeeFromMemoryStores(id);

    saveLocalDb();
    res.json({ success: true, archived: true, relatedRecords: relatedCheck.breakdown || {} });
  });

  // ==================== أرشيف المحذوفات (Soft Delete Archive) ====================
  // عند حذف أي سجل مدعوم (الموظفون حالياً)، يُنقل هو وجميع سجلاته المرتبطة إلى هذا الأرشيف بدلاً من
  // حذفه نهائياً. مدير النظام يستطيع من نافذة الإعدادات استعراض الأرشيف، استعادة أي سجل منه بكل
  // تفاصيله بنفس معرّفاته الأصلية، أو تأكيد حذفه بشكل نهائي ولا رجعة فيه.

  app.get('/api/archive', requireAuth, requireAdmin, async (req, res) => {
    try {
      const entityType = req.query.entity_type as string | undefined;
      let query = db.select().from(schema.archivedItems);
      if (entityType) {
        query = db.select().from(schema.archivedItems).where(eq(schema.archivedItems.entityType, entityType)) as any;
      }
      const rows = await query.orderBy(desc(schema.archivedItems.createdAt));
      return res.json(rows.map((r: any) => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.error('Error listing archived items:', error?.message);
      return res.status(500).json({ error: 'تعذّر تحميل أرشيف المحذوفات' });
    }
  });
}
