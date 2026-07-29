import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Clock, Calendar, AlertCircle, Info, Sparkles } from 'lucide-react';
import { notifySettingsChanged } from '@/lib/settingsUtils';

export default function ShiftSystemsSettings() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Form states for creating / editing
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form Fields
  const [formData, setFormData] = useState({
    name: '',
    work_days: 1,
    rest_days: 3,
    shift_hours_type: '24h',
    daily_hours: 24,
    description: ''
  });

  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });

  const DEFAULT_TEMPLATES = [
    {
      name: 'مناوبة 1*3 (24 ساعة)',
      work_days: 1,
      rest_days: 3,
      shift_hours_type: '24h',
      daily_hours: 24,
      description: 'دوام يوم واحد كامل (24 ساعة متواصلة) تعقبه استراحة لمدة 3 أيام (72 ساعة).'
    },
    {
      name: 'مناوبة 2*6 (24 ساعة)',
      work_days: 2,
      rest_days: 6,
      shift_hours_type: '24h',
      daily_hours: 24,
      description: 'دوام يومين متتاليين (24 ساعة يومياً) تعقبهما استراحة 6 أيام.'
    },
    {
      name: 'مناوبة 7*7 (يوم كامل)',
      work_days: 7,
      rest_days: 7,
      shift_hours_type: '24h',
      daily_hours: 24,
      description: 'دوام لمدة 7 أيام متتالية في الموقع الميداني تعقبها استراحة 7 أيام.'
    },
    {
      name: 'مناوبة 4*4 (تناوبي 12 ساعة)',
      work_days: 4,
      rest_days: 4,
      shift_hours_type: 'rotational',
      daily_hours: 12,
      description: 'حضور 12 ساعة صباحاً في اليوم الأول والثاني، و12 ساعة مساءً في اليوم الثالث والرابع، تعقبها 4 أيام استراحة.'
    }
  ];

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.ShiftSystem.list();
      setRecords(data || []);
      notifySettingsChanged('shift_systems', data || []);
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: error.message || 'تعذر تحميل أنظمة المناوبة',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      work_days: 1,
      rest_days: 3,
      shift_hours_type: '24h',
      daily_hours: 24,
      description: ''
    });
    setAdding(false);
    setEditingId(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setAdding(true);
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setFormData({
      name: item.name || '',
      work_days: item.work_days ?? item.workDays ?? 1,
      rest_days: item.rest_days ?? item.restDays ?? 3,
      shift_hours_type: item.shift_hours_type ?? item.shiftHoursType ?? '24h',
      daily_hours: item.daily_hours ?? item.dailyHours ?? 24,
      description: item.description || ''
    });
    setAdding(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: 'تنبيه',
        description: 'يرجى إدخال اسم نظام المناوبة',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (editingId) {
        await apiClient.entities.ShiftSystem.update(editingId, formData);
        toast({
          title: 'تم التحديث',
          description: `تم تحديث نظام المناوبة "${formData.name}" بنجاح`,
          variant: 'success',
        });
      } else {
        await apiClient.entities.ShiftSystem.create(formData);
        toast({
          title: 'تمت الإضافة',
          description: `تمت إضافة نظام المناوبة "${formData.name}" بنجاح`,
          variant: 'success',
        });
      }
      resetForm();
      fetchRecords();
    } catch (error) {
      toast({
        title: 'خطأ في الحفظ',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.entities.ShiftSystem.delete(id);
      toast({
        title: 'تم الحذف',
        description: 'تم حذف نظام المناوبة بنجاح',
        variant: 'success',
      });
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchRecords();
    } catch (error) {
      toast({
        title: 'خطأ في الحذف',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSeedTemplates = async () => {
    setLoading(true);
    try {
      for (const tpl of DEFAULT_TEMPLATES) {
        await apiClient.entities.ShiftSystem.create(tpl);
      }
      toast({
        title: 'تم إضافة القوالب الافتراضية',
        description: 'تمت إضافة أنظمة المناوبة الأساسية بنجاح',
        variant: 'success',
      });
      fetchRecords();
    } catch (error) {
      toast({
        title: 'خطأ أثناء إضافة القوالب',
        description: error.message,
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-[#1B3A6B] to-slate-900 text-white p-6 rounded-2xl shadow-md border border-blue-800/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-blue-300" />
              <h3 className="text-lg font-black">إدارة أنظمة عمل المناوبة</h3>
            </div>
            <p className="text-xs text-blue-200/90 leading-relaxed max-w-2xl">
              تحديد وتوصيف أنظمة المناوبة المعتمدة وضبط اسم المناوبة، عدد أيام العمل والاستراحة، طبيعة وساعات العمل اليومية، وتفاصيل نمط الحضور والتبديل بالنوبة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {records.length === 0 && (
              <button
                type="button"
                onClick={handleSeedTemplates}
                className="bg-blue-500/30 hover:bg-blue-500/40 text-blue-100 border border-blue-400/30 rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 backdrop-blur-sm"
              >
                <Sparkles size={14} className="text-amber-300" />
                إدراج الأنماط الشائعة
              </button>
            )}
            <button
              type="button"
              onClick={handleStartAdd}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={15} />
              إضافة نظام مناوبة جديد
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Form Modal or Inline Card */}
      {(adding || editingId) && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border-2 border-blue-500/30 shadow-lg space-y-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Clock size={16} className="text-blue-600" />
              {editingId ? 'تعديل نظام المناوبة' : 'إضافة نظام مناوبة جديد'}
            </h4>
            <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. اسم المناوبة (إلزامي) */}
            <div className="md:col-span-1 lg:col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم المناوبة <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: مناوبة 1*3، مناوبة 7*7"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* 2. عدد أيام العمل (إلزامي) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                عدد أيام العمل <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.work_days}
                onChange={(e) => setFormData({ ...formData, work_days: parseInt(e.target.value) || 1 })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
              />
            </div>

            {/* 3. عدد أيام الاستراحة (إلزامي) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                عدد أيام الاستراحة <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                required
                value={formData.rest_days}
                onChange={(e) => setFormData({ ...formData, rest_days: parseInt(e.target.value) || 0 })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
              />
            </div>

            {/* 4. طبيعة ساعات العمل اليومية (إلزامي) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                طبيعة ساعات العمل اليومية <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.shift_hours_type}
                onChange={(e) => {
                  const val = e.target.value;
                  let defaultH = 24;
                  if (val === '12h' || val === 'rotational') defaultH = 12;
                  setFormData({ ...formData, shift_hours_type: val, daily_hours: defaultH });
                }}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="24h">دوام كامل 24 ساعة متواصلة</option>
                <option value="12h">ساعات محددة (12 ساعة/يوم)</option>
                <option value="rotational">مناوبة متناوبة (12h صباحاً ومساءً)</option>
                <option value="custom">ساعات مخصصة أخرى</option>
              </select>
            </div>

            {/* 5. عدد الساعات اليومية (إلزامي) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                عدد الساعات اليومية <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="24"
                required
                value={formData.daily_hours}
                onChange={(e) => setFormData({ ...formData, daily_hours: parseInt(e.target.value) || 24 })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
              />
            </div>

            {/* 6. تفاصيل نمط الحضور والتبديل بالنوبة (اختياري) */}
            <div className="col-span-full">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>تفاصيل نمط الحضور والتبديل بالنوبة</span>
                <span className="text-slate-400 font-normal text-[11px]">(اختياري)</span>
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="مثال: الحضور لمدة 12 ساعة في اليوم الأول واليوم الثاني صباحاً، ثم 12 ساعة في اليوم الثالث والرابع مساءً، ثم الذهاب إلى استراحة 4 أيام..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Check size={15} />
              {editingId ? 'حفظ التعديلات' : 'إضافة نظام المناوبة'}
            </button>
          </div>
        </form>
      )}

      {/* Systems List */}
      {loading ? (
        <div className="flex justify-center items-center py-12 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <Clock className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-600">لا توجد أنظمة مناوبة مثبتة حتى الآن</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            قم بإضافة نظام مناوبة جديد أو استعنزر "إدراج الأنماط الشائعة" لبناء قوالب سريعة لأنظمة 1*3 و 7*7 و 4*4.
          </p>
          <button
            type="button"
            onClick={handleSeedTemplates}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition-all"
          >
            <Sparkles size={14} />
            تثبيت الأنماط الافتراضية الآن
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {records.map((item) => {
            const wDays = item.work_days ?? item.workDays ?? 1;
            const rDays = item.rest_days ?? item.restDays ?? 3;
            const dHours = item.daily_hours ?? item.dailyHours ?? 24;
            const hType = item.shift_hours_type ?? item.shiftHoursType ?? '24h';

            const hTypeLabel = hType === 'rotational'
              ? 'مناوبة متناوبة (12h)'
              : hType === '12h'
              ? 'ساعات محددة (12h)'
              : hType === '24h'
              ? 'دوام كامل 24 ساعة'
              : 'ساعات مخصصة';

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-300 p-5 shadow-xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="inline-block bg-blue-50 text-blue-700 text-[10px] font-black px-2.5 py-0.5 rounded-md mb-1 border border-blue-100">
                        {wDays} أيام عمل * {rDays} استراحة
                      </span>
                      <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                        {item.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ isOpen: true, id: item.id, name: item.name })}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Summary badges */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                      <Calendar size={14} className="text-blue-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold">أيام العمل والاستراحة</p>
                        <p className="font-bold text-slate-800 text-[11px]">{wDays}d عمل / {rDays}d راحة</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                      <Clock size={14} className="text-blue-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold">طبيعة وساعات العمل</p>
                        <p className="font-bold text-slate-800 text-[11px]">
                          {dHours} ساعة/يوم ({hTypeLabel})
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description / Attendance Details */}
                  {item.description && (
                    <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/70 text-xs space-y-1">
                      <p className="text-[10px] text-blue-700 font-bold flex items-center gap-1">
                        <Info size={12} />
                        تفاصيل نمط الحضور والتبديل بالنوبة:
                      </p>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-50 rounded-xl">
                <AlertCircle size={22} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">تأكيد حذف نظام المناوبة</h4>
                <p className="text-xs text-slate-500 mt-0.5">هل أنت متأكد من حذف "{deleteConfirm.name}"؟</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm.id)}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
