// B8a0: السجل المؤرخ بزمنين، والسلّم المقفل، وسجل التدقيق — اختبار على PostgreSQL حقيقية (HR_TEST_DB=1).
import { describe, it, expect, beforeAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('B8a0 على قاعدة حقيقية', () => {
  let db: any; let schema: any; let cm: any; let empId: number;
  const rows = (r: any) => (r.rows ?? r) as any[];

  beforeAll(async () => {
    const mod = await import('../src/db/index.ts');
    db = mod.db; schema = mod.schema;
    cm = await import('./careerMovements.ts');
    const [e] = await db.insert(schema.employees).values({
      fullName: 'اختبار B8a0', companyNumber: 'B8A0-' + Date.now(), grade: 7, step: 1,
      gradeDate: '2021-03-01', currentAppointmentDate: '2019-02-01', educationLevel: 'إعدادية',
      workLocation: 'الموقع أ', jobTitle: 'مبرمج', status: 'مستمر', maritalStatus: 'أعزب',
    }).returning();
    empId = e.id;
  });

  const history = async (field: string) => rows(await db.execute(sql`
    SELECT id, value, valid_from::text vf, source, supersedes_id FROM employee_field_history
    WHERE employee_id = ${empId} AND field = ${field} ORDER BY id`));
  const timeline = async (field: string) => rows(await db.execute(sql`
    SELECT value, valid_from::text vf, valid_to::text vt FROM employee_field_timeline
    WHERE employee_id = ${empId} AND field = ${field} ORDER BY valid_from NULLS FIRST, id`));

  it('إنشاء الموظف ما يكتب سجلاً (حتى يبقى الحذف ممكناً لخطأ الإدخال)، والقراءة ترجع القيمة الحالية أساساً', async () => {
    expect(await history('grade')).toHaveLength(0);
    const r = await cm.fieldsAsOf(db, { employeeIds: [empId], fields: ['grade'], day: '2024-01-01' });
    expect(r.get(empId).get('grade')).toMatchObject({ value: 7, virtual: true });
  });

  it('التصحيح بلا صف حي يحفظ القيمة القديمة أساساً ثم يستبدلها (لا مقطع وهمي)', async () => {
    const before = new Date();
    await new Promise(r => setTimeout(r, 20));
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT set_config('hr.correction', '1', true), set_config('hr.reason', 'خطأ إدخال', true)`);
      await tx.update(schema.employees).set({ educationLevel: 'بكالوريوس' }).where(eq(schema.employees.id, empId));
    });
    const h = await history('education_level');
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ value: 'إعدادية', vf: null, source: 'تقديري' });
    expect(h[1]).toMatchObject({ value: 'بكالوريوس', vf: null, source: 'تصحيح', supersedes_id: h[0].id });
    expect(await timeline('education_level')).toEqual([{ value: 'بكالوريوس', vf: null, vt: null }]);

    // كما كان معروفاً قبل التصحيح: القيمة القديمة؛ والآن: المصححة
    const old = await cm.fieldsAsOf(db, { employeeIds: [empId], fields: ['education_level'], day: '2024-01-01', knownAt: before });
    expect(old.get(empId).get('education_level').value).toBe('إعدادية');
    const now = await cm.fieldsAsOf(db, { employeeIds: [empId], fields: ['education_level'], day: '2024-01-01' });
    expect(now.get(empId).get('education_level').value).toBe('بكالوريوس');
  });

  it('التصحيح يقتصر على الحقول المسمّاة؛ الحالة بنفس الحفظ تُسجَّل تغييراً عادياً', async () => {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT set_config('hr.correction', '1', true), set_config('hr.correction_fields', 'grade', true), set_config('hr.reason', 'خطأ', true)`);
      await tx.update(schema.employees).set({ grade: 8, status: 'منسب', statusOrderDate: '2026-10-01' }).where(eq(schema.employees.id, empId));
    });
    const g = await history('grade');
    expect(g[g.length - 1]).toMatchObject({ value: 8, source: 'تصحيح' });
    const st = await history('status');
    expect(st[st.length - 1]).toMatchObject({ value: 'منسب', vf: '2026-10-01', source: 'تعديل مباشر' });
    await db.update(schema.employees).set({ status: 'مستمر', statusOrderDate: '2026-10-02' }).where(eq(schema.employees.id, empId));
  });

  it('تاريخ النفاذ الممرَّر من الكود يؤرخ التغيير بدل يوم الإدخال', async () => {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT set_config('hr.effective_date', '2025-05-01', true)`);
      await tx.update(schema.employees).set({ workLocation: 'الموقع ب' }).where(eq(schema.employees.id, empId));
    });
    expect(await timeline('work_location')).toEqual([
      { value: 'الموقع أ', vf: null, vt: '2025-04-30' },
      { value: 'الموقع ب', vf: '2025-05-01', vt: null },
    ]);
    const asOf = await cm.fieldsAsOf(db, { employeeIds: [empId], fields: ['work_location'], day: '2025-04-30' });
    expect(asOf.get(empId).get('work_location').value).toBe('الموقع أ');
  });

  it('إعادة التسمية الجماعية ما تكتب بالسجل', async () => {
    const n = (await history('job_title')).length;
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT set_config('hr.skip_history', '1', true)`);
      await tx.update(schema.employees).set({ jobTitle: 'مبرمج أول (اسم جديد)' }).where(eq(schema.employees.id, empId));
    });
    expect((await history('job_title')).length).toBe(n);
  });

  it('الأمر الملغى يسقط صفوفه فقط لما كان الإلغاء معروفاً', async () => {
    const [order] = await db.insert(schema.administrativeOrders).values({ orderNumber: 'B8A0-' + Date.now(), orderDate: '2026-01-01' }).returning();
    await cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2026-01-01', changes: { marital_status: 'متزوج' }, orderId: order.id, source: 'أمر' }, { today: '2026-11-10' });
    await new Promise(r => setTimeout(r, 20));
    const beforeCancel = new Date();
    await new Promise(r => setTimeout(r, 20));
    await db.insert(schema.administrativeOrders).values({ orderNumber: 'B8A0-C-' + Date.now(), orderDate: '2026-02-01', cancelsOrderId: order.id });
    const then = await cm.fieldsAsOf(db, { employeeIds: [empId], fields: ['marital_status'], day: '2026-06-01', knownAt: beforeCancel });
    expect(then.get(empId).get('marital_status').value).toBe('متزوج');
    const now = await cm.fieldsAsOf(db, { employeeIds: [empId], fields: ['marital_status'], day: '2026-06-01' });
    expect(now.get(empId).get('marital_status').value).toBe('أعزب');
  });

  it('حقل بلا سجل يرجع قيمة العمود أساساً افتراضياً', async () => {
    const r = await cm.fieldsAsOf(db, { employeeIds: [empId], fields: ['contract_type'], day: '2026-01-01' });
    expect(r.get(empId).get('contract_type')).toMatchObject({ value: null, virtual: true });
  });

  it('خانات الإصدار المعتمد مقفلة، وتاريخ نفاذه ما يتعدل', async () => {
    const [v] = rows(await db.execute(sql`SELECT id FROM salary_scale_versions WHERE status = 'معتمد' LIMIT 1`));
    await expect(db.execute(sql`UPDATE salary_scale SET amount = amount + 1 WHERE version_id = ${v.id} AND grade = 10 AND step = 1`)).rejects.toThrow();
    await expect(db.execute(sql`INSERT INTO salary_scale (version_id, grade, step, amount) VALUES (${v.id}, 13, 11, 1)`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE salary_scale_versions SET effective_from = '2000-01-01' WHERE id = ${v.id}`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM salary_scale_versions WHERE id = ${v.id}`)).rejects.toThrow();
  });

  it('السلّم النافذ يُختار بالتاريخ بين الإصدارات المعتمدة', async () => {
    const svc = await import('./salaryScaleService.ts');
    expect(await svc.scaleVersionForDate(db, '2000-01-01')).toBeNull();
    const v = await svc.scaleVersionForDate(db, '2026-11-10');
    expect(v?.effectiveFrom).toBe('2008-05-12');
  });

  it('تغييرات المستخدمين تُسجَّل بسجل إلحاقي', async () => {
    const uname = 'b8a0_' + Date.now();
    const [u] = await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT set_config('hr.user', 'tester', true)`);
      return tx.insert(schema.users).values({ username: uname, password: 'x', role: 'user' }).returning();
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, u.id));
    await db.update(schema.users).set({ name: 'بلا أثر بالتدقيق' }).where(eq(schema.users.id, u.id));
    const a = rows(await db.execute(sql`SELECT actor, action, before, after FROM payroll_audit WHERE entity = 'users' AND entity_id = ${String(u.id)} ORDER BY id`));
    expect(a.map(x => x.action)).toEqual(['إنشاء مستخدم', 'تعديل مستخدم']);
    expect(a[0].actor).toBe('tester');
    expect(a[0].after.password).toBeUndefined();
    expect(a[1].after.role).toBe('admin');
    await expect(db.execute(sql`DELETE FROM payroll_audit WHERE entity_id = ${String(u.id)}`)).rejects.toThrow();
    await db.delete(schema.users).where(eq(schema.users.id, u.id));
  });
});
