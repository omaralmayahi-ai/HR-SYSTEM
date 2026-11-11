// B9: الصلاحيات المرنة وحجب الأسرار بسجل التدقيق — بلا قاعدة بيانات.
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth, requirePermission, requireAdmin, requireWriter, roleRegistry, getJwtSecret } from '../src/middleware/auth.ts';
import { redactBody } from './requestAudit.ts';
import { DEFAULT_ROLES, roleChangeProblem } from './permissions.ts';

const run = (mw: any, req: any) => new Promise<{ status: number; next: boolean }>(resolve => {
  const res: any = { status(c: number) { this.code = c; return this; }, json() { resolve({ status: this.code, next: false }); } };
  mw(req, res, () => resolve({ status: 200, next: true }));
});
const reqFor = (role: string) => ({ headers: { authorization: `Bearer ${jwt.sign({ id: 9, username: 'u9', role, name: 'x' }, getJwtSecret())}` } });

describe('B9 الأدوار والصلاحيات', () => {
  it('دور مخصص بأساس user وصلاحية اعتماد الرواتب: يمر من الكتابة والاعتماد، ولا يمر من المدير', async () => {
    roleRegistry.set([...DEFAULT_ROLES, { name: 'payroll_officer', label: 'مسؤول رواتب', base: 'user', permissions: ['payroll.view', 'payroll.approve'], isSystem: false }]);
    const req: any = reqFor('payroll_officer');
    expect((await run(requireAuth, req)).next).toBe(true);
    expect(req.user.role).toBe('user');
    expect(req.user.roleName).toBe('payroll_officer');
    expect((await run(requireWriter, req)).next).toBe(true);
    expect((await run(requirePermission('payroll.approve'), req)).next).toBe(true);
    expect((await run(requirePermission('payroll.enter'), req)).status).toBe(403);
    expect((await run(requireAdmin, req)).status).toBe(403);
  });
  it('دور غير معرّف ⇒ اطلاع بلا صلاحيات (ما يُمنح ما لا يملك)', async () => {
    const req: any = reqFor('ghost');
    await run(requireAuth, req);
    expect(req.user.role).toBe('employee');
    expect((await run(requireWriter, req)).status).toBe(403);
    expect((await run(requirePermission('payroll.view'), req)).status).toBe(403);
  });
  it('الأدوار الافتراضية تحفظ السلوك السابق: المدير يعتمد، المستخدم يُدخل ولا يعتمد', async () => {
    roleRegistry.set(DEFAULT_ROLES);
    const a: any = reqFor('admin'); await run(requireAuth, a);
    const u: any = reqFor('user'); await run(requireAuth, u);
    expect((await run(requirePermission('payroll.approve'), a)).next).toBe(true);
    expect((await run(requirePermission('payroll.enter'), u)).next).toBe(true);
    expect((await run(requirePermission('payroll.approve'), u)).status).toBe(403);
  });
});

describe('B9 حجب الأسرار بسجل التدقيق', () => {
  it('كلمات المرور والرموز تُحجب والنصوص الطويلة تُقص', () => {
    const r = redactBody({ username: 'a', password: 'secret', nested: { token: 'x', ok: 1 }, list: [{ newPassword: 'p' }], long: 'x'.repeat(900) });
    expect(r.password).toBe('••••');
    expect(r.nested.token).toBe('••••');
    expect(r.nested.ok).toBe(1);
    expect(r.list[0].newPassword).toBe('••••');
    expect(r.long.length).toBeLessThan(510);
  });
});

describe('B9 قواعد تعديل الأدوار (مراجعة H1)', () => {
  const manager = { base: 'user', roleName: 'um', permissions: ['users.manage', 'payroll.view'] };
  it('ما يعدّل المستخدم دوره، ولا يمنح أساس مدير، ولا يعدّل النظامية، ولا يمنح ما لا يملك', () => {
    expect(roleChangeProblem(manager, { name: 'um' }, { base: 'user', permissions: [] })).toContain('دورك');
    expect(roleChangeProblem(manager, null, { base: 'admin', permissions: [] })).toContain('مدير');
    expect(roleChangeProblem(manager, { name: 'user', isSystem: true }, { base: 'user', permissions: ['payroll.view'] })).toContain('النظامية');
    expect(roleChangeProblem(manager, null, { base: 'user', permissions: ['payroll.approve'] })).toContain('ما تملكها');
    expect(roleChangeProblem(manager, null, { base: 'employee', permissions: ['payroll.view'] })).toContain('الاطلاع');
    expect(roleChangeProblem(manager, null, { base: 'user', permissions: ['payroll.view'] })).toBeNull();
  });
  it('مدير النظام يمنح أساس مدير ويعدّل النظامية', () => {
    const admin = { base: 'admin', roleName: 'admin', permissions: DEFAULT_ROLES[0].permissions };
    expect(roleChangeProblem(admin, { name: 'user', isSystem: true }, { base: 'user', permissions: ['payroll.approve'] })).toBeNull();
    expect(roleChangeProblem(admin, null, { base: 'admin', permissions: [] })).toBeNull();
  });
  it('الحجب يشمل أرقام الحسابات والهوية والأسرار داخل نص JSON، وما يحجب «mapping»', () => {
    const r = redactBody({ account_number: '123', nationalId: '9', mapping: 'x', data: '{"password":"p","n":1}', confirmPassword: 'c' });
    expect(r.account_number).toBe('••••');
    expect(r.mapping).toBe('x');
    expect(r.data.password).toBe('••••');
    expect(r.confirmPassword).toBe('••••');
  });
});
