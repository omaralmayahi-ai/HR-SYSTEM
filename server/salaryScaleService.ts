// server/salaryScaleService.ts — B8a0: السلّم النافذ لأي تاريخ = أحدث إصدار معتمد تاريخ نفاذه ≤ التاريخ.
// علم is_active مشتق للعرض فقط (النافذ اليوم) ويُحدَّث بعد كل اعتماد.
import { sql } from 'drizzle-orm';
import { todayBaghdad } from './careerMovements.ts';

const rowsOf = (r: any) => ((r as any).rows ?? r) as any[];

export async function scaleVersionForDate(db: any, day: string): Promise<{ id: number; name: string; effectiveFrom: string } | null> {
  const r = rowsOf(await db.execute(sql`
    SELECT id, name, effective_from::text AS effective_from FROM salary_scale_versions
    WHERE status = 'معتمد' AND effective_from <= ${day}::date
    ORDER BY effective_from DESC LIMIT 1`));
  return r[0] ? { id: Number(r[0].id), name: r[0].name, effectiveFrom: r[0].effective_from } : null;
}

/** كل الإصدارات المعتمدة مرتبة بتاريخ النفاذ (للمحرك: نقاط قطع المقاطع). */
export async function approvedScaleVersions(db: any) {
  return rowsOf(await db.execute(sql`
    SELECT id, name, effective_from::text AS effective_from FROM salary_scale_versions
    WHERE status = 'معتمد' ORDER BY effective_from`)).map(v => ({ id: Number(v.id), name: v.name, effectiveFrom: v.effective_from as string }));
}

export async function refreshActiveFlag(tx: any, day: string = todayBaghdad()) {
  const v = await scaleVersionForDate(tx, day);
  await tx.execute(sql`UPDATE salary_scale_versions SET is_active = false WHERE is_active AND id IS DISTINCT FROM ${v?.id ?? null}`);
  if (v) await tx.execute(sql`UPDATE salary_scale_versions SET is_active = true WHERE id = ${v.id} AND NOT is_active`);
  return v;
}
