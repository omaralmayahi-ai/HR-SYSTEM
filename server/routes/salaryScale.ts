// server/routes/salaryScale.ts — B4d (ق-5): سلّم الرواتب بإصدارات.
// /api/salary-scale يقرأ ويعدّل الإصدار النافذ فقط (نفس العقد السابق للواجهة ومحرك الرواتب).
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { and, asc, eq, sql } from 'drizzle-orm';

export function registerSalaryScaleRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireAdmin, sendRouteError, respondIfDbWriteError, statusRegistry } = ctx;
  const V = schema.salaryScaleVersions;
  const S = schema.salaryScale;
  const fail = (res: any, err: any, op: string) => { if (!respondIfDbWriteError(res, err, op)) sendRouteError(res, err, op); };
  const bad = (res: any, msg: string, code = 400) => res.status(code).json({ error: msg });
  const int = (v: any) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };

  async function activeVersionId(tx: any = db): Promise<number | null> {
    const [v] = await tx.select({ id: V.id }).from(V).where(eq(V.isActive, true));
    return v?.id ?? null;
  }

  async function rowsOf(versionId: number) {
    return db.select().from(S).where(eq(S.versionId, versionId)).orderBy(asc(S.grade), asc(S.step));
  }

  app.get('/api/salary-scale', requireAuth, async (_req, res) => {
    try {
      const vid = await activeVersionId();
      res.json(vid ? await rowsOf(vid) : []);
    } catch (err: any) {
      sendRouteError(res, err, 'قراءة سلّم الرواتب');
    }
  });

  function validRow(grade: number, step: number, amount: number) {
    return grade >= 1 && grade <= 13 && step >= 1 && step <= 11 && amount > 0;
  }

  app.post('/api/salary-scale', requireAuth, requireAdmin, async (req, res) => {
    const grade = int(req.body?.grade), step = int(req.body?.step), amount = int(req.body?.amount);
    if (!validRow(grade, step, amount)) return bad(res, 'الدرجة (1–13) والمرحلة (1–11) والمبلغ مطلوبة');
    try {
      const vid = await activeVersionId();
      if (!vid) return bad(res, 'ماكو إصدار نافذ لسلّم الرواتب', 409);
      const [row] = await db.insert(S).values({ versionId: vid, grade, step, amount, effectiveFrom: req.body?.effective_from || null })
        .onConflictDoUpdate({ target: [S.versionId, S.grade, S.step], set: { amount } }).returning();
      await db.update(V).set({ updatedAt: new Date() }).where(eq(V.id, vid));
      res.status(201).json(row);
    } catch (err: any) {
      fail(res, err, 'حفظ مبلغ السلّم');
    }
  });

  // استبدال كل صفوف الإصدار النافذ (شاشة تعديل السلّم)
  app.post('/api/salary-scale/bulk', requireAuth, requireAdmin, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) return bad(res, 'المطلوب قائمة صفوف غير فارغة');
    const rows = items.map((i: any) => ({ grade: int(i.grade), step: int(i.step), amount: int(i.amount), effectiveFrom: i.effective_from || i.effectiveFrom || null }));
    if (rows.some(r => !validRow(r.grade, r.step, r.amount))) return bad(res, 'صف غير صالح بالقائمة (الدرجة 1–13، المرحلة 1–11، مبلغ موجب)');
    try {
      const count = await db.transaction(async (tx: any) => {
        const vid = await activeVersionId(tx);
        if (!vid) throw Object.assign(new Error('ماكو إصدار نافذ'), { status: 409 });
        await tx.delete(S).where(eq(S.versionId, vid));
        await tx.insert(S).values(rows.map(r => ({ ...r, versionId: vid })));
        await tx.update(V).set({ updatedAt: new Date() }).where(eq(V.id, vid));
        return rows.length;
      });
      res.json({ success: true, count });
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      fail(res, err, 'حفظ سلّم الرواتب');
    }
  });

  app.put('/api/salary-scale/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = int(req.params.id), amount = int(req.body?.amount);
    if (isNaN(id) || !(amount > 0)) return bad(res, 'المبلغ مطلوب');
    try {
      const vid = await activeVersionId();
      const [row] = await db.update(S).set({ amount }).where(and(eq(S.id, id), eq(S.versionId, vid as any))).returning();
      if (!row) return bad(res, 'الصف غير موجود بالإصدار النافذ', 404);
      res.json(row);
    } catch (err: any) {
      fail(res, err, 'تعديل مبلغ السلّم');
    }
  });

  app.delete('/api/salary-scale/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = int(req.params.id);
    try {
      const vid = await activeVersionId();
      await db.delete(S).where(and(eq(S.id, id), eq(S.versionId, vid as any)));
      res.json({ success: true });
    } catch (err: any) {
      fail(res, err, 'حذف صف من السلّم');
    }
  });

  // --- الإصدارات ---
  const versionOut = (v: any, count = 0) => ({
    id: v.id, name: v.name, legal_basis: v.legalBasis, effective_from: v.effectiveFrom, is_active: v.isActive,
    notes: v.notes, rows: count, created_at: v.createdAt, updated_at: v.updatedAt,
  });

  app.get('/api/salary-scale/versions', requireAuth, async (_req, res) => {
    try {
      const versions = await db.select().from(V).orderBy(asc(V.id));
      const counts = await db.select({ v: S.versionId, n: sql<number>`count(*)::int` }).from(S).groupBy(S.versionId);
      const byV = new Map((counts as any[]).map(c => [c.v, Number(c.n)]));
      res.json(versions.map((v: any) => versionOut(v, byV.get(v.id) || 0)));
    } catch (err: any) {
      sendRouteError(res, err, 'قراءة إصدارات السلّم');
    }
  });

  app.get('/api/salary-scale/versions/:id/rows', requireAuth, async (req, res) => {
    const id = int(req.params.id);
    if (isNaN(id)) return bad(res, 'معرّف غير صالح');
    try { res.json(await rowsOf(id)); } catch (err: any) { sendRouteError(res, err, 'قراءة صفوف الإصدار'); }
  });

  // إصدار جديد بنسخ إصدار موجود (لتعديل لاحق بقرار جديد)، غير نافذ لحين تفعيله
  app.post('/api/salary-scale/versions', requireAuth, requireAdmin, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const from = int(req.body?.copy_from);
    if (!name) return bad(res, 'اسم الإصدار مطلوب');
    if (isNaN(from)) return bad(res, 'اختر الإصدار المنسوخ منه');
    try {
      const created = await db.transaction(async (tx: any) => {
        const [v] = await tx.insert(V).values({
          name, legalBasis: String(req.body?.legal_basis || '').trim() || null,
          effectiveFrom: String(req.body?.effective_from || '').trim() || null,
          notes: String(req.body?.notes || '').trim() || null,
        }).returning();
        await tx.execute(sql`INSERT INTO salary_scale (version_id, grade, step, amount, effective_from)
          SELECT ${v.id}, grade, step, amount, effective_from FROM salary_scale WHERE version_id = ${from}`);
        return v;
      });
      res.status(201).json(versionOut(created));
    } catch (err: any) {
      if (err?.code === '23505' || err?.cause?.code === '23505') return bad(res, 'يوجد إصدار بنفس الاسم', 409);
      fail(res, err, 'إنشاء إصدار السلّم');
    }
  });

  app.post('/api/salary-scale/versions/:id/activate', requireAuth, requireAdmin, async (req, res) => {
    const id = int(req.params.id);
    if (isNaN(id)) return bad(res, 'معرّف غير صالح');
    try {
      await db.transaction(async (tx: any) => {
        const [v] = await tx.select().from(V).where(eq(V.id, id)).for('update');
        if (!v) throw Object.assign(new Error('الإصدار غير موجود'), { status: 404 });
        const [{ n }] = (await tx.execute(sql`SELECT count(*)::int n FROM salary_scale WHERE version_id = ${id} AND grade BETWEEN 1 AND 10`)).rows;
        if (Number(n) < 110) throw Object.assign(new Error('الإصدار ناقص: لازم 11 مرحلة لكل درجة من 1 إلى 10'), { status: 409 });
        await tx.update(V).set({ isActive: false }).where(eq(V.isActive, true));
        await tx.update(V).set({ isActive: true, updatedAt: new Date() }).where(eq(V.id, id));
        await tx.insert(schema.activityLogs).values({
          action: 'تفعيل إصدار سلّم الرواتب', userEmail: (req as any).user?.username || null, details: v.name,
        });
      });
      res.json({ success: true });
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      fail(res, err, 'تفعيل إصدار السلّم');
    }
  });

  // تقرير الفروقات: الراتب الاسمي لكل موظف براتب تلقائي بين إصدارين
  app.get('/api/salary-scale/diff', requireAuth, async (req, res) => {
    const from = int(req.query.from), to = int(req.query.to);
    if (isNaN(from) || isNaN(to)) return bad(res, 'حدد الإصدارين from و to');
    try {
      const eligible = await statusRegistry.namesWhere('payrollEligible');
      const r = await db.execute(sql`
        SELECT e.id, e.full_name, e.company_number, e.department, e.grade, e.step, e.status,
               a.amount AS from_amount, b.amount AS to_amount
        FROM employees e
        LEFT JOIN salary_scale a ON a.version_id = ${from} AND a.grade = e.grade AND a.step = e.step
        LEFT JOIN salary_scale b ON b.version_id = ${to} AND b.grade = e.grade AND b.step = e.step
        WHERE btrim(e.status) = ANY(${sql.raw(`ARRAY[${eligible.map(s => `'${s.replace(/'/g, "''")}'`).join(',') || "''"}]::text[]`)})
          AND e.grade IS NOT NULL
        ORDER BY e.grade, e.step, e.id`);
      const rows = ((r as any).rows ?? r).map((x: any) => ({
        ...x,
        difference: x.from_amount != null && x.to_amount != null ? Number(x.to_amount) - Number(x.from_amount) : null,
      }));
      const byGrade: Record<string, { employees: number; total_difference: number; per_employee_min: number | null; per_employee_max: number | null }> = {};
      let total = 0, increased = 0, decreased = 0, missing = 0;
      for (const x of rows) {
        if (x.difference == null) { missing++; continue; }
        total += x.difference;
        if (x.difference > 0) increased++; else if (x.difference < 0) decreased++;
        const g = (byGrade[x.grade] ||= { employees: 0, total_difference: 0, per_employee_min: null, per_employee_max: null });
        g.employees++; g.total_difference += x.difference;
        g.per_employee_min = g.per_employee_min == null ? x.difference : Math.min(g.per_employee_min, x.difference);
        g.per_employee_max = g.per_employee_max == null ? x.difference : Math.max(g.per_employee_max, x.difference);
      }
      res.json({
        summary: { employees: rows.length, increased, decreased, unchanged: rows.length - increased - decreased - missing, missing_scale: missing, monthly_total_difference: total },
        by_grade: byGrade,
        rows,
        note: 'الفرق بالراتب الاسمي فقط؛ المخصصات المحسوبة كنسبة من الراتب الاسمي تتغير بنفس الاتجاه.',
      });
    } catch (err: any) {
      sendRouteError(res, err, 'تقرير فروقات السلّم');
    }
  });
}
