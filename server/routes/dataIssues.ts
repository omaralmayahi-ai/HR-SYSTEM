// server/routes/dataIssues.ts — المرحلة C: حالات الاستفسار (من نظام المخصصات ومن الترحيل): عرض ومعالجة بقرار.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { requirePermission } from '../../src/middleware/auth.ts';
import { sql } from 'drizzle-orm';
import { linkedEmployeeId } from '../ownRecord.ts';

const STATUSES = ['مفتوحة', 'قيد المراجعة', 'محلولة', 'مستبعدة'];
const rows = (r: any) => ((r as any).rows ?? r) as any[];

export function registerDataIssueRoutes(app: Express, ctx: RouteContext) {
  const { db, requireAuth, sendRouteError } = ctx;
  const view = requirePermission('payroll.view'), enter = requirePermission('payroll.enter');
  const who = (req: any) => String(req.user?.username || '');

  app.get('/api/data-issues', requireAuth, view, async (req, res) => {
    try {
      const status = STATUSES.includes(String(req.query.status)) ? String(req.query.status) : null;
      const code = req.query.code ? String(req.query.code) : null;
      const q = req.query.q ? `%${String(req.query.q).trim().replace(/[\\%_]/g, c => '\\' + c)}%` : null;
      const employee = Number(req.query.employee_id) || null;
      if (employee !== null && (!Number.isInteger(employee) || employee < 1 || employee > 2147483647)) return res.status(400).json({ error: 'معرّف موظف غير صالح' });
      const offset = Math.max(0, Math.min(1_000_000, Number(req.query.offset) || 0));
      const where = sql`WHERE (${status}::text IS NULL OR d.status = ${status}) AND (${code}::text IS NULL OR d.issue_code = ${code})
        AND (${employee}::int IS NULL OR d.employee_id = ${employee})
        AND (${q}::text IS NULL OR d.company_number ILIKE ${q} OR e.full_name ILIKE ${q} OR d.details ILIKE ${q})`;
      const total = rows(await db.execute(sql`SELECT count(*)::int n FROM data_issues d LEFT JOIN employees e ON e.id = d.employee_id ${where}`))[0].n;
      const list = rows(await db.execute(sql`SELECT d.id, d.employee_id, d.company_number, e.full_name, d.topic, d.issue_code, d.title, d.details, d.external_amount::text external_amount,
          d.computed_amount::text computed_amount, d.status, d.resolution, d.resolved_by, d.resolved_at, d.source, d.created_at
        FROM data_issues d LEFT JOIN employees e ON e.id = d.employee_id ${where} ORDER BY (d.status IN ('مفتوحة', 'قيد المراجعة')) DESC, d.id LIMIT 500 OFFSET ${offset}`));
      const counts = rows(await db.execute(sql`SELECT issue_code, title, status, count(*)::int n FROM data_issues GROUP BY 1, 2, 3 ORDER BY 1, 3`));
      res.json({ issues: list, total, offset, page_size: 500, counts, statuses: STATUSES });
    } catch (err) { sendRouteError(res, err, 'حالات الاستفسار'); }
  });

  // المعالجة: وضع وقرار فقط (المشغّل يمنع غيرها ويدقّقها)؛ المستخدم ما يقرر حالة على سجله (س15.3)
  app.patch('/api/data-issues/:id', requireAuth, enter, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const status = String(req.body?.status ?? '');
      const resolution = String(req.body?.resolution ?? '').trim();
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'معرّف غير صالح' });
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'الحالة غير صالحة' });
      const closed = status === 'محلولة' || status === 'مستبعدة';
      if (closed && !resolution) return res.status(400).json({ error: 'اكتب القرار أو سبب الاستبعاد' });
      if (!who(req)) return res.status(403).json({ error: 'تعذّر التعرّف على المستخدم' });
      const [cur] = rows(await db.execute(sql`SELECT employee_id, company_number FROM data_issues WHERE id = ${id}`));
      if (!cur) return res.status(404).json({ error: 'الحالة غير موجودة' });
      const mine = await linkedEmployeeId(db, who(req));
      if (mine) {
        const [me] = rows(await db.execute(sql`SELECT company_number FROM employees WHERE id = ${mine}`));
        const own = (cur.employee_id && Number(cur.employee_id) === mine) || (me?.company_number && String(me.company_number).trim().toUpperCase() === String(cur.company_number).trim().toUpperCase());
        if (own) return res.status(403).json({ error: 'ما تكدر تقرر حالة على سجلك أنت؛ يقوم بها مستخدم آخر (س15.3)' });
      }
      const r = await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT set_config('app.actor', ${who(req)}, true)`); // فاعل التدقيق بالمشغّل
        return rows(await tx.execute(sql`UPDATE data_issues SET status = ${status}, resolution = ${resolution || null},
          resolved_by = ${closed ? who(req) : null}, resolved_at = ${closed ? sql`now()` : null} WHERE id = ${id} RETURNING id, status, resolution, resolved_by, resolved_at`))[0];
      });
      res.json(r);
    } catch (err) { sendRouteError(res, err, 'تحديث حالة الاستفسار'); }
  });
}
