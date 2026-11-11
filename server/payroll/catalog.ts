// server/payroll/catalog.ts — B8a1: قواعد البنود (props)، حقول الشروط، التقسيم عند الاعتماد، والأوامر.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { isIsoDate } from '../careerMovements.ts';

export class PayrollError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const STATUSES = ['مسودة', 'فعّال', 'موقوف', 'منتهٍ'] as const;
export const VERIFICATIONS = ['مؤكد', 'يُتحقق'] as const;

/** حقول الشروط: الحقول المتتبعة بالسجل المؤرخ فقط (التصميم 4.5). */
export const CONDITION_FIELDS: Record<string, { label: string; type: 'text' | 'int' | 'bool' | 'unit' }> = {
  grade: { label: 'الدرجة', type: 'int' },
  step: { label: 'المرحلة', type: 'int' },
  job_title: { label: 'العنوان الوظيفي', type: 'text' },
  org_unit_id: { label: 'الوحدة التنظيمية', type: 'unit' },
  work_location: { label: 'موقع العمل', type: 'text' },
  status: { label: 'الحالة', type: 'text' },
  service_type: { label: 'نوع الخدمة', type: 'text' },
  contract_type: { label: 'نوع العقد', type: 'text' },
  primary_responsibility: { label: 'المسؤولية الأساسية', type: 'text' },
  acting_responsibility: { label: 'المسؤولية بالوكالة', type: 'text' },
  education_level: { label: 'الشهادة', type: 'text' },
  marital_status: { label: 'الحالة الاجتماعية', type: 'text' },
  gender: { label: 'الجنس', type: 'text' },
  free_transport: { label: 'النقل المجاني', type: 'bool' },
  risk_exposure: { label: 'الخطورة', type: 'text' },
  family_mode: { label: 'نمط الاستحقاق العائلي', type: 'text' },
};
export const OPERATORS = ['يساوي', 'لا يساوي', 'ضمن', 'ليس ضمن', '>=', '<=', 'بين', 'فارغ', 'غير فارغ', 'ضمن الوحدة وما تحتها'] as const;

/** مصادر المستويات: جدول ترميز ← حقل الموظف الذي يُطابَق باسمه. */
export const LEVEL_SOURCES: Record<string, { table: string; field: string; label: string }> = {
  education_degrees: { table: 'education_degrees', field: 'education_level', label: 'الشهادات' },
  responsibility_allowances: { table: 'responsibility_allowances', field: 'primary_responsibility', label: 'المسؤوليات' },
  work_locations: { table: 'work_locations', field: 'work_location', label: 'مواقع العمل' },
};

const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
const finite = (v: any) => v === null || Number.isFinite(v);

/** يتحقق من خصائص نسخة البند ويطبّعها. الطريقة من البند نفسه. */
export function validateProps(item: { method: string; direction: string; classification: string }, raw: any) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PayrollError('خصائص البند مطلوبة');
  const p: any = { ...raw };
  if (!STATUSES.includes(p.status)) throw new PayrollError(`حالة البند: ${STATUSES.join(' / ')}`);
  if (!VERIFICATIONS.includes(p.verification)) throw new PayrollError('حالة التحقق: مؤكد / يُتحقق');
  p.legal_basis = String(p.legal_basis ?? '').trim();
  for (const k of ['value', 'calc_order', 'cap_reduction_priority', 'deduction_priority']) {
    p[k] = num(p[k]);
    if (!finite(p[k])) throw new PayrollError(`قيمة غير صالحة: ${k}`);
  }
  if (p.value_kind !== undefined && p.value_kind !== null && !['نسبة', 'مبلغ'].includes(p.value_kind)) throw new PayrollError('نوع القيمة: نسبة / مبلغ');
  if (p.value_kind === 'نسبة' && p.value !== null && (p.value < 0 || p.value > 1000)) throw new PayrollError('النسبة بين 0 و1000');
  if (p.levels !== undefined) {
    if (!Array.isArray(p.levels)) throw new PayrollError('المستويات قائمة');
    const seen = new Set<string>();
    p.levels = p.levels.map((l: any) => {
      const ref = l?.ref_id ?? l?.value_key;
      if (ref === undefined || ref === null || ref === '') throw new PayrollError('كل مستوى يحتاج مرجعاً');
      const key = String(ref);
      if (seen.has(key)) throw new PayrollError(`مستوى مكرر: ${l?.label || key}`); // قيد «لا قيمتين لنفس الحقل»
      seen.add(key);
      const value = num(l?.value);
      if (!finite(value)) throw new PayrollError(`قيمة المستوى غير صالحة: ${l?.label || key}`);
      return { ref_id: l.ref_id ?? null, value_key: l.value_key ?? null, label: String(l?.label ?? ''), value };
    });
  }
  if (p.level_source !== undefined && p.level_source !== null && !LEVEL_SOURCES[p.level_source]) throw new PayrollError('مصدر المستويات غير معروف');
  if (p.conditions !== undefined && p.conditions !== null) {
    if (!Array.isArray(p.conditions) || p.conditions.some((g: any) => !Array.isArray(g))) throw new PayrollError('الشروط: مجموعات «أو» من شروط «و»');
    for (const g of p.conditions) for (const c of g) {
      if (!CONDITION_FIELDS[c?.field]) throw new PayrollError(`حقل شرط غير مسموح: ${c?.field} (الشروط على الحقول المتتبعة بالسجل فقط)`);
      if (!(OPERATORS as readonly string[]).includes(c?.op)) throw new PayrollError(`عامل غير معروف: ${c?.op}`);
      const t = CONDITION_FIELDS[c.field].type;
      if (c.op === 'بين' && (!Array.isArray(c.value) || c.value.length !== 2)) throw new PayrollError('«بين» تحتاج قيمتين');
      if (['ضمن', 'ليس ضمن'].includes(c.op) && !Array.isArray(c.value)) c.value = [c.value];
      if (t === 'bool' && !['فارغ', 'غير فارغ'].includes(c.op)) {
        const b = c.value === true || c.value === 'true' || c.value === 'نعم' ? true : c.value === false || c.value === 'false' || c.value === 'لا' ? false : null;
        if (b === null) throw new PayrollError(`قيمة «${CONDITION_FIELDS[c.field].label}» نعم/لا`);
        c.value = b;
      }
      if ((t === 'int' || t === 'unit') && !['فارغ', 'غير فارغ', 'ضمن', 'ليس ضمن', 'بين'].includes(c.op) && !Number.isFinite(Number(c.value))) {
        throw new PayrollError(`قيمة «${CONDITION_FIELDS[c.field].label}» رقم`);
      }
    }
  }
  if (p.base !== undefined && (!Array.isArray(p.base) || p.base.some((b: any) => typeof b !== 'string'))) throw new PayrollError('الوعاء قائمة رموز');
  if (item.method === 'family') {
    const f = p.family || {};
    for (const k of ['spouse_amount', 'child_amount', 'max_children', 'son_student_age', 'son_age']) {
      if (!Number.isFinite(Number(f[k])) || Number(f[k]) < 0) throw new PayrollError(`ضابط العائلية ناقص: ${k}`);
    }
  }
  return p;
}

/** قواعد التفعيل (القسم 6.1 + مب8 + ق-6). تُفحص عند الاعتماد لنسخة غير مسودة. */
export function activationProblems(item: any, props: any, order: { orderDate?: string | null } | null, validFrom: string): string[] {
  const out: string[] = [];
  if (props.status === 'مسودة') return out;
  if (props.verification !== 'مؤكد') out.push('قيمة بحالة «يُتحقق» ما تُفعَّل (مب8)');
  if (!props.legal_basis) out.push('السند القانوني مطلوب');
  if (!order) out.push('أمر التفعيل مطلوب');
  if (order?.orderDate && validFrom < order.orderDate) out.push('تاريخ النفاذ يسبق تاريخ الأمر (يحتاج عملية أثر رجعي — B8c)');
  if (item.direction === '+' && props.inside_200_cap && (props.cap_reduction_priority === null || props.cap_reduction_priority === undefined)) {
    out.push('بند داخل سقف 200% يحتاج «أولوية التخفيض» (ق-6)');
  }
  if (['tiered'].includes(item.method) && (!Array.isArray(props.levels) || props.levels.length === 0)) out.push('البند المتدرج بلا مستويات');
  if (item.method === 'percent' && item.assignmentMode === 'تلقائي' && !(Number(props.value) > 0)) out.push('النسبة مطلوبة');
  const base: string[] = Array.isArray(props.base) ? props.base : [];
  if (base.includes(item.code)) out.push('البند يدخل بوعاء نفسه');
  return out;
}

export async function ensureOrder(tx: any, schema: any, order: any, user: string | null): Promise<{ id: number; orderDate: string } | null> {
  if (!order) return null;
  if (order.id) {
    const [o] = await tx.select().from(schema.administrativeOrders).where(eq(schema.administrativeOrders.id, Number(order.id)));
    if (!o) throw new PayrollError('الأمر الإداري غير موجود', 404);
    return { id: o.id, orderDate: o.orderDate };
  }
  const number = String(order.order_number ?? '').trim();
  const date = String(order.order_date ?? '').trim();
  if (!number && !date) return null;
  if (!number || !isIsoDate(date)) throw new PayrollError('رقم الأمر وتاريخه (YYYY-MM-DD) مطلوبان');
  const issuer = String(order.issuer ?? '').trim() || null;
  await tx.execute(sql`INSERT INTO administrative_orders (order_number, order_date, issuer, order_kind, subject, created_by)
    VALUES (${number}, ${date}::date, ${issuer}, ${order.order_kind ?? 'رواتب'}, ${order.subject ?? null}, ${user})
    ON CONFLICT (order_number, order_date, coalesce(issuer, '')) DO NOTHING`);
  const r = await tx.execute(sql`SELECT id, order_date::text AS order_date FROM administrative_orders
    WHERE order_number = ${number} AND order_date = ${date}::date AND coalesce(issuer, '') = coalesce(${issuer}::text, '') LIMIT 1`);
  const row = ((r as any).rows ?? r)[0];
  return { id: Number(row.id), orderDate: row.order_date };
}

const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
};
const overlaps = (aFrom: string, aTo: string | null, bFrom: string, bTo: string | null) =>
  (bTo === null || aFrom <= bTo) && (aTo === null || bFrom <= aTo);

/**
 * يستبدل الصفوف الحية المتداخلة مع المدى الجديد ويُبقي أطرافها خارج المدى (بمعاملة واحدة، عند الاعتماد).
 * table: جدول بأعمدة validFrom/validTo/supersededAt/supersededBy. keyWhere: شرط المفتاح (بند، أو موظف+بند).
 */
export async function supersedeAndInsert(tx: any, table: any, keyWhere: any, row: any) {
  const live = await tx.select().from(table).where(and(keyWhere, isNull(table.supersededAt))).for('update');
  const newFrom: string = row.validFrom, newTo: string | null = row.validTo ?? null;
  if (newTo !== null && newTo < newFrom) throw new PayrollError('تاريخ النهاية قبل البداية');
  const victims = live.filter((v: any) => overlaps(v.validFrom, v.validTo, newFrom, newTo));
  // نفس ساعة recorded_at (now() للمعاملة) حتى ما تظهر النسختان معاً لأي لحظة knownAt
  const nowRes = await tx.execute(sql`SELECT now() AS now`);
  const now = new Date(((nowRes as any).rows ?? nowRes)[0].now);
  const remainders: any[] = [];
  for (const v of victims) {
    const { id, recordedAt, supersededAt, supersededBy, ...rest } = v;
    if (v.validFrom < newFrom) remainders.push({ ...rest, validFrom: v.validFrom, validTo: addDays(newFrom, -1) });
    if (newTo !== null && (v.validTo === null || v.validTo > newTo)) remainders.push({ ...rest, validFrom: addDays(newTo, 1), validTo: v.validTo });
  }
  // أولاً نعلّم المستبدلين (حتى ما يتعارض قيد التداخل)، ثم الأطراف، ثم الجديد
  for (const v of victims) await tx.update(table).set({ supersededAt: now }).where(eq(table.id, v.id));
  const inserted: any[] = [];
  for (const r of remainders) inserted.push((await tx.insert(table).values(r).returning())[0]);
  const [created] = await tx.insert(table).values(row).returning();
  for (const v of victims) await tx.update(table).set({ supersededBy: created.id }).where(eq(table.id, v.id));
  return { created, superseded: victims.map((v: any) => v.id), remainders: inserted.map(r => r.id) };
}
