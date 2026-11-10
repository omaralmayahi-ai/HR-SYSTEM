// src/middleware/auth.ts
// المصادقة والصلاحيات على الخادم.
// - لا يُقبل إلا رمز JWT موقّع بالمفتاح السري (أُلغي قبول JSON بصيغة base64 لأنه يسمح بتزوير أي هوية).
// - المفتاح السري من JWT_SECRET. في الإنتاج يُرفض التشغيل بدونه؛ في التطوير يُستخدم مفتاح عشوائي مؤقت.
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
    name: string;
    email: string;
  };
}

/** الأدوار المعتمدة: 'admin' مدير النظام؛ 'user' مستخدم إدخال وتعديل (موظفو الموارد البشرية)؛ 'employee' اطلاع فقط. */
export const ADMIN_ROLES = ['admin'];
export const WRITE_ROLES = ['admin', 'user', 'hr'];

let cachedSecret: string | null = null;

/** يعيد المفتاح السري لتوقيع JWT. يرمي خطأً في الإنتاج إن لم يُضبط JWT_SECRET أو كان ضعيفاً. */
export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = (process.env.JWT_SECRET || '').trim();
  const isProd = process.env.NODE_ENV === 'production';
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (isProd) {
    throw new Error('JWT_SECRET غير مضبوط أو أقصر من 32 حرفاً في ملف .env. شغّل لوحة التحكم (control-app.bat) لتوليده.');
  }
  console.warn('[SECURITY] JWT_SECRET غير مضبوط: يُستخدم مفتاح عشوائي مؤقت (تنتهي الجلسات عند إعادة التشغيل). اضبطه في .env.');
  cachedSecret = crypto.randomBytes(48).toString('hex');
  return cachedSecret;
}

/**
 * للتوافق مع الاستيراد القديم فقط. لا تستخدمه للتوقيع أو التحقق؛ استخدم getJwtSecret().
 * @deprecated
 */
export const JWT_SECRET = '';

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: رمز الدخول مفقود' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    if (decoded && decoded.username && decoded.role) {
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
        name: decoded.name,
        email: decoded.email,
      };
      return next();
    }
  } catch {
    // رمز غير صالح أو منتهي
  }
  return res.status(401).json({ error: 'غير مصرح: رمز الدخول غير صالح أو منتهي' });
};

/** يسمح فقط بالأدوار المذكورة. يُستخدم بعد requireAuth. */
export const requireRole = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'غير مسموح: لا تملك صلاحية تنفيذ هذا الإجراء' });
    }
    return next();
  };

/** مدير النظام فقط. */
export const requireAdmin = Object.defineProperty(requireRole(...ADMIN_ROLES), 'name', { value: 'requireAdmin' });

/** كل الأدوار عدا 'employee': لعمليات الكتابة على البيانات. */
export const requireWriter = Object.defineProperty(requireRole(...WRITE_ROLES), 'name', { value: 'requireWriter' });
