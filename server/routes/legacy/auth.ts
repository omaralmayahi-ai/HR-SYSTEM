// server/routes/legacy/auth.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';
import type { AuthRequest } from '../../../src/middleware/auth.ts';

export function registerAuthRoutes(app: Express, deps: any) {
  const {
    MAX_ACCOUNT_FAILURES, MAX_IP_FAILURES, bcrypt, db, eq, getJwtSecret,
    getRateLimitRecord, jwt, loginFailuresMap, recordLoginFailure, requireAuth, schema,
    sendRouteError,
  } = deps;

  // Custom Authentication Endpoints
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
      }

      const now = Date.now();
      const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
      const normalizedUser = String(username).trim().toLowerCase();
      const ipKey = `ip:${clientIp}`;
      const acctKey = `acct:${clientIp}:${normalizedUser}`;

      const ipRec = getRateLimitRecord(ipKey, now);
      const acctRec = getRateLimitRecord(acctKey, now);
      if ((ipRec && ipRec.count >= MAX_IP_FAILURES) || (acctRec && acctRec.count >= MAX_ACCOUNT_FAILURES)) {
        return res.status(429).json({
          error: 'تم تجاوز الحد المسموح لمحاولات تسجيل الدخول الفاشلة. يرجى الانتظار 15 دقيقة قبل المحاولة مجدداً.'
        });
      }

      let user: any = null;
      try {
        const usersList = await db.select()
          .from(schema.users)
          .where(eq(schema.users.username, username))
          .limit(1);
        user = usersList[0];
      } catch (dbErr) {
        console.error('Database query error during login:', dbErr);
        return res.status(503).json({ error: 'قاعدة البيانات غير متصلة حالياً. يرجى التحقق من خدمة PostgreSQL.' });
      }

      if (!user || !user.password) {
        recordLoginFailure(ipKey, now);
        recordLoginFailure(acctKey, now);
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      const isBcryptHash = user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$');
      if (!isBcryptHash) {
        recordLoginFailure(ipKey, now);
        recordLoginFailure(acctKey, now);
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        recordLoginFailure(ipKey, now);
        recordLoginFailure(acctKey, now);
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      loginFailuresMap.delete(acctKey);

      // Generate cryptographically signed JWT token of user info
      const token = jwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        email: user.email
      }, getJwtSecret(), { expiresIn: '7d' });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name,
          email: user.email
        }
      });
    } catch (error: any) {
      console.error('Error in login:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(req.user);
    } catch (error: any) {
      sendRouteError(res, error);
    }
  });
}
