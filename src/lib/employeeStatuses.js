// src/lib/employeeStatuses.js — B4a (ق-14): معنى حالات الموظف من الخادم بدل القوائم الثابتة.
import { useEffect, useState } from 'react';
import { apiClient } from '@/api/apiClient';

/** السلوك قبل B4a؛ يُستعمل فقط إذا تعذّر جلب الحالات. */
export const FALLBACK_STATUSES = [
  { name: 'مستمر', is_active: true, payroll_eligible: true, accrues_leave: true, is_default: true },
  { name: 'مستمر بالخدمة', is_active: true, payroll_eligible: true, accrues_leave: true },
  { name: 'فعال', is_active: true, payroll_eligible: true, accrues_leave: true },
  { name: 'متقاعد مع تمديد', is_active: true },
  { name: 'منسب' }, { name: 'مجاز' }, { name: 'منقول' }, { name: 'موقوف' }, { name: 'متقاعد' }, { name: 'مستقيل' },
];

let cached = null;
let inflight = null;

export async function loadEmployeeStatuses({ force = false } = {}) {
  if (cached && !force) return cached;
  if (!inflight || force) {
    inflight = apiClient.entities.EmployeeStatus.list()
      .then(list => {
        cached = Array.isArray(list) && list.length > 0 ? list : FALLBACK_STATUSES;
        return cached;
      })
      .catch(() => FALLBACK_STATUSES)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function invalidateEmployeeStatuses() { cached = null; }

const norm = (s) => String(s ?? '').trim();

// الحالة الفارغة ما تُحسب فعّالة ولا يُولَّد لها راتب (نفس السلوك قبل B4a: الرواتب واللوحة
// كانت تستثنيها). التراكم الشهري وحده يشملها، وهذا بالخادم.
function hasFlag(employee, statuses, flag) {
  const list = Array.isArray(statuses) && statuses.length ? statuses : FALLBACK_STATUSES;
  const name = norm(employee?.status ?? employee?.employeeStatus);
  if (!name) return false;
  return !!list.find(s => norm(s.name) === name)?.[flag];
}

export const isActiveEmployee = (emp, statuses) => hasFlag(emp, statuses, 'is_active');
export const isPayrollEligibleEmployee = (emp, statuses) => hasFlag(emp, statuses, 'payroll_eligible');

export const statusNames = (statuses) =>
  (Array.isArray(statuses) && statuses.length ? statuses : FALLBACK_STATUSES).map(s => s.name).filter(Boolean);

/** هوك للواجهات: يرجع القائمة (أو الاحتياطية لحين التحميل). */
export function useEmployeeStatuses() {
  const [statuses, setStatuses] = useState(cached || FALLBACK_STATUSES);
  useEffect(() => {
    let alive = true;
    loadEmployeeStatuses().then(list => { if (alive) setStatuses(list); });
    return () => { alive = false; };
  }, []);
  return statuses;
}
