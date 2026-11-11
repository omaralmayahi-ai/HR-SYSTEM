// server/routes/payroll.ts — B8a1: البنود ونسخها، الإسناد والحجب، العائلة، والاعتماد الثاني.
// الأدوار الحالية (قرار عمر): الكاتب يُدخل، والمدير يعتمد؛ والفصل بالمعرّف (المُدخل ≠ المعتمِد).
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { PayrollError, CONDITION_FIELDS, OPERATORS, LEVEL_SOURCES } from '../payroll/catalog.ts';
import { submit, decide, OP_TYPES, type OpType } from '../payroll/pending.ts';
import { dataQuality } from '../payroll/quality.ts';
import { todayBaghdad } from '../careerMovements.ts';

export function registerPayrollRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, requireAdmin, sendRouteError, statusRegistry } = ctx;
  const who = (req: any) => String(req.user?.username || '');
  const fail = (res: any, err: any, op: string) => {
    if (err instanceof PayrollError || err?.status) return res.status(err.status || 400).json({ error: err.message });
    if (err?.code === '23P01' || err?.cause?.code === '23P01') return res.status(409).json({ error: 'تداخل بالمدد مع صف نافذ لنفس البند (قيد منع التداخل)' });
    sendRouteError(res, err, op);
  };
  const rows = (r: any) => ((r as any).rows ?? r) as any[];
  const int = (v: any) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };

  app.get('/api/payroll/meta', requireAuth, async (_req, res) => {
    try {
      const [cats, deg, resp, locs] = await Promise.all([
        db.select().from(schema.payrollCategories).orderBy(asc(schema.payrollCategories.id)),
        db.select({ id: schema.educationDegrees.id, name: schema.educationDegrees.name }).from(schema.educationDegrees).orderBy(asc(schema.educationDegrees.id)),
        db.select({ id: schema.responsibilityAllowances.id, name: schema.responsibilityAllowances.name }).from(schema.responsibilityAllowances).orderBy(asc(schema.responsibilityAllowances.id)),
        db.select({ id: schema.workLocations.id, name: schema.workLocations.name }).from(schema.workLocations).orderBy(asc(schema.workLocations.id)),
      ]);
      const catRules = await db.select().from(schema.payrollCategoryRules);
      res.json({
        categories: cats, category_rules: catRules, condition_fields: CONDITION_FIELDS, operators: OPERATORS,
        level_sources: Object.fromEntries(Object.entries(LEVEL_SOURCES).map(([k, v]) => [k, { ...v, rows: k === 'education_degrees' ? deg : k === 'responsibility_allowances' ? resp : locs }])),
        today: todayBaghdad(),
      });
    } catch (err: any) { fail(res, err, 'قراءة بيانات الرواتب المرجعية'); }
  });

  // البنود مع نسخها الحية؛ «الحالية» = النسخة اللي تغطي اليوم
  app.get('/api/payroll/items', requireAuth, async (_req, res) => {
    try {
      const items = await db.select().from(schema.payItems).orderBy(asc(schema.payItems.id));
      const versions = await db.select().from(schema.payItemVersions).where(isNull(schema.payItemVersions.supersededAt)).orderBy(asc(schema.payItemVersions.validFrom));
      const pending = rows(await db.execute(sql`SELECT item_id, count(*)::int n FROM pending_operations WHERE state = 'بانتظار' AND item_id IS NOT NULL GROUP BY item_id`));
      const pend = new Map(pending.map(p => [Number(p.item_id), Number(p.n)]));
      const today = todayBaghdad();
      res.json(items.map((i: any) => {
        const vs = versions.filter((v: any) => v.itemId === i.id);
        const current = vs.find((v: any) => v.validFrom <= today && (!v.validTo || v.validTo >= today)) || vs[vs.length - 1] || null;
        return { ...i, versions: vs, current, pending_count: pend.get(i.id) || 0 };
      }));
    } catch (err: any) { fail(res, err, 'قراءة بنود الرواتب'); }
  });

  app.get('/api/payroll/items/:id/history', requireAuth, async (req, res) => {
    const id = int(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const vs = await db.select().from(schema.payItemVersions).where(eq(schema.payItemVersions.itemId, id)).orderBy(asc(schema.payItemVersions.recordedAt), asc(schema.payItemVersions.id));
      res.json(vs);
    } catch (err: any) { fail(res, err, 'سجل نسخ البند'); }
  });

  const submitRoute = (op: OpType, build: (req: any) => any) => async (req: any, res: any) => {
    try {
      const r = await submit(db, schema, op, build(req), who(req));
      res.status(r.applied ? 200 : 202).json(r);
    } catch (err: any) { fail(res, err, 'إدخال العملية'); }
  };

  app.post('/api/payroll/items/:id/versions', requireAuth, requireWriter, submitRoute('item_version', req => ({ ...req.body, item_id: int(req.params.id) })));

  // الإسناد الفردي والحجب
  app.get('/api/payroll/assignments', requireAuth, async (req, res) => {
    try {
      const empId = int(req.query.employee_id);
      const A = schema.employeePayAssignments;
      const where = [isNull(A.supersededAt)];
      if (!isNaN(empId)) where.push(eq(A.employeeId, empId));
      const list = await db.select({ a: A, itemName: schema.payItems.name, itemCode: schema.payItems.code, classification: schema.payItems.classification, orderNumber: schema.administrativeOrders.orderNumber, orderDate: schema.administrativeOrders.orderDate })
        .from(A).innerJoin(schema.payItems, eq(schema.payItems.id, A.itemId)).leftJoin(schema.administrativeOrders, eq(schema.administrativeOrders.id, A.orderId))
        .where(and(...where)).orderBy(desc(A.validFrom)).limit(isNaN(empId) ? 2000 : 500);
      res.json(list.map((r: any) => ({ ...r.a, item_name: r.itemName, item_code: r.itemCode, classification: r.classification, order_number: r.orderNumber, order_date: r.orderDate })));
    } catch (err: any) { fail(res, err, 'قراءة الإسنادات'); }
  });
  app.post('/api/payroll/assignments', requireAuth, requireWriter, submitRoute('assignment', req => req.body));
  app.post('/api/payroll/assignments/:id/end', requireAuth, requireWriter, submitRoute('assignment_end', req => ({ ...req.body, assignment_id: int(req.params.id) })));

  // العائلة
  app.get('/api/payroll/family/:employeeId', requireAuth, async (req, res) => {
    const empId = int(req.params.employeeId);
    if (isNaN(empId)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const [emp] = await db.select({ id: schema.employees.id, familyMode: schema.employees.familyMode, maritalStatus: schema.employees.maritalStatus, childrenCount: schema.employees.childrenCount })
        .from(schema.employees).where(eq(schema.employees.id, empId));
      if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
      const members = await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.employeeId, empId)).orderBy(asc(schema.familyMembers.id));
      const ids = members.map((m: any) => m.id);
      const facts = ids.length ? rows(await db.execute(sql`
        SELECT f.*, o.order_number, o.order_date::text AS order_date FROM family_member_facts f LEFT JOIN administrative_orders o ON o.id = f.order_id
        WHERE f.member_id = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::int[]`)})
          AND NOT EXISTS (SELECT 1 FROM family_member_facts c WHERE c.supersedes_id = f.id)
        ORDER BY f.member_id, f.fact, f.valid_from NULLS FIRST, f.id`)) : [];
      const ext = ids.length ? rows(await db.execute(sql`SELECT * FROM family_extensions WHERE member_id = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::int[]`)}) ORDER BY member_id, valid_from`)) : [];
      const pending = await db.select().from(schema.pendingOperations).where(and(eq(schema.pendingOperations.employeeId, empId), eq(schema.pendingOperations.state, 'بانتظار')));
      res.json({ employee: emp, members, facts, extensions: ext, pending: pending.filter((p: any) => String(p.opType).startsWith('family')) });
    } catch (err: any) { fail(res, err, 'قراءة العائلة'); }
  });
  app.post('/api/payroll/family/:employeeId/members', requireAuth, requireWriter, submitRoute('family_member', req => ({ ...req.body, employee_id: int(req.params.employeeId) })));
  app.post('/api/payroll/family/facts', requireAuth, requireWriter, submitRoute('family_fact', req => req.body));
  app.post('/api/payroll/family/:employeeId/mode', requireAuth, requireWriter, submitRoute('family_mode', req => ({ ...req.body, employee_id: int(req.params.employeeId) })));
  app.post('/api/payroll/family/extensions', requireAuth, requireWriter, submitRoute('family_extension', req => req.body));

  // العمليات بانتظار الاعتماد
  app.get('/api/payroll/pending', requireAuth, async (req, res) => {
    try {
      const state = String(req.query.state || 'بانتظار');
      const list = await db.select().from(schema.pendingOperations).where(eq(schema.pendingOperations.state, state)).orderBy(desc(schema.pendingOperations.enteredAt)).limit(500);
      res.json(list);
    } catch (err: any) { fail(res, err, 'قراءة العمليات المعلقة'); }
  });
  app.post('/api/payroll/pending/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await decide(db, schema, int(req.params.id), 'approve', who(req), req.body?.reason)); } catch (err: any) { fail(res, err, 'اعتماد العملية'); }
  });
  app.post('/api/payroll/pending/:id/reject', requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await decide(db, schema, int(req.params.id), 'reject', who(req), req.body?.reason)); } catch (err: any) { fail(res, err, 'رفض العملية'); }
  });
  app.post('/api/payroll/pending/:id/cancel', requireAuth, requireWriter, async (req, res) => {
    try { res.json(await decide(db, schema, int(req.params.id), 'cancel', who(req), req.body?.reason)); } catch (err: any) { fail(res, err, 'إلغاء العملية'); }
  });

  app.get('/api/payroll/data-quality', requireAuth, async (_req, res) => {
    try { res.json(await dataQuality(db, await statusRegistry.namesWhere('payrollEligible'))); } catch (err: any) { fail(res, err, 'فحص جودة بيانات الرواتب'); }
  });

  app.get('/api/payroll/audit', requireAuth, requireAdmin, async (req, res) => {
    try {
      const entity = String(req.query.entity || '');
      const list = await db.select().from(schema.payrollAudit).where(entity ? eq(schema.payrollAudit.entity, entity) : undefined).orderBy(desc(schema.payrollAudit.id)).limit(500);
      res.json(list);
    } catch (err: any) { fail(res, err, 'سجل تدقيق الرواتب'); }
  });

  void OP_TYPES;
}
