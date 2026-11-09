// توحيد حالة طلب الإجازة: القيمة القانونية الوحيدة للاعتماد هي «معتمد» (يقبلها الخادم كقيمة قياسية)
export const APPROVED_LEAVE_STATUS = 'معتمد';
export const PENDING_LEAVE_STATUS = 'معلق';

const ALIASES = {
  'معتمد': 'معتمد',
  'معتمدة': 'معتمد',
  'مقبولة': 'معتمد',
  'مقبول': 'معتمد',
  'موافق_عليها': 'معتمد',
  'موافق عليها': 'معتمد',
  'approved': 'معتمد',
  'معلق': 'معلق',
  'معلقة': 'معلق',
  'قيد الانتظار': 'معلق',
  'pending': 'معلق',
  'مرفوض': 'مرفوض',
  'مرفوضة': 'مرفوض',
  'rejected': 'مرفوض',
  'ملغى': 'ملغى',
  'ملغاة': 'ملغى',
  'ملغي': 'ملغى',
};

export function normalizeLeaveStatus(status) {
  const s = String(status ?? '').trim();
  return ALIASES[s] || s;
}

export function isApprovedLeave(leave) {
  return normalizeLeaveStatus(leave?.status) === APPROVED_LEAVE_STATUS;
}

/** الأيام المستهلكة من الرصيد: الإجازات المعتمدة فقط (المعلقة لا تُخصم) */
export function consumedLeaveDays(leaves, leaveType) {
  return (leaves || [])
    .filter(l => l && l.leave_type === leaveType && isApprovedLeave(l))
    .reduce((sum, l) => sum + (Number(l.days_count) || 0), 0);
}
