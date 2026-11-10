// npm run db:retire-local — B2e: تقاعد data/local_storage.json (نقل إلى data/retired/، لا حذف).
// يرفض إن كان الخادم يعمل، أو إن لم يُسجَّل نقل المعتمد (db:import-local) ما لم يُمرَّر --force.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../../src/db/index.ts';
import { isDbConnectionFailure } from '../../src/lib/referentialIntegrity.ts';

async function serverIsRunning(): Promise<boolean> {
  const port = Number(process.env.PORT) || 5000;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`http://127.0.0.1:${port}/api/settings/public`, { signal: ctrl.signal });
    clearTimeout(t); return r.status > 0;
  } catch { return false; }
}

async function main() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const file = path.join(dataDir, 'local_storage.json');
  if (!fs.existsSync(file)) { console.log('✔ لا يوجد local_storage.json — متقاعد مسبقاً.'); return 0; }
  if (await serverIsRunning()) { console.error('✖ النظام يعمل الآن. أوقفه أولاً (control-app.bat stop).'); return 1; }
  const marker = (await pool.query(`SELECT value FROM app_settings_documents WHERE key = 'local_storage_import'`)).rows[0];
  if (!marker && !process.argv.includes('--force')) {
    console.error('✖ لم يُسجَّل نقل من الملف بعد. شغّل control-app.bat importlocal أولاً (أو --force إن كان الملف لا يحوي شيئاً مطلوباً).');
    return 1;
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dest = path.join(dataDir, 'retired');
  fs.mkdirSync(dest, { recursive: true });
  const moved: string[] = [];
  for (const f of fs.readdirSync(dataDir)) {
    if (!/^local_storage\.json(\..*)?$/.test(f)) continue; // الملف ونسخه .bak/.tmp
    const to = path.join(dest, f.replace('local_storage.json', `local_storage-${stamp}.json`));
    fs.renameSync(path.join(dataDir, f), to);
    moved.push(to);
  }
  await pool.query(`INSERT INTO app_settings_documents (key, value, source, updated_at, updated_by) VALUES ('local_storage_retired', $1, 'user', now(), 'db:retire-local')
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify({ at: new Date().toISOString(), files: moved })]);
  for (const m of moved) console.log(`  → ${m}`);
  console.log(`✔ تقاعد التخزين البديل: نُقل ${moved.length} ملف إلى data\\retired (لم يُحذف شيء).`);
  return 0;
}

let code = 0;
try { code = await main(); } catch (err: any) {
  if (isDbConnectionFailure(err)) { console.error('قاعدة البيانات غير متاحة'); code = 3; }
  else { console.error('خطأ: ' + (err?.message || err)); code = 1; }
}
await pool.end().catch(() => {});
process.exit(code);
