// server/payroll/reconcile.ts — B8a4: المطابقة مع كشف الرواتب الخارجي (القسم 14، س11.3، س12.8).
// صيغة الملف غير معروفة مسبقاً: ملف تعريف يربط رؤوس الأعمدة بالأهداف (بند / الاسمي / الصافي...)،
// والملف نفسه ما يُحفظ — بصمته والمبالغ المربوطة فقط.
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { sql, eq } from 'drizzle-orm';
import { PayrollError } from './catalog.ts';
import { money, toDecimal } from './money.ts';

const rows = (r: any) => ((r as any).rows ?? r) as any[];
export const SPECIAL_TARGETS = { NOMINAL: 'الراتب الاسمي', NET: 'الصافي', ALLOWANCES: 'مجموع المخصصات', DEDUCTIONS: 'مجموع الاستقطاعات' } as const;
const MAX_FILE = 7 * 1024 * 1024; // حد جسم الطلب 10MB بعد ترميز base64
const MAX_UNZIPPED = 80 * 1024 * 1024; // قنبلة الضغط (مراجعة H1)
export const MAX_ROWS = 20_000, MAX_COLS = 300;
const norm = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();
const TOLERANCE = money(1); // فرق أقل من دينار = تقريب
const asciiDigits = (s: string) => s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
/** مفتاح رقم الشركة: أرقام لاتينية، بلا مسافات، حروف كبيرة — بلا تخمين أصفار بادئة (مراجعة M5). */
export const normKey = (v: any) => asciiDigits(typeof v === 'number' && Number.isInteger(v) ? String(v) : String(v ?? '')).replace(/\s+/g, '').toUpperCase();

/** مجموع الأحجام غير المضغوطة المعلنة بالدليل المركزي لملف zip (xlsx). */
function zipUncompressed(buf: Buffer) {
  let total = 0;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    let off = buf.readUInt32LE(i + 16); const n = buf.readUInt16LE(i + 10);
    for (let k = 0; k < n && off + 46 <= buf.length && buf.readUInt32LE(off) === 0x02014b50; k++) {
      total += buf.readUInt32LE(off + 24);
      off += 46 + buf.readUInt16LE(off + 28) + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
    }
    return total;
  }
  return 0;
}

/** نص CSV: UTF-8 (مع/بلا BOM) وإلا Windows-1256 العربي. */
function decodeText(buf: Buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1256').decode(buf); }
}

/** يقرأ ورقة العمل الأولى (أو المسماة) كصفوف خام، بحدود صفوف وأعمدة ومدى فعلي (مراجعة H1). */
function readSheet(base64: string, sheetName?: string) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length) throw new PayrollError('الملف فارغ');
  if (buf.length > MAX_FILE) throw new PayrollError('الملف أكبر من 7 ميغابايت؛ احذف الأوراق والأعمدة غير اللازمة');
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b, isOle = buf.readUInt32BE(0) === 0xd0cf11e0;
  if (isZip && zipUncompressed(buf) > MAX_UNZIPPED) throw new PayrollError('محتوى الملف بعد فك الضغط كبير جداً؛ احذف الأوراق غير اللازمة');
  const opts = { sheetRows: MAX_ROWS + 2, cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false } as const;
  // CSV/نص: يبقى نصاً (رقم الشركة 012345 ما يصير 12345) — مراجعة M5
  const wb = isZip || isOle ? XLSX.read(buf, { type: 'buffer', ...opts }) : XLSX.read(decodeText(buf), { type: 'string', raw: true, ...opts });
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  if (!name) throw new PayrollError('ما في أوراق بالملف');
  const ws = wb.Sheets[name];
  // المدى المعلن (!ref) قد يكون مليون صف لملف صغير: نحسب المدى من الخلايا الموجودة فعلاً
  let maxR = -1, maxC = -1, cells = 0;
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue;
    const a = XLSX.utils.decode_cell(k); cells++;
    if (a.r > maxR) maxR = a.r; if (a.c > maxC) maxC = a.c;
  }
  if (maxC + 1 > MAX_COLS) throw new PayrollError(`الورقة فيها أكثر من ${MAX_COLS} عموداً؛ احذف الأعمدة غير اللازمة`);
  if (maxR + 1 > MAX_ROWS + 1) throw new PayrollError(`الورقة فيها أكثر من ${MAX_ROWS} صفاً؛ قسّم الملف`);
  ws['!ref'] = maxR < 0 ? 'A1:A1' : XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  const aoa: any[][] = maxR < 0 ? [] : XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  return { aoa, sheet: name, sheets: wb.SheetNames, cells, sha256: createHash('sha256').update(buf).digest('hex') };
}

/** يحدد صف الرؤوس: أول صف (من أول 30) فيه عمود المفتاح؛ أو أكثر صف نصوصاً. */
function headerRow(aoa: any[][], keyColumn?: string) {
  const top = aoa.slice(0, 30);
  if (keyColumn) {
    const i = top.findIndex(r => (r || []).some(c => norm(c) === norm(keyColumn)));
    if (i >= 0) return i;
    throw new PayrollError(`عمود المفتاح «${keyColumn}» غير موجود بأول 30 صفاً`);
  }
  let best = 0, bestN = -1;
  top.forEach((r, i) => { const n = (r || []).filter(c => typeof c === 'string' && norm(c)).length; if (n > bestN) { best = i; bestN = n; } });
  return best;
}

/** رؤوس الأعمدة وعينة صغيرة (بلا حفظ) لبناء ملف التعريف. */
export function inspectFile(base64: string, sheetName?: string) {
  const { aoa, sheet, sheets } = readSheet(base64, sheetName);
  const h = headerRow(aoa);
  const headers = (aoa[h] || []).map(norm).filter(Boolean);
  return { sheet, sheets, header_row: h + 1, headers, data_rows: Math.max(0, aoa.length - h - 1) };
}

/** رقم من خلية: يقبل فواصل الآلاف والأرقام العربية/الفارسية والأقواس للسالب، ويرفض غير الرقمي أو الملتبس (لا قيم مختلقة — AGENTS 2). */
export function cellAmount(v: any): bigint | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) < 1e13 ? money(v) : null;
  let s = asciiDigits(String(v)).replace(/\s+/g, '').replace('٫', '.');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { if (neg) return null; neg = true; s = s.slice(1); }
  if (/[,،٬]/.test(s)) { if (!/^\d{1,3}([,،٬]\d{3})+(\.\d+)?$/.test(s)) return null; s = s.replace(/[,،٬]/g, ''); } // «1,5» ملتبس: يُرفض
  if (!/^\d+(\.\d{1,6})?$/.test(s) || s.replace('.', '').replace(/^0+/, '').length > 15) return null;
  try { const m = money(s); return neg ? -m : m; } catch { return null; }
}

export function validateProfile(p: any, itemCodes: Set<string>) {
  const keyColumn = norm(p?.key_column);
  if (!keyColumn) throw new PayrollError('عمود رقم الشركة مطلوب');
  if (!Array.isArray(p?.columns) || !p.columns.length) throw new PayrollError('اربط عموداً واحداً على الأقل');
  if (p.columns.length > 200 || keyColumn.length > 200) throw new PayrollError('ملف التعريف كبير جداً');
  const seen = new Set<string>();
  const columns = p.columns.map((c: any) => {
    const header = norm(c?.header), target = String(c?.target ?? '').trim();
    if (!header || !target) throw new PayrollError('كل ربط يحتاج رأس عمود وهدفاً');
    if (!(target in SPECIAL_TARGETS) && !itemCodes.has(target)) throw new PayrollError(`هدف غير معروف: ${target}`);
    if (seen.has(header)) throw new PayrollError(`العمود مكرر: ${header}`);
    if (header === keyColumn) throw new PayrollError('عمود رقم الشركة ما يُربط كمبلغ');
    seen.add(header);
    return { header, target };
  });
  return { keyColumn, columns };
}

/** موظفو فئة الفترة: حسب قواعد الفئة الحالية + من ظهر باحتسابها الحالي. */
async function categoryEmployees(db: any, period: any) {
  return new Set<number>(rows(await db.execute(sql`SELECT e.id FROM employees e JOIN payroll_category_rules cr ON cr.category_id = ${period.categoryId} AND cr.service_type = e.service_type
      AND (cr.contract_type IS NULL OR cr.contract_type = e.contract_type)
    UNION SELECT employee_id FROM payroll_results WHERE run_id = ${period.currentRunId ?? 0}`)).map(r => Number(r.id ?? r.employee_id)));
}

/** يستورد ملف الفترة بملف التعريف: يستبدل الاستيراد السابق، ويخزن المبالغ المربوطة فقط ولقطة الربط. */
export async function importExternal(db: any, schema: any, o: { periodId: number; profileId: number; base64: string; fileName: string; user: string; sheet?: string }) {
  const [period] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, o.periodId));
  if (!period) throw new PayrollError('الفترة غير موجودة', 404);
  const [profile] = await db.select().from(schema.payrollImportProfiles).where(eq(schema.payrollImportProfiles.id, o.profileId));
  if (!profile || profile.categoryId !== period.categoryId) throw new PayrollError('ملف التعريف غير موجود لهذه الفئة', 404);
  const { aoa, sha256, sheet } = readSheet(o.base64, o.sheet);
  const h = headerRow(aoa, profile.keyColumn);
  const header = (aoa[h] || []).map(norm);
  // رأس مكرر (مثل «المبلغ» تحت مجموعتين) ملتبس: يُرفض بدل أخذ أول عمود (مراجعة M7)
  const colOf = (name: string) => {
    const idx = header.flatMap((x, i) => (x === norm(name) ? [i] : []));
    if (idx.length > 1) throw new PayrollError(`العمود «${name}» مكرر بصف الرؤوس؛ غيّر اسم أحدهما بالملف`);
    return idx.length ? idx[0] : -1;
  };
  const keyIdx = colOf(profile.keyColumn);
  const cols = (profile.columns as any[]).map(c => ({ ...c, idx: colOf(c.header) }));
  const missing = cols.filter(c => c.idx < 0).map(c => c.header);
  if (missing.length) throw new PayrollError(`أعمدة ملف التعريف غير موجودة بالملف: ${missing.join('، ')}`);
  const emps = new Map<string, number>(rows(await db.execute(sql`SELECT id, company_number FROM employees WHERE company_number IS NOT NULL`)).map(r => [normKey(r.company_number), Number(r.id)]));
  const inCategory = await categoryEmployees(db, period);
  const out: { employeeId: number; target: string; amount: string }[] = [];
  const unmatched: string[] = []; const badCells: string[] = []; const blankCells: string[] = []; const otherCategory: string[] = [];
  const keyRows = new Map<string, number>(); const dupKeys: string[] = [];
  let dataRows = 0, unmatchedN = 0, badN = 0, blankN = 0; const seenEmp = new Set<number>();
  for (let r = h + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const key = normKey(row[keyIdx]);
    if (!key) continue;
    dataRows++;
    if (keyRows.has(key)) { if (dupKeys.length < 50) dupKeys.push(`${key} (الصفان ${keyRows.get(key)! + 1} و${r + 1})`); continue; }
    keyRows.set(key, r);
    const eid = emps.get(key);
    if (!eid) { unmatchedN++; if (unmatched.length < 500) unmatched.push(key); continue; }
    if (!inCategory.has(eid)) { if (otherCategory.length < 500) otherCategory.push(key); continue; }
    seenEmp.add(eid);
    for (const c of cols) {
      const v = row[c.idx];
      if (v === null || v === undefined || norm(v) === '') { blankN++; if (blankCells.length < 200) blankCells.push(`${key}: ${c.header}`); continue; }
      const a = cellAmount(v);
      if (a === null) { badN++; if (badCells.length < 200) badCells.push(`${key}: ${c.header} = «${String(v).slice(0, 40)}»`); continue; }
      out.push({ employeeId: eid, target: c.target, amount: toDecimal(a) });
    }
  }
  if (!dataRows) throw new PayrollError('ما في صفوف بيانات تحت صف الرؤوس');
  // رقم شركة مكرر: جمع الصفين أو أخذ أحدهما تخمين؛ يُرفض الاستيراد حتى يُصحح الملف (مراجعة M7)
  if (dupKeys.length) throw new PayrollError(`أرقام شركة مكررة بالملف (ادمج صفوف الموظف الواحد): ${dupKeys.slice(0, 10).join('، ')}`);
  const mapping = { key_column: profile.keyColumn, columns: profile.columns, profile_name: profile.name, sheet, header_row: h + 1 };
  const report = { keys: unmatched, unmatched_count: unmatchedN, other_category: otherCategory, bad_cells: badCells, bad_count: badN, blank_cells: blankCells, blank_count: blankN };
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'payroll:import:' + o.periodId}))`);
    const [prev] = rows(await tx.execute(sql`SELECT id, confirmed_by FROM payroll_external_imports WHERE period_id = ${o.periodId} AND superseded_at IS NULL`));
    await tx.execute(sql`UPDATE payroll_external_imports SET superseded_at = now() WHERE period_id = ${o.periodId} AND superseded_at IS NULL`);
    const [imp] = await tx.insert(schema.payrollExternalImports).values({ periodId: o.periodId, profileId: o.profileId, fileName: String(o.fileName || 'ملف').slice(0, 200), fileSha256: sha256,
      rows: dataRows, matched: seenEmp.size, unmatched: report, mapping, importedBy: o.user }).returning();
    for (let i = 0; i < out.length; i += 1000) await tx.insert(schema.payrollExternalAmounts).values(out.slice(i, i + 1000).map(x => ({ ...x, importId: imp.id })));
    await tx.insert(schema.payrollAudit).values({ actor: o.user, action: 'استيراد كشف خارجي', entity: 'payroll_periods', entityId: String(o.periodId),
      before: prev ? { import_id: prev.id, confirmed_by: prev.confirmed_by } : null,
      after: { import_id: imp.id, file_sha256: sha256, period_status: period.status, pay_source: period.paySource, rows: dataRows, matched: seenEmp.size, unmatched: unmatchedN, other_category: otherCategory.length, bad_cells: badN, blank_cells: blankN } });
    return { import_id: imp.id, rows: dataRows, matched: seenEmp.size, unmatched: unmatchedN, other_category: otherCategory.length, bad_cells: badCells.slice(0, 20), bad_count: badN,
      blank_cells: blankCells.slice(0, 20), blank_count: blankN, amounts: out.length, needs_confirmation: true };
  });
}

/** تأكيد الاستيراد الحي من مستخدم ثانٍ (عين ثانية): شرط استعماله أساساً للفروق الظلّية (مراجعة H2). */
export async function confirmImport(db: any, schema: any, o: { periodId: number; importId: number; user: string; linkedEmployeeId: number | null }) {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'payroll:import:' + o.periodId}))`);
    const [imp] = rows(await tx.execute(sql`SELECT * FROM payroll_external_imports WHERE id = ${o.importId} AND period_id = ${o.periodId} FOR UPDATE`));
    if (!imp) throw new PayrollError('الاستيراد غير موجود', 404);
    if (imp.superseded_at) throw new PayrollError('استُبدل هذا الاستيراد باستيراد أحدث', 409);
    if (imp.confirmed_by) throw new PayrollError('الاستيراد مؤكد مسبقاً', 409);
    if (imp.imported_by === o.user) throw new PayrollError('يؤكد الاستيراد مستخدم غير الذي استورده', 403);
    await tx.execute(sql`UPDATE payroll_external_imports SET confirmed_by = ${o.user}, confirmed_at = now() WHERE id = ${o.importId}`);
    await tx.insert(schema.payrollAudit).values({ actor: o.user, action: 'تأكيد استيراد كشف خارجي', entity: 'payroll_periods', entityId: String(o.periodId),
      after: { import_id: o.importId, file_sha256: imp.file_sha256, imported_by: imp.imported_by, confirmer_in_file: o.linkedEmployeeId !== null
        && rows(await tx.execute(sql`SELECT 1 FROM payroll_external_amounts WHERE import_id = ${o.importId} AND employee_id = ${o.linkedEmployeeId} LIMIT 1`)).length > 0 } });
    return { import_id: o.importId, confirmed_by: o.user };
  });
}

/** المبالغ المستوردة الحية للفترة: موظف ← هدف ← مبلغ. */
export async function externalAmounts(db: any, periodId: number) {
  const [imp] = rows(await db.execute(sql`SELECT * FROM payroll_external_imports WHERE period_id = ${periodId} AND superseded_at IS NULL`));
  if (!imp) return null;
  const m = new Map<number, Map<string, bigint>>();
  for (const r of rows(await db.execute(sql`SELECT employee_id, target, amount::text a FROM payroll_external_amounts WHERE import_id = ${imp.id} ORDER BY employee_id, id`))) {
    const e = Number(r.employee_id);
    const t = m.get(e) || m.set(e, new Map()).get(e)!;
    t.set(r.target, (t.get(r.target) ?? 0n) + money(r.a));
  }
  return { import: imp, amounts: m };
}

/** المطابقة: لكل موظف ولكل هدف بلقطة ربط الاستيراد، مبلغ النظام (الاحتساب الحالي، الشهر نفسه بلا فروق رجعية — س14.3) مقابل المستورد. */
export async function reconciliation(db: any, periodId: number) {
  const ext = await externalAmounts(db, periodId);
  if (!ext) return { has_import: false };
  const [p] = rows(await db.execute(sql`SELECT current_run_id FROM payroll_periods WHERE id = ${periodId}`));
  if (!p?.current_run_id) return { has_import: true, import: ext.import, has_run: false };
  const runId = Number(p.current_run_id);
  const res = new Map(rows(await db.execute(sql`SELECT employee_id, computed, nominal::text nominal, allowances::text allowances, deductions::text deductions, net::text net, snapshot
    FROM payroll_results WHERE run_id = ${runId}`)).map(r => [Number(r.employee_id), r]));
  const byItem = new Map<number, Map<string, bigint>>();
  // الفروق الرجعية (kind retro) عن أشهر سابقة ما تدخل: الكشف الخارجي لنفس الشهر (مراجعة M3)
  for (const l of rows(await db.execute(sql`SELECT employee_id, item_code, amount::text a FROM payroll_lines WHERE run_id = ${runId} AND kind IN ('item', 'cap', 'deduction') ORDER BY employee_id, seq`))) {
    const e = Number(l.employee_id); const t = byItem.get(e) || byItem.set(e, new Map()).get(e)!;
    t.set(l.item_code, (t.get(l.item_code) ?? 0n) + money(l.a));
  }
  const mapped = ((ext.import.mapping?.columns as any[]) || []).map(c => String(c.target));
  const targets = [...new Set([...mapped, ...[...ext.amounts.values()].flatMap(m => [...m.keys()])])];
  const computed = (eid: number) => !!res.get(eid)?.computed;
  const sysValue = (eid: number, target: string): bigint => {
    const r = res.get(eid)!;
    if (target === 'NOMINAL') return money(r.nominal);
    if (target === 'NET') return money(r.net);
    if (target === 'ALLOWANCES') return money(r.allowances);
    if (target === 'DEDUCTIONS') return money(r.deductions);
    return byItem.get(eid)?.get(target) ?? 0n; // البند ما صُرف بالنظام = صفر فعلاً (الاحتساب تم)
  };
  const diffs: any[] = []; const missingCells: any[] = []; const totals: Record<string, { system: bigint; external: bigint }> = {};
  const onlyExternal: number[] = []; const onlySystem: number[] = [];
  for (const t of targets) totals[t] = { system: 0n, external: 0n };
  const who = (eid: number) => ({ employee_id: eid, company_number: res.get(eid)?.snapshot?.company_number ?? null, name: res.get(eid)?.snapshot?.full_name ?? null });
  for (const [eid, m] of ext.amounts) {
    // موظف ما احتسبه النظام ليس «صرف صفراً»: يظهر بالخارجي فقط ولا يدخل الفروق والمجاميع (مراجعة M1)
    if (!computed(eid)) { onlyExternal.push(eid); continue; }
    for (const t of targets) {
      const s = sysValue(eid, t);
      // خلية فارغة/غير رقمية بالملف ما تعني صفراً: تظهر «ناقصة بالكشف» مع مبلغ النظام (مراجعة M2)
      if (!m.has(t)) { missingCells.push({ ...who(eid), target: t, system: toDecimal(s) }); continue; }
      const e = m.get(t)!;
      totals[t].system += s; totals[t].external += e;
      const d = s - e;
      if (d > TOLERANCE || d < -TOLERANCE) diffs.push({ ...who(eid), target: t, system: toDecimal(s), external: toDecimal(e), diff: toDecimal(d) });
    }
  }
  for (const [eid, r] of res) if (r.computed && !ext.amounts.has(eid)) onlySystem.push(eid);
  const extNames = onlyExternal.length ? new Map(rows(await db.execute(sql`SELECT id, full_name, company_number FROM employees WHERE id = ANY(${sql.raw(`ARRAY[${onlyExternal.join(',')}]::int[]`)})`)).map(r => [Number(r.id), r])) : new Map();
  const matchedEmployees = [...ext.amounts.keys()].filter(computed).length;
  const notExact = new Set([...diffs, ...missingCells].map(d => d.employee_id));
  const exactEmployees = matchedEmployees - notExact.size;
  return {
    has_import: true, has_run: true, run_id: runId, import: ext.import, confirmed: !!ext.import.confirmed_by, targets: targets.map(t => ({ code: t, label: (SPECIAL_TARGETS as any)[t] ?? t })),
    summary: { matched_employees: matchedEmployees, exact_employees: exactEmployees, with_diffs: new Set(diffs.map(d => d.employee_id)).size, missing_cells: missingCells.length,
      only_external: onlyExternal.length, only_system: onlySystem.length, match_pct: matchedEmployees ? Math.round(exactEmployees / matchedEmployees * 1000) / 10 : 0 },
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, { system: toDecimal(v.system), external: toDecimal(v.external), diff: toDecimal(v.system - v.external) }])),
    diffs: diffs.sort((a, b) => Math.abs(Number(b.diff)) - Math.abs(Number(a.diff))),
    missing_cells: missingCells.slice(0, 2000),
    only_external: onlyExternal.slice(0, 500).map(e => ({ employee_id: e, name: extNames.get(e)?.full_name ?? null, company_number: extNames.get(e)?.company_number ?? null })),
    only_system: onlySystem.slice(0, 500).map(e => who(e)),
  };
}
