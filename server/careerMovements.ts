// server/careerMovements.ts — B4b: مسار الكتابة الوحيد للسجل الوظيفي المؤرخ.
//
// القواعد (docs/designs/b4-history/resolution.md):
// - السجل إلحاقي فقط (مفروض بمشغّل بالقاعدة)؛ التصحيح صف جديد يشير للمُصحَّح.
// - صف الموظف يُعاد بناؤه من السجل «كما في اليوم» للحقول المتأثرة فقط، فالأمر الرجعي ما يمسح تغييراً أحدث.
// - سجل الأساس التقديري (ق-4) يُنشأ عند أول حركة على الحقل، بتاريخ معروف أو بلا تاريخ (ما نخترع تاريخاً).
// - «اليوم» بتوقيت بغداد.
import { sql, eq } from 'drizzle-orm';

/** الحقول المتتبعة: مفتاح السجل → عمود employees (drizzle). */
export const TRACKED_FIELDS = {
  grade: 'grade',
  step: 'step',
  job_title: 'jobTitle',
  department: 'department',
  section: 'section',
  work_location: 'workLocation',
  status: 'status',
  service_type: 'serviceType',
  primary_responsibility: 'primaryResponsibility',
  acting_responsibility: 'actingResponsibility',
} as const;

export type TrackedField = keyof typeof TRACKED_FIELDS;

export const FIELD_LABELS: Record<TrackedField, string> = {
  grade: 'الدرجة', step: 'المرحلة', job_title: 'العنوان الوظيفي', department: 'القسم', section: 'الشعبة',
  work_location: 'موقع العمل', status: 'الحالة', service_type: 'نوع الخدمة',
  primary_responsibility: 'المسؤولية الأساسية', acting_responsibility: 'المسؤولية بالوكالة',
};

export const SOURCES = ['تقديري', 'أمر', 'تعديل مباشر', 'ترحيل قديم'] as const;
export type MovementSource = typeof SOURCES[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** اليوم بتوقيت بغداد بصيغة YYYY-MM-DD. */
export function todayBaghdad(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function isTrackedField(f: string): f is TrackedField {
  return Object.prototype.hasOwnProperty.call(TRACKED_FIELDS, f);
}

/** يحوّل القيمة للنوع المخزن بالعمود؛ يرمي HttpError-like عند قيمة غير صالحة. */
export function normalizeFieldValue(field: TrackedField, value: unknown): string | number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (field === 'grade' || field === 'step') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > (field === 'grade' ? 10 : 11)) {
      throw new MovementError(`قيمة ${FIELD_LABELS[field]} غير صالحة: ${value}`);
    }
    return n;
  }
  return String(value).trim();
}

/** تاريخ معروف لبداية القيمة الحالية (ق-4)؛ بدونه null — ما نخترع تاريخاً. */
export function knownStartDate(field: TrackedField, emp: any): string | null {
  const pick = (...vals: any[]) => {
    for (const v of vals) { const s = String(v ?? '').trim().slice(0, 10); if (isIsoDate(s)) return s; }
    return null;
  };
  switch (field) {
    case 'grade': return pick(emp.gradeDate, emp.lastPromotionDate);
    case 'step': return pick(emp.lastIncrementDate);
    case 'status': return pick(emp.statusOrderDate);
    default: return null;
  }
}

export class MovementError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export interface MovementInput {
  employeeId: number;
  effectiveDate: string;
  changes?: Partial<Record<TrackedField, unknown>>;
  event?: string; // حدث بلا تغيير حقل (مثل تسوية شهادة)
  orderId?: number | null;
  source: MovementSource;
  reason?: string | null;
  userLabel?: string | null;
}

const sameValue = (a: unknown, b: unknown) =>
  (a === null || a === undefined || a === '' ? null : String(a).trim()) === (b === null || b === undefined || b === '' ? null : String(b).trim());

/**
 * يسجّل حركة واحدة بمعاملة واحدة ويعيد بناء الحقول المتأثرة بصف الموظف.
 * يرجع الصفوف المسجلة والحقول التي تغيّرت الآن والحقول المؤجلة لتاريخ نفاذ لاحق.
 */
export async function applyMovement(db: any, schema: any, input: MovementInput, opts: { today?: string } = {}) {
  const today = opts.today ?? todayBaghdad();
  if (!isIsoDate(input.effectiveDate)) throw new MovementError('تاريخ النفاذ مطلوب بصيغة YYYY-MM-DD');
  if (!(SOURCES as readonly string[]).includes(input.source)) throw new MovementError('مصدر الحركة غير صالح');
  const rawChanges = input.changes || {};
  const fields = Object.keys(rawChanges);
  for (const f of fields) if (!isTrackedField(f)) throw new MovementError(`الحقل (${f}) غير متتبع بالسجل`);
  const changes = Object.fromEntries(fields.map(f => [f, normalizeFieldValue(f as TrackedField, (rawChanges as any)[f])])) as Record<TrackedField, any>;
  const event = String(input.event ?? '').trim();
  if (fields.length === 0 && !event) throw new MovementError('الحركة بلا تغييرات ولا حدث');

  return db.transaction(async (tx: any) => {
    const [emp] = await tx.select().from(schema.employees).where(eq(schema.employees.id, input.employeeId)).for('update');
    if (!emp) throw new MovementError('الموظف غير موجود', 404);

    if (input.orderId != null) {
      const [order] = await tx.select().from(schema.administrativeOrders).where(eq(schema.administrativeOrders.id, input.orderId));
      if (!order) throw new MovementError('الأمر الإداري غير موجود', 404);
      const cancelled = await tx.select({ id: schema.administrativeOrders.id }).from(schema.administrativeOrders)
        .where(eq(schema.administrativeOrders.cancelsOrderId, input.orderId));
      if (cancelled.length > 0) throw new MovementError('الأمر الإداري ملغى', 409);
    }

    const base = {
      employeeId: input.employeeId,
      orderId: input.orderId ?? null,
      reason: input.reason ?? null,
      snapshot: emp,
      recordedBy: input.userLabel ?? null,
    };
    const inserted: any[] = [];

    for (const f of fields as TrackedField[]) {
      // سجل الأساس: أول حركة على الحقل تحفظ القيمة الحالية قبلها
      const existing = await tx.select({ id: schema.employeeFieldHistory.id }).from(schema.employeeFieldHistory)
        .where(sql`${schema.employeeFieldHistory.employeeId} = ${input.employeeId} AND ${schema.employeeFieldHistory.field} = ${f}`).limit(1);
      const currentValue = (emp as any)[TRACKED_FIELDS[f]];
      if (existing.length === 0 && currentValue !== null && currentValue !== undefined && String(currentValue).trim() !== '') {
        const known = knownStartDate(f, emp);
        const [row] = await tx.insert(schema.employeeFieldHistory).values({
          ...base, orderId: null, field: f, value: currentValue,
          validFrom: known && known < input.effectiveDate ? known : null,
          source: 'تقديري', reason: 'سجل أساس تقديري (ق-4)',
        }).returning();
        inserted.push(row);
      }
      const [row] = await tx.insert(schema.employeeFieldHistory).values({
        ...base, field: f, value: changes[f], validFrom: input.effectiveDate, source: input.source,
      }).returning();
      inserted.push(row);
    }

    if (event) {
      const [row] = await tx.insert(schema.employeeFieldHistory).values({
        ...base, field: 'event', value: event, validFrom: input.effectiveDate, source: input.source,
      }).returning();
      inserted.push(row);
    }

    const rebuilt = await rebuildEmployeeFields(tx, schema, input.employeeId, fields as TrackedField[], today);
    const pending = input.effectiveDate > today ? fields : [];
    return { inserted, changedNow: rebuilt.changed, pending };
  });
}

/** القيم السارية «كما في اليوم» من الخط الزمني. */
export async function valuesAsOf(tx: any, employeeId: number, fields: TrackedField[], day: string): Promise<Map<TrackedField, any>> {
  const out = new Map<TrackedField, any>();
  if (fields.length === 0) return out;
  const res = await tx.execute(sql`
    SELECT "field", "value" FROM "employee_field_timeline"
    WHERE "employee_id" = ${employeeId}
      AND "field" = ANY(${sql.raw(`ARRAY[${fields.map(f => `'${f}'`).join(',')}]::text[]`)})
      AND ("valid_from" IS NULL OR "valid_from" <= ${day}::date)
      AND ("valid_to" IS NULL OR "valid_to" >= ${day}::date)`);
  const rows = (res as any).rows ?? res;
  for (const r of rows) out.set(r.field, r.value);
  return out;
}

/** يعيد بناء الحقول المحددة فقط بصف الموظف من السجل. */
export async function rebuildEmployeeFields(tx: any, schema: any, employeeId: number, fields: TrackedField[], today: string) {
  const asOf = await valuesAsOf(tx, employeeId, fields, today);
  const [emp] = await tx.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  const patch: Record<string, any> = {};
  for (const f of fields) {
    if (!asOf.has(f)) continue; // ما بعد سارٍ (حركة مستقبلية فقط) → تبقى القيمة الحالية
    const col = TRACKED_FIELDS[f];
    const v = asOf.get(f);
    if (!sameValue((emp as any)?.[col], v)) patch[col] = v;
  }
  if (Object.keys(patch).length > 0) {
    await tx.update(schema.employees).set(patch).where(eq(schema.employees.id, employeeId));
  }
  return { changed: Object.keys(patch) };
}

/**
 * يطبّق الحركات المستقبلية التي حلّ تاريخها: الصفوف التي تاريخ نفاذها بعد يوم تسجيلها،
 * وحلّ بين آخر تشغيل واليوم. ما يمس حقولاً بلا حركة مستحقة (حتى ما يرجّع تعديلات مباشرة).
 */
export async function applyDueMovements(db: any, schema: any, opts: { today?: string; since?: string | null } = {}) {
  const today = opts.today ?? todayBaghdad();
  const since = opts.since ?? null;
  const res = await db.execute(sql`
    SELECT DISTINCT "employee_id", "field" FROM "employee_field_timeline"
    WHERE "valid_from" IS NOT NULL
      AND "valid_from" <= ${today}::date
      AND "valid_from" > ("recorded_at" AT TIME ZONE 'Asia/Baghdad')::date
      AND (${since}::date IS NULL OR "valid_from" > ${since}::date)`);
  const rows: any[] = (res as any).rows ?? res;
  const byEmp = new Map<number, TrackedField[]>();
  for (const r of rows) {
    if (!isTrackedField(r.field)) continue;
    const id = Number(r.employee_id);
    byEmp.set(id, [...(byEmp.get(id) || []), r.field]);
  }
  let changed = 0;
  for (const [empId, fields] of byEmp) {
    await db.transaction(async (tx: any) => {
      await tx.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.id, empId)).for('update');
      const r = await rebuildEmployeeFields(tx, schema, empId, fields, today);
      changed += r.changed.length;
    });
  }
  return { employees: byEmp.size, fieldsChanged: changed, today };
}

/** الخط الزمني للعرض: الصفوف الحية + سجل أساس افتراضي لكل حقل بلا صفوف. */
export async function employeeTimeline(db: any, schema: any, employeeId: number) {
  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  if (!emp) throw new MovementError('الموظف غير موجود', 404);
  const res = await db.execute(sql`
    SELECT t.*, o."order_number", o."order_date", o."issuer"
    FROM "employee_field_timeline" t
    LEFT JOIN "administrative_orders" o ON o."id" = t."order_id"
    WHERE t."employee_id" = ${employeeId}
    ORDER BY t."field", t."valid_from" NULLS FIRST, t."recorded_at", t."id"`);
  const rows: any[] = (res as any).rows ?? res;
  const ev = await db.execute(sql`
    SELECT h.*, o."order_number", o."order_date" FROM "employee_field_history" h
    LEFT JOIN "administrative_orders" o ON o."id" = h."order_id"
    WHERE h."employee_id" = ${employeeId} AND h."field" = 'event'
    ORDER BY h."valid_from", h."recorded_at"`);
  const events: any[] = (ev as any).rows ?? ev;
  const seen = new Set(rows.map(r => r.field));
  const virtualBaseline = (Object.keys(TRACKED_FIELDS) as TrackedField[])
    .filter(f => !seen.has(f))
    .map(f => ({ field: f, value: (emp as any)[TRACKED_FIELDS[f]] ?? null, valid_from: knownStartDate(f, emp), valid_to: null, source: 'تقديري', virtual: true }))
    .filter(r => r.value !== null && String(r.value).trim() !== '');
  return { employeeId, today: todayBaghdad(), fields: rows, baseline: virtualBaseline, events, labels: FIELD_LABELS };
}

const DUE_RUN_KEY = 'career.lastDueMovementsRun';

/** مهمة تطبيق الحركات المستقبلية: عند الإقلاع ثم كل ساعة. آخر يوم مطبَّق يُحفظ بالقاعدة. */
export function startDueMovementsJob(db: any, schema: any, log: (msg: string) => void = console.log) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const today = todayBaghdad();
      const [row] = await db.select().from(schema.appSettingsDocuments).where(eq(schema.appSettingsDocuments.key, DUE_RUN_KEY));
      const since = (row?.value as any)?.day ?? null;
      if (since === today) return;
      const r = await applyDueMovements(db, schema, { today, since });
      await db.insert(schema.appSettingsDocuments).values({ key: DUE_RUN_KEY, value: { day: today }, source: 'default' })
        .onConflictDoUpdate({ target: schema.appSettingsDocuments.key, set: { value: { day: today }, updatedAt: new Date() } });
      if (r.employees > 0) log(`[CAREER] طُبّقت حركات مستحقة: ${r.employees} موظف، ${r.fieldsChanged} حقل`);
    } catch (err: any) {
      log(`[CAREER] تعذّر تطبيق الحركات المستحقة: ${err?.message || err}`);
    } finally {
      running = false;
    }
  };
  setTimeout(run, 5_000);
  const timer = setInterval(run, 60 * 60 * 1000);
  (timer as any).unref?.();
  return { run, stop: () => clearInterval(timer) };
}
