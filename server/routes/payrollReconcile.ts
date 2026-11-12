// server/routes/payrollReconcile.ts — B8a4: ملفات تعريف الكشف الخارجي، الاستيراد، والمطابقة.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { requirePermission } from '../../src/middleware/auth.ts';
import { asc, eq, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { PayrollError } from '../payroll/catalog.ts';
import { inspectFile, importExternal, confirmImport, reconciliation, validateProfile, SPECIAL_TARGETS } from '../payroll/reconcile.ts';
import { linkedEmployeeId } from '../ownRecord.ts';

export function registerPayrollReconcileRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, sendRouteError } = ctx;
  const who = (req: any) => String(req.user?.username || '');
  const view = requirePermission('payroll.view'), enter = requirePermission('payroll.enter'), approve = requirePermission('payroll.approve');
  const fail = (res: any, err: any, op: string) => {
    if (err instanceof PayrollError || err?.status) return res.status(err.status || 400).json({ error: err.message });
    sendRouteError(res, err, op);
  };
  const idOf = (v: any) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new PayrollError('معرّف غير صالح'); return n; };
  const category = async (code: any) => {
    const [c] = await db.select().from(schema.payrollCategories).where(eq(schema.payrollCategories.code, String(code || 'PERM')));
    if (!c) throw new PayrollError('فئة الرواتب غير موجودة', 404);
    return c;
  };
  const itemCodes = async (categoryId: number) => new Set<string>(((await db.execute(sql`SELECT code FROM pay_items WHERE category_id = ${categoryId}`)) as any).rows.map((r: any) => r.code));

  app.get('/api/payroll/import-profiles', requireAuth, view, async (req, res) => {
    try {
      const c = await category(req.query.category);
      res.json({ profiles: await db.select().from(schema.payrollImportProfiles).where(eq(schema.payrollImportProfiles.categoryId, c.id)).orderBy(asc(schema.payrollImportProfiles.name)),
        targets: { ...SPECIAL_TARGETS }, items: ((await db.execute(sql`SELECT code, name FROM pay_items WHERE category_id = ${c.id} ORDER BY id`)) as any).rows });
    } catch (err: any) { fail(res, err, 'ملفات التعريف'); }
  });
  const saveProfile = async (req: any, id: number | null) => {
    const c = await category(req.body?.category);
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new PayrollError('اسم ملف التعريف مطلوب');
    const v = validateProfile(req.body, await itemCodes(c.id));
    return db.transaction(async (tx: any) => {
      const row = { categoryId: c.id, name, keyColumn: v.keyColumn, columns: v.columns, createdBy: who(req), updatedAt: new Date() };
      const [r] = id ? await tx.update(schema.payrollImportProfiles).set(row).where(eq(schema.payrollImportProfiles.id, id)).returning()
        : await tx.insert(schema.payrollImportProfiles).values(row).returning();
      if (!r) throw new PayrollError('ملف التعريف غير موجود', 404);
      await tx.insert(schema.payrollAudit).values({ actor: who(req), action: id ? 'تعديل ملف تعريف كشف خارجي' : 'إضافة ملف تعريف كشف خارجي', entity: 'payroll_import_profiles', entityId: String(r.id), after: row });
      return r;
    });
  };
  app.post('/api/payroll/import-profiles', requireAuth, enter, async (req, res) => {
    try { res.status(201).json(await saveProfile(req, null)); }
    catch (err: any) { if (err?.cause?.code === '23505' || err?.code === '23505') return res.status(409).json({ error: 'الاسم مستعمل لهذه الفئة' }); fail(res, err, 'حفظ ملف التعريف'); }
  });
  app.put('/api/payroll/import-profiles/:id', requireAuth, enter, async (req, res) => {
    try {
      const id = idOf(req.params.id);
      const [old] = await db.select().from(schema.payrollImportProfiles).where(eq(schema.payrollImportProfiles.id, id));
      if (!old) throw new PayrollError('ملف التعريف غير موجود', 404);
      const c = await category(req.body?.category);
      if (c.id !== old.categoryId) throw new PayrollError('ما يُنقل ملف التعريف لفئة أخرى؛ أنشئ ملفاً جديداً');
      res.json(await saveProfile(req, id));
    } catch (err: any) { if (err?.cause?.code === '23505' || err?.code === '23505') return res.status(409).json({ error: 'الاسم مستعمل لهذه الفئة' }); fail(res, err, 'حفظ ملف التعريف'); }
  });

  // رؤوس الأعمدة فقط (ما يُحفظ شيء) لبناء ملف التعريف
  app.post('/api/payroll/external/inspect', requireAuth, enter, async (req, res) => {
    try { res.json(inspectFile(req.body?.file_base64, req.body?.sheet)); } catch (err: any) { fail(res, err, 'قراءة الملف'); }
  });

  app.post('/api/payroll/periods/:id/external-import', requireAuth, enter, async (req, res) => {
    try {
      res.json(await importExternal(db, schema, { periodId: idOf(req.params.id), profileId: idOf(req.body?.profile_id), base64: req.body?.file_base64, fileName: req.body?.file_name, user: who(req), sheet: req.body?.sheet }));
    } catch (err: any) { fail(res, err, 'استيراد الكشف الخارجي'); }
  });

  // عين ثانية: مستخدم بصلاحية الاعتماد غير المستورد يؤكد الاستيراد قبل أن يصير أساساً للفروق الظلّية (مراجعة H2)
  app.post('/api/payroll/periods/:id/external-import/:importId/confirm', requireAuth, approve, async (req, res) => {
    try {
      res.json(await confirmImport(db, schema, { periodId: idOf(req.params.id), importId: idOf(req.params.importId), user: who(req), linkedEmployeeId: await linkedEmployeeId(db, who(req)) }));
    } catch (err: any) { fail(res, err, 'تأكيد الاستيراد'); }
  });

  app.get('/api/payroll/periods/:id/reconciliation', requireAuth, view, async (req, res) => {
    try {
      const r: any = await reconciliation(db, idOf(req.params.id));
      if (req.query.format !== 'xlsx') return res.json({ ...r, diffs: r.diffs?.slice(0, 2000), missing_cells: r.missing_cells?.slice(0, 500) });
      if (!r.has_run) throw new PayrollError('ما في استيراد أو احتساب للمطابقة', 409);
      const wb = XLSX.utils.book_new(); (wb as any).Workbook = { Views: [{ RTL: true }] };
      const lab = (t: string) => r.targets.find((x: any) => x.code === t)?.label ?? t;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['المطابقة مع الكشف الخارجي'], [`الملف: ${r.import.file_name}`, `استورده: ${r.import.imported_by}`, `بصمة: ${String(r.import.file_sha256).slice(0, 16)}`],
        [], ['الموظفون المطابقون', r.summary.matched_employees], ['مطابقون تماماً', r.summary.exact_employees], ['بفروق', r.summary.with_diffs], ['نسبة المطابقة %', r.summary.match_pct],
        ['بالكشف الخارجي فقط', r.summary.only_external], ['بالنظام فقط', r.summary.only_system], ['خلايا ناقصة بالكشف', r.summary.missing_cells],
        ['التأكيد', r.import.confirmed_by ? `${r.import.confirmed_by} — ${new Date(r.import.confirmed_at).toISOString().slice(0, 16)}` : 'غير مؤكد'], [], ['الهدف', 'النظام', 'الخارجي', 'الفرق'],
        ...Object.entries(r.totals).map(([k, v]: any) => [lab(k), Number(v.system), Number(v.external), Number(v.diff)]),
      ]), 'الملخص');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['رقم الشركة', 'الاسم', 'الهدف', 'النظام', 'الخارجي', 'الفرق'], ...r.diffs.map((d: any) => [d.company_number, d.name, lab(d.target), Number(d.system), Number(d.external), Number(d.diff)])]), 'الفروق');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['رقم الشركة', 'الاسم', 'الموقع'], ...r.only_system.map((x: any) => [x.company_number, x.name, 'بالنظام فقط']), ...r.only_external.map((x: any) => [x.company_number ?? '', x.name ?? `موظف ${x.employee_id}`, 'بالكشف الخارجي فقط (ما احتسبه النظام)'])]), 'غير المتطابقين');
      if (r.missing_cells.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['رقم الشركة', 'الاسم', 'الهدف', 'النظام', 'الكشف'], ...r.missing_cells.map((d: any) => [d.company_number, d.name, lab(d.target), Number(d.system), 'فارغة/غير رقمية'])]), 'خلايا ناقصة');
      await db.insert(schema.activityLogs).values({ action: 'تصدير المطابقة', userEmail: who(req) || null, details: `الفترة ${req.params.id}، الاستيراد ${r.import.id}` });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`المطابقة-${req.params.id}.xlsx`)}`);
      res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    } catch (err: any) { fail(res, err, 'المطابقة'); }
  });
}
