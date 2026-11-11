// server/routes/legacy/auth2.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';
import type { AuthRequest } from '../../../src/middleware/auth.ts';
import { sql as sqlTag } from 'drizzle-orm';

export function registerAuth2Routes(app: Express, deps: any) {
  const {
    BCRYPT_HASH_RE, asc, bcrypt, db, eq, mem,
    requireAdmin, requireAuth, respondIfDbWriteError, schema, sendRouteError,
  } = deps;

  app.get('/api/auth/users', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const allUsers = await db.select({
        id: schema.users.id,
        username: schema.users.username,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt
      }).from(schema.users).orderBy(asc(schema.users.id));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(allUsers);
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(mem.inMemoryUsers.map(({ password, ...safeUser }) => safeUser));
  });

  app.post('/api/auth/users', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية' });
      }
      const { username, password, name, email, role } = req.body;
      if (!username || !password || !name) {
        return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
      }

      try {
        const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
        if (existing) {
          return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً' });
        }

        if (BCRYPT_HASH_RE.test(String(password).trim())) {
          return res.status(400).json({ error: 'كلمة المرور يجب أن تكون نصاً صريحاً جديداً' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        // B8a0: مشغّل users_audit يسجّل الإنشاء باسم المنفّذ
        const [newUser] = await db.transaction(async (tx: any) => {
          await tx.execute(sqlTag`SELECT set_config('hr.user', ${String((req as any).user?.username || '')}, true)`);
          return tx.insert(schema.users).values({
            username,
            password: hashedPassword,
            name,
            email,
            role: role || 'user'
          }).returning();
        });

        if (newUser) {
          return res.status(201).json({
            id: newUser.id,
            username: newUser.username,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            createdAt: newUser.createdAt
          });
        }
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for creating user');
      }

      const existingMem = mem.inMemoryUsers.find(u => u.username === username);
      if (existingMem) {
        return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً' });
      }

      const newMemUser = {
        id: mem.inMemoryUsers.length + 1,
        username,
        name,
        email: email || '',
        role: role || 'user',
        created_at: new Date().toISOString()
      };
      mem.inMemoryUsers.push(newMemUser);
      res.status(201).json(newMemUser);
    } catch (error: any) {
      console.error('Error creating user:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/auth/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية' });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'معرف المستخدم غير صالح' });
      }

      const { username, password, name, email, role } = req.body;
      
      try {
        if (username) {
          const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
          if (existing && existing.id !== id) {
            return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً لمستخدم آخر' });
          }
        }

        const [currentUserToEdit] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
        if (currentUserToEdit && currentUserToEdit.username === 'admin' && username && username !== 'admin') {
          return res.status(400).json({ error: 'لا يمكن تغيير اسم مستخدم مدير النظام الرئيسي (admin)' });
        }
        if (currentUserToEdit && currentUserToEdit.username === 'admin' && role && role !== 'admin') {
          return res.status(400).json({ error: 'لا يمكن سحب صلاحية مدير النظام من الحساب الرئيسي' });
        }

        const updateData: any = {};
        if (username) updateData.username = username;
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (role) updateData.role = role;
        // تُشفَّر كلمة المرور فقط إذا أُرسلت كلمة جديدة نصية؛ إن أعادت الواجهة القيمة المشفّرة القديمة
        // (bcrypt hash) تُتجاهل، فلا يُعاد تشفير الـ hash ولا يُقفل حساب المستخدم.
        if (typeof password === 'string' && password.trim() && !BCRYPT_HASH_RE.test(password.trim())) {
          updateData.password = await bcrypt.hash(password, 10);
        }
        if (Object.keys(updateData).length === 0) {
          const [cur] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
          if (!cur) return res.status(404).json({ error: 'المستخدم غير موجود' });
          const { password: _pw, ...safeCur } = cur as any;
          return res.json(safeCur);
        }

        const [updatedUser] = await db.transaction(async (tx: any) => {
          await tx.execute(sqlTag`SELECT set_config('hr.user', ${String((req as any).user?.username || '')}, true)`);
          return tx.update(schema.users).set(updateData).where(eq(schema.users.id, id)).returning();
        });

        if (updatedUser) {
          return res.json({
            id: updatedUser.id,
            username: updatedUser.username,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            createdAt: updatedUser.createdAt
          });
        }
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for updating user');
      }

      const memIdx = mem.inMemoryUsers.findIndex(u => u.id === id);
      if (memIdx !== -1) {
        mem.inMemoryUsers[memIdx] = {
          ...mem.inMemoryUsers[memIdx],
          username: username || mem.inMemoryUsers[memIdx].username,
          name: name !== undefined ? name : mem.inMemoryUsers[memIdx].name,
          email: email !== undefined ? email : mem.inMemoryUsers[memIdx].email,
          role: role || mem.inMemoryUsers[memIdx].role
        };
        return res.json(mem.inMemoryUsers[memIdx]);
      }

      res.json({ id, username, name, email, role });
    } catch (error: any) {
      console.error('Error updating user:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/auth/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية' });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'معرف المستخدم غير صالح' });
      }

      try {
        const [userToDelete] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
        if (userToDelete && userToDelete.username === 'admin') {
          return res.status(400).json({ error: 'لا يمكن حذف حساب مدير النظام الرئيسي' });
        }
        await db.transaction(async (tx: any) => {
          await tx.execute(sqlTag`SELECT set_config('hr.user', ${String((req as any).user?.username || '')}, true)`);
          await tx.delete(schema.users).where(eq(schema.users.id, id));
        });
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حذف السجل')) return;
        console.warn('Database fallback for deleting user');
      }

      mem.inMemoryUsers = mem.inMemoryUsers.filter(u => u.id !== id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      sendRouteError(res, error);
    }
  });
}
