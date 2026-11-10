import { describe, it, expect, vi } from 'vitest';
import { createStatusRegistry, LEGACY_STATUS_FLAGS, type StatusFlags } from './statusRegistry';
import { countRelatedRecords, archivedEmployeeHasRecords } from './employeeDeletion';
import { ACCRUAL_UPDATE_SQL } from './leaveAccrual';

const row = (name: string, f: Partial<StatusFlags> = {}): StatusFlags => ({
  name, isActive: false, payrollEligible: false, accruesLeave: false, isDefault: false, sortOrder: 100, ...f,
});

describe('statusRegistry (B4a)', () => {
  const rows = [
    row('مستمر', { isActive: true, payrollEligible: true, accruesLeave: true, isDefault: true }),
    row('متقاعد مع تمديد', { isActive: true }),
    row('مجاز'),
  ];

  it('يقرأ الأعلام حسب الاسم ويعامل الفارغة كالافتراضية', async () => {
    const r = createStatusRegistry(async () => rows);
    expect(await r.isPayrollEligible('مستمر')).toBe(true);
    expect(await r.isPayrollEligible(' مستمر ')).toBe(true);
    expect(await r.isActive('متقاعد مع تمديد')).toBe(true);
    expect(await r.isPayrollEligible('متقاعد مع تمديد')).toBe(false);
    expect(await r.isActive('مجاز')).toBe(false);
    expect(await r.isActive('حالة غير مسجلة')).toBe(false);
    expect(await r.isActive('')).toBe(true);
    expect(await r.emptyStatusHas('accruesLeave')).toBe(true);
    expect(await r.namesWhere('accruesLeave')).toEqual(['مستمر']);
    expect(await r.defaultStatus()).toBe('مستمر');
  });

  it('الكاش يُبطل عند التعديل وينتهي بالمدة', async () => {
    let t = 0;
    const load = vi.fn(async () => rows);
    const r = createStatusRegistry(load, { ttlMs: 1000, now: () => t });
    await r.all(); await r.all();
    expect(load).toHaveBeenCalledTimes(1);
    r.invalidate(); await r.all();
    expect(load).toHaveBeenCalledTimes(2);
    t = 5000; await r.all();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('جدول فارغ = السلوك القديم', async () => {
    const r = createStatusRegistry(async () => []);
    expect(await r.all()).toBe(LEGACY_STATUS_FLAGS);
    expect(await r.namesWhere('payrollEligible')).toEqual(['مستمر', 'مستمر بالخدمة', 'فعال']);
  });

  it('التراكم يقرأ القائمة من المعاملات لا من نص ثابت', () => {
    expect(ACCRUAL_UPDATE_SQL).toContain('ANY($5::text[])');
    expect(ACCRUAL_UPDATE_SQL).not.toContain("'مستمر'");
  });
});

describe('حذف الموظف (B4a، ق-15)', () => {
  it('يعدّ السجلات المرتبطة', () => {
    expect(countRelatedRecords({ penalties: [{}, {}], leaves: [] })).toEqual({ total: 2, byTable: { penalties: 2 } });
    expect(countRelatedRecords(undefined).total).toBe(0);
  });
  it('يمنع إتلاف موظف مؤرشف عنده سجلات', () => {
    expect(archivedEmployeeHasRecords({ entityType: 'employee', data: JSON.stringify({ related: { penalties: [{}] } }) })).toBe(true);
    expect(archivedEmployeeHasRecords({ entityType: 'employee', data: JSON.stringify({ related: {} }) })).toBe(false);
    expect(archivedEmployeeHasRecords({ entityType: 'employee', data: '{bad' })).toBe(true);
    expect(archivedEmployeeHasRecords({ entityType: 'trainer', data: '{}' })).toBe(false);
  });
});
