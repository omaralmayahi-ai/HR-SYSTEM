import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Play, Pause } from 'lucide-react';

export default function LeaveTypesSettings() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // New Form State
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMaxDays, setNewMaxDays] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState('فعال');

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editMaxDays, setEditMaxDays] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('فعال');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.LeaveType.list();
      setRecords(data || []);
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: error.message || 'تعذر تحميل أنواع الإجازات',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName) {
      toast({
        title: 'تنبيه',
        description: 'يرجى إدخال اسم نوع الإجازة',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: newName,
        maxDays: newMaxDays ? parseInt(newMaxDays) : null,
        description: newDescription,
        status: newStatus,
      };
      await apiClient.entities.LeaveType.create(payload);
      toast({
        title: 'تمت الإضافة',
        description: `تمت إضافة إجازة "${newName}" بنجاح`,
        variant: 'success',
      });
      setNewName('');
      setNewMaxDays('');
      setNewDescription('');
      setNewStatus('فعال');
      setAdding(false);
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل أنواع الإجازات',
        details: `إضافة نوع إجازة جديد (${newName} - الحد الأقصى: ${newMaxDays || 'غير محدد'} يوم، الحالة: ${newStatus})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء الإضافة',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleStartEdit = (record) => {
    setEditingId(record.id);
    setEditName(record.name);
    setEditMaxDays(record.maxDays || '');
    setEditDescription(record.description || '');
    setEditStatus(record.status || 'فعال');
  };

  const handleSaveEdit = async (id) => {
    try {
      const payload = {
        name: editName,
        maxDays: editMaxDays ? parseInt(editMaxDays) : null,
        description: editDescription,
        status: editStatus,
      };
      await apiClient.entities.LeaveType.update(id, payload);
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث نوع الإجازة بنجاح',
        variant: 'success',
      });
      setEditingId(null);
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل أنواع الإجازات',
        details: `تحديث نوع إجازة (${editName} - الحد الأقصى الجديد: ${editMaxDays || 'غير محدد'} يوم، الحالة: ${editStatus})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء التحديث',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (record) => {
    const nextStatus = record.status === 'متوقف مؤقتاً' ? 'فعال' : 'متوقف مؤقتاً';
    try {
      await apiClient.entities.LeaveType.update(record.id, {
        status: nextStatus
      });
      toast({
        title: 'تم تغيير الحالة',
        description: `تم تحويل حالة الإجازة "${record.name}" إلى ${nextStatus === 'فعال' ? 'فعّال' : 'متوقف مؤقتاً'}`,
        variant: 'success',
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل أنواع الإجازات',
        details: `تغيير حالة نوع الإجازة (${record.name}) إلى (${nextStatus})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء تغيير الحالة',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = (id, name) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const confirmDelete = async () => {
    const { id, name } = deleteConfirm;
    setDeleteConfirm({ isOpen: false, id: null, name: '' });
    try {
      await apiClient.entities.LeaveType.delete(id);
      toast({
        title: 'تم الحذف',
        description: `تم حذف نوع الإجازة "${name}" بنجاح`,
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل أنواع الإجازات',
        details: `حذف نوع إجازة من النظام (${name})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحذف',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Seeding Standard Presets compliant with Iraq Civil Service Law
  const handleLoadStandardPresets = async () => {
    if (!window.confirm('هل تريد استيراد الإجازات الرسمية المعتمدة وفق قانون الخدمة المدنية العراقي؟ (اعتيادية، مرضية، حج وعمرة، أمومة، إلخ)')) return;
    setLoading(true);
    try {
      const presets = [
        { name: 'إجازة اعتيادية براتب تام', maxDays: 30, description: 'تُمنح للموظف براتب تام بمعدل يومين ونصف عن كل شهر خدمة فعلي متراكم.', status: 'فعال' },
        { name: 'إجازة مرضية براتب تام', maxDays: 120, description: 'تُمنح للموظف بناءً على قرار من اللجان الطبية الرسمية بحد أقصى 120 يوماً.', status: 'فعال' },
        { name: 'إجازة حج وعمرة براتب تام', maxDays: 30, description: 'تُمنح لتأدية فريضة الحج براتب تام لمرة واحدة طوال مدة الخدمة.', status: 'فعال' },
        { name: 'إجازة أمومة وولادة براتب تام', maxDays: 72, description: 'تمنح للموظفات الحوامل لغرض الولادة والعناية بالطفل لمدة 72 يوماً.', status: 'فعال' },
        { name: 'إجازة دراسية لتطوير الكفاءات', maxDays: null, description: 'تُمنح للموظفين المقبولين في الدراسات العليا للحصول على الماجستير أو الدكتوراه.', status: 'فعال' },
        { name: 'إجازة بدون راتب (طارئة)', maxDays: 60, description: 'إجازة استثنائية اضطرارية تُمنح للموظف بحد أقصى 60 يوماً سنوياً.', status: 'فعال' },
      ];

      for (const item of presets) {
        await apiClient.entities.LeaveType.create(item);
      }

      toast({
        title: 'تم استيراد الإجازات الرسمية',
        description: 'تمت تعبئة إجازات الخدمة المدنية العراقية بنجاح.',
        variant: 'success',
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعبئة إجازات الخدمة المدنية',
        details: 'تعبئة إجازات الخدمة المدنية العراقية الافتراضية (اعتيادية، مرضية، أمومة، حج وعمرة، بدون راتب)'
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء الاستيراد',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">إعدادات أنواع الإجازات وقواعدها السنوية</h2>
          <p className="text-xs text-slate-500 mt-1">إضافة، تعديل وحذف مسميات الإجازات المتاحة للموظفين وتحديد رصيد الأيام الأقصى.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} />
            إضافة نوع إجازة
          </button>
        </div>
      </div>

      {/* Adding Form */}
      {adding && (
        <form onSubmit={handleAdd} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 animate-fadeIn">
          <h3 className="text-xs font-bold text-slate-700">نوع إجازة جديد</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block">اسم الإجازة</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: إجازة اعتيادية، إجازة مصاحبة زوجية"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">الحد الأقصى للأيام السنوية (اختياري)</label>
              <input
                type="number"
                value={newMaxDays}
                onChange={(e) => setNewMaxDays(e.target.value)}
                placeholder="اتركه فارغاً لغير المحدود"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">الحالة الابتدائية</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
              >
                <option value="فعال">فعال (نشط)</option>
                <option value="متوقف مؤقتاً">متوقف مؤقتاً</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">الوصف والشروط المرفقة بالتقديم</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              placeholder="اكتب تفاصيل إضافية حول شروط التقديم أو الخصم المالي المترتب عليها إن وجد..."
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold rounded-lg px-4 py-2 text-xs transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold rounded-lg px-5 py-2 text-xs transition-colors"
            >
              إضافة الإجازة
            </button>
          </div>
        </form>
      )}

      {/* Main Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <RefreshCw className="animate-spin text-[#1B3A6B]" size={24} />
          <span className="text-xs text-slate-500 font-medium">جاري معالجة البيانات وتحميل أنواع الإجازات...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-sm text-slate-500">لا يوجد أنواع إجازات معرفة حالياً في النظام.</p>
          <p className="text-xs text-slate-400 mt-1">يمكنك إضافة أنواع إجازات مخصصة من خلال الضغط على زر "إضافة نوع إجازة".</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">اسم نوع الإجازة</th>
                <th className="px-4 py-3">الحد الأقصى (سنوياً)</th>
                <th className="px-4 py-3">الوصف والشروط المعتمدة</th>
                <th className="px-4 py-3 text-center">الحالة</th>
                <th className="px-4 py-3 text-left">التحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-slate-700">
              {records.map((r) => {
                const isEditing = editingId === r.id;
                const isPaused = r.status === 'متوقف مؤقتاً';
                return (
                  <tr key={r.id} className={`hover:bg-slate-50/50 transition-colors ${isPaused ? 'bg-slate-50/40 text-slate-400' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-white border border-slate-200 rounded p-1 text-xs w-full font-bold"
                        />
                      ) : (
                        <span className={isPaused ? 'line-through text-slate-400 font-normal' : ''}>{r.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editMaxDays}
                          onChange={(e) => setEditMaxDays(e.target.value)}
                          placeholder="غير محدد"
                          className="bg-white border border-slate-200 rounded p-1 text-xs w-20 text-center"
                        />
                      ) : (
                        r.maxDays ? `${r.maxDays} يوم` : 'مفتوح / غير محدد'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-sm truncate" title={r.description}>
                      {isEditing ? (
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="bg-white border border-slate-200 rounded p-1 text-xs w-full"
                          rows={1}
                        />
                      ) : (
                        r.description || 'لا يوجد وصف مضاف'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="bg-white border border-slate-200 rounded p-1 text-xs font-semibold"
                        >
                          <option value="فعال">فعال</option>
                          <option value="متوقف مؤقتاً">متوقف مؤقتاً</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isPaused ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                          {r.status || 'فعال'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left">
                      {isEditing ? (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(r.id)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 p-1.5 rounded-lg transition-colors"
                            title="حفظ"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors"
                            title="إلغاء"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5 justify-end items-center">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(r)}
                            className={`p-1.5 rounded-lg transition-colors border ${
                              isPaused 
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-100' 
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-100'
                            }`}
                            title={isPaused ? 'تفعيل نوع الإجازة' : 'إيقاف مؤقت'}
                          >
                            {isPaused ? <Play size={12} /> : <Pause size={12} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(r)}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-600 p-1.5 rounded-lg transition-colors border border-slate-200"
                            title="تعديل"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r.id, r.name)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition-colors border border-rose-100"
                            title="حذف"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden animate-scale-up">
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
                <Trash2 size={24} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-800">تأكيد الحذف</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  هل أنت متأكد من رغبتك في حذف نوع الإجازة <span className="font-bold text-slate-700">"{deleteConfirm.name}"</span>؟
                  لا يمكن التراجع عن هذا الإجراء وقد يؤثر على طلبات الإجازات المرتبطة في سجل الموظفين.
                </p>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex gap-3 justify-end border-t border-slate-100" dir="rtl">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition-all"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-sm"
              >
                نعم، احذف نوع الإجازة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
