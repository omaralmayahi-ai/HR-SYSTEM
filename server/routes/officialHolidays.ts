// server/routes/officialHolidays.ts — B7 (ق-12): تقويم العطل الرسمية.
// العطل الميلادية الثابتة من قانون العطل الرسمية 12 لسنة 2024 (تُنسخ لكل سنة)، والهجرية والطارئة
// يدخلها المسؤول سنوياً بتواريخها، وعطل الأديان الخاصة للعلم (تُطلب إجازة من الموظف).
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

const KINDS = ['ميلادي ثابت', 'هجري', 'طارئ', 'ديني خاص'];
const isIso = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00Z').getTime());

export function registerOfficialHolidaysRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireAdmin, sendRouteError, respondIfDbWriteError } = ctx;
  // التقويم مرجع قانوني للدائرة كلها: تعديله للمدير (حتى تُفصَّل الصلاحيات بـ B9) ويُسجَّل بسجل النشاط
  const log = (req: any, action: string, details: string) =>
    db.insert(schema.activityLogs).values({ action, userEmail: req.user?.username || null, details }).catch(() => {});
  const parseId = (v: any) => (/^\d+$/.test(String(v)) ? parseInt(String(v)) : NaN);
  const H = schema.officialHolidays;
  const fail = (res: any, err: any, op: string) => {
    if (err?.code === '23505' || err?.cause?.code === '23505') return res.status(409).json({ error: 'العطلة مسجلة مسبقاً بنفس التاريخ والاسم' });
    if (!respondIfDbWriteError(res, err, op)) sendRouteError(res, err, op);
  };
  const out = (r: any) => ({ id: r.id, holiday_date: r.holidayDate, name: r.name, kind: r.kind, legal_basis: r.legalBasis, notes: r.notes, created_by: r.createdBy });

  app.get('/api/official-holidays', requireAuth, async (req, res) => {
    try {
      const year = String(req.query.year || '').trim();
      const from = String(req.query.from || '').trim(), to = String(req.query.to || '').trim();
      const conds: any[] = [];
      if (/^\d{4}$/.test(year)) conds.push(gte(H.holidayDate, `${year}-01-01`), lte(H.holidayDate, `${year}-12-31`));
      if (isIso(from)) conds.push(gte(H.holidayDate, from));
      if (isIso(to)) conds.push(lte(H.holidayDate, to));
      const rows = await db.select().from(H).where(conds.length ? and(...conds) : undefined).orderBy(asc(H.holidayDate));
      res.json(rows.map(out));
    } catch (err: any) {
      sendRouteError(res, err, 'قراءة العطل الرسمية');
    }
  });

  function parse(body: any, partial = false) {
    const holidayDate = String(body?.holiday_date || '').trim();
    const name = String(body?.name || '').trim();
    const kind = body?.kind === undefined && partial ? undefined : String(body?.kind || 'ميلادي ثابت').trim();
    if (!isIso(holidayDate)) throw Object.assign(new Error('تاريخ العطلة بصيغة YYYY-MM-DD'), { status: 400 });
    const y = parseInt(holidayDate.slice(0, 4));
    if (y < 2000 || y > 2100) throw Object.assign(new Error('سنة العطلة بين 2000 و2100'), { status: 400 });
    if (!name) throw Object.assign(new Error('اسم العطلة مطلوب'), { status: 400 });
    if (name.length > 200) throw Object.assign(new Error('اسم العطلة طويل'), { status: 400 });
    if (kind !== undefined && !KINDS.includes(kind)) throw Object.assign(new Error(`نوع العطلة: ${KINDS.join(' / ')}`), { status: 400 });
    return { holidayDate, name, ...(kind !== undefined ? { kind } : {}), legalBasis: String(body?.legal_basis || '').trim() || null, notes: String(body?.notes || '').trim() || null };
  }

  app.post('/api/official-holidays', requireAuth, requireAdmin, async (req, res) => {
    try {
      const [row] = await db.insert(H).values({ ...parse(req.body), createdBy: (req as any).user?.username || null }).returning();
      log(req, 'إضافة عطلة رسمية', `${row.holidayDate} — ${row.name} (${row.kind})`);
      res.status(201).json(out(row));
    } catch (err: any) {
      if (err?.status) return res.status(err.status).json({ error: err.message });
      fail(res, err, 'حفظ العطلة');
    }
  });

  app.put('/api/official-holidays/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const [row] = await db.update(H).set(parse(req.body, true)).where(eq(H.id, id)).returning();
      if (!row) return res.status(404).json({ error: 'العطلة غير موجودة' });
      log(req, 'تعديل عطلة رسمية', `#${id}: ${row.holidayDate} — ${row.name} (${row.kind})`);
      res.json(out(row));
    } catch (err: any) {
      if (err?.status) return res.status(err.status).json({ error: err.message });
      fail(res, err, 'تعديل العطلة');
    }
  });

  app.delete('/api/official-holidays/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const [row] = await db.delete(H).where(eq(H.id, id)).returning();
      if (!row) return res.status(404).json({ error: 'العطلة غير موجودة' });
      log(req, 'حذف عطلة رسمية', `${row.holidayDate} — ${row.name}`);
      res.json({ success: true });
    } catch (err: any) {
      fail(res, err, 'حذف العطلة');
    }
  });

  // نسخ العطل الميلادية الثابتة من سنة لسنة (الهجرية ما تُنسخ لأن تاريخها يتغير)
  app.post('/api/official-holidays/copy-fixed', requireAuth, requireAdmin, async (req, res) => {
    const from = parseInt(String(req.body?.from_year)), to = parseInt(String(req.body?.to_year));
    if (!(from >= 2000 && from <= 2100 && to >= 2000 && to <= 2100 && from !== to)) return res.status(400).json({ error: 'حدد السنة المصدر والسنة الهدف' });
    try {
      const r = await db.execute(sql`
        INSERT INTO official_holidays (holiday_date, name, kind, legal_basis, notes, created_by)
        SELECT make_date(${to}, extract(month FROM holiday_date)::int, extract(day FROM holiday_date)::int),
               name, kind, legal_basis, notes, ${(req as any).user?.username || null}
        FROM official_holidays
        WHERE kind = 'ميلادي ثابت' AND extract(year FROM holiday_date) = ${from}
          AND NOT (extract(month FROM holiday_date) = 2 AND extract(day FROM holiday_date) = 29)
          AND NOT EXISTS (SELECT 1 FROM official_holidays t
                          WHERE t.holiday_date = make_date(${to}, extract(month FROM official_holidays.holiday_date)::int, extract(day FROM official_holidays.holiday_date)::int))
        ON CONFLICT DO NOTHING`);
      log(req, 'نسخ العطل الثابتة', `من ${from} إلى ${to}: ${(r as any).rowCount ?? 0}`);
      res.json({ success: true, inserted: (r as any).rowCount ?? 0 });
    } catch (err: any) {
      fail(res, err, 'نسخ العطل الثابتة');
    }
  });
}
