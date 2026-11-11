// B8a1: البنود ونسخها، الإسناد، العائلة، والاعتماد الثاني — على PostgreSQL حقيقية (HR_TEST_DB=1).
import { describe, it, expect, beforeAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('B8a1 على قاعدة حقيقية', () => {
  let db: any; let schema: any; let pend: any; let empId: number; let unionId: number; let loanId: number; let posId: number;
  const rows = (r: any) => (r.rows ?? r) as any[];
  const order = (n: string, d = '2026-01-01') => ({ order_number: `${n}-${Date.now()}`, order_date: d });

  beforeAll(async () => {
    const mod = await import('../src/db/index.ts');
    db = mod.db; schema = mod.schema;
    pend = await import('./payroll/pending.ts');
    const [e] = await db.insert(schema.employees).values({ fullName: 'اختبار B8a1', companyNumber: 'B8A1-' + Date.now(), grade: 7, step: 1, status: 'مستمر', serviceType: 'دائم' }).returning();
    empId = e.id;
    const id = async (code: string) => rows(await db.execute(sql`SELECT id FROM pay_items WHERE code = ${code}`))[0].id;
    unionId = await id('UNION'); loanId = await id('LOAN'); posId = await id('POSITION');
  });

  it('الإسناد معلّق بلا أثر حتى يعتمده مستخدم آخر، والمُدخل ما يعتمد لنفسه', async () => {
    const r = await pend.submit(db, schema, 'assignment', { employee_id: empId, item_id: unionId, kind: 'منح', value_kind: 'مبلغ', value: 5000, valid_from: '2026-01-01', reason: 'اشتراك', order: order('U') }, 'writer1');
    expect(r.applied).toBe(false);
    expect(rows(await db.execute(sql`SELECT * FROM employee_pay_assignments WHERE employee_id = ${empId}`))).toHaveLength(0);
    await expect(pend.decide(db, schema, r.pending.id, 'approve', 'writer1')).rejects.toThrow('أدخلتها');
    const ok = await pend.decide(db, schema, r.pending.id, 'approve', 'admin');
    expect(ok.state).toBe('معتمد');
    expect(rows(await db.execute(sql`SELECT value FROM employee_pay_assignments WHERE employee_id = ${empId} AND superseded_at IS NULL`))[0].value).toBe('5000.000000');
  });

  it('إسناد لاحق يقسّم السابق عند الاعتماد (لا تداخل)، والأقساط تقبل التعدد', async () => {
    const r = await pend.submit(db, schema, 'assignment', { employee_id: empId, item_id: unionId, kind: 'تعديل', value_kind: 'مبلغ', value: 7000, valid_from: '2026-07-01', reason: 'زيادة', order: order('U2') }, 'writer1');
    await pend.decide(db, schema, r.pending.id, 'approve', 'admin');
    const live = rows(await db.execute(sql`SELECT value, valid_from::text vf, valid_to::text vt FROM employee_pay_assignments WHERE employee_id = ${empId} AND item_id = ${unionId} AND superseded_at IS NULL ORDER BY valid_from`));
    expect(live).toEqual([{ value: '5000.000000', vf: '2026-01-01', vt: '2026-06-30' }, { value: '7000.000000', vf: '2026-07-01', vt: null }]);
    for (const n of ['L1', 'L2']) {
      const l = await pend.submit(db, schema, 'assignment', { employee_id: empId, item_id: loanId, kind: 'منح', principal: 600000, installments_count: 6, valid_from: '2026-02-01', reason: 'سلفة', order: order(n) }, 'writer1');
      await pend.decide(db, schema, l.pending.id, 'approve', 'admin');
    }
    expect(rows(await db.execute(sql`SELECT count(*)::int n FROM employee_pay_assignments WHERE employee_id = ${empId} AND item_id = ${loanId} AND superseded_at IS NULL`))[0].n).toBe(2);
  });

  it('قيد منع التداخل بالقاعدة نفسها، والصف المعتمد ما يتعدل', async () => {
    const [a] = rows(await db.execute(sql`SELECT * FROM employee_pay_assignments WHERE employee_id = ${empId} AND item_id = ${unionId} AND superseded_at IS NULL LIMIT 1`));
    await expect(db.execute(sql`INSERT INTO employee_pay_assignments (employee_id, item_id, kind, value, valid_from, order_id, reason)
      VALUES (${empId}, ${unionId}, 'منح', 1, '2026-03-01', ${a.order_id}, 'x')`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE employee_pay_assignments SET value = 1 WHERE id = ${a.id}`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM employee_pay_assignments WHERE id = ${a.id}`)).rejects.toThrow();
  });

  it('العملية ترفض إذا تغيّر هدفها بعد الإدخال', async () => {
    const r1 = await pend.submit(db, schema, 'assignment', { employee_id: empId, item_id: unionId, kind: 'تعديل', value_kind: 'مبلغ', value: 8000, valid_from: '2026-09-01', reason: 'أ', order: order('U3') }, 'writer1');
    const r2 = await pend.submit(db, schema, 'assignment', { employee_id: empId, item_id: unionId, kind: 'تعديل', value_kind: 'مبلغ', value: 9000, valid_from: '2026-10-01', reason: 'ب', order: order('U4') }, 'writer1');
    await pend.decide(db, schema, r1.pending.id, 'approve', 'admin');
    await expect(pend.decide(db, schema, r2.pending.id, 'approve', 'admin')).rejects.toThrow('تغيّر');
  });

  it('تفعيل بند يرفض قيمة «يُتحقق» وبند داخل السقف بلا أولوية تخفيض', async () => {
    const [cur] = rows(await db.execute(sql`SELECT props FROM pay_item_versions WHERE item_id = ${posId} AND superseded_at IS NULL ORDER BY valid_from DESC LIMIT 1`));
    const [ref] = rows(await db.execute(sql`SELECT id FROM responsibility_allowances ORDER BY id LIMIT 1`));
    const props = { ...cur.props, status: 'فعّال', levels: ref ? [{ ref_id: ref.id, label: 'x', value: 20 }] : [] };
    const r = await pend.submit(db, schema, 'item_version', { item_id: posId, valid_from: '2026-02-01', props, order: order('P', '2026-01-20') }, 'writer1');
    await expect(pend.decide(db, schema, r.pending.id, 'approve', 'admin')).rejects.toThrow(/يُتحقق|أولوية/);
  });

  it('تعديل مسودة بند ما فُعّل يُطبَّق مباشرة ويستبدل النسخة', async () => {
    const [cur] = rows(await db.execute(sql`SELECT id, props, valid_from::text vf FROM pay_item_versions WHERE item_id = ${posId} AND superseded_at IS NULL ORDER BY valid_from DESC LIMIT 1`));
    const r = await pend.submit(db, schema, 'item_version', { item_id: posId, valid_from: cur.vf, props: { ...cur.props, notes: 'تعديل مسودة' } }, 'writer1');
    expect(r.applied).toBe(true);
    const [now] = rows(await db.execute(sql`SELECT props->>'notes' n FROM pay_item_versions WHERE item_id = ${posId} AND superseded_at IS NULL ORDER BY valid_from DESC LIMIT 1`));
    expect(now.n).toBe('تعديل مسودة');
  });

  it('العائلة: إضافة فرد ونمط الاستحقاق بعد الاعتماد فقط، والنمط حركة مؤرخة', async () => {
    const m = await pend.submit(db, schema, 'family_member', { employee_id: empId, relation: 'بنت', name: 'بنت اختبار', birth_date: '2004-01-01', facts: [{ fact: 'متزوج', value: false }] }, 'writer1');
    expect(rows(await db.execute(sql`SELECT * FROM family_members WHERE employee_id = ${empId}`))).toHaveLength(0);
    await pend.decide(db, schema, m.pending.id, 'approve', 'admin');
    const [mem] = rows(await db.execute(sql`SELECT id FROM family_members WHERE employee_id = ${empId}`));
    expect(rows(await db.execute(sql`SELECT fact, value FROM family_member_facts WHERE member_id = ${mem.id}`))).toEqual([{ fact: 'متزوج', value: false }]);
    const md = await pend.submit(db, schema, 'family_mode', { employee_id: empId, mode: 'كامل', effective_date: '2026-01-01' }, 'writer1');
    await pend.decide(db, schema, md.pending.id, 'approve', 'admin');
    const [e] = rows(await db.execute(sql`SELECT family_mode FROM employees WHERE id = ${empId}`));
    expect(e.family_mode).toBe('كامل');
    expect(rows(await db.execute(sql`SELECT valid_from::text vf FROM employee_field_history WHERE employee_id = ${empId} AND field = 'family_mode' AND source <> 'تقديري'`))[0].vf).toBe('2026-01-01');
    await expect(db.execute(sql`UPDATE family_member_facts SET value = 'true' WHERE member_id = ${mem.id}`)).rejects.toThrow();
  });

  it('فحص جودة البيانات يرجع كل الفحوص', async () => {
    const { dataQuality } = await import('./payroll/quality.ts');
    const q = await dataQuality(db, ['مستمر']);
    expect(q.checks.length).toBeGreaterThanOrEqual(12);
    expect(q.checks.every((c: any) => Number.isInteger(c.count))).toBe(true);
  });

  it('مدى جديد داخل القديم يترك طرفين، والإنهاء والإلغاء يعملان', async () => {
    const insId = rows(await db.execute(sql`SELECT id FROM pay_items WHERE code = 'INSURANCE'`))[0].id;
    const go = async (body: any) => { const r = await pend.submit(db, schema, 'assignment', { employee_id: empId, item_id: insId, reason: 'ت', order: order('I'), ...body }, 'writer1'); await pend.decide(db, schema, r.pending.id, 'approve', 'admin'); };
    await go({ kind: 'منح', value_kind: 'مبلغ', value: 1000, valid_from: '2026-01-01' });
    await go({ kind: 'تعديل', value_kind: 'مبلغ', value: 2000, valid_from: '2026-03-01', valid_to: '2026-04-30' });
    const live = rows(await db.execute(sql`SELECT id, value, valid_from::text vf, valid_to::text vt FROM employee_pay_assignments WHERE employee_id = ${empId} AND item_id = ${insId} AND superseded_at IS NULL ORDER BY valid_from`));
    expect(live.map(r => [r.value, r.vf, r.vt])).toEqual([['1000.000000', '2026-01-01', '2026-02-28'], ['2000.000000', '2026-03-01', '2026-04-30'], ['1000.000000', '2026-05-01', null]]);
    const last = live[2];
    const e = await pend.submit(db, schema, 'assignment_end', { assignment_id: last.id, end_date: '2026-08-31', reason: 'انتهى', order: order('E') }, 'writer1');
    await pend.decide(db, schema, e.pending.id, 'approve', 'admin');
    const ended = rows(await db.execute(sql`SELECT id, valid_to::text vt FROM employee_pay_assignments WHERE employee_id = ${empId} AND item_id = ${insId} AND superseded_at IS NULL AND valid_from = '2026-05-01'`));
    expect(ended[0].vt).toBe('2026-08-31');
    await expect(pend.submit(db, schema, 'assignment_end', { assignment_id: ended[0].id, end_date: '2026-12-31', reason: 'تمديد', order: order('E2') }, 'writer1')).rejects.toThrow('بعد نهاية');
    const c = await pend.submit(db, schema, 'assignment_end', { assignment_id: ended[0].id, end_date: '2026-01-01', reason: 'خطأ', order: order('C') }, 'writer1');
    await pend.decide(db, schema, c.pending.id, 'approve', 'admin');
    expect(rows(await db.execute(sql`SELECT 1 FROM employee_pay_assignments WHERE employee_id = ${empId} AND item_id = ${insId} AND superseded_at IS NULL AND valid_from = '2026-05-01'`))).toHaveLength(0);
  });

  it('حجب بند عام يمر بتنبيه يشوفه المعتمِد (ق-3)', async () => {
    const retId = rows(await db.execute(sql`SELECT id FROM pay_items WHERE code = 'RETIRE'`))[0].id;
    const r = await pend.submit(db, schema, 'assignment', { employee_id: empId, item_id: retId, kind: 'حجب', valid_from: '2026-01-01', reason: 'إعارة لجهة خارجية', order: order('W') }, 'writer1');
    expect(r.warnings.join()).toContain('بند عام');
    expect(r.pending.summary).toContain('⚠');
  });

  it('عمليتا عائلة على نفس الموظف: الثانية تُرفض بعد اعتماد الأولى', async () => {
    const a = await pend.submit(db, schema, 'family_member', { employee_id: empId, relation: 'ابن', name: 'أ', birth_date: '2015-01-01' }, 'writer1');
    const b = await pend.submit(db, schema, 'family_member', { employee_id: empId, relation: 'ابن', name: 'ب', birth_date: '2016-01-01' }, 'writer1');
    await pend.decide(db, schema, a.pending.id, 'approve', 'admin');
    await expect(pend.decide(db, schema, b.pending.id, 'approve', 'admin')).rejects.toThrow('تغيّر');
    await expect(pend.submit(db, schema, 'family_member', { employee_id: empId, relation: 'ابن', name: 'أ', birth_date: '2015-01-01' }, 'writer1')).rejects.toThrow('بنفس الاسم');
  });
});
