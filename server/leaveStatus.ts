// server/leaveStatus.ts
// One canonical vocabulary for leave request status (as used by the Leaves screen):
//   معلق (pending) · معتمد (approved) · مرفوض (rejected) · ملغى (cancelled)
// Older records may carry other spellings written by previous server/engine versions
// ("مقبولة", "موافق_عليها", "approved", ...). They are still READ correctly, and every write
// stores the canonical value.

export const LEAVE_STATUS = {
  PENDING: 'معلق',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغى'
} as const;

const SYNONYMS: Record<string, string[]> = {
  [LEAVE_STATUS.APPROVED]: ['معتمد', 'معتمدة', 'مقبولة', 'مقبول', 'موافق_عليها', 'موافق عليها', 'موافق عليه', 'approved'],
  [LEAVE_STATUS.REJECTED]: ['مرفوض', 'مرفوضة', 'rejected'],
  [LEAVE_STATUS.PENDING]: ['معلق', 'معلقة', 'قيد الانتظار', 'قيد المراجعة', 'pending'],
  [LEAVE_STATUS.CANCELLED]: ['ملغى', 'ملغي', 'ملغاة', 'ملغية', 'cancelled', 'canceled']
};

const LOOKUP = new Map<string, string>();
for (const [canonical, list] of Object.entries(SYNONYMS)) {
  for (const v of list) LOOKUP.set(v.trim().toLowerCase(), canonical);
}

/** Canonical status for a stored/submitted value; unknown non-empty values are returned trimmed. */
export function normalizeLeaveStatus(status: any): string | null {
  if (status === null || status === undefined) return null;
  const raw = String(status).trim();
  if (!raw) return null;
  return LOOKUP.get(raw.toLowerCase()) || raw;
}

export function isApprovedLeaveStatus(status: any): boolean {
  return normalizeLeaveStatus(status) === LEAVE_STATUS.APPROVED;
}

export function isRejectedOrCancelledLeaveStatus(status: any): boolean {
  const s = normalizeLeaveStatus(status);
  return s === LEAVE_STATUS.REJECTED || s === LEAVE_STATUS.CANCELLED;
}

/** All stored spellings that mean the same canonical status (for SQL `IN (...)` filters). */
export function leaveStatusVariants(status: any): string[] {
  const canonical = normalizeLeaveStatus(status);
  if (!canonical) return [];
  return SYNONYMS[canonical] ? [...SYNONYMS[canonical]] : [canonical];
}

/**
 * The promotion/degree-track engines (src/lib) recognise "approved" but not "معتمد".
 * Map canonical approved leaves to that vocabulary when building the engine context.
 */
export function toEngineLeave<T extends Record<string, any>>(leave: T): T {
  if (!leave) return leave;
  return isApprovedLeaveStatus(leave.status) ? { ...leave, status: 'approved' } : leave;
}
