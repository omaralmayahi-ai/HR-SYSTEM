// server/payroll/quality.ts — B8a1: فحص جودة بيانات الرواتب (المتطلبات 17.2) قبل تفعيل البنود.
import { sql } from 'drizzle-orm';

const rows = (r: any) => ((r as any).rows ?? r) as any[];

export async function dataQuality(db: any, eligibleStatuses: string[]) {
  const st = sql.raw(`ARRAY[${eligibleStatuses.map(s => `'${s.replace(/'/g, "''")}'`).join(',') || "''"}]::text[]`);
  const q = async (label: string, kind: string, query: any) => {
    const r = rows(await db.execute(query));
    return { label, kind, count: r.length, sample: r.slice(0, 50) };
  };
  const live = (item: string) => sql.raw(`(SELECT props FROM pay_item_versions v JOIN pay_items i ON i.id = v.item_id
      WHERE i.code = '${item}' AND v.superseded_at IS NULL ORDER BY v.valid_from DESC LIMIT 1)`);
  const checks = [
    await q('موظف بلا درجة أو مرحلة (ما يُحتسب له راتب)', 'employees', sql`
      SELECT id, full_name, company_number FROM employees WHERE btrim(coalesce(status, '')) = ANY(${st}) AND (grade IS NULL OR step IS NULL) ORDER BY id`),
    await q('نوع خدمة غير مربوط بفئة رواتب', 'employees', sql`
      SELECT e.id, e.full_name, e.company_number, e.service_type FROM employees e
      WHERE btrim(coalesce(e.status, '')) = ANY(${st})
        AND NOT EXISTS (SELECT 1 FROM payroll_category_rules r WHERE r.service_type = btrim(coalesce(e.service_type, ''))) ORDER BY e.id`),
    await q('شهادة بلا مستوى ببند الشهادة (CERT)', 'lookup', sql`
      SELECT d.id, d.name FROM education_degrees d
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(${live('CERT')}->'levels', '[]'::jsonb)) l WHERE (l->>'ref_id') = d.id::text AND l->>'value' IS NOT NULL) ORDER BY d.id`),
    await q('مسؤولية بلا مستوى ببند المنصب (POSITION)', 'lookup', sql`
      SELECT r.id, r.name FROM responsibility_allowances r
      WHERE hr_norm_ar(r.name) NOT IN ('بلا مسؤوليه', 'بلا وكاله')
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(${live('POSITION')}->'levels', '[]'::jsonb)) l WHERE (l->>'ref_id') = r.id::text AND l->>'value' IS NOT NULL) ORDER BY r.id`),
    await q('موقع عمل بلا مبلغ ببند الموقع (GEO)', 'lookup', sql`
      SELECT w.id, w.name FROM work_locations w
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(${live('GEO')}->'levels', '[]'::jsonb)) l WHERE (l->>'ref_id') = w.id::text AND l->>'value' IS NOT NULL) ORDER BY w.id`),
    await q('النقل المجاني غير محدد (شرط مخصص الموقع)', 'employees', sql`
      SELECT id, full_name, company_number FROM employees WHERE btrim(coalesce(status, '')) = ANY(${st}) AND free_transport IS NULL ORDER BY id`),
    await q('نمط الاستحقاق العائلي لم يُحدد', 'employees', sql`
      SELECT id, full_name, company_number, marital_status FROM employees
      WHERE btrim(coalesce(status, '')) = ANY(${st}) AND family_mode IS NULL ORDER BY id`),
    await q('عنده عدد أطفال بلا تفاصيلهم (العمر شرط بالمادة 14)', 'employees', sql`
      SELECT e.id, e.full_name, e.company_number, e.children_count FROM employees e
      WHERE btrim(coalesce(e.status, '')) = ANY(${st}) AND coalesce(e.children_count, 0) > 0
        AND (SELECT count(*) FROM family_members m WHERE m.employee_id = e.id AND m.relation IN ('ابن', 'بنت', 'طفل')) < e.children_count ORDER BY e.id`),
    await q('طفل بلا تاريخ ميلاد، أو جنسه غير مؤكد وقرّب من 18 (يحدد قاعدة الاستمرار)', 'members', sql`
      SELECT m.id, m.employee_id, m.name, m.relation, m.birth_date FROM family_members m
      WHERE m.relation IN ('ابن', 'بنت', 'طفل') AND (m.birth_date IS NULL OR (m.relation = 'طفل' AND m.birth_date <= (current_date - interval '17 years'))) ORDER BY m.employee_id`),
    await q('زوج/زوجة بصلة غير محددة (جنس الموظف غير مسجل)', 'members', sql`
      SELECT m.id, m.employee_id, m.name FROM family_members m WHERE m.relation = 'زوج/زوجة' ORDER BY m.employee_id`),
    await q('ابن بعمر 18–24 بلا حقيقة «يدرس»', 'members', sql`
      SELECT m.id, m.employee_id, m.name, m.birth_date FROM family_members m
      WHERE m.relation = 'ابن' AND m.birth_date IS NOT NULL
        AND m.birth_date <= (current_date - interval '18 years') AND m.birth_date > (current_date - interval '24 years')
        AND NOT EXISTS (SELECT 1 FROM family_member_facts f WHERE f.member_id = m.id AND f.fact = 'يدرس') ORDER BY m.employee_id`),
    await q('بنت بالغة بلا حقيقتي الزواج والتوظيف', 'members', sql`
      SELECT m.id, m.employee_id, m.name, m.birth_date FROM family_members m
      WHERE m.relation = 'بنت' AND m.birth_date IS NOT NULL AND m.birth_date <= (current_date - interval '18 years')
        AND (NOT EXISTS (SELECT 1 FROM family_member_facts f WHERE f.member_id = m.id AND f.fact = 'متزوج')
          OR NOT EXISTS (SELECT 1 FROM family_member_facts f WHERE f.member_id = m.id AND f.fact = 'موظف')) ORDER BY m.employee_id`),
    await q('زوجان موظفان بالشركة يستلمان الإعالة معاً', 'employees', sql`
      SELECT e.id, e.full_name, m.spouse_employee_id FROM family_members m JOIN employees e ON e.id = m.employee_id
      JOIN employees s ON s.id = m.spouse_employee_id
      WHERE m.relation IN ('زوج', 'زوجة') AND coalesce(e.family_mode, '') = 'كامل' AND coalesce(s.family_mode, '') = 'كامل' ORDER BY e.id`),
    await q('موظف بالدرجات 11–13 (مبالغها بانتظار التحقق، ق-16)', 'employees', sql`
      SELECT id, full_name, company_number, grade, step FROM employees WHERE btrim(coalesce(status, '')) = ANY(${st}) AND grade BETWEEN 11 AND 13 ORDER BY id`),
  ];
  return { generated_at: new Date().toISOString(), checks };
}
