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
}

export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export function installRouteRegistry(app: any): RouteRegistry {
  const seen = new Map<string, number>();
  let order = 0;

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
      }
      return original(...args);
    };
  }

  return {
    has: (method, p) => seen.has(routeKey(method, p)),
    list: () => [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k)
  };
}
