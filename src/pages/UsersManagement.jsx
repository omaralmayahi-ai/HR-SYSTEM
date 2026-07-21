import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { 
  UserPlus, Edit2, Trash2, Shield, User, Mail, 
  Lock, RefreshCw, Search, X, ShieldAlert 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function UsersManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal/Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'user'
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiClient.auth.users.list();
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      toast({
        title: 'خطأ في جلب المستخدمين',
        description: err.message || 'حدث خطأ أثناء تحميل قائمة المستخدمين.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      role: 'user'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: user.password, // Keep the existing password
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'user'
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (editingUser) {
        // Update user
        await apiClient.auth.users.update(editingUser.id, formData);
        toast({
          title: 'تم تعديل المستخدم',
          description: `تم تحديث بيانات المستخدم (${formData.username}) بنجاح.`,
        });
      } else {
        // Create user
        await apiClient.auth.users.create(formData);
        toast({
          title: 'تم إضافة المستخدم',
          description: `تم إنشاء حساب المستخدم (${formData.username}) بنجاح.`,
        });
      }
      fetchUsers();
      handleCloseModal();
    } catch (err) {
      console.error('Error saving user:', err);
      setFormError(err.message || 'فشلت العملية. يرجى التحقق من المدخلات.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.username === 'admin') {
      toast({
        title: 'عملية غير مسموحة',
        description: 'لا يمكن حذف حساب مدير النظام الرئيسي (admin).',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(`هل أنت متأكد من رغبتك في حذف المستخدم "${user.name || user.username}"؟`)) {
      return;
    }

    try {
      await apiClient.auth.users.delete(user.id);
      toast({
        title: 'تم حذف المستخدم',
        description: 'تمت إزالة الحساب من قاعدة البيانات بنجاح.',
      });
      fetchUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
      toast({
        title: 'خطأ في الحذف',
        description: err.message || 'حدث خطأ أثناء محاولة حذف المستخدم.',
        variant: 'destructive',
      });
    }
  };

  const filteredUsers = users.filter(user => {
    const q = searchQuery.toLowerCase();
    return (
      user.username.toLowerCase().includes(q) ||
      (user.name && user.name.toLowerCase().includes(q)) ||
      (user.email && user.email.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة المستخدمين والصلاحيات</h1>
          <p className="text-sm text-slate-500 mt-1">إنشاء وإدارة حسابات المستخدمين الذين يمكنهم تسجيل الدخول للمنصة وتحديد أدوارهم.</p>
        </div>
        <Button 
          onClick={handleOpenAddModal} 
          className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white gap-2 h-11 px-5 rounded-xl self-start md:self-auto"
        >
          <UserPlus size={18} />
          <span>إضافة مستخدم جديد</span>
        </Button>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Controls Bar */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="بحث باسم المستخدم أو الاسم الكامل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 pl-4 h-10 border-slate-200 text-right text-sm"
            />
          </div>
          <button 
            onClick={fetchUsers} 
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#1B3A6B] transition-colors p-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>تحديث البيانات</span>
          </button>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <RefreshCw size={36} className="animate-spin text-[#1B3A6B]" />
              <p className="text-sm font-medium">جاري تحميل حسابات المستخدمين...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <User size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-600">لم يتم العثور على أي مستخدمين</p>
              <p className="text-xs text-slate-400 mt-1">تأكد من كتابة مصطلح البحث بشكل صحيح أو أضف مستخدماً جديداً.</p>
            </div>
          ) : (
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-100">
                  <th className="px-6 py-4">الاسم الكامل</th>
                  <th className="px-6 py-4">اسم المستخدم</th>
                  <th className="px-6 py-4">البريد الإلكتروني</th>
                  <th className="px-6 py-4">نوع الصلاحية</th>
                  <th className="px-6 py-4">كلمة المرور المسجلة</th>
                  <th className="px-6 py-4 text-left">العمليات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800">{user.name}</td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">{user.username}</td>
                    <td className="px-6 py-4 text-slate-500">{user.email || '—'}</td>
                    <td className="px-6 py-4">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 bg-[#1B3A6B]/10 text-[#1B3A6B] px-2.5 py-1 rounded-full text-xs font-bold border border-[#1B3A6B]/20">
                          <Shield size={12} />
                          <span>مدير النظام</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200">
                          <User size={12} />
                          <span>مستخدم عادي</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs select-all">
                      {user.username === 'admin' ? '••••••••' : user.password}
                    </td>
                    <td className="px-6 py-4 text-left">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(user)}
                          className="p-2 text-slate-500 hover:text-[#1B3A6B] hover:bg-[#1B3A6B]/5 rounded-lg transition-all"
                          title="تعديل الحساب"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          disabled={user.username === 'admin'}
                          className={`p-2 rounded-lg transition-all ${
                            user.username === 'admin' 
                              ? 'text-slate-300 cursor-not-allowed' 
                              : 'text-red-500 hover:bg-red-50'
                          }`}
                          title={user.username === 'admin' ? 'لا يمكن حذف المدير الرئيسي' : 'حذف الحساب'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Backdrop & Content */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-[#1B3A6B] p-5 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <UserPlus size={20} />
                  <h3 className="font-bold text-lg">
                    {editingUser ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}
                  </h3>
                </div>
                <button 
                  onClick={handleCloseModal}
                  className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <ShieldAlert size={16} className="text-red-600 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {editingUser && editingUser.username === 'admin' && (
                  <div className="p-3 bg-[#C8960C]/10 border border-[#C8960C]/20 text-[#C8960C] rounded-xl text-xs font-semibold flex items-start gap-2">
                    <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                    <span>تنبيه: هذا هو حساب مدير النظام الرئيسي. لا يمكن تعديل اسم المستخدم أو سحب صلاحيات المسؤول منه.</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-bold text-slate-700">الاسم الكامل</Label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="مثال: أحمد علي حسين"
                      value={formData.name}
                      onChange={handleFormChange}
                      className="pr-10 border-slate-200 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-xs font-bold text-slate-700">اسم المستخدم</Label>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="username"
                        name="username"
                        type="text"
                        placeholder="مثال: ahmed_ali"
                        value={formData.username}
                        onChange={handleFormChange}
                        disabled={editingUser && editingUser.username === 'admin'}
                        className="pr-10 font-mono text-xs border-slate-200"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-bold text-slate-700">كلمة المرور</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="password"
                        name="password"
                        type="text"
                        placeholder="مثال: SecurePass123"
                        value={formData.password}
                        onChange={handleFormChange}
                        className="pr-10 font-mono text-xs border-slate-200"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-bold text-slate-700">البريد الإلكتروني (اختياري)</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@hr.gov.iq"
                      value={formData.email}
                      onChange={handleFormChange}
                      className="pr-10 border-slate-200 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 block mb-1">نوع الصلاحية والوصول</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`border rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all ${
                      formData.role === 'admin' 
                        ? 'border-[#1B3A6B] bg-[#1B3A6B]/5 text-[#1B3A6B]' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Shield size={16} />
                        <span className="text-xs font-bold">مدير نظام</span>
                      </div>
                      <input 
                        type="radio" 
                        name="role" 
                        value="admin"
                        checked={formData.role === 'admin'}
                        onChange={handleFormChange}
                        disabled={editingUser && editingUser.username === 'admin'}
                        className="w-4 h-4 accent-[#1B3A6B]"
                      />
                    </label>

                    <label className={`border rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all ${
                      formData.role === 'user' 
                        ? 'border-[#1B3A6B] bg-[#1B3A6B]/5 text-[#1B3A6B]' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <User size={16} />
                        <span className="text-xs font-bold">مستخدم عادي</span>
                      </div>
                      <input 
                        type="radio" 
                        name="role" 
                        value="user"
                        checked={formData.role === 'user'}
                        onChange={handleFormChange}
                        disabled={editingUser && editingUser.username === 'admin'}
                        className="w-4 h-4 accent-[#1B3A6B]"
                      />
                    </label>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleCloseModal}
                    className="border-slate-200 text-slate-600 rounded-xl"
                  >
                    إلغاء
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={submitting}
                    className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl px-5"
                  >
                    {submitting ? 'جاري الحفظ...' : 'حفظ البيانات'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
