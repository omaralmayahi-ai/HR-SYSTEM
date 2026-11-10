// server/routes/orgUnits.ts — الوحدات التنظيمية (B3، الدفعة 2)
// نُقل من server.ts مع حذف فروع الذاكرة. إصلاح مرافق: فحص التكرار كان يضم 5 وحدات تجريبية من الكود
// («المديرية العامة للموارد البشرية»...) فيرفض اسماً حقيقياً غير موجود في القاعدة.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { descendantsOf, loadUnits, refreshEmployeesOrgText, unitPaths } from '../orgUnitsService.ts';
import { todayBaghdad } from '../careerMovements.ts';

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
      // B5: عدد الموظفين المرتبطين مباشرة بكل وحدة
      const counts = await db.select({ u: schema.employees.orgUnitId, n: sql<number>`count(*)::int` })
        .from(schema.employees).groupBy(schema.employees.orgUnitId);
      const byUnit = new Map((counts as any[]).map(c => [Number(c.u), Number(c.n)]));
      const today = todayBaghdad();
      res.json(records.map((r: any) => ({
        ...withSnake(r),
        valid_from: r.validFrom, valid_to: r.validTo,
        is_ended: !!(r.validTo && String(r.validTo) < today),
        employee_count: byUnit.get(Number(r.id)) || 0,
      })));
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
      if (parentId !== null && !existing.some((u: any) => u.id === parentId)) return res.status(400).json({ error: 'الجهة الأعلى غير موجودة' });
      const newRecord = await db.transaction(async (tx: any) => {
        const [row] = await tx.insert(schema.orgUnits).values({
          name: unitName, type: data.type, parentId, managerId,
          validFrom: isIso(data.valid_from) ? data.valid_from : null,
        }).returning();
        // B5: رمز ثابت ما يتغير بإعادة التسمية
        const code = String(data.code || '').trim() || `OU-${String(row.id).padStart(4, '0')}`;
        const [withCode] = await tx.update(schema.orgUnits).set({ code }).where(eq(schema.orgUnits.id, row.id)).returning();
        return withCode;
      });
      res.status(201).json(withSnake(newRecord));
    } catch (error: any) {
      if (error?.code === '23505' || error?.cause?.code === '23505') return res.status(409).json({ error: 'الرمز مستعمل لوحدة ثانية' });
      fail(res, error, 'حفظ الوحدة التنظيمية');
    }
  });

  // تعديل الاسم/النوع/الأب/المدير/التواريخ. الاسم أو الأب إذا تغيّر يُحدَّث نصّا القسم والشعبة
  // لكل موظفي الوحدة وما تحتها بنفس المعاملة (ويُسجَّل بالسجل المؤرخ بسبب واضح).
  app.put('/api/org-units/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const data = req.body || {};
    const updateObj: any = {};
    if (data.name !== undefined) {
      const n = String(data.name || '').trim();
      if (!n) return res.status(400).json({ error: 'اسم الوحدة التنظيمية مطلوب' });
      updateObj.name = n;
    }
    if (data.type !== undefined) updateObj.type = data.type;
    if (data.parentId !== undefined || data.parent_id !== undefined) updateObj.parentId = toIdOrNull(data.parentId ?? data.parent_id);
    if (data.managerId !== undefined || data.manager_id !== undefined) updateObj.managerId = toIdOrNull(data.managerId ?? data.manager_id);
    if (data.valid_from !== undefined) updateObj.validFrom = isIso(data.valid_from) ? data.valid_from : null;
    if (data.valid_to !== undefined) updateObj.validTo = isIso(data.valid_to) ? data.valid_to : null;
    if (!Object.keys(updateObj).length) return res.status(400).json({ error: 'لا توجد حقول للتعديل' });
    if (updateObj.parentId === id) return res.status(400).json({ error: 'لا يمكن أن تكون الوحدة أباً لنفسها' });
    try {
      const result = await db.transaction(async (tx: any) => {
        const units = await loadUnits(tx, schema);
        const before = units.find(u => u.id === id);
        if (!before) throw Object.assign(new Error('الوحدة التنظيمية غير موجودة'), { status: 404 });
        const subtree = descendantsOf(units, id);
        // الأب يُفحص فقط إذا تغيّر (الواجهة ترسله بكل تعديل، حتى لو كان مفقوداً من قبل)
        if (updateObj.parentId !== undefined && updateObj.parentId === before.parentId) delete updateObj.parentId;
        if (updateObj.parentId != null) {
          if (subtree.includes(updateObj.parentId)) throw Object.assign(new Error('ما يصير تنقل الوحدة تحت وحدة من فروعها'), { status: 400 });
          if (!units.some(u => u.id === updateObj.parentId)) throw Object.assign(new Error('الجهة الأعلى غير موجودة'), { status: 400 });
        }
        const newName = updateObj.name ?? before.name;
        const newParent = updateObj.parentId !== undefined ? updateObj.parentId : before.parentId;
        if (updateObj.name !== undefined || updateObj.parentId !== undefined) {
          const dup = units.find(u => u.id !== id && (u.parentId ?? null) === (newParent ?? null) && normalize(u.name) === normalize(newName));
          if (dup) throw Object.assign(new Error(`يوجد تشكيل باسم (${newName}) تحت نفس الجهة الأعلى`), { status: 400 });
        }
        if (updateObj.validTo) {
          const n = await linkedEmployees(tx, [id, ...subtree]);
          if (n > 0) throw Object.assign(new Error(`ما تنتهي الوحدة وبيها ${n} موظف؛ انقلهم أولاً`), { status: 409 });
        }
        const [updated] = await tx.update(schema.orgUnits).set(updateObj).where(eq(schema.orgUnits.id, id)).returning();
        // الإنهاء يشمل الفروع (مثل /end)
        if (updateObj.validTo && subtree.length > 0) {
          await tx.update(schema.orgUnits).set({ validTo: updateObj.validTo }).where(and(inArray(schema.orgUnits.id, subtree), isNull(schema.orgUnits.validTo)));
        }
        const pathChanged = (updateObj.name !== undefined && updateObj.name !== before.name) || (updateObj.parentId !== undefined && updateObj.parentId !== before.parentId);
        const moved = pathChanged
          ? await refreshEmployeesOrgText(tx, schema, [id, ...subtree], updateObj.name !== undefined && updateObj.name !== before.name ? `إعادة تسمية التشكيل من «${before.name}» إلى «${updateObj.name}»` : 'نقل التشكيل تحت جهة أخرى')
          : 0;
        return { updated, moved };
      });
      res.json({ ...withSnake(result.updated), employees_updated: result.moved });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      fail(res, error, 'تعديل الوحدة التنظيمية');
    }
  });

  // B5: إنهاء الوحدة وما تحتها بتاريخ (بدل الحذف) — يُرفض إذا بيها موظفون
  app.post('/api/org-units/:id/end', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const validTo = String(req.body?.valid_to || '').trim() || todayBaghdad();
    if (isNaN(id) || !isIso(validTo)) return res.status(400).json({ error: 'تاريخ الإنهاء بصيغة YYYY-MM-DD' });
    try {
      const n = await db.transaction(async (tx: any) => {
        const units = await loadUnits(tx, schema);
        if (!units.some(u => u.id === id)) throw Object.assign(new Error('الوحدة التنظيمية غير موجودة'), { status: 404 });
        const ids = [id, ...descendantsOf(units, id)];
        const linked = await linkedEmployees(tx, ids);
        if (linked > 0) throw Object.assign(new Error(`ما تنتهي الوحدة وبيها ${linked} موظف (هي أو فروعها)؛ انقلهم أولاً`), { status: 409 });
        await tx.update(schema.orgUnits).set({ validTo }).where(and(inArray(schema.orgUnits.id, ids), isNull(schema.orgUnits.validTo)));
        return ids.length;
      });
      res.json({ success: true, units_ended: n, valid_to: validTo });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      fail(res, error, 'إنهاء الوحدة التنظيمية');
    }
  });

  // الحذف للوحدة المضافة بالخطأ فقط: بلا موظفين مرتبطين (بالمعرّف أو بالاسم) بيها أو بفروعها
  app.delete('/api/org-units/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      await db.transaction(async (tx: any) => {
        const units = await loadUnits(tx, schema);
        const ids = [id, ...descendantsOf(units, id)];
        const paths = unitPaths(units);
        const names = units.filter(u => ids.includes(u.id)).map(u => u.name);
        const pathList = ids.map(i => paths.get(i)).filter(Boolean) as string[];
        const linked = await linkedEmployees(tx, ids);
        const [{ n: byText }] = (await tx.execute(sql`SELECT count(*)::int n FROM employees WHERE org_unit_id IS NULL
          AND (btrim(section) = ANY(${pgTextArray(pathList)}) OR btrim(department) = ANY(${pgTextArray(names)}))`)).rows;
        const total = linked + Number(byText);
        if (total > 0) throw Object.assign(new Error(`ما تنحذف الوحدة لأن بيها ${total} موظف (هي أو فروعها). استعمل «إنهاء الوحدة» بعد نقلهم.`), { status: 409 });
        for (const deleteId of [...ids].reverse()) {
          await tx.delete(schema.orgUnits).where(eq(schema.orgUnits.id, deleteId));
        }
      });
      res.json({ success: true });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      fail(res, error, 'حذف الوحدة التنظيمية');
    }
  });
}

async function linkedEmployees(tx: any, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await tx.execute(sql`SELECT count(*)::int n FROM employees WHERE org_unit_id = ANY(${pgIntArray(ids)})`);
  return Number(((r as any).rows ?? r)[0].n);
}

const isIso = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pgIntArray = (ids: number[]) => sql.raw(`ARRAY[${ids.map(i => Number(i)).filter(Number.isFinite).join(',') || 'NULL'}]::int[]`);
const pgTextArray = (vals: string[]) => sql`${'{' + vals.map(v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}'}::text[]`;
