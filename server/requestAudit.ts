// server/requestAudit.ts — B9: سجل تدقيق لكل عملية كتابة على الواجهة البرمجية.
// يُسجَّل بعد انتهاء الرد: المستخدم، الدور، المسار، النتيجة، المدة، والجسم بعد حجب الأسرار وقصّه.
import type { Request, Response, NextFunction } from 'express';

// مفاتيح تُحجب: الأسرار (كلمات المرور، الرموز) والبيانات الحساسة التي تخفيها الواجهة (أرقام الحسابات والهوية) — مراجعة B9 M2/L2
const SECRET_KEY = (k: string) => {
  const n = k.toLowerCase().replace(/[\s-]/g, '_');
  if (/password|passwd|secret|token|jwt|authorization|credential|api_?key/.test(n)) return true;
  return /(^|_)(pass|pwd|otp|pin|account_?number|iban|card_?number|national_?id|national_?number|id_?number|passport)(_|$)/.test(n);
};
/** نص يبدو JSON (جسم داخل حقل نصي): يُفك ويُحجب. */
const maybeJson = (v: string) => { const t = v.trim(); if (!(t.startsWith('{') || t.startsWith('['))) return null; try { return JSON.parse(t); } catch { return null; } };
const MAX_BODY = 8_000;

/** يحجب الأسرار ويقص الجسم الكبير (صور، استيراد) حتى ما يتضخم السجل. */
export function redactBody(body: any, depth = 0): any {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') {
    const j = depth < 4 ? maybeJson(body) : null;
    if (j !== null) return redactBody(j, depth + 1);
    return body.length > 500 ? body.slice(0, 500) + '…' : body;
  }
  if (typeof body !== 'object') return body;
  if (depth > 4) return '…';
  if (Array.isArray(body)) {
    const out = body.slice(0, 50).map(x => redactBody(x, depth + 1));
    if (body.length > 50) out.push(`… (${body.length - 50} عنصراً إضافياً)`);
    return out;
  }
  const out: any = {};
  for (const [k, v] of Object.entries(body)) out[k] = SECRET_KEY(k) ? '••••' : redactBody(v, depth + 1);
  return out;
}

export function createRequestAudit(insert: (row: any) => Promise<any>) {
  return function requestAudit(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const started = Date.now();
    let done = false;
    // finish = رد كامل؛ close بلا finish = الطلب انقطع (يُسجَّل أيضاً، بنتيجة 499) — مراجعة L1
    const record = (aborted: boolean) => {
      if (done) return; done = true;
      const user = (req as any).user;
      let body = redactBody(req.body);
      let text = '';
      try { text = JSON.stringify(body ?? null); } catch { body = '«غير قابل للتسلسل»'; }
      if (text.length > MAX_BODY) body = { truncated: true, size: text.length, keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 40) : [] };
      insert({
        username: user?.username ?? null, role: user?.roleName ?? user?.role ?? null, method: req.method, path: req.originalUrl.split('?')[0].slice(0, 500),
        // req.ip يحترم trust proxy (ما يُزوَّر بترويسة) — مراجعة M3
        status: aborted ? 499 : res.statusCode, durationMs: Date.now() - started, ip: req.ip || req.socket.remoteAddress || null, body,
      }).catch((e: any) => console.error('[audit] فشل تسجيل التدقيق:', e?.message)); // ما يُبتلع: يظهر بسجل الخادم (AGENTS 1)
    };
    res.on('finish', () => record(false));
    res.on('close', () => record(!res.writableFinished));
    next();
  };
}
