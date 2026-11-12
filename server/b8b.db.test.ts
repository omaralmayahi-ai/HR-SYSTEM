// B8b: حالات الاستحقاق من الإجازات وحالة الموظف، والأقساط والمحجوز المشتقة من الاحتسابات المعتمدة، وعكسها بإلغاء الاعتماد.
// الحالات 13 (من إجازة حقيقية)، 16، 17، 19 — على PostgreSQL حقيقية (HR_TEST_DB=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('B8b الحالات والأرصدة على قاعدة حقيقية', () => {
  let db: any; let schema: any; let per: any; let pend: any;
  let catId: number; let empA: number; let empB: number; let loanId: number; let releaseId: number; let leaveTypeId: number; let orderId: number;
  const rows = (r: any) => (r.rows ?? r) as any[];
  const tag = 'S' + Date.now();
  const service = 'خدمة ' + tag;
  const SUSP_STATUS = 'مسحوب اليد';
  const ELIG = ['مستمر', SUSP_STATUS];
  const periods: number[] = [];
  let suspEligibleBefore: any;

  const runPeriod = async (year: number, month: number) => {
    const p = await per.openPeriod(db, schema, { categoryId: catId, year, month, user: 'writer1' });
    periods.push(p.id);
    const r = await per.computeRun(db, schema, p.id, 'writer1', ELIG);
    return { periodId: p.id, runId: r.run_id };
  };
  const approveIssue = async (periodId: number, n: number) => {
    await per.approvePeriod(db, schema, periodId, 'admin', ELIG);
    await per.issuePeriod(db, schema, periodId, 'admin', `كتاب ${n}`);
  };
  const lineSum = async (runId: number, emp: number, where: any) => Number(rows(await db.execute(sql`SELECT coalesce(sum(amount), 0)::text v FROM payroll_lines WHERE run_id = ${runId} AND employee_id = ${emp} AND ${where}`))[0].v);

  beforeAll(async () => {
    const mod = await import('../src/db/index.ts');
    db = mod.db; schema = mod.schema;
    per = await import('./payroll/periods.ts');
    pend = await import('./payroll/pending.ts');
    const [c] = await db.insert(schema.payrollCategories).values({ code: tag, name: 'فئة ' + tag, kind: 'دائم', isActive: true }).returning();
    catId = c.id;
    await db.insert(schema.payrollCategoryRules).values({ serviceType: service, contractType: null, categoryId: catId });
    const item = async (code: string, direction: string, method: string, mode: string, props: any) => {
      const [it] = rows(await db.execute(sql`INSERT INTO pay_items (code, name, direction, item_group, classification, assignment_mode, method, category_id)
        VALUES (${code + tag}, ${'بند ' + code}, ${direction}, 'أخرى', 'مؤقت', ${mode}, ${method}, ${catId}) RETURNING id`));
      await db.execute(sql`INSERT INTO pay_item_versions (item_id, valid_from, props, entered_by, approved_by)
        VALUES (${it.id}, '2020-01-01', ${JSON.stringify({ status: 'فعّال', verification: 'مؤكد', legal_basis: 'اختبار', calc_order: 60, ...props })}::jsonb, 't', 't2')`);
      return it.id;
    };
    orderId = rows(await db.execute(sql`INSERT INTO administrative_orders (order_number, order_date) VALUES (${'أمر ' + tag}, '2030-01-01') RETURNING id`))[0].id;
    loanId = await item('LOAN', '-', 'installments', 'بأمر', { deduction_priority: 4 });
    releaseId = await item('REL', '+', 'manual', 'بأمر', { monthly: true, held_release: true });
    const [lt] = await db.insert(schema.leaveTypes).values({ name: 'نصف راتب ' + tag, salaryPaymentType: 'استقطاع_جزئي', financialDeductionPercentage: 50 }).returning();
    leaveTypeId = lt.id;
    const emp = async (n: string) => {
      const [e] = await db.insert(schema.employees).values({ fullName: 'موظف ' + n + ' ' + tag, companyNumber: tag + n, grade: 7, step: 1, status: 'مستمر', serviceType: service,
        familyMode: 'لا يستحق', department: 'قسم', firstAppointmentDate: '2015-01-01' }).returning();
      return e.id;
    };
    empA = await emp('A'); empB = await emp('B');
    // سلفتان متزامنتان للموظف أ (حالة 17): 300,000 بقسط 200,000، و100,000 بقسط 60,000
    for (const [principal, installment] of [[300000, 200000], [100000, 60000]]) {
      await db.insert(schema.employeePayAssignments).values({ employeeId: empA, itemId: loanId, kind: 'منح', valueKind: 'مبلغ', validFrom: '2030-01-01', principal: String(principal), installment: String(installment), enteredBy: 't', approvedBy: 't2', reason: 'اختبار', multiAllowed: true, orderId });
    }
    // إجازة بنصف راتب 10 أيام للموظف ب بكانون الثاني (حالة 13 من سجل حقيقي، ربط ق-17 من طريقة الصرف)
    await db.insert(schema.leaveRequests).values({ employeeId: empB, leaveType: 'نصف راتب ' + tag, leaveTypeId, startDate: '2030-01-11', endDate: '2030-01-20', daysCount: 10, status: 'معتمد' });
    // سحب يد للموظف ب من 16 شباط (حالة الموظف ← SUSPENSION)
    suspEligibleBefore = rows(await db.execute(sql`SELECT payroll_eligible FROM employee_statuses WHERE name = ${SUSP_STATUS}`))[0]?.payroll_eligible;
    await db.execute(sql`UPDATE employee_statuses SET payroll_eligible = true WHERE name = ${SUSP_STATUS}`);
  });
  // ما نترك أثراً على صفوف مشتركة (مراجعة L6)
  afterAll(async () => {
    if (!db) return;
    if (suspEligibleBefore !== undefined) await db.execute(sql`UPDATE employee_statuses SET payroll_eligible = ${!!suspEligibleBefore} WHERE name = ${SUSP_STATUS}`);
    await db.execute(sql`UPDATE leave_types SET status = 'متوقف مؤقتاً' WHERE id = ${leaveTypeId}`);
  });

  it('حالة 13 من إجازة معتمدة: الاسمي المستحق بنصف راتب لأيامها', async () => {
    const { periodId, runId } = await runPeriod(2030, 1);
    const nominal = await lineSum(runId, empB, sql`kind = 'nominal'`);
    expect(Math.round(nominal)).toBe(Math.round(296000 * 21 / 31 + 148000 * 10 / 31));
    // سلفتان: قسطان كاملان
    expect(await lineSum(runId, empA, sql`item_id = ${loanId}`)).toBe(260000);
    await approveIssue(periodId, 1);
  });

  it('حالة 17 + 16: الأرصدة من المعتمد السابق — القسط الأخير = الباقي، وسحب اليد يحجز 50%', async () => {
    const { movement } = { movement: await import('./careerMovements.ts') };
    await movement.applyMovement(db, schema, { employeeId: empB, effectiveDate: '2030-02-16', changes: { status: SUSP_STATUS }, source: 'تعديل مباشر', reason: 'سحب يد', userLabel: 'writer1' });
    const { periodId, runId } = await runPeriod(2030, 2);
    const loans = rows(await db.execute(sql`SELECT amount::text a FROM payroll_lines WHERE run_id = ${runId} AND employee_id = ${empA} AND item_id = ${loanId} ORDER BY assignment_id`)).map(r => Number(r.a));
    expect(loans).toEqual([100000, 40000]);
    const held = await lineSum(runId, empB, sql`kind = 'held'`);
    expect(Math.round(held)).toBe(Math.round(148000 * 13 / 28));
    await approveIssue(periodId, 2);
    // آذار: السلفتان انتهتا
    const m3 = await runPeriod(2030, 3);
    expect(await lineSum(m3.runId, empA, sql`item_id = ${loanId}`)).toBe(0);
    await approveIssue(m3.periodId, 3);
  });

  it('حالة 16: البراءة ⇒ «صرف محجوز» بكامل المحجوز بالفترة المفتوحة', async () => {
    const { movement } = { movement: await import('./careerMovements.ts') };
    await movement.applyMovement(db, schema, { employeeId: empB, effectiveDate: '2030-04-01', changes: { status: 'مستمر' }, source: 'تعديل مباشر', reason: 'براءة', userLabel: 'writer1' });
    const heldTotal = Number(rows(await db.execute(sql`SELECT sum(l.amount)::text v FROM payroll_lines l JOIN payroll_runs r ON r.id = l.run_id
      WHERE l.employee_id = ${empB} AND l.kind = 'held' AND r.state = 'مُصدَر'`))[0].v);
    expect(heldTotal).toBeGreaterThan(100000);
    await db.insert(schema.employeePayAssignments).values({ employeeId: empB, itemId: releaseId, kind: 'منح', valueKind: 'مبلغ', value: '10000000', validFrom: '2030-04-01', validTo: '2030-04-30', enteredBy: 't', approvedBy: 't2', reason: 'اختبار', multiAllowed: true, orderId });
    const m4 = await runPeriod(2030, 4);
    const rel = await lineSum(m4.runId, empB, sql`kind = 'held_release'`);
    expect(rel).toBeCloseTo(heldTotal, 4);
  });

  it('حالة 19: إلغاء اعتماد فترة يعيد الأقساط كما كانت', async () => {
    // موظف ج بسلفة؛ نعتمد نيسان ثم نلغي الاعتماد ونعيد الاحتساب: القسط نفسه يرجع
    const m4 = periods[periods.length - 1];
    const [p4] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, m4));
    await db.insert(schema.employeePayAssignments).values({ employeeId: empA, itemId: loanId, kind: 'منح', valueKind: 'مبلغ', validFrom: '2030-04-01', principal: '90000', installment: '50000', enteredBy: 't', approvedBy: 't2', reason: 'اختبار', multiAllowed: true, orderId });
    await per.computeRun(db, schema, m4, 'writer1', ELIG);
    await per.approvePeriod(db, schema, m4, 'admin', ELIG);
    const req = await pend.submit(db, schema, 'period_unapprove', { period_id: m4, reason: 'تصحيح' }, 'admin');
    await pend.decide(db, schema, req.pending.id, 'approve', 'admin2');
    const again = await per.computeRun(db, schema, m4, 'writer1', ELIG);
    expect(await lineSum(again.run_id, empA, sql`item_id = ${loanId}`)).toBe(50000);
    expect(p4.status).toBe('محتسبة');
  });

  it('تعديل حالة استحقاق يحتاج مُعتمِداً ثانياً', async () => {
    const [st] = rows(await db.execute(sql`SELECT id, nominal_pct::text np FROM entitlement_states WHERE code = 'HALF_PAY'`));
    const r = await pend.submit(db, schema, 'entitlement_state', { id: st.id, fields: { nominal_pct: 50 } }, 'admin');
    expect(r.applied).toBe(false);
    await expect(pend.decide(db, schema, r.pending.id, 'approve', 'admin')).rejects.toThrow();
    await pend.decide(db, schema, r.pending.id, 'approve', 'admin2');
    expect(rows(await db.execute(sql`SELECT count(*)::int n FROM payroll_audit WHERE entity = 'entitlement_states' AND entity_id = ${String(st.id)}`))[0].n).toBeGreaterThan(0);
  });

  it('مراجعة M4/M5: إجازة بتسمية قديمة «موافق_عليها» تطبَّق، وعقوبة مقبول طعنها ما تطبَّق، والتاريخ غير الصالح يُبلَّغ', async () => {
    const loader = await import('./payroll/loader.ts');
    const [ut] = await db.insert(schema.leaveTypes).values({ name: 'بدون راتب ' + tag, salaryPaymentType: 'بدون_راتب' }).returning();
    await db.insert(schema.leaveRequests).values({ employeeId: empA, leaveType: ut.name, leaveTypeId: ut.id, startDate: '2030-06-01', endDate: '2030-06-10', daysCount: 10, status: 'موافق_عليها' });
    await db.insert(schema.leaveRequests).values({ employeeId: empA, leaveType: ut.name, leaveTypeId: ut.id, startDate: '1/6/2030', endDate: '2030-06-12', daysCount: 2, status: 'معتمد' });
    await db.insert(schema.penalties).values({ employeeId: empA, penaltyType: 'قطع الراتب', penaltyDate: '2030-06-20', daysCount: 5, status: 'نافذ', appealStatus: 'مقبول الطعن' });
    const { employees, ctx } = await loader.loadPeriodInputs(db, { year: 2030, month: 6, categoryId: catId, eligibleStatuses: ELIG, employeeIds: [empA], knownAt: new Date(Date.now() + 1000) });
    const e = employees[0];
    expect(e.states.map((x: any) => [x.from, x.to])).toEqual([['2030-06-01', '2030-06-10']]);
    expect(e.inputIssues.some((i: any) => i.code === 'STATE_DATE_INVALID')).toBe(true);
    expect(ctx.states.size).toBeGreaterThan(0);
  });
});

describe.skipIf(process.env.HR_TEST_DB !== '1')('ترحيل 0016 على بيانات أنواع إجازات حقيقية الشكل', () => {
  it('ربط أنواع الإجازات ما يفشل بـ «أكثر من صف» (فشل التحديث على جهاز المالك)', async () => {
    const fs = await import('node:fs');
    const { pool } = await import('../src/db/index.ts');
    const sqlText = fs.readFileSync(new URL('../drizzle/0016_b8b_entitlement.sql', import.meta.url), 'utf8');
    const stmt = sqlText.split('--> statement-breakpoint').find(x => x.includes('UPDATE "leave_types"'))!;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO leave_types (name, salary_payment_type) VALUES ('اعتيادية ف', 'براتب_تام'), ('مرضية ف', NULL), ('أمومة ف', NULL), ('بدون ف', 'بدون_راتب')`);
      await c.query(stmt);
      const r = await c.query(`SELECT t.name, s.code FROM leave_types t JOIN entitlement_states s ON s.id = t.entitlement_state_id WHERE t.name LIKE '% ف' ORDER BY t.name`);
      expect(r.rows.map((x: any) => [x.name, x.code])).toEqual([['أمومة ف', 'MATERNITY'], ['اعتيادية ف', 'FULL_LEAVE'], ['بدون ف', 'UNPAID'], ['مرضية ف', 'SICK_FULL']]);
    } finally { await c.query('ROLLBACK'); c.release(); }
  });
});
