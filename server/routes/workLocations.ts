// server/routes/workLocations.ts — مواقع العمل (B3، الدفعة 1)
// نُقل من server.ts مع حذف فروع الذاكرة (B2g). إصلاح مرافق: فحص التكرار كان يضم القيم الافتراضية
// في الكود (مثل «حقول البصرة النفطية») فيرفض اسماً غير موجود في القاعدة أصلاً.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { eq, asc } from 'drizzle-orm';
import { mapKeys, camelToSnake } from '../util/caseMap.ts';

const normalize = (s: string) => s.trim().toLowerCase();

export function registerWorkLocationRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireAdmin, sendRouteError, respondIfDbWriteError } = ctx;
  const fail = (res: any, err: any, op: string) => { if (!respondIfDbWriteError(res, err, op)) sendRouteError(res, err, op); };

  app.get('/api/work-locations', requireAuth, async (_req, res) => {
    try {
      const records = await db.select().from(schema.workLocations).orderBy(asc(schema.workLocations.id));
      res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      sendRouteError(res, error, 'قراءة مواقع العمل');
    }
  });

  app.post('/api/work-locations', requireAuth, requireAdmin, async (req, res) => {
    const { name, province, allowance_amount, work_start_hour, work_end_hour } = req.body || {};
    const locName = String(name || '').trim();
    if (!locName) return res.status(400).json({ error: 'اسم موقع العمل مطلوب' });
    try {
      const existing = await db.select().from(schema.workLocations);
      if (existing.some((l: any) => normalize(String(l.name || '')) === normalize(locName))) {
        return res.status(400).json({ error: `موقع العمل (${locName}) موجود بالفعل` });
      }
      const [newRecord] = await db.insert(schema.workLocations).values({
        name: locName,
        province,
        allowanceAmount: allowance_amount !== undefined ? parseFloat(allowance_amount) : 0,
        workStartHour: work_start_hour || '08:00',
        workEndHour: work_end_hour || '15:00',
      }).returning();
      res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      fail(res, error, 'حفظ موقع العمل');
    }
  });

  app.put('/api/work-locations/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, province, allowance_amount, work_start_hour, work_end_hour } = req.body || {};
    try {
      const [updated] = await db.update(schema.workLocations)
        .set({
          name,
          province,
          allowanceAmount: allowance_amount !== undefined ? parseFloat(allowance_amount) : undefined,
          workStartHour: work_start_hour !== undefined ? work_start_hour : undefined,
          workEndHour: work_end_hour !== undefined ? work_end_hour : undefined,
        })
        .where(eq(schema.workLocations.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'موقع العمل غير موجود' });
      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      fail(res, error, 'تعديل موقع العمل');
    }
  });

  app.delete('/api/work-locations/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      await db.delete(schema.workLocations).where(eq(schema.workLocations.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      fail(res, error, 'حذف موقع العمل');
    }
  });
}
