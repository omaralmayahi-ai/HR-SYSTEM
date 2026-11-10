// server/routes/legacy/admin.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

export function registerAdminRoutes(app: Express, deps: any) {
  const {
    getMigrationStatus, getSchemaHealth, requireAdmin, requireAuth,
  } = deps;

  // صحة تجهيز مخطط قاعدة البيانات: أوامر DDL التي فشلت عند الإقلاع (للمسؤول فقط)
  app.get('/api/admin/schema-health', requireAuth, requireAdmin, async (req, res) => {
    res.json({ ...getSchemaHealth(), migrations: getMigrationStatus() });
  });
}
