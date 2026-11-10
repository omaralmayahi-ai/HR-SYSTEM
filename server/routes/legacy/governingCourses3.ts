// server/routes/legacy/governingCourses3.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

export function registerGoverningCourses3Routes(app: Express, deps: any) {
  const {
    mem, readSettingsDoc, requireAdmin, requireAuth, sendRouteError, writeSettingsDoc,
  } = deps;

  app.get('/api/governing-courses/matrix', requireAuth, async (req, res) => {
    try {
      res.json(await readSettingsDoc('promotion_paths_matrix', mem.inMemoryPromotionPathsMatrix));
    } catch (err) {
      sendRouteError(res, err, 'قراءة مصفوفة مسارات الترفيع');
    }
  });

  app.post('/api/governing-courses/matrix', requireAuth, requireAdmin, async (req: any, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'بيانات المصفوفة غير صالحة' });
    try {
      res.json(await writeSettingsDoc('promotion_paths_matrix', req.body, req.user?.username || null));
    } catch (err) {
      sendRouteError(res, err, 'حفظ مصفوفة مسارات الترفيع');
    }
  });
}
