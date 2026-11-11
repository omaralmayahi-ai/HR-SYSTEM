// server/routes/careerHistory.ts — B4b: الأوامر الإدارية والسجل الوظيفي المؤرخ.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { desc, eq, sql } from 'drizzle-orm';
import { attachOrgUnit } from '../orgUnitsService.ts';
import {
  applyMovement, employeeTimeline, isIsoDate, MovementError, rebuildEmployeeFields, todayBaghdad, isTrackedField,
  type TrackedField,
} from '../careerMovements.ts';

const userLabel = (req: any) => req.user?.username || req.user?.email || null;

export function registerCareerHistoryRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, requireAdmin, sendRouteError, respondIfDbWriteError } = ctx;
  const fail = (res: any, err: any, op: string) => {
    if (err instanceof MovementError) return res.status(err.status).json({ error: err.message });
    if (err?.code === '23505' || err?.cause?.code === '23505') {
      return res.status(409).json({ error: 'الأمر الإداري مسجل مسبقاً بنفس الرقم والتاريخ والجهة' });
    }
    if (!respondIfDbWriteError(res, err, op)) sendRouteError(res, err, op);
  };

  const orderOut = (o: any, cancelledBy?: number | null) => ({
    id: o.id, order_number: o.orderNumber, order_date: o.orderDate, issuer: o.issuer, subject: o.subject,
    order_kind: o.orderKind, effective_date: o.effectiveDate, cancels_order_id: o.cancelsOrderId, notes: o.notes,
    created_by: o.createdBy, created_at: o.createdAt, cancelled_by_order_id: cancelledBy ?? null,
  });

  app.get('/api/administrative-orders', requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(schema.administrativeOrders).orderBy(desc(schema.administrativeOrders.orderDate), desc(schema.administrativeOrders.id));
      const cancelledBy = new Map<number, number>();
      for (const r of rows as any[]) if (r.cancelsOrderId) cancelledBy.set(r.cancelsOrderId, r.id);
      res.json(rows.map((r: any) => orderOut(r, cancelledBy.get(r.id))));
    } catch (err: any) {
      sendRouteError(res, err, 'قراءة الأوامر الإدارية');
    }
  });

  function parseOrder(body: any) {
    const orderNumber = String(body?.order_number ?? '').trim();
    const orderDate = String(body?.order_date ?? '').trim();
    const effectiveDate = String(body?.effective_date ?? '').trim();
    if (!orderNumber) throw new MovementError('رقم الأمر مطلوب');
    if (!isIsoDate(orderDate)) throw new MovementError('تاريخ الأمر مطلوب بصيغة YYYY-MM-DD');
    if (effectiveDate && !isIsoDate(effectiveDate)) throw new MovementError('تاريخ النفاذ بصيغة YYYY-MM-DD');
    const t = (v: any) => (String(v ?? '').trim() || null);
    return {
      orderNumber, orderDate, effectiveDate: effectiveDate || null,
      issuer: t(body?.issuer), subject: t(body?.subject), orderKind: t(body?.order_kind), notes: t(body?.notes),
    };
  }

  app.post('/api/administrative-orders', requireAuth, requireWriter, async (req, res) => {
    try {
      const values = parseOrder(req.body);
      const [row] = await db.insert(schema.administrativeOrders).values({ ...values, createdBy: userLabel(req) }).returning();
      res.status(201).json(orderOut(row));
    } catch (err: any) {
      fail(res, err, 'حفظ الأمر الإداري');
    }
  });

  // إلغاء أمر: أمر جديد يلغيه، ثم إعادة بناء كل حقل تأثر به لكل موظف (بمعاملة واحدة).
  app.post('/api/administrative-orders/:id/cancel', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const values = parseOrder(req.body);
      const result = await db.transaction(async (tx: any) => {
        const [target] = await tx.select().from(schema.administrativeOrders).where(eq(schema.administrativeOrders.id, id)).for('update');
        if (!target) throw new MovementError('الأمر الإداري غير موجود', 404);
        const already = await tx.select({ id: schema.administrativeOrders.id }).from(schema.administrativeOrders)
          .where(eq(schema.administrativeOrders.cancelsOrderId, id));
        if (already.length > 0) throw new MovementError('الأمر ملغى مسبقاً', 409);
        const [cancelOrder] = await tx.insert(schema.administrativeOrders)
          .values({ ...values, orderKind: values.orderKind || 'إلغاء أمر', cancelsOrderId: id, createdBy: userLabel(req) }).returning();
        const affected = await tx.execute(sql`
          SELECT DISTINCT "employee_id", "field" FROM "employee_field_history" WHERE "order_id" = ${id} AND "field" <> 'event'`);
        const byEmp = new Map<number, TrackedField[]>();
        for (const r of ((affected as any).rows ?? affected) as any[]) {
          if (!isTrackedField(r.field)) continue;
          byEmp.set(Number(r.employee_id), [...(byEmp.get(Number(r.employee_id)) || []), r.field]);
        }
        const today = todayBaghdad();
        for (const [empId, fields] of byEmp) {
          await tx.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.id, empId)).for('update');
          await rebuildEmployeeFields(tx, schema, empId, fields, today);
        }
        return { cancelOrder, employees: byEmp.size };
      });
      res.status(201).json({ order: orderOut(result.cancelOrder), affected_employees: result.employees });
    } catch (err: any) {
      fail(res, err, 'إلغاء الأمر الإداري');
    }
  });

  app.get('/api/employees/:id/history', requireAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      res.json(await employeeTimeline(db, schema, id));
    } catch (err: any) {
      fail(res, err, 'قراءة السجل الوظيفي');
    }
  });

  // حركة على موظف: { effective_date, changes: {grade: 7, ...}, order_id?, reason?, event? }
  app.post('/api/employees/:id/movements', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const b = req.body || {};
    try {
      const orderId = b.order_id === undefined || b.order_id === null || b.order_id === '' ? null : Number(b.order_id);
      if (orderId !== null && !Number.isInteger(orderId)) throw new MovementError('معرّف الأمر غير صالح');
      const changes: Record<string, any> = b.changes && typeof b.changes === 'object' ? { ...b.changes } : {};
      if (Object.prototype.hasOwnProperty.call(changes, 'family_mode')) {
        return res.status(409).json({ error: 'نمط الاستحقاق العائلي يتغير من تبويب «الراتب والعائلة» بعملية تنتظر اعتماد مدير آخر' });
      }
      // B8a0: تغيير القسم أو الشعبة بحركة يحدد الوحدة التنظيمية بمعرّفها بنفس الحركة (حقل رواتب)
      if ((changes.department !== undefined || changes.section !== undefined) && changes.org_unit_id === undefined) {
        const [cur] = await db.select({ department: schema.employees.department, section: schema.employees.section, orgUnitId: schema.employees.orgUnitId })
          .from(schema.employees).where(eq(schema.employees.id, id));
        const target: Record<string, any> = { department: changes.department ?? cur?.department, section: changes.section ?? cur?.section };
        await attachOrgUnit(db, schema, target, { department: target.department, section: target.section });
        if (target.orgUnitId != null && target.orgUnitId !== cur?.orgUnitId) changes.org_unit_id = target.orgUnitId;
      }
      const result = await applyMovement(db, schema, {
        employeeId: id,
        effectiveDate: String(b.effective_date ?? '').trim(),
        changes,
        event: b.event,
        orderId,
        source: orderId !== null ? 'أمر' : 'تعديل مباشر',
        reason: b.reason ?? null,
        userLabel: userLabel(req),
      });
      await db.insert(schema.activityLogs).values({
        action: 'حركة على السجل الوظيفي',
        userEmail: userLabel(req),
        details: `موظف #${id}: ${Object.keys(b.changes || {}).join('، ') || b.event || ''} نافذ ${b.effective_date}`,
      }).catch(() => {});
      res.status(201).json({ rows: result.inserted.length, changed_now: result.changedNow, pending: result.pending });
    } catch (err: any) {
      fail(res, err, 'تسجيل الحركة');
    }
  });
}
