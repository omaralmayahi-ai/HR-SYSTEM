// اختبار تكامل على PostgreSQL حقيقية؛ يعمل فقط مع HR_TEST_DB=1 ومتغيرات SQL_* لقاعدة اختبار.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('careerMovements على قاعدة حقيقية (B4b)', () => {
  let db: any; let schema: any; let cm: any; let pool: any; let empId: number;
  const TODAY = '2026-11-10';

  beforeAll(async () => {
    const mod = await import('../src/db/index.ts');
    db = mod.db; schema = mod.schema; pool = mod.pool;
    cm = await import('./careerMovements.ts');
    const [e] = await db.insert(schema.employees).values({
      fullName: 'اختبار السجل المؤرخ', companyNumber: 'HIST-' + Date.now(), grade: 5, step: 2,
      gradeDate: '2020-01-01', lastIncrementDate: '2025-03-01', jobTitle: 'مهندس', status: 'مستمر',
    }).returning();
    empId = e.id;
  });


  const emp = async () => (await db.select().from(schema.employees).where(eq(schema.employees.id, empId)))[0];

  it('أول حركة تحفظ سجل أساس بالتاريخ المعروف وتحدّث الموظف', async () => {
    const r = await cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2025-01-01', changes: { grade: 6 }, source: 'تعديل مباشر' }, { today: TODAY });
    expect(r.inserted).toHaveLength(2);
    expect(r.inserted[0]).toMatchObject({ source: 'تقديري', validFrom: '2020-01-01', value: 5 });
    expect((await emp()).grade).toBe(6);
  });

  it('الحركة الرجعية ما تمسح تغييراً أحدث', async () => {
    await cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2024-06-01', changes: { grade: 7 }, source: 'تعديل مباشر' }, { today: TODAY });
    expect((await emp()).grade).toBe(6);
    expect(Object.fromEntries((await cm.valuesAsOf(db, empId, ['grade'], '2024-07-01')))).toEqual({ grade: 7 });
    expect(Object.fromEntries((await cm.valuesAsOf(db, empId, ['grade'], '2023-01-01')))).toEqual({ grade: 5 });
    const tl = await db.execute(sql`SELECT value, valid_from::text vf, valid_to::text vt FROM employee_field_timeline WHERE employee_id=${empId} AND field='grade' ORDER BY valid_from NULLS FIRST`);
    expect(tl.rows.map((r: any) => [r.value, r.vf, r.vt])).toEqual([[5, '2020-01-01', '2024-05-31'], [7, '2024-06-01', '2024-12-31'], [6, '2025-01-01', null]]);
  });

  it('الحركة المستقبلية تنتظر تاريخها ثم تُطبَّق', async () => {
    const r = await cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2027-03-01', changes: { step: 3 }, source: 'تعديل مباشر' }, { today: TODAY });
    expect(r.pending).toEqual(['step']);
    expect((await emp()).step).toBe(2);
    await cm.applyDueMovements(db, schema, { today: '2027-02-28', since: TODAY });
    expect((await emp()).step).toBe(2);
    const due = await cm.applyDueMovements(db, schema, { today: '2027-03-01', since: '2027-02-28' });
    expect(due.fieldsChanged).toBeGreaterThanOrEqual(1);
    expect((await emp()).step).toBe(3);
  });

  it('إلغاء الأمر يرجّع القيمة السابقة', async () => {
    const [order] = await db.insert(schema.administrativeOrders).values({ orderNumber: 'T-' + Date.now(), orderDate: '2026-01-05' }).returning();
    await cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2026-01-05', changes: { job_title: 'رئيس مهندسين' }, orderId: order.id, source: 'أمر' }, { today: TODAY });
    expect((await emp()).jobTitle).toBe('رئيس مهندسين');
    await db.insert(schema.administrativeOrders).values({ orderNumber: 'C-' + Date.now(), orderDate: '2026-02-01', cancelsOrderId: order.id });
    await db.transaction((tx: any) => cm.rebuildEmployeeFields(tx, schema, empId, ['job_title'], TODAY));
    expect((await emp()).jobTitle).toBe('مهندس');
    await expect(cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2026-03-01', changes: { job_title: 'x' }, orderId: order.id, source: 'أمر' }, { today: TODAY }))
      .rejects.toThrow('ملغى');
  });

  it('السجل إلحاقي فقط', async () => {
    await expect(db.execute(sql`UPDATE employee_field_history SET reason='x' WHERE employee_id=${empId}`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM employee_field_history WHERE employee_id=${empId}`)).rejects.toThrow();
  });

  it('يرفض حقلاً غير متتبع وقيمة غير صالحة وتاريخاً خاطئاً', async () => {
    await expect(cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2026-01-01', changes: { salary: 1 }, source: 'تعديل مباشر' })).rejects.toThrow('غير متتبع');
    await expect(cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2026-01-01', changes: { grade: 14 }, source: 'تعديل مباشر' })).rejects.toThrow('غير صالحة');
    await expect(cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2026-02-30', changes: { grade: 4 }, source: 'تعديل مباشر' })).rejects.toThrow('YYYY-MM-DD');
  });
});

describe.skipIf(!enabled)('التقاط التغييرات المباشرة بمشغّل القاعدة (B4c)', () => {
  let db: any; let schema: any; let cm: any; let empId: number;
  beforeAll(async () => {
    const mod = await import('../src/db/index.ts');
    db = mod.db; schema = mod.schema;
    cm = await import('./careerMovements.ts');
    const [e] = await db.insert(schema.employees).values({
      fullName: 'اختبار الالتقاط', companyNumber: 'CAP-' + Date.now(), grade: 4, step: 5,
      gradeDate: '2021-02-01', lastPromotionDate: '2021-02-01', lastIncrementDate: '2025-02-01', status: 'مستمر', department: 'الحسابات',
    }).returning();
    empId = e.id;
  });
  const rows = async (field: string) => (await db.execute(sql`SELECT value, valid_from::text vf, source, order_id, reason FROM employee_field_history WHERE employee_id=${empId} AND field=${field} ORDER BY id`)).rows;

  it('ترفيع مباشر: سجل أساس + حركة بتاريخ آخر ترفيع الجديد', async () => {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT set_config('hr.reason', 'اختبار', true)`);
      await tx.update(schema.employees).set({ grade: 5, step: 1, lastPromotionDate: '2025-02-01' }).where(eq(schema.employees.id, empId));
    });
    expect(await rows('grade')).toEqual([
      { value: 4, vf: '2021-02-01', source: 'تقديري', order_id: null, reason: 'سجل أساس تقديري (ق-4)' },
      { value: 5, vf: '2025-02-01', source: 'تعديل مباشر', order_id: null, reason: 'اختبار' },
    ]);
    expect((await rows('step')).map((r: any) => [r.value, r.vf])).toEqual([[5, null], [1, '2025-02-01']]);
    expect(await rows('event')).toHaveLength(0); // الدرجة تغيّرت فما يُسجَّل حدث
  });

  it('تغيير الحالة مع رقم أمر ينشئ أمراً إدارياً ويربطه', async () => {
    const num = 'ST-' + Date.now();
    await db.update(schema.employees).set({ status: 'منسب', statusOrderNumber: num, statusOrderDate: '2026-10-01' }).where(eq(schema.employees.id, empId));
    const st = await rows('status');
    expect(st[st.length - 1]).toMatchObject({ value: 'منسب', vf: '2026-10-01', source: 'أمر' });
    const [o] = await db.select().from(schema.administrativeOrders).where(eq(schema.administrativeOrders.orderNumber, num));
    expect(o).toMatchObject({ orderDate: '2026-10-01', orderKind: 'تغيير حالة' });
    expect(st[st.length - 1].order_id).toBe(o.id);
  });

  it('تسوية تاريخ آخر ترفيع بلا تغيير درجة = حدث', async () => {
    await db.update(schema.employees).set({ lastPromotionDate: '2025-06-01' }).where(eq(schema.employees.id, empId));
    expect((await rows('event')).map((r: any) => r.vf)).toEqual(['2025-06-01']);
  });

  it('حقل غير متتبع ما يسجّل شي، وapplyMovement ما يتكرر', async () => {
    const before = (await db.execute(sql`SELECT count(*)::int n FROM employee_field_history WHERE employee_id=${empId}`)).rows[0].n;
    await db.update(schema.employees).set({ phone: '0770' }).where(eq(schema.employees.id, empId));
    await cm.applyMovement(db, schema, { employeeId: empId, effectiveDate: '2026-01-01', changes: { department: 'الأفراد' }, source: 'تعديل مباشر' });
    const after = (await db.execute(sql`SELECT count(*)::int n FROM employee_field_history WHERE employee_id=${empId}`)).rows[0].n;
    expect(after - before).toBe(2); // أساس + حركة القسم فقط، بلا تكرار من المشغّل
  });
});

afterAll(async () => {
  if (!enabled) return;
  const mod = await import('../src/db/index.ts');
  await (mod as any).pool?.end?.();
});
