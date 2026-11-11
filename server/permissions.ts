// server/permissions.ts — B9: الصلاحيات المرنة (ق-3 بالمتتبع): المدير ينشئ الأدوار ويمنح الصلاحيات.
// كل دور له «أساس» (admin / user / employee) يحكم المسارات القديمة، وصلاحيات دقيقة تحكم وحدة الرواتب.
export const PERMISSIONS = {
  'payroll.view': 'الاطلاع على رواتب الموظفين وكشوفها ومعايناتها',
  'payroll.enter': 'إدخال عمليات الرواتب (إسناد، عائلة، حساب مصرفي) وفتح الفترات واحتسابها',
  'payroll.approve': 'اعتماد عمليات الرواتب والفترات وإصدارها وطلب إلغاء اعتمادها',
  'payroll.settings': 'إعدادات الرواتب (حالات الاستحقاق، أرقام الحسابات)',
  'users.manage': 'إدارة المستخدمين والأدوار وربطهم بالموظفين',
  'audit.view': 'الاطلاع على سجل التدقيق',
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const BASES = ['admin', 'user', 'employee'] as const;
export type Base = (typeof BASES)[number];

export interface RoleDef { name: string; label: string; base: Base; permissions: Permission[]; isSystem: boolean }

/** الأدوار الافتراضية = السلوك قبل B9 تماماً (المدير كل شيء، مستخدم الإدخال يطّلع ويُدخل، الموظف اطلاع). */
export const DEFAULT_ROLES: RoleDef[] = [
  { name: 'admin', label: 'مدير النظام', base: 'admin', permissions: Object.keys(PERMISSIONS) as Permission[], isSystem: true },
  { name: 'user', label: 'مستخدم إدخال', base: 'user', permissions: ['payroll.view', 'payroll.enter'], isSystem: true },
  { name: 'hr', label: 'موارد بشرية', base: 'user', permissions: ['payroll.view', 'payroll.enter'], isSystem: true },
  { name: 'employee', label: 'اطلاع', base: 'employee', permissions: [], isSystem: true },
];

export interface Caller { base: string; roleName?: string; permissions?: string[] }
/**
 * قواعد تعديل الأدوار (مراجعة B9 H1): ما يعدّل المستخدم دوره، ومن أساسه غير admin ما يمنح أساس admin
 * ولا يعدّل الأدوار النظامية ولا يمنح صلاحية ما يملكها. دور الاطلاع بلا صلاحيات.
 */
export function roleChangeProblem(caller: Caller, target: { name: string; isSystem?: boolean } | null, next: { base: string; permissions: string[] }): string | null {
  const mine = new Set(caller.permissions || []);
  if (!mine.has('users.manage')) return 'تحتاج صلاحية إدارة المستخدمين';
  if (target && target.name === caller.roleName) return 'ما تكدر تعدّل دورك أنت؛ يعدّله مدير آخر';
  if (next.base === 'employee' && next.permissions.length) return 'دور الاطلاع بلا صلاحيات رواتب أو إدارة';
  if (caller.base !== 'admin') {
    if (next.base === 'admin') return 'أساس «مدير» يمنحه مدير النظام فقط';
    if (target?.isSystem) return 'الأدوار النظامية يعدّلها مدير النظام فقط';
  }
  const extra = next.permissions.filter(p => !mine.has(p));
  if (extra.length) return `ما تكدر تمنح صلاحية ما تملكها: ${extra.join('، ')}`;
  return null;
}
