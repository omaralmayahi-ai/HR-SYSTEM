// server/employeeDeletion.ts — B4a (ق-15): قواعد حذف الموظف.

/** عدد السجلات المرتبطة من لقطة الأرشفة (جدول → صفوف). */
export function countRelatedRecords(related: Record<string, any[]> | null | undefined) {
  const byTable: Record<string, number> = {};
  let total = 0;
  for (const [key, rows] of Object.entries(related || {})) {
    const n = Array.isArray(rows) ? rows.length : 0;
    if (n > 0) { byTable[key] = n; total += n; }
  }
  return { total, byTable };
}

/** هل العنصر المؤرشف موظفاً عنده سجلات؟ (لقطة غير مقروءة = نعم، احتياطاً) */
export function archivedEmployeeHasRecords(item: { entityType?: string | null; data?: unknown }): boolean {
  if (item?.entityType !== 'employee') return false;
  try {
    const parsed = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
    return countRelatedRecords((parsed as any)?.related).total > 0;
  } catch {
    return true;
  }
}
