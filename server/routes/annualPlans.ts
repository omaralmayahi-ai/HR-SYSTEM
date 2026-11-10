// server/routes/annualPlans.ts — خطط التدريب السنوية (B3، الدفعة 1)
// نُقل من server.ts مع حذف فروع الذاكرة (B2g): القائمة الفارغة تُعاد فارغة، والخطأ يُرد خطأً
// (كان أي خطأ يُرد بنجاح كاذب 201 بـ id: 1).
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { eq, and, desc } from 'drizzle-orm';
import { mapKeys, camelToSnake, snakeToCamel } from '../util/caseMap.ts';

export function enhancePlanRecord(p: any) {
  if (!p) return p;
  const mapped = mapKeys(p, camelToSnake);
  mapped.plannedCoursesCount = p.plannedCoursesCount ?? mapped.planned_courses_count;
  mapped.planned_courses_count = mapped.planned_courses_count ?? p.plannedCoursesCount;
  mapped.plannedTraineesCount = p.plannedTraineesCount ?? mapped.planned_trainees_count;
  mapped.planned_trainees_count = mapped.planned_trainees_count ?? p.plannedTraineesCount;
  mapped.plannedBudget = p.plannedBudget ?? mapped.planned_budget;
  mapped.planned_budget = mapped.planned_budget ?? p.plannedBudget;
  return mapped;
}

export function registerAnnualPlanRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, sendRouteError, respondIfDbWriteError } = ctx;

  app.get('/api/annual-plans', requireAuth, async (_req, res) => {
    try {
      const plans = await db.select().from(schema.annualTrainingPlans).orderBy(desc(schema.annualTrainingPlans.year));
      res.json(plans.map(enhancePlanRecord));
    } catch (error: any) {
      sendRouteError(res, error, 'قراءة خطط التدريب');
    }
  });

  // حفظ = إضافة أو تحديث الخطة بمفتاح (السنة، المسار)
  app.post('/api/annual-plans', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = mapKeys(req.body || {}, snakeToCamel);
      delete data.id;
      if (data.year) data.year = parseInt(data.year);
      if (data.plannedCoursesCount) data.plannedCoursesCount = parseInt(data.plannedCoursesCount);
      if (data.plannedTraineesCount) data.plannedTraineesCount = parseInt(data.plannedTraineesCount);
      if (data.plannedBudget) data.plannedBudget = parseInt(data.plannedBudget);
      const { year, track } = data;
      if (!year) return res.status(400).json({ error: 'السنة مطلوبة' });

      const existing = await db.select().from(schema.annualTrainingPlans)
        .where(and(eq(schema.annualTrainingPlans.year, year), eq(schema.annualTrainingPlans.track, track))).limit(1);
      const [saved] = existing.length
        ? await db.update(schema.annualTrainingPlans).set(data).where(eq(schema.annualTrainingPlans.id, existing[0].id)).returning()
        : await db.insert(schema.annualTrainingPlans).values(data).returning();
      res.status(201).json(enhancePlanRecord(saved));
    } catch (error: any) {
      if (!respondIfDbWriteError(res, error, 'حفظ خطة التدريب')) sendRouteError(res, error, 'حفظ خطة التدريب');
    }
  });
}
