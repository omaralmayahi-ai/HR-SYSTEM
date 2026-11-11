// B9: فحص صلاحية بالواجهة (الخادم هو الحكم؛ هذا لإخفاء الأزرار فقط).
// جلسة قديمة بلا قائمة صلاحيات ⇒ المدير كل شيء.
export const can = (user, perm) => (Array.isArray(user?.permissions) ? user.permissions.includes(perm) : user?.role === 'admin');
