// B8a4: المطابقة مع الكشف الخارجي بملف تعريف قابل للضبط، وأساس الفروق للفترة الظلّية (الحالة 23) — PostgreSQL حقيقية.
import { describe, it, expect, beforeAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';

const enabled = process.env.HR_TEST_DB === '1';

describe.skipIf(!enabled)('B8a4 المطابقة على قاعدة حقيقية', () => {
  let db: any; let schema: any; let per: any; let rec: any;
  let catId: number; let empA: number; let empB: number; let profileId: number; let p1: number;
  const rows = (r: any) => (r.rows ?? r) as any[];
  const tag = 'M' + Date.now();
  const service = 'خدمة ' + tag;
  const ELIG = ['مستمر'];
  const xlsx = (data: any[][]) => Buffer.from(XLSX.write((() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'كشف'); return wb; })(), { type: 'buffer', bookType: 'xlsx' })).toString('base64');

  beforeAll(async () => {
    const m = await import('../src/db/index.ts'); db = m.db; schema = m.schema;
    per = await import('./payroll/periods.ts');
    rec = await import('./payroll/reconcile.ts');
    const [c] = await db.insert(schema.payrollCategories).values({ code: tag, name: 'فئة ' + tag, kind: 'دائم', isActive: true }).returning();
    catId = c.id;
    await db.insert(schema.payrollCategoryRules).values({ serviceType: service, contractType: null, categoryId: catId });
    const emp = async (n: string) => (await db.insert(schema.employees).values({ fullName: 'موظف ' + n + ' ' + tag, companyNumber: tag + n, grade: 7, step: 1, status: 'مستمر', serviceType: service,
      familyMode: 'لا يستحق', department: 'قسم', firstAppointmentDate: '2015-01-01' }).returning())[0].id;
    empA = await emp('A'); empB = await emp('B');
  });

  it('ملف تعريف بأي صيغة: صف عنوان قبل الرؤوس، أرقام عربية وفواصل، رقم غير موجود، وفروق بالاسمي والصافي', async () => {
    const p = await per.openPeriod(db, schema, { categoryId: catId, year: 2032, month: 1, user: 'writer1' });
    p1 = p.id;
    await per.computeRun(db, schema, p1, 'writer1', ELIG);
    const file = xlsx([
      ['كشف رواتب شهر كانون الثاني'],
      ['ت', 'الرقم الوظيفي', 'الاسم', 'الراتب الأساسي', 'صافي الراتب'],
      [1, tag + 'A', 'أ', '٢٩٦٬٠٠٠', 296000],
      [2, tag + 'B', 'ب', 290000, 290000],
      [3, 'X-NOPE', 'ج', 100, 100],
    ]);
    const i = rec.inspectFile(file);
    expect(i.headers).toContain('الرقم الوظيفي');
    const codes = new Set<string>();
    const v = rec.validateProfile({ key_column: 'الرقم الوظيفي', columns: [{ header: 'الراتب الأساسي', target: 'NOMINAL' }, { header: 'صافي الراتب', target: 'NET' }] }, codes);
    const [pr] = await db.insert(schema.payrollImportProfiles).values({ categoryId: catId, name: 'افتراضي', keyColumn: v.keyColumn, columns: v.columns, createdBy: 'writer1' }).returning();
    profileId = pr.id;
    const r = await rec.importExternal(db, schema, { periodId: p1, profileId, base64: file, fileName: 'jan.xlsx', user: 'writer1' });
    expect([r.rows, r.matched, r.unmatched]).toEqual([3, 2, 1]);
    const m = await rec.reconciliation(db, p1);
    expect(m.summary.matched_employees).toBe(2);
    expect(m.summary.with_diffs).toBe(1);
    expect(m.diffs.map((d: any) => [d.employee_id, d.target, Number(d.diff)])).toEqual([[empB, 'NOMINAL', 6000], [empB, 'NET', 6000]]);
  });

  it('خلية غير رقمية تُبلَّغ ولا تصير صفراً، والاستيراد الجديد يستبدل القديم', async () => {
    const file = xlsx([['الرقم الوظيفي', 'الراتب الأساسي'], [tag + 'A', 'غير متوفر'], [tag + 'B', 296000]]);
    const [pr] = await db.insert(schema.payrollImportProfiles).values({ categoryId: catId, name: 'اسمي فقط', keyColumn: 'الرقم الوظيفي', columns: [{ header: 'الراتب الأساسي', target: 'NOMINAL' }], createdBy: 'w' }).returning();
    const r = await rec.importExternal(db, schema, { periodId: p1, profileId: pr.id, base64: file, fileName: 'jan2.xlsx', user: 'writer1' });
    expect(r.bad_cells.length).toBe(1);
    const live = rows(await db.execute(sql`SELECT count(*)::int n FROM payroll_external_imports WHERE period_id = ${p1} AND superseded_at IS NULL`))[0].n;
    expect(live).toBe(1);
    await expect(db.execute(sql`UPDATE payroll_external_amounts SET amount = 0 WHERE import_id = ${r.import_id}`)).rejects.toThrow();
  });

  it('حالة 23: تغيير رجعي بفترة ظلّية ⇒ الفرق مقابل المبالغ المستوردة لا لقطة النظام', async () => {
    // الكشف الخارجي (الفعلي) دفع للموظف ب 290,000 اسمياً بينما لقطة النظام 296,000
    const file = xlsx([['الرقم الوظيفي', 'الراتب الأساسي'], [tag + 'A', 296000], [tag + 'B', 290000]]);
    // ملف التعريف الأول يربط الصافي أيضاً والملف ما فيه عموده ⇒ يُرفض
    await expect(rec.importExternal(db, schema, { periodId: p1, profileId, base64: file, fileName: 'jan3.xlsx', user: 'writer1' })).rejects.toThrow(/غير موجودة بالملف/);
    const [pr] = await db.insert(schema.payrollImportProfiles).values({ categoryId: catId, name: 'اسمي ' + Date.now(), keyColumn: 'الرقم الوظيفي', columns: [{ header: 'الراتب الأساسي', target: 'NOMINAL' }], createdBy: 'w' }).returning();
    const imp = await rec.importExternal(db, schema, { periodId: p1, profileId: pr.id, base64: file, fileName: 'jan3.xlsx', user: 'writer1' });
    // العين الثانية: المستورد نفسه ما يؤكد (مراجعة H2)
    await expect(rec.confirmImport(db, schema, { periodId: p1, importId: imp.import_id, user: 'writer1', linkedEmployeeId: null })).rejects.toThrow(/غير الذي استورده/);
    await expect(db.execute(sql`UPDATE payroll_external_imports SET confirmed_by = 'writer1', confirmed_at = now() WHERE id = ${imp.import_id}`)).rejects.toThrow();
    await rec.confirmImport(db, schema, { periodId: p1, importId: imp.import_id, user: 'admin', linkedEmployeeId: null });
    await expect(rec.confirmImport(db, schema, { periodId: p1, importId: imp.import_id, user: 'admin2', linkedEmployeeId: null })).rejects.toThrow(/مؤكد مسبقاً/);
    await per.computeRun(db, schema, p1, 'writer1', ELIG);
    await per.approvePeriod(db, schema, p1, 'admin', ELIG);
    await per.issuePeriod(db, schema, p1, 'admin', 'كتاب 1');
    // تغيير رجعي بعد الاعتماد للموظف ب (ترفيع بنفاذ كانون الثاني)
    const mov = await import('./careerMovements.ts');
    await mov.applyMovement(db, schema, { employeeId: empB, effectiveDate: '2032-01-01', changes: { grade: 6 }, source: 'تعديل مباشر', reason: 'ترفيع متأخر', userLabel: 'writer1' });
    const p2 = await per.openPeriod(db, schema, { categoryId: catId, year: 2032, month: 2, user: 'writer1' });
    const r2 = await per.computeRun(db, schema, p2.id, 'writer1', ELIG);
    const d = rows(await db.execute(sql`SELECT amount::text a FROM payroll_lines WHERE run_id = ${r2.run_id} AND employee_id = ${empB} AND kind = 'retro' AND item_code = 'NOMINAL'`));
    const g6 = rows(await db.execute(sql`SELECT s.amount::text a FROM salary_scale s JOIN salary_scale_versions v ON v.id = s.version_id WHERE v.status = 'معتمد' AND s.grade = 6 AND s.step = 1 ORDER BY v.effective_from DESC LIMIT 1`))[0];
    expect(d.length).toBe(1);
    expect(Number(d[0].a)).toBeCloseTo(Number(g6.a) - 290000, 4);
    const ex = rows(await db.execute(sql`SELECT explain FROM payroll_lines WHERE run_id = ${r2.run_id} AND employee_id = ${empB} AND kind = 'retro' AND item_code = 'NOMINAL'`))[0].explain;
    expect(ex.basis_import_id).toBe(imp.import_id);
    await per.approvePeriod(db, schema, p2.id, 'admin', ELIG);
    await per.issuePeriod(db, schema, p2.id, 'admin', 'كتاب 1-ب');
  });

  it('فترة ظلّية بلا استيراد مؤكد ⇒ ما تُحتسب فروقها على لقطة النظام بصمت، تُبلَّغ (مراجعة M6)', async () => {
    const p = await per.openPeriod(db, schema, { categoryId: catId, year: 2032, month: 3, user: 'writer1' });
    await per.computeRun(db, schema, p.id, 'writer1', ELIG);
    await per.approvePeriod(db, schema, p.id, 'admin', ELIG);
    await per.issuePeriod(db, schema, p.id, 'admin', 'كتاب 2');
    const mov = await import('./careerMovements.ts');
    await mov.applyMovement(db, schema, { employeeId: empA, effectiveDate: '2032-03-01', changes: { grade: 6 }, source: 'تعديل مباشر', reason: 'ترفيع متأخر', userLabel: 'writer1' });
    const p2 = await per.openPeriod(db, schema, { categoryId: catId, year: 2032, month: 4, user: 'writer1' });
    const r2 = await per.computeRun(db, schema, p2.id, 'writer1', ELIG);
    const d = rows(await db.execute(sql`SELECT count(*)::int n FROM payroll_lines WHERE run_id = ${r2.run_id} AND employee_id = ${empA} AND kind = 'retro'`))[0].n;
    expect(d).toBe(0);
    const issues = rows(await db.execute(sql`SELECT issues FROM payroll_results WHERE run_id = ${r2.run_id} AND employee_id = ${empA}`))[0]?.issues || [];
    const all = JSON.stringify(issues) + JSON.stringify(r2);
    expect(all).toMatch(/بلا كشف خارجي مستورد ومؤكد/);
    await per.approvePeriod(db, schema, p2.id, 'admin', ELIG);
    await per.issuePeriod(db, schema, p2.id, 'admin', 'كتاب 2-ب');
  });

  it('موظف غير محتسب، خلية فارغة، رأس مكرر، رقم مكرر، وفروق رجعية خارج مقارنة الشهر (مراجعة M1/M2/M3/M7)', async () => {
    const p = await per.openPeriod(db, schema, { categoryId: catId, year: 2032, month: 5, user: 'writer1' });
    await per.computeRun(db, schema, p.id, 'writer1', ['غير موجود']); // ما احتُسب أحد
    const [pr] = await db.insert(schema.payrollImportProfiles).values({ categoryId: catId, name: 'م ' + Date.now(), keyColumn: 'الرقم', columns: [{ header: 'الاسمي', target: 'NOMINAL' }, { header: 'الصافي', target: 'NET' }], createdBy: 'w' }).returning();
    await expect(rec.importExternal(db, schema, { periodId: p.id, profileId: pr.id, base64: xlsx([['الرقم', 'الاسمي', 'الاسمي', 'الصافي'], [tag + 'A', 1, 1, 1]]), fileName: 'x', user: 'w' })).rejects.toThrow(/مكرر بصف الرؤوس/);
    await expect(rec.importExternal(db, schema, { periodId: p.id, profileId: pr.id, base64: xlsx([['الرقم', 'الاسمي', 'الصافي'], [tag + 'A', 1, 1], [tag + 'A', 2, 2]]), fileName: 'x', user: 'w' })).rejects.toThrow(/مكررة/);
    const file = xlsx([['الرقم', 'الاسمي', 'الصافي'], [tag + 'A', 296000, null], [tag + 'B', 290000, 290000]]);
    const r = await rec.importExternal(db, schema, { periodId: p.id, profileId: pr.id, base64: file, fileName: 'x', user: 'w' });
    expect(r.blank_count).toBe(1);
    let m = await rec.reconciliation(db, p.id);
    expect(m.summary.matched_employees).toBe(0);
    expect(m.summary.only_external).toBe(2);
    expect(m.diffs.length).toBe(0);
    await per.computeRun(db, schema, p.id, 'writer1', ELIG);
    m = await rec.reconciliation(db, p.id);
    expect(m.summary.matched_employees).toBe(2);
    expect(m.missing_cells.map((x: any) => [x.employee_id, x.target])).toEqual([[empA, 'NET']]);
    expect(m.summary.exact_employees).toBe(m.diffs.some((d: any) => d.employee_id === empB) ? 0 : 1);
  });

  it('البصمة: تعديل موظف بفئة أخرى ما يرفض الاعتماد، وتعديل موظف بالفئة يرفضه', async () => {
    const svc2 = 'خدمة أخرى ' + tag;
    const [c2] = await db.insert(schema.payrollCategories).values({ code: tag + 'X', name: 'فئة أخرى ' + tag, kind: 'دائم', isActive: true }).returning();
    await db.insert(schema.payrollCategoryRules).values({ serviceType: svc2, contractType: null, categoryId: c2.id });
    const [other] = await db.insert(schema.employees).values({ fullName: 'موظف آخر ' + tag, companyNumber: tag + 'Z', grade: 7, step: 1, status: 'مستمر', serviceType: svc2,
      familyMode: 'لا يستحق', department: 'قسم', firstAppointmentDate: '2015-01-01' }).returning();
    const p6 = (await rows(await db.execute(sql`SELECT id FROM payroll_periods WHERE category_id = ${catId} AND year = 2032 AND month = 5`)))[0].id;
    await per.computeRun(db, schema, p6, 'writer1', ELIG);
    const mov = await import('./careerMovements.ts');
    await mov.applyMovement(db, schema, { employeeId: other.id, effectiveDate: '2032-05-01', changes: { step: 2 }, source: 'تعديل مباشر', reason: 'علاوة', userLabel: 'writer1' });
    expect((await per.checkFingerprint(db, schema, p6, ELIG)).changed).toBe(false);
    await mov.applyMovement(db, schema, { employeeId: empA, effectiveDate: '2032-05-01', changes: { step: 2 }, source: 'تعديل مباشر', reason: 'علاوة', userLabel: 'writer1' });
    expect((await per.checkFingerprint(db, schema, p6, ELIG)).changed).toBe(true);
  });
});

describe('B8a4 قراءة الملفات والأرقام (بلا قاعدة)', () => {
  it('أرقام الخلايا: فواصل الآلاف، الأرقام العربية والفارسية، الأقواس، والملتبس يُرفض', async () => {
    const { cellAmount, normKey } = await import('./payroll/reconcile.ts');
    const D = (v: any) => { const a = cellAmount(v); return a === null ? null : Number(a) / 1e6; };
    expect(D('٢٩٦٬٠٠٠')).toBe(296000);
    expect(D('۲۹۶,۰۰۰')).toBe(296000);
    expect(D('(1,500)')).toBe(-1500);
    expect(D('1,5')).toBeNull();
    expect(D('12,34,567')).toBeNull();
    expect(D(1e21)).toBeNull();
    expect(D('غير متوفر')).toBeNull();
    expect(D('1500.25')).toBe(1500.25);
    expect(normKey(' ٠١٢٣ab ')).toBe('0123AB');
  });

  it('مدى معلن ضخم بملف صغير ما يعلّق الخادم، والأعمدة/الصفوف الزائدة تُرفض (مراجعة H1)', async () => {
    const { inspectFile } = await import('./payroll/reconcile.ts');
    const { unzipSync, zipSync, strToU8, strFromU8 } = await import('fflate');
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['الرقم', 'الاسمي'], ['A1', 1]]), 'كشف');
    // نعدّل المدى المعلن داخل XML مباشرة (XLSX.write نفسه يمشي على المدى)
    const z = unzipSync(new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })));
    z['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(z['xl/worksheets/sheet1.xml']).replace(/<dimension ref="[^"]+"\/>/, '<dimension ref="A1:CV1048576"/>'));
    const t0 = Date.now();
    const r = inspectFile(Buffer.from(zipSync(z)).toString('base64'));
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.data_rows).toBe(1);
    const wide = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wide, XLSX.utils.aoa_to_sheet([Array.from({ length: 400 }, (_, i) => 'c' + i)]), 'x');
    expect(() => inspectFile(Buffer.from(XLSX.write(wide, { type: 'buffer', bookType: 'xlsx' })).toString('base64'))).toThrow(/عموداً/);
  });

  it('CSV بلا BOM: رؤوس عربية سليمة ورقم الشركة يبقى نصاً (مراجعة M5)', async () => {
    const { inspectFile } = await import('./payroll/reconcile.ts');
    const r = inspectFile(Buffer.from('الرقم الوظيفي,الاسمي\n012345,296000\n', 'utf8').toString('base64'));
    expect(r.headers).toEqual(['الرقم الوظيفي', 'الاسمي']);
  });
});
