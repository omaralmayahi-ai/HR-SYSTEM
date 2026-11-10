import { describe, it, expect } from 'vitest';
import { syncPromotionDelayReasons } from './promotionDelayReasonsEngine';

describe('أداء: سبب تأخير بدون تغيير ما يُكتب', () => {
  it('لا يعدّ السبب محدَّثاً إذا الوصف والأثر والحالة نفسها', () => {
    const existing: any = {
      id: 5, employeeId: 1, reasonType: 'عقوبة', sourceReferenceId: 'p-1', description: 'لفت نظر', affects: 'علاوة',
      isResolved: false, isHidden: true, reminderDate: '2027-01-01', isAutoReminder: false,
    };
    const raw: any = { reasonType: 'عقوبة', sourceReferenceId: 'p-1', description: 'لفت نظر', affects: 'علاوة' };
    const same = syncPromotionDelayReasons(1, [raw], [existing]);
    expect(same.updated).toHaveLength(0);
    expect(same.added).toHaveLength(0);
    const changed = syncPromotionDelayReasons(1, [{ ...raw, description: 'لفت نظر (معدّل)' }], [existing]);
    expect(changed.updated).toHaveLength(1);
    expect(changed.updated[0].isHidden).toBe(true);
    const reopened = syncPromotionDelayReasons(1, [raw], [{ ...existing, isResolved: true }]);
    expect(reopened.updated).toHaveLength(1);
  });
});
