import { describe, it, expect, vi } from 'vitest';
import { createSingleFlightCache } from './singleFlightCache';

describe('singleFlightCache (أداء قائمة المستحقين)', () => {
  it('الطلبات المتزامنة تشترك بحساب واحد، ثم تُخدم من الذاكرة', async () => {
    let t = 0;
    const c = createSingleFlightCache<number>({ ttlMs: 1000, now: () => t });
    const fn = vi.fn(async () => 42);
    c.setCompute(fn);
    const [a, b] = await Promise.all([c.get(), c.get()]);
    expect([a, b]).toEqual([42, 42]);
    await c.get();
    expect(fn).toHaveBeenCalledTimes(1);
    t = 2000; await c.get();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('الإبطال أثناء الحساب يمنع حفظ النتيجة القديمة', async () => {
    const c = createSingleFlightCache<number>({ ttlMs: 60_000 });
    let n = 0;
    let release!: () => void;
    c.setCompute(() => new Promise<number>(r => { const v = ++n; release = () => r(v); }));
    const p = c.get();
    c.invalidate();
    release(); await p;
    const next = c.get(); release(); expect(await next).toBe(2);
  });

  it('الخطأ ما يُحفظ', async () => {
    const c = createSingleFlightCache<number>({ ttlMs: 60_000 });
    let fail = true;
    c.setCompute(async () => { if (fail) throw new Error('x'); return 1; });
    await expect(c.get()).rejects.toThrow('x');
    fail = false;
    expect(await c.get()).toBe(1);
  });
});
