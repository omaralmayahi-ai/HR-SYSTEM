import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, ShieldAlert, GripVertical, AlertTriangle, Scale, RotateCcw } from 'lucide-react';
import { notifySettingsChanged, applySavedOrder } from '@/lib/settingsUtils';

export default function PenaltyTypesSettings() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // New Form State
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDeductionType, setNewDeductionType] = useState('بدون قطع مالي');
  const [newDeductionValue, setNewDeductionValue] = useState('بدون قطع مالي');
  const [newDelayMonths, setNewDelayMonths] = useState(0);
  const [newDelayRule, setNewDelayRule] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState('فعال');

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDeductionType, setEditDeductionType] = useState('بدون قطع مالي');
  const [editDeductionValue, setEditDeductionValue] = useState('');
  const [editDelayMonths, setEditDelayMonths] = useState(0);
  const [editDelayRule, setEditDelayRule] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('فعال');

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });

  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.PenaltyType.list();
      let sortedData = applySavedOrder(data || [], 'PENALTY_TYPES_ORDER');
      setRecords(sortedData);
      
      // Cache in localStorage & notify application listeners
      localStorage.setItem('PENALTY_TYPES_PRESETS', JSON.stringify(sortedData));
      notifySettingsChanged('penalty_types', sortedData);
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: error.message || 'تعذر تحميل أنواع العقوبات الإدارية',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetLegal = async () => {
    if (!window.confirm('هل أنت أحدث بالتأكيد من إغلاق القائمة وتطبيق عقوبات المادة (8) الثماني الصحيحة وفق قانون انضباط موظفي الدولة رقم 14 لسنة 1991؟')) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/penalty-types/reset-legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('فشل إعادة ضبط العقوبات القانونية');
      const data = await res.json();
      setRecords(data || []);
      localStorage.removeItem('PENALTY_TYPES_ORDER');
      localStorage.setItem('PENALTY_TYPES_PRESETS', JSON.stringify(data));
      notifySettingsChanged('penalty_types', data);
      toast({
        title: 'تم استعادة العقوبات القانونية (المادة 8)',
        description: 'تم تثبيت العقوبات الثماني القانونية الصحيحة بنص المادة 8 من قانون انضباط موظفي الدولة',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'خطأ في الاستعادة',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDraggedOverIndex(index);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDraggedOverIndex(null);
      return;
    }

    const nextRecords = [...records];
    const [removed] = nextRecords.splice(draggedIndex, 1);
    nextRecords.splice(targetIndex, 0, removed);
    setRecords(nextRecords);

    // Save order
    localStorage.setItem('PENALTY_TYPES_ORDER', JSON.stringify(nextRecords.map(r => r.id)));
    localStorage.setItem('PENALTY_TYPES_PRESETS', JSON.stringify(nextRecords));
    notifySettingsChanged('penalty_types', nextRecords);

    setDraggedIndex(null);
    setDraggedOverIndex(null);

    toast({
      title: 'تم إعادة الترتيب',
      description: 'تم تحديث ترتيب أنواع العقوبات بنجاح',
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast({
        title: 'تنبيه',
        description: 'يرجى إدخال اسم العقوبة الإدارية',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: newName.trim(),
        deductionType: newDeductionType,
        deductionValue: newDeductionValue.trim() || '—',
        delayMonths: parseInt(newDelayMonths) || 0,
        delayRule: newDelayRule.trim() || `${newDelayMonths} أشهر`,
        description: newDescription.trim(),
        status: newStatus,
      };
      await apiClient.entities.PenaltyType.create(payload);
      toast({
        title: 'تمت الإضافة بنجاح',
        description: `تمت إضافة نوع العقوبة "${newName}" وإدراجها بالنظام`,
        variant: 'success',
      });
      setNewName('');
      setNewDeductionType('بدون قطع مالي');
      setNewDeductionValue('بدون قطع مالي');
      setNewDelayMonths(0);
      setNewDelayRule('');
      setNewDescription('');
      setNewStatus('فعال');
      setAdding(false);
      fetchRecords();

      await apiClient.logs.create({
        action: 'تعديل أنواع العقوبات',
        details: `إضافة نوع عقوبة إدارية جديد: (${newName})`
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
    setEditDeductionType(record.deduction_type || record.deductionType || 'بدون قطع مالي');
    setEditDeductionValue(record.deduction_value || record.deductionValue || '');
    setEditDelayMonths(record.delay_months || record.delayMonths || 0);
    setEditDelayRule(record.delay_rule || record.delayRule || '');
    setEditDescription(record.description || '');
    setEditStatus(record.status || 'فعال');
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) {
      toast({
        title: 'تنبيه',
        description: 'اسم العقوبة مطلوب',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: editName.trim(),
        deductionType: editDeductionType,
        deductionValue: editDeductionValue.trim() || '—',
        delayMonths: parseInt(editDelayMonths) || 0,
        delayRule: editDelayRule.trim() || `${editDelayMonths} أشهر`,
        description: editDescription.trim(),
        status: editStatus,
      };
      await apiClient.entities.PenaltyType.update(id, payload);
      toast({
        title: 'تم التحديث بنجاح',
        description: `تم تحديث بيانات العقوبة الإدارية "${editName}"`,
        variant: 'success',
      });
      setEditingId(null);
      fetchRecords();

      await apiClient.logs.create({
        action: 'تعديل أنواع العقوبات',
        details: `تحديث نوع العقوبة الإدارية ID: ${id} (${editName})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء التحديث',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await apiClient.entities.PenaltyType.delete(deleteConfirm.id);
      toast({
        title: 'تم الحذف بنجاح',
        description: `تم حذف نوع العقوبة "${deleteConfirm.name}" من النظام`,
        variant: 'success',
      });
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchRecords();

      await apiClient.logs.create({
        action: 'حذف نوع عقوبة',
        details: `حذف نوع العقوبة الإدارية (${deleteConfirm.name})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحذف',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Info & Legal Reference Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-700 shrink-0">
              <ShieldAlert size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-800">إدارة أنواع العقوبات الإدارية</h2>
                <span className="bg-rose-100 text-rose-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-rose-200">
                  <Scale size={12} />
                  المادة 8 - قانون 14 لسنة 1991
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                تحديد وحفظ كافة العقوبات المعتمدة بالمنظومة وفقاً لقانون انضباط موظفي الدولة والقطاع العام رقم (14) لسنة 1991 المعدل.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleResetLegal}
              disabled={loading}
              className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="إعادة تطبيق العقوبات الثماني القانونية الصحيحة وفق المادة 8"
            >
              <RotateCcw size={14} className="text-amber-700" />
              <span>استعادة العقوبات القانونية (المادة 8)</span>
            </button>

            <button
              onClick={fetchRecords}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5 text-xs font-bold"
              title="تحديث البيانات"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>تحديث</span>
            </button>

            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
              >
                <Plus size={16} />
                <span>إضافة نوع عقوبة جديد</span>
              </button>
            )}
          </div>
        </div>

        {/* Article 8 Explanatory Summary Bar */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-700 leading-relaxed grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span><strong>1. لفت النظر:</strong> 3 أشهر تأخير</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
            <span><strong>2. الإنذار:</strong> 6 أشهر تأخير</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
            <span><strong>3. قطع الراتب:</strong> حتى 10 أيام (5 أشهر/شهر لكل يوم)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0"></span>
            <span><strong>4. التوبيخ:</strong> 12 شهر (سنة)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
            <span><strong>5. إنقاص الراتب:</strong> %10 بحد أقصى (24 شهر)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></span>
            <span><strong>6. تنزيل الدرجة:</strong> إعانة بعد 3 سنوات</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0"></span>
            <span><strong>7. الفصل:</strong> إبعاد من 1 إلى 3 سنوات</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-700 shrink-0"></span>
            <span><strong>8. العزل:</strong> تنحية نهائية عن الوظيفة</span>
          </div>
        </div>
      </div>

      {/* Add New Record Form */}
      {adding && (
        <form onSubmit={handleAdd} className="bg-rose-50/60 border border-rose-200/80 p-5 rounded-2xl space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-rose-100 pb-3">
            <span className="text-xs font-black text-rose-900 flex items-center gap-1.5">
              <Plus size={15} className="text-rose-700" />
              إضافة نوع عقوبة إدارية جديد
            </span>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم العقوبة *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: لفت النظر، الإنذار، قطع الراتب"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع القطع المالي</label>
              <select
                value={newDeductionType}
                onChange={(e) => {
                  setNewDeductionType(e.target.value);
                  if (e.target.value === 'بدون قطع مالي') setNewDeductionValue('بدون قطع مالي');
                  else if (e.target.value === 'حسم القسط اليومي') setNewDeductionValue('حتى 10 أيام كحد أقصى');
                  else if (e.target.value === 'نسبة مئوية %') setNewDeductionValue('نسبة لا تتجاوز 10% (لمدة 6 أشهر - سنتين)');
                  else setNewDeductionValue('لا ينطبق');
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              >
                <option value="بدون قطع مالي">بدون قطع مالي</option>
                <option value="حسم القسط اليومي">حسم القسط اليومي (أيام)</option>
                <option value="نسبة مئوية %">نسبة مئوية % (من الراتب الشهري)</option>
                <option value="لا ينطبق (تأثير وظيفي)">لا ينطبق (تأثير وظيفي / تنزيل درجة)</option>
                <option value="لا ينطبق (إبعاد مؤقت)">لا ينطبق (إبعاد مؤقت / فصل)</option>
                <option value="لا ينطبق (نهائي)">لا ينطبق (تنحية نهائية / عزل)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تفاصيل وقيمة القطع المالي</label>
              <input
                type="text"
                value={newDeductionValue}
                onChange={(e) => setNewDeductionValue(e.target.value)}
                placeholder="مثال: حتى 10 أيام كحد أقصى، أو %10"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تأخير الترفيع (أشهر - رقمي)</label>
              <input
                type="number"
                min="0"
                value={newDelayMonths}
                onChange={(e) => setNewDelayMonths(e.target.value)}
                placeholder="عدد الأشهر"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">قاعدة ووصف تأخير الترفيع (نصياً)</label>
              <input
                type="text"
                value={newDelayRule}
                onChange={(e) => setNewDelayRule(e.target.value)}
                placeholder="مثال: 3 أشهر، أو حالتان: ≤ 5 أيام ← 5 أشهر | > 5 أيام ← شهر لكل يوم"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">الوصف والتأثير القانوني (نص المادة 8)</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="شرح نص المادة 8 القانونية..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-rose-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">الحالة الإدارية:</span>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
              >
                <option value="فعال">فعال</option>
                <option value="غير فعال">غير فعال (معطل مؤقتاً)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white transition-colors shadow-xs"
              >
                حفظ نوع العقوبة
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Table Records */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-wider">
                <th className="p-3.5 w-12 text-center">#</th>
                <th className="p-3.5 min-w-[120px]">نوع العقوبة</th>
                <th className="p-3.5 min-w-[180px]">القطع المالي</th>
                <th className="p-3.5 min-w-[200px]">تأخير الترفيع/الزيادة</th>
                <th className="p-3.5 min-w-[280px]">الوصف والتأثير القانوني (المادة 8)</th>
                <th className="p-3.5 w-24">الحالة</th>
                <th className="p-3.5 text-center w-28">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    لا توجد أنواع عقوبات مسجلة حالياً. انقر على "استعادة العقوبات القانونية (المادة 8)" للبدء بالتثبيت التلقائي.
                  </td>
                </tr>
              ) : (
                records.map((record, index) => {
                  const isEditing = editingId === record.id;
                  const isDragged = draggedIndex === index;
                  const isDraggedOver = draggedOverIndex === index;

                  const dType = record.deduction_type || record.deductionType || 'بدون قطع مالي';
                  const dVal = record.deduction_value || record.deductionValue || (record.salary_deduction_days ? `${record.salary_deduction_days} أيام` : 'بدون قطع مالي');
                  const dRule = record.delay_rule || record.delayRule || (record.delay_months ? `${record.delay_months} أشهر` : '—');
                  const dMonths = record.delay_months || record.delayMonths || 0;

                  return (
                    <tr
                      key={record.id}
                      draggable={!isEditing}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`transition-colors ${
                        isEditing ? 'bg-amber-50/50' : 'hover:bg-slate-50/80'
                      } ${isDragged ? 'opacity-40 bg-slate-100' : ''} ${
                        isDraggedOver ? 'border-t-2 border-t-rose-600 bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="p-3.5 text-center text-slate-400 font-mono">
                        <div className="flex items-center justify-center gap-1">
                          <GripVertical size={14} className="cursor-grab text-slate-300 hover:text-slate-600 shrink-0" />
                          <span>{index + 1}</span>
                        </div>
                      </td>

                      {isEditing ? (
                        <>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
                            />
                          </td>
                          <td className="p-2 space-y-1">
                            <select
                              value={editDeductionType}
                              onChange={(e) => setEditDeductionType(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800"
                            >
                              <option value="بدون قطع مالي">بدون قطع مالي</option>
                              <option value="حسم القسط اليومي">حسم القسط اليومي</option>
                              <option value="نسبة مئوية %">نسبة مئوية %</option>
                              <option value="لا ينطبق (تأثير وظيفي)">لا ينطبق (تأثير وظيفي)</option>
                              <option value="لا ينطبق (إبعاد مؤقت)">لا ينطبق (إبعاد مؤقت)</option>
                              <option value="لا ينطبق (نهائي)">لا ينطبق (نهائي)</option>
                            </select>
                            <input
                              type="text"
                              value={editDeductionValue}
                              onChange={(e) => setEditDeductionValue(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800"
                              placeholder="القيمة"
                            />
                          </td>
                          <td className="p-2 space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-500 shrink-0">أشهر:</span>
                              <input
                                type="number"
                                min="0"
                                value={editDelayMonths}
                                onChange={(e) => setEditDelayMonths(e.target.value)}
                                className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800"
                              />
                            </div>
                            <input
                              type="text"
                              value={editDelayRule}
                              onChange={(e) => setEditDelayRule(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800"
                              placeholder="القاعدة النصية"
                            />
                          </td>
                          <td className="p-2">
                            <textarea
                              rows={2}
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value)}
                              className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
                            >
                              <option value="فعال">فعال</option>
                              <option value="غير فعال">غير فعال</option>
                            </select>
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleSaveEdit(record.id)}
                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                                title="حفظ"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold"
                                title="إلغاء"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3.5 font-bold text-rose-950">
                            <div className="flex items-center gap-1.5">
                              <span>{record.name}</span>
                              {record.name === 'العزل' && (
                                <span className="bg-red-100 text-red-800 text-[10px] font-black px-1.5 py-0.2 rounded">نهائي</span>
                              )}
                            </div>
                          </td>

                          <td className="p-3.5">
                            <div className="space-y-0.5">
                              <span className="text-[11px] font-bold text-slate-800 block">{dType}</span>
                              <span className="text-xs text-rose-700 font-mono font-medium block">{dVal}</span>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <div className="space-y-0.5">
                              {dMonths > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold font-mono text-[11px] mb-0.5">
                                  {dMonths} أشهر
                                </span>
                              )}
                              <span className="text-xs text-slate-700 font-bold block">{dRule}</span>
                            </div>
                          </td>

                          <td className="p-3.5 text-slate-600 text-xs leading-relaxed">
                            {record.description || '—'}
                          </td>

                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                record.status === 'فعال'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  record.status === 'فعال' ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                              {record.status || 'فعال'}
                            </span>
                          </td>

                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleStartEdit(record)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="تعديل"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm({ isOpen: true, id: record.id, name: record.name })}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="حذف"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Modal Dialog */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl border border-slate-100 text-right" dir="rtl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <h3 className="font-bold text-slate-800 text-sm">تأكيد حذف نوع العقوبة</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              هل أنت أحدث بالتأكيد من رغبتك في حذف نوع العقوبة <span className="font-bold text-rose-900">"{deleteConfirm.name}"</span>؟ لن يتاح هذا الخيار مستقبلاً في قائمة العقوبات الإدارية.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
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
