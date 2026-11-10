// src/lib/sharedSettings.js — B6: إعدادات جانت محفوظة بمتصفح كل مستخدم فقط (قواعد المخصصات، ترتيب
// القوائم، مصفوفة الترفيع...) صارت مصدرها القاعدة. التخزين المحلي يبقى نسخة مخبأة تتحدث من
// الخادم عند كل دخول، وأي كتابة عليه لهذه المفاتيح تنرسل للخادم تلقائياً، فالشاشات ما تحتاج تعديل.
// نفس القوائم بالخادم (server/sharedSettingsKeys.ts).
//
// القواعد: الخادم يغلب عند التحميل (القيمة المحلية المختلفة تُحفظ نسخة احتياطية)؛ الحذف علامة بالخادم
// فتُحذف من كل المتصفحات؛ نقل القيم القديمة من المتصفح يصير مرة وحدة؛ مفاتيح الرواتب للمدير فقط؛
// تعارض النسخ (تعديل من مستخدم آخر بعد آخر تحميل) يُرفض ويُحمَّل الأحدث بدل ما يمسح تعديله.

import { apiClient } from '@/api/apiClient';

export const SHARED_SETTING_KEYS = [
  'ALLOWANCES_DEDUCTIONS_ORDER', 'CUSTOM_ALLOWANCES_ORDER', 'CUSTOM_DEDUCTIONS_ORDER',
  'PENALTY_TYPES_ORDER', 'EDUCATION_DEGREES_ORDER', 'RESPONSIBILITY_ALLOWANCES_ORDER',
  'GOVERNING_GRADE_REQUIREMENTS', 'PROMOTION_PATHS_MATRIX', 'PROMOTION_YEARS',
  'CUSTOM_JOB_CATEGORIES', 'DELETED_JOB_CATEGORIES',
  'hr_saved_specialties', 'hr_deleted_specialties', 'hr_custom_issuers',
  'SPOUSE_ALLOWANCE', 'SPOUSE_ALLOWANCE_STATUS', 'CHILD_ALLOWANCE', 'CHILD_ALLOWANCE_STATUS',
  'RETIREMENT_RATE', 'RETIREMENT_STATUS',
];
export const SHARED_SETTING_PREFIXES = ['ALLOWANCE_RULES_', 'TEMPORARY_META_'];
export const ADMIN_ONLY_SHARED_KEYS = [
  'SPOUSE_ALLOWANCE', 'SPOUSE_ALLOWANCE_STATUS', 'CHILD_ALLOWANCE', 'CHILD_ALLOWANCE_STATUS',
  'RETIREMENT_RATE', 'RETIREMENT_STATUS', 'PROMOTION_YEARS', 'PROMOTION_PATHS_MATRIX', 'GOVERNING_GRADE_REQUIREMENTS',
  'ALLOWANCES_DEDUCTIONS_ORDER', 'CUSTOM_ALLOWANCES_ORDER', 'CUSTOM_DEDUCTIONS_ORDER',
];
const ADMIN_ROLES = ['admin', 'super_admin', 'hr_admin'];
const BACKUP_PREFIX = 'HR_LOCAL_BACKUP:';
const IMPORTED_FLAG = { writer: 'HR_SHARED_IMPORTED_v1:writer', admin: 'HR_SHARED_IMPORTED_v1:admin' };
const TOKEN_KEY = 'hr_session_token';

export function isSharedSettingKey(key) {
  if (typeof key !== 'string' || !key || key.length > 120) return false;
  if (SHARED_SETTING_KEYS.includes(key)) return true;
  return SHARED_SETTING_PREFIXES.some(p => key.startsWith(p) && key.length > p.length && /^[A-Za-z0-9_-]+$/.test(key.slice(p.length)));
}
export function isAdminOnlySharedKey(key) {
  return ADMIN_ONLY_SHARED_KEYS.includes(key) || SHARED_SETTING_PREFIXES.some(p => key.startsWith(p));
}

let installed = false;
let suppress = false;
let role = null;
const versions = new Map(); // key -> updatedAt آخر ما شافه هذا المتصفح
const pending = new Map();  // key -> { value, source, timer, tries }
const listeners = new Set();
let lastStatus = { ok: true };

export function onSharedSettingsStatus(fn) { listeners.add(fn); fn(lastStatus); return () => listeners.delete(fn); }
function emit(status) {
  lastStatus = status;
  for (const fn of listeners) { try { fn(status); } catch { /* ignore */ } }
}

function storage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
const origGet = typeof Storage !== 'undefined' ? Storage.prototype.getItem : null;
const origSet = typeof Storage !== 'undefined' ? Storage.prototype.setItem : null;
const origRemove = typeof Storage !== 'undefined' ? Storage.prototype.removeItem : null;

function writeLocal(key, value) {
  const ls = storage();
  suppress = true;
  try { if (value === null) ls.removeItem(key); else ls.setItem(key, value); }
  catch (e) { emit({ ok: false, key, error: `تعذّر الحفظ بالمتصفح: ${e?.message || e}` }); }
  finally { suppress = false; }
}

function canSend(key) { return !isAdminOnlySharedKey(key) || ADMIN_ROLES.includes(role); }

async function putNow(key, entry) {
  const res = await apiClient.sharedSettings.put(key, entry.value, entry.source, versions.has(key) ? versions.get(key) : undefined);
  if (res?.version) versions.set(key, res.version);
  return res;
}

function schedule(key, value, source = 'user') {
  if (!canSend(key)) {
    emit({ ok: false, key, error: 'تعديل قواعد الرواتب والاستحقاق للمدير فقط؛ التعديل ما انحفظ بالخادم' });
    return;
  }
  const prev = pending.get(key);
  if (prev?.timer) clearTimeout(prev.timer);
  const entry = { value, source, tries: 0, timer: null };
  entry.timer = setTimeout(() => run(key, entry), 400);
  pending.set(key, entry);
}

async function run(key, entry) {
  if (pending.get(key) !== entry) return;
  entry.timer = null;
  try {
    await putNow(key, entry);
    if (pending.get(key) === entry) pending.delete(key);
    emit({ ok: true, key, pending: pending.size });
  } catch (err) {
    const status = err?.status;
    if (status === 409 && err?.data) {
      // تعديل من مستخدم آخر: نحفظ تعديلنا نسخة احتياطية ونحمّل الأحدث
      const ls = storage();
      try { origSet.call(ls, BACKUP_PREFIX + key, entry.value === null ? '' : entry.value); } catch { /* ignore */ }
      versions.set(key, err.data.version);
      writeLocal(key, err.data.current);
      pending.delete(key);
      emit({ ok: false, key, error: 'الإعداد تغيّر من مستخدم آخر؛ حُمّلت النسخة الأحدث وحُفظ تعديلك نسخة احتياطية. أعد التعديل إذا يلزم.' });
      return;
    }
    if (status && status >= 400 && status < 500) {
      pending.delete(key);
      emit({ ok: false, key, error: err?.message || 'رفض الخادم حفظ الإعداد' });
      return;
    }
    entry.tries += 1;
    emit({ ok: false, key, error: `تعذّر حفظ الإعداد بالخادم (محاولة ${entry.tries})`, pending: pending.size });
    if (entry.tries < 6 && pending.get(key) === entry) entry.timer = setTimeout(() => run(key, entry), 2000 * entry.tries);
  }
}

/** يرسل كل ما ينتظر فوراً (عند الخروج أو إغلاق الصفحة)؛ keepalive يكمّل حتى لو انغلقت الصفحة. */
export function flushSharedSettings() {
  const ls = storage();
  const token = ls ? origGet.call(ls, TOKEN_KEY) : null;
  for (const [key, entry] of pending) {
    if (entry.timer) clearTimeout(entry.timer);
    try {
      fetch(`/api/shared-settings/${encodeURIComponent(key)}`, {
        method: 'PUT', keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ value: entry.value, source: entry.source, base: versions.get(key) }),
      });
    } catch { /* ignore */ }
  }
  pending.clear();
}

export function installSharedSettingsSync() {
  const ls = storage();
  if (installed || !ls || typeof Storage === 'undefined') return;
  installed = true;
  Storage.prototype.setItem = function (key, value) {
    const shared = this === ls && !suppress && isSharedSettingKey(key);
    const before = shared ? origGet.call(this, key) : undefined;
    origSet.call(this, key, value);
    if (shared && before !== String(value)) schedule(key, String(value));
  };
  Storage.prototype.removeItem = function (key) {
    const shared = this === ls && !suppress && isSharedSettingKey(key);
    const existed = shared && origGet.call(this, key) !== null;
    origRemove.call(this, key);
    if (shared && existed) schedule(key, null);
  };
  try { window.addEventListener('pagehide', flushSharedSettings); } catch { /* ignore */ }
}

/**
 * يجلب الإعدادات المشتركة ويكتبها بالتخزين المحلي (الخادم يغلب؛ المحلي المختلف نسخة احتياطية؛
 * المحذوف بالخادم يُحذف محلياً). القيم المحلية غير الموجودة بالخادم تُنقل مرة وحدة لكل متصفح.
 */
export async function hydrateSharedSettings(userRole) {
  const ls = storage();
  if (!ls) return { loaded: 0, uploaded: 0 };
  role = userRole || null;
  installSharedSettingsSync();
  let payload;
  try {
    payload = (await apiClient.sharedSettings.getAll()) || {};
  } catch (err) {
    emit({ ok: false, error: 'تعذّر تحميل الإعدادات المشتركة من الخادم؛ الرواتب والقواعد قد تعتمد على نسخة قديمة بهذا المتصفح.' });
    throw err;
  }
  const settings = payload.settings || {};
  for (const [k, v] of Object.entries(payload.versions || {})) versions.set(k, v);
  let loaded = 0, uploaded = 0;
  for (const [key, value] of Object.entries(settings)) {
    if (!isSharedSettingKey(key)) continue;
    try {
      const local = origGet.call(ls, key);
      if (local === value) continue;
      if (local !== null && origGet.call(ls, BACKUP_PREFIX + key) === null) origSet.call(ls, BACKUP_PREFIX + key, local);
      writeLocal(key, value);
      loaded++;
    } catch (e) {
      emit({ ok: false, key, error: `تعذّر تحديث (${key}) بالمتصفح: ${e?.message || e}` });
    }
  }
  const isAdmin = ADMIN_ROLES.includes(role);
  const flags = [IMPORTED_FLAG.writer, ...(isAdmin ? [IMPORTED_FLAG.admin] : [])];
  if (flags.some(f => origGet.call(ls, f) === null)) {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!isSharedSettingKey(key) || key in settings) continue;
      const adminKey = isAdminOnlySharedKey(key);
      if (adminKey && (!isAdmin || origGet.call(ls, IMPORTED_FLAG.admin) !== null)) continue;
      if (!adminKey && origGet.call(ls, IMPORTED_FLAG.writer) !== null) continue;
      schedule(key, origGet.call(ls, key), 'imported-local-storage');
      uploaded++;
    }
    for (const f of flags) { try { origSet.call(ls, f, new Date().toISOString()); } catch { /* ignore */ } }
  }
  emit({ ok: true, loaded, uploaded });
  try { window.dispatchEvent(new CustomEvent('shared-settings-hydrated', { detail: { loaded, uploaded } })); } catch { /* ignore */ }
  return { loaded, uploaded };
}

export function pendingSharedSettings() { return pending.size; }
