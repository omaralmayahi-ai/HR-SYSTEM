// المعرّفات الفريدة للموظف: الفارغ يُخزَّن NULL لا ''.
// قيد UNIQUE يسمح بتعدد NULL لكنه يرفض تكرار ''، وتخزين '' يخلط «غير مُدخل» بقيمة حقيقية.
export const UNIQUE_EMPLOYEE_IDENTIFIERS = ['companyNumber', 'civilServiceNumber', 'employeeIdNumber'] as const;

export function normalizeEmployeeIdentifiers<T extends Record<string, any>>(row: T): T {
  for (const k of UNIQUE_EMPLOYEE_IDENTIFIERS) {
    if (!(k in row)) continue;
    const v = (row as any)[k];
    (row as any)[k] = v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim();
  }
  return row;
}
