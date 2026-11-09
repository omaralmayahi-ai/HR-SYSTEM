// npm run db:import-local [-- --apply]   (B2، قرار ق-1 وموافقة عمر 2026-11-09)
// ينقل من data/local_storage.json إلى القاعدة ما وافق عليه المالك فقط:
//   - سجلات «في الملف فقط» في: الشهادات، الترفيعات والعلاوات، الحضور
//   - متطلبات الدرجات (لا جدول لها سابقاً) ← app_settings_documents
//   - قواعد الإعفاء من الدورات إذا كان جدولها فارغاً
// لا يُنقل: القوائم الافتراضية من الكود، أرصدة الإجازات (القاعدة أحدث)، سجلات الترحيل، أسباب التأخير (مشتقة).
// بدون --apply: تشغيل تجريبي يعرض ما سيُنقل فقط. مع --apply: معاملة واحدة، ويرفض العمل والخادم يعمل.
// كل سجل يُدرج بمعرّف جديد، ويُعاد ربط employee_id عبر رقم الشركة (ق-17).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../../src/db/index.ts';
import { decryptData } from '../../src/lib/cryptoStorage.ts';
import { isDbConnectionFailure } from '../../src/lib/referentialIntegrity.ts';
import { diffRecord } from './localdiff.ts';

const APPLY = process.argv.includes('--apply');
const RECORD_STORES: Record<string, string> = {
  inMemoryQualifications: 'qualifications',
  inMemoryPromotions: 'promotions_increments',
  inMemoryAttendance: 'attendance',
};
const IDENTITY_COLS = ['company_number', 'employee_id', 'training_id', 'name', 'title'];
const MARKER_KEY = 'local_storage_import';
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const SHOW_COLS = ['order_date', 'date', 'attendance_date', 'promotion_date', 'effective_date', 'graduation_year', 'type', 'level', 'status'];

/** يحوّل سجل الملف إلى أعمدة الجدول (snake_case)، بلا id، والقيم الكائنية نصاً JSON. */
export function toRow(rec: Record<string, any>, cols: Map<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(rec)) {
    const c = cols.has(k) ? k : snake(k);
    if (!cols.has(c) || c === 'id' || c in out) continue;
    const t = cols.get(c)!;
    if (v === undefined) continue;
    out[c] = v !== null && typeof v === 'object' && !['json', 'jsonb'].includes(t) ? JSON.stringify(v) : v === '' ? null : v;
  }
  return out;
}

async function serverIsRunning(): Promise<boolean> {
  const port = Number(process.env.PORT) || 5000;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`http://127.0.0.1:${port}/api/settings/public`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.status > 0;
  } catch { return false; }
}

async function main() {
  const dataFile = path.resolve(process.cwd(), 'data', 'local_storage.json');
  if (!fs.existsSync(dataFile)) { console.log('لا يوجد data/local_storage.json — لا شيء للنقل.'); return 0; }
  if (APPLY && await serverIsRunning()) {
    console.error('✖ النظام يعمل الآن. أوقفه أولاً (control-app.bat stop) حتى لا يعيد كتابة الملف أثناء النقل.');
    return 1;
  }
  const raw = fs.readFileSync(dataFile, 'utf8');
  let state: any;
  try { state = JSON.parse(decryptData(raw)); } catch { try { state = JSON.parse(raw); } catch { console.error('✖ تعذّر فك تشفير الملف.'); return 1; } }

  const client = await pool.connect();
  try {
    const colsOf = async (t: string) => new Map<string, string>((await client.query(`SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t])).rows.map((r: any) => [r.column_name, r.udt_name]));
    const marker = (await client.query('SELECT value FROM app_settings_documents WHERE key = $1', [MARKER_KEY])).rows[0]?.value || { imported: [] };
    const already = new Set<string>(marker.imported || []);

    // خريطة الموظفين: id في الملف ← رقم الشركة ← id في القاعدة
    const fileEmp = new Map<string, string>();
    for (const e of state.inMemoryEmployees || []) if (e?.id != null) fileEmp.set(String(e.id), String(e.companyNumber ?? e.company_number ?? '').trim());
    const dbEmp = new Map<string, number>((await client.query('SELECT id, company_number FROM employees WHERE company_number IS NOT NULL')).rows.map((r: any) => [String(r.company_number).trim(), r.id]));

    const plan: { store: string; table: string; row: Record<string, any>; show: string; tag: string }[] = [];
    const skipped: string[] = [];
    for (const [store, table] of Object.entries(RECORD_STORES)) {
      const list: any[] = Array.isArray(state[store]) ? state[store] : [];
      if (!list.length) continue;
      const cols = await colsOf(table);
      const dbRows = new Map<string, any>((await client.query(`SELECT * FROM "${table}"`)).rows.map((r: any) => [String(r.id), r]));
      for (const rec of list) {
        const tag = `${store}:${rec?.id}`;
        if (already.has(tag)) { skipped.push(`${tag} نُقل سابقاً`); continue; }
        const dbRec = rec?.id != null ? dbRows.get(String(rec.id)) : undefined;
        if (dbRec) {
          const f = diffRecord(rec, dbRec, new Set(cols.keys()));
          if (!f.some((c) => IDENTITY_COLS.includes(c))) continue; // نفس السجل موجود في القاعدة
        }
        const row = toRow(rec, cols);
        if ('employee_id' in row) {
          const company = fileEmp.get(String(row.employee_id));
          const newEmp = company ? dbEmp.get(company) : undefined;
          if (!newEmp) { skipped.push(`${tag}: الموظف (id ${row.employee_id} في الملف) غير موجود في القاعدة برقم الشركة`); continue; }
          row.employee_id = newEmp;
        }
        const company = [...dbEmp.entries()].find(([, id]) => id === row.employee_id)?.[0] || '—';
        const show = `رقم الشركة ${company}` + SHOW_COLS.filter((c) => row[c] != null).map((c) => ` · ${c}=${String(row[c]).slice(0, 20)}`).join('');
        plan.push({ store, table, row, show, tag });
      }
    }

    // متطلبات الدرجات
    const gr = state.inMemoryGradeRequirements;
    const hasGr = (await client.query(`SELECT 1 FROM app_settings_documents WHERE key='grade_requirements'`)).rowCount;
    const doGr = gr && typeof gr === 'object' && Object.keys(gr).length > 0 && !hasGr;
    // قواعد الإعفاء
    const ex = state.inMemoryExemptionRules;
    const exCount = (await client.query('SELECT COUNT(*)::int AS n FROM governing_course_exemption_rules')).rows[0].n;
    const doEx = ex && typeof ex === 'object' && exCount === 0;

    console.log(APPLY ? '════ نقل (تنفيذ فعلي) ════' : '════ تشغيل تجريبي: لا يُكتب شيء (أضف --apply للتنفيذ) ════');
    for (const p of plan) console.log(`  + ${p.table}: ${p.show}`);
    if (doGr) console.log(`  + متطلبات الدرجات: ${Object.keys(gr).length} درجة ← app_settings_documents`);
    else if (hasGr) console.log('  = متطلبات الدرجات موجودة في القاعدة مسبقاً (لا تُستبدل)');
    if (doEx) console.log('  + قواعد الإعفاء من الدورات ← governing_course_exemption_rules');
    else if (exCount) console.log('  = قواعد الإعفاء موجودة في القاعدة مسبقاً (لا تُستبدل)');
    for (const s of skipped) console.log(`  · تخطٍّ: ${s}`);
    const total = plan.length + (doGr ? 1 : 0) + (doEx ? 1 : 0);
    if (total === 0) { console.log('\nلا شيء للنقل.'); return 0; }

    // التجربة والتنفيذ يمرّان بنفس الإدراج داخل معاملة؛ التجربة تتراجع في النهاية.
    // كل عنصر بنقطة حفظ: يُعرف أي سجل سيفشل (قيد NOT NULL مثلاً) قبل التنفيذ الفعلي.
    await client.query('BEGIN');
    const imported: string[] = []; const failed: string[] = [];
    const attempt = async (tag: string, label: string, fn: () => Promise<string>) => {
      await client.query('SAVEPOINT item');
      try { const info = await fn(); await client.query('RELEASE SAVEPOINT item'); imported.push(tag); console.log(`  ✔ ${label}${info ? ' ' + info : ''}`); }
      catch (e: any) { await client.query('ROLLBACK TO SAVEPOINT item'); failed.push(tag); console.log(`  ✖ ${label}: ${e?.message || e}`); }
    };
    for (const p of plan) {
      const cols = Object.keys(p.row);
      await attempt(p.tag, `${p.table} (${p.tag})`, async () => {
        const r = await client.query(`INSERT INTO "${p.table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((c) => p.row[c]));
        return `← id جديد ${r.rows[0].id}`;
      });
    }
    if (doGr) await attempt('inMemoryGradeRequirements', 'متطلبات الدرجات', async () => {
      await client.query(`INSERT INTO app_settings_documents (key, value, source, updated_at, updated_by) VALUES ('grade_requirements', $1, 'imported-local-storage', now(), 'db:import-local')`, [JSON.stringify(gr)]);
      return '';
    });
    if (doEx) await attempt('inMemoryExemptionRules', 'قواعد الإعفاء', async () => {
      await client.query(`INSERT INTO governing_course_exemption_rules (config_key, rules, qualifications_exemptions, grade_title_exemptions, auto_apply_rules) VALUES ('default_exemption_rules', $1, $2, $3, $4)`,
        [JSON.stringify(ex.rules || []), JSON.stringify(ex.qualificationsExemptions || []), JSON.stringify(ex.gradeTitleExemptions || []), ex.autoApplyRules !== false]);
      return '';
    });
    if (!APPLY || failed.length) {
      await client.query('ROLLBACK');
      if (failed.length) console.log(`\n✖ ${failed.length} عنصر سيفشل؛ ${APPLY ? 'لم يُنقل أي شيء' : 'لا يُنفَّذ النقل حتى تُعالج'}. السجلات المعنية في data/localdiff-*.json`);
      else console.log(`\nالتجربة ناجحة: ${imported.length} عنصر جاهز. للتنفيذ: control-app.bat importlocal`);
      return failed.length ? 2 : 0;
    }
    const newMarker = { imported: [...already, ...imported], at: new Date().toISOString() };
    await client.query(`INSERT INTO app_settings_documents (key, value, source, updated_at, updated_by) VALUES ($1, $2, 'imported-local-storage', now(), 'db:import-local')
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [MARKER_KEY, JSON.stringify(newMarker)]);
    await client.query('COMMIT');
    console.log(`\n✔ نُقل ${imported.length} عنصر. أعد احتساب الاستحقاقات للموظفين المعنيين من شاشة الترفيع إن لزم.`);
    return 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && /import-local\.ts$/.test(process.argv[1])) {
  let code = 0;
  try { code = await main(); } catch (err: any) {
    if (isDbConnectionFailure(err)) { console.error('قاعدة البيانات غير متاحة'); code = 3; }
    else { console.error('✖ فشل، لم يُكتب شيء: ' + (err?.message || err)); code = 1; }
  }
  await pool.end().catch(() => {});
  process.exit(code);
}
