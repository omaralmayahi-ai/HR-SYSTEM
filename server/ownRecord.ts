// server/ownRecord.ts — B9 (س15.3): المستخدم المرتبط بموظف ما يُدخل ولا يعتمد أي تغيير على سجله هو.
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { sql } from 'drizzle-orm';

const rows = (r: any) => (r?.rows ?? r ?? []) as any[];

/** الموظف المرتبط بالمستخدم (أو null). */
export async function linkedEmployeeId(db: any, username: string | undefined): Promise<number | null> {
  if (!username) return null;
  const r = rows(await db.execute(sql`SELECT employee_id FROM users WHERE username = ${username} LIMIT 1`));
  return r[0]?.employee_id ? Number(r[0].employee_id) : null;
}

/** يرفض الطلب إذا كان الموظف المستهدف (من المسار أو الجسم أو السجل) هو الموظف المرتبط بالمستخدم. */
export function forbidOwnRecordBy(db: any, target: (req: Request) => Promise<number | null> | number | null): RequestHandler {
  return Object.defineProperty(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mine = await linkedEmployeeId(db, (req as any).user?.username);
      if (!mine) return next();
      const t = await target(req);
      if (t !== null && Number(t) === mine) return res.status(403).json({ error: 'ما تكدر تُدخل أو تعتمد تغييراً على سجلك أنت؛ يقوم به مستخدم آخر (س15.3)' });
      return next();
    } catch (e) { return next(e); }
  }, 'name', { value: 'forbidOwnRecord' });
}

/** :param هو رقم الموظف. */
export const forbidOwnRecord = (db: any, param = 'id') => forbidOwnRecordBy(db, req => { const n = Number(req.params[param]); return Number.isInteger(n) ? n : null; });
/** رقم الموظف من الجسم (employee_id / employeeId). */
export const forbidOwnRecordBody = (db: any) => forbidOwnRecordBy(db, req => { const v = req.body?.employee_id ?? req.body?.employeeId; const n = Number(v); return Number.isInteger(n) ? n : null; });
/** رقم الموظف من سجل جدول بمعرّف :id (للتعديل والاعتماد). */
export const forbidOwnRecordRow = (db: any, table: 'leave_requests' | 'penalties') => forbidOwnRecordBy(db, async req => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;
  const r = rows(await db.execute(table === 'leave_requests' ? sql`SELECT employee_id FROM leave_requests WHERE id = ${id}` : sql`SELECT employee_id FROM penalties WHERE id = ${id}`));
  const fromBody = Number(req.body?.employee_id ?? req.body?.employeeId);
  return r[0]?.employee_id ?? (Number.isInteger(fromBody) ? fromBody : null);
});
