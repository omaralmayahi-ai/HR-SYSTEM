import { describe, it, expect } from 'vitest';
import { normalizeLeaveStatus, isApprovedLeave, consumedLeaveDays } from './leaveStatus';

describe('leave status', () => {
  it('normalizes server/legacy approved values to «معتمد»', () => {
    expect(normalizeLeaveStatus('مقبولة')).toBe('معتمد');
    expect(normalizeLeaveStatus('موافق_عليها')).toBe('معتمد');
    expect(normalizeLeaveStatus('معتمد')).toBe('معتمد');
  });
  it('pending requests are not deducted from the balance', () => {
    const leaves = [
      { leave_type: 'اعتيادية', status: 'معلق', days_count: 10 },
      { leave_type: 'اعتيادية', status: 'مقبولة', days_count: 3 },
      { leave_type: 'اعتيادية', status: 'معتمد', days_count: 2 },
      { leave_type: 'اعتيادية', status: 'مرفوض', days_count: 7 },
      { leave_type: 'مرضية', status: 'معتمد', days_count: 4 },
    ];
    expect(consumedLeaveDays(leaves, 'اعتيادية')).toBe(5);
    expect(isApprovedLeave(leaves[0])).toBe(false);
  });
});
