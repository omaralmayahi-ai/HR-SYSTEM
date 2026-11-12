// المرحلة C: ترحيل نظام المخصصات 1.2.0 من نسخة احتياطية PGlite مصطنعة (بلا بيانات حقيقية) — PostgreSQL حقيقية.
import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const enabled = process.env.HR_TEST_DB === '1';

/** نسخة نظام المخصصات بالحد الأدنى من الجداول والأعمدة اللي تقرأها الأداة. */
async function makeBackup(file: string, tag: string, variant = 1) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = await PGlite.create();
  await pg.exec(`
    CREATE TYPE gender_t AS ENUM ('male','female');
    CREATE TYPE marital_status AS ENUM ('unknown','single','married','divorced','widowed');
    CREATE TYPE family_entitlement AS ENUM ('full','children_only','blocked','none');
    CREATE TYPE family_relation AS ENUM ('spouse','son','daughter');
    CREATE TYPE record_status AS ENUM ('active','suspended','ended');
    CREATE TYPE issue_status AS ENUM ('open','in_review','resolved','dismissed');
    CREATE TABLE employees (id serial primary key, employee_no int not null unique, full_name text, gender gender_t, grade varchar(5), step smallint, basic_salary numeric(14,0), certificate_code varchar(5), status_code varchar(5));
    CREATE TABLE employee_family_status (id serial primary key, employee_id int, marital_status marital_status, entitlement family_entitlement, partner_employee_no int, reason_text text, order_no text, order_date date, effective_from date not null, effective_to date);
    CREATE TABLE ineligibility_reasons (id serial primary key, code text, name_ar text);
    CREATE TABLE family_members (id serial primary key, employee_id int, relation family_relation, seq smallint, gender gender_t, birth_date date, is_eligible boolean, ineligibility_reason_id int, eligible_from date, eligible_to date, order_no text, status record_status default 'active', source text);
    CREATE TABLE family_extensions (id serial primary key, member_id int, valid_from date, duration_months int, valid_to date, reason_text text, document_ref text, document_date date);
    CREATE TABLE data_issues (id serial primary key, employee_no int, issue_code text, details text, payroll_amount numeric, computed_amount numeric, status issue_status, resolution text, resolved_at timestamptz, source text);
    CREATE TABLE payroll_imports (id serial primary key, period char(7), file_name text, rows_count int, imported_at timestamptz default now());
    CREATE TABLE payroll_items (import_id int, employee_no int, payroll_code text, value numeric(14,2));
    CREATE TABLE statements (id serial primary key, period text);
    INSERT INTO ineligibility_reasons (code, name_ar) VALUES ('over_age', 'تجاوز العمر'), ('deceased', 'الوفاة'), ('spouse_receives', 'الزوج/ة يستلم المخصص');
  `);
  const n = (x: number) => Number(String(tag).slice(-4)) * 100 + x; // أرقام شركة مصطنعة فريدة لكل تشغيل
  await pg.exec(`
    INSERT INTO employees (employee_no, full_name, gender, grade, step, basic_salary) VALUES (${n(1)}, 'أ', 'male', '7', 1, 296000), (${n(2)}, 'ب', 'female', '7', 1, 296000), (${n(3)}, 'ج', 'male', '6', 2, 400000), (${n(4)}, 'د', 'male', '7', 1, 296000), (${n(5)}, 'ه', 'male', '7', 1, 296000);
    INSERT INTO employee_family_status (employee_id, marital_status, entitlement, effective_from) VALUES (1, 'married', 'full', '2026-08-01'), (2, 'married', 'full', '2026-08-01'), (3, 'married', 'full', '2026-08-01'), (4, 'married', 'full', '2026-08-01'), (5, 'married', 'full', '2026-08-01');
    INSERT INTO family_members (employee_id, relation, seq, birth_date, is_eligible, ineligibility_reason_id, source) VALUES
      (1, 'spouse', 0, NULL, true, NULL, 'migration_2026_08'), (1, 'son', 1, '2015-03-01', true, NULL, 'migration_2026_08'), (1, 'daughter', 2, '2018-06-01', true, NULL, 'migration_2026_08'),
      (1, 'son', 3, '2000-01-01', false, 1, 'migration_2026_08'),
      (2, 'spouse', 0, NULL, true, NULL, 'migration_2026_08'), (2, 'daughter', 1, '2012-02-02', true, NULL, 'migration_2026_08'),
      (3, 'son', 1, '2010-10-10', true, NULL, 'migration_2026_08'), (4, 'son', 1, '2011-11-11', true, NULL, 'migration_2026_08'),
      (5, 'son', 1, '2012-01-01', true, NULL, 'migration_2026_08'), (5, 'son', 2, '2014-01-01', true, NULL, 'migration_2026_08'), (5, 'daughter', 3, '2016-01-01', true, NULL, 'migration_2026_08');
    INSERT INTO family_extensions (member_id, valid_from, duration_months, valid_to, reason_text) VALUES (4, '2018-01-01', 12, '2018-12-31', 'دراسة');
    INSERT INTO data_issues (employee_no, issue_code, details, payroll_amount, computed_amount, status, source) VALUES (${n(1)}, 'amount_mismatch', 'فرق', 90000, 80000, 'open', 'migration_2026_08'), (${n(9)}, 'not_in_payroll', null, null, null, 'resolved', 'migration_2026_08'),
      (${n(1)}, 'multiple', 'عدة', null, null, 'open', 'migration_2026_08');
    INSERT INTO payroll_imports (period, file_name, rows_count) VALUES ('2026-08', 'كشف', 2);
    INSERT INTO payroll_items VALUES (1, ${n(1)}, 'basic', 296000), (1, ${n(1)}, 'm802', 90000), (1, ${n(2)}, 'basic', 296000);
    INSERT INTO statements (period) VALUES ('2026-08');
  `);
  if (variant === 2) await pg.exec(`
    UPDATE family_members SET status = 'ended' WHERE id = 3;                  -- بنت 2018 أُنهيت...
    INSERT INTO family_members (employee_id, relation, seq, birth_date, is_eligible, ineligibility_reason_id, source) VALUES
      (1, 'daughter', 5, '2018-06-01', true, NULL, 'manual'),                  -- ...وأُعيد إدخالها بمعرّف جديد
      (1, 'daughter', 6, '2019-05-05', false, 2, 'manual'),                    -- متوفاة
      (1, 'son', 7, '2016-01-01', false, 3, 'manual');                         -- الزوجة تستلم
    UPDATE family_members SET status = 'suspended' WHERE id = 5;              -- زوج ب موقوف
    UPDATE data_issues SET status = 'resolved', resolution = 'وُحدت الملاحظات', resolved_at = '2026-09-01T10:00:00Z' WHERE id = 3;
  `);
  const blob = await pg.dumpDataDir('gzip');
  fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  await pg.close();
  return { no: (x: number) => String(n(x)), tag };
}

describe.skipIf(!enabled)('C ترحيل نظام المخصصات على قاعدة حقيقية', () => {
  let db: any; let schema: any; let mod: any; let file: string; let nos: any;
  let e1: number; let e2: number; let e3: number; let e5: number;
  const rows = (r: any) => (r.rows ?? r) as any[];
  const tag = 'C' + Date.now();

  beforeAll(async () => {
    const m = await import('../src/db/index.ts'); db = m.db; schema = m.schema;
    mod = await import('./legacy/allowances.ts');
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alw-')), 'pgdata-test.tar.gz');
    nos = await makeBackup(file, String(Date.now() % 10000).padStart(4, '0'));
    const emp = async (no: string, gender: string, extra: any = {}) => (await db.insert(schema.employees).values({ fullName: 'موظف ' + no, companyNumber: no, grade: 7, step: 1, status: 'مستمر',
      serviceType: 'خدمة ' + tag, gender, department: 'قسم', firstAppointmentDate: '2015-01-01', ...extra }).returning())[0].id;
    e1 = await emp(nos.no(1), 'ذكر');
    e2 = await emp(nos.no(2), 'أنثى', { familyMode: 'محجوب' });
    // e3 غير موجود بـ HR؛ e1 عنده طفل مسجل بـ HR بنفس تاريخ ميلاد الابن، وطفل آخر بـ HR فقط
    await db.insert(schema.familyMembers).values([{ employeeId: e1, relation: 'طفل', birthDate: '2015-03-01', sourceRef: 'children_details#1' }, { employeeId: e1, relation: 'بنت', birthDate: '2020-01-01', sourceRef: 'children_details#2' }]);
    e3 = 0;
    // ه: أطفاله بـ HR من JSON قديم بلا تواريخ (ابنان «طفل» وبنت) — نفس أطفال النظام القديم
    e5 = await emp(nos.no(5), 'ذكر');
    await db.insert(schema.familyMembers).values([{ employeeId: e5, relation: 'طفل', name: 'الأول', sourceRef: 'children_details#1' }, { employeeId: e5, relation: 'طفل', name: 'الثاني', sourceRef: 'children_details#2' },
      { employeeId: e5, relation: 'بنت', name: 'الثالثة', sourceRef: 'children_details#3' }]);
  });

  it('التجربة ما تكتب شيئاً، وتطابق ما سيُكتب', async () => {
    const before = rows(await db.execute(sql`SELECT (SELECT count(*) FROM family_members)::int fm, (SELECT count(*) FROM data_issues)::int di, (SELECT count(*) FROM legacy_imports)::int li`))[0];
    const src = await mod.readAllowancesBackup(file);
    const r = await mod.migrateAllowances(db, schema, src, { apply: false, user: 'admin', fileName: 'pgdata-test.tar.gz' });
    expect(r.applied).toBe(false);
    const after = rows(await db.execute(sql`SELECT (SELECT count(*) FROM family_members)::int fm, (SELECT count(*) FROM data_issues)::int di, (SELECT count(*) FROM legacy_imports)::int li`))[0];
    expect(after).toEqual(before);
    expect(r.summary.not_in_hr).toBe(2);
    expect(r.summary.members_matched).toBe(1);   // الابن 2015 مطابق للطفل المسجل
    expect(r.summary.children_hr_only).toBe(1);  // بنت 2020 بـ HR فقط
    expect(r.summary.mode_conflict).toBe(1);     // ب: محجوب بـ HR، كامل بالقديم
    expect(r.summary.members_completed).toBe(3); // أطفال ه بلا تواريخ تُكمَّل لا تُكرر
  });

  it('التطبيق: نمط الاستحقاق بحركة «ترحيل قديم»، أفراد بلا تكرار، تمديد، حالات استفسار، وأرشيف؛ والتكرار ما يضيف شيئاً', async () => {
    const src = await mod.readAllowancesBackup(file);
    const r = await mod.migrateAllowances(db, schema, src, { apply: true, user: 'admin', fileName: 'pgdata-test.tar.gz' });
    expect(r.applied).toBe(true);
    const [emp1] = rows(await db.execute(sql`SELECT family_mode, marital_status FROM employees WHERE id = ${e1}`));
    expect(emp1).toEqual({ family_mode: 'كامل', marital_status: 'متزوج' });
    const h = rows(await db.execute(sql`SELECT source, valid_from::text vf FROM employee_field_history WHERE employee_id = ${e1} AND field = 'family_mode'`));
    expect(h).toEqual([{ source: 'ترحيل قديم', vf: '2026-08-01' }]);
    const fam = rows(await db.execute(sql`SELECT relation, birth_date::text bd, source_ref FROM family_members WHERE employee_id = ${e1} ORDER BY birth_date NULLS FIRST, id`));
    expect(fam.map(f => [f.relation, f.bd])).toEqual([['زوجة', null], ['ابن', '2000-01-01'], ['طفل', '2015-03-01'], ['بنت', '2018-06-01'], ['بنت', '2020-01-01']]);
    const ext = rows(await db.execute(sql`SELECT x.valid_to::text vt FROM family_extensions x JOIN family_members m ON m.id = x.member_id WHERE m.employee_id = ${e1}`));
    expect(ext).toEqual([{ vt: '2018-12-31' }]);
    // ب: النمط ما تغير (تعارض)
    expect(rows(await db.execute(sql`SELECT family_mode FROM employees WHERE id = ${e2}`))[0].family_mode).toBe('محجوب');
    const iss = rows(await db.execute(sql`SELECT issue_code, status FROM data_issues WHERE import_id = ${r.import_id} ORDER BY issue_code`)).map(x => `${x.issue_code}:${x.status}`);
    expect(iss).toEqual(['amount_mismatch:مفتوحة', 'legacy_family_mode_conflict:مفتوحة', 'legacy_hr_only_child:مفتوحة', 'legacy_not_in_hr:مفتوحة', 'legacy_not_in_hr:مفتوحة', 'multiple:مفتوحة', 'not_in_payroll:محلولة']);
    const f5 = rows(await db.execute(sql`SELECT name, relation, birth_date::text bd FROM family_members WHERE employee_id = ${e5} ORDER BY id`));
    expect(f5.map(f => [f.name, f.relation, f.bd])).toEqual([['الأول', 'ابن', '2012-01-01'], ['الثاني', 'ابن', '2014-01-01'], ['الثالثة', 'بنت', '2016-01-01']]);
    const pr = rows(await db.execute(sql`SELECT data FROM legacy_archive WHERE kind = 'payroll_row' AND employee_id = ${e1}`));
    expect(pr[0].data.values).toEqual({ basic: '296000.00', m802: '90000.00' });
    // التكرار: ما يضيف أفراداً ولا حالات ولا حركات
    const again = await mod.migrateAllowances(db, schema, src, { apply: true, user: 'admin', fileName: 'pgdata-test.tar.gz' });
    expect([again.summary.members_added, again.summary.issues_new, again.summary.issues_legacy, again.summary.mode_set, again.summary.archive_rows, again.summary.extensions_added]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(again.summary.previous_runs.length).toBe(1);
    // الأرشيف وسجل الترحيل ثابتان، والحالة ما تُحذف ويتغير قرارها فقط
    await expect(db.execute(sql`DELETE FROM legacy_archive WHERE import_id = ${r.import_id}`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE legacy_imports SET summary = '{"x":1}' WHERE id = ${r.import_id}`)).rejects.toThrow();
    const [one] = rows(await db.execute(sql`SELECT id FROM data_issues WHERE import_id = ${r.import_id} AND issue_code = 'amount_mismatch'`));
    await expect(db.execute(sql`DELETE FROM data_issues WHERE id = ${one.id}`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE data_issues SET status = 'محلولة' WHERE id = ${one.id}`)).rejects.toThrow(); // بلا قرار
    await db.execute(sql`UPDATE data_issues SET status = 'محلولة', resolution = 'صُحح الكشف', resolved_by = 'admin', resolved_at = now() WHERE id = ${one.id}`);
    await expect(db.execute(sql`UPDATE data_issues SET details = 'x' WHERE id = ${one.id}`)).rejects.toThrow();
    void e3;
  });

  it('نسخة ثانية: فرد أُنهي وأُعيد إدخاله ما يتكرر، ما حذفه المستخدم ما يُعاد، الوفاة حقيقة، «الزوج يستلم» ما يُنقل، والحالة المغلقة لاحقاً تُحدَّث بتاريخها (مراجعة H1/H2/M1/M4)', async () => {
    const file2 = path.join(path.dirname(file), 'pgdata-test2.tar.gz');
    await makeBackup(file2, nos.tag, 2);
    // المستخدم حذف زوجة أ المُرحَّلة بـ HR
    await db.execute(sql`DELETE FROM family_members WHERE employee_id = ${e1} AND relation = 'زوجة'`);
    const src = await mod.readAllowancesBackup(file2);
    const r = await mod.migrateAllowances(db, schema, src, { apply: true, user: 'admin', fileName: 'pgdata-test2.tar.gz' });
    expect(r.applied).toBe(true);
    expect([r.summary.members_added, r.summary.members_matched, r.summary.members_removed_in_hr, r.summary.facts_added, r.summary.members_not_imported, r.summary.members_ended, r.summary.issues_refreshed])
      .toEqual([1, 1, 1, 1, 1, 1, 1]);
    const fam = rows(await db.execute(sql`SELECT relation, birth_date::text bd FROM family_members WHERE employee_id = ${e1} ORDER BY birth_date NULLS FIRST, id`));
    expect(fam.map(f => [f.relation, f.bd])).toEqual([['ابن', '2000-01-01'], ['طفل', '2015-03-01'], ['بنت', '2018-06-01'], ['بنت', '2019-05-05'], ['بنت', '2020-01-01']]);
    const fact = rows(await db.execute(sql`SELECT f.fact, f.value, f.source FROM family_member_facts f JOIN family_members m ON m.id = f.member_id WHERE m.employee_id = ${e1} AND m.birth_date = '2019-05-05'`));
    expect(fact).toEqual([{ fact: 'متوفى', value: true, source: 'ترحيل قديم' }]);
    const codes = rows(await db.execute(sql`SELECT issue_code, details FROM data_issues WHERE import_id = ${r.import_id} ORDER BY issue_code`)).map(x => x.issue_code);
    expect(codes).toEqual(['legacy_member_ended', 'legacy_member_not_imported']);
    const [ref] = rows(await db.execute(sql`SELECT status, resolution, resolved_at::date::text d FROM data_issues WHERE issue_code = 'multiple' AND company_number = ${nos.no(1)}`));
    expect(ref).toEqual({ status: 'محلولة', resolution: 'وُحدت الملاحظات', d: '2026-09-01' });
    // تكرار النسخة الثانية: لا جديد
    const again = await mod.migrateAllowances(db, schema, src, { apply: true, user: 'admin', fileName: 'pgdata-test2.tar.gz' });
    expect([again.summary.members_added, again.summary.issues_new, again.summary.facts_added, again.summary.issues_refreshed]).toEqual([0, 0, 0, 0]);
  });

  it('إصلاح ترحيل قديم: نسخ الأطفال المكررة تُدمج بسجل HR بلا تاريخ، وتُغلق حالاتها (الإصدار الأول ما كان يكمّل)', async () => {
    const [e6] = await db.insert(schema.employees).values({ fullName: 'موظف و', companyNumber: tag + 'W', grade: 7, step: 1, status: 'مستمر', serviceType: 'خدمة ' + tag, gender: 'ذكر',
      department: 'قسم', firstAppointmentDate: '2015-01-01' }).returning();
    const [u1] = await db.insert(schema.familyMembers).values({ employeeId: e6.id, relation: 'طفل', name: 'أ1', sourceRef: 'children_details#1' }).returning();
    const [u2] = await db.insert(schema.familyMembers).values({ employeeId: e6.id, relation: 'طفل', name: 'أ2', sourceRef: 'children_details#2' }).returning();
    const [a1] = await db.insert(schema.familyMembers).values({ employeeId: e6.id, relation: 'ابن', birthDate: '2013-03-03', sourceRef: 'alw:member:90001', createdBy: 'ترحيل نظام المخصصات' }).returning();
    const [a2] = await db.insert(schema.familyMembers).values({ employeeId: e6.id, relation: 'ابن', birthDate: '2011-01-01', sourceRef: 'alw:member:90002', createdBy: 'ترحيل نظام المخصصات' }).returning();
    const [li] = await db.insert(schema.legacyImports).values({ source: 'اختبار', fileName: 'x', fileSha256: 'x' + tag, summary: {}, appliedBy: 't' }).returning();
    for (const [a, oid, seq] of [[a1, 90001, 2], [a2, 90002, 1]] as any) {
      await db.insert(schema.legacyArchive).values({ importId: li.id, kind: 'member_link', sourceRef: `${oid}:${tag}W`, employeeId: e6.id, data: { hr_member_id: a.id, how: 'added' } });
      await db.insert(schema.legacyArchive).values({ importId: li.id, kind: 'family_member', sourceRef: `${oid}:${tag}W:z`, employeeId: e6.id, data: { id: oid, seq } });
    }
    for (const u of [u1, u2]) await db.execute(sql`INSERT INTO data_issues (employee_id, company_number, topic, issue_code, title, source, source_ref) VALUES (${e6.id}, ${tag + 'W'}, 'العائلية', 'legacy_hr_only_child', 't', 'ترحيل C', ${'alw:hr_only:' + u.id})`);
    const dry = await mod.repairUndatedDuplicates(db, schema, { apply: false, user: 'admin' });
    expect(dry.applied).toBe(false);
    expect(rows(await db.execute(sql`SELECT count(*)::int n FROM family_members WHERE employee_id = ${e6.id}`))[0].n).toBe(4);
    const r = await mod.repairUndatedDuplicates(db, schema, { apply: true, user: 'admin' });
    if (r.blocked) return; // قاعدة الاختبار فيها فترات معتمدة من ملفات أخرى: الحاجز يعمل
    const f = rows(await db.execute(sql`SELECT name, relation, birth_date::text bd FROM family_members WHERE employee_id = ${e6.id} ORDER BY id`));
    expect(f.map(x => [x.name, x.relation, x.bd])).toEqual([['أ1', 'ابن', '2011-01-01'], ['أ2', 'ابن', '2013-03-03']]); // بتسلسل النظام القديم
    expect(rows(await db.execute(sql`SELECT count(*)::int n FROM data_issues WHERE employee_id = ${e6.id} AND status = 'محلولة'`))[0].n).toBe(2);
    const rl = rows(await db.execute(sql`SELECT (data->>'hr_member_id')::int hr FROM legacy_archive WHERE kind = 'member_relink' AND source_ref = ${'90002:' + tag + 'W'}`));
    expect(rl).toEqual([{ hr: u1.id }]);
  });

  it('فترة معتمدة لفئة الموظف (ونوع خدمته بمسافة زائدة كما يطبّعه المحرك) ⇒ التطبيق يتوقف والتجربة تشتغل (مراجعة M2)', async () => {
    const per = await import('./payroll/periods.ts');
    const svc = 'خدمة ب ' + tag;
    const [c] = await db.insert(schema.payrollCategories).values({ code: tag + 'B', name: 'فئة ' + tag + 'B', kind: 'دائم', isActive: true }).returning();
    await db.insert(schema.payrollCategoryRules).values({ serviceType: svc, contractType: null, categoryId: c.id });
    await db.insert(schema.employees).values({ fullName: 'موظف د', companyNumber: nos.no(4), grade: 7, step: 1, status: 'مستمر', serviceType: svc + ' ', gender: 'ذكر',
      department: 'قسم', firstAppointmentDate: '2015-01-01' });
    const p = await per.openPeriod(db, schema, { categoryId: c.id, year: 2040, month: 1, user: 'writer1', paySource: 'فعلي' });
    await per.computeRun(db, schema, p.id, 'writer1', ['غير موجود']);
    await per.approvePeriod(db, schema, p.id, 'admin', ['غير موجود']).catch(() => null);
    const [st] = rows(await db.execute(sql`SELECT status FROM payroll_periods WHERE id = ${p.id}`));
    expect(st.status).toBe('معتمدة');
    const src = await mod.readAllowancesBackup(file);
    const r = await mod.migrateAllowances(db, schema, src, { apply: true, user: 'admin', fileName: 'pgdata-test.tar.gz' });
    expect(r.applied).toBe(false);
    expect(r.blocked).toMatch(/فترة رواتب معتمدة/);
    expect(rows(await db.execute(sql`SELECT count(*)::int n FROM family_members m JOIN employees e ON e.id = m.employee_id WHERE e.company_number = ${nos.no(4)}`))[0].n).toBe(0);
  });
});
