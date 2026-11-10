// server/routes/lookups.ts — قوائم قابلة للتوسيع: أنواع الخدمة، حالات الموظف (B3، الدفعة 1)
// نُقل من server.ts مع حذف فروع الذاكرة (B2g). فحص التكرار والارتباط من القاعدة وحدها
// (كان يضم القيم الافتراضية في الكود، وفحص استعمال الحالة كان يعدّ موظفي الذاكرة).
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { eq, asc } from 'drizzle-orm';
import { mapKeys, camelToSnake } from '../util/caseMap.ts';

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
        const [inserted] = await db.insert(table).values({ name }).returning();
        res.status(201).json(mapKeys(inserted, camelToSnake));
      } catch (error: any) {
        fail(res, error, `حفظ ${label}`);
      }
    });
  }

  // --- أنواع الخدمة ---
  nameList('/api/service-types', schema.serviceTypes, 'نوع الخدمة');

  // --- حالات الموظف ---
  nameList('/api/employee-statuses', schema.employeeStatuses, 'حالة الموظف');

  // حذف حالة: مسموح فقط إذا لم يحملها أي موظف حالياً
  app.delete('/api/employee-statuses/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const [statusRecord] = await db.select().from(schema.employeeStatuses).where(eq(schema.employeeStatuses.id, id));
      if (!statusRecord) return res.status(404).json({ error: 'حالة الموظف غير موجودة' });
      const statusName = String(statusRecord.name || '').trim();
      const rows = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.status, statusName));
      if (rows.length > 0) {
        return res.status(400).json({
          error: `لا يمكن حذف حالة (${statusName})، مستخدمة حالياً من قبل ${rows.length} موظف/ة. يجب تغيير حالة هؤلاء الموظفين أولاً قبل حذف هذه الحالة.`,
          count: rows.length,
        });
      }
      await db.delete(schema.employeeStatuses).where(eq(schema.employeeStatuses.id, id));
      res.json({ success: true });
    } catch (error: any) {
      fail(res, error, 'حذف حالة الموظف');
    }
  });
}
