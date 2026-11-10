// server/util/employeeColumns.ts — أداء: الصورة الشخصية مخزنة نصاً (base64) بصف الموظف، وقد تبلغ
// مئات الكيلوبايت للموظف. قوائم الموظفين ومحرك الاستحقاق ما يحتاجونها؛ تُقرأ فقط بصفحة الموظف.
import { getTableColumns, sql } from 'drizzle-orm';

export function employeeColumnsWithoutPhoto(schema: any): Record<string, any> | undefined {
  const cols = schema?.employees ? (getTableColumns(schema.employees) as Record<string, any> | undefined) : undefined;
  if (!cols || !cols.photo) return cols; // جدول وهمي بالاختبارات
  const { photo, ...rest } = cols;
  return rest;
}

/** أعمدة القوائم: كل شيء عدا الصورة + علم has_photo. */
export function employeeListColumns(schema: any) {
  return {
    ...employeeColumnsWithoutPhoto(schema),
    hasPhoto: sql<boolean>`(${schema.employees.photo} IS NOT NULL AND ${schema.employees.photo} <> '')`.as('has_photo'),
  };
}
