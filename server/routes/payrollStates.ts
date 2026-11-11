// server/routes/payrollStates.ts — B8b: حالات الاستحقاق وربطها بأنواع الإجازات وحالات الموظف، وأرصدة الموظف.
// كل إضافة أو تعديل أو ربط عملية بانتظار مدير ثانٍ (مب9) لأنها تغيّر الرواتب.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { sql } from 'drizzle-orm';
import { PayrollError } from '../payroll/catalog.ts';
import { submit } from '../payroll/pending.ts';
import { money, toDecimal, maxM } from '../payroll/money.ts';

export function registerPayrollStateRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, requireAdmin, sendRouteError } = ctx;
  const who = (req: any) => String(req.user?.username || '');
  const rows = (r: any) => ((r as any).rows ?? r) as any[];
  const fail = (res: any, err: any, op: string) => {
    if (err instanceof PayrollError || err?.status) return res.status(err.status || 400).json({ error: err.message });
    sendRouteError(res, err, op);
  };

  app.get('/api/payroll/states', requireAuth, requireWriter, async (_req, res) => {
    try {
      const states = rows(await db.execute(sql`SELECT id, code, name, nominal_pct::text nominal_pct, held_pct::text held_pct, default_behavior, item_behaviors, retirement, precedence,
        verification, legal_basis, is_active, updated_at FROM entitlement_states ORDER BY precedence, id`));
      const leaveTypes = rows(await db.execute(sql`SELECT id, name, salary_payment_type, entitlement_state_id FROM leave_types ORDER BY id`));
      const statuses = rows(await db.execute(sql`SELECT id, name, payroll_eligible, entitlement_state_id FROM employee_statuses ORDER BY sort_order, id`));
      res.json({ states, leave_types: leaveTypes, statuses });
    } catch (err: any) { fail(res, err, 'قراءة حالات الاستحقاق'); }
  });

  app.post('/api/payroll/states', requireAuth, requireAdmin, async (req, res) => {
    try { res.status(202).json(await submit(db, schema, 'entitlement_state', { id: null, fields: req.body || {} }, who(req))); }
    catch (err: any) { fail(res, err, 'إضافة حالة استحقاق'); }
  });
  app.put('/api/payroll/states/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw new PayrollError('معرّف غير صالح');
      const fields = { ...(req.body || {}) }; delete fields.code; // الرمز ثابت
      res.status(202).json(await submit(db, schema, 'entitlement_state', { id, fields }, who(req)));
    } catch (err: any) { fail(res, err, 'تعديل حالة استحقاق'); }
  });
  app.post('/api/payroll/state-mappings', requireAuth, requireAdmin, async (req, res) => {
    try { res.status(202).json(await submit(db, schema, 'state_mapping', { table: req.body?.table, id: req.body?.id, state_id: req.body?.state_id }, who(req))); }
    catch (err: any) { fail(res, err, 'ربط حالة استحقاق'); }
  });

  // أرصدة الموظف الآن (من الاحتسابات المعتمدة والمُصدَرة): الأقساط، المحجوز، الرصيد المدين
  app.get('/api/payroll/employees/:employeeId/balances', requireAuth, requireWriter, async (req, res) => {
    try {
      const eid = Number(req.params.employeeId);
      if (!Number.isInteger(eid) || eid <= 0) throw new PayrollError('رقم الموظف غير صالح');
      // ?as_of_period=: الأرصدة كما كانت بعد تلك الفترة (القسيمة القديمة ما تعرض أرصدة اليوم — مراجعة L1)
      let ok = sql`r.state IN ('معتمد', 'مُصدَر')`;
      if (req.query.as_of_period) {
        const pid = Number(req.query.as_of_period);
        if (!Number.isInteger(pid) || pid <= 0) throw new PayrollError('رقم الفترة غير صالح');
        const [p] = rows(await db.execute(sql`SELECT year, month, category_id FROM payroll_periods WHERE id = ${pid}`));
        if (!p) throw new PayrollError('الفترة غير موجودة', 404);
        ok = sql`r.state IN ('معتمد', 'مُصدَر') AND r.period_id IN (SELECT id FROM payroll_periods WHERE category_id = ${p.category_id} AND (year * 12 + month) <= ${p.year * 12 + p.month})`;
      }
      const installments = rows(await db.execute(sql`SELECT a.id assignment_id, i.code, i.name, a.principal::text principal, a.installment::text installment, a.installments_count,
          a.valid_from::text valid_from, a.valid_to::text valid_to, coalesce((SELECT sum(l.amount) FROM payroll_lines l JOIN payroll_runs r ON r.id = l.run_id WHERE l.assignment_id = a.id AND ${ok}), 0)::text paid
        FROM employee_pay_assignments a JOIN pay_items i ON i.id = a.item_id
        WHERE a.employee_id = ${eid} AND i.method = 'installments' AND a.superseded_at IS NULL AND a.kind <> 'حجب' ORDER BY a.valid_from, a.id`));
      const [held] = rows(await db.execute(sql`SELECT coalesce(sum(CASE WHEN l.kind = 'held' THEN l.amount ELSE -l.amount END), 0)::text v FROM payroll_lines l JOIN payroll_runs r ON r.id = l.run_id
        WHERE l.employee_id = ${eid} AND l.kind IN ('held', 'held_release') AND ${ok}`));
      const [debit] = rows(await db.execute(sql`SELECT (coalesce((SELECT sum(res.negative) FROM payroll_results res JOIN payroll_runs r ON r.id = res.run_id WHERE res.employee_id = ${eid} AND ${ok}), 0)
        - coalesce((SELECT sum(l.amount) FROM payroll_lines l JOIN payroll_runs r ON r.id = l.run_id WHERE l.employee_id = ${eid} AND l.kind = 'debit_carry' AND ${ok}), 0))::text v`));
      res.json({
        installments: installments.map(x => ({ ...x, remaining: toDecimal(maxM(money(x.principal ?? '0') - money(x.paid), 0n)) })),
        held: held?.v ?? '0', debit: debit?.v ?? '0',
      });
    } catch (err: any) { fail(res, err, 'أرصدة الموظف'); }
  });
}
