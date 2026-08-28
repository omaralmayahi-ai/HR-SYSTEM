import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, GraduationCap, GripVertical, Award, Download } from 'lucide-react';
import { notifySettingsChanged } from '@/lib/settingsUtils';
import { useAuth } from '@/lib/AuthContext';

export default function EducationDegreesSettings() {
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
  const secondaryColor = appPublicSettings?.secondaryColor || '#C8960C';
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // New Form State
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIsHigher, setNewIsHigher] = useState(false);
  const [newAllowanceRate, setNewAllowanceRate] = useState(0);
  const [newHigherAllowanceRate, setNewHigherAllowanceRate] = useState(0);
  const [newBaselineGrade, setNewBaselineGrade] = useState(7);
  const [newBaselineStep, setNewBaselineStep] = useState(1);

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIsHigher, setEditIsHigher] = useState(false);
  const [editAllowanceRate, setEditAllowanceRate] = useState(0);
  const [editHigherAllowanceRate, setEditHigherAllowanceRate] = useState(0);
  const [editBaselineGrade, setEditBaselineGrade] = useState(7);
  const [editBaselineStep, setEditBaselineStep] = useState(1);
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
      const data = await apiClient.entities.EducationDegree.list();
      let sortedData = data || [];
      const savedOrder = localStorage.getItem('EDUCATION_DEGREES_ORDER');
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
          console.error('Error parsing EDUCATION_DEGREES_ORDER:', e);
        }
      }
      setRecords(sortedData);
      
      // Update local storage for immediate consumption in salary calculations
      localStorage.setItem('EDUCATION_DEGREES_PRESETS', JSON.stringify(sortedData));
      notifySettingsChanged('education_degrees', sortedData);
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: error.message || 'تعذر تحميل إعدادات الشهادات',
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
    localStorage.setItem('EDUCATION_DEGREES_ORDER', JSON.stringify(nextRecords.map(r => r.id)));
    localStorage.setItem('EDUCATION_DEGREES_PRESETS', JSON.stringify(nextRecords));
    notifySettingsChanged('education_degrees', nextRecords);

    setDraggedIndex(null);
    setDraggedOverIndex(null);

    toast({
      title: 'تم إعادة الترتيب',
      description: 'تم تحديث ترتيب الشهادات بنجاح',
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast({
        title: 'خطأ في الإدخال',
        description: 'يرجى كتابة اسم الشهادة الدراسية',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: newName,
        is_higher_education: newIsHigher,
        allowance_rate: parseInt(newAllowanceRate) || 0,
        higher_allowance_rate: newIsHigher ? (parseInt(newHigherAllowanceRate) || 0) : 0,
        baseline_grade: parseInt(newBaselineGrade) || 7,
        baseline_step: parseInt(newBaselineStep) || 1,
      };
      await apiClient.entities.EducationDegree.create(payload);
      toast({
        title: 'تمت الإضافة',
        description: `تمت إضافة شهادة "${newName}" بنجاح`,
        variant: 'success',
      });
      setNewName('');
      setNewIsHigher(false);
      setNewAllowanceRate(0);
      setNewHigherAllowanceRate(0);
      setNewBaselineGrade(7);
      setNewBaselineStep(1);
      setAdding(false);
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل مخصصات الشهادات',
        details: `إضافة شهادة جديدة (${newName} - مخصص: ${newAllowanceRate}%، شهادة عليا: ${newIsHigher ? 'نعم' : 'لا'}، مخصص عليا: ${newHigherAllowanceRate}%)`
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
    setEditIsHigher(record.is_higher_education || record.isHigherEducation || false);
    setEditAllowanceRate(record.allowance_rate || record.allowanceRate || 0);
    setEditHigherAllowanceRate(record.higher_allowance_rate || record.higherAllowanceRate || 0);
    setEditBaselineGrade(record.baseline_grade || record.baselineGrade || 7);
    setEditBaselineStep(record.baseline_step || record.baselineStep || 1);
  };

  const handleSaveEdit = async (id) => {
    try {
      const payload = {
        name: editName,
        is_higher_education: editIsHigher,
        allowance_rate: parseInt(editAllowanceRate) || 0,
        higher_allowance_rate: editIsHigher ? (parseInt(editHigherAllowanceRate) || 0) : 0,
        baseline_grade: parseInt(editBaselineGrade) || 7,
        baseline_step: parseInt(editBaselineStep) || 1,
      };
      await apiClient.entities.EducationDegree.update(id, payload);
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث الشهادة ومخصصاتها بنجاح',
        variant: 'success',
      });
      setEditingId(null);
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل مخصصات الشهادات',
        details: `تحديث مخصصات شهادة (${editName} - مخصص: ${editAllowanceRate}%، شهادة عليا: ${editIsHigher ? 'نعم' : 'لا'}، مخصص عليا: ${editHigherAllowanceRate}%)`
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
      await apiClient.entities.EducationDegree.delete(id);
      toast({
        title: 'تم الحذف',
        description: `تم حذف شهادة "${name}" بنجاح`,
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل مخصصات الشهادات',
        details: `حذف شهادة من النظام (${name})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحذف',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Quick update higher degree allowance rate
  const handleQuickUpdateHigherRate = async (id, newRate) => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    const val = parseInt(newRate);
    if (isNaN(val) || val < 0) return;

    try {
      const payload = {
        name: record.name,
        is_higher_education: true,
        allowance_rate: record.allowance_rate || record.allowanceRate || 0,
        higher_allowance_rate: val,
        baseline_grade: record.baseline_grade || record.baselineGrade || 7,
        baseline_step: record.baseline_step || record.baselineStep || 1,
      };
      await apiClient.entities.EducationDegree.update(id, payload);
      toast({
        title: 'تم تثبيت وتعديل مخصص الشهادة العليا',
        description: `تم تحديث مخصص الشهادة العليا لـ "${record.name}" إلى ${val}% بنجاح`,
        variant: 'success',
      });
      fetchRecords();

      await apiClient.logs.create({
        action: 'تعديل مخصص الشهادة العليا',
        details: `تعديل مخصص الشهادة العليا لـ (${record.name}) إلى ${val}%`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء التحديث',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Seeding Standard Presets compliant with Iraq Civil Service / Salary scale 2023 norms
  const handleLoadStandardPresets = async () => {
    if (!window.confirm('هل تريد استيراد مخصصات الشهادات الدراسية القياسية في العراق؟ سيتم تفعيل مخصص الشهادة ومخصص الشهادة العليا وتسكين الدرجات تلقائياً.')) return;
    setLoading(true);
    try {
      const presets = [
        { name: 'دون الابتدائية', is_higher_education: false, allowance_rate: 0, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1 },
        { name: 'ابتدائية', is_higher_education: false, allowance_rate: 10, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1 },
        { name: 'متوسطة', is_higher_education: false, allowance_rate: 15, higher_allowance_rate: 0, baseline_grade: 9, baseline_step: 1 },
        { name: 'إعدادية', is_higher_education: false, allowance_rate: 25, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1 },
        { name: 'دبلوم', is_higher_education: false, allowance_rate: 35, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1 },
        { name: 'بكالوريوس', is_higher_education: false, allowance_rate: 45, higher_allowance_rate: 0, baseline_grade: 7, baseline_step: 1 },
        { name: 'دبلوم عالي', is_higher_education: true, allowance_rate: 60, higher_allowance_rate: 35, baseline_grade: 7, baseline_step: 1 },
        { name: 'ماجستير', is_higher_education: true, allowance_rate: 75, higher_allowance_rate: 50, baseline_grade: 6, baseline_step: 1 },
        { name: 'دكتوراه', is_higher_education: true, allowance_rate: 75, higher_allowance_rate: 50, baseline_grade: 5, baseline_step: 1 },
      ];

      for (const item of presets) {
        await apiClient.entities.EducationDegree.create(item);
      }

      toast({
        title: 'تم استيراد الشهادات والمخصصات',
        description: 'تمت تعبئة مخصصات الشهادات الدراسية والشهادات العليا بنجاح.',
        variant: 'success',
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعبئة الشهادات الأساسية',
        details: 'تعبئة مخصصات الشهادات والشهادات العليا الافتراضية وفق قانون رواتب الخدمة المدنية'
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
          <h2 className="text-lg font-bold text-slate-800">إعدادات الشهادات والمخصصات العلمية</h2>
          <p className="text-xs text-slate-500 mt-1">تعريف الشهادات الدراسية ونسبة المخصصات المالية الخاصة بكل منها ومخصص الشهادات العليا المضافة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLoadStandardPresets}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl px-3 py-2.5 text-xs transition-all flex items-center gap-1.5"
            title="استيراد المخصصات والشهادات القياسية في العراق"
          >
            <Download size={14} className="text-violet-600" />
            استيراد المخصصات القياسية
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} />
            إضافة شهادة جديدة
          </button>
        </div>
      </div>

      {/* Higher Degree Allowances Dedicated Management Card */}
      <div 
        className="border rounded-2xl p-5 space-y-4 transition-all"
        style={{
          backgroundColor: `${primaryColor}06`,
          borderColor: `${primaryColor}25`
        }}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div 
              className="p-2 text-white rounded-xl shadow-xs"
              style={{ backgroundColor: primaryColor }}
            >
              <Award size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                تثبيت وتعديل مخصصات الشهادة العليا
                <span 
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold border"
                  style={{
                    backgroundColor: `${secondaryColor}20`,
                    borderColor: `${secondaryColor}40`,
                    color: secondaryColor
                  }}
                >
                  مخصصات علمية إضافية
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مخصص الشهادة العليا هو مخصص علمي إضافي يُصرف فوق مخصص الشهادة الأساسي لحملة الشهادات العليا (دكتوراه، ماجستير، دبلوم عالي). يمكنك تثبيت وتعديل النسبة المحددة أدناه بسهولة.
              </p>
            </div>
          </div>
        </div>

        {/* Grid of Higher Education Degrees */}
        {records.filter(r => r.is_higher_education || r.isHigherEducation).length === 0 ? (
          <div className="text-center py-6 bg-white/60 rounded-xl border border-dashed border-violet-200">
            <p className="text-xs font-bold text-slate-600">لم يتم تحديد أي شهادة كـ "شهادة عليا" في القائمة أدناه حالياً.</p>
            <p className="text-[11px] text-slate-500 mt-1">
              انقر على "استيراد المخصصات القياسية" أعلاه أو حدد خيار "شهادة عليا" عند إضافة أو تعديل أي شهادة لتخصيص نسبة مخصص الشهادة العليا لها.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {records.filter(r => r.is_higher_education || r.isHigherEducation).map((degree) => {
              const primaryRate = degree.allowance_rate || degree.allowanceRate || 0;
              const higherRate = degree.higher_allowance_rate || degree.higherAllowanceRate || 0;
              const totalRate = primaryRate + higherRate;

              return (
                <div key={degree.id} className="bg-white rounded-xl border border-violet-200/80 p-3.5 shadow-xs hover:border-violet-300 transition-all space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <GraduationCap size={15} className="text-violet-600" />
                      {degree.name}
                    </span>
                    <span className="text-[10px] font-bold bg-violet-50 text-violet-700 px-2 py-0.5 rounded-md border border-violet-200">
                      شهادة عليا
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">المخصص الأساسي</span>
                      <span className="font-mono font-bold text-emerald-600">{primaryRate}%</span>
                    </div>
                    <div className="bg-violet-50/60 p-2 rounded-lg border border-violet-100">
                      <span className="text-[10px] text-violet-700 block font-semibold mb-0.5">مخصص الشهادة العليا</span>
                      <span className="font-mono font-bold text-violet-700">{higherRate}%</span>
                    </div>
                  </div>

                  {/* Quick Edit Higher Rate */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                    <span className="text-[11px] font-bold text-slate-600">تثبيت/تعديل مخصص العليا:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="150"
                        defaultValue={higherRate}
                        key={`quick-${degree.id}-${higherRate}`}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val !== higherRate) {
                            handleQuickUpdateHigherRate(degree.id, val);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val !== higherRate) {
                              handleQuickUpdateHigherRate(degree.id, val);
                            }
                          }
                        }}
                        className="w-16 bg-violet-50/50 border border-violet-300 rounded-lg py-1 px-2 text-center text-xs font-bold text-violet-900 focus:bg-white focus:ring-2 focus:ring-violet-500/20"
                        title="اضغط Enter أو انقر خارج المربع للحفظ والتثبيت"
                      />
                      <span className="text-xs font-bold text-violet-700">%</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/5 px-2.5 py-1.5 rounded-lg flex justify-between items-center text-[10px] font-bold text-slate-700">
                    <span>إجمالي المخصص العلمي الممنوح:</span>
                    <span className="font-mono text-xs text-[#1B3A6B]">{totalRate}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Adding Form */}
      {adding && (
        <form onSubmit={handleAdd} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 animate-fadeIn">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <GraduationCap className="text-[#1B3A6B]" size={18} />
            <h3 className="text-xs font-bold text-slate-700">تعريف شهادة ومخصصات جديدة</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-700 block">اسم الشهادة / التحصيل الدراسي</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: بكالوريوس، ماجستير، دكتوراه"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
                required
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">مخصص الشهادة الرئيسي (%)</label>
              <input
                type="number"
                min="0"
                max="150"
                value={newAllowanceRate}
                onChange={(e) => setNewAllowanceRate(parseInt(e.target.value) || 0)}
                placeholder="مثال: 45"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
              />
            </div>

            <div className="flex items-center gap-2 h-9">
              <input
                type="checkbox"
                id="newIsHigher"
                checked={newIsHigher}
                onChange={(e) => setNewIsHigher(e.target.checked)}
                className="w-4 h-4 text-[#1B3A6B] border-slate-300 rounded focus:ring-[#1B3A6B]"
              />
              <label htmlFor="newIsHigher" className="text-xs font-bold text-slate-700 cursor-pointer selection:bg-transparent">
                هل هي شهادة عليا؟
              </label>
            </div>

            {/* Baseline Grade & Step (Phase 5 / Scale 2023) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">درجة التعيين الأساس (1-10)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={newBaselineGrade}
                onChange={(e) => setNewBaselineGrade(parseInt(e.target.value) || 7)}
                placeholder="مثال: 7"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">المرحلة الأساس (1-11)</label>
              <input
                type="number"
                min="1"
                max="11"
                value={newBaselineStep}
                onChange={(e) => setNewBaselineStep(parseInt(e.target.value) || 1)}
                placeholder="مثال: 1"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
                required
              />
            </div>
          </div>

          {newIsHigher && (
            <div className="p-4 bg-violet-50/50 border border-violet-100 rounded-xl space-y-2 animate-fadeIn">
              <div className="max-w-xs space-y-1.5">
                <label className="text-xs font-bold text-violet-800 block">مخصص الشهادة العليا الإضافي (%)</label>
                <input
                  type="number"
                  min="0"
                  max="150"
                  value={newHigherAllowanceRate}
                  onChange={(e) => setNewHigherAllowanceRate(parseInt(e.target.value) || 0)}
                  placeholder="مثال: 50"
                  className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-violet-500/20 text-slate-800 font-medium"
                />
              </div>
              <p className="text-[10px] text-slate-500 font-medium">سيتم تمكين مخصص إضافي قدره {newHigherAllowanceRate}% عند تعيين موظف بهذه الشهادة العليا.</p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName('');
                setNewIsHigher(false);
                setNewAllowanceRate(0);
                setNewHigherAllowanceRate(0);
                setNewBaselineGrade(7);
                setNewBaselineStep(1);
              }}
              className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold rounded-xl px-4 py-2 text-xs transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold rounded-xl px-5 py-2 text-xs transition-colors"
            >
              حفظ الشهادة
            </button>
          </div>
        </form>
      )}

      {/* Main Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <RefreshCw className="animate-spin text-[#1B3A6B]" size={24} />
          <span className="text-xs text-slate-500 font-medium">جاري معالجة البيانات وتحميل إعدادات الشهادات...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <GraduationCap className="mx-auto text-slate-300 mb-3" size={40} />
          <p className="text-sm font-bold text-slate-600">لا يوجد شهادات معرفة حالياً في النظام.</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
            يمكنك إضافة شهادات دراسية جديدة ونسب مخصصاتها من خلال الضغط على زر "إضافة شهادة جديدة".
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="px-2 py-3 text-center w-10">ترتيب</th>
                <th className="px-4 py-3">اسم الشهادة الدراسية</th>
                <th className="px-4 py-3 text-center">نوع الشهادة</th>
                <th className="px-4 py-3 text-center">درجة/مرحلة الأساس</th>
                <th className="px-4 py-3 text-center">مخصص الشهادة الأساسي (%)</th>
                <th className="px-4 py-3 text-center">مخصص الشهادة العليا (%)</th>
                <th className="px-4 py-3 text-center">إجمالي المخصص العلمي (%)</th>
                <th className="px-4 py-3 text-left">التحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-slate-700">
              {records.map((r, idx) => {
                const isEditing = editingId === r.id;
                const isHigher = r.is_higher_education || r.isHigherEducation;
                const baseGrade = r.baseline_grade || r.baselineGrade || 7;
                const baseStep = r.baseline_step || r.baselineStep || 1;
                
                return (
                  <tr 
                    key={r.id ?? `degree-${idx}-${r.name || idx}`} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={`hover:bg-slate-50/50 transition-all ${
                      draggedOverIndex === idx ? 'border-t-2 border-dashed border-[#1B3A6B] bg-[#1B3A6B]/5' : ''
                    }`}
                  >
                    <td className="px-2 py-3 text-center text-slate-400 cursor-grab active:cursor-grabbing hover:text-slate-600 transition-colors">
                      <GripVertical size={14} className="inline animate-pulse" />
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs w-full font-bold text-slate-800"
                        />
                      ) : (
                        <span>{r.name}</span>
                      )}
                    </td>
                    
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <div className="flex justify-center items-center gap-1.5">
                          <input
                            type="checkbox"
                            id={`editIsHigher-${r.id}`}
                            checked={editIsHigher}
                            onChange={(e) => setEditIsHigher(e.target.checked)}
                            className="w-4 h-4 text-[#1B3A6B] border-slate-300 rounded"
                          />
                          <label htmlFor={`editIsHigher-${r.id}`} className="text-xs font-bold text-slate-600 cursor-pointer">
                            شهادة عليا
                          </label>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isHigher ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-slate-50 text-slate-600 border border-slate-200'
                        }`}>
                          {isHigher ? 'شهادة عليا' : 'اعتيادية'}
                        </span>
                      )}
                    </td>

                    {/* Baseline Grade & Step */}
                    <td className="px-4 py-3 text-center font-mono">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={editBaselineGrade}
                            onChange={(e) => setEditBaselineGrade(parseInt(e.target.value) || 7)}
                            className="bg-white border border-slate-200 rounded-lg p-1 text-xs w-10 text-center font-bold"
                            title="الدرجة الأساس"
                          />
                          <span>/</span>
                          <input
                            type="number"
                            min="1"
                            max="11"
                            value={editBaselineStep}
                            onChange={(e) => setEditBaselineStep(parseInt(e.target.value) || 1)}
                            className="bg-white border border-slate-200 rounded-lg p-1 text-xs w-10 text-center font-bold"
                            title="المرحلة الأساس"
                          />
                        </div>
                      ) : (
                        <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          د {baseGrade} / م {baseStep}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center font-mono font-bold text-emerald-600">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="150"
                            value={editAllowanceRate}
                            onChange={(e) => setEditAllowanceRate(parseInt(e.target.value) || 0)}
                            className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs w-16 text-center font-bold"
                          />
                          <span>%</span>
                        </div>
                      ) : (
                        <span>{r.allowance_rate || r.allowanceRate || 0}%</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center font-mono font-bold text-violet-600">
                      {isEditing ? (
                        editIsHigher ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="150"
                              value={editHigherAllowanceRate}
                              onChange={(e) => setEditHigherAllowanceRate(parseInt(e.target.value) || 0)}
                              className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs w-16 text-center font-bold"
                            />
                            <span>%</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )
                      ) : (
                        isHigher ? (
                          <span>{r.higher_allowance_rate || r.higherAllowanceRate || 0}%</span>
                        ) : (
                          <span className="text-slate-300 font-normal">-</span>
                        )
                      )}
                    </td>

                    <td className="px-4 py-3 text-center font-mono font-bold text-[#1B3A6B]">
                      {isEditing ? (
                        <span>
                          {(parseInt(editAllowanceRate) || 0) + (editIsHigher ? (parseInt(editHigherAllowanceRate) || 0) : 0)}%
                        </span>
                      ) : (
                        <span>
                          {(r.allowance_rate || r.allowanceRate || 0) + (isHigher ? (r.higher_allowance_rate || r.higherAllowanceRate || 0) : 0)}%
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
                  هل أنت متأكد من رغبتك في حذف شهادة <span className="font-bold text-slate-700">"{deleteConfirm.name}"</span>؟
                  لا يمكن التراجع عن هذا الإجراء وسيتم إزالتها بالكامل من سجلات النظام.
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
                نعم، احذف الشهادة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
