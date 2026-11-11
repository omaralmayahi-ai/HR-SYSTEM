// server/routes/payrollPeriods.ts — B8a3: الفترات والاحتسابات الثابتة والاعتماد والإصدار والكشوف.
// الكاتب يفتح ويحتسب، والمدير (غير المحتسب) يعتمد ويُصدر؛ إلغاء الاعتماد عملية بانتظار مُعتمِد ثانٍ.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { desc, eq, sql } from 'drizzle-orm';
import { PayrollError } from '../payroll/catalog.ts';
import { submit } from '../payroll/pending.ts';
import { openPeriod, computeRun, approvePeriod, issuePeriod, checkFingerprint } from '../payroll/periods.ts';
import { reviewReport, statementWorkbook, STATEMENTS, type StatementKind } from '../payroll/reports.ts';

export function registerPayrollPeriodRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, requireAdmin, sendRouteError, statusRegistry } = ctx;
  const who = (req: any) => String(req.user?.username || '');
  const rows = (r: any) => ((r as any).rows ?? r) as any[];
  const int = (v: any) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
  const idOf = (v: any, label = 'المعرّف') => { const n = int(v); if (!(n > 0)) throw new PayrollError(`${label} غير صالح`); return n; };
  // الاحتساب المطلوب لازم يكون من نفس الفترة
  const runOf = async (periodId: number, q: any, current: number | null) => {
    if (q === undefined || q === null || q === '') return current;
    const rid = idOf(q, 'رقم الاحتساب');
    const [r] = rows(await db.execute(sql`SELECT id FROM payroll_runs WHERE id = ${rid} AND period_id = ${periodId}`));
    if (!r) throw new PayrollError('الاحتساب مو من هذه الفترة', 404);
    return rid;
  };
  const fail = (res: any, err: any, op: string) => {
    if (err instanceof PayrollError || err?.status) return res.status(err.status || 400).json({ error: err.message });
    const code = err?.code || err?.cause?.code;
    if (code === 'P0001') return res.status(409).json({ error: err?.cause?.message || err.message });
    if (code === '23505') return res.status(409).json({ error: 'الفترة موجودة مسبقاً لهذه الفئة' });
    sendRouteError(res, err, op);
  };
  const eligible = () => statusRegistry.namesWhere('payrollEligible');
  const category = async (code: any) => {
    const [c] = await db.select().from(schema.payrollCategories).where(eq(schema.payrollCategories.code, String(code || 'PERM')));
    if (!c) throw new PayrollError('فئة الرواتب غير موجودة', 404);
    return c;
  };
  // سجل النشاط بعد نجاح العملية: إذا فشل نسجّل الخطأ ونرجّع تنبيهاً بالرد (العملية نفسها تمت ومسجلة بسجل تدقيق الرواتب)
  const logActivity = async (req: any, action: string, details: string): Promise<string | null> => {
    try { await db.insert(schema.activityLogs).values({ action, userEmail: who(req) || null, details }); return null; }
    catch (e: any) { console.error('[payroll] activity log failed:', e?.message); return 'تعذّر التسجيل بسجل النشاط (العملية تمت ومسجلة بسجل تدقيق الرواتب)'; }
  };

  app.get('/api/payroll/periods', requireAuth, requireWriter, async (req, res) => {
    try {
      const c = await category(req.query.category);
      const list = rows(await db.execute(sql`SELECT p.*, r.totals, r.computed_by, r.finished_at AS computed_at, r.state AS run_state
        FROM payroll_periods p LEFT JOIN payroll_runs r ON r.id = p.current_run_id WHERE p.category_id = ${c.id} ORDER BY p.year DESC, p.month DESC, p.id DESC`));
      res.json({ category: c, periods: list });
    } catch (err: any) { fail(res, err, 'قراءة فترات الرواتب'); }
  });

  app.post('/api/payroll/periods', requireAuth, requireWriter, async (req, res) => {
    try {
      const c = await category(req.body?.category);
      const p = await openPeriod(db, schema, { categoryId: c.id, year: int(req.body?.year), month: int(req.body?.month), user: who(req), paySource: req.body?.pay_source });
      const w = await logActivity(req, 'فتح فترة رواتب', `${c.name} ${p.year}/${p.month}`);
      res.status(201).json({ ...p, ...(w ? { log_warning: w } : {}) });
    } catch (err: any) { fail(res, err, 'فتح فترة'); }
  });

  app.get('/api/payroll/periods/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = idOf(req.params.id);
      const [p] = rows(await db.execute(sql`SELECT p.*, c.name AS category_name, c.code AS category_code FROM payroll_periods p JOIN payroll_categories c ON c.id = p.category_id WHERE p.id = ${id}`));
      if (!p) return res.status(404).json({ error: 'الفترة غير موجودة' });
      const runs = await db.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.periodId, id)).orderBy(desc(schema.payrollRuns.id));
      const pendingUnapprove = rows(await db.execute(sql`SELECT id, entered_by, entered_at, summary FROM pending_operations WHERE op_type = 'period_unapprove' AND state = 'بانتظار' AND (payload->>'period_id')::int = ${id}`));
      // الشاشة تفحص البصمة عند فتح الفترة المحتسبة (3.8)
      const fp = req.query.check === '1' && p.status === 'محتسبة' ? await checkFingerprint(db, schema, id, await eligible()) : null;
      res.json({ period: p, runs, pending_unapprove: pendingUnapprove, fingerprint: fp });
    } catch (err: any) { fail(res, err, 'قراءة الفترة'); }
  });

  app.post('/api/payroll/periods/:id/compute', requireAuth, requireWriter, async (req, res) => {
    try {
      const r = await computeRun(db, schema, idOf(req.params.id), who(req), await eligible());
      const w = await logActivity(req, 'احتساب فترة رواتب', `الفترة ${req.params.id}، الاحتساب ${r.run_id}`);
      res.json({ ...r, ...(w ? { log_warning: w } : {}) });
    } catch (err: any) { fail(res, err, 'احتساب الفترة'); }
  });

  app.get('/api/payroll/periods/:id/review', requireAuth, requireWriter, async (req, res) => {
    try {
      const th = Number(req.query.threshold);
      res.json(await reviewReport(db, idOf(req.params.id), Number.isFinite(th) && th > 0 ? th : 10));
    } catch (err: any) { fail(res, err, 'تقرير المراجعة'); }
  });

  app.post('/api/payroll/periods/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    try {
      const r = await approvePeriod(db, schema, idOf(req.params.id), who(req), await eligible());
      const w = await logActivity(req, 'اعتماد فترة رواتب', `الفترة ${req.params.id}، الاحتساب ${r.run_id}، متغيرات ${r.variances}`);
      res.json({ ...r, ...(w ? { log_warning: w } : {}) });
    } catch (err: any) { fail(res, err, 'اعتماد الفترة'); }
  });

  app.post('/api/payroll/periods/:id/issue', requireAuth, requireAdmin, async (req, res) => {
    try {
      const r = await issuePeriod(db, schema, idOf(req.params.id), who(req), req.body?.dispatch_letter);
      const w = await logActivity(req, 'إصدار فترة رواتب', `الفترة ${req.params.id}، كتاب ${req.body?.dispatch_letter}`);
      res.json({ ...r, ...(w ? { log_warning: w } : {}) });
    } catch (err: any) { fail(res, err, 'إصدار الفترة'); }
  });

  // إلغاء الاعتماد قبل الإصدار: سبب مكتوب ومُعتمِد ثانٍ (س11.1)
  app.post('/api/payroll/periods/:id/unapprove', requireAuth, requireAdmin, async (req, res) => {
    try {
      const r = await submit(db, schema, 'period_unapprove', { period_id: idOf(req.params.id), reason: req.body?.reason }, who(req));
      res.status(202).json(r);
    } catch (err: any) { fail(res, err, 'طلب إلغاء الاعتماد'); }
  });

  app.get('/api/payroll/periods/:id/results', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = idOf(req.params.id);
      const [p] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, id));
      if (!p) return res.status(404).json({ error: 'الفترة غير موجودة' });
      const runId = await runOf(id, req.query.run, p.currentRunId);
      if (!runId) return res.json({ run_id: null, total: 0, results: [] });
      const q = String(req.query.q || '').trim();
      const filter = String(req.query.filter || '');
      const limit = Math.min(Math.max(int(req.query.limit) || 100, 1), 500), offset = Math.max(int(req.query.offset) || 0, 0);
      const like = `%${q}%`;
      const where = sql`run_id = ${runId}
        ${q ? sql`AND (snapshot->>'full_name' ILIKE ${like} OR snapshot->>'company_number' ILIKE ${like})` : sql``}
        ${filter === 'issues' ? sql`AND jsonb_array_length(issues) > 0` : filter === 'not_computed' ? sql`AND NOT computed` : filter === 'cap' ? sql`AND (flags->>'cap_reached')::boolean` : sql``}`;
      const [{ n }] = rows(await db.execute(sql`SELECT count(*)::int n FROM payroll_results WHERE ${where}`));
      const list = rows(await db.execute(sql`SELECT employee_id, computed, nominal::text nominal, allowances::text allowances, deductions::text deductions, net::text net, flags, issues, snapshot
        FROM payroll_results WHERE ${where} ORDER BY snapshot->>'company_number', employee_id LIMIT ${limit} OFFSET ${offset}`));
      res.json({ run_id: runId, total: n, results: list });
    } catch (err: any) { fail(res, err, 'نتائج الفترة'); }
  });

  app.get('/api/payroll/periods/:id/employees/:employeeId', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = idOf(req.params.id), eid = idOf(req.params.employeeId, 'رقم الموظف');
      const [p] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, id));
      if (!p?.currentRunId && !req.query.run) return res.status(404).json({ error: 'الفترة بلا احتساب' });
      const runId = await runOf(id, req.query.run, p?.currentRunId ?? null);
      const [r] = rows(await db.execute(sql`SELECT employee_id, computed, nominal::text nominal, allowances::text allowances, deductions::text deductions, net_exact::text net_exact, net::text net, flags, issues, snapshot FROM payroll_results WHERE run_id = ${runId} AND employee_id = ${eid}`));
      if (!r) return res.status(404).json({ error: 'الموظف غير موجود بهذا الاحتساب' });
      const lines = rows(await db.execute(sql`SELECT item_code, item_name, kind, direction, segment_from::text segment_from, segment_to::text segment_to, share, base::text base, rate, amount::text amount, explain
        FROM payroll_lines WHERE run_id = ${runId} AND employee_id = ${eid} ORDER BY seq`));
      const variances = rows(await db.execute(sql`SELECT item_name, before::text before, after::text after, cause, order_ref FROM payroll_variances WHERE run_id = ${runId} AND employee_id = ${eid}`));
      res.json({ run_id: runId, result: r, lines, variances });
    } catch (err: any) { fail(res, err, 'سطور الموظف'); }
  });

  // تاريخ رواتب الموظف المعتمدة والمُصدَرة (تبويب الموظف)
  app.get('/api/payroll/employees/:employeeId/history', requireAuth, requireWriter, async (req, res) => {
    try {
      const eid = idOf(req.params.employeeId, 'رقم الموظف');
      res.json(rows(await db.execute(sql`SELECT p.id period_id, p.year, p.month, p.status, p.pay_source, c.name category, r.run_id, r.net::text net, r.nominal::text nominal,
          r.allowances::text allowances, r.deductions::text deductions, r.computed
        FROM payroll_periods p JOIN payroll_categories c ON c.id = p.category_id JOIN payroll_results r ON r.run_id = p.current_run_id
        WHERE r.employee_id = ${eid} AND p.status IN ('معتمدة', 'مُصدَرة') ORDER BY p.year DESC, p.month DESC LIMIT 60`)));
    } catch (err: any) { fail(res, err, 'تاريخ رواتب الموظف'); }
  });

  // الكشوف (Excel) — كل تصدير يُسجَّل بسجل النشاط (س16.2)
  app.get('/api/payroll/periods/:id/statements/:kind', requireAuth, requireWriter, async (req, res) => {
    try {
      const kind = String(req.params.kind) as StatementKind;
      if (!(kind in STATEMENTS)) throw new PayrollError('نوع كشف غير معروف');
      const pid = idOf(req.params.id);
      const out = await statementWorkbook(db, pid, kind, who(req), { itemCode: req.query.item ? String(req.query.item) : undefined, runId: (await runOf(pid, req.query.run, null)) ?? undefined });
      await db.insert(schema.activityLogs).values({ action: 'تصدير كشف رواتب', userEmail: who(req) || null, details: `${STATEMENTS[kind]} — الفترة ${out.period.id} (${out.period.year}/${out.period.month})، الاحتساب ${out.run.id}${req.query.item ? `، البند ${req.query.item}` : ''}` });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(out.fname)}`);
      res.send(out.buf);
    } catch (err: any) { fail(res, err, 'تصدير الكشف'); }
  });
}
