// npm run db:check — بلا قاعدة بيانات: هل يحتاج schema.ts ترحيلاً لم يُولَّد؟ وهل ملفات drizzle/ متسقة؟
// يولّد في نسخة مؤقتة من drizzle/ ولا يلمس المجلد الأصلي. رمز الخروج 0 = متطابق.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-dbcheck-'));
fs.cpSync(path.join(root, 'drizzle'), path.join(tmp, 'drizzle'), { recursive: true });
const cfg = path.join(tmp, 'drizzle.config.mjs');
fs.writeFileSync(cfg, `export default { schema: ${JSON.stringify(path.join(root, 'src/db/schema.ts'))}, out: './drizzle', dialect: 'postgresql' };\n`);
const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'drizzle-kit.cmd' : 'drizzle-kit');
const run = (args: string[]) => spawnSync(bin, args, { cwd: tmp, encoding: 'utf8', shell: process.platform === 'win32' });

let code = 0;

// ترتيب drizzle يعتمد على "when" فقط: أي ترحيل بتاريخ أقدم من سابقه سيُتجاهل إلى الأبد على القواعد القائمة
const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle', 'meta', '_journal.json'), 'utf8'));
for (let i = 1; i < journal.entries.length; i++) {
  if (!(journal.entries[i].when > journal.entries[i - 1].when)) {
    console.error(`✖ ترتيب الترحيلات غير صحيح: ${journal.entries[i].tag} ليس أحدث من ${journal.entries[i - 1].tag}`); code = 1;
  }
}
// الأساس مثبَّت: القواعد المتبنّاة سجّلته بهذه القيم، وتغييره يجعل النظام يرفض التشغيل
const BASELINE = { tag: '0000_baseline', when: 1794241847655 };
const first = journal.entries[0];
if (!first || first.tag !== BASELINE.tag || first.when !== BASELINE.when) {
  console.error('✖ ترحيل الأساس 0000_baseline تغيّر أو حُذف. لا يُعاد توليده أبداً؛ التغييرات تأتي بترحيلات جديدة.'); code = 1;
}
const chk = run(['check', '--config', cfg]);
if (chk.status !== 0) { console.error('✖ drizzle-kit check فشل:\n' + (chk.stdout || '') + (chk.stderr || '')); code = 1; }

const before = new Set(fs.readdirSync(path.join(tmp, 'drizzle')));
const gen = run(['generate', '--config', cfg, '--name', 'dbcheck_probe']);
const added = fs.readdirSync(path.join(tmp, 'drizzle')).filter((f) => !before.has(f) && f.endsWith('.sql'));
if (gen.status !== 0) { console.error('✖ drizzle-kit generate فشل:\n' + (gen.stdout || '') + (gen.stderr || '')); code = 1; }
else if (added.length) {
  console.error('✖ schema.ts تغيّر دون ترحيل. شغّل: npm run db:generate -- --name <وصف>\nالفرق المتوقع:\n' + fs.readFileSync(path.join(tmp, 'drizzle', added[0]), 'utf8'));
  code = 1;
} else console.log('✔ schema.ts مطابق لآخر ترحيل في drizzle/');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(code);
