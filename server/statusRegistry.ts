// server/statusRegistry.ts — B4a (ق-14): معنى كل حالة موظف يُقرأ من جدول employee_statuses
// بدل القوائم الثابتة. الكاش يُبطل عند أي تعديل على الحالات.

export interface StatusFlags {
  name: string;
  isActive: boolean;
  payrollEligible: boolean;
  accruesLeave: boolean;
  isDefault: boolean;
  sortOrder: number;
}

/** السلوك قبل B4a؛ يُستعمل فقط إذا الجدول فارغ (قاعدة جديدة قبل الترحيل). */
export const LEGACY_STATUS_FLAGS: StatusFlags[] = [
  { name: 'مستمر', isActive: true, payrollEligible: true, accruesLeave: true, isDefault: true, sortOrder: 10 },
  { name: 'مستمر بالخدمة', isActive: true, payrollEligible: true, accruesLeave: true, isDefault: false, sortOrder: 11 },
  { name: 'فعال', isActive: true, payrollEligible: true, accruesLeave: true, isDefault: false, sortOrder: 12 },
  { name: 'متقاعد مع تمديد', isActive: true, payrollEligible: false, accruesLeave: false, isDefault: false, sortOrder: 40 },
];

export type StatusLoader = () => Promise<StatusFlags[]>;

export function createStatusRegistry(load: StatusLoader, opts: { ttlMs?: number; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? 60_000;
  const now = opts.now ?? Date.now;
  let cache: StatusFlags[] | null = null;
  let loadedAt = 0;

  async function all(): Promise<StatusFlags[]> {
    if (cache && now() - loadedAt < ttl) return cache;
    const rows = await load();
    cache = rows.length > 0 ? rows : LEGACY_STATUS_FLAGS;
    loadedAt = now();
    return cache;
  }

  const norm = (s: unknown) => String(s ?? '').trim();

  async function defaultStatus(): Promise<string> {
    const list = await all();
    return (list.find(s => s.isDefault) || list[0] || LEGACY_STATUS_FLAGS[0]).name;
  }

  /** حالة فارغة = الحالة الافتراضية (نفس سلوك قاعدة البيانات 'مستمر' كقيمة افتراضية). */
  async function flagsOf(name: unknown): Promise<StatusFlags | undefined> {
    const list = await all();
    const key = norm(name) || (await defaultStatus());
    return list.find(s => s.name === key);
  }

  async function namesWhere(flag: 'isActive' | 'payrollEligible' | 'accruesLeave'): Promise<string[]> {
    return (await all()).filter(s => s[flag]).map(s => s.name);
  }

  /** هل الحالة الفارغة تحمل هذا العلم؟ (لأن الموظف بلا حالة يُعامل كالافتراضية) */
  async function emptyStatusHas(flag: 'isActive' | 'payrollEligible' | 'accruesLeave'): Promise<boolean> {
    const f = await flagsOf('');
    return !!f?.[flag];
  }

  return {
    all,
    flagsOf,
    defaultStatus,
    namesWhere,
    emptyStatusHas,
    isActive: async (n: unknown) => !!(await flagsOf(n))?.isActive,
    isPayrollEligible: async (n: unknown) => !!(await flagsOf(n))?.payrollEligible,
    accruesLeave: async (n: unknown) => !!(await flagsOf(n))?.accruesLeave,
    invalidate: () => { cache = null; },
  };
}

export type StatusRegistry = ReturnType<typeof createStatusRegistry>;

/** المحمّل الفعلي من القاعدة. */
export function dbStatusLoader(db: any, schema: any): StatusLoader {
  return async () => {
    const rows = await db.select().from(schema.employeeStatuses);
    return rows
      .map((r: any) => ({
        name: String(r.name || '').trim(),
        isActive: !!r.isActive,
        payrollEligible: !!r.payrollEligible,
        accruesLeave: !!r.accruesLeave,
        isDefault: !!r.isDefault,
        sortOrder: Number(r.sortOrder ?? 100),
      }))
      .filter((r: StatusFlags) => r.name)
      .sort((a: StatusFlags, b: StatusFlags) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ar'));
  };
}
