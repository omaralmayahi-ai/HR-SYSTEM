// server/routes/salaryScale.ts — B4d (ق-5): سلّم الرواتب بإصدارات.
// /api/salary-scale يقرأ ويعدّل الإصدار النافذ فقط (نفس العقد السابق للواجهة ومحرك الرواتب).
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { asc, eq, sql } from 'drizzle-orm';
import { scaleVersionForDate, refreshActiveFlag } from '../salaryScaleService.ts';
import { todayBaghdad } from '../careerMovements.ts';

export function registerSalaryScaleRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireAdmin, requireWriter, sendRouteError, respondIfDbWriteError, statusRegistry } = ctx;
  const V = schema.salaryScaleVersions;
  const S = schema.salaryScale;
  const fail = (res: any, err: any, op: string) => { if (!respondIfDbWriteError(res, err, op)) sendRouteError(res, err, op); };
  const bad = (res: any, msg: string, code = 400) => res.status(code).json({ error: msg });
  const int = (v: any) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };

  // B8a0: النافذ اليوم بالتاريخ والحالة (لا بعلم is_active)
  async function activeVersionId(tx: any = db): Promise<number | null> {
    return (await scaleVersionForDate(tx, todayBaghdad()))?.id ?? null;
  }

  async function rowsOf(versionId: number) {
    return db.select().from(S).where(eq(S.versionId, versionId)).orderBy(asc(S.grade), asc(S.step));
  }

  const who = (req: any) => String(req.user?.username || '') || null;
  const audit = (tx: any, req: any, action: string, entityId: any, before: any, after: any) =>
    tx.insert(schema.payrollAudit).values({ actor: who(req), action, entity: 'salary_scale_versions', entityId: String(entityId), before, after, ip: req.ip || null });
  const lockedMsg = 'الإصدار المعتمد أو المؤرشف ما يتعدل؛ أنشئ إصداراً جديداً منسوخاً منه وعدّله ثم اعتمده';
  const isLockErr = (err: any) => /B8a0/.test(String(err?.message || err?.cause?.message || ''));

  /** إصدار مسودة للتعديل: من الطلب (version_id) وإلا رفض — ما نعدّل النافذ أبداً. */
  async function draftVersion(tx: any, req: any): Promise<any> {
    const vid = int(req.query?.version_id ?? (Array.isArray(req.body) ? undefined : req.body?.version_id));
    if (isNaN(vid)) throw Object.assign(new Error('اختر إصداراً مسودة للتعديل (version_id). ' + lockedMsg), { status: 409 });
    const [v] = await tx.select().from(V).where(eq(V.id, vid)).for('update');
    if (!v) throw Object.assign(new Error('الإصدار غير موجود'), { status: 404 });
    if (v.status !== 'مسودة') throw Object.assign(new Error(lockedMsg), { status: 409 });
    return v;
  }

  app.get('/api/salary-scale', requireAuth, async (req, res) => {
    try {
      const day = String(req.query.date || '');
      const vid = /^\d{4}-\d{2}-\d{2}$/.test(day) ? (await scaleVersionForDate(db, day))?.id ?? null : await activeVersionId();
      res.json(vid ? await rowsOf(vid) : []);
    } catch (err: any) {
      sendRouteError(res, err, 'قراءة سلّم الرواتب');
    }
  });

  function validRow(grade: number, step: number, amount: number) {
    return grade >= 1 && grade <= 13 && step >= 1 && step <= 11 && amount > 0;
  }

  const touch = (tx: any, v: any, req: any) => tx.update(V).set({ updatedAt: new Date(), updatedBy: who(req) }).where(eq(V.id, v.id));

  app.post('/api/salary-scale', requireAuth, requireWriter, async (req, res) => {
    const grade = int(req.body?.grade), step = int(req.body?.step), amount = int(req.body?.amount);
    if (!validRow(grade, step, amount)) return bad(res, 'الدرجة (1–13) والمرحلة (1–11) والمبلغ مطلوبة');
    try {
      const row = await db.transaction(async (tx: any) => {
        const v = await draftVersion(tx, req);
        const [r] = await tx.insert(S).values({ versionId: v.id, grade, step, amount, effectiveFrom: req.body?.effective_from || null })
          .onConflictDoUpdate({ target: [S.versionId, S.grade, S.step], set: { amount } }).returning();
        await touch(tx, v, req);
        return r;
      });
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      if (isLockErr(err)) return bad(res, lockedMsg, 409);
      fail(res, err, 'حفظ مبلغ السلّم');
    }
  });

  // استبدال كل صفوف إصدار مسودة (شاشة تعديل السلّم)
  app.post('/api/salary-scale/bulk', requireAuth, requireWriter, async (req, res) => {
    const items = Array.isArray(req.body) ? req.body : req.body?.rows;
    if (!Array.isArray(items) || items.length === 0) return bad(res, 'المطلوب قائمة صفوف غير فارغة');
    const rows = items.map((i: any) => ({ grade: int(i.grade), step: int(i.step), amount: int(i.amount), effectiveFrom: i.effective_from || i.effectiveFrom || null }));
    if (rows.some((r: any) => !validRow(r.grade, r.step, r.amount))) return bad(res, 'صف غير صالح بالقائمة (الدرجة 1–13، المرحلة 1–11، مبلغ موجب)');
    try {
      const count = await db.transaction(async (tx: any) => {
        const v = await draftVersion(tx, req);
        await tx.delete(S).where(eq(S.versionId, v.id));
        await tx.insert(S).values(rows.map((r: any) => ({ ...r, effectiveFrom: r.effectiveFrom || v.effectiveFrom || null, versionId: v.id })));
        await touch(tx, v, req);
        return rows.length;
      });
      res.json({ success: true, count });
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      if (isLockErr(err)) return bad(res, lockedMsg, 409);
      fail(res, err, 'حفظ سلّم الرواتب');
    }
  });

  app.put('/api/salary-scale/:id', requireAuth, requireWriter, async (req, res) => {
    const id = int(req.params.id), amount = int(req.body?.amount);
    if (isNaN(id) || !(amount > 0)) return bad(res, 'المبلغ مطلوب');
    try {
      const row = await db.transaction(async (tx: any) => {
        const [cur] = await tx.select().from(S).where(eq(S.id, id));
        if (!cur) throw Object.assign(new Error('الصف غير موجود'), { status: 404 });
        const [v] = await tx.select().from(V).where(eq(V.id, cur.versionId));
        if (!v || v.status !== 'مسودة') throw Object.assign(new Error(lockedMsg), { status: 409 });
        const [r] = await tx.update(S).set({ amount }).where(eq(S.id, id)).returning();
        await touch(tx, v, req);
        return r;
      });
      res.json(row);
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      if (isLockErr(err)) return bad(res, lockedMsg, 409);
      fail(res, err, 'تعديل مبلغ السلّم');
    }
  });

  app.delete('/api/salary-scale/:id', requireAuth, requireWriter, async (req, res) => {
    const id = int(req.params.id);
    if (isNaN(id)) return bad(res, 'معرّف غير صالح');
    try {
      await db.transaction(async (tx: any) => {
        const [cur] = await tx.select().from(S).where(eq(S.id, id));
        if (!cur) return;
        const [v] = await tx.select().from(V).where(eq(V.id, cur.versionId));
        if (!v || v.status !== 'مسودة') throw Object.assign(new Error(lockedMsg), { status: 409 });
        await tx.delete(S).where(eq(S.id, id));
        await touch(tx, v, req);
      });
      res.json({ success: true });
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      if (isLockErr(err)) return bad(res, lockedMsg, 409);
      fail(res, err, 'حذف صف من السلّم');
    }
  });

  // --- الإصدارات ---
  const versionOut = (v: any, count = 0) => ({
    id: v.id, name: v.name, legal_basis: v.legalBasis, effective_from: v.effectiveFrom, is_active: v.isActive,
    status: v.status, created_by: v.createdBy, updated_by: v.updatedBy, approved_by: v.approvedBy, approved_at: v.approvedAt,
    order_id: v.orderId, notes: v.notes, rows: count, created_at: v.createdAt, updated_at: v.updatedAt,
  });

  app.get('/api/salary-scale/versions', requireAuth, async (_req, res) => {
    try {
      // النافذ اليوم يُحسب بالقراءة (بلا كتابة)، لأنه يتغير بمرور تاريخ نفاذ إصدار معتمد مستقبلي
      const todayId = (await scaleVersionForDate(db, todayBaghdad()))?.id ?? null;
      const versions = (await db.select().from(V).orderBy(asc(V.id))).map((v: any) => ({ ...v, isActive: v.id === todayId }));
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

  const isoOrNull = (v: any) => { const t = String(v ?? '').trim(); return t === '' ? null : (/^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined); };

  // إصدار جديد بنسخ إصدار موجود (مسودة) لتعديله بقرار جديد ثم اعتماده
  app.post('/api/salary-scale/versions', requireAuth, requireWriter, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const from = int(req.body?.copy_from);
    const eff = isoOrNull(req.body?.effective_from);
    if (!name) return bad(res, 'اسم الإصدار مطلوب');
    if (isNaN(from)) return bad(res, 'اختر الإصدار المنسوخ منه');
    if (eff === undefined) return bad(res, 'تاريخ النفاذ بصيغة YYYY-MM-DD');
    try {
      const created = await db.transaction(async (tx: any) => {
        const [v] = await tx.insert(V).values({
          name, legalBasis: String(req.body?.legal_basis || '').trim() || null,
          effectiveFrom: eff, status: 'مسودة', createdBy: who(req),
          notes: String(req.body?.notes || '').trim() || null,
        }).returning();
        await tx.execute(sql`INSERT INTO salary_scale (version_id, grade, step, amount, effective_from)
          SELECT ${v.id}, grade, step, amount, effective_from FROM salary_scale WHERE version_id = ${from}`);
        await audit(tx, req, 'إنشاء إصدار سلّم (مسودة)', v.id, null, { name, copy_from: from, effective_from: eff });
        return v;
      });
      res.status(201).json(versionOut(created));
    } catch (err: any) {
      if (err?.code === '23505' || err?.cause?.code === '23505') return bad(res, 'يوجد إصدار بنفس الاسم', 409);
      fail(res, err, 'إنشاء إصدار السلّم');
    }
  });

  // تعديل بيانات إصدار مسودة (الاسم، السند، تاريخ النفاذ، الأمر)
  app.patch('/api/salary-scale/versions/:id', requireAuth, requireWriter, async (req, res) => {
    const id = int(req.params.id);
    if (isNaN(id)) return bad(res, 'معرّف غير صالح');
    const patch: any = { updatedAt: new Date(), updatedBy: who(req) };
    if (req.body?.name !== undefined) { const n = String(req.body.name).trim(); if (!n) return bad(res, 'اسم الإصدار مطلوب'); patch.name = n; }
    if (req.body?.legal_basis !== undefined) patch.legalBasis = String(req.body.legal_basis || '').trim() || null;
    if (req.body?.notes !== undefined) patch.notes = String(req.body.notes || '').trim() || null;
    if (req.body?.effective_from !== undefined) { const e = isoOrNull(req.body.effective_from); if (e === undefined) return bad(res, 'تاريخ النفاذ بصيغة YYYY-MM-DD'); patch.effectiveFrom = e; }
    if (req.body?.order_id !== undefined) { const o = req.body.order_id === null || req.body.order_id === '' ? null : int(req.body.order_id); if (o !== null && isNaN(o)) return bad(res, 'الأمر غير صالح'); patch.orderId = o; }
    try {
      const row = await db.transaction(async (tx: any) => {
        const [v] = await tx.select().from(V).where(eq(V.id, id)).for('update');
        if (!v) throw Object.assign(new Error('الإصدار غير موجود'), { status: 404 });
        if (v.status !== 'مسودة') throw Object.assign(new Error(lockedMsg), { status: 409 });
        const [r] = await tx.update(V).set(patch).where(eq(V.id, id)).returning();
        return r;
      });
      res.json(versionOut(row));
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      if (err?.code === '23505' || err?.cause?.code === '23505') return bad(res, 'يوجد إصدار بنفس الاسم', 409);
      fail(res, err, 'تعديل إصدار السلّم');
    }
  });

  app.delete('/api/salary-scale/versions/:id', requireAuth, requireWriter, async (req, res) => {
    const id = int(req.params.id);
    if (isNaN(id)) return bad(res, 'معرّف غير صالح');
    try {
      await db.transaction(async (tx: any) => {
        const [v] = await tx.select().from(V).where(eq(V.id, id)).for('update');
        if (!v) throw Object.assign(new Error('الإصدار غير موجود'), { status: 404 });
        if (v.status !== 'مسودة') throw Object.assign(new Error('ما يُحذف إلا الإصدار المسودة'), { status: 409 });
        await tx.delete(S).where(eq(S.versionId, id));
        await tx.delete(V).where(eq(V.id, id));
        await audit(tx, req, 'حذف إصدار سلّم مسودة', id, { name: v.name }, null);
      });
      res.json({ success: true });
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      fail(res, err, 'حذف إصدار السلّم');
    }
  });

  // اعتماد إصدار مسودة: المدير، وغير من أنشأه أو عدّله آخر مرة (قرار B8: الفصل بالمعرّف)
  async function approveVersion(req: any, res: any) {
    const id = int(req.params.id);
    if (isNaN(id)) return bad(res, 'معرّف غير صالح');
    const me = who(req);
    try {
      const v2 = await db.transaction(async (tx: any) => {
        const [v] = await tx.select().from(V).where(eq(V.id, id)).for('update');
        if (!v) throw Object.assign(new Error('الإصدار غير موجود'), { status: 404 });
        if (v.status === 'معتمد') throw Object.assign(new Error('الإصدار معتمد مسبقاً'), { status: 409 });
        if (v.status !== 'مسودة') throw Object.assign(new Error('الإصدار المؤرشف ما يُعتمد'), { status: 409 });
        if (!v.effectiveFrom) throw Object.assign(new Error('حدد تاريخ نفاذ الإصدار قبل الاعتماد'), { status: 409 });
        if (!me) throw Object.assign(new Error('تعذّر التعرّف على المستخدم المعتمِد'), { status: 403 });
        if (me === v.createdBy || me === v.updatedBy) {
          throw Object.assign(new Error('ما تكدر تعتمد إصداراً أنشأته أو عدّلته أنت؛ يعتمده مدير آخر'), { status: 403 });
        }
        const [{ n }] = (await tx.execute(sql`SELECT count(*)::int n FROM salary_scale WHERE version_id = ${id} AND grade BETWEEN 1 AND 10`)).rows;
        if (Number(n) < 110) throw Object.assign(new Error('الإصدار ناقص: لازم 11 مرحلة لكل درجة من 1 إلى 10'), { status: 409 });
        const [clash] = (await tx.execute(sql`SELECT name FROM salary_scale_versions WHERE status = 'معتمد' AND effective_from = ${v.effectiveFrom}::date`)).rows;
        if (clash) throw Object.assign(new Error(`يوجد إصدار معتمد بنفس تاريخ النفاذ: ${clash.name}`), { status: 409 });
        const [r] = await tx.update(V).set({ status: 'معتمد', approvedBy: me, approvedAt: new Date(), updatedAt: new Date() }).where(eq(V.id, id)).returning();
        await refreshActiveFlag(tx);
        await audit(tx, req, 'اعتماد إصدار سلّم', id, { status: v.status }, { status: 'معتمد', effective_from: v.effectiveFrom });
        await tx.insert(schema.activityLogs).values({ action: 'اعتماد إصدار سلّم الرواتب', userEmail: me, details: `${v.name} نافذ من ${v.effectiveFrom}` });
        return r;
      });
      res.json({ success: true, version: versionOut(v2) });
    } catch (err: any) {
      if (err?.status) return bad(res, err.message, err.status);
      fail(res, err, 'اعتماد إصدار السلّم');
    }
  }
  app.post('/api/salary-scale/versions/:id/approve', requireAuth, requireAdmin, approveVersion);
  app.post('/api/salary-scale/versions/:id/activate', requireAuth, requireAdmin, approveVersion); // B4d: الاسم القديم

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
