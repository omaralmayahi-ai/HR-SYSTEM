// server/routeRegistry.ts
// Guards against registering the same METHOD + PATH twice on the Express app.
// Express silently serves the FIRST registration and the second copy becomes dead code; that
// hid bugs (e.g. duplicated /api/settings and /api/logs). After `installRouteRegistry(app)`, any
// duplicate registration throws at startup.

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = typeof METHODS[number];

export interface RouteRegistry {
  has(method: Method, path: string): boolean;
  list(): string[];
  /** المسارات ووسطاؤها ومواضع app.use بترتيب التسجيل الفعلي */
  inventory(): string[];
}

export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export function installRouteRegistry(app: any): RouteRegistry {
  const seen = new Map<string, number>();
  // B3 (مراجعة: M2، M3): الجرد يسجّل وسطاء كل مسار (requireAuth/requireAdmin...) ومواضع app.use
  // بالترتيب، فإسقاط requireAdmin أو تسجيل مجال قبل بوابة الانقطاع أو بعد الـ catch-all يُفشل لقطة الجرد.
  const inventory: string[] = [];
  const fnName = (f: any) => (typeof f === 'function' ? (f.name || 'anonymous') : typeof f);
  let order = 0;

  const originalUse = app.use.bind(app);
  app.use = (...args: any[]) => {
    const where = typeof args[0] === 'string' ? args[0] : '*';
    const fns = (typeof args[0] === 'string' ? args.slice(1) : args).map(fnName);
    inventory.push(`USE ${where} [${fns.join(',')}]`);
    return originalUse(...args);
  };

  for (const method of METHODS) {
    const original = app[method].bind(app);
    app[method] = (...args: any[]) => {
      // app.get('setting') is the settings getter, not a route.
      if (method === 'get' && args.length === 1 && typeof args[0] === 'string') {
        return original(...args);
      }
      const p = args[0];
      if (typeof p === 'string') {
        const key = routeKey(method, p);
        if (seen.has(key)) {
          throw new Error(`[ROUTES] تسجيل مكرر للمسار ${key}: النسخة الثانية لن تُنفَّذ أبداً. احذف أحد التعريفين.`);
        }
        seen.set(key, order++);
        // الوسطاء = كل الدوال عدا الأخيرة (المعالج)
        inventory.push(`${key} [${args.slice(1, -1).map(fnName).join(',')}]`);
      }
      return original(...args);
    };
  }

  return {
    has: (method, p) => seen.has(routeKey(method, p)),
    list: () => [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k),
    inventory: () => [...inventory],
  };
}
