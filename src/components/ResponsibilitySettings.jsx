import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Sparkles, ShieldAlert, GripVertical } from 'lucide-react';
import { notifySettingsChanged } from '@/lib/settingsUtils';

export default function ResponsibilitySettings() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // New Form State
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAllowanceRate, setNewAllowanceRate] = useState(0);

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAllowanceRate, setEditAllowanceRate] = useState(0);
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
      const data = await apiClient.entities.ResponsibilityAllowance.list();
      let sortedData = data || [];
      const savedOrder = localStorage.getItem('RESPONSIBILITY_ALLOWANCES_ORDER');
      if (savedOrder) {
        try {
          const orderIds = JSON.parse(savedOrder);
          sortedData = [...sortedData].sort((a, b) => {
            const indexA = orderIds.indexOf(a.id);
            const indexB = orderIds.indexOf(b.id);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          });
        } catch (e) {
          console.error('Error parsing RESPONSIBILITY_ALLOWANCES_ORDER:', e);
        }
      }
      setRecords(sortedData);
      
      // Update local storage for immediate consumption in salary calculations
      localStorage.setItem('RESPONSIBILITY_ALLOWANCES_PRESETS', JSON.stringify(sortedData));
      notifySettingsChanged('responsibility_allowances', sortedData);
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: error.message || 'تعذر تحميل إعدادات مخصصات المسؤولية',
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

    // Persist to localStorage
    localStorage.setItem('RESPONSIBILITY_ALLOWANCES_ORDER', JSON.stringify(nextRecords.map(r => r.id)));
    localStorage.setItem('RESPONSIBILITY_ALLOWANCES_PRESETS', JSON.stringify(nextRecords));
    notifySettingsChanged('responsibility_allowances', nextRecords);

    setDraggedIndex(null);
    setDraggedOverIndex(null);

    toast({
      title: 'تم إعادة الترتيب',
      description: 'تم تحديث ترتيب مخصصات المسؤولية بنجاح',
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast({
        title: 'تنبيه',
        description: 'يرجى إدخال اسم المسؤولية / المنصب',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: newName,
        allowance_rate: parseInt(newAllowanceRate) || 0,
      };
      await apiClient.entities.ResponsibilityAllowance.create(payload);
      toast({
        title: 'تمت الإضافة',
        description: `تمت إضافة المسؤولية "${newName}" بنجاح`,
        variant: 'success',
      });
      setNewName('');
      setNewAllowanceRate(0);
      setAdding(false);
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل مخصصات المسؤولية',
        details: `إضافة مسؤولية جديدة (${newName} - مخصص المنصب: ${newAllowanceRate}%)`
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
    setEditAllowanceRate(record.allowance_rate || record.allowanceRate || 0);
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) {
      toast({
        title: 'تنبيه',
        description: 'يرجى إدخال اسم المسؤولية / المنصب',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: editName,
        allowance_rate: parseInt(editAllowanceRate) || 0,
      };
      await apiClient.entities.ResponsibilityAllowance.update(id, payload);
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث مخصص المسؤولية بنجاح',
        variant: 'success',
      });
      setEditingId(null);
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تحديث مخصص المسؤولية',
        details: `تحديث المسؤولية (${editName} - مخصص المنصب الجديد: ${editAllowanceRate}%)`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء التحديث',
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
      await apiClient.entities.ResponsibilityAllowance.delete(id);
      toast({
        title: 'تم الحذف',
        description: `تم حذف مخصص المسؤولية "${name}" بنجاح`,
        variant: 'success',
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'حذف مخصص المسؤولية',
        details: `حذف المسؤولية والمنصب (${name})`
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
    <div className="space-y-6">
      {/* Upper header with info */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="text-[#1B3A6B]" size={22} />
            إعدادات مخصصات المسؤولية والمنصب الوظيفي
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            تعريف المسميات الوظيفية للمسؤولية والمناصب القيادية وتحديد النسبة المئوية المخصصة لكل منها من الراتب الاسمي.
          </p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold rounded-xl px-4 py-2.5 text-xs flex items-center gap-1.5 transition-all shadow-sm"
        >
          {adding ? <X size={14} /> : <Plus size={14} />}
          {adding ? 'إلغاء الأمر' : 'إضافة مسؤولية جديدة'}
        </button>
      </div>

      {/* Adding Form */}
      {adding && (
        <form onSubmit={handleAdd} className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">اسم المسؤولية / المنصب *</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: معاون مدير عام، رئيس قسم، مسؤول شعبة"
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">نسبة مخصص المنصب والمسؤولية (%) *</label>
              <input
                type="number"
                required
                min="0"
                max="150"
                value={newAllowanceRate}
                onChange={(e) => setNewAllowanceRate(parseInt(e.target.value) || 0)}
                placeholder="مثال: 25 تعني 25%"
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold rounded-xl px-4 py-2 text-xs transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold rounded-xl px-5 py-2 text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Check size={14} />
              حفظ المسؤولية
            </button>
          </div>
        </form>
      )}

      {/* Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="animate-spin text-[#1B3A6B]" size={26} />
            <span className="text-xs text-slate-500">جاري تحميل مخصصات المسؤولية والمنصب من النظام...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <ShieldAlert size={22} />
            </div>
            <p className="text-xs font-bold text-slate-600">لا توجد مخصصات مسؤولية معرفة حالياً.</p>
            <p className="text-[10px] text-slate-400 mt-1">انقر على زر "إضافة مسؤولية جديدة" للبدء.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-4 text-center w-10">ترتيب</th>
                  <th className="px-6 py-4">اسم المسؤولية / المنصب القيادي</th>
                  <th className="px-6 py-4">نسبة مخصص المنصب والمسؤولية</th>
                  <th className="px-6 py-4">حالة الاحتساب المالي</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-slate-700">
                {records.map((rec, idx) => {
                  const isEditing = editingId === rec.id;
                  const rateVal = rec.allowance_rate !== undefined ? rec.allowance_rate : (rec.allowanceRate !== undefined ? rec.allowanceRate : 0);
                  
                  return (
                    <tr 
                      key={rec.id} 
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      className={`hover:bg-slate-50/40 transition-all ${
                        draggedOverIndex === idx ? 'border-t-2 border-dashed border-[#1B3A6B] bg-[#1B3A6B]/5' : ''
                      }`}
                    >
                      <td className="px-3 py-4 text-center text-slate-400 cursor-grab active:cursor-grabbing hover:text-slate-600 transition-colors">
                        <GripVertical size={14} className="inline animate-pulse" />
                      </td>
                      {/* Name column */}
                      <td className="px-6 py-4 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#1B3A6B]/20"
                          />
                        ) : (
                          <span className="font-bold text-slate-800 text-sm">{rec.name}</span>
                        )}
                      </td>

                      {/* Allowance Rate Column */}
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max="150"
                              value={editAllowanceRate}
                              onChange={(e) => setEditAllowanceRate(parseInt(e.target.value) || 0)}
                              className="w-24 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#1B3A6B]/20"
                            />
                            <span className="font-bold text-slate-500">%</span>
                          </div>
                        ) : (
                          <span className="font-mono font-bold text-slate-800 text-sm bg-slate-50 px-2.5 py-1 rounded-md border border-slate-150">
                            {rateVal}%
                          </span>
                        )}
                      </td>

                      {/* Status / Percentage Indicator */}
                      <td className="px-6 py-4">
                        {rateVal > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                            <Sparkles size={11} className="animate-pulse" />
                            مشمول بمخصص {rateVal}% من الاسمي
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[11px] font-medium text-slate-400 bg-slate-50 border border-slate-150 rounded-full px-2.5 py-1">
                            بلا مخصص مالي إضافي
                          </span>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(rec.id)}
                                className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 flex items-center justify-center transition-colors shadow-sm"
                                title="حفظ التعديلات"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="w-8 h-8 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 flex items-center justify-center transition-colors shadow-sm"
                                title="إلغاء"
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartEdit(rec)}
                                className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 flex items-center justify-center transition-colors shadow-sm"
                                title="تعديل المسؤولية والمخصص"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete(rec.id, rec.name)}
                                className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 flex items-center justify-center transition-colors shadow-sm"
                                title="حذف مخصص المسؤولية"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                  هل أنت متأكد من رغبتك في حذف مخصص المسؤولية والمنصب <span className="font-bold text-slate-700">"{deleteConfirm.name}"</span>؟
                  لا يمكن التراجع عن هذا الإجراء وسيتم إزالته بالكامل من سجلات النظام.
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
                نعم، احذف المخصص
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
