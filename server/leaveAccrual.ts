// server/leaveAccrual.ts
// Monthly ordinary/sick leave accrual rules (pure functions + SQL text), kept apart from server.ts
// so they can be unit-tested.
//
// Legal basis (Civil Service Law 24/1960, art. 43 as summarised in the requirements doc):
//   ordinary leave accrues 1 day per 10 days of service = 3 days per month; accumulation cap 180 days.
//   sick leave: 30 days full pay per service year (2.5 days/month is kept as the configurable default).

export const LEGAL_MONTHLY_REGULAR_LEAVE_DAYS = 3;
export const LEGAL_MAX_REGULAR_LEAVE_ACCUMULATION = 180;
export const DEFAULT_MONTHLY_SICK_LEAVE_DAYS = 2.5;
export const DEFAULT_MAX_SICK_LEAVE_ACCUMULATION = 180;

export interface AccrualParams {
  regularDays: number;
  sickDays: number;
  regularCap: number;
  sickCap: number;
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Effective accrual parameters from system settings, with legal defaults and the legal 180-day cap. */
export function resolveAccrualParams(settings: any): AccrualParams {
  const regularDays = num(settings?.monthlyRegularLeaveDays) ?? LEGAL_MONTHLY_REGULAR_LEAVE_DAYS;
  const sickDays = num(settings?.monthlySickLeaveDays) ?? DEFAULT_MONTHLY_SICK_LEAVE_DAYS;
  const configuredRegCap = num(settings?.maxRegularLeaveAccumulation);
  const regularCap = Math.min(configuredRegCap && configuredRegCap > 0 ? configuredRegCap : LEGAL_MAX_REGULAR_LEAVE_ACCUMULATION, LEGAL_MAX_REGULAR_LEAVE_ACCUMULATION);
  const configuredSickCap = num(settings?.maxSickLeaveAccumulation);
  const sickCap = configuredSickCap && configuredSickCap > 0 ? configuredSickCap : DEFAULT_MAX_SICK_LEAVE_ACCUMULATION;
  return { regularDays: Math.max(0, regularDays), sickDays: Math.max(0, sickDays), regularCap, sickCap };
}

/**
 * New balance after one month of accrual, rounded to 2 decimals (no integer rounding drift).
 * A balance already at/above the cap is left unchanged — it is never reduced silently.
 */
export function accrueBalance(current: any, add: number, cap: number): number {
  const cur = num(current) ?? 0;
  if (cur >= cap) return round2(cur);
  return round2(Math.min(cur + add, cap));
}

export function isValidAccrualMonth(month: any): boolean {
  return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/** B4a: القائمة الاحتياطية فقط؛ القائمة الفعلية من statusRegistry (accrues_leave). */
export const ACCRUAL_ELIGIBLE_STATUSES = ['مستمر', 'مستمر بالخدمة', 'فعال'];

/** SQL applying one month of accrual ($1 reg days, $2 reg cap, $3 sick days, $4 sick cap,
 * $5 text[] eligible statuses, $6 boolean: employees with empty status are eligible). */
export const ACCRUAL_UPDATE_SQL = `
  UPDATE employees
  SET initial_regular_leave_balance = CASE
        WHEN COALESCE(initial_regular_leave_balance, 0) >= $2 THEN initial_regular_leave_balance
        ELSE ROUND(LEAST(COALESCE(initial_regular_leave_balance, 0)::numeric + $1::numeric, $2::numeric), 2)::real
      END,
      initial_sick_leave_balance = CASE
        WHEN COALESCE(initial_sick_leave_balance, 0) >= $4 THEN initial_sick_leave_balance
        ELSE ROUND(LEAST(COALESCE(initial_sick_leave_balance, 0)::numeric + $3::numeric, $4::numeric), 2)::real
      END
  WHERE btrim(status) = ANY($5::text[]) OR ($6::boolean AND (status IS NULL OR btrim(status) = ''))`;

/** Claims the month in leave_accrual_runs; returns no row when the month was already accrued. */
export const ACCRUAL_CLAIM_SQL = `
  INSERT INTO leave_accrual_runs (month, regular_days_added, sick_days_added, triggered_by)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (month) DO NOTHING
  RETURNING month`;
