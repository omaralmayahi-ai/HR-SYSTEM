// npm run typecheck:server — فحص أنواع الخادم (B3). يفشل إذا:
//   - ظهر أي TS2304 (اسم غير معرّف = ReferenceError وقت التشغيل)، أو
//   - زاد عدد الأخطاء الكلي عن خط الأساس في tools/typecheck-server-baseline.json
// خفض خط الأساس مسموح دائماً (حدّث الملف بالعدد الجديد).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const tsc = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const r = spawnSync(tsc, ['-p', 'tsconfig.server.json'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
const lines = (r.stdout || '').split('\n').filter((l) => / error TS\d+/.test(l));
const undefinedNames = lines.filter((l) => l.includes('error TS2304'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'typecheck-server-baseline.json'), 'utf8')).maxErrors;
let fail = false;
if (undefinedNames.length) { console.error('✖ أسماء غير معرّفة (ReferenceError وقت التشغيل):\n' + undefinedNames.join('\n')); fail = true; }
if (lines.length > baseline) { console.error(`✖ أخطاء الأنواع ${lines.length} > خط الأساس ${baseline}. الجديدة غالباً:\n` + lines.slice(-10).join('\n')); fail = true; }
if (!fail) console.log(`✔ typecheck:server: ${lines.length} خطأ (خط الأساس ${baseline})، صفر أسماء غير معرّفة`);
process.exit(fail ? 1 : 0);
