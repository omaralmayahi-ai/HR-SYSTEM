// server/migrate.ts
// مرحّل قاعدة البيانات (B1). راجع docs/designs/b1-migrations/design_draft.md
//
// القاعدة: ensureSchema() مجمّد، ويُشغَّل مرة واحدة فقط لكل قاعدة (خطوة "التبنّي")
// لأنه يبني الشكل الأساسي ويضع بيانات البذور. بعدها كل تغيير بنيوي يأتي من drizzle/*.sql.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool, ensureSchema } from '../src/db/index.ts';
import { isDbConnectionFailure } from '../src/lib/referentialIntegrity.ts';
import { unwrapDbError } from './dbErrors.ts';

const isConnectionError = (err: any) => isDbConnectionFailure(err) || isDbConnectionFailure(unwrapDbError(err));

export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';
// رقم ثابت لقفل pg_advisory_lock يخص HR-SYSTEM (يمنع مرحّلين متزامنين: الخادم + لوحة التحكم)
const LOCK_KEY = 724_201_101;

export type MigrationState = 'not_run' | 'ok' | 'offline' | 'errors';

export interface JournalEntry { idx: number; tag: string; when: number; hash: string; }

export interface MigrationStatus {
  status: MigrationState;
  folder: string | null;
  adoptedNow: boolean;
  applied: string[];        // كل الترحيلات المسجلة في القاعدة (tags)
  appliedNow: string[];     // ما طُبّق في هذا التشغيل
  pending: string[];        // موجود في drizzle/ ولم يُطبّق
  modified: string[];       // مطبَّق لكن ملفه تغيّر بعد التطبيق (ممنوع)
  error: { message: string; code: string | null } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

let lastStatus: MigrationStatus = emptyStatus('not_run');

function emptyStatus(status: MigrationState): MigrationStatus {
  return { status, folder: null, adoptedNow: false, applied: [], appliedNow: [], pending: [], modified: [], error: null, startedAt: null, finishedAt: null };
}

export function getMigrationStatus(): MigrationStatus {
  return { ...lastStatus, applied: [...lastStatus.applied], appliedNow: [...lastStatus.appliedNow], pending: [...lastStatus.pending], modified: [...lastStatus.modified] };
}

/** مجلد drizzle/: يعمل في التطوير (tsx من جذر المشروع) وفي الإنتاج (dist/server.cjs). */
export function resolveMigrationsFolder(): string | null {
  const argvDir = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd();
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.join(process.cwd(), 'drizzle'),
    path.join(argvDir, 'drizzle'),
    path.join(argvDir, '..', 'drizzle'),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'meta', '_journal.json'))) return path.resolve(c);
  }
  return null;
}

/** نفس حساب drizzle-orm (sha256 لنص الملف كاملاً) حتى تتطابق القيم المسجلة. */
export function readJournal(folder: string): JournalEntry[] {
  const journal = JSON.parse(fs.readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8'));
  return (journal.entries || []).map((e: any) => {
    const text = fs.readFileSync(path.join(folder, `${e.tag}.sql`)).toString();
    return { idx: e.idx, tag: e.tag, when: Number(e.when), hash: crypto.createHash('sha256').update(text).digest('hex') };
  });
}

/** الجداول والأعمدة التي يتوقعها ترحيل الأساس (من لقطة drizzle-kit). */
export function baselineExpectation(folder: string, baselineTag: string): Map<string, string[]> {
  const snapPath = path.join(folder, 'meta', `${baselineTag.split('_')[0]}_snapshot.json`);
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const out = new Map<string, string[]>();
  for (const t of Object.values<any>(snap.tables || {})) {
    out.set(t.name, Object.values<any>(t.columns || {}).map((c) => c.name));
  }
  return out;
}

async function tableExists(client: any, schema: string, table: string): Promise<boolean> {
  const r = await client.query('SELECT to_regclass($1) AS t', [`"${schema}"."${table}"`]);
  return !!r.rows[0]?.t;
}

async function readApplied(client: any): Promise<{ hash: string; created_at: string }[]> {
  if (!(await tableExists(client, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE))) return [];
  const r = await client.query(`SELECT hash, created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at`);
  return r.rows;
}

/** يقارن المسجّل في القاعدة مع ملفات drizzle/ (قراءة فقط). */
export function diffJournal(entries: JournalEntry[], appliedRows: { hash: string; created_at: string }[]) {
  const byWhen = new Map(appliedRows.map((r) => [Number(r.created_at), r.hash]));
  const lastApplied = appliedRows.length ? Math.max(...appliedRows.map((r) => Number(r.created_at))) : -1;
  const applied: string[] = []; const pending: string[] = []; const modified: string[] = [];
  for (const e of entries) {
    if (byWhen.has(e.when)) {
      applied.push(e.tag);
      if (byWhen.get(e.when) !== e.hash) modified.push(e.tag);
    } else if (e.when > lastApplied) {
      pending.push(e.tag);
    } else {
      // أقدم من آخر ترحيل مطبَّق ولم يُطبَّق: drizzle سيتجاهله إلى الأبد — نعدّه خطأً مكشوفاً
      modified.push(e.tag);
    }
  }
  return { applied, pending, modified };
}

async function missingBaselineColumns(client: any, expected: Map<string, string[]>): Promise<string[]> {
  const r = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
  const have = new Set(r.rows.map((x: any) => `${x.table_name}.${x.column_name}`));
  const missing: string[] = [];
  for (const [t, cols] of expected) for (const c of cols) if (!have.has(`${t}.${c}`)) missing.push(`${t}.${c}`);
  return missing;
}

/**
 * يُستدعى عند كل إقلاع ومن `npm run db:migrate`.
 * لا يرمي استثناء: يعيد الحالة، والخطأ يظهر في GET /api/admin/schema-health.
 */
export async function runMigrations(opts: { log?: (m: string) => void } = {}): Promise<MigrationStatus> {
  const log = opts.log || ((m: string) => console.log('[MIGRATE] ' + m));
  const st = emptyStatus('not_run');
  st.startedAt = new Date().toISOString();
  lastStatus = st;

  const folder = resolveMigrationsFolder();
  st.folder = folder;
  if (!folder) {
    st.status = 'errors';
    st.error = { message: 'مجلد الترحيلات drizzle/ غير موجود بجانب النظام', code: null };
    st.finishedAt = new Date().toISOString();
    log('✖ ' + st.error.message);
    return getMigrationStatus();
  }

  let client: any = null;
  let locked = false;
  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    locked = true;

    const entries = readJournal(folder);
    if (entries.length === 0) throw new Error('ملف _journal.json لا يحوي أي ترحيل');
    const baseline = entries[0];
    let appliedRows = await readApplied(client);

    // ensureSchema يُشغَّل عند كل إقلاع (مجمّد: لا DDL جديد فيه) لأنه يحوي بذوراً وإصلاحات بيانات
    // ما زالت المسارات تعتمد عليها. أول مرة لكل قاعدة يكون هو من يبني الشكل الأساسي.
    const health = await ensureSchema();
    if (health.status === 'offline') {
      st.status = 'offline';
      st.finishedAt = new Date().toISOString();
      return getMigrationStatus();
    }

    // ── خطوة التبنّي: لا صفوف في جدول الترحيلات (قاعدة جديدة، أو قائمة قبل B1، أو جدول فارغ متروك) ──
    if (appliedRows.length === 0) {
      if (health.errorCount > 0) {
        throw new Error(`لم يتم التبنّي: تجهيز المخطط انتهى بـ ${health.errorCount} خطأ (راجع /api/admin/schema-health). لم يُسجَّل أي ترحيل.`);
      }
      const missing = await missingBaselineColumns(client, baselineExpectation(folder, baseline.tag));
      if (missing.length > 0) {
        throw new Error(`لم يتم التبنّي: أعمدة ناقصة عن ترحيل الأساس (${missing.length}): ${missing.slice(0, 10).join('، ')}${missing.length > 10 ? '…' : ''}`);
      }
      // إنشاء الجدول وتسجيل الأساس في معاملة واحدة وتحت القفل: لا حالة «جدول بلا صفوف» بعد اليوم
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
      await client.query(`CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
      await client.query(`INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2)`, [baseline.hash, baseline.when]);
      await client.query('COMMIT');
      st.adoptedNow = true;
      log(`✔ تم التبنّي: سُجّل ${baseline.tag} كمطبَّق (دون تنفيذه؛ الشكل بُني بـ ensureSchema).`);
      appliedRows = await readApplied(client);
    } else if (health.errorCount > 0) {
      log(`⚠ تجهيز المخطط انتهى بـ ${health.errorCount} خطأ (راجع /api/admin/schema-health). متابعة الترحيلات.`);
    }

    // قاعدة طُبّق عليها ترحيل لا يعرفه هذا الإصدار = النظام أقدم من القاعدة (رجوع لإصدار سابق دون استعادة النسخة)
    const knownHashes = new Set(entries.map((e) => e.hash));
    const unknown = appliedRows.filter((r) => !knownHashes.has(r.hash) && !entries.some((e) => e.when === Number(r.created_at)));
    if (unknown.length > 0) {
      throw new Error(`قاعدة البيانات طُبّق عليها ${unknown.length} ترحيل لا يعرفه هذا الإصدار من النظام. حدّث النظام، أو استعد النسخة الاحتياطية المأخوذة مع الإصدار السابق.`);
    }

    const before = diffJournal(entries, appliedRows);
    if (before.modified.length > 0) {
      throw new Error(`ترحيلات مطبّقة تغيّر ملفها أو تُركت خلف ترحيل أحدث: ${before.modified.join('، ')}. الإصلاح بترحيل جديد، لا بتعديل القديم.`);
    }
    if (before.pending.length > 0) {
      log(`تطبيق ${before.pending.length} ترحيل: ${before.pending.join('، ')}`);
      // drizzle يطبّق كل المعلّق داخل معاملة واحدة: إما كلها أو لا شيء (لا CREATE INDEX CONCURRENTLY في الترحيلات)
      await migrate(db, { migrationsFolder: folder, migrationsSchema: MIGRATIONS_SCHEMA, migrationsTable: MIGRATIONS_TABLE });
      st.appliedNow = before.pending;
    }
    const after = diffJournal(entries, await readApplied(client));
    st.applied = after.applied; st.pending = after.pending; st.modified = after.modified;
    st.status = 'ok';
    log(st.appliedNow.length ? `✔ اكتملت الترحيلات (${after.applied.length} مطبّق).` : `✔ القاعدة محدّثة (${after.applied.length} ترحيل مطبّق).`);
  } catch (err: any) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* لا معاملة مفتوحة */ } }
    if (isConnectionError(err)) {
      st.status = 'offline';
      log('قاعدة البيانات غير متاحة؛ ستُطبَّق الترحيلات عند التشغيل القادم.');
    } else {
      st.status = 'errors';
      st.error = { message: String(err?.message || err), code: err?.code ? String(err.code) : null };
      console.error('[MIGRATE] ✖', st.error.message);
    }
  } finally {
    if (client) {
      if (locked) { try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]); } catch { /* ignore */ } }
      client.release();
    }
    st.finishedAt = new Date().toISOString();
  }
  return getMigrationStatus();
}
