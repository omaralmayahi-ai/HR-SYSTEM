/**
 * datesFoundation.ts
 * وحدات إدارة وتتبع تواريخ الترفيع والعلاوات، سريان سلم الرواتب، وتكليفات الوكالة.
 */

export interface EmployeeDatesRecord {
  id: number;
  fullName?: string;
  grade?: number | string;
  step?: number | string;
  gradeDate?: string | null;
  grade_date?: string | null;
  lastPromotionDate?: string | null;
  last_promotion_date?: string | null;
  lastIncrementDate?: string | null;
  last_increment_date?: string | null;
  nextPromotionDueDate?: string | null;
  next_promotion_due_date?: string | null;
  nextIncrementDueDate?: string | null;
  next_increment_due_date?: string | null;
  currentAppointmentDate?: string | null;
  current_appointment_date?: string | null;
  firstAppointmentDate?: string | null;
  first_appointment_date?: string | null;
  appointmentDate?: string | null;
  appointment_date?: string | null;
}

export interface MovementPayload {
  movementType?: string;
  movement_type?: string;
  gradeBefore?: number | string;
  grade_before?: number | string;
  gradeAfter?: number | string;
  grade_after?: number | string;
  stepBefore?: number | string;
  step_before?: number | string;
  stepAfter?: number | string;
  step_after?: number | string;
  orderDate?: string;
  order_date?: string;
  dueDate?: string;
  due_date?: string;
}

/**
 * دالة التهيئة والاسترجاع للبيانات القديمة (Backfill)
 * في حال عدم وجود تاريخ ترفيع أو علاوة، يتم نسخه من تاريخ الدرجة/المرحلة الحالي (gradeDate) كأقرب نقطة أساس تاريخية
 */
export function backfillEmployeeDates<T extends Record<string, any>>(emp: T): T {
  if (!emp) return emp;
  const baseDate =
    emp.gradeDate ||
    emp.grade_date ||
    emp.currentAppointmentDate ||
    emp.current_appointment_date ||
    emp.firstAppointmentDate ||
    emp.first_appointment_date ||
    emp.appointmentDate ||
    emp.appointment_date ||
    null;

  const lastPromo = emp.lastPromotionDate || emp.last_promotion_date || baseDate;
  const lastIncr = emp.lastIncrementDate || emp.last_increment_date || baseDate;
  const nextPromo = emp.nextPromotionDueDate || emp.next_promotion_due_date || null;
  const nextIncr = emp.nextIncrementDueDate || emp.next_increment_due_date || null;

  return {
    ...emp,
    lastPromotionDate: lastPromo,
    last_promotion_date: lastPromo,
    lastIncrementDate: lastIncr,
    last_increment_date: lastIncr,
    nextPromotionDueDate: nextPromo,
    next_promotion_due_date: nextPromo,
    nextIncrementDueDate: nextIncr,
    next_increment_due_date: nextIncr,
  };
}

/**
 * تطبيق حركة ترقية (ترفيع درجة أو علاوة سنوية) على قيد الموظف
 * يفصل تماماً بين تاريخ آخر ترفيع وتاريخ آخر علاوة مع الحفاظ على تاريخ الدرجة للتوافق العكسي
 */
export function applyMovementToEmployee(
  employee: EmployeeDatesRecord,
  movement: MovementPayload
): { updatedEmployee: EmployeeDatesRecord; changedFields: Record<string, any> } {
  const movementType = (movement.movement_type || movement.movementType || '').trim();
  const actionDate = movement.order_date || movement.orderDate || movement.due_date || movement.dueDate || new Date().toISOString().split('T')[0];

  const updated: EmployeeDatesRecord = { ...employee };
  const changedFields: Record<string, any> = {};

  if (movement.grade_after !== undefined || movement.gradeAfter !== undefined) {
    const g = movement.grade_after || movement.gradeAfter;
    updated.grade = g;
    changedFields.grade = g;
  }

  if (movement.step_after !== undefined || movement.stepAfter !== undefined) {
    const s = parseInt(String(movement.step_after || movement.stepAfter));
    updated.step = s;
    changedFields.step = s;
  }

  // تحديث تاريخ الحركة الأساسي gradeDate دائماً للتوافق
  if (actionDate) {
    updated.gradeDate = actionDate;
    updated.grade_date = actionDate;
    changedFields.gradeDate = actionDate;
    changedFields.grade_date = actionDate;
  }

  // التوجيه الدقيق للتواريخ:
  // ترفيع درجة -> يحدّث last_promotion_date ويحتفظ بـ last_increment_date
  // علاوة سنوية -> يحدّث last_increment_date ويحتفظ بـ last_promotion_date دون مساس
  if (movementType.includes('ترفيع')) {
    updated.lastPromotionDate = actionDate;
    updated.last_promotion_date = actionDate;
    changedFields.lastPromotionDate = actionDate;
    changedFields.last_promotion_date = actionDate;
  } else if (movementType.includes('علاوة')) {
    updated.lastIncrementDate = actionDate;
    updated.last_increment_date = actionDate;
    changedFields.lastIncrementDate = actionDate;
    changedFields.last_increment_date = actionDate;
  } else {
    // حركة عامة أخرى
    updated.lastPromotionDate = actionDate;
    updated.last_promotion_date = actionDate;
    updated.lastIncrementDate = actionDate;
    updated.last_increment_date = actionDate;
    changedFields.lastPromotionDate = actionDate;
    changedFields.last_promotion_date = actionDate;
    changedFields.lastIncrementDate = actionDate;
    changedFields.last_increment_date = actionDate;
  }

  return { updatedEmployee: updated, changedFields };
}
