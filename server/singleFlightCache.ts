// server/singleFlightCache.ts — نتيجة حساب ثقيل تُحسب مرة وحدة لكل الطلبات المتزامنة وتُحفظ لمدة قصيرة.
// أي عملية كتابة ناجحة تبطلها، فما تظهر نتيجة قديمة بعد تعديل.

export function createSingleFlightCache<T>(opts: { ttlMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  let compute: (() => Promise<T>) | null = null;
  let value: T | undefined;
  let at = 0;
  let generation = 0;
  let inflight: Promise<T> | null = null;

  return {
    setCompute(fn: () => Promise<T>) { compute = fn; },
    async get(): Promise<T> {
      if (value !== undefined && now() - at < opts.ttlMs) return value;
      if (inflight) return inflight;
      if (!compute) throw new Error('singleFlightCache: compute not set');
      const gen = generation;
      inflight = compute()
        .then(v => {
          // ما نحفظ نتيجة بدأ حسابها قبل إبطال (كتابة حدثت أثناء الحساب)
          if (gen === generation) { value = v; at = now(); }
          return v;
        })
        .finally(() => { inflight = null; });
      return inflight;
    },
    invalidate() { generation++; value = undefined; },
  };
}
