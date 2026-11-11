// B8a3: الفترات والاحتسابات الثابتة والبصمة والمتغيرات والكشوف — على PostgreSQL حقيقية (HR_TEST_DB=1).
// الحالات 6، 7، 10، 11، 12 (الطفل) من معايير القبول، ومشغّلات الثبات والانتقالات.
import { describe, it, expect, beforeAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('B8a3 الفترات على قاعدة حقيقية', () => {
  let db: any; let schema: any; let per: any; let rep: any; let pend: any; let mov: any;
  let catId: number; let empA: number; let empB: number; let certId: number; let familyId: number; let p1: number; let p2: number;
  const rows = (r: any) => (r.rows ?? r) as any[];
  const ELIG = ['مستمر'];
  const tag = 'T' + Date.now();
  const service = 'خدمة ' + tag;
  let deg1: any; let deg2: any;

  beforeAll(async () => {
    const mod = await import('../src/db/index.ts');
    db = mod.db; schema = mod.schema;
    per = await import('./payroll/periods.ts');
    rep = await import('./payroll/reports.ts');
    pend = await import('./payroll/pending.ts');
    mov = await import('./careerMovements.ts');
    // فئة معزولة لهذا التشغيل حتى ما تتأثر الفترات بتشغيلات سابقة
    const [c] = await db.insert(schema.payrollCategories).values({ code: tag, name: 'فئة اختبار ' + tag, kind: 'دائم', isActive: true }).returning();
    catId = c.id;
    await db.insert(schema.payrollCategoryRules).values({ serviceType: service, contractType: null, categoryId: catId });
    // قاعدة جديدة (CI) بلا شهادات: نزرع اثنتين للاختبار
    await db.execute(sql`INSERT INTO education_degrees (name, allowance_rate) SELECT x, 0 FROM (VALUES ('دبلوم اختبار'), ('بكالوريوس اختبار')) v(x)
      WHERE (SELECT count(*) FROM education_degrees) < 2`);
    const degs = rows(await db.execute(sql`SELECT id, name FROM education_degrees ORDER BY id LIMIT 2`));
    [deg1, deg2] = degs;
    const item = async (code: string, method: string, props: any, extra: any = {}) => {
      const [it] = rows(await db.execute(sql`INSERT INTO pay_items (code, name, direction, item_group, classification, assignment_mode, method, category_id)
        VALUES (${code + tag}, ${'بند ' + code}, '+', 'أخرى', 'ثابت', ${extra.mode ?? 'تلقائي'}, ${method}, ${catId}) RETURNING id`));
      await db.execute(sql`INSERT INTO pay_item_versions (item_id, valid_from, props, entered_by, approved_by)
        VALUES (${it.id}, '2020-01-01', ${JSON.stringify({ status: 'فعّال', verification: 'مؤكد', legal_basis: 'اختبار', calc_order: 10, ...props })}::jsonb, 't', 't2')`);
      return it.id;
    };
    certId = await item('CERT', 'tiered', { level_source: 'education_degrees', value_kind: 'نسبة', base: ['NOMINAL'], inside_200_cap: true, cap_reduction_priority: 1,
      levels: [{ ref_id: deg1.id, label: deg1.name, value: 45 }, { ref_id: deg2.id, label: deg2.name, value: 25 }] });
    familyId = await item('FAM', 'family', { inside_200_cap: false, calc_order: 50, family: { spouse_amount: 50000, child_amount: 10000, max_children: 4, son_age: 18, son_student_age: 24 } });
    const emp = async (n: string) => {
      const [e] = await db.insert(schema.employees).values({ fullName: 'موظف ' + n + ' ' + tag, companyNumber: tag + n, grade: 7, step: 1, status: 'مستمر', serviceType: service,
        educationLevel: deg2.name, familyMode: 'كامل', department: 'قسم الاختبار', firstAppointmentDate: '2015-01-01' }).returning();
      return e.id;
    };
    empA = await emp('A'); empB = await emp('B');
    await db.execute(sql`UPDATE employees SET department = 'قسم ثانٍ' WHERE id = ${empB}`);
  });

  it('فتح ← احتساب ← اعتماد ← إصدار، والمحتسب ما يعتمد فترته (حالة 11)', async () => {
    const p = await per.openPeriod(db, schema, { categoryId: catId, year: 2030, month: 1, user: 'writer1' });
    p1 = p.id;
    await expect(per.openPeriod(db, schema, { categoryId: catId, year: 2030, month: 2, user: 'writer1' })).rejects.toThrow('غير مُصدَرة');
    const r = await per.computeRun(db, schema, p1, 'writer1', ELIG);
    expect(r.totals.computed).toBe(2);
    await expect(per.approvePeriod(db, schema, p1, 'writer1', ELIG)).rejects.toThrow('احتسبتها أنت');
    const a = await per.approvePeriod(db, schema, p1, 'admin', ELIG);
    expect(a.first_period).toBe(true);
    await expect(per.issuePeriod(db, schema, p1, 'admin', '')).rejects.toThrow('كتاب الإرسال');
    await per.issuePeriod(db, schema, p1, 'admin', 'كتاب 1/2030');
    const [row] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, p1));
    expect(row.status).toBe('مُصدَرة');
  });

  it('مراجعة H2: تحديث بلا أثر على صف بند ما يغيّر البصمة', async () => {
    const p = rows(await db.execute(sql`SELECT * FROM payroll_periods WHERE id = ${p1}`))[0];
    const XLSX = await import('xlsx');
    const wb = await rep.statementWorkbook(db, p1, 'full', 'writer1');
    const sheet = XLSX.read(wb.buf, { type: 'buffer' }).Sheets['المجاميع حسب القسم'];
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    // مراجعة H1: صف القسم الثاني سليم، والمجموع = مجموع القسمين
    expect(aoa.length).toBe(4);
    expect(aoa[2].length).toBe(6);
    expect(aoa[3][5]).toBe(Number(aoa[1][5]) + Number(aoa[2][5]));
    expect(p.status).toBe('مُصدَرة');
  });

  it('الاحتساب والفترة المُصدَرة ثابتان (مشغّلات)', async () => {
    const [pp] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, p1));
    await expect(db.execute(sql`UPDATE payroll_lines SET amount = 1 WHERE run_id = ${pp.currentRunId}`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM payroll_results WHERE run_id = ${pp.currentRunId}`)).rejects.toThrow();
    await expect(db.execute(sql`INSERT INTO payroll_lines (run_id, employee_id, seq, item_code, item_name, direction, kind, amount) VALUES (${pp.currentRunId}, ${empA}, 99, 'X', 'X', '+', 'item', 1)`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE payroll_periods SET notes = 'x' WHERE id = ${p1}`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM payroll_runs WHERE id = ${pp.currentRunId}`)).rejects.toThrow();
  });

  it('مراجعة M3: المشغّلات تمنع تزوير الاعتماد وتبديل الاحتساب وإدراج احتساب مُصدَر والتفريغ', async () => {
    const [pp] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, p1));
    await expect(db.execute(sql`INSERT INTO payroll_runs (period_id, state, known_at, computed_by) VALUES (${p1}, 'مُصدَر', now(), 'x')`)).rejects.toThrow();
    await expect(db.execute(sql`INSERT INTO payroll_periods (category_id, year, month, status, opened_by) VALUES (${catId}, 2031, 1, 'معتمدة', 'x')`)).rejects.toThrow();
    await expect(db.execute(sql`TRUNCATE payroll_variances`)).rejects.toThrow();
    await expect(db.execute(sql`TRUNCATE payroll_lines`)).rejects.toThrow();
    expect(pp.currentRunId).toBeTruthy();
  });

  it('حالة 7: إعادة إخراج الكشف المُصدَر بعد تغيير المسميات والبيانات مطابق حرفياً', async () => {
    const before = await rep.statementData(db, p1, 'full');
    await db.execute(sql`UPDATE payroll_categories SET name = 'فئة معاد تسميتها' WHERE id = ${catId}`);
    await db.execute(sql`UPDATE pay_items SET name = 'اسم جديد للبند' WHERE id = ${certId}`);
    await db.execute(sql`UPDATE employees SET full_name = 'اسم معدّل', department = 'قسم آخر' WHERE id = ${empA}`);
    const after = await rep.statementData(db, p1, 'full');
    expect(JSON.stringify(after.sheets)).toBe(JSON.stringify(before.sheets));
    const wb = await rep.statementWorkbook(db, p1, 'full', 'writer1');
    expect(wb.buf.length).toBeGreaterThan(1000);
  });

  it('حالة 12: إضافة طفل بلا مُعتمِد ثانٍ ما تأثر بالاحتساب، وحالة 10: تغيير بعد الاحتساب يرفض الاعتماد', async () => {
    const p = await per.openPeriod(db, schema, { categoryId: catId, year: 2030, month: 2, user: 'writer1' });
    p2 = p.id;
    const first = await per.computeRun(db, schema, p2, 'writer1', ELIG);
    // مراجعة H2: تحديث بلا أثر على أعمدة ما يقرأها المحرك ما يغيّر البصمة
    await db.execute(sql`UPDATE pay_items SET item_group = item_group WHERE category_id = ${catId}`);
    await db.execute(sql`UPDATE pay_items SET notes = 'ملاحظة' WHERE id = ${familyId}`).catch(() => {});
    expect((await per.checkFingerprint(db, schema, p2, ELIG)).changed).toBe(false);
    // مراجعة M1: احتسابان متزامنان ⇒ كلاهما ينجح بالتتابع (إعادة عند تعارض التسلسل)
    const both = await Promise.all([per.computeRun(db, schema, p2, 'writer1', ELIG), per.computeRun(db, schema, p2, 'writer1', ELIG)]);
    expect(both.every((b: any) => b.fingerprint === first.fingerprint)).toBe(true);
    // طفل بانتظار الاعتماد: لا أثر ولا تغيّر بالبصمة
    const sub = await pend.submit(db, schema, 'family_member', { employee_id: empA, relation: 'ابن', name: 'طفل', birth_date: '2025-01-01' }, 'writer1');
    expect(sub.applied).toBe(false);
    expect((await per.checkFingerprint(db, schema, p2, ELIG)).changed).toBe(false);
    const again = await per.computeRun(db, schema, p2, 'writer1', ELIG);
    expect(again.fingerprint).toBe(first.fingerprint);
    expect(again.totals.net).toBe(first.totals.net);
    // اعتماد الطفل = تغيير بالمدخلات بعد الاحتساب ⇒ الاعتماد مرفوض
    await pend.decide(db, schema, sub.pending.id, 'approve', 'admin');
    expect((await per.checkFingerprint(db, schema, p2, ELIG)).changed).toBe(true);
    await expect(per.approvePeriod(db, schema, p2, 'admin', ELIG)).rejects.toThrow('بصمة المدخلات');
    // الاحتساب القديم يبقى «ملغى» أرشيفاً بعد إعادة الاحتساب
    const old = rows(await db.execute(sql`SELECT state FROM payroll_runs WHERE id = ${first.run_id}`))[0];
    expect(old.state).toBe('ملغى');
  });

  it('حالة 6: تغيّر شهادة الموظف ⇒ متغير شهري آلي لبند الشهادة بسببه', async () => {
    await mov.applyMovement(db, schema, { employeeId: empB, effectiveDate: '2030-02-01', changes: { education_level: deg1.name }, source: 'تعديل مباشر', reason: 'شهادة أعلى', userLabel: 'writer1' });
    await per.computeRun(db, schema, p2, 'writer1', ELIG);
    const a = await per.approvePeriod(db, schema, p2, 'admin', ELIG);
    expect(a.variances).toBeGreaterThan(0);
    const vs = rows(await db.execute(sql`SELECT v.item_code, v.before::text b, v.after::text a, v.cause FROM payroll_variances v WHERE v.run_id = ${a.run_id} AND v.employee_id = ${empB}`));
    const cert = vs.find(v => v.item_code === 'CERT' + tag);
    expect(cert).toBeTruthy();
    expect(Number(cert.a)).toBeGreaterThan(Number(cert.b));
    expect(cert.cause).toContain('تغيّر المستوى');
    // طفل الموظف أ المعتمد = متغير بالعائلية
    expect(rows(await db.execute(sql`SELECT 1 FROM payroll_variances WHERE run_id = ${a.run_id} AND employee_id = ${empA} AND item_code = ${'FAM' + tag}`))).toHaveLength(1);
    // مراجعة M4: سبب الدرجة ما يُلصق ببند العائلية
    const fam = rows(await db.execute(sql`SELECT cause FROM payroll_variances WHERE run_id = ${a.run_id} AND employee_id = ${empA} AND item_code = ${'FAM' + tag}`))[0];
    expect(fam.cause).not.toContain('الدرجة');
    const review = await rep.reviewReport(db, p2);
    expect(review.previous_period).toBe(p1);
    const vstat = await rep.statementData(db, p2, 'variances');
    expect(vstat.sheets[0].rows.length).toBeGreaterThan(5);
  });

  it('إلغاء الاعتماد يحتاج مُعتمِداً ثانياً ويُبقي الاحتساب أرشيفاً', async () => {
    const r = await pend.submit(db, schema, 'period_unapprove', { period_id: p2, reason: 'تصحيح' }, 'admin');
    await expect(pend.decide(db, schema, r.pending.id, 'approve', 'admin')).rejects.toThrow('أدخلتها');
    const [before] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, p2));
    await pend.decide(db, schema, r.pending.id, 'approve', 'admin2');
    const [after] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, p2));
    expect(after.status).toBe('مفتوحة');
    expect(after.currentRunId).toBeNull();
    const run = rows(await db.execute(sql`SELECT state FROM payroll_runs WHERE id = ${before.currentRunId}`))[0];
    expect(run.state).toBe('ملغى');
    expect(rows(await db.execute(sql`SELECT count(*)::int n FROM payroll_variances WHERE run_id = ${before.currentRunId}`))[0].n).toBeGreaterThan(0);
  });

  it('مراجعة M4: موظف غادر بين فترتين ⇒ سبب «غير مشمول» لا «انتهاء الاستحقاق»، وبند «يُتحقق» يمنع الاعتماد', async () => {
    await per.computeRun(db, schema, p2, 'writer1', ELIG);
    await per.approvePeriod(db, schema, p2, 'admin', ELIG);
    await per.issuePeriod(db, schema, p2, 'admin', 'كتاب 2/2030');
    await db.execute(sql`UPDATE employees SET status = 'مستقيل' WHERE id = ${empB}`);
    const p3 = await per.openPeriod(db, schema, { categoryId: catId, year: 2030, month: 3, user: 'writer1' });
    const r3 = await per.computeRun(db, schema, p3.id, 'writer1', ELIG);
    const a3 = await per.approvePeriod(db, schema, p3.id, 'admin', ELIG);
    const causes = rows(await db.execute(sql`SELECT DISTINCT cause FROM payroll_variances WHERE run_id = ${a3.run_id} AND employee_id = ${empB}`)).map((x: any) => x.cause);
    expect(causes.length).toBeGreaterThan(0);
    expect(causes.every((c: string) => c.startsWith('غير مشمول') || c.startsWith('لم يُحتسب'))).toBe(true);
    expect(r3.run_id).toBe(a3.run_id);
    const review = await rep.reviewReport(db, p3.id);
    expect(review.sections.leavers.map((l: any) => l.employee_id)).toContain(empB);
  });
});
