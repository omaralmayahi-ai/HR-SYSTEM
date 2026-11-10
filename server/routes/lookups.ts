// server/routes/lookups.ts — قوائم قابلة للتوسيع: أنواع الخدمة، حالات الموظف (B3، الدفعة 1)
// نُقل من server.ts مع حذف فروع الذاكرة (B2g). فحص التكرار والارتباط من القاعدة وحدها
// (كان يضم القيم الافتراضية في الكود، وفحص استعمال الحالة كان يعدّ موظفي الذاكرة).
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { eq, asc, sql } from 'drizzle-orm';
import { mapKeys, camelToSnake } from '../util/caseMap.ts';
import { ADMIN_ROLES } from '../../src/middleware/auth.ts';

const normalize = (s: string) => s.trim().toLowerCase();

export function registerLookupRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, requireAdmin, sendRouteError, respondIfDbWriteError } = ctx;
  const fail = (res: any, err: any, op: string) => { if (!respondIfDbWriteError(res, err, op)) sendRouteError(res, err, op); };

  /** قائمة أسماء بلا تكرار: GET كامل القائمة، POST يضيف اسماً جديداً. */
  function nameList(pathName: string, table: any, label: string) {
    app.get(pathName, requireAuth, async (_req, res) => {
      try {
        const records = await db.select().from(table).orderBy(asc(table.id));
        res.json(mapKeys(records, camelToSnake));
      } catch (error: any) {
        sendRouteError(res, error, `قراءة ${label}`);
      }
    });

    app.post(pathName, requireAuth, requireWriter, async (req, res) => {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: `اسم ${label} مطلوب` });
      try {
        const existing = await db.select().from(table);
        if (existing.some((r: any) => normalize(String(r.name || '')) === normalize(name))) {
          return res.status(400).json({ error: `${label} (${name}) موجود بالفعل` });
        }
        const [inserted] = (await db.insert(table).values({ name }).returning()) as any[];
        res.status(201).json(mapKeys(inserted, camelToSnake));
      } catch (error: any) {
        fail(res, error, `حفظ ${label}`);
      }
    });
  }

  // --- أنواع الخدمة ---
  nameList('/api/service-types', schema.serviceTypes, 'نوع الخدمة');

  // --- حالات الموظف (B4a، ق-14): المدير يحدد معنى كل حالة ---
  const { statusRegistry } = ctx;
  const statusOut = (r: any, count = 0) => ({
    id: r.id, name: r.name, is_active: !!r.isActive, payroll_eligible: !!r.payrollEligible,
    accrues_leave: !!r.accruesLeave, is_default: !!r.isDefault, sort_order: r.sortOrder ?? 100,
    employee_count: count, created_at: r.createdAt, updated_at: r.updatedAt,
  });
  const boolOrUndef = (v: any) => (v === undefined ? undefined : v === true || v === 'true' || v === 1);

  app.get('/api/employee-statuses', requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(schema.employeeStatuses)
        .orderBy(asc(schema.employeeStatuses.sortOrder), asc(schema.employeeStatuses.id));
      const counts = await db.select({ status: schema.employees.status, n: sql<number>`count(*)::int` })
        .from(schema.employees).groupBy(schema.employees.status);
      const countOf = new Map<string, number>();
      const def = rows.find((r: any) => r.isDefault)?.name;
      for (const c of counts as any[]) {
        const key = String(c.status ?? '').trim() || def || '';
        countOf.set(key, (countOf.get(key) || 0) + Number(c.n));
      }
      res.json(rows.map((r: any) => statusOut(r, countOf.get(String(r.name).trim()) || 0)));
    } catch (error: any) {
      sendRouteError(res, error, 'قراءة حالات الموظف');
    }
  });

  // الإضافة متاحة للكاتب (نموذج الموظف يضيف حالة جديدة)، لكن الأعلام يحددها المدير فقط.
  app.post('/api/employee-statuses', requireAuth, requireWriter, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اسم حالة الموظف مطلوب' });
    try {
      const existing = await db.select().from(schema.employeeStatuses);
      if (existing.some((r: any) => normalize(String(r.name || '')) === normalize(name))) {
        return res.status(400).json({ error: `حالة الموظف (${name}) موجودة بالفعل` });
      }
      const b = ADMIN_ROLES.includes((req as any).user?.role) ? (req.body || {}) : {};
      const [inserted] = await db.insert(schema.employeeStatuses).values({
        name,
        isActive: !!boolOrUndef(b.is_active),
        payrollEligible: !!boolOrUndef(b.payroll_eligible),
        accruesLeave: !!boolOrUndef(b.accrues_leave),
        sortOrder: Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 100,
      }).returning();
      statusRegistry.invalidate();
      res.status(201).json(statusOut(inserted));
    } catch (error: any) {
      fail(res, error, 'حفظ حالة الموظف');
    }
  });

  // تعديل الأعلام والترتيب والافتراضية. إعادة التسمية ممنوعة لحد B6: قواعد المخصصات والاستقطاعات
  // تحفظ أسماء الحالات بمتصفح كل مستخدم (localStorage) والخادم ما يكدر يحدّثها.
  app.put('/api/employee-statuses/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const b = req.body || {};
    try {
      const [current] = await db.select().from(schema.employeeStatuses).where(eq(schema.employeeStatuses.id, id));
      if (!current) return res.status(404).json({ error: 'حالة الموظف غير موجودة' });
      if (b.name !== undefined && String(b.name).trim() !== String(current.name).trim()) {
        return res.status(409).json({ error: 'تغيير اسم الحالة غير متاح حالياً لأن قواعد المخصصات والاستقطاعات تحفظ الاسم. أضف حالة جديدة بالاسم المطلوب ثم انقل الموظفين إليها.' });
      }
      const patch: any = { updatedAt: new Date() };
      for (const [k, col] of [['is_active', 'isActive'], ['payroll_eligible', 'payrollEligible'], ['accrues_leave', 'accruesLeave']] as const) {
        const v = boolOrUndef(b[k]);
        if (v !== undefined) patch[col] = v;
      }
      if (b.sort_order !== undefined) {
        if (!Number.isFinite(Number(b.sort_order))) return res.status(400).json({ error: 'الترتيب يجب أن يكون رقماً' });
        patch.sortOrder = Number(b.sort_order);
      }
      const makeDefault = boolOrUndef(b.is_default);
      if (makeDefault === false && current.isDefault) {
        return res.status(400).json({ error: 'لازم تبقى حالة افتراضية واحدة؛ اختر حالة ثانية كافتراضية بدلها' });
      }
      const [updated] = await db.transaction(async (tx: any) => {
        if (makeDefault === true && !current.isDefault) {
          await tx.update(schema.employeeStatuses).set({ isDefault: false }).where(eq(schema.employeeStatuses.isDefault, true));
          patch.isDefault = true;
        }
        return tx.update(schema.employeeStatuses).set(patch).where(eq(schema.employeeStatuses.id, id)).returning();
      });
      statusRegistry.invalidate();
      res.json(statusOut(updated));
    } catch (error: any) {
      fail(res, error, 'تعديل حالة الموظف');
    }
  });

  // حذف حالة: مسموح فقط إذا لم يحملها أي موظف وليست الافتراضية
  app.delete('/api/employee-statuses/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const [statusRecord] = await db.select().from(schema.employeeStatuses).where(eq(schema.employeeStatuses.id, id));
      if (!statusRecord) return res.status(404).json({ error: 'حالة الموظف غير موجودة' });
      if (statusRecord.isDefault) {
        return res.status(409).json({ error: 'لا يمكن حذف الحالة الافتراضية؛ اختر حالة ثانية كافتراضية أولاً' });
      }
      const statusName = String(statusRecord.name || '').trim();
      const rows = await db.select({ id: schema.employees.id }).from(schema.employees)
        .where(sql`btrim(${schema.employees.status}) = ${statusName}`);
      if (rows.length > 0) {
        return res.status(409).json({
          error: `لا يمكن حذف حالة (${statusName})، مستخدمة حالياً من قبل ${rows.length} موظف/ة. يجب تغيير حالة هؤلاء الموظفين أولاً قبل حذف هذه الحالة.`,
          count: rows.length,
        });
      }
      await db.delete(schema.employeeStatuses).where(eq(schema.employeeStatuses.id, id));
      statusRegistry.invalidate();
      res.json({ success: true });
    } catch (error: any) {
      fail(res, error, 'حذف حالة الموظف');
    }
  });
}
