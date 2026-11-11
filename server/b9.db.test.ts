// B9: حماية الأدوار وسجل التدقيق الإلحاقي — PostgreSQL حقيقية (HR_TEST_DB=1).
import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('B9 على قاعدة حقيقية', () => {
  let db: any; let schema: any;
  beforeAll(async () => { const m = await import('../src/db/index.ts'); db = m.db; schema = m.schema; });

  it('دور المدير ما يُسحب منه إدارة المستخدمين ولا يُحذف، والأدوار النظامية ما تُحذف', async () => {
    await expect(db.execute(sql`UPDATE roles SET permissions = ARRAY['payroll.view'] WHERE name = 'admin'`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE roles SET base = 'user' WHERE name = 'admin'`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM roles WHERE name = 'user'`)).rejects.toThrow();
  });
  it('تعديل الأدوار مسجّل، وسجل التدقيق ما يُعدَّل ولا يُحذف', async () => {
    const name = 'r' + Date.now();
    await db.insert(schema.roles).values({ name, label: 'تجربة', base: 'user', permissions: ['payroll.view'] });
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int n FROM payroll_audit WHERE entity = 'roles' AND entity_id = ${name}`)).rows;
    expect(n).toBe(1);
    // داخل معاملة تُلغى حتى ما يبقى صف دائم بالسجل الإلحاقي (مراجعة L6)
    const attempt = async (stmt: (id: number) => any) => {
      let msg = '';
      try {
        await db.transaction(async (tx: any) => {
          const [row] = await tx.insert(schema.requestAudit).values({ method: 'POST', path: '/api/test', status: 200 }).returning();
          await tx.execute(stmt(row.id));
        });
      } catch (e: any) { msg = String(e?.cause?.message || e?.message); }
      return msg;
    };
    expect(await attempt(id => sql`UPDATE request_audit SET status = 500 WHERE id = ${id}`)).toContain('إلحاقي');
    expect(await attempt(id => sql`DELETE FROM request_audit WHERE id = ${id}`)).toContain('إلحاقي');
    await db.delete(schema.roles).where(sql`name = ${name}`);
  });
});
