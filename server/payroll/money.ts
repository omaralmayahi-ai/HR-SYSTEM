// server/payroll/money.ts — B8a2: حساب مالي بلا أعداد عائمة. الوحدة: مليونية الدينار (1 دينار = 10^6) بـ bigint.
// النسب بوحدة 10^-4 من النقطة المئوية (45.5% = 455000n). كل قسمة تُقرَّب النصف بعيداً عن الصفر.

export const SCALE = 1_000_000n;           // دقة المبالغ: 6 منازل
export const RATE_SCALE = 10_000n;         // دقة النسب: 4 منازل
export type Micro = bigint;

/** قسمة مقرّبة: النصف بعيداً عن الصفر. */
export function divRound(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error('قسمة على صفر');
  const neg = (a < 0n) !== (b < 0n);
  const A = a < 0n ? -a : a, B = b < 0n ? -b : b;
  const q = A / B, r = A % B;
  const res = r * 2n >= B ? q + 1n : q;
  return neg ? -res : res;
}

/** a × b ÷ c بقسمة واحدة مقرّبة. */
export const mulDiv = (a: bigint, b: bigint, c: bigint) => divRound(a * b, c);

function parseDecimal(v: unknown, scale: bigint, digits: number): bigint {
  if (typeof v === 'bigint') return v * scale;
  if (v === null || v === undefined || v === '') return 0n;
  let s = typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(digits) : 'NaN') : String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`قيمة رقمية غير صالحة: ${v}`);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [int, frac = ''] = s.split('.');
  const fracPadded = (frac + '0'.repeat(digits + 1)).slice(0, digits + 1); // رقم إضافي للتقريب
  let n = BigInt(int) * scale + BigInt(fracPadded.slice(0, digits) || '0');
  if (Number(fracPadded[digits]) >= 5) n += 1n;
  return neg ? -n : n;
}

/** دينار (نص NUMERIC أو رقم) ← مليونية. */
export const money = (v: unknown): Micro => parseDecimal(v, SCALE, 6);
/** نسبة مئوية (45 أو "45.5") ← وحدة النسب. */
export const rate = (v: unknown): bigint => parseDecimal(v, RATE_SCALE, 4);
/** مبلغ × نسبة مئوية. */
export const applyRate = (amount: Micro, r: bigint): Micro => mulDiv(amount, r, 100n * RATE_SCALE);
/** تقريب لأقرب دينار (النصف للأعلى بالقيمة المطلقة). */
export const roundDinar = (m: Micro): Micro => divRound(m, SCALE) * SCALE;
/** للعرض والتخزين NUMERIC(18,6). */
export function toDecimal(m: Micro): string {
  const neg = m < 0n; const a = neg ? -m : m;
  const s = `${a / SCALE}.${(a % SCALE).toString().padStart(6, '0')}`;
  return neg ? '-' + s : s;
}
export const toDinars = (m: Micro): number => Number(divRound(m, SCALE)); // للملخصات المقرّبة فقط
export const sum = (xs: Micro[]): Micro => xs.reduce((a, b) => a + b, 0n);
export const minM = (a: Micro, b: Micro) => (a < b ? a : b);
export const maxM = (a: Micro, b: Micro) => (a > b ? a : b);
