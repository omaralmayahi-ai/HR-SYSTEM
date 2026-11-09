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

/** تصنيف الحركة حسب أثرها على القِدم */
export type MovementKind = 'promotion' | 'increment' | 'degree_settlement' | 'demotion' | 'non_financial';

export function classifyMovement(rawType: string | undefined | null): MovementKind {
  const t = String(rawType || '').trim();
  // «تسوية شهادة» يجب أن تُفحص قبل «ترفيع» لأن بعض التسميات تحتوي الكلمتين
  if (t.includes('تسوية')) return 'degree_settlement';
  if (t.includes('تنزيل')) return 'demotion';
  if (t.includes('ترفيع')) return 'promotion';
  if (t.includes('علاوة')) return 'increment';
  // نقل، تكليف، انتداب، تغيير عنوان... حركات غير مالية لا تمس القِدم
  return 'non_financial';
}

/**
 * تطبيق حركة (ترفيع درجة، علاوة سنوية، تسوية شهادة، ...) على قيد الموظف
 * - تاريخ النفاذ = تاريخ الاستحقاق (م7 من قانون 22/2008)، ولا يُستعمل تاريخ الأمر إلا إذا غاب تاريخ الاستحقاق.
 * - الحركات غير المالية (نقل، تكليف...) لا تُغيّر تواريخ القِدم ولا الدرجة/المرحلة.
 * - «تسوية شهادة» حدث تثبيت: تُحدّث last_promotion_date فقط ولا تُغيّر الدرجة ولا المرحلة.
 * - لا يُختلق تاريخ: عند غياب التاريخين تُعاد الحالة «بيانات_ناقصة» دون أي تعديل.
 */
export function applyMovementToEmployee(
  employee: EmployeeDatesRecord,
  movement: MovementPayload
): { updatedEmployee: EmployeeDatesRecord; changedFields: Record<string, any>; status?: 'بيانات_ناقصة'; kind: MovementKind } {
  const movementType = (movement.movement_type || movement.movementType || '').trim();
  const kind = classifyMovement(movementType);
  const effectiveDate = movement.due_date || movement.dueDate || movement.order_date || movement.orderDate || null;

  const updated: EmployeeDatesRecord = { ...employee };
  const changedFields: Record<string, any> = {};

  if (kind === 'non_financial') {
    return { updatedEmployee: updated, changedFields, kind };
  }

  if (!effectiveDate) {
    return { updatedEmployee: updated, changedFields, status: 'بيانات_ناقصة', kind };
  }

  const setField = (camel: keyof EmployeeDatesRecord, snake: keyof EmployeeDatesRecord, value: any) => {
    (updated as any)[camel] = value;
    (updated as any)[snake] = value;
    changedFields[camel as string] = value;
    changedFields[snake as string] = value;
  };

  if (kind === 'degree_settlement') {
    // تثبيت فقط: لا تغيير في الدرجة أو المرحلة أو تاريخ العلاوة
    setField('lastPromotionDate', 'last_promotion_date', effectiveDate);
    return { updatedEmployee: updated, changedFields, kind };
  }

  const gAfter = movement.grade_after ?? movement.gradeAfter;
  if (gAfter !== undefined && gAfter !== null && gAfter !== '') {
    updated.grade = gAfter;
    changedFields.grade = gAfter;
  }

  const sAfter = movement.step_after ?? movement.stepAfter;
  if (sAfter !== undefined && sAfter !== null && sAfter !== '') {
    const s = parseInt(String(sAfter), 10);
    if (!Number.isNaN(s)) {
      updated.step = s;
      changedFields.step = s;
    }
  }

  // تاريخ الدرجة/المرحلة يتبع الحركة المالية التي غيّرتها
  updated.gradeDate = effectiveDate;
  updated.grade_date = effectiveDate;
  changedFields.gradeDate = effectiveDate;
  changedFields.grade_date = effectiveDate;

  if (kind === 'promotion') {
    setField('lastPromotionDate', 'last_promotion_date', effectiveDate);
  } else if (kind === 'increment') {
    setField('lastIncrementDate', 'last_increment_date', effectiveDate);
  }
  // demotion (تنزيل الدرجة بعقوبة): تتغير الدرجة/المرحلة فقط، ولا يُعاد ضبط القِدم هنا

  return { updatedEmployee: updated, changedFields, kind };
}
