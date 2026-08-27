// src/lib/datesFoundation.test.ts
import { describe, it, expect } from 'vitest';
import { backfillEmployeeDates, applyMovementToEmployee } from './datesFoundation';
import * as schema from '../db/schema';

describe('Gap 1 & Gap 6: Dates Foundation Test Suite (أساس التواريخ والترقيات)', () => {
  // 1. Backfill tests
  describe('1. Employee Dates Backfill (التهيئة والاسترجاع للبيانات الحالية)', () => {
    it('should backfill last_promotion_date and last_increment_date from gradeDate when null', () => {
      const legacyEmployee = {
        id: 1,
        fullName: 'عمر محمود سلمان',
        grade: 4,
        step: 4,
        gradeDate: '2022-06-15',
        lastPromotionDate: null,
        lastIncrementDate: null,
        nextPromotionDueDate: null,
        nextIncrementDueDate: null,
      };

      const result = backfillEmployeeDates(legacyEmployee);
      expect(result.lastPromotionDate).toBe('2022-06-15');
      expect(result.last_promotion_date).toBe('2022-06-15');
      expect(result.lastIncrementDate).toBe('2022-06-15');
      expect(result.last_increment_date).toBe('2022-06-15');
      expect(result.nextPromotionDueDate).toBeNull();
      expect(result.nextIncrementDueDate).toBeNull();
    });

    it('should backfill from current_appointment_date or first_appointment_date if gradeDate is missing', () => {
      const legacyEmployee = {
        id: 2,
        fullName: 'أحمد علي حسن',
        currentAppointmentDate: '2019-01-10',
        gradeDate: null,
        lastPromotionDate: null,
        lastIncrementDate: null,
      };

      const result = backfillEmployeeDates(legacyEmployee);
      expect(result.lastPromotionDate).toBe('2019-01-10');
      expect(result.lastIncrementDate).toBe('2019-01-10');
    });

    it('should preserve existing lastPromotionDate and lastIncrementDate if already present', () => {
      const modernEmployee = {
        id: 3,
        fullName: 'سارة خالد',
        gradeDate: '2024-05-01',
        lastPromotionDate: '2021-03-01',
        lastIncrementDate: '2024-05-01',
      };

      const result = backfillEmployeeDates(modernEmployee);
      expect(result.lastPromotionDate).toBe('2021-03-01');
      expect(result.lastIncrementDate).toBe('2024-05-01');
    });
  });

  // 2. Movement separation tests
  describe('2. Separation of Promotion vs Increment Dates (فصل تاريخ الترفيع عن تاريخ العلاوة)', () => {
    it('should update lastPromotionDate on promotion movement and keep lastIncrementDate untouched', () => {
      const employee = {
        id: 10,
        grade: 5,
        step: 4,
        gradeDate: '2020-01-01',
        lastPromotionDate: '2020-01-01',
        lastIncrementDate: '2022-01-01',
      };

      // إجراء ترفيع درجة
      const movement = {
        movementType: 'ترفيع درجة',
        gradeBefore: 5,
        gradeAfter: 4,
        stepBefore: 4,
        stepAfter: 1,
        orderDate: '2024-06-01',
      };

      const { updatedEmployee } = applyMovementToEmployee(employee, movement);

      expect(updatedEmployee.grade).toBe(4);
      expect(updatedEmployee.step).toBe(1);
      expect(updatedEmployee.gradeDate).toBe('2024-06-01');
      expect(updatedEmployee.lastPromotionDate).toBe('2024-06-01'); // تم تحديث تاريخ الترفيع
      expect(updatedEmployee.lastIncrementDate).toBe('2022-01-01'); // لم يتغير تاريخ العلاوة السابقة
    });

    it('should update lastIncrementDate on annual increment movement and keep lastPromotionDate untouched', () => {
      const employee = {
        id: 11,
        grade: 4,
        step: 1,
        gradeDate: '2024-06-01',
        lastPromotionDate: '2024-06-01',
        lastIncrementDate: '2024-06-01',
      };

      // إجراء علاوة سنوية لاحقة بعد سنة
      const movement = {
        movementType: 'علاوة سنوية',
        gradeBefore: 4,
        gradeAfter: 4,
        stepBefore: 1,
        stepAfter: 2,
        orderDate: '2025-06-01',
      };

      const { updatedEmployee } = applyMovementToEmployee(employee, movement);

      expect(updatedEmployee.grade).toBe(4);
      expect(updatedEmployee.step).toBe(2);
      expect(updatedEmployee.gradeDate).toBe('2025-06-01'); // للتوافق العكسي
      expect(updatedEmployee.lastIncrementDate).toBe('2025-06-01'); // تم تحديث تاريخ العلاوة
      expect(updatedEmployee.lastPromotionDate).toBe('2024-06-01'); // احتفظ بتاريخ الترفيع الأصلي دون مساس!
    });
  });

  // 3. Schema columns verification
  describe('3. Schema Definitions Verification (التحقق من تعريفات المخطط في Drizzle)', () => {
    it('should have all 4 date columns defined on employees schema', () => {
      expect(schema.employees.lastPromotionDate).toBeDefined();
      expect(schema.employees.lastIncrementDate).toBeDefined();
      expect(schema.employees.nextPromotionDueDate).toBeDefined();
      expect(schema.employees.nextIncrementDueDate).toBeDefined();
    });

    it('should have effectiveFrom defined on salaryScale schema', () => {
      expect(schema.salaryScale.effectiveFrom).toBeDefined();
    });

    it('should have actingEndDate defined on jobAssignments schema', () => {
      expect(schema.jobAssignments.actingEndDate).toBeDefined();
    });
  });
});
