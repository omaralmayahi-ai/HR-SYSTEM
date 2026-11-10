// server/routes/orgUnits.ts — الوحدات التنظيمية (B3، الدفعة 2)
// نُقل من server.ts مع حذف فروع الذاكرة. إصلاح مرافق: فحص التكرار كان يضم 5 وحدات تجريبية من الكود
// («المديرية العامة للموارد البشرية»...) فيرفض اسماً حقيقياً غير موجود في القاعدة.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { eq } from 'drizzle-orm';

const normalize = (s: string) => s.trim().toLowerCase();
const toIdOrNull = (v: any) => (v !== undefined && v !== null && v !== '' && !isNaN(parseInt(v)) ? parseInt(v) : null);
const withSnake = (r: any) => ({ ...r, parent_id: r.parentId, manager_id: r.managerId });

/** معرّفات كل الوحدات تحت وحدة (أبناء وأحفاد). */
export function descendantIds(units: { id: number; parentId: number | null }[], rootId: number): number[] {
  const out: number[] = [];
  const walk = (pid: number) => {
    for (const u of units) if (u.parentId === pid) { out.push(u.id); walk(u.id); }
  };
  walk(rootId);
  return out;
}

export function registerOrgUnitRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, sendRouteError, respondIfDbWriteError } = ctx;
  const fail = (res: any, err: any, op: string) => { if (!respondIfDbWriteError(res, err, op)) sendRouteError(res, err, op); };

  app.get('/api/org-units', requireAuth, async (_req, res) => {
    try {
      const records = await db.select().from(schema.orgUnits);
      res.json(records.map(withSnake));
    } catch (error: any) {
      sendRouteError(res, error, 'قراءة الوحدات التنظيمية');
    }
  });

  app.post('/api/org-units', requireAuth, requireWriter, async (req, res) => {
    const data = req.body || {};
    const parentId = toIdOrNull(data.parentId ?? data.parent_id);
    const managerId = toIdOrNull(data.managerId ?? data.manager_id);
    const unitName = String(data.name || '').trim();
    if (!unitName) return res.status(400).json({ error: 'اسم الوحدة التنظيمية مطلوب' });
    try {
      const existing = await db.select().from(schema.orgUnits);
      const dup = existing.find((u: any) => (u.parentId ?? null) === parentId && normalize(String(u.name || '')) === normalize(unitName));
      if (dup) return res.status(400).json({ error: `الوحدة التنظيمية (${unitName}) موجودة بالفعل ضمن نفس الجهة الأعلى` });
      const [newRecord] = await db.insert(schema.orgUnits).values({ name: unitName, type: data.type, parentId, managerId }).returning();
      res.status(201).json(withSnake(newRecord));
    } catch (error: any) {
      fail(res, error, 'حفظ الوحدة التنظيمية');
    }
  });

  app.put('/api/org-units/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const data = req.body || {};
    const updateObj: any = {};
    if (data.name !== undefined) updateObj.name = data.name;
    if (data.type !== undefined) updateObj.type = data.type;
    if (data.parentId !== undefined || data.parent_id !== undefined) updateObj.parentId = toIdOrNull(data.parentId ?? data.parent_id);
    if (data.managerId !== undefined || data.manager_id !== undefined) updateObj.managerId = toIdOrNull(data.managerId ?? data.manager_id);
    if (!Object.keys(updateObj).length) return res.status(400).json({ error: 'لا توجد حقول للتعديل' });
    if (updateObj.parentId === id) return res.status(400).json({ error: 'لا يمكن أن تكون الوحدة أباً لنفسها' });
    try {
      const [updated] = await db.update(schema.orgUnits).set(updateObj).where(eq(schema.orgUnits.id, id)).returning();
      if (!updated) return res.status(404).json({ error: 'الوحدة التنظيمية غير موجودة' });
      res.json(withSnake(updated));
    } catch (error: any) {
      fail(res, error, 'تعديل الوحدة التنظيمية');
    }
  });

  // حذف الوحدة مع كل ما تحتها داخل معاملة: إما كله أو لا شيء
  app.delete('/api/org-units/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const allUnits = await db.select().from(schema.orgUnits);
      const idsToDelete = [id, ...descendantIds(allUnits, id)];
      await db.transaction(async (tx: any) => {
        for (const deleteId of idsToDelete.reverse()) {
          await tx.delete(schema.orgUnits).where(eq(schema.orgUnits.id, deleteId));
        }
      });
      res.json({ success: true });
    } catch (error: any) {
      fail(res, error, 'حذف الوحدة التنظيمية');
    }
  });
}
