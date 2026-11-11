// src/middleware/auth.ts
// المصادقة والصلاحيات على الخادم.
// - لا يُقبل إلا رمز JWT موقّع بالمفتاح السري (أُلغي قبول JSON بصيغة base64 لأنه يسمح بتزوير أي هوية).
// - المفتاح السري من JWT_SECRET. في الإنتاج يُرفض التشغيل بدونه؛ في التطوير يُستخدم مفتاح عشوائي مؤقت.
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { DEFAULT_ROLES, type RoleDef } from '../../server/permissions.ts';

/**
 * سجل الأدوار (B9): يُحمَّل من جدول roles عند التشغيل وبعد كل تعديل. الدور المخصص يُترجم إلى «أساسه»
 * للمسارات القديمة (req.user.role)، واسمه وصلاحياته بـ roleName/permissions للمسارات الجديدة.
 */
let roleDefs = new Map<string, RoleDef>(DEFAULT_ROLES.map(r => [r.name, r]));
/** المستخدمون الحاليون (معرّف ← اسم ودور): المحذوف يُرفض، والدور من القاعدة لا من الرمز (مراجعة B9 M1). */
let users: Map<number, { username: string; role: string }> | null = null;
export const userRegistry = {
  set(rows: { id: number; username: string; role: string | null }[]) { users = new Map(rows.map(u => [Number(u.id), { username: u.username, role: String(u.role ?? 'employee') }])); },
  get(id: number) { return users?.get(Number(id)); },
  loaded() { return users !== null; },
};
export const roleRegistry = {
  set(defs: RoleDef[]) { if (defs.length) roleDefs = new Map(defs.map(r => [r.name, r])); },
  get(name: string): RoleDef | undefined { return roleDefs.get(name); },
  all(): RoleDef[] { return [...roleDefs.values()]; },
};

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;        // أساس الدور (admin / user / employee) — للمسارات القديمة
    name: string;
    email: string;
    roleName?: string;   // اسم الدور الفعلي
    permissions?: string[];
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
      // بعد تحميل المستخدمين: المحذوف أو من تغيّر اسمه ما يدخل، والدور الحالي يسري فوراً
      let roleName = String(decoded.role);
      if (userRegistry.loaded()) {
        const u = userRegistry.get(decoded.id);
        if (!u || u.username !== decoded.username) return res.status(401).json({ error: 'غير مصرح: الحساب غير موجود أو تغيّر؛ سجّل الدخول مجدداً' });
        roleName = u.role;
      }
      const def = roleRegistry.get(roleName);
      // دور محذوف أو غير معروف ⇒ أقل صلاحية (اطلاع) بدل رفض الدخول أو منح ما لا يملك
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: def ? def.base : 'employee',
        name: decoded.name,
        email: decoded.email,
        roleName,
        permissions: def ? def.permissions : [],
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

/** صلاحية دقيقة (B9). تُستخدم بعد requireAuth. */
export const requirePermission = (perm: string) => Object.defineProperty(
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.permissions?.includes(perm)) return res.status(403).json({ error: 'غير مسموح: لا تملك صلاحية تنفيذ هذا الإجراء' });
    return next();
  }, 'name', { value: `requirePermission(${perm})` });
