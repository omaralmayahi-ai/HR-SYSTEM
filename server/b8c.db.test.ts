// B8c: الفروقات الرجعية (الحالات 20، 21، 22) والدورة الاستثنائية ورفض المصرف والحساب المصرفي (الحالتان 11، 12) — PostgreSQL حقيقية.
import { describe, it, expect, beforeAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('B8c الفروق والمصرف على قاعدة حقيقية', () => {
  let db: any; let schema: any; let per: any; let pend: any; let rep: any;
  let catId: number; let empA: number; let empB: number; let certId: number; let certItemId: number; let deg1: any; let deg2: any;
  const rows = (r: any) => (r.rows ?? r) as any[];
  const tag = 'R' + Date.now();
  const service = 'خدمة ' + tag;
  const ELIG = ['مستمر'];
  const pids: Record<string, number> = {};

  const run = async (ym: string, approve = true) => {
    const [y, m] = ym.split('-').map(Number);
    const p = await per.openPeriod(db, schema, { categoryId: catId, year: y, month: m, user: 'writer1' });
    pids[ym] = p.id;
    const r = await per.computeRun(db, schema, p.id, 'writer1', ELIG);
    if (approve) { await per.approvePeriod(db, schema, p.id, 'admin', ELIG); await per.issuePeriod(db, schema, p.id, 'admin', 'كتاب ' + ym); }
    return { periodId: p.id, runId: r.run_id };
  };
  const retroLines = async (runId: number, emp: number) => rows(await db.execute(sql`SELECT item_code, amount::text a, explain->>'origin_ym' oy FROM payroll_lines WHERE run_id = ${runId} AND employee_id = ${emp} AND kind = 'retro' ORDER BY explain->>'origin_ym', item_code`));

  beforeAll(async () => {
    const mod = await import('../src/db/index.ts');
    db = mod.db; schema = mod.schema;
    per = await import('./payroll/periods.ts');
    pend = await import('./payroll/pending.ts');
    rep = await import('./payroll/reports.ts');
    const [c] = await db.insert(schema.payrollCategories).values({ code: tag, name: 'فئة ' + tag, kind: 'دائم', isActive: true }).returning();
    catId = c.id;
    await db.insert(schema.payrollCategoryRules).values({ serviceType: service, contractType: null, categoryId: catId });
    [deg1, deg2] = rows(await db.execute(sql`SELECT id, name FROM education_degrees ORDER BY id LIMIT 2`));
    const [it] = rows(await db.execute(sql`INSERT INTO pay_items (code, name, direction, item_group, classification, assignment_mode, method, category_id)
      VALUES (${'CERT' + tag}, 'شهادة', '+', 'أخرى', 'ثابت', 'تلقائي', 'tiered', ${catId}) RETURNING id`));
    certItemId = it.id;
    const props = (v: number) => ({ status: 'فعّال', verification: 'مؤكد', legal_basis: 'اختبار', calc_order: 10, level_source: 'education_degrees', value_kind: 'نسبة', base: ['NOMINAL'],
      inside_200_cap: true, cap_reduction_priority: 1, levels: [{ ref_id: deg1.id, label: deg1.name, value: 45 }, { ref_id: deg2.id, label: deg2.name, value: v }] });
    certId = rows(await db.execute(sql`INSERT INTO pay_item_versions (item_id, valid_from, props, entered_by, approved_by) VALUES (${certItemId}, '2020-01-01', ${JSON.stringify(props(25))}::jsonb, 't', 't2') RETURNING id`))[0].id;
    (globalThis as any).__certProps = props;
    const emp = async (n: string) => (await db.insert(schema.employees).values({ fullName: 'موظف ' + n + ' ' + tag, companyNumber: tag + n, grade: 7, step: 1, status: 'مستمر', serviceType: service,
      educationLevel: deg2.name, familyMode: 'لا يستحق', department: 'قسم', firstAppointmentDate: '2015-01-01' }).returning())[0].id;
    empA = await emp('A'); empB = await emp('B');
  });

  it('حالة 20: تعديل ضابط الشهادة بأثر رجعي 3 أشهر ⇒ الفترات المعتمدة ما تتغير وثلاثة فروق بالمفتوحة', async () => {
    await run('2031-01'); await run('2031-02'); await run('2031-03');
    const jan = rows(await db.execute(sql`SELECT amount::text a FROM payroll_lines l JOIN payroll_periods p ON p.current_run_id = l.run_id WHERE p.id = ${pids['2031-01']} AND l.employee_id = ${empA} AND l.item_code = ${'CERT' + tag}`))[0].a;
    // نسخة جديدة للبند من 1 كانون الثاني: 25% ← 35% (تُسجَّل الآن، بعد اعتماد الفترات الثلاث)
    const props = (globalThis as any).__certProps(35);
    await db.transaction(async (tx: any) => {
      const { supersedeAndInsert } = await import('./payroll/catalog.ts');
      await supersedeAndInsert(tx, schema.payItemVersions, eq(schema.payItemVersions.itemId, certItemId), { itemId: certItemId, validFrom: '2031-01-01', validTo: null, props, enteredBy: 't', approvedBy: 't2' });
    });
    const apr = await run('2031-04', false);
    const diffs = await retroLines(apr.runId, empA);
    expect(diffs.map(d => [d.oy, Math.round(Number(d.a))])).toEqual([['2031/01', 29600], ['2031/02', 29600], ['2031/03', 29600]]);
    // اللقطة المعتمدة ما تغيّرت
    const janAfter = rows(await db.execute(sql`SELECT amount::text a FROM payroll_lines l JOIN payroll_periods p ON p.current_run_id = l.run_id WHERE p.id = ${pids['2031-01']} AND l.employee_id = ${empA} AND l.item_code = ${'CERT' + tag}`))[0].a;
    expect(janAfter).toBe(jan);
    await per.approvePeriod(db, schema, apr.periodId, 'admin', ELIG);
    await per.issuePeriod(db, schema, apr.periodId, 'admin', 'كتاب 4');
  });

  it('حالة 21: احتساب الفترة التالية بعد اعتماد الفروق ⇒ ما تظهر الفروق مرة ثانية', async () => {
    const may = await run('2031-05', false);
    expect(await retroLines(may.runId, empA)).toEqual([]);
  });

  it('حالة 22: تصحيح شهادة موظف بأثر رجعي ⇒ فرق لهذا الموظف فقط، والسجل القديم باقٍ', async () => {
    const mov = await import('./careerMovements.ts');
    await mov.applyMovement(db, schema, { employeeId: empB, effectiveDate: '2031-03-01', changes: { education_level: deg1.name }, source: 'تعديل مباشر', reason: 'شهادة متأخرة', userLabel: 'writer1' });
    const r = await per.computeRun(db, schema, pids['2031-05'], 'writer1', ELIG);
    const b = await retroLines(r.run_id, empB);
    expect(b.map(d => d.oy)).toEqual(['2031/03', '2031/04']);
    expect(await retroLines(r.run_id, empA)).toEqual([]);
    expect(rows(await db.execute(sql`SELECT count(*)::int n FROM employee_field_history WHERE employee_id = ${empB} AND field = 'education_level'`))[0].n).toBeGreaterThanOrEqual(2);
    await per.approvePeriod(db, schema, pids['2031-05'], 'admin', ELIG);
    await per.issuePeriod(db, schema, pids['2031-05'], 'admin', 'كتاب 5');
  });

  it('الدورة الاستثنائية: الفرق عن شهرها فقط لموظفيها، وما يتكرر بالعادية التالية', async () => {
    // موظف جديد فاته شهر أيار: يُضاف بأثر رجعي ثم دورة استثنائية لأيار
    const [c] = await db.insert(schema.employees).values({ fullName: 'موظف C ' + tag, companyNumber: tag + 'C', grade: 7, step: 1, status: 'مستمر', serviceType: service,
      educationLevel: deg2.name, familyMode: 'لا يستحق', department: 'قسم', firstAppointmentDate: '2031-05-01' }).returning();
    await expect(per.openPeriod(db, schema, { categoryId: catId, year: 2031, month: 5, user: 'writer1', kind: 'استثنائية', employeeIds: [c.id] })).rejects.toThrow('سبب');
    const ex = await per.openPeriod(db, schema, { categoryId: catId, year: 2031, month: 5, user: 'writer1', kind: 'استثنائية', employeeIds: [c.id], notes: 'تعيين فات الكشف' });
    const r = await per.computeRun(db, schema, ex.id, 'writer1', ELIG);
    expect(Number(r.totals.net)).toBeGreaterThan(296000);
    await per.approvePeriod(db, schema, ex.id, 'admin', ELIG);
    await per.issuePeriod(db, schema, ex.id, 'admin', 'كتاب استثنائي');
    const jun = await run('2031-06', false);
    expect((await retroLines(jun.runId, c.id)).filter(d => d.oy === '2031/05')).toEqual([]);
    const lines = rows(await db.execute(sql`SELECT count(*)::int n FROM payroll_lines WHERE run_id = ${jun.runId} AND employee_id = ${c.id} AND kind = 'nominal'`))[0].n;
    expect(lines).toBeGreaterThan(0);
    await per.approvePeriod(db, schema, jun.periodId, 'admin', ELIG);
    await per.issuePeriod(db, schema, jun.periodId, 'admin', 'كتاب 6');
  });

  it('حالتا 11 و12: الحساب المصرفي بمُعتمِد ثانٍ، والمستخدم ما يعتمد على حسابه، وكشف المصرف من الحساب النافذ', async () => {
    const [u] = rows(await db.execute(sql`INSERT INTO users (username, password, role, employee_id) VALUES (${'u' + tag}, 'x', 'admin', ${empA}) RETURNING id, username`));
    await expect(pend.submit(db, schema, 'bank_account', { employee_id: empA, bank_name: 'الرافدين', account_number: '1234567890', valid_from: '2031-01-01' }, u.username)).rejects.toThrow('سجلك المالي');
    const s1 = await pend.submit(db, schema, 'bank_account', { employee_id: empA, bank_name: 'الرافدين', account_number: '1234567890', valid_from: '2031-01-01' }, 'writer1');
    expect(s1.applied).toBe(false);
    await expect(pend.decide(db, schema, s1.pending.id, 'approve', u.username)).rejects.toThrow('سجلك المالي');
    // قبل الاعتماد ما في حساب ⇒ الموظف بورقة «بلا حساب»
    const before = await rep.statementData(db, pids['2031-06'], 'bank');
    expect(before.sheets.some((x: any) => x.name === 'بلا حساب مصرفي')).toBe(true);
    await pend.decide(db, schema, s1.pending.id, 'approve', 'admin');
    // الكشف المُصدَر قبل إضافة الحساب يبقى مطابقاً لأصله (الحساب ما كان معروفاً يوم الإصدار)
    const after = await rep.statementData(db, pids['2031-06'], 'bank');
    expect(JSON.stringify(after.sheets)).toBe(JSON.stringify(before.sheets));
  });

  it('رفض المصرف ⇒ يرجع الصافي المرفوض «مستحقاً غير مصروف» بالفترة التالية مرة واحدة', async () => {
    const [p6] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, pids['2031-06']));
    const net = Number(rows(await db.execute(sql`SELECT net::text n FROM payroll_results WHERE run_id = ${p6.currentRunId} AND employee_id = ${empA}`))[0].n);
    const s = await pend.submit(db, schema, 'bank_rejection', { run_id: p6.currentRunId, employee_id: empA, reason: 'حساب مغلق' }, 'writer1');
    await pend.decide(db, schema, s.pending.id, 'approve', 'admin');
    const jul = await run('2031-07');
    const carry = Number(rows(await db.execute(sql`SELECT coalesce(sum(amount), 0)::text v FROM payroll_lines WHERE run_id = ${jul.runId} AND employee_id = ${empA} AND kind = 'unpaid_carry'`))[0].v);
    expect(carry).toBe(net);
    // كشف المصرف للفترة المُصدَرة بعد إضافة الحساب يحمل الحساب
    const bank = await rep.statementData(db, jul.periodId, 'bank');
    expect(JSON.stringify(bank.sheets[0].rows)).toContain('1234567890');
    const aug = await run('2031-08', false);
    expect(Number(rows(await db.execute(sql`SELECT count(*)::int n FROM payroll_lines WHERE run_id = ${aug.runId} AND employee_id = ${empA} AND kind = 'unpaid_carry'`))[0].n)).toBe(0);
  });

  it('مراجعة H1: الدورة الاستثنائية لشهر معتمد غير مُصدَر مرفوضة', async () => {
    const aug = pids['2031-08'];
    await per.approvePeriod(db, schema, aug, 'admin', ELIG);
    await expect(per.openPeriod(db, schema, { categoryId: catId, year: 2031, month: 8, user: 'writer1', kind: 'استثنائية', employeeIds: [empA], notes: 'x' })).rejects.toThrow('مُصدَرة');
    await per.issuePeriod(db, schema, aug, 'admin', 'كتاب 8');
  });

  it('مراجعة H2: إجازة بدون راتب كانت معلقة عند الاعتماد ثم اعتُمدت ⇒ فرق رجعي سالب بالفترة التالية', async () => {
    const [ut] = await db.insert(schema.leaveTypes).values({ name: 'بدون راتب ' + tag, salaryPaymentType: 'بدون_راتب' }).returning();
    const [lr] = await db.insert(schema.leaveRequests).values({ employeeId: empB, leaveType: ut.name, leaveTypeId: ut.id, startDate: '2031-09-01', endDate: '2031-09-10', daysCount: 10, status: 'معلق' }).returning();
    await run('2031-09');
    await db.execute(sql`UPDATE leave_requests SET status = 'معتمد' WHERE id = ${lr.id}`);
    const oct = await run('2031-10', false);
    const d = await retroLines(oct.runId, empB);
    const nominal = d.find(x => x.item_code === 'NOMINAL' && x.oy === '2031/09');
    expect(nominal).toBeTruthy();
    expect(Math.round(Number(nominal!.a))).toBe(-Math.round(296000 * 10 / 30));
  });
});
