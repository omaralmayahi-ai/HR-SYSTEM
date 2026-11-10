// server/routes/legacy/governingCourses2.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

export function registerGoverningCourses2Routes(app: Express, deps: any) {
  const {
    db, eq, mem, requireAdmin, requireAuth, schema,
    sendRouteError,
  } = deps;

  app.get('/api/governing-courses/exemption-rules', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.governingCourseExemptionRules)
        .where(eq(schema.governingCourseExemptionRules.configKey, 'default_exemption_rules'));
      if (records && records.length > 0) {
        const row = records[0];
        const parsed = {
          rules: row.rules ? JSON.parse(row.rules) : mem.inMemoryExemptionRules.rules,
          qualificationsExemptions: row.qualificationsExemptions ? JSON.parse(row.qualificationsExemptions) : mem.inMemoryExemptionRules.qualificationsExemptions,
          gradeTitleExemptions: row.gradeTitleExemptions ? JSON.parse(row.gradeTitleExemptions) : mem.inMemoryExemptionRules.gradeTitleExemptions,
          autoApplyRules: row.autoApplyRules ?? true,
        };
        mem.inMemoryExemptionRules = parsed;
        return res.json(parsed);
      }
    } catch (err) {
      return sendRouteError(res, err, 'قراءة قواعد الإعفاء');
    }
    // لا صف بعد: القواعد الافتراضية الموثقة في الكود
    return res.json(mem.inMemoryExemptionRules);
  });

  app.post('/api/governing-courses/exemption-rules', requireAuth, requireAdmin, async (req, res) => {
    const data = req.body;
    const merged = { ...mem.inMemoryExemptionRules, ...data };

    try {
      const rulesJson = JSON.stringify(merged.rules || []);
      const qualsJson = JSON.stringify(merged.qualificationsExemptions || []);
      const gradeJson = JSON.stringify(merged.gradeTitleExemptions || []);
      const autoApply = merged.autoApplyRules !== false;

      const existing = await db.select().from(schema.governingCourseExemptionRules)
        .where(eq(schema.governingCourseExemptionRules.configKey, 'default_exemption_rules'));

      if (existing && existing.length > 0) {
        await db.update(schema.governingCourseExemptionRules)
          .set({
            rules: rulesJson,
            qualificationsExemptions: qualsJson,
            gradeTitleExemptions: gradeJson,
            autoApplyRules: autoApply,
            updatedAt: new Date(),
          })
          .where(eq(schema.governingCourseExemptionRules.configKey, 'default_exemption_rules'));
      } else {
        await db.insert(schema.governingCourseExemptionRules).values({
          configKey: 'default_exemption_rules',
          rules: rulesJson,
          qualificationsExemptions: qualsJson,
          gradeTitleExemptions: gradeJson,
          autoApplyRules: autoApply,
        });
      }
    } catch (err) {
      // B2: لا نجاح كاذب — الحفظ فشل فلا يُعاد كأنه نجح
      return sendRouteError(res, err, 'حفظ قواعد الإعفاء');
    }

    mem.inMemoryExemptionRules = merged;
    return res.json(merged);
  });
}
