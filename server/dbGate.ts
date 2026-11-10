// server/dbGate.ts — بوابة انقطاع قاعدة البيانات (B2d، قرار ق-2)
// عند انقطاع القاعدة يتوقف النظام برسالة واضحة: لا قراءة من نسخة قديمة ولا كتابة في الذاكرة أو الملف.
//
// الصحة تُقرَّر من مجمّع اتصال مستقل بحجم اتصال واحد (مراجعة B2: M2): امتلاء المجمّع الرئيسي بتقرير
// ثقيل ليس انقطاعاً، ولا يجوز أن يغلق النظام على الجميع.
import type { Request, Response, NextFunction } from 'express';

export const DB_UNAVAILABLE_MESSAGE =
  'قاعدة البيانات غير متاحة حالياً. لم يُحفظ ولم يُعرض أي شيء. أعد المحاولة بعد قليل، وإن استمر الانقطاع راجع مسؤول النظام.';

// مسارات تعمل بلا قاعدة (مراجعة B2: M1): فحص الحالة، صفحة الدخول، التحقق من الجلسة (JWT فقط)
export const GATE_EXEMPT = new Set(['/api/health', '/api/settings/public', '/api/auth/me', '/api/admin/schema-health']);

export interface HealthProbe { (): Promise<boolean> }

export function createDbGate(probe: HealthProbe, opts: { cacheMs?: number; now?: () => number } = {}) {
  const cacheMs = opts.cacheMs ?? 2000;
  const now = opts.now ?? (() => Date.now());
  let lastAt = 0;
  let checked = false;
  let lastUp = true;
  let inflight: Promise<boolean> | null = null;

  async function isUp(): Promise<boolean> {
    if (checked && now() - lastAt < cacheMs) return lastUp;
    if (!inflight) {
      inflight = probe().catch(() => false).then((up) => {
        lastUp = up; lastAt = now(); checked = true; inflight = null;
        if (!up) console.warn('[DB-GATE] قاعدة البيانات غير متاحة — الطلبات تُرفض بـ 503');
        return up;
      });
    }
    return inflight;
  }

  /** يُستدعى من مسارات الأخطاء عند فشل اتصال فعلي: يُسقط الذاكرة المؤقتة فيُعاد الفحص فوراً. */
  function invalidate() { checked = false; }

  function middleware(req: Request, res: Response, next: NextFunction) {
    const p = req.path.startsWith('/api/') ? req.path : '/api' + req.path;
    if (GATE_EXEMPT.has(p) || GATE_EXEMPT.has(req.originalUrl.split('?')[0])) return next();
    isUp().then((up) => {
      if (up) return next();
      res.status(503).json({ error: DB_UNAVAILABLE_MESSAGE, code: 'DB_UNAVAILABLE' });
    }, () => res.status(503).json({ error: DB_UNAVAILABLE_MESSAGE, code: 'DB_UNAVAILABLE' }));
  }

  return { isUp, invalidate, middleware, status: () => ({ up: lastUp, checkedAt: checked ? new Date(lastAt).toISOString() : null }) };
}
