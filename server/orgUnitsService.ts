// server/orgUnitsService.ts — B5: ربط الموظف بالوحدة التنظيمية بالمعرّف.
// department = اسم الوحدة، section = المسار الكامل «أ / ب / ج» (نفس getHierarchyChain بالواجهة)،
// وكلاهما نص عرض مشتق من org_unit_id يُعاد حسابه عند إعادة تسمية الوحدة أو نقلها.
import { eq, inArray, sql } from 'drizzle-orm';

export interface UnitLite { id: number; name: string; parentId: number | null }

/** المسار الكامل لكل وحدة؛ الأب المفقود يجعل الوحدة جذراً (كالواجهة). */
export function unitPaths(units: UnitLite[]): Map<number, string> {
  const byId = new Map(units.map(u => [u.id, u]));
  const out = new Map<number, string>();
  const pathOf = (u: UnitLite, seen = new Set<number>()): string => {
    if (out.has(u.id)) return out.get(u.id)!;
    if (seen.has(u.id)) return u.name; // حلقة: نوقف
    seen.add(u.id);
    const parent = u.parentId != null ? byId.get(u.parentId) : undefined;
    const p = parent ? `${pathOf(parent, seen)} / ${u.name}` : u.name;
    out.set(u.id, p);
    return p;
  };
  for (const u of units) pathOf(u);
  return out;
}

export function descendantsOf(units: UnitLite[], rootId: number): number[] {
  const out: number[] = [];
  const walk = (pid: number) => { for (const u of units) if (u.parentId === pid && !out.includes(u.id)) { out.push(u.id); walk(u.id); } };
  walk(rootId);
  return out;
}

/** يحدد الوحدة من نصوص الاستمارة/الاستيراد: المسار أولاً، ثم اسم وحدة وحيد. */
export function resolveOrgUnitId(units: UnitLite[], department: unknown, section: unknown): number | null {
  const sec = String(section ?? '').trim();
  const dep = String(department ?? '').trim();
  const paths = unitPaths(units);
  if (sec) {
    const hits = units.filter(u => paths.get(u.id) === sec);
    if (hits.length === 1) return hits[0].id;
  }
  if (dep) {
    const hits = units.filter(u => String(u.name).trim() === dep);
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}

export async function loadUnits(db: any, schema: any): Promise<UnitLite[]> {
  const rows = await db.select({ id: schema.orgUnits.id, name: schema.orgUnits.name, parentId: schema.orgUnits.parentId }).from(schema.orgUnits);
  return rows.map((r: any) => ({ id: Number(r.id), name: String(r.name ?? ''), parentId: r.parentId == null ? null : Number(r.parentId) }));
}

/**
 * يكمّل بيانات الموظف قبل الحفظ:
 * - org_unit_id صريح ومختلف عن الحالي ← يشتق القسم والشعبة منه (ويرفض وحدة منتهية أو مجدولة للإنهاء).
 * - org_unit_id مساوٍ للحالي ← ما يلمس النصين (الاستمارة ترسل كل الحقول بكل حفظ).
 * - بلا معرّف ونُصّا القسم/الشعبة موجودان ← يحدد المعرّف منهما؛ إذا ما تحدد ما يمس الربط الموجود.
 * - org_unit_id = null صراحة ← يفك الربط.
 * الأخطاء ذات status رسائل للمستخدم؛ غيرها أخطاء قاعدة تُرمى كما هي.
 */
export async function attachOrgUnit(
  db: any, schema: any, target: Record<string, any>, body: Record<string, any>,
  opts: { currentOrgUnitId?: number | null; units?: UnitLite[] } = {},
) {
  const hasExplicit = body && (Object.prototype.hasOwnProperty.call(body, 'org_unit_id') || Object.prototype.hasOwnProperty.call(body, 'orgUnitId'));
  const explicit = !hasExplicit ? undefined
    : Object.prototype.hasOwnProperty.call(body, 'org_unit_id') ? body.org_unit_id : body.orgUnitId;
  const touchesText = body?.department !== undefined || body?.section !== undefined;
  if (!hasExplicit && !touchesText) return;

  if (hasExplicit && (explicit === null || explicit === '')) {
    target.orgUnitId = null;
    return;
  }
  if (hasExplicit) {
    const id = Number(explicit);
    if (!Number.isInteger(id)) throw Object.assign(new Error('معرّف الوحدة التنظيمية غير صالح'), { status: 400 });
    if (opts.currentOrgUnitId != null && Number(opts.currentOrgUnitId) === id) {
      delete target.orgUnitId; // ما تغيّر شي
      return;
    }
    const units = opts.units ?? await loadUnits(db, schema);
    const unit = units.find(u => u.id === id);
    if (!unit) throw Object.assign(new Error('الوحدة التنظيمية المختارة غير موجودة'), { status: 400 });
    const [row] = await db.select({ validTo: schema.orgUnits.validTo }).from(schema.orgUnits).where(eq(schema.orgUnits.id, id));
    if (row?.validTo) throw Object.assign(new Error('الوحدة التنظيمية المختارة منتهية أو مجدولة للإنهاء'), { status: 400 });
    target.orgUnitId = id;
    target.department = unit.name;
    target.section = unitPaths(units).get(id);
    return;
  }
  const units = opts.units ?? await loadUnits(db, schema);
  const resolved = resolveOrgUnitId(units, body?.department ?? target.department, body?.section ?? target.section);
  if (resolved != null) target.orgUnitId = resolved;
  else delete target.orgUnitId; // ملتبس أو غير معروف: يبقى الربط الحالي
}

/** بعد إعادة تسمية وحدة أو نقلها: يحدّث نصّي القسم والشعبة لموظفي الوحدات المعطاة (يلتقطه السجل المؤرخ). */
export async function refreshEmployeesOrgText(tx: any, schema: any, unitIds: number[], reason: string) {
  if (unitIds.length === 0) return 0;
  const units = await loadUnits(tx, schema);
  const paths = unitPaths(units);
  const byId = new Map(units.map(u => [u.id, u]));
  await tx.execute(sql`SELECT set_config('hr.reason', ${reason}, true)`);
  const emps = await tx.select({ id: schema.employees.id, orgUnitId: schema.employees.orgUnitId, department: schema.employees.department, section: schema.employees.section })
    .from(schema.employees).where(inArray(schema.employees.orgUnitId, unitIds));
  let changed = 0;
  for (const e of emps as any[]) {
    const u = byId.get(Number(e.orgUnitId));
    if (!u) continue;
    const dep = u.name, sec = paths.get(u.id) ?? u.name;
    if (e.department !== dep || e.section !== sec) {
      await tx.update(schema.employees).set({ department: dep, section: sec }).where(eq(schema.employees.id, e.id));
      changed++;
    }
  }
  return changed;
}
