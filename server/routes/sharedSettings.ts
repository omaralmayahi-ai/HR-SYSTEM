// server/routes/sharedSettings.ts — B6: مزامنة الإعدادات اللي جانت بالمتصفح فقط.
// - مفاتيح الرواتب/الاستحقاق للمدير فقط وتُسجَّل بسجل النشاط.
// - الحذف علامة (tombstone) حتى ما ترجع القيمة من متصفح آخر.
// - `base` = آخر updated_at شافه المتصفح؛ إذا تغيّر الصف بعده يُرفض الحفظ (409) بدل ما يمسح تعديل غيره.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { like, eq } from 'drizzle-orm';
import { isAdminOnlySharedKey, isSharedSettingKey, MAX_SHARED_VALUE_BYTES, SHARED_DOC_PREFIX } from '../sharedSettingsKeys.ts';
import { loadWeeksPerPromotion, WEEKS_PER_PROMOTION_KEY } from '../engineContext.ts';
import { ADMIN_ROLES } from '../../src/middleware/auth.ts';

export function registerSharedSettingsRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, requireAdmin, sendRouteError, respondIfDbWriteError } = ctx;
  const T = schema.appSettingsDocuments;
  const iso = (d: any) => (d ? new Date(d).toISOString() : null);

  // كل الإعدادات المشتركة: { settings: { key: rawString | null(محذوف) }, versions: { key: updatedAt } }
  app.get('/api/shared-settings', requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(T).where(like(T.key, `${SHARED_DOC_PREFIX}%`));
      const settings: Record<string, string | null> = {};
      const versions: Record<string, string | null> = {};
      for (const r of rows as any[]) {
        const k = String(r.key).slice(SHARED_DOC_PREFIX.length);
        if (!isSharedSettingKey(k)) continue;
        if (r.value?.deleted === true) settings[k] = null;
        else if (typeof r.value?.raw === 'string') settings[k] = r.value.raw;
        else continue;
        versions[k] = iso(r.updatedAt);
      }
      res.json({ settings, versions });
    } catch (err: any) {
      sendRouteError(res, err, 'قراءة الإعدادات المشتركة');
    }
  });

  // حفظ أو حذف مفتاح: { value: string | null, source?, base? }
  app.put('/api/shared-settings/:key', requireAuth, requireWriter, async (req, res) => {
    const key = String(req.params.key || '');
    if (!isSharedSettingKey(key)) return res.status(400).json({ error: `المفتاح (${key}) ليس من الإعدادات المشتركة` });
    const user = (req as any).user;
    const isAdmin = ADMIN_ROLES.includes(user?.role);
    if (isAdminOnlySharedKey(key) && !isAdmin) {
      return res.status(403).json({ error: 'تعديل قواعد الرواتب والاستحقاق للمدير فقط' });
    }
    const value = req.body?.value;
    if (value !== null && typeof value !== 'string') return res.status(400).json({ error: 'القيمة لازم تكون نصاً أو null' });
    if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > MAX_SHARED_VALUE_BYTES) {
      return res.status(413).json({ error: 'القيمة أكبر من الحد المسموح (1 ميغابايت)' });
    }
    const source = req.body?.source === 'imported-local-storage' ? 'imported-local-storage' : 'user';
    const base = req.body?.base ?? undefined;
    const docKey = SHARED_DOC_PREFIX + key;
    try {
      const result = await db.transaction(async (tx: any) => {
        const [cur] = await tx.select().from(T).where(eq(T.key, docKey)).for('update');
        if (source === 'imported-local-storage' && cur) return { kept_existing: true }; // أول من يرفع يغلب
        if (cur && base !== undefined && iso(cur.updatedAt) !== base) {
          return { conflict: true, current: cur.value?.deleted ? null : cur.value?.raw ?? null, version: iso(cur.updatedAt) };
        }
        const now = new Date();
        const doc = value === null ? { deleted: true } : { raw: value };
        await tx.insert(T).values({ key: docKey, value: doc, source, updatedBy: user?.username || null, updatedAt: now })
          .onConflictDoUpdate({ target: T.key, set: { value: doc, source, updatedBy: user?.username || null, updatedAt: now } });
        if (isAdminOnlySharedKey(key)) {
          await tx.insert(schema.activityLogs).values({
            action: value === null ? 'حذف إعداد رواتب مشترك' : 'تعديل إعداد رواتب مشترك',
            userEmail: user?.username || null,
            details: `${key}${source === 'imported-local-storage' ? ' (نقل من المتصفح)' : ''}`,
          });
        }
        return { version: iso(now) };
      });
      if ((result as any).conflict) return res.status(409).json({ error: 'الإعداد تغيّر من مستخدم آخر؛ حُمّلت النسخة الأحدث', ...result });
      res.json({ success: true, ...result });
    } catch (err: any) {
      if (!respondIfDbWriteError(res, err, 'حفظ الإعداد المشترك')) sendRouteError(res, err, 'حفظ الإعداد المشترك');
    }
  });

  // B6 (ق-13): أسابيع دورة الاختصاص لكل ترفيع بمسار احتساب الشهادة
  app.get('/api/settings/degree-track', requireAuth, async (_req, res) => {
    try { res.json({ weeks_per_promotion: await loadWeeksPerPromotion(db, schema) }); }
    catch (err: any) { sendRouteError(res, err, 'قراءة إعداد مسار الشهادة'); }
  });

  app.put('/api/settings/degree-track', requireAuth, requireAdmin, async (req, res) => {
    const raw = req.body?.weeks_per_promotion;
    const w = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
    if (!Number.isInteger(w) || w < 0 || w > 52) return res.status(400).json({ error: 'عدد الأسابيع رقم صحيح بين 0 و52' });
    try {
      await db.insert(T).values({ key: WEEKS_PER_PROMOTION_KEY, value: { weeks: w }, source: 'user', updatedBy: (req as any).user?.username || null, updatedAt: new Date() })
        .onConflictDoUpdate({ target: T.key, set: { value: { weeks: w }, source: 'user', updatedBy: (req as any).user?.username || null, updatedAt: new Date() } });
      await db.insert(schema.activityLogs).values({ action: 'تعديل أسابيع دورة الاختصاص لكل ترفيع', userEmail: (req as any).user?.username || null, details: String(w) });
      res.json({ weeks_per_promotion: w });
    } catch (err: any) {
      if (!respondIfDbWriteError(res, err, 'حفظ إعداد مسار الشهادة')) sendRouteError(res, err, 'حفظ إعداد مسار الشهادة');
    }
  });
}
