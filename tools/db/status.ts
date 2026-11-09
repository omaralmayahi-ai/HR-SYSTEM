// npm run db:status — قراءة فقط: الترحيلات المطبّقة/المعلّقة، وفروقات القاعدة الحية مقابل آخر لقطة لـ schema.ts.
// رمز الخروج: 0 لا فروقات ولا معلّق، 2 يوجد معلّق أو فروقات، 1 خطأ، 3 القاعدة غير متاحة.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../../src/db/index.ts';
import { resolveMigrationsFolder, readJournal, diffJournal, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from '../../server/migrate.ts';
import { isDbConnectionFailure } from '../../src/lib/referentialIntegrity.ts';

const json = process.argv.includes('--json');
let code = 0;
try {
  const folder = resolveMigrationsFolder();
  if (!folder) throw new Error('مجلد drizzle/ غير موجود');
  const entries = readJournal(folder);
  const reg = await pool.query('SELECT to_regclass($1) AS t', [`"${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`]);
  const rows = reg.rows[0]?.t ? (await pool.query(`SELECT hash, created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at`)).rows : [];
  const j = diffJournal(entries, rows);
  const adopted = rows.length > 0;

  // آخر لقطة = الشكل الذي يتوقعه schema.ts بعد تطبيق كل الترحيلات
  const snapFile = [...entries].reverse().map((e) => path.join(folder, 'meta', `${e.tag.split('_')[0]}_snapshot.json`)).find((f) => fs.existsSync(f));
  if (!snapFile) throw new Error('لا توجد لقطة مخطط في drizzle/meta');
  const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
  const expected = new Map<string, Map<string, any>>();
  for (const t of Object.values<any>(snap.tables)) expected.set(t.name, new Map(Object.values<any>(t.columns).map((c: any) => [c.name, c])));
  const live = await pool.query(`SELECT table_name, column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema='public'`);
  const liveMap = new Map<string, Map<string, any>>();
  for (const r of live.rows) { if (!liveMap.has(r.table_name)) liveMap.set(r.table_name, new Map()); liveMap.get(r.table_name)!.set(r.column_name, r); }
  const norm = (t: string) => ({ 'character varying': 'varchar', 'timestamp without time zone': 'timestamp', 'double precision': 'double precision', 'integer': 'integer', 'text': 'text', 'boolean': 'boolean', 'real': 'real', 'numeric': 'numeric', 'jsonb': 'jsonb', 'date': 'date' } as any)[t] || t;
  const drift: string[] = [];
  for (const [t, cols] of expected) {
    const lc = liveMap.get(t);
    if (!lc) { drift.push(`جدول مفقود: ${t}`); continue; }
    for (const [c, def] of cols) {
      const l = lc.get(c);
      if (!l) { drift.push(`عمود مفقود: ${t}.${c}`); continue; }
      const want = String(def.type).replace(/\(.*\)$/, '').replace('serial', 'integer');
      if (norm(l.data_type) !== want) drift.push(`نوع مختلف: ${t}.${c} (القاعدة ${l.data_type}، المتوقع ${def.type})`);
      if ((l.is_nullable === 'NO') !== !!(def.notNull || def.primaryKey)) drift.push(`NULL مختلف: ${t}.${c} (القاعدة ${l.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'})`);
    }
  }
  for (const [t, cols] of liveMap) {
    if (!expected.has(t)) { drift.push(`جدول إضافي غير معرّف: ${t}`); continue; }
    for (const c of cols.keys()) if (!expected.get(t)!.has(c)) drift.push(`عمود إضافي غير معرّف: ${t}.${c}`);
  }
  const out = { adopted, applied: j.applied, pending: adopted ? j.pending : entries.map((e) => e.tag), modified: j.modified, drift };
  if (json) console.log(JSON.stringify(out, null, 1));
  else {
    console.log(`التبنّي: ${adopted ? 'تم' : 'لم يتم بعد (سيتم عند أول db:migrate أو تشغيل)'}`);
    console.log(`الترحيلات المطبّقة: ${j.applied.length}${j.applied.length ? ' (' + j.applied.join('، ') + ')' : ''}`);
    console.log(`الترحيلات المعلّقة: ${out.pending.length}${out.pending.length ? ' (' + out.pending.join('، ') + ')' : ''}`);
    if (j.modified.length) console.log(`⚠ ترحيلات تغيّرت بعد تطبيقها: ${j.modified.join('، ')}`);
    console.log(drift.length ? `⚠ فروقات القاعدة عن schema.ts (${drift.length}):\n  - ` + drift.join('\n  - ') : '✔ لا فروقات بين القاعدة و schema.ts');
  }
  if (j.modified.length) code = 1; else if (out.pending.length || drift.length) code = 2;
} catch (err: any) {
  if (isDbConnectionFailure(err)) { console.error('قاعدة البيانات غير متاحة'); code = 3; }
  else { console.error('خطأ: ' + (err?.message || err)); code = 1; }
}
await pool.end().catch(() => {});
process.exit(code);
