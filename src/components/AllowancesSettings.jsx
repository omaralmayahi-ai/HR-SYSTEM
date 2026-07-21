import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Play, Pause, TrendingUp, TrendingDown, Coins, GripVertical } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function AllowancesSettings() {
  const { setAppPublicSettings } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [maxChildrenCount, setMaxChildrenCount] = useState(4);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });

  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState(null);

  // Tab State: 'allowance' (المخصصات), 'deduction' (الاستقطاعات), 'all' (الكل)
  const [activeTypeTab, setActiveTypeTab] = useState('allowance');

  // New Form State
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('allowance'); // allowance or deduction
  const [newCalcType, setNewCalcType] = useState('percentage'); // percentage or flat
  const [newValue, setNewValue] = useState('');
  const [newStatus, setNewStatus] = useState('فعال');

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('allowance');
  const [editCalcType, setEditCalcType] = useState('percentage');
  const [editValue, setEditValue] = useState('');
  const [editStatus, setEditStatus] = useState('فعال');

  const handleTabChange = (tab) => {
    setActiveTypeTab(tab);
    if (tab === 'allowance' || tab === 'deduction') {
      setNewType(tab);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await apiClient.settings.get();
      if (data) {
        setMaxChildrenCount(data.maxChildrenCount !== undefined ? data.maxChildrenCount : (data.max_children_count !== undefined ? data.max_children_count : 4));
      }
    } catch (error) {
      console.error('Error fetching settings in AllowancesSettings:', error);
    }
  };

  const handleSaveMaxChildren = async () => {
    setSettingsSaving(true);
    try {
      const currentSettings = await apiClient.settings.get() || {};
      const payload = {
        ...currentSettings,
        maxChildrenCount: parseInt(maxChildrenCount) || 4,
      };

      const updated = await apiClient.settings.update(payload);
      setAppPublicSettings(updated);
      
      localStorage.setItem('SYSTEM_SETTINGS_PRESETS', JSON.stringify(updated));

      // Log action
      await apiClient.logs.create({
        action: 'تحديث الحد الأقصى للأطفال',
        details: `تحديث الحد الأقصى للأطفال المشمولين بالمخصص إلى: ${maxChildrenCount}`
      }).catch(() => {});

      toast({
        title: 'تم حفظ الإعدادات',
        description: 'تم تحديث العدد الأقصى للأطفال المشمولين بالمخصص بنجاح.',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error saving children count setting:', error);
      toast({
        title: 'خطأ أثناء الحفظ',
        description: error.message || 'فشل تحديث الحد الأقصى للأطفال',
        variant: 'destructive',
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.AllowanceDeduction.list();
      let sortedData = data || [];
      const savedOrder = localStorage.getItem('ALLOWANCES_DEDUCTIONS_ORDER');
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
          console.error('Error parsing ALLOWANCES_DEDUCTIONS_ORDER:', e);
        }
      }
      setRecords(sortedData);
      
      // Update local storage for immediate consumption in salary calculations
      localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(sortedData));
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: error.message || 'تعذر تحميل المخصصات والاستقطاعات',
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

    const itemDragged = filteredRecords[draggedIndex];
    const itemTarget = filteredRecords[targetIndex];
    if (!itemDragged || !itemTarget) return;

    const idxSource = records.findIndex(r => r.id === itemDragged.id);
    const idxTarget = records.findIndex(r => r.id === itemTarget.id);

    if (idxSource !== -1 && idxTarget !== -1) {
      const nextRecords = [...records];
      const [removed] = nextRecords.splice(idxSource, 1);
      nextRecords.splice(idxTarget, 0, removed);
      setRecords(nextRecords);
      
      // Persist to localStorage
      localStorage.setItem('ALLOWANCES_DEDUCTIONS_ORDER', JSON.stringify(nextRecords.map(r => r.id)));
      localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(nextRecords));
      
      toast({
        title: 'تم إعادة الترتيب',
        description: 'تم تحديث ترتيب المخصصات والاستقطاعات بنجاح',
      });
    }

    setDraggedIndex(null);
    setDraggedOverIndex(null);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName || !newValue) {
      toast({
        title: 'تنبيه',
        description: 'يرجى إدخال اسم المخصص/الاستقطاع وقيمته',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: newName,
        type: newType,
        calcType: newCalcType,
        value: parseInt(newValue),
        status: newStatus,
      };
      await apiClient.entities.AllowanceDeduction.create(payload);
      toast({
        title: 'تمت الإضافة',
        description: `تمت إضافة ${newName} بنجاح`,
        variant: 'success',
      });
      setNewName('');
      setNewValue('');
      setNewStatus('فعال');
      setAdding(false);
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل المخصصات والاستقطاعات',
        details: `إضافة بند مالي جديد (${newName} - النوع: ${newType === 'allowance' ? 'مخصصات' : 'استقطاع'}، طريقة الاحتساب: ${newCalcType === 'percentage' ? 'نسبة' : 'مقطوع'}، القيمة: ${newValue}، الحالة: ${newStatus})`
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
    setEditType(record.type);
    setEditCalcType(record.calcType);
    setEditValue(record.value);
    setEditStatus(record.status || 'فعال');
  };

  const handleSaveEdit = async (id) => {
    try {
      const payload = {
        name: editName,
        type: editType,
        calcType: editCalcType,
        value: parseInt(editValue),
        status: editStatus,
      };
      await apiClient.entities.AllowanceDeduction.update(id, payload);
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث البند بنجاح',
        variant: 'success',
      });
      setEditingId(null);
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل المخصصات والاستقطاعات',
        details: `تحديث بند مالي (${editName} - النوع: ${editType === 'allowance' ? 'مخصصات' : 'استقطاع'}، القيمة الجديدة: ${editValue}، الحالة: ${editStatus})`
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
      await apiClient.entities.AllowanceDeduction.update(record.id, {
        status: nextStatus
      });
      toast({
        title: 'تم تغيير الحالة',
        description: `تم تحويل حالة بند "${record.name}" إلى ${nextStatus === 'فعال' ? 'فعّال' : 'متوقف مؤقتاً'}`,
        variant: 'success',
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل المخصصات والاستقطاعات',
        details: `تغيير حالة بند مالي (${record.name}) إلى (${nextStatus})`
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
      await apiClient.entities.AllowanceDeduction.delete(id);
      toast({
        title: 'تم الحذف',
        description: `تم حذف البند "${name}" بنجاح`,
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعديل المخصصات والاستقطاعات',
        details: `حذف بند مالي من النظام (${name})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحذف',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Seeding Standard Presets for Iraq
  const handleLoadStandardPresets = async () => {
    if (!window.confirm('هل تريد إضافة الحزمة الافتراضية للمخصصات والاستقطاعات في العراق؟ (مخصصات شهادة، زوجية، أطفال، تقاعد، ضريبة).')) return;
    setLoading(true);
    try {
      const presets = [
        { name: 'مخصصات الزوجية المقطوعة', type: 'allowance', calcType: 'flat', value: 50000, status: 'فعال' },
        { name: 'مخصصات الأطفال (لكل طفل)', type: 'allowance', calcType: 'flat', value: 10000, status: 'فعال' },
        { name: 'مخصصات شهادة بكالوريوس', type: 'allowance', calcType: 'percentage', value: 45, status: 'فعال' },
        { name: 'مخصصات شهادة ماجستير', type: 'allowance', calcType: 'percentage', value: 75, status: 'فعال' },
        { name: 'مخصصات شهادة دكتوراه', type: 'allowance', calcType: 'percentage', value: 100, status: 'فعال' },
        { name: 'مخصصات منصب / إشرافية', type: 'allowance', calcType: 'percentage', value: 15, status: 'فعال' },
        { name: 'مخصصات خطورة مهنية', type: 'allowance', calcType: 'percentage', value: 20, status: 'فعال' },
        { name: 'مخصصات شهادة دبلوم', type: 'allowance', calcType: 'percentage', value: 20, status: 'فعال' },
        { name: 'استقطاع توفير التقاعد الوطني', type: 'deduction', calcType: 'percentage', value: 10, status: 'فعال' },
        { name: 'استقطاع ضريبة الدخل المباشرة', type: 'deduction', calcType: 'percentage', value: 5, status: 'فعال' },
      ];

      for (const item of presets) {
        await apiClient.entities.AllowanceDeduction.create(item);
      }

      toast({
        title: 'تم تعبئة الحزمة الافتراضية',
        description: 'تمت إضافة مخصصات الزوجية والأطفال والشهادات والتقاعد والضريبة بنجاح.',
        variant: 'success',
      });
      fetchRecords();

      // Log action
      await apiClient.logs.create({
        action: 'تعبئة مخصصات افتراضية',
        details: 'تعبئة مخصصات الشهادات والزوجية والأطفال والاستقطاعات القانونية الافتراضية للرواتب بالعراق'
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء التعبئة',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const allowancesCount = records.filter(r => r.type === 'allowance').length;
  const deductionsCount = records.filter(r => r.type === 'deduction').length;
  const activeAllowancesCount = records.filter(r => r.type === 'allowance' && r.status === 'فعال').length;
  const activeDeductionsCount = records.filter(r => r.type === 'deduction' && r.status === 'فعال').length;

  const filteredRecords = records.filter(r => {
    if (activeTypeTab === 'all') return true;
    return r.type === activeTypeTab;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">تعريف المخصصات والاستقطاعات الرسمية</h2>
          <p className="text-xs text-slate-500 mt-1">تصنيف وإدارة مخصصات الرواتب (أرباح) والاستقطاعات القانونية (خصومات) بنسب مئوية أو مبالغ مقطوعة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              if (activeTypeTab === 'allowance' || activeTypeTab === 'deduction') {
                setNewType(activeTypeTab);
              }
            }}
            className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} />
            إضافة بند جديد
          </button>
        </div>
      </div>

      {/* Max Children Limit Config Card */}
      <div className="bg-amber-50/40 border border-amber-200/60 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        <div className="space-y-1">
          <h3 className="text-xs font-black text-[#1B3A6B] flex items-center gap-1.5">
            <Coins size={14} className="text-[#C8960C]" />
            الحد الأقصى للأطفال المشمولين بالمخصص
          </h3>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            تحديد العدد الأقصى للأطفال الذين يُمنح لهم مخصص الأطفال بالمؤسسة. سيتم ضرب قيمة مخصص الأطفال الفردية بعدد الأطفال الفعلي للموظف حتى هذا الحد كحد أقصى.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
          <input
            type="number"
            min="0"
            max="20"
            value={maxChildrenCount}
            onChange={(e) => setMaxChildrenCount(e.target.value)}
            placeholder="الافتراضي: 4"
            className="w-24 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 focus:bg-white text-slate-800 font-bold transition-all text-center"
          />
          <button
            type="button"
            onClick={handleSaveMaxChildren}
            disabled={settingsSaving}
            className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold rounded-xl px-4 py-2 text-xs flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0"
          >
            {settingsSaving ? <RefreshCw className="animate-spin" size={12} /> : <Check size={12} />}
            حفظ
          </button>
        </div>
      </div>

      {/* Stats Summary Cards for Classification */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Allowances Stats Card */}
        <div className="bg-emerald-50/40 border border-emerald-100/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-emerald-700 block">تصنيف المخصصات الرسمية (أرباح)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-800 font-mono">{allowancesCount}</span>
              <span className="text-xs text-emerald-600">بنود أرباح مضافة</span>
            </div>
            <p className="text-[10px] text-emerald-600">منها <span className="font-bold">{activeAllowancesCount}</span> بند فعال حالياً ومحتسب للراتب الاسمي</p>
          </div>
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
            <TrendingUp size={20} />
          </div>
        </div>

        {/* Deductions Stats Card */}
        <div className="bg-rose-50/40 border border-rose-100/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-rose-700 block">تصنيف الاستقطاعات الرسمية (خصومات)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-rose-800 font-mono">{deductionsCount}</span>
              <span className="text-xs text-rose-600">بنود استقطاع وخصم</span>
            </div>
            <p className="text-[10px] text-rose-600">منها <span className="font-bold">{activeDeductionsCount}</span> بند فعال حالياً يخصم من الراتب الكلي</p>
          </div>
          <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-xl flex items-center justify-center">
            <TrendingDown size={20} />
          </div>
        </div>
      </div>

      {/* Segmented Sub-Tabs Control */}
      <div className="flex border-b border-slate-150 gap-2">
        <button
          type="button"
          onClick={() => handleTabChange('allowance')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTypeTab === 'allowance'
              ? 'border-emerald-600 text-emerald-700 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <TrendingUp size={14} className={activeTypeTab === 'allowance' ? 'text-emerald-600' : 'text-slate-400'} />
          <span>المخصصات الرسمية (الأرباح)</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
            activeTypeTab === 'allowance' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
          }`}>{allowancesCount}</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('deduction')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTypeTab === 'deduction'
              ? 'border-rose-600 text-rose-700 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <TrendingDown size={14} className={activeTypeTab === 'deduction' ? 'text-rose-600' : 'text-slate-400'} />
          <span>الاستقطاعات القانونية (الخصومات)</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
            activeTypeTab === 'deduction' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
          }`}>{deductionsCount}</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('all')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTypeTab === 'all'
              ? 'border-[#1B3A6B] text-[#1B3A6B] font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <Coins size={14} className={activeTypeTab === 'all' ? 'text-[#1B3A6B]' : 'text-slate-400'} />
          <span>عرض الكل (البنود المشتركة)</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
            activeTypeTab === 'all' ? 'bg-[#1B3A6B]/10 text-[#1B3A6B]' : 'bg-slate-100 text-slate-600'
          }`}>{records.length}</span>
        </button>
      </div>

      {/* Adding Form */}
      {adding && (
        <form onSubmit={handleAdd} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-700">بند مالي جديد</h3>
            <span className="text-[10px] text-slate-400">سيتم إضافة هذا البند في تصنيف {newType === 'allowance' ? 'المخصصات' : 'الاستقطاعات'}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">اسم البند</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: مخصصات نقل، استقطاع صحي"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">النوع</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
              >
                <option value="allowance">مخصصات (إضافة للراتب)</option>
                <option value="deduction">استقطاع (خصم من الراتب)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">طريقة الاحتساب</label>
              <select
                value={newCalcType}
                onChange={(e) => setNewCalcType(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
              >
                <option value="percentage">نسبة مئوية من الاسمي (%)</option>
                <option value="flat">مبلغ مقطوع ثابت (د.ع)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                {newCalcType === 'percentage' ? 'النسبة المئوية (%)' : 'المبلغ بالدينار'}
              </label>
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={newCalcType === 'percentage' ? 'مثال: 15' : 'مثال: 50000'}
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
          <div className="flex gap-2 justify-end pt-2">
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
              إضافة البند
            </button>
          </div>
        </form>
      )}

      {/* Main Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <RefreshCw className="animate-spin text-[#1B3A6B]" size={24} />
          <span className="text-xs text-slate-500 font-medium">جاري معالجة البيانات وتحميل البنود...</span>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-sm text-slate-500 font-semibold">لا يوجد بنود مضافة في هذا التصنيف حالياً.</p>
          <p className="text-xs text-slate-400 mt-1">يمكنك إضافة بنود مخصصة من خلال الضغط على زر "إضافة بند جديد".</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="px-2 py-3 text-center w-10">ترتيب</th>
                <th className="px-4 py-3">اسم البند المالي</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">طريقة الاحتساب</th>
                <th className="px-4 py-3">القيمة / النسبة</th>
                <th className="px-4 py-3 text-center">الحالة</th>
                <th className="px-4 py-3 text-left">التحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-slate-700">
              {filteredRecords.map((r, idx) => {
                const isEditing = editingId === r.id;
                const isPaused = r.status === 'متوقف مؤقتاً';
                return (
                  <tr 
                    key={r.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={`hover:bg-slate-50/50 transition-all ${isPaused ? 'bg-slate-50/40 text-slate-400' : ''} ${
                      draggedOverIndex === idx ? 'border-t-2 border-dashed border-[#1B3A6B] bg-[#1B3A6B]/5' : ''
                    }`}
                  >
                    <td className="px-2 py-3 text-center text-slate-400 cursor-grab active:cursor-grabbing hover:text-slate-600 transition-colors">
                      <GripVertical size={14} className="inline animate-pulse" />
                    </td>
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
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          className="bg-white border border-slate-200 rounded p-1 text-xs"
                        >
                          <option value="allowance">مخصصات (+)</option>
                          <option value="deduction">استقطاع (-)</option>
                        </select>
                      ) : (
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isPaused ? 'bg-slate-100 text-slate-400 border border-slate-200' :
                          r.type === 'allowance' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                          {r.type === 'allowance' ? 'مخصصات (إضافة)' : 'استقطاع (خصم)'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {isEditing ? (
                        <select
                          value={editCalcType}
                          onChange={(e) => setEditCalcType(e.target.value)}
                          className="bg-white border border-slate-200 rounded p-1 text-xs"
                        >
                          <option value="percentage">نسبة مئوية (%)</option>
                          <option value="flat">مبلغ مقطوع (د.ع)</option>
                        </select>
                      ) : (
                        r.calcType === 'percentage' ? 'نسبة مئوية من الاسمي' : 'مبلغ مقطوع ثابت'
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="bg-white border border-slate-200 rounded p-1 text-xs w-24 text-center"
                        />
                      ) : (
                        r.calcType === 'percentage' ? (
                          <span className={isPaused ? 'text-slate-400' : 'text-[#1B3A6B]'}>{r.value}%</span>
                        ) : (
                          <span className={isPaused ? 'text-slate-400' : 'text-emerald-700'}>{r.value.toLocaleString()} د.ع</span>
                        )
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
                            title={isPaused ? 'تفعيل البند المالي' : 'إيقاف مؤقت'}
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
                  هل أنت متأكد من رغبتك في حذف البند المالي <span className="font-bold text-slate-700">"{deleteConfirm.name}"</span>؟
                  لا يمكن التراجع عن هذا الإجراء وسيتم إزالته بالكامل من النظام.
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
                نعم، احذف البند
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
