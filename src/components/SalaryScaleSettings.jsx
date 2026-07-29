import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { 
  Plus, Trash2, Edit2, Check, X, RefreshCw, Sparkles, 
  SlidersHorizontal, ChevronRight, TrendingUp
} from 'lucide-react';
import { 
  SALARY_TABLE, 
  PROMOTION_YEARS, 
  ANNUAL_INCREMENTS, 
  getGradeLabel, 
  getGradeType,
  updatePromotionYear,
  updateAnnualIncrement 
} from '@/lib/salaryTable';

export default function SalaryScaleSettings() {
  const [originalRecords, setOriginalRecords] = useState([]);
  const [records, setRecords] = useState([]);
  const [originalPromotionYears, setOriginalPromotionYears] = useState({});
  const [promotionYears, setPromotionYears] = useState({});
  const [originalAnnualIncrements, setOriginalAnnualIncrements] = useState({});
  const [annualIncrements, setAnnualIncrements] = useState({});
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Filter state: 'all' or grade number 1-10
  const [filterGrade, setFilterGrade] = useState('all');

  // New Record Form State
  const [newGrade, setNewGrade] = useState('');
  const [newStep, setNewStep] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [adding, setAdding] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editGrade, setEditGrade] = useState('');
  const [editStep, setEditStep] = useState('');
  const [editAmount, setEditAmount] = useState('');

  // Inline editing state for the comprehensive grid view
  const [inlineEditing, setInlineEditing] = useState(null); // { grade, step }
  const [inlineValue, setInlineValue] = useState('');

  // State for editing promotion years and annual increments
  const [editingPromotionGrade, setEditingPromotionGrade] = useState(null);
  const [editPromotionValue, setEditPromotionValue] = useState('');
  const [editingIncrementGrade, setEditingIncrementGrade] = useState(null);
  const [editIncrementValue, setEditIncrementValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, type: '', id: null, grade: null, step: null, label: '' });

  const handleSavePromotion = (grade, val) => {
    setPromotionYears(prev => ({
      ...prev,
      [grade]: val === '' ? null : parseInt(val)
    }));
    setEditingPromotionGrade(null);
    toast({
      title: 'تم التعديل مؤقتاً',
      description: `تم تعديل سنوات الترفيع للدرجة ${getGradeLabel(grade)} في المسودة. يرجى حفظ التغييرات نهائياً لحفظها.`,
    });
  };

  const handleDeletePromotion = (grade) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'promotion',
      grade,
      label: `سنوات الترفيع للدرجة ${getGradeLabel(grade)}`
    });
  };

  const handleSaveIncrement = (grade, val) => {
    setAnnualIncrements(prev => ({
      ...prev,
      [grade]: val === '' ? 0 : parseInt(val)
    }));
    setEditingIncrementGrade(null);
    toast({
      title: 'تم التعديل مؤقتاً',
      description: `تم تعديل العلاوة السنوية للدرجة ${getGradeLabel(grade)} في المسودة. يرجى حفظ التغييرات نهائياً لحفظها.`,
    });
  };

  const handleDeleteIncrement = (grade) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'increment',
      grade,
      label: `العلاوة السنوية للدرجة ${getGradeLabel(grade)}`
    });
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.SalaryScale.list();
      const recordsData = data || [];
      setRecords(recordsData);
      setOriginalRecords(JSON.parse(JSON.stringify(recordsData)));

      const promos = { ...PROMOTION_YEARS };
      setPromotionYears(promos);
      setOriginalPromotionYears({ ...promos });

      const incs = { ...ANNUAL_INCREMENTS };
      setAnnualIncrements(incs);
      setOriginalAnnualIncrements({ ...incs });
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: error.message || 'تعذر تحميل سلم الرواتب',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newGrade || !newStep || !newAmount) {
      toast({
        title: 'تنبيه',
        description: 'يرجى ملء جميع الحقول المطلوبة',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      id: `temp-${Date.now()}`,
      grade: parseInt(newGrade),
      step: parseInt(newStep),
      amount: parseInt(newAmount),
    };

    // Check if duplicate grade/step exists
    const duplicate = records.some(r => r.grade === payload.grade && r.step === payload.step);
    if (duplicate) {
      toast({
        title: 'تنبيه',
        description: 'هذه الدرجة والمرحلة موجودة بالفعل في السلم المالي',
        variant: 'destructive'
      });
      return;
    }

    setRecords(prev => [...prev, payload]);
    setNewGrade('');
    setNewStep('');
    setNewAmount('');
    setAdding(false);
    toast({
      title: 'تمت الإضافة مؤقتاً',
      description: 'تمت إضافة السجل إلى المسودة المخططة. يرجى الضغط على زر حفظ التعديلات لحفظ التغييرات نهائياً.',
    });
  };

  const handleStartEdit = (record) => {
    setEditingId(record.id);
    setEditGrade(record.grade);
    setEditStep(record.step);
    setEditAmount(record.amount);
  };

  const handleSaveEdit = async (id) => {
    const valGrade = parseInt(editGrade);
    const valStep = parseInt(editStep);
    const valAmount = parseInt(editAmount);

    if (isNaN(valAmount) || valAmount <= 0) {
      toast({
        title: 'تنبيه',
        description: 'يرجى إدخال مبلغ صحيح أكبر من الصفر',
        variant: 'destructive',
      });
      return;
    }

    setRecords(prev => {
      const existingIndex = prev.findIndex(r => r.id === id || (r.grade === valGrade && r.step === valStep));
      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = {
          ...copy[existingIndex],
          grade: valGrade,
          step: valStep,
          amount: valAmount,
          isFallback: false
        };
        return copy;
      } else {
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            grade: valGrade,
            step: valStep,
            amount: valAmount
          }
        ];
      }
    });

    setEditingId(null);
    toast({
      title: 'تم التحديث مؤقتاً',
      description: 'تم تحديث السجل في المسودة المخططة. يرجى حفظ التغييرات نهائياً لتطبيقها.',
    });
  };

  const handleDelete = (id, grade, step) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'record',
      id,
      grade,
      step,
      label: `الدرجة ${getGradeLabel(grade)} المرحلة ${step} من سلم الرواتب`
    });
  };

  const handleInlineSave = async (grade, step, amountVal) => {
    const val = parseInt(amountVal);
    if (isNaN(val) || val <= 0) {
      toast({
        title: 'تنبيه',
        description: 'يرجى إدخال مبلغ صحيح أكبر من الصفر',
        variant: 'destructive',
      });
      return;
    }

    setRecords(prev => {
      const existing = prev.find(r => r.grade === grade && r.step === step);
      if (existing) {
        return prev.map(r => r.grade === grade && r.step === step ? { ...r, amount: val } : r);
      } else {
        return [...prev, { id: `temp-${Date.now()}`, grade, step, amount: val }];
      }
    });
    setInlineEditing(null);
    toast({
      title: 'تم التعديل مؤقتاً',
      description: 'تم تعديل الراتب الاسمي في المسودة بنجاح.',
    });
  };

  const handleInlineDelete = async (grade, step) => {
    const existing = records.find(r => r.grade === grade && r.step === step);
    if (!existing) return;
    setDeleteConfirm({
      isOpen: true,
      type: 'inlineRecord',
      id: existing.id,
      grade,
      step,
      label: `الدرجة ${getGradeLabel(grade)} المرحلة ${step} من سلم الرواتب`
    });
  };

  const confirmDelete = async () => {
    const { type, id, grade, step } = deleteConfirm;
    setDeleteConfirm({ isOpen: false, type: '', id: null, grade: null, step: null, label: '' });

    if (type === 'promotion') {
      setPromotionYears(prev => ({ ...prev, [grade]: null }));
      setEditingPromotionGrade(null);
      toast({
        title: 'تم الحذف مؤقتاً',
        description: 'تم حذف سنوات الترفيع في المسودة المخططة.',
      });
    } else if (type === 'increment') {
      setAnnualIncrements(prev => ({ ...prev, [grade]: 0 }));
      setEditingIncrementGrade(null);
      toast({
        title: 'تم الحذف مؤقتاً',
        description: 'تم حذف العلاوة السنوية في المسودة المخططة.',
      });
    } else if (type === 'record' || type === 'inlineRecord') {
      setRecords(prev => prev.filter(r => r.id !== id && !(r.grade === grade && r.step === step)));
      toast({
        title: 'تم الحذف مؤقتاً',
        description: 'تمت إزالة السجل من المسودة المخططة.',
      });
    }
  };

  // Seeding Iraqi Current Salary Scale
  const handleLoadDefault2023Preset = async () => {
    const preset = [];
    const gradeRules = [
      { grade: 13, base: 1500000, inc: 83000 },
      { grade: 12, base: 2000000, inc: 83000 },
      { grade: 11, base: 2413000, inc: 83000 },
      { grade: 10, base: 170000, inc: 3000 },
      { grade: 9, base: 210000, inc: 3000 },
      { grade: 8, base: 260000, inc: 3000 },
      { grade: 7, base: 296000, inc: 6000 },
      { grade: 6, base: 362000, inc: 6000 },
      { grade: 5, base: 429000, inc: 6000 },
      { grade: 4, base: 509000, inc: 8000 },
      { grade: 3, base: 600000, inc: 10000 },
      { grade: 2, base: 723000, inc: 17000 },
      { grade: 1, base: 910000, inc: 20000 },
    ];

    for (const rule of gradeRules) {
      for (let step = 1; step <= 11; step++) {
        const amount = rule.base + (step - 1) * rule.inc;
        preset.push({
          id: `preset-${rule.grade}-${step}`,
          grade: rule.grade,
          step: step,
          amount: amount,
        });
      }
    }

    setRecords(preset);
    // Reset local promotion years and increments to standard default values
    const defaultPromo = {
      1: null, 2: 5, 3: 5, 4: 5, 5: 5, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4, 11: null, 12: null, 13: null
    };
    const defaultIncs = {
      1: 20000, 2: 17000, 3: 10000, 4: 8000, 5: 6000, 6: 6000, 7: 6000, 8: 3000, 9: 3000, 10: 3000, 11: 83000, 12: 83000, 13: 83000
    };
    setPromotionYears(defaultPromo);
    setAnnualIncrements(defaultIncs);

    toast({
      title: 'تم تحميل النموذج الافتراضي في المسودة',
      description: 'تم تحميل سلم الرواتب العراقي المعتمد لعام 2023 كمسودة. يرجى الضغط على زر حفظ التعديلات لحفظ التغييرات نهائياً.',
    });
  };

  const handleSaveAllChanges = async () => {
    setSaving(true);
    try {
      // 1. Bulk save salary scale records
      const cleanedRecords = records.map(r => ({
        grade: r.grade,
        step: r.step,
        amount: r.amount
      }));
      await apiClient.entities.SalaryScale.bulkCreate(cleanedRecords);

      // 2. Save promotion years and increments to global object and localStorage
      Object.keys(promotionYears).forEach(g => {
        updatePromotionYear(parseInt(g), promotionYears[g]);
      });
      Object.keys(annualIncrements).forEach(g => {
        updateAnnualIncrement(parseInt(g), annualIncrements[g]);
      });

      // 3. Log the modification action
      await apiClient.logs.create({
        action: 'تعديل سلم الرواتب والمدد',
        details: `تحديث سلم الرواتب والمدد المالية والعلاوات السنوية بنجاح. تم تطبيق التعديل على الموظفين من تاريخ اليوم مع الحفاظ التام على البيانات التاريخية.`
      }).catch(() => {});

      // 4. Update local comparison states
      setOriginalRecords(JSON.parse(JSON.stringify(records)));
      setOriginalPromotionYears({ ...promotionYears });
      setOriginalAnnualIncrements({ ...annualIncrements });

      toast({
        title: 'تم حفظ جميع التعديلات بنجاح',
        description: 'تم حفظ سلم الرواتب الجديد وتطبيق القيم على الموظفين من تاريخ اليوم بنجاح مع الحفاظ التام على البيانات المالية التاريخية.',
        variant: 'success',
      });
      setIsWarningOpen(false);
    } catch (error) {
      toast({
        title: 'خطأ أثناء حفظ التعديلات',
        description: error.message || 'تعذر حفظ البيانات في الخادم',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelAllChanges = () => {
    setRecords(JSON.parse(JSON.stringify(originalRecords)));
    setPromotionYears({ ...originalPromotionYears });
    setAnnualIncrements({ ...originalAnnualIncrements });
    toast({
      title: 'تم التراجع عن التعديلات',
      description: 'تمت استعادة النسخة الأخيرة المحفوظة من سلم الرواتب والمدد.',
    });
  };

  const isDirty = 
    JSON.stringify(records.map(r => ({ grade: r.grade, step: r.step, amount: r.amount })).sort((a,b) => a.grade - b.grade || a.step - b.step)) !== 
    JSON.stringify(originalRecords.map(r => ({ grade: r.grade, step: r.step, amount: r.amount })).sort((a,b) => a.grade - b.grade || a.step - b.step)) ||
    JSON.stringify(promotionYears) !== JSON.stringify(originalPromotionYears) ||
    JSON.stringify(annualIncrements) !== JSON.stringify(originalAnnualIncrements);

  // Group records by grade and build full step list (1 to 11+)
  const getGradeSummary = (gradeNum) => {
    const defaultStepsObj = SALARY_TABLE[gradeNum] || {};
    const defaultStepNumbers = Object.keys(defaultStepsObj).map(Number);
    const existingGradeRecords = records.filter(r => r.grade === gradeNum);

    const maxStep = Math.max(11, ...defaultStepNumbers, ...existingGradeRecords.map(r => r.step));

    const stepsList = [];
    for (let s = 1; s <= maxStep; s++) {
      const rec = existingGradeRecords.find(r => r.step === s);
      if (rec) {
        stepsList.push(rec);
      } else {
        const fallbackAmt = defaultStepsObj[s] !== undefined 
          ? defaultStepsObj[s] 
          : (defaultStepsObj[1] ? defaultStepsObj[1] + (s - 1) * (annualIncrements[gradeNum] || 0) : 0);
        stepsList.push({
          id: `fallback-${gradeNum}-${s}`,
          grade: gradeNum,
          step: s,
          amount: fallbackAmt,
          isFallback: true
        });
      }
    }

    stepsList.sort((a, b) => a.step - b.step);
    const baseAmount = stepsList[0]?.amount || 0;
    const maxAmount = stepsList[stepsList.length - 1]?.amount || 0;
    const increment = annualIncrements[gradeNum] || 0;

    return {
      grade: gradeNum,
      count: stepsList.length,
      base: baseAmount,
      max: maxAmount,
      inc: increment,
      steps: stepsList
    };
  };

  const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

  const activeGradeSummary = filterGrade !== 'all' ? getGradeSummary(parseInt(filterGrade)) : null;

  const displayedRecords = filterGrade !== 'all'
    ? (activeGradeSummary ? activeGradeSummary.steps : [])
    : [...records].sort((a, b) => (a.grade !== b.grade ? a.grade - b.grade : a.step - b.step));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Unsaved changes banner */}
      {isDirty && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-fadeIn shadow-xs" dir="rtl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">⚠️ هناك تعديلات غير محفوظة على سلم الرواتب!</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">لقد أجريت تعديلات على قيم سلم الرواتب أو المدد أو العلاوات السنوية ولم يتم حفظها نهائياً بعد.</p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCancelAllChanges}
              className="flex-1 sm:flex-none bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold rounded-xl px-4 py-2 text-xs transition-all"
            >
              إلغاء وتراجع
            </button>
            <button
              type="button"
              onClick={() => setIsWarningOpen(true)}
              className="flex-1 sm:flex-none bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold rounded-xl px-5 py-2 text-xs transition-all shadow-sm"
            >
              حفظ التعديلات
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">سلم الرواتب الحالي</h2>
          <p className="text-xs text-slate-500 mt-1">عرض السلم المالي الرسمي، فتح تفاصيل الدرجات الوظيفية ومراحلها السنوية، وتعديل قيم الرواتب الاسمية.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Add Step Button */}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} />
            إضافة درجة / مرحلة
          </button>
        </div>
      </div>

      {/* Adding Panel */}
      {adding && (
        <form onSubmit={handleAdd} className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end animate-fadeIn">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">الدرجة الوظيفية</label>
            <select
              value={newGrade}
              onChange={(e) => setNewGrade(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
            >
              <option value="">اختر الدرجة...</option>
              {GRADES.map(g => (
                <option key={g} value={g}>{g >= 11 ? getGradeLabel(g) : `الدرجة ${g} (${getGradeLabel(g)})`}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">المرحلة الوظيفية</label>
            <select
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
            >
              <option value="">اختر المرحلة...</option>
              {Array.from({ length: 15 }, (_, i) => i + 1).map(s => (
                <option key={s} value={s}>المرحلة {s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">الراتب الاسمي (بالدينار)</label>
            <input
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="مثال: 310000"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold rounded-lg py-2 text-xs transition-colors"
            >
              حفظ السجل
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="flex-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold rounded-lg py-2 text-xs transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* Modern Filter Tabs & Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-700">تصفية الدرجة الحالية:</span>
          </div>
          {filterGrade !== 'all' && (
            <button
              onClick={() => setFilterGrade('all')}
              className="text-xs text-[#1B3A6B] hover:underline font-bold flex items-center gap-1"
            >
              <ChevronRight size={14} /> العودة لنظرة عامة على الدرجات
            </button>
          )}
        </div>

        {/* Scrollable Horizontal Tabs for Grades */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin" dir="rtl">
          <button
            onClick={() => setFilterGrade('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
              filterGrade === 'all'
                ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
            }`}
          >
            نظرة عامة على السلم (كل الدرجات)
          </button>
          {GRADES.map(g => (
            <button
              key={g}
              onClick={() => setFilterGrade(g.toString())}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                filterGrade === g.toString()
                  ? 'bg-[#C8960C] text-white border-[#C8960C] shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
              }`}
            >
              {g >= 11 ? (g === 11 ? 'وكيل الوزارة' : g === 12 ? 'الدرجة الخاصة' : 'المدير العام') : `الدرجة ${g}`}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="animate-spin text-[#1B3A6B]" size={28} />
          <span className="text-xs text-slate-500 font-medium">جاري جلب السلم المالي الموحد...</span>
        </div>
      ) : filterGrade === 'all' ? (
        /* COMPREHENSIVE INTERACTIVE MATRIX VIEW */
        <div className="space-y-4 animate-fadeIn">
          {records.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 animate-bounce">
                <Sparkles size={16} />
              </div>
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-bold">ملاحظة: تظهر حالياً القيم الافتراضية لسلم الرواتب العراقي الموحد لعام 2023</p>
                <p>لم يتم حفظ تخصيصات مخصصة في قاعدة البيانات بعد. يمكنك النقر على أي قيمة وتعديلها ليتم حفظها مخصصة تلقائياً، أو الضغط على <strong>"تعبئة سلم الرواتب"</strong> في الأعلى لتوليد كامل الجدول في قاعدة البيانات دفعة واحدة.</p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-[#1B3A6B]/5 border-b border-slate-200">
                  <th className="px-3 py-3 font-semibold text-right border-b border-slate-200 min-w-[150px] text-[#1B3A6B]">الدرجة الوظيفية</th>
                  <th className="px-3 py-3 font-semibold text-center border-b border-slate-200 min-w-[90px]">نوع الدرجة</th>
                  <th className="px-3 py-3 font-semibold text-center border-b border-slate-200 min-w-[80px]">سنوات الترفيع</th>
                  <th className="px-3 py-3 font-semibold text-center border-b border-slate-200 min-w-[110px]">العلاوة السنوية</th>
                  {[1,2,3,4,5,6,7,8,9,10,11].map(s => (
                    <th key={s} className="px-3 py-3 font-semibold border-b border-slate-200 text-center min-w-[95px]">م{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {GRADES.map(g => (
                  <tr key={g} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-3 py-3 font-bold text-[#1B3A6B] bg-slate-50/40 max-w-[200px] truncate" title={g >= 11 ? getGradeLabel(g) : `الدرجة ${getGradeLabel(g)}`}>
                      {g >= 11 ? getGradeLabel(g) : `الدرجة ${getGradeLabel(g)}`}
                    </td>
                    <td className="px-3 py-3 text-center bg-slate-50/40">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        g >= 11 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {getGradeType(g)}
                      </span>
                    </td>
                    {/* سنوات الترفيع */}
                    {editingPromotionGrade === g ? (
                      <td className="px-2 py-1.5 text-center bg-slate-50/60 border border-slate-200">
                        <div className="flex items-center gap-1 justify-center">
                          <input
                            type="number"
                            value={editPromotionValue}
                            onChange={(e) => setEditPromotionValue(e.target.value)}
                            placeholder="فارغ"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSavePromotion(g, editPromotionValue);
                              } else if (e.key === 'Escape') {
                                setEditingPromotionGrade(null);
                              }
                            }}
                            className="w-14 bg-white border border-slate-300 rounded px-1.5 py-1 text-center font-bold text-xs focus:outline-none focus:ring-2 focus:ring-slate-500 text-[#1B3A6B]"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSavePromotion(g, editPromotionValue)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white p-1 rounded transition-colors shadow-sm"
                            title="حفظ"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePromotion(g)}
                            className="bg-red-500 hover:bg-red-600 text-white p-1 rounded transition-colors shadow-sm"
                            title="حذف القيمة (تركها فارغة)"
                          >
                            <Trash2 size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPromotionGrade(null)}
                            className="bg-slate-300 hover:bg-slate-400 text-slate-700 p-1 rounded transition-colors shadow-sm"
                            title="إلغاء"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </td>
                    ) : (
                      <td 
                        className="px-3 py-3 text-center font-bold text-slate-500 bg-slate-50/40 cursor-pointer hover:bg-amber-50/40 relative group/promo transition-colors"
                        onClick={() => {
                          setEditingPromotionGrade(g);
                          setEditPromotionValue(promotionYears[g] !== null && promotionYears[g] !== undefined ? promotionYears[g].toString() : '');
                        }}
                        title="اضغط لتعديل أو حذف سنوات الترفيع"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>{promotionYears[g] !== null && promotionYears[g] !== undefined ? `${promotionYears[g]} سنوات` : '—'}</span>
                          <div className="absolute left-1 hidden group-hover/promo:flex items-center bg-white rounded border border-slate-200 p-0.5 shadow-sm">
                            <Edit2 size={10} className="text-[#1B3A6B]" />
                          </div>
                        </div>
                      </td>
                    )}

                    {/* العلاوة السنوية */}
                    {editingIncrementGrade === g ? (
                      <td className="px-2 py-1.5 text-center bg-slate-50/60 border border-slate-200">
                        <div className="flex items-center gap-1 justify-center">
                          <input
                            type="number"
                            value={editIncrementValue}
                            onChange={(e) => setEditIncrementValue(e.target.value)}
                            placeholder="المبلغ"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveIncrement(g, editIncrementValue);
                              } else if (e.key === 'Escape') {
                                setEditingIncrementGrade(null);
                              }
                            }}
                            className="w-20 bg-white border border-slate-300 rounded px-1.5 py-1 text-center font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-900"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveIncrement(g, editIncrementValue)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white p-1 rounded transition-colors shadow-sm"
                            title="حفظ"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIncrement(g)}
                            className="bg-red-500 hover:bg-red-600 text-white p-1 rounded transition-colors shadow-sm"
                            title="حذف العلاوة (ضبط كـ 0)"
                          >
                            <Trash2 size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingIncrementGrade(null)}
                            className="bg-slate-300 hover:bg-slate-400 text-slate-700 p-1 rounded transition-colors shadow-sm"
                            title="إلغاء"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </td>
                    ) : (
                      <td 
                        className="px-3 py-3 text-center font-bold text-emerald-700 bg-slate-50/40 cursor-pointer hover:bg-amber-50/40 relative group/inc transition-colors"
                        onClick={() => {
                          setEditingIncrementGrade(g);
                          setEditIncrementValue(annualIncrements[g] ? annualIncrements[g].toString() : '');
                        }}
                        title="اضغط لتعديل أو حذف العلاوة السنوية"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>{new Intl.NumberFormat('ar-IQ').format(annualIncrements[g] || 0)} د.ع</span>
                          <div className="absolute left-1 hidden group-hover/inc:flex items-center bg-white rounded border border-slate-200 p-0.5 shadow-sm">
                            <Edit2 size={10} className="text-[#1B3A6B]" />
                          </div>
                        </div>
                      </td>
                    )}
                    {[1,2,3,4,5,6,7,8,9,10,11].map(s => {
                      const rec = records.find(r => r.grade === g && r.step === s);
                      const amount = rec ? rec.amount : (SALARY_TABLE[g]?.[s] || null);
                      const isEditing = inlineEditing && inlineEditing.grade === g && inlineEditing.step === s;

                      if (isEditing) {
                        return (
                          <td key={s} className="px-2 py-1.5 text-center border border-slate-150 bg-amber-50/60 shadow-inner">
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number"
                                value={inlineValue}
                                onChange={(e) => setInlineValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleInlineSave(g, s, inlineValue);
                                  } else if (e.key === 'Escape') {
                                    setInlineEditing(null);
                                  }
                                }}
                                className="w-20 bg-white border border-amber-300 rounded px-1.5 py-1 text-center font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-900"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleInlineSave(g, s, inlineValue)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white p-1 rounded transition-colors shadow-sm"
                              >
                                <Check size={10} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setInlineEditing(null)}
                                className="bg-slate-300 hover:bg-slate-400 text-slate-700 p-1 rounded transition-colors shadow-sm"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td 
                          key={s} 
                          className="px-2 py-2 text-center text-slate-600 font-mono border border-slate-100 group/cell relative hover:bg-amber-50/40 cursor-pointer transition-colors"
                          onClick={() => {
                            setInlineEditing({ grade: g, step: s });
                            setInlineValue(amount ? amount.toString() : '');
                          }}
                        >
                          {amount !== null ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-semibold text-slate-800">{new Intl.NumberFormat('ar-IQ').format(amount)}</span>
                              {/* Quick Hover Actions */}
                              <div className="absolute inset-y-0 right-0 hidden group-hover/cell:flex items-center gap-1 bg-slate-50 border-r border-slate-200 px-1 rounded-l shadow-sm">
                                <button
                                  type="button"
                                  className="text-slate-500 hover:text-[#1B3A6B] p-0.5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInlineEditing({ grade: g, step: s });
                                    setInlineValue(amount.toString());
                                  }}
                                  title="تعديل الراتب"
                                >
                                  <Edit2 size={10} />
                                </button>
                                {rec && (
                                  <button
                                    type="button"
                                    className="text-red-500 hover:text-red-700 p-0.5"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInlineDelete(g, s);
                                    }}
                                    title="حذف القيمة المخصصة واستعادة الافتراضية"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-[10px] group-hover/cell:text-emerald-600 font-bold flex items-center justify-center gap-0.5">
                              <Plus size={8} /> أضف
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* DETAILED GRADE VIEW WITH ALL STEPS */
        <div className="space-y-4 animate-fadeIn">
          {activeGradeSummary ? (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#C8960C]/10 text-[#C8960C] rounded-xl flex items-center justify-center">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {parseInt(filterGrade) >= 11 ? getGradeLabel(parseInt(filterGrade)) : `تفاصيل الدرجة ${getGradeLabel(parseInt(filterGrade))}`}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span>الراتب الأساسي: <span className="font-bold text-slate-700 font-mono">{activeGradeSummary.base.toLocaleString()} د.ع</span></span>
                    <span>|</span>
                    <span>الحد الأقصى الحالي: <span className="font-bold text-slate-700 font-mono">{activeGradeSummary.max.toLocaleString()} د.ع</span></span>
                    <span>|</span>
                    
                    {/* العلاوة السنوية */}
                    <span className="inline-flex items-center gap-1">
                      <span>مقدار العلاوة السنوية:</span>
                      {editingIncrementGrade === parseInt(filterGrade) ? (
                        <span className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                          <input
                            type="number"
                            value={editIncrementValue}
                            onChange={(e) => setEditIncrementValue(e.target.value)}
                            className="w-20 text-xs font-bold font-mono px-1 border border-slate-300 rounded text-emerald-900 focus:outline-none"
                            placeholder="المبلغ"
                          />
                          <button
                            onClick={() => handleSaveIncrement(parseInt(filterGrade), editIncrementValue)}
                            className="text-emerald-600 hover:text-emerald-700 p-0.5"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteIncrement(parseInt(filterGrade))}
                            className="text-red-500 hover:text-red-600 p-0.5"
                            title="حذف (ضبط 0)"
                          >
                            <Trash2 size={12} />
                          </button>
                          <button
                            onClick={() => setEditingIncrementGrade(null)}
                            className="text-slate-400 hover:text-slate-500 p-0.5"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="font-bold text-emerald-700 font-mono">
                            {new Intl.NumberFormat('ar-IQ').format(annualIncrements[parseInt(filterGrade)] || 0)} د.ع
                          </span>
                          <button
                            onClick={() => {
                              setEditingIncrementGrade(parseInt(filterGrade));
                              setEditIncrementValue(annualIncrements[parseInt(filterGrade)]?.toString() || '');
                            }}
                            className="text-slate-400 hover:text-[#1B3A6B] p-0.5 transition-colors"
                            title="تعديل العلاوة السنوية"
                          >
                            <Edit2 size={11} />
                          </button>
                        </span>
                      )}
                    </span>
                    
                    <span>|</span>
                    
                    {/* سنوات الترفيع */}
                    <span className="inline-flex items-center gap-1">
                      <span>سنوات الترفيع:</span>
                      {editingPromotionGrade === parseInt(filterGrade) ? (
                        <span className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                          <input
                            type="number"
                            value={editPromotionValue}
                            onChange={(e) => setEditPromotionValue(e.target.value)}
                            className="w-14 text-xs font-bold px-1 border border-slate-300 rounded text-[#1B3A6B] focus:outline-none"
                            placeholder="فارغ"
                          />
                          <button
                            onClick={() => handleSavePromotion(parseInt(filterGrade), editPromotionValue)}
                            className="text-emerald-600 hover:text-emerald-700 p-0.5"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => handleDeletePromotion(parseInt(filterGrade))}
                            className="text-red-500 hover:text-red-600 p-0.5"
                            title="حذف سنوات الترفيع (تركها فارغة)"
                          >
                            <Trash2 size={12} />
                          </button>
                          <button
                            onClick={() => setEditingPromotionGrade(null)}
                            className="text-slate-400 hover:text-slate-500 p-0.5"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="font-bold text-slate-800">
                            {promotionYears[parseInt(filterGrade)] !== null && promotionYears[parseInt(filterGrade)] !== undefined ? `${promotionYears[parseInt(filterGrade)]} سنوات` : '—'}
                          </span>
                          <button
                            onClick={() => {
                              setEditingPromotionGrade(parseInt(filterGrade));
                              setEditPromotionValue(promotionYears[parseInt(filterGrade)] !== null && promotionYears[parseInt(filterGrade)] !== undefined ? promotionYears[parseInt(filterGrade)].toString() : '');
                            }}
                            className="text-slate-400 hover:text-[#1B3A6B] p-0.5 transition-colors"
                            title="تعديل سنوات الترفيع"
                          >
                            <Edit2 size={11} />
                          </button>
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setNewGrade(filterGrade);
                  setNewStep((activeGradeSummary.count + 1).toString());
                  setAdding(true);
                }}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Plus size={12} />
                إضافة مرحلة {activeGradeSummary.count + 1}
              </button>
            </div>
          ) : (
            <div className="bg-red-50 text-red-700 text-xs p-4 rounded-xl border border-red-100">
              لا توجد بيانات مسجلة حالياً لهذه الدرجة. يرجى إضافة مرحلة جديدة وتعبئتها.
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-1/4">الدرجة الوظيفية</th>
                  <th className="px-4 py-3 w-1/4">المرحلة</th>
                  <th className="px-4 py-3 w-1/3">الراتب الاسمي (دينار عراقي)</th>
                  <th className="px-4 py-3 text-left">التحكم والتعديل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-slate-700">
                {displayedRecords.map((r) => {
                  const isEditing = editingId === r.id;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {isEditing ? (
                          <select
                            value={editGrade}
                            onChange={(e) => setEditGrade(e.target.value)}
                            className="bg-white border border-slate-200 rounded p-1 text-xs w-full max-w-[150px]"
                          >
                            {GRADES.map(g => (
                              <option key={g} value={g}>{g >= 11 ? getGradeLabel(g) : `الدرجة ${getGradeLabel(g)}`}</option>
                            ))}
                          </select>
                        ) : (
                          r.grade >= 11 ? getGradeLabel(r.grade) : `الدرجة ${getGradeLabel(r.grade)}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-semibold">
                        {isEditing ? (
                          <select
                            value={editStep}
                            onChange={(e) => setEditStep(e.target.value)}
                            className="bg-white border border-slate-200 rounded p-1 text-xs w-full max-w-[150px]"
                          >
                            {Array.from({ length: 15 }, (_, i) => i + 1).map(s => (
                              <option key={s} value={s}>المرحلة {s}</option>
                            ))}
                          </select>
                        ) : (
                          `المرحلة ${r.step}`
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="bg-white border border-slate-200 rounded p-1 text-xs w-36 font-mono font-bold"
                            />
                            <span className="text-[10px] text-slate-400">د.ع</span>
                          </div>
                        ) : (
                          `${r.amount.toLocaleString()} د.ع`
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
                          <div className="flex gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(r)}
                              className="bg-slate-50 hover:bg-slate-100 text-slate-600 p-1.5 rounded-lg transition-colors border border-slate-200"
                              title="تعديل السعر"
                            >
                              <Edit2 size={12} />
                            </button>
                            {!r.isFallback && (
                              <button
                                type="button"
                                onClick={() => handleDelete(r.id, r.grade, r.step)}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition-colors border border-rose-100"
                                title="حذف السجل"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                  هل أنت متأكد من رغبتك في حذف <span className="font-bold text-slate-700">"{deleteConfirm.label}"</span>؟
                  لا يمكن التراجع عن هذا الإجراء وسيتم إزالته بالكامل من قواعد الاحتساب والرواتب.
                </p>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex gap-3 justify-end border-t border-slate-100" dir="rtl">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ isOpen: false, type: '', id: null, grade: null, step: null, label: '' })}
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

      {isWarningOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden animate-scale-up" dir="rtl">
            <div className="p-6 space-y-4">
              <div className="mx-auto w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center">
                <Sparkles size={24} />
              </div>
              <div className="space-y-2 text-center">
                <h3 className="text-base font-bold text-slate-800">تأكيد وحفظ تعديلات سلم الرواتب والمدد</h3>
                <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 text-slate-700 text-xs text-right leading-relaxed space-y-2">
                  <p className="font-bold text-amber-900">تنبيه هام قبل حفظ التعديلات:</p>
                  <p>إن حفظ هذه التغييرات سيؤدي إلى تحديث الراتب الاسمي والمدد والعلاوات لجميع الموظفين ابتداءً من تاريخ هذا التعديل اليوم.</p>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-600 mt-1">
                    <li><span className="font-bold text-slate-700">المحافظة على التاريخ المالي:</span> سيتم الحفاظ بالكامل على كافة البيانات التاريخية والرواتب المعتمدة والمدفوعة بالفعل في الأشهر السابقة دون أي تعديل أو أثر رجعي.</li>
                    <li><span className="font-bold text-slate-700">تطبيق السلم الجديد:</span> سيتم تطبيق السلم المعدل الجديد تلقائياً وبأثر فوري على الموظفين عند احتساب وتوليد رواتب الأشهر القادمة.</li>
                  </ul>
                </div>
                <p className="text-xs text-slate-500 font-semibold mt-3">هل أنت متأكد من رغبتك في اعتماد هذه التعديلات وحفظها نهائياً؟</p>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex gap-3 justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsWarningOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition-all"
                disabled={saving}
              >
                إلغاء وتراجع
              </button>
              <button
                type="button"
                onClick={handleSaveAllChanges}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                disabled={saving}
              >
                {saving ? 'جاري الحفظ...' : 'تأكيد وحفظ التغييرات'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
