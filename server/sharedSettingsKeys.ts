// server/sharedSettingsKeys.ts — B6: إعدادات كانت محفوظة بمتصفح كل مستخدم فقط وصارت مشتركة بالقاعدة.
// نفس القائمة بالواجهة (src/lib/sharedSettings.js). المفاتيح غير المدرجة تُرفض.
// خارجها عمداً: رمز الجلسة، تفضيلات العرض الشخصية، ونسخ الجداول المخبأة (*_PRESETS, WORK_LOCATIONS)
// لأن مصدرها جداول بالقاعدة أصلاً.

export const SHARED_SETTING_KEYS = [
  'ALLOWANCES_DEDUCTIONS_ORDER', 'CUSTOM_ALLOWANCES_ORDER', 'CUSTOM_DEDUCTIONS_ORDER',
  'PENALTY_TYPES_ORDER', 'EDUCATION_DEGREES_ORDER', 'RESPONSIBILITY_ALLOWANCES_ORDER',
  'GOVERNING_GRADE_REQUIREMENTS', 'PROMOTION_PATHS_MATRIX', 'PROMOTION_YEARS',
  'CUSTOM_JOB_CATEGORIES', 'DELETED_JOB_CATEGORIES',
  'hr_saved_specialties', 'hr_deleted_specialties', 'hr_custom_issuers',
  'SPOUSE_ALLOWANCE', 'SPOUSE_ALLOWANCE_STATUS', 'CHILD_ALLOWANCE', 'CHILD_ALLOWANCE_STATUS',
  'RETIREMENT_RATE', 'RETIREMENT_STATUS',
] as const;

export const SHARED_SETTING_PREFIXES = ['ALLOWANCE_RULES_', 'TEMPORARY_META_'] as const;

export const SHARED_DOC_PREFIX = 'browser:'; // مفتاح المستند بجدول app_settings_documents

export function isSharedSettingKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length === 0 || key.length > 120) return false;
  if ((SHARED_SETTING_KEYS as readonly string[]).includes(key)) return true;
  return SHARED_SETTING_PREFIXES.some(p => key.startsWith(p) && /^[A-Za-z0-9_\-]+$/.test(key.slice(p.length)) && key.length > p.length);
}

export const MAX_SHARED_VALUE_BYTES = 1_000_000;

/** مفاتيح تمس حساب الرواتب أو الاستحقاق: تعديلها للمدير فقط ويُسجَّل بسجل النشاط. */
export const ADMIN_ONLY_SHARED_KEYS = [
  'SPOUSE_ALLOWANCE', 'SPOUSE_ALLOWANCE_STATUS', 'CHILD_ALLOWANCE', 'CHILD_ALLOWANCE_STATUS',
  'RETIREMENT_RATE', 'RETIREMENT_STATUS', 'PROMOTION_YEARS', 'PROMOTION_PATHS_MATRIX', 'GOVERNING_GRADE_REQUIREMENTS',
  'ALLOWANCES_DEDUCTIONS_ORDER', 'CUSTOM_ALLOWANCES_ORDER', 'CUSTOM_DEDUCTIONS_ORDER',
] as const;

export function isAdminOnlySharedKey(key: string): boolean {
  return (ADMIN_ONLY_SHARED_KEYS as readonly string[]).includes(key) || SHARED_SETTING_PREFIXES.some(p => key.startsWith(p));
}
