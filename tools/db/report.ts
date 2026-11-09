// npm run db:report — قراءة فقط. تقرير ما يمنع تبنّي الترحيلات وما يلزم قبل أي حذف:
//  1) تكرار المعرّفات الفريدة للموظف (رقم الشركة، الرقم الوظيفي، رقم الهوية) والفراغات فيها
//  2) الأعمدة الموجودة في القاعدة وغير المعرّفة في schema.ts: كم صفاً فيه قيمة فعلية؟
// لا يطبع أسماء الموظفين؛ يطبع المعرّف الداخلي (id) ورقم الشركة فقط حتى يُراجَع داخل النظام.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../../src/db/index.ts';
import { resolveMigrationsFolder, readJournal } from '../../server/migrate.ts';
import { isDbConnectionFailure } from '../../src/lib/referentialIntegrity.ts';

const q = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows;
const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"';
let code = 0;

try {
  console.log('════ 1) المعرّفات الفريدة للموظف ════');
  for (const [col, label] of [['company_number', 'رقم الشركة'], ['civil_service_number', 'الرقم الوظيفي'], ['employee_id_number', 'رقم الهوية']] as const) {
    const [blank] = await q(`SELECT COUNT(*)::int AS n FROM employees WHERE ${col} IS NOT NULL AND TRIM(${col}) = ''`);
    const groups = await q(
      `SELECT TRIM(${col}) AS v, COUNT(*)::int AS n, ARRAY_AGG(id ORDER BY id) AS ids, ARRAY_AGG(COALESCE(company_number, '—') ORDER BY id) AS companies
         FROM employees WHERE ${col} IS NOT NULL AND TRIM(${col}) <> ''
        GROUP BY TRIM(${col}) HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC, 1`);
    const [hasConstraint] = await q(`SELECT COUNT(*)::int AS n FROM pg_constraint WHERE conname = $1`, [`employees_${col}_unique`]);
    console.log(`\n${label} (${col}): القيد ${hasConstraint.n ? 'موجود ✔' : 'غير موجود ✖'}`);
    console.log(`  قيم فارغة '' (تتحول NULL تلقائياً عند الإقلاع): ${blank.n}`);
    if (groups.length === 0) console.log('  ✔ لا تكرار في القيم الفعلية');
    else {
      code = 2;
      console.log(`  ✖ ${groups.length} قيمة مكررة (تحتاج قرارك: أي الموظفين يحمل الرقم الصحيح):`);
      for (const g of groups.slice(0, 50)) {
        console.log(`    - "${g.v}" × ${g.n}  ← الموظفون id: ${g.ids.join('، ')}  (رقم الشركة: ${g.companies.join('، ')})`);
      }
      if (groups.length > 50) console.log(`    … و${groups.length - 50} قيمة أخرى`);
    }
  }

  console.log('\n════ 2) أعمدة في القاعدة غير معرّفة في schema.ts ════');
  const folder = resolveMigrationsFolder();
  if (!folder) throw new Error('مجلد drizzle/ غير موجود');
  const entries = readJournal(folder);
  const snapFile = [...entries].reverse().map((e) => path.join(folder, 'meta', `${e.tag.split('_')[0]}_snapshot.json`)).find((f) => fs.existsSync(f))!;
  const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
  const expected = new Map<string, Set<string>>();
  for (const t of Object.values<any>(snap.tables)) expected.set(t.name, new Set(Object.values<any>(t.columns).map((c: any) => c.name)));
  const live = await q(`SELECT table_name, column_name, data_type, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, ordinal_position`);
  const extra = live.filter((r: any) => expected.has(r.table_name) && !expected.get(r.table_name)!.has(r.column_name));
  if (extra.length === 0) console.log('  ✔ لا يوجد');
  for (const r of extra) {
    const t = ident(r.table_name), c = ident(r.column_name);
    const [total] = await q(`SELECT COUNT(*)::int AS n FROM ${t}`);
    // "قيمة فعلية" = ليست NULL، وليست نصاً فارغاً، وليست false/0 (القيم الافتراضية الشائعة)
    const meaningful = ['text', 'character varying'].includes(r.data_type) ? `${c} IS NOT NULL AND TRIM(${c}::text) NOT IN ('', '[]', '{}', 'null')`
      : r.data_type === 'boolean' ? `${c} IS TRUE`
      : ['integer', 'real', 'numeric', 'double precision', 'bigint'].includes(r.data_type) ? `${c} IS NOT NULL AND ${c} <> 0`
      : `${c} IS NOT NULL`;
    const [used] = await q(`SELECT COUNT(*)::int AS n FROM ${t} WHERE ${meaningful}`);
    const samples = used.n > 0 ? await q(`SELECT LEFT(${c}::text, 60) AS v, COUNT(*)::int AS n FROM ${t} WHERE ${meaningful} GROUP BY 1 ORDER BY 2 DESC LIMIT 3`) : [];
    console.log(`  ${r.table_name}.${r.column_name} (${r.data_type}): ${used.n} من ${total.n} صف فيه قيمة فعلية` +
      (samples.length ? `  — أمثلة: ${samples.map((s: any) => `«${s.v}»×${s.n}`).join('، ')}` : ''));
  }
} catch (err: any) {
  if (isDbConnectionFailure(err)) { console.error('قاعدة البيانات غير متاحة'); code = 3; }
  else { console.error('خطأ: ' + (err?.message || err)); code = 1; }
}
await pool.end().catch(() => {});
process.exit(code);
