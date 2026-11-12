// npm run legacy:allowances [-- --apply] [--backup <ملف أو مجلد>]   (المرحلة C)
// يقرأ أحدث نسخة احتياطية لنظام المخصصات (افتراضياً ..\allowances-system\data\backups) ويرحّل العائلة
// وحالات الاستفسار والأرشيف إلى HR-SYSTEM. بلا --apply: تجربة كاملة تُلغى بالنهاية (لا يُكتب شيء).
// التقرير التفصيلي (فيه أسماء وأرقام شركة) يُكتب محلياً بـ temp\ فقط، وما يُرفع لأي مكان.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { db, schema, pool } from '../../src/db/index.ts';
import { isDbConnectionFailure } from '../../src/lib/referentialIntegrity.ts';
import { readAllowancesBackup, migrateAllowances } from '../../server/legacy/allowances.ts';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');

/** ملف النسخة: المسار نفسه، أو أحدث pgdata-*.tar.gz بالمجلد. */
export function pickBackup(p: string) {
  if (!fs.existsSync(p)) throw new Error(`المسار غير موجود: ${p}`);
  if (fs.statSync(p).isFile()) return p;
  const files = fs.readdirSync(p).filter(f => /^pgdata-.*\.tar\.gz$/i.test(f)).map(f => path.join(p, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) throw new Error(`ما في نسخ احتياطية (pgdata-*.tar.gz) بـ ${p}. من لوحة نظام المخصصات: «نسخة احتياطية الآن»`);
  return files[0];
}

const LABELS: Record<string, string> = {
  family_employees: 'موظفون لهم بيانات عائلة بالنظام القديم', not_in_hr: 'منهم غير موجودين بـ HR-SYSTEM', mode_set: 'نمط استحقاق عائلي يُسجَّل', mode_same: 'نمط مطابق أو مُرحَّل سابقاً',
  mode_conflict: 'نمط مختلف (حالة استفسار)', marital_set: 'حالة زوجية تُسجَّل', marital_conflict: 'حالة زوجية مختلفة (حالة استفسار)',
  members_added: 'أفراد يُضافون', spouses_added: 'منهم أزواج/زوجات', members_matched: 'أفراد مطابقون بـ HR (ما يتكررون)', members_already: 'أفراد مُرحَّلون سابقاً',
  children_hr_only: 'أطفال بـ HR فقط (حالة استفسار، ما يُحذفون)', spouse_hr_only: 'أزواج بـ HR والقديم ما يصرف زوجية', relation_conflicts: 'جنس طفل مختلف (حالة استفسار)',
  extensions_added: 'تمديدات تُضاف', extensions_skipped: 'تمديدات لأفراد غير مُرحَّلين', issues_legacy: 'حالات استفسار من النظام القديم', issues_new: 'حالات استفسار جديدة من الترحيل',
  issues_existing: 'حالات مُرحَّلة سابقاً', issues_refreshed: 'حالات أُغلقت بالنظام القديم بعد الترحيل السابق (تُحدَّث)',
  members_removed_in_hr: 'أفراد مُرحَّلون حذفهم المستخدم بـ HR (ما يُعادون)', members_ended: 'أفراد أُنهوا بالقديم وما زالوا بـ HR (حالة استفسار)',
  members_not_imported: 'أفراد غير مستحقين لسبب ما يُنقل تلقائياً (حالة استفسار)', facts_added: 'وقائع تُسجَّل (وفاة، زواج البنت، توظيف)', archive_rows: 'صفوف أرشيف', payroll_rows: 'منها صفوف كشف الرواتب', employees_not_in_hr: 'موظفو كشف الرواتب القديم غير الموجودين بـ HR',
  grade_step_diffs: 'فروق درجة/مرحلة مع كشف الرواتب القديم (تقرير فقط)',
};

function writeReport(file: string, result: any) {
  const wb = XLSX.utils.book_new(); (wb as any).Workbook = { Views: [{ RTL: true }] };
  const add = (name: string, head: string[], data: any[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...data]), name);
  add('الملخص', ['البند', 'العدد'], Object.entries(LABELS).map(([k, l]) => [l, result.summary[k] ?? 0]));
  add('غير موجودين بـ HR', ['رقم الشركة', 'الاسم', 'أفراد العائلة'], result.report.not_in_hr.map((x: any) => [x.company_number, x.name, x.members]));
  add('تعارضات', ['رقم الشركة', 'الحقل', 'HR-SYSTEM', 'النظام القديم'], result.report.conflicts.map((x: any) => [x.company_number, x.field, x.hr, x.old]));
  add('بـ HR فقط', ['رقم الشركة', 'الصلة', 'الميلاد'], result.report.hr_only.map((x: any) => [x.company_number, x.relation, x.birth_date]));
  add('فروق الدرجة', ['رقم الشركة', 'الاسم', 'HR (درجة/مرحلة)', 'كشف 8/2026', 'الاسمي بالكشف'], result.report.grade_step.map((x: any) => [x.company_number, x.name, x.hr, x.old, Number(x.basic_old) || null]));
  add('لم يُنقلوا', ['رقم الشركة', 'الصلة', 'الميلاد', 'السبب'], result.report.not_imported.map((x: any) => [x.company_number, x.relation, x.birth_date, x.why]));
  add('كشف الرواتب: غير موجودين', ['رقم الشركة', 'الاسم'], result.report.employees_not_in_hr.map((x: any) => [x.company_number, x.name]));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  XLSX.writeFile(wb, file);
}

const LAST = path.join(process.cwd(), 'temp', 'legacy-allowances-last.json');

async function main() {
  // --from-last: التطبيق على نفس الملف اللي راجعته التجربة (وبنفس بصمته)، لا على نسخة أحدث نُزلت بينهما
  let expectSha: string | null = null; let chosen: string;
  if (process.argv.includes('--from-last')) {
    if (!fs.existsSync(LAST)) throw new Error('ما في تجربة سابقة؛ شغّل التجربة أولاً');
    const last = JSON.parse(fs.readFileSync(LAST, 'utf8')); chosen = last.file; expectSha = last.sha256;
  } else chosen = pickBackup(path.resolve(arg('--backup') ?? path.join(process.cwd(), '..', 'allowances-system', 'data', 'backups')));
  const file = chosen;
  const st = fs.statSync(file);
  console.log(`النسخة: ${file}`);
  console.log(`تاريخها: ${st.mtime.toLocaleString('ar-IQ')} — ${(st.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(APPLY ? 'الوضع: تطبيق' : 'الوضع: تجربة (لا يُكتب شيء)');
  const src = await readAllowancesBackup(file);
  if (expectSha && src.sha256 !== expectSha) throw new Error('الملف تغيّر بعد التجربة؛ أعد التجربة وراجعها قبل التطبيق');
  console.log(`قُرئ: ${src.employees.length} موظفاً، ${src.statuses.length} حالة عائلية، ${src.members.length} فرداً، ${src.issues.length} حالة استفسار، ${src.payrollItems.length} قيمة رواتب`);
  const result = await migrateAllowances(db, schema, src, { apply: APPLY, user: arg('--user') ?? 'control-app', fileName: path.basename(file) });
  for (const [k, l] of Object.entries(LABELS)) console.log(`  ${l}: ${result.summary[k] ?? 0}`);
  if (result.summary.previous_runs?.length) console.log(`ℹ هذي النسخة رُحّلت سابقاً (${result.summary.previous_runs.length} مرة)؛ التكرار ما يضيف شيئاً مكرراً.`);
  const out = path.join(process.cwd(), 'temp', `legacy-allowances-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}${result.applied ? '' : '-تجربة'}.xlsx`);
  // التقرير بعد الالتزام: فشل كتابته ما يعني فشل الترحيل
  try { writeReport(out, result); console.log(`التقرير التفصيلي (محلي، فيه بيانات شخصية؛ احذفه بعد المراجعة): ${out}`); }
  catch (e: any) { console.error(`⚠ تعذّرت كتابة التقرير (${e?.message || e})${result.applied ? '؛ الترحيل نفسه طُبّق' : ''}`); }
  if (!result.applied && !result.blocked) { fs.mkdirSync(path.dirname(LAST), { recursive: true }); fs.writeFileSync(LAST, JSON.stringify({ file, sha256: src.sha256, at: new Date().toISOString() })); }
  if (result.blocked) { console.error('✖ ' + result.blocked); return 2; }
  console.log(result.applied ? `✔ طُبّق الترحيل (رقم ${result.import_id}).` : 'التجربة انتهت. لم يُكتب شيء.');
  return 0;
}

if (process.argv[1] && /allowances-import\.ts$/.test(process.argv[1])) {
  let code = 0;
  try { code = await main(); } catch (err: any) {
    if (isDbConnectionFailure(err)) { console.error('قاعدة البيانات غير متاحة'); code = 3; }
    else {
      const cause = err?.cause?.message ? ` — السبب: ${err.cause.message}` : '';
      if (err?.cause?.code === '42P01') console.error('✖ جداول الترحيل غير موجودة: ترحيلات القاعدة غير مطبّقة. من لوحة التحكم: «تطبيق الترحيلات» ثم أعد المحاولة.');
      else console.error('✖ فشل، لم يُكتب شيء: ' + String(err?.message || err).split('\n')[0].slice(0, 300) + cause);
      code = 1;
    }
  }
  await pool.end().catch(() => {});
  process.exit(code);
}
