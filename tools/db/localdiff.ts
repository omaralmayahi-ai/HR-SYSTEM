// npm run db:localdiff — قراءة فقط (B2، قرار ق-1).
// يفك تشفير data/local_storage.json بمفتاح .env ويقارن كل مخزن فيه بجدوله في PostgreSQL:
//   - سجلات في الملف فقط (id غير موجود في القاعدة)  ← مرشّحة للنقل
//   - سجلات في القاعدة فقط                            ← طبيعي (الملف نسخة متأخرة)
//   - سجلات مشتركة تختلف قيمها                        ← القاعدة هي المرجع؛ تُعرض للمراجعة
//   - مخازن لا جدول لها                               ← بيانات تعيش في الملف وحده (يجب نقلها قبل إيقافه)
// الشاشة تعرض أعداداً وأسماء حقول فقط (لا قيم ولا أسماء أشخاص).
// التفاصيل الكاملة تُكتب في data/localdiff-<التاريخ>.json (مجلد data/ مستثنى من git ومن الحزم).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../../src/db/index.ts';
import { decryptData } from '../../src/lib/cryptoStorage.ts';
import { isDbConnectionFailure } from '../../src/lib/referentialIntegrity.ts';

export const STORE_TABLES: Record<string, string | null> = {
  inMemoryEmployees: 'employees',
  inMemoryQualifications: 'qualifications',
  inMemoryJobAssignments: 'job_assignments',
  inMemoryPromotions: 'promotions_increments',
  inMemorySalaryAllowances: 'salary_allowances',
  inMemoryAnnualEvaluations: 'annual_evaluations',
  inMemoryTrainingCourses: 'training_courses',
  inMemoryTransfers: 'transfers',
  inMemoryRetirements: 'retirements',
  inMemoryDocuments: 'documents',
  inMemoryServiceRecords: 'service_records',
  inMemoryServiceCredits: 'service_credits',
  inMemoryLeaves: 'leave_requests',
  inMemoryPenalties: 'penalties',
  inMemoryAppreciations: 'appreciations',
  inMemoryPerformanceEvaluations: 'performance_evaluations',
  inMemoryCareerHistories: 'career_histories',
  inMemoryDegreeTrackSnapshots: 'degree_track_snapshots',
  inMemoryDegreeTrackSimulationSteps: 'degree_track_simulation_steps',
  inMemorySpecializationCredits: 'specialization_course_credits',
  inMemoryPromotionDelayReasons: 'promotion_delay_reasons',
  inMemoryAllowancesDeductions: 'allowances_deductions',
  inMemoryEducationDegrees: 'education_degrees',
  inMemoryResponsibilityAllowances: 'responsibility_allowances',
  inMemoryWorkLocations: 'work_locations',
  inMemoryShiftSystems: 'shift_systems',
  inMemoryServiceTypes: 'service_types',
  inMemoryEmployeeStatuses: 'employee_statuses',
  inMemoryLeaveTypes: 'leave_types',
  inMemoryPenaltyTypes: 'penalty_types',
  inMemorySalaryScale: 'salary_scale',
  inMemoryGradePromotionRules: 'grade_promotion_rules',
  inMemoryCommendationTypes: 'commendation_types',
  inMemoryEmployeeCommendations: 'employee_commendations',
  inMemoryCommendationRulesSettings: 'commendation_rules_settings',
  inMemoryJobTitles: 'job_titles',
  inMemoryExemptionRules: 'governing_course_exemption_rules',
  inMemoryEmployeeAssignments: 'governing_course_employee_assignments',
  inMemoryTrainings: 'trainings',
  inMemoryEnrollments: 'training_enrollments',
  inMemoryTrainers: 'trainers',
  inMemoryAnnualPlans: 'annual_training_plans',
  inMemoryAttendance: 'attendance',
  inMemoryOrgUnits: 'org_units',
  systemSettingsStore: 'system_settings',
  leaveAccrualLogs: 'leave_accrual_runs',
  inMemoryGradeRequirements: null, // لا جدول له: يعيش في الملف فقط
};

// مخازن تُولَّد آلياً من محرك الترفيع عند إعادة الاحتساب: لا تُنقل، تُعاد توليدها من القاعدة
const DERIVED: Record<string, string> = { inMemoryPromotionDelayReasons: 'يُعاد توليده من محرك الترفيع (إعادة احتساب)' };
// جداول إعدادات/قوائم: «في الملف فقط» تُطابق بالاسم، لأن معرّفات القيم الافتراضية في الكود تختلف عن معرّفات القاعدة
const NAME_KEYS = ['name', 'title', 'job_title', 'jobTitle'];
const nameOf = (r: any) => { for (const k of NAME_KEYS) if (r && typeof r[k] === 'string' && r[k].trim()) return r[k].trim(); return null; };
// القيم الشخصية لا تُطبع؛ أسماء البنود في هذه الجداول ليست بيانات شخصية
const CONFIG_TABLES = new Set(['allowances_deductions', 'education_degrees', 'responsibility_allowances', 'work_locations', 'shift_systems', 'service_types', 'employee_statuses', 'leave_types', 'penalty_types', 'job_titles', 'commendation_types', 'grade_promotion_rules', 'org_units']);

// أعمدة هوية السجل: اختلافها مع تطابق id يعني سجلاً آخر لا تعديلاً
const IDENTITY_COLS = ['company_number', 'employee_id', 'training_id', 'name', 'title'];

/** مقارنة مخزن على شكل كائن بجدوله. يعيد عدد الناقص في القاعدة وعدد المختلف وأسطر شرح. */
export function compareObjectStore(key: string, val: any, rows: any[]) {
  const lines: string[] = []; let missing = 0; let differ = 0;
  if (key === 'inMemoryEmployeeAssignments') {
    // { employeeId: assignment } ← جدول governing_course_employee_assignments بمفتاح employee_id
    const dbEmp = new Set(rows.map((r: any) => String(r.employee_id)));
    const ids = Object.keys(val || {});
    const miss = ids.filter((k) => !dbEmp.has(String(k)));
    missing = miss.length;
    lines.push(`${ids.length} موظفاً لهم تعيين دورات في الملف، ${missing} منهم بلا سجل في القاعدة`);
    return { missing, differ, lines, note: 'تعيينات الدورات لكل موظف' };
  }
  if (rows.length === 0) {
    missing = Object.keys(val || {}).length ? 1 : 0;
    lines.push(missing ? '⚠ الجدول فارغ والملف فيه إعدادات — تُنقل' : 'فارغ في الاثنين');
    return { missing, differ, lines, note: 'إعدادات' };
  }
  // صف إعدادات واحد: قارن المفاتيح بأعمدة الصف الأول
  const row = rows[0];
  const keys: string[] = [];
  for (const [k, v] of Object.entries<any>(val || {})) {
    const col = k in row ? k : snake(k);
    if (!(col in row) || ['id', 'created_at', 'updated_at'].includes(col)) continue;
    const a = norm(v), b = norm(row[col]);
    if (!(a === null && b === null) && String(a) !== String(b)) keys.push(col);
  }
  differ = keys.length;
  if (keys.length) lines.push(`مفاتيح تختلف عن القاعدة: ${keys.slice(0, 10).join('، ')}`);
  return { missing, differ, lines, note: 'صف إعدادات' };
}

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

/** تطبيع قيمة للمقارنة: الفراغ = null، الأرقام أرقام، التواريخ بلا جزء الوقت إن كان صفراً. */
export function norm(v: any): any {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    const m = t.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]00:00:00(?:\.000)?Z?)?$/);
    if (m) return m[1];
    return t;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** الحقول المشتركة التي تختلف قيمها (بعد تطبيع الأسماء إلى snake_case والقيم بـ norm). */
export function diffRecord(fileRec: Record<string, any>, dbRec: Record<string, any>, dbCols: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(fileRec)) {
    const col = dbCols.has(k) ? k : snake(k);
    if (!dbCols.has(col) || seen.has(col) || col === 'id' || col === 'created_at' || col === 'updated_at') continue;
    seen.add(col);
    const a = norm(v), b = norm(dbRec[col]);
    if (a === null && b === null) continue;
    if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6) continue;
    if (String(a) !== String(b)) out.push(col);
  }
  return out;
}

async function main() {
  const dataFile = path.resolve(process.cwd(), 'data', 'local_storage.json');
  if (!fs.existsSync(dataFile)) { console.log('لا يوجد ملف data/local_storage.json — لا شيء للمقارنة.'); return 0; }
  const raw = fs.readFileSync(dataFile, 'utf8');
  let state: any;
  try { state = JSON.parse(decryptData(raw)); } catch {
    try { state = JSON.parse(raw); } catch {
      console.error('✖ تعذّر فك تشفير الملف بمفتاح LOCAL_DB_ENCRYPTION_KEY الحالي (أو الملف تالف).'); return 1;
    }
  }
  const size = (fs.statSync(dataFile).size / 1048576).toFixed(1);
  console.log(`الملف: ${dataFile} (${size} MB)\n`);

  const details: any = { generatedAt: new Date().toISOString(), stores: {} };
  const summary: { store: string; table: string; file: number; db: number; onlyFile: number; differ: number; fields: string }[] = [];
  const orphanStores: string[] = [];
  const extraLines: string[] = [];
  let attention = 0;

  for (const [key, val] of Object.entries<any>(state)) {
    if (key === 'genericMemoryStores') continue;
    const table = STORE_TABLES[key];
    const isArr = Array.isArray(val);
    const n = isArr ? val.length : val && typeof val === 'object' ? Object.keys(val).length : 0;
    if (table === undefined || table === null) {
      if (n > 0) { orphanStores.push(`${key} (${n} عنصر)`); details.stores[key] = { table: null, data: val }; attention++; }
      continue;
    }
    const exists = (await pool.query('SELECT to_regclass($1) AS t', [`public.${table}`])).rows[0]?.t;
    if (!exists) { if (n > 0) { orphanStores.push(`${key} → ${table} غير موجود (${n})`); attention++; } continue; }
    const rows = (await pool.query(`SELECT * FROM "${table}"`)).rows;
    const cols = new Set<string>(rows.length ? Object.keys(rows[0]) : (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])).rows.map((r: any) => r.column_name));
    if (!isArr) {
      // مخزن على شكل كائن: لا يُعدّ «آمناً» تلقائياً (مراجعة B2: B-1)
      const r = compareObjectStore(key, val, rows);
      summary.push({ store: key, table, file: n, db: rows.length, onlyFile: r.missing, differ: r.differ, fields: r.note });
      for (const l of r.lines) extraLines.push(`  ${key}: ${l}`);
      if (r.missing || r.differ) attention++;
      details.stores[key] = { table, kind: 'object', file: val, db: rows, review: r };
      continue;
    }
    if (DERIVED[key]) {
      summary.push({ store: key, table, file: val.length, db: rows.length, onlyFile: 0, differ: 0, fields: 'مشتق: ' + DERIVED[key] });
      continue;
    }
    if (table === 'leave_accrual_runs') {
      // مفتاح الجدول هو الشهر لا id. لا تُنقل أبداً: نقل سجل شهر «نُفّذ في الذاكرة فقط» يعلّم الشهر
      // منفّذاً في القاعدة دون أن تُزاد أرصدتها (مراجعة B2: M4)
      const dbMonths = new Set(rows.map((x: any) => x.month));
      const offline = val.filter((x: any) => !dbMonths.has(x.month));
      for (const x of val) extraLines.push(`  ترحيل إجازات في الملف: الشهر ${x.month} · ${x.employeesCount ?? '?'} موظف · ${x.status ?? ''} · ${dbMonths.has(x.month) ? 'نفس الشهر موجود في القاعدة' : '⚠ غير موجود في القاعدة (نُفّذ في الذاكرة فقط؟)'}`);
      summary.push({ store: key, table, file: val.length, db: rows.length, onlyFile: offline.length, differ: 0, fields: 'مطابقة بالشهر — لا تُنقل' });
      if (offline.length) attention++;
      continue;
    }
    const byId = new Map(rows.map((r: any) => [String(r.id), r]));
    const onlyFile: any[] = []; const collisions: any[] = []; const differing: any[] = []; const fieldCount: Record<string, number> = {};
    for (const rec of val) {
      const id = rec?.id !== undefined && rec?.id !== null ? String(rec.id) : null;
      const dbRec = id ? byId.get(id) : undefined;
      if (!dbRec) { onlyFile.push(rec); continue; }
      const f = diffRecord(rec, dbRec, cols);
      // نفس id لكن سجل آخر: الذاكرة تعطي max(id)+1 فيتصادم مع سجل حقيقي (مراجعة B2: B-2)
      if (f.some((c) => IDENTITY_COLS.includes(c))) { collisions.push({ id, fields: f.filter((c) => IDENTITY_COLS.includes(c)) }); onlyFile.push(rec); continue; }
      if (f.length) { differing.push({ id, fields: f, file: Object.fromEntries(f.map((c) => [c, rec[c] ?? rec[c.replace(/_([a-z])/g, (_, x) => x.toUpperCase())]])), db: Object.fromEntries(f.map((c) => [c, dbRec[c]])) }); for (const c of f) fieldCount[c] = (fieldCount[c] || 0) + 1; }
    }
    // مطابقة بالاسم لجداول الإعدادات
    let matchedByName = 0; const missingNames: string[] = [];
    if (CONFIG_TABLES.has(table) && onlyFile.length) {
      const dbNames = new Set(rows.map((r: any) => nameOf(r)).filter(Boolean));
      for (const r of onlyFile) { const n = nameOf(r); if (n && dbNames.has(n)) matchedByName++; else missingNames.push(n || `(بلا اسم id=${r?.id})`); }
    }
    // اتجاه الفرق للحقول الرقمية: هل قيمة الملف أكبر أم أصغر من القاعدة، وما الفرق الأكثر تكراراً
    const direction: string[] = [];
    for (const [c] of Object.entries(fieldCount).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      let gt = 0, lt = 0; const deltas: Record<string, number> = {};
      for (const d of differing) {
        if (!d.fields.includes(c)) continue;
        const a = norm(d.file[c]), b = norm(d.db[c]);
        if (typeof a === 'number' && typeof b === 'number') {
          if (a > b) gt++; else if (a < b) lt++;
          const k = String(Math.round((a - b) * 100) / 100); deltas[k] = (deltas[k] || 0) + 1;
        }
      }
      if (gt || lt) {
        const top = Object.entries(deltas).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => `${Number(k) > 0 ? '+' : ''}${k}×${n}`).join('، ');
        direction.push(`${c}: الملف أكبر ${gt}، أصغر ${lt} (الفرق: ${top})`);
      }
    }
    const topFields = Object.entries(fieldCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, k]) => `${c}×${k}`).join('، ');
    const trulyMissing = CONFIG_TABLES.has(table) ? missingNames.length : onlyFile.length;
    summary.push({ store: key, table, file: val.length, db: rows.length, onlyFile: trulyMissing, differ: differing.length, fields: topFields });
    if (collisions.length) extraLines.push(`  ${key}: ⚠ ${collisions.length} سجل بنفس id لكنه سجل مختلف (${[...new Set(collisions.flatMap((c) => c.fields))].join('، ')}) — يُعدّ «في الملف فقط» ويُنقل بمعرّف جديد`);
    if (matchedByName) extraLines.push(`  ${key}: ${matchedByName} من «في الملف فقط» موجودة في القاعدة بنفس الاسم (قيم افتراضية بمعرّف مختلف)`);
    if (CONFIG_TABLES.has(table) && missingNames.length) extraLines.push(`  ${key}: غير موجودة في القاعدة بالاسم: ${missingNames.slice(0, 12).join('، ')}${missingNames.length > 12 ? '…' : ''}`);
    for (const d of direction) extraLines.push(`  ${key} ← ${d}`);
    if (trulyMissing) attention++;
    details.stores[key] = { table, fileCount: val.length, dbCount: rows.length, onlyFile, collisions, differing };
  }

  console.log('المخزن ← الجدول | في الملف | في القاعدة | في الملف فقط | قيم مختلفة | أكثر الحقول اختلافاً');
  for (const s of summary.filter((x) => x.file || x.db)) {
    console.log(`${s.onlyFile ? '⚠' : '✔'} ${s.store} ← ${s.table} | ${s.file} | ${s.db} | ${s.onlyFile} | ${s.differ} | ${s.fields || '—'}`);
  }
  if (extraLines.length) {
    console.log('\nتفاصيل للمراجعة:');
    for (const l of extraLines) console.log(l);
  }
  if (orphanStores.length) {
    console.log('\n⚠ بيانات في الملف بلا جدول في القاعدة (تضيع إن أُوقف الملف قبل نقلها):');
    for (const o of orphanStores) console.log('  - ' + o);
  }
  const out = path.resolve(process.cwd(), 'data', `localdiff-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify(details, null, 1), { encoding: 'utf8', mode: 0o600 });
  console.log(`\nالتفاصيل الكاملة (تحوي بيانات شخصية، تبقى على هذا الجهاز): ${out}`);
  console.log(attention ? `\nالنتيجة: ${attention} مخزن يحتاج نقلاً أو مراجعة قبل إيقاف الملف.` : '\nالنتيجة: ✔ لا شيء في الملف إلا وهو في القاعدة. يمكن إيقاف الملف بأمان.');
  return attention ? 2 : 0;
}

if (process.argv[1] && /localdiff\.ts$/.test(process.argv[1])) {
  let code = 0;
  try { code = await main(); } catch (err: any) {
    if (isDbConnectionFailure(err)) { console.error('قاعدة البيانات غير متاحة'); code = 3; }
    else { console.error('خطأ: ' + (err?.message || err)); code = 1; }
  }
  await pool.end().catch(() => {});
  process.exit(code);
}
