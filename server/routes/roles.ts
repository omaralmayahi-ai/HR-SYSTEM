// server/routes/roles.ts — B9: الأدوار والصلاحيات المرنة، ربط المستخدم بموظف، وسجل التدقيق.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { PERMISSIONS, BASES, roleChangeProblem, type RoleDef } from '../permissions.ts';
import { roleRegistry, userRegistry, requirePermission } from '../../src/middleware/auth.ts';

/** يحمّل الأدوار من القاعدة لسجل الخادم (عند التشغيل وبعد كل تعديل). */
export async function loadRoles(db: any, schema: any) {
  const rs = await db.select().from(schema.roles).orderBy(asc(schema.roles.name));
  roleRegistry.set(rs.map((r: any) => ({ name: r.name, label: r.label, base: r.base, permissions: (r.permissions || []).filter((p: string) => p in PERMISSIONS), isSystem: r.isSystem })) as RoleDef[]);
  // المستخدمون الحاليون: المحذوف ما يدخل، والدور من القاعدة لا من الرمز (مراجعة M1)
  const us = await db.select({ id: schema.users.id, username: schema.users.username, role: schema.users.role }).from(schema.users);
  userRegistry.set(us);
  const unknown = us.filter((u: any) => !roleRegistry.get(String(u.role)));
  if (unknown.length && !warnedUnknown) { warnedUnknown = true; console.warn(`[roles] ${unknown.length} مستخدم بأدوار غير معرّفة يعاملون «اطلاع»: ${unknown.map((u: any) => `${u.username}(${u.role})`).join('، ')}`); }
}
let warnedUnknown = false;

export function registerRoleRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, sendRouteError } = ctx;
  const who = (req: any) => String(req.user?.username || '');
  const manage = requirePermission('users.manage');
  const callerOf = (req: any) => ({ base: req.user?.role, roleName: req.user?.roleName, permissions: req.user?.permissions || [] });
  const bad = (res: any, msg: string, code = 400) => res.status(code).json({ error: msg });
  const cleanPerms = (ps: any) => {
    if (!Array.isArray(ps)) return null;
    const out = [...new Set(ps.map(String))];
    return out.every(p => p in PERMISSIONS) ? out : null;
  };
  const withActor = async (req: any, fn: (tx: any) => Promise<any>) => db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('hr.user', ${who(req)}, true)`);
    return fn(tx);
  });

  app.get('/api/roles', requireAuth, manage, async (_req, res) => {
    try {
      const rs = await db.select().from(schema.roles).orderBy(asc(schema.roles.name));
      const counts = (await db.execute(sql`SELECT role, count(*)::int n FROM users GROUP BY role`) as any).rows ?? [];
      res.json({ roles: rs.map((r: any) => ({ ...r, users: counts.find((c: any) => c.role === r.name)?.n ?? 0 })), permissions: PERMISSIONS, bases: BASES });
    } catch (err: any) { sendRouteError(res, err, 'قراءة الأدوار'); }
  });

  app.post('/api/roles', requireAuth, manage, async (req: any, res) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      if (!/^[a-z][a-z0-9_]{2,30}$/.test(name)) return bad(res, 'اسم الدور بحروف لاتينية صغيرة وأرقام (3–31)');
      const label = String(req.body?.label ?? '').trim();
      if (!label) return bad(res, 'وصف الدور مطلوب');
      const base = String(req.body?.base ?? '');
      if (!(BASES as readonly string[]).includes(base)) return bad(res, 'الأساس: admin / user / employee');
      const permissions = cleanPerms(req.body?.permissions ?? []);
      if (!permissions) return bad(res, 'صلاحية غير معروفة');
      const problem = roleChangeProblem(callerOf(req), null, { base, permissions });
      if (problem) return bad(res, problem, 403);
      const [exists] = await db.select().from(schema.roles).where(eq(schema.roles.name, name));
      if (exists) return bad(res, 'الدور موجود', 409);
      const [r] = await withActor(req, tx => tx.insert(schema.roles).values({ name, label, base, permissions }).returning());
      await loadRoles(db, schema);
      res.status(201).json(r);
    } catch (err: any) { sendRouteError(res, err, 'إضافة دور'); }
  });

  app.put('/api/roles/:name', requireAuth, manage, async (req: any, res) => {
    try {
      const [cur] = await db.select().from(schema.roles).where(eq(schema.roles.name, req.params.name));
      if (!cur) return bad(res, 'الدور غير موجود', 404);
      const set: any = { updatedAt: new Date() };
      if (req.body?.label !== undefined) { set.label = String(req.body.label).trim(); if (!set.label) return bad(res, 'وصف الدور مطلوب'); }
      if (req.body?.base !== undefined) {
        if (cur.isSystem) return bad(res, 'أساس الأدوار النظامية ثابت');
        if (!(BASES as readonly string[]).includes(req.body.base)) return bad(res, 'الأساس: admin / user / employee');
        set.base = req.body.base;
      }
      if (req.body?.permissions !== undefined) { set.permissions = cleanPerms(req.body.permissions); if (!set.permissions) return bad(res, 'صلاحية غير معروفة'); }
      const base = set.base ?? cur.base, perms: string[] = set.permissions ?? cur.permissions;
      // الصلاحيات الممنوحة سابقاً للدور تبقى؛ الفحص على ما يُضاف
      const added = perms.filter(p => !(cur.permissions || []).includes(p));
      const problem = roleChangeProblem(callerOf(req), cur, { base, permissions: set.permissions ? added : [] })
        ?? (req.user?.role !== 'admin' && cur.base === 'admin' ? 'دور بأساس «مدير» يعدّله مدير النظام فقط' : null);
      if (problem) return bad(res, problem, 403);
      const [r] = await withActor(req, tx => tx.update(schema.roles).set(set).where(eq(schema.roles.name, cur.name)).returning());
      await loadRoles(db, schema);
      res.json(r);
    } catch (err: any) {
      if (String(err?.cause?.message || err?.message).includes('B9')) return bad(res, err?.cause?.message || err.message, 409);
      sendRouteError(res, err, 'تعديل دور');
    }
  });

  app.delete('/api/roles/:name', requireAuth, manage, async (req: any, res) => {
    try {
      const [cur] = await db.select().from(schema.roles).where(eq(schema.roles.name, req.params.name));
      if (!cur) return bad(res, 'الدور غير موجود', 404);
      if (cur.isSystem) return bad(res, 'الأدوار النظامية ما تُحذف');
      if (cur.base === 'admin' && req.user?.role !== 'admin') return bad(res, 'دور بأساس «مدير» يحذفه مدير النظام فقط', 403);
      if (cur.name === req.user?.roleName) return bad(res, 'ما تكدر تحذف دورك أنت', 403);
      const [{ n }] = (await db.execute(sql`SELECT count(*)::int n FROM users WHERE role = ${cur.name}`) as any).rows;
      if (n > 0) return bad(res, `الدور مسند لـ ${n} مستخدم؛ انقلهم لدور آخر أولاً`, 409);
      await withActor(req, tx => tx.delete(schema.roles).where(eq(schema.roles.name, cur.name)));
      await loadRoles(db, schema);
      res.json({ deleted: true });
    } catch (err: any) { sendRouteError(res, err, 'حذف دور'); }
  });

  // ربط المستخدم بموظف (س15.3): بعدها ما يُدخل ولا يعتمد على سجله المالي. مسجّل بمشغّل التدقيق
  app.put('/api/auth/users/:id/employee-link', requireAuth, manage, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return bad(res, 'معرّف غير صالح');
      const eid = req.body?.employee_id === null || req.body?.employee_id === '' || req.body?.employee_id === undefined ? null : Number(req.body.employee_id);
      if (eid !== null) {
        const [e] = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.id, eid));
        if (!e) return bad(res, 'الموظف غير موجود', 404);
        const [taken] = (await db.execute(sql`SELECT username FROM users WHERE employee_id = ${eid} AND id <> ${id}`) as any).rows;
        if (taken) return bad(res, `الموظف مربوط بالمستخدم ${taken.username}`, 409);
      }
      const [u] = await withActor(req, tx => tx.update(schema.users).set({ employeeId: eid }).where(eq(schema.users.id, id)).returning({ id: schema.users.id, username: schema.users.username, employeeId: schema.users.employeeId }));
      if (!u) return bad(res, 'المستخدم غير موجود', 404);
      res.json(u);
    } catch (err: any) { sendRouteError(res, err, 'ربط المستخدم بموظف'); }
  });

  // سجل التدقيق (B9): كل عمليات الكتابة، بتصفية
  app.get('/api/admin/audit', requireAuth, requirePermission('audit.view'), async (req: any, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500), offset = Math.max(Number(req.query.offset) || 0, 0);
      const u = String(req.query.user || '').trim(), p = String(req.query.path || '').trim(), failed = req.query.failed === '1';
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? String(req.query.from) : null;
      const where = sql`true ${u ? sql`AND username = ${u}` : sql``} ${p ? sql`AND path ILIKE ${'%' + p + '%'}` : sql``} ${failed ? sql`AND status >= 400` : sql``} ${from ? sql`AND at >= ${from}::date` : sql``}`;
      const rows = (await db.execute(sql`SELECT id, at, username, role, method, path, status, duration_ms, ip, body FROM request_audit WHERE ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`) as any).rows;
      const [{ n }] = (await db.execute(sql`SELECT count(*)::int n FROM request_audit WHERE ${where}`) as any).rows;
      res.json({ total: n, rows });
    } catch (err: any) { sendRouteError(res, err, 'سجل التدقيق'); }
  });
  void desc;
}
