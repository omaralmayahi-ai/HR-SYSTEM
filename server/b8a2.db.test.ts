// B8a2: المحمّل يقرأ «كما كان معروفاً» بلحظة knownAt (مراجعة M2، M3) — على PostgreSQL حقيقية (HR_TEST_DB=1).
import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('B8a2 المحمّل على قاعدة حقيقية', () => {
  let db: any; let schema: any; let loader: any; let catId: number;
  const rows = (r: any) => (r.rows ?? r) as any[];
  beforeAll(async () => {
    const mod = await import('../src/db/index.ts');
    db = mod.db; schema = mod.schema;
    loader = await import('./payroll/loader.ts');
    catId = rows(await db.execute(sql`SELECT id FROM payroll_categories WHERE code = 'PERM'`))[0].id;
  });

  it('موظف أُضيف بعد knownAt ما يظهر، وحقيقة عائلة بلا أمر بعد knownAt ما تُقرأ', async () => {
    const before = new Date(Date.now() - 1000);
    const [e] = await db.insert(schema.employees).values({ fullName: 'اختبار B8a2', companyNumber: 'B8A2-' + Date.now(), grade: 7, step: 1, status: 'مستمر', serviceType: 'دائم' }).returning();
    const [m] = await db.insert(schema.familyMembers).values({ employeeId: e.id, relation: 'ابن', name: 'س', birthDate: '2006-01-01', createdBy: 't' }).returning();
    await db.insert(schema.familyMemberFacts).values({ memberId: m.id, fact: 'يدرس', value: true, validFrom: null, source: 'تقديري', reason: 'اختبار', recordedBy: 't' });
    const opts = { year: 2026, month: 3, categoryId: catId, eligibleStatuses: ['مستمر'], employeeIds: [e.id] };
    expect((await loader.loadPeriodInputs(db, { ...opts, knownAt: before })).employees).toHaveLength(0);
    const now = await loader.loadPeriodInputs(db, { ...opts, knownAt: new Date(Date.now() + 1000) });
    expect(now.employees[0].family.facts).toHaveLength(1);
    // عائلة معروفة الآن، لكن الحقيقة اللي سجلت بعد لحظة سابقة لا تُقرأ لها حتى لو مصدرها «تقديري»
    const mid = new Date(rows(await db.execute(sql`SELECT created_at FROM family_members WHERE id = ${m.id}`))[0].created_at);
    await db.execute(sql`UPDATE employees SET created_at = created_at - interval '1 day' WHERE id = ${e.id}`);
    await db.execute(sql`ALTER TABLE family_members DISABLE TRIGGER USER`);
    await db.execute(sql`UPDATE family_members SET created_at = created_at - interval '1 day' WHERE id = ${m.id}`);
    await db.execute(sql`ALTER TABLE family_members ENABLE TRIGGER USER`);
    const atMember = await loader.loadPeriodInputs(db, { ...opts, knownAt: new Date(mid.getTime() - 500) });
    expect(atMember.employees[0].family.members).toHaveLength(1);
    expect(atMember.employees[0].family.facts).toHaveLength(0);
  });

  it('القراءة بالتتابع داخل معاملة تعطي نفس النتيجة', async () => {
    const opts = { year: 2026, month: 3, categoryId: catId, eligibleStatuses: ['مستمر'] };
    const a = await loader.loadPeriodInputs(db, opts);
    const b = await db.transaction(async (tx: any) => loader.loadPeriodInputs(tx, { ...opts, sequential: true }), { isolationLevel: 'repeatable read', accessMode: 'read only' });
    expect(b.employees.length).toBe(a.employees.length);
  });
});
