import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { 
  Plus, Trash2, Edit2, Check, X, RefreshCw, Play, Pause, 
  CalendarDays, ShieldCheck, Sparkles, AlertCircle, Clock,
  Save, CheckCircle2, History, ArrowUpRight, Award, TrendingUp,
  Banknote, AlertTriangle, CheckSquare, Square
} from 'lucide-react';

export default function LeaveTypesSettings() {
  const { toast } = useToast();

  // Leave Types List State
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  // New Type Form State
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMaxDays, setNewMaxDays] = useState('');
  
  // Checkable Administrative Effects
  const [newAffectsIncrement, setNewAffectsIncrement] = useState(false); // العلاوة السنوية
  const [newAffectsPromotion, setNewAffectsPromotion] = useState(false); // الترفيع
  const [newAffectsCommendations, setNewAffectsCommendations] = useState(false); // كتب الشكر
  
  // Financial Payment Type
  const [newSalaryPaymentType, setNewSalaryPaymentType] = useState('منح_الراتب_كامل'); // منح_الراتب_كامل, منح_الراتب_والمخصصات_الثابتة_فقط, بدون_راتب, استقطاع_جزئي
  const [newFinancialDeductionPercentage, setNewFinancialDeductionPercentage] = useState(0);
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState('فعال');

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editMaxDays, setEditMaxDays] = useState('');
  const [editAffectsIncrement, setEditAffectsIncrement] = useState(false);
  const [editAffectsPromotion, setEditAffectsPromotion] = useState(false);
  const [editAffectsCommendations, setEditAffectsCommendations] = useState(false);
  const [editSalaryPaymentType, setEditSalaryPaymentType] = useState('منح_الراتب_كامل');
  const [editFinancialDeductionPercentage, setEditFinancialDeductionPercentage] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('فعال');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });

  // Monthly Accrual Rules & Status State
  const [monthlyRegularDays, setMonthlyRegularDays] = useState('2.5');
  const [monthlySickDays, setMonthlySickDays] = useState('2.5');
  const [maxRegularCap, setMaxRegularCap] = useState('10000');
  const [maxSickCap, setMaxSickCap] = useState('10000');
  const [autoAccrualEnabled, setAutoAccrualEnabled] = useState(true);

  const [accrualStatus, setAccrualStatus] = useState(null);
  const [accrualLogs, setAccrualLogs] = useState([]);
  const [savingRules, setSavingRules] = useState(false);
  const [executingAccrual, setExecutingAccrual] = useState(false);

  useEffect(() => {
    fetchRecords();
    fetchAccrualStatus();
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

  const fetchAccrualStatus = async () => {
    try {
      const statusData = await apiClient.leaveAccrual.getStatus();
      if (statusData) {
        setAccrualStatus(statusData);
        setMonthlyRegularDays(String(statusData.monthlyRegularLeaveDays ?? '2.5'));
        setMonthlySickDays(String(statusData.monthlySickLeaveDays ?? '2.5'));
        setMaxRegularCap(String(statusData.maxRegularLeaveAccumulation ?? '10000'));
        setMaxSickCap(String(statusData.maxSickLeaveAccumulation ?? '10000'));
        setAutoAccrualEnabled(statusData.autoMonthlyLeaveAccrual !== false);
        setAccrualLogs(statusData.logs || []);
      }
    } catch (error) {
      console.warn('Could not fetch leave accrual status:', error);
    }
  };

  const handleSaveAccrualRules = async (e) => {
    if (e) e.preventDefault();
    setSavingRules(true);
    try {
      const payload = {
        monthlyRegularLeaveDays: parseFloat(monthlyRegularDays) || 0,
        monthlySickLeaveDays: parseFloat(monthlySickDays) || 0,
        maxRegularLeaveAccumulation: parseInt(maxRegularCap) || 10000,
        maxSickLeaveAccumulation: parseInt(maxSickCap) || 10000,
        autoMonthlyLeaveAccrual: autoAccrualEnabled
      };

      await apiClient.settings.update(payload);

      await apiClient.logs.create({
        action: 'تحديث قواعد الزيادة الشهرية للإجازات',
        details: `تحديث معدل الإجازة الاعتيادية الشهرية (${monthlyRegularDays} يوم) والمرضية (${monthlySickDays} يوم)، وتفعيل الزيادة التلقائية: ${autoAccrualEnabled ? 'نعم' : 'لا'}`
      }).catch(() => {});

      toast({
        title: 'تم حفظ القواعد بنجاح',
        description: 'تم تحديث معدلات الزيادة الشهرية وضوابط الأرصدة بنجاح.',
        variant: 'success'
      });

      fetchAccrualStatus();
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحفظ',
        description: error.message || 'تعذر حفظ القواعد',
        variant: 'destructive'
      });
    } finally {
      setSavingRules(false);
    }
  };

  const handleExecuteAccrualNow = async () => {
    if (!window.confirm(`هل أنت متأكد من تنفيذ الزيادة الشهرية للأرصدة الآن؟\nسيتم إضافة (+${monthlyRegularDays} يوم اعتيادية) و (+${monthlySickDays} يوم مرضية) لكافة الموظفين المستمرين بالخدمة.`)) {
      return;
    }

    setExecutingAccrual(true);
    try {
      const res = await apiClient.leaveAccrual.execute({ force: true });
      if (res.success) {
        toast({
          title: 'تم تطبيق الزيادة الشهرية بنجاح',
          description: `تمت زيادة أرصدة ${res.employeesCount} موظفاً بنجاح لشهر ${res.month}.`,
          variant: 'success'
        });
        fetchAccrualStatus();
      }
    } catch (error) {
      toast({
        title: 'خطأ في تنفيذ الزيادة الشهرية',
        description: error.message || 'تعذر تطبيق الزيادة',
        variant: 'destructive'
      });
    } finally {
      setExecutingAccrual(false);
    }
  };

  const getAdminEffectSummary = (affPromo, affInc, affComm) => {
    const parts = [];
    if (affPromo) parts.push('يوقف الترفيع');
    if (affInc) parts.push('يؤخر العلاوة');
    if (affComm) parts.push('يوقف كتب الشكر');
    return parts.length > 0 ? parts.join(' و ') : 'لا_يؤثر';
  };

  const getFinancialEffectCode = (salType) => {
    if (salType === 'بدون_راتب') return 'بدون_راتب';
    if (salType === 'منح_الراتب_والمخصصات_الثابتة_فقط') return 'براتب_ومخصصات_ثابتة';
    if (salType === 'استقطاع_جزئي') return 'استقطاع_جزئي';
    return 'براتب_كامل';
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast({
        title: 'خطأ في الإدخال',
        description: 'يرجى إدخال اسم نوع الإجازة',
        variant: 'destructive',
      });
      return;
    }

    try {
      const adminEff = getAdminEffectSummary(newAffectsPromotion, newAffectsIncrement, newAffectsCommendations);
      const finEff = getFinancialEffectCode(newSalaryPaymentType);
      const finDedPct = newSalaryPaymentType === 'بدون_راتب' ? 100 : (newSalaryPaymentType === 'استقطاع_جزئي' ? parseInt(newFinancialDeductionPercentage) || 50 : 0);

      const effectsList = [];
      if (newAffectsPromotion) effectsList.push('الترفيع');
      if (newAffectsIncrement) effectsList.push('العلاوة_السنوية');
      if (newAffectsCommendations) effectsList.push('كتب_الشكر');
      effectsList.push(newSalaryPaymentType);

      const payload = {
        name: newName,
        maxDays: newMaxDays ? parseInt(newMaxDays) : null,
        affectsIncrement: newAffectsIncrement,
        affects_increment: newAffectsIncrement,
        affectsPromotion: newAffectsPromotion,
        affects_promotion: newAffectsPromotion,
        affectsCommendations: newAffectsCommendations,
        affects_commendations: newAffectsCommendations,
        salaryPaymentType: newSalaryPaymentType,
        salary_payment_type: newSalaryPaymentType,
        administrativeEffect: adminEff,
        administrative_effect: adminEff,
        financialEffect: finEff,
        financial_effect: finEff,
        financialDeductionPercentage: finDedPct,
        financial_deduction_percentage: finDedPct,
        effectsOptions: JSON.stringify(effectsList),
        effects_options: JSON.stringify(effectsList),
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
      setNewAffectsIncrement(false);
      setNewAffectsPromotion(false);
      setNewAffectsCommendations(false);
      setNewSalaryPaymentType('منح_الراتب_كامل');
      setNewFinancialDeductionPercentage(0);
      setNewDescription('');
      setNewStatus('فعال');
      setAdding(false);
      fetchRecords();

      await apiClient.logs.create({
        action: 'تعديل أنواع الإجازات',
        details: `إضافة نوع إجازة جديد (${newName} - الترفيع: ${newAffectsPromotion ? 'نعم' : 'لا'}، العلاوة: ${newAffectsIncrement ? 'نعم' : 'لا'}، كتب الشكر: ${newAffectsCommendations ? 'نعم' : 'لا'}، صرف الراتب: ${newSalaryPaymentType})`
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
    setEditMaxDays(record.maxDays || record.max_days || '');

    const isInc = Boolean(record.affectsIncrement ?? record.affects_increment ?? (
      record.administrativeEffect === 'يؤخر_العلاوة' || 
      record.administrative_effect === 'يؤخر_العلاوة' || 
      (record.administrative_effect && record.administrative_effect.includes('العلاوة'))
    ));
    const isPromo = Boolean(record.affectsPromotion ?? record.affects_promotion ?? (
      record.administrativeEffect === 'يوقف_الترفيع' || 
      record.administrative_effect === 'يوقف_الترفيع' || 
      (record.administrative_effect && record.administrative_effect.includes('الترفيع'))
    ));
    const isComm = Boolean(record.affectsCommendations ?? record.affects_commendations ?? (
      (record.administrative_effect && record.administrative_effect.includes('الشكر')) ||
      (record.effects_options && record.effects_options.includes('كتب_الشكر'))
    ));

    let salType = record.salaryPaymentType || record.salary_payment_type;
    if (!salType) {
      const fin = record.financialEffect || record.financial_effect;
      if (fin === 'بدون_راتب') salType = 'بدون_راتب';
      else if (fin === 'براتب_ومخصصات_ثابتة') salType = 'منح_الراتب_والمخصصات_الثابتة_فقط';
      else if (fin === 'استقطاع_جزئي') salType = 'استقطاع_جزئي';
      else salType = 'منح_الراتب_كامل';
    }

    setEditAffectsIncrement(isInc);
    setEditAffectsPromotion(isPromo);
    setEditAffectsCommendations(isComm);
    setEditSalaryPaymentType(salType);
    setEditFinancialDeductionPercentage(record.financialDeductionPercentage ?? record.financial_deduction_percentage ?? 0);
    setEditDescription(record.description || '');
    setEditStatus(record.status || 'فعال');
  };

  const handleSaveEdit = async (id) => {
    try {
      const adminEff = getAdminEffectSummary(editAffectsPromotion, editAffectsIncrement, editAffectsCommendations);
      const finEff = getFinancialEffectCode(editSalaryPaymentType);
      const finDedPct = editSalaryPaymentType === 'بدون_راتب' ? 100 : (editSalaryPaymentType === 'استقطاع_جزئي' ? parseInt(editFinancialDeductionPercentage) || 50 : 0);

      const effectsList = [];
      if (editAffectsPromotion) effectsList.push('الترفيع');
      if (editAffectsIncrement) effectsList.push('العلاوة_السنوية');
      if (editAffectsCommendations) effectsList.push('كتب_الشكر');
      effectsList.push(editSalaryPaymentType);

      const payload = {
        name: editName,
        maxDays: editMaxDays ? parseInt(editMaxDays) : null,
        affectsIncrement: editAffectsIncrement,
        affects_increment: editAffectsIncrement,
        affectsPromotion: editAffectsPromotion,
        affects_promotion: editAffectsPromotion,
        affectsCommendations: editAffectsCommendations,
        affects_commendations: editAffectsCommendations,
        salaryPaymentType: editSalaryPaymentType,
        salary_payment_type: editSalaryPaymentType,
        administrativeEffect: adminEff,
        administrative_effect: adminEff,
        financialEffect: finEff,
        financial_effect: finEff,
        financialDeductionPercentage: finDedPct,
        financial_deduction_percentage: finDedPct,
        effectsOptions: JSON.stringify(effectsList),
        effects_options: JSON.stringify(effectsList),
        description: editDescription,
        status: editStatus,
      };

      await apiClient.entities.LeaveType.update(id, payload);
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث نوع الإجازة وضوابط التأشير بنجاح',
        variant: 'success',
      });
      setEditingId(null);
      fetchRecords();

      await apiClient.logs.create({
        action: 'تعديل أنواع الإجازات',
        details: `تحديث نوع إجازة (${editName} - الترفيع: ${editAffectsPromotion ? 'نعم' : 'لا'}، العلاوة: ${editAffectsIncrement ? 'نعم' : 'لا'}، كتب الشكر: ${editAffectsCommendations ? 'نعم' : 'لا'}، صرف الراتب: ${editSalaryPaymentType})`
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

  const handleLoadStandardPresets = async () => {
    if (!window.confirm('هل تريد استيراد الإجازات الرسمية المعتمدة وفق قانون الخدمة المدنية العراقي مع خيارات التأثير الإداري والمالي الدقيقة؟')) return;
    setLoading(true);
    try {
      const presets = [
        { 
          name: 'إجازة اعتيادية براتب تام', 
          maxDays: 30, 
          affectsIncrement: false,
          affectsPromotion: false,
          affectsCommendations: false,
          salaryPaymentType: 'منح_الراتب_كامل',
          financialDeductionPercentage: 0,
          description: 'تُمنح للموظف براتب تام بمعدل يومين ونصف عن كل شهر خدمة فعلي متراكم.', 
          status: 'فعال' 
        },
        { 
          name: 'إجازة مرضية براتب تام', 
          maxDays: 120, 
          affectsIncrement: false,
          affectsPromotion: false,
          affectsCommendations: false,
          salaryPaymentType: 'منح_الراتب_كامل',
          financialDeductionPercentage: 0,
          description: 'تُمنح للموظف بناءً على قرار من اللجان الطبية الرسمية بحد أقصى 120 يوماً.', 
          status: 'فعال' 
        },
        { 
          name: 'إجازة حج وعمرة براتب تام', 
          maxDays: 30, 
          affectsIncrement: false,
          affectsPromotion: false,
          affectsCommendations: false,
          salaryPaymentType: 'منح_الراتب_كامل',
          financialDeductionPercentage: 0,
          description: 'تُمنح لتأدية فريضة الحج براتب تام لمرة واحدة طوال مدة الخدمة.', 
          status: 'فعال' 
        },
        { 
          name: 'إجازة أمومة ورعاية طفل', 
          maxDays: 365, 
          affectsIncrement: false,
          affectsPromotion: false,
          affectsCommendations: false,
          salaryPaymentType: 'منح_الراتب_والمخصصات_الثابتة_فقط',
          financialDeductionPercentage: 0,
          description: 'تمنح للموظفات لرعاية الطفل مع صرف الراتب الاسمي والمخصصات الثابتة فقط.', 
          status: 'فعال' 
        },
        { 
          name: 'إجازة دراسية لتطوير الكفاءات', 
          maxDays: 730, 
          affectsIncrement: false,
          affectsPromotion: false,
          affectsCommendations: true,
          salaryPaymentType: 'منح_الراتب_والمخصصات_الثابتة_فقط',
          financialDeductionPercentage: 0,
          description: 'تُمنح للمقبولين في الدراسات العليا وتوقف منح كتب الشكر والتقدير أثناء مدة الإجازة.', 
          status: 'فعال' 
        },
        { 
          name: 'إجازة بدون راتب (طارئة / مصاحبة)', 
          maxDays: 365, 
          affectsIncrement: true,
          affectsPromotion: true,
          affectsCommendations: true,
          salaryPaymentType: 'بدون_راتب',
          financialDeductionPercentage: 100,
          description: 'إجازة استثنائية بدون راتب توقف الترفيع وتؤخر العلاوة وتوقف منح كتب الشكر والتقدير.', 
          status: 'فعال' 
        },
      ];

      for (const item of presets) {
        await apiClient.entities.LeaveType.create(item);
      }

      toast({
        title: 'تم استيراد الإجازات الرسمية',
        description: 'تمت تعبئة إجازات الخدمة المدنية العراقية المحدثة بنجاح.',
        variant: 'success',
      });
      fetchRecords();
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

  const currentMonthStr = accrualStatus?.currentMonth || new Date().toISOString().slice(0, 7);
  const isAccruedForCurrentMonth = accrualStatus?.lastLeaveAccrualMonth === currentMonthStr;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-[#1B3A6B]/10 text-[#1B3A6B]">
              <CalendarDays size={22} />
            </div>
            <h2 className="text-xl font-bold text-[#1B3A6B]">دليل أنواع الإجازات</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            إدارة أنواع الإجازات والآثار الإدارية والمالية، وضوابط الإضافة الشهرية التلقائية وتراكم الأرصدة السنوية.
          </p>
        </div>
      </div>
      
      {/* 1. قسم قواعد وضوابط الزيادة الشهرية التلقائية لأرصدة الإجازات */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <CalendarDays size={18} />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#1B3A6B]">قواعد وضوابط الزيادة الشهرية التلقائية لأرصدة الإجازات</h2>
                <p className="text-xs text-slate-500 mt-0.5">تحديد عدد الأيام المضافة شهرياً للإجازات الاعتيادية والمرضية وتفعيل الترحيل الآلي للأرصدة</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAccruedForCurrentMonth ? (
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold">
                <CheckCircle2 size={13} />
                تم ترحيل شهر {currentMonthStr}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-bold">
                <Clock size={13} />
                بانتظار دورة ترحيل شهر {currentMonthStr}
              </span>
            )}
          </div>
        </div>

        {/* نموذج إدخال قيم الزيادة الشهرية والحدود القصوى */}
        <form onSubmit={handleSaveAccrualRules} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* الحقل 1: الإجازة الاعتيادية المضافة شهرياً */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                الإجازة الاعتيادية المضافة شهرياً (يوم/شهر) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={monthlyRegularDays}
                  onChange={(e) => setMonthlyRegularDays(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20"
                  placeholder="2.5"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم / شهر</span>
              </div>
              <p className="text-[10px] text-slate-400">القانون العراقي: يومين ونصف (2.5) شهرياً</p>
            </div>

            {/* الحقل 2: الإجازة المرضية المضافة شهرياً */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                الإجازة المرضية المضافة شهرياً (يوم/شهر) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={monthlySickDays}
                  onChange={(e) => setMonthlySickDays(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-600/20"
                  placeholder="2.5"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم / شهر</span>
              </div>
              <p className="text-[10px] text-slate-400">تضاف للرصيد المرضي المعتمد براتب تام</p>
            </div>

            {/* الحقل 3: الحد الأقصى لتراكم الإجازة الاعتيادية */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                الحد الأقصى لتراكم الاعتيادية (يوم)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={maxRegularCap}
                  onChange={(e) => setMaxRegularCap(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#1B3A6B]/20"
                  placeholder="10000"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم كحد أقصى</span>
              </div>
              <p className="text-[10px] text-slate-400">إدخال يدوي (الافتراضي 10,000 يوم)</p>
            </div>

            {/* الحقل 4: الحد الأقصى لتراكم الإجازة المرضية */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                الحد الأقصى لتراكم المرضية (يوم)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={maxSickCap}
                  onChange={(e) => setMaxSickCap(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#1B3A6B]/20"
                  placeholder="10000"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم كحد أقصى</span>
              </div>
              <p className="text-[10px] text-slate-400">الحد الأقصى التراكمي للرصيد المرضي</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={autoAccrualEnabled}
                onChange={(e) => setAutoAccrualEnabled(e.target.checked)}
                className="rounded text-[#1B3A6B] focus:ring-[#1B3A6B] w-4 h-4"
              />
              <span>تفعيل الزيادة والترحيل الشهري التلقائي في بداية كل شهر تقويمي</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExecuteAccrualNow}
                disabled={executingAccrual}
                className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              >
                {executingAccrual ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />}
                تنفيذ الزيادة الشهرية للأرصدة يدوياً الآن
              </button>

              <button
                type="submit"
                disabled={savingRules}
                className="bg-[#1B3A6B] hover:bg-[#152d54] disabled:opacity-50 text-white rounded-xl px-5 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              >
                {savingRules ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                حفظ ضوابط الأرصدة
              </button>
            </div>
          </div>
        </form>

        {/* سجل العمليات السابقة للترحيل الشهري */}
        {accrualLogs.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <History size={14} className="text-[#1B3A6B]" />
                سجل عمليات الترحيل والزيادة الشهرية الأخيرة:
              </span>
              <span className="text-[11px] text-slate-400">توثيق تاريخي آلي</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">الشهر المستهدف</th>
                    <th className="px-3 py-2">عدد الموظفين المعالجين</th>
                    <th className="px-3 py-2">الزيادة الاعتيادية</th>
                    <th className="px-3 py-2">الزيادة المرضية</th>
                    <th className="px-3 py-2">المنفذ</th>
                    <th className="px-3 py-2">تاريخ ووقت التنفيذ</th>
                    <th className="px-3 py-2 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {accrualLogs.slice(0, 5).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-bold font-mono text-[#1B3A6B]">{log.month}</td>
                      <td className="px-3 py-2 font-bold">{log.employeesCount} موظفاً</td>
                      <td className="px-3 py-2 font-mono text-emerald-700 font-bold">+{log.regularDaysAdded} يوم</td>
                      <td className="px-3 py-2 font-mono text-emerald-700 font-bold">+{log.sickDaysAdded} يوم</td>
                      <td className="px-3 py-2 text-slate-600">{log.triggeredBy}</td>
                      <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('ar-IQ') : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold">
                          {log.status || 'ناجح'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 2. قسم دليل وأنواع الإجازات السنوية القائمة */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">دليل أنواع الإجازات السنوية المعتمدة</h3>
            <p className="text-xs text-slate-500 mt-0.5">تحديد مسميات الإجازات وضوابط التأشير الإداري (العلاوة، الترفيع، كتب الشكر) والأثر المالي على الراتب.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLoadStandardPresets}
              className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5"
              title="استيراد إجازات الخدمة المدنية العراقية القياسية"
            >
              <Sparkles size={14} className="text-amber-600" />
              استيراد الإجازات الرسمية (الخدمة المدنية)
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus size={14} />
              إضافة نوع إجازة جديد
            </button>
          </div>
        </div>

        {/* إضافة نوع إجازة جديد */}
        {adding && (
          <form onSubmit={handleAdd} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2">
                <Plus size={16} /> إضافة نوع إجازة جديد وتحديد ضوابط التأشير
              </h4>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block">اسم الإجازة *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: إجازة اعتيادية، إجازة دراسية، إجازة مصاحبة"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">الحد الأقصى للأيام السنوية</label>
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

            {/* الأثر الإداري (خيارات التأشير المطلوبة) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-[#1B3A6B]" />
                <span className="text-xs font-bold text-slate-800">الأثر الإداري (اختر التأثيرات المترتبة على هذه الإجازة):</span>
              </div>
              <p className="text-[11px] text-slate-500">قم بتأشير الخيارات التي تتوقف أو تتأثر للموظف خلال فترة تمتعه بهذه الإجازة:</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {/* 1. العلاوة السنوية */}
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newAffectsIncrement 
                    ? 'bg-amber-50/70 border-amber-300 text-amber-900' 
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60 text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={newAffectsIncrement}
                    onChange={(e) => setNewAffectsIncrement(e.target.checked)}
                    className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block">تؤخر / توقف العلاوة السنوية</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">تأخير استحقاق العلاوة بمقدار مدة الإجازة</span>
                  </div>
                </label>

                {/* 2. الترفيع */}
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newAffectsPromotion 
                    ? 'bg-rose-50/70 border-rose-300 text-rose-900' 
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60 text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={newAffectsPromotion}
                    onChange={(e) => setNewAffectsPromotion(e.target.checked)}
                    className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block">توقف الترفيع واحتساب القدم</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">لا تحتسب المدة خدمة لأغراض الترقية</span>
                  </div>
                </label>

                {/* 3. كتب الشكر والتقدير */}
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newAffectsCommendations 
                    ? 'bg-purple-50/70 border-purple-300 text-purple-900' 
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60 text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={newAffectsCommendations}
                    onChange={(e) => setNewAffectsCommendations(e.target.checked)}
                    className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block">توقف منح كتب الشكر والتقدير</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">عدم جواز منح أو احتساب كتب الشكر أثنائها</span>
                  </div>
                </label>
              </div>
            </div>

            {/* الأثر المالي وصرف الراتب (خيارات الراتب المطلوبة) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Banknote size={16} className="text-emerald-700" />
                <span className="text-xs font-bold text-slate-800">الأثر المالي وضوابط صرف الراتب:</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                {/* 1. منح الراتب كامل */}
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newSalaryPaymentType === 'منح_الراتب_كامل'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60 text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="newSalaryPaymentType"
                    value="منح_الراتب_كامل"
                    checked={newSalaryPaymentType === 'منح_الراتب_كامل'}
                    onChange={(e) => setNewSalaryPaymentType(e.target.value)}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block">منح الراتب كامل</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">الراتب الاسمي + كافة المخصصات</span>
                  </div>
                </label>

                {/* 2. منح الراتب والمخصصات الثابتة فقط */}
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newSalaryPaymentType === 'منح_الراتب_والمخصصات_الثابتة_فقط'
                    ? 'bg-blue-50 border-blue-400 text-blue-950 font-bold'
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60 text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="newSalaryPaymentType"
                    value="منح_الراتب_والمخصصات_الثابتة_فقط"
                    checked={newSalaryPaymentType === 'منح_الراتب_والمخصصات_الثابتة_فقط'}
                    onChange={(e) => setNewSalaryPaymentType(e.target.value)}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block">منح الراتب والمخصصات الثابتة فقط</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">الراتب الاسمي + الثابتة (دون المتغيرة)</span>
                  </div>
                </label>

                {/* 3. بدون راتب */}
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newSalaryPaymentType === 'بدون_راتب'
                    ? 'bg-rose-50 border-rose-400 text-rose-950 font-bold'
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60 text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="newSalaryPaymentType"
                    value="بدون_راتب"
                    checked={newSalaryPaymentType === 'بدون_راتب'}
                    onChange={(e) => setNewSalaryPaymentType(e.target.value)}
                    className="mt-0.5 text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block">بدون راتب (100%)</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">استقطاع تام خلال فترة الإجازة</span>
                  </div>
                </label>

                {/* 4. استقطاع جزئي */}
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newSalaryPaymentType === 'استقطاع_جزئي'
                    ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold'
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60 text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="newSalaryPaymentType"
                    value="استقطاع_جزئي"
                    checked={newSalaryPaymentType === 'استقطاع_جزئي'}
                    onChange={(e) => setNewSalaryPaymentType(e.target.value)}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                  <div className="w-full">
                    <span className="text-xs font-bold block">استقطاع جزئي (%)</span>
                    {newSalaryPaymentType === 'استقطاع_جزئي' && (
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={newFinancialDeductionPercentage}
                          onChange={(e) => setNewFinancialDeductionPercentage(e.target.value)}
                          placeholder="50"
                          className="w-14 bg-white border border-amber-300 rounded px-1 py-0.5 text-xs text-center font-bold"
                        />
                        <span className="text-[10px] text-amber-800 font-bold">% خصم</span>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">الوصف والشروط المعتمدة</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                placeholder="اكتب تفاصيل إضافية حول شروط منح الإجازة وسندها القانوني..."
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-medium"
              />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold rounded-xl px-4 py-2 text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="bg-[#1B3A6B] hover:bg-[#152d54] text-white font-bold rounded-xl px-5 py-2 text-xs transition-colors shadow-xs"
              >
                إضافة الإجازة
              </button>
            </div>
          </form>
        )}

        {/* جدول أنواع الإجازات */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <RefreshCw className="animate-spin text-[#1B3A6B]" size={24} />
            <span className="text-xs text-slate-500 font-medium">جاري تحميل أنواع الإجازات...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <p className="text-sm text-slate-500">لا يوجد أنواع إجازات معرفة حالياً في النظام.</p>
            <p className="text-xs text-slate-400 mt-1">يمكنك إضافة أنواع إجازات مخصصة أو استيراد الإجازات الرسمية المعتمدة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">اسم نوع الإجازة</th>
                  <th className="px-4 py-3">الحد الأقصى</th>
                  <th className="px-4 py-3">الأثر الإداري (خيارات التأشير)</th>
                  <th className="px-4 py-3">الأثر المالي وضوابط الراتب</th>
                  <th className="px-4 py-3">الوصف والشروط</th>
                  <th className="px-4 py-3 text-center">الحالة</th>
                  <th className="px-4 py-3 text-left">التحكم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-slate-700">
                {records.map((r) => {
                  const isEditing = editingId === r.id;
                  const isPaused = r.status === 'متوقف مؤقتاً';
                  
                  const isInc = Boolean(r.affectsIncrement ?? r.affects_increment ?? (
                    r.administrativeEffect === 'يؤخر_العلاوة' || 
                    r.administrative_effect === 'يؤخر_العلاوة' || 
                    (r.administrative_effect && r.administrative_effect.includes('العلاوة'))
                  ));
                  const isPromo = Boolean(r.affectsPromotion ?? r.affects_promotion ?? (
                    r.administrativeEffect === 'يوقف_الترفيع' || 
                    r.administrative_effect === 'يوقف_الترفيع' || 
                    (r.administrative_effect && r.administrative_effect.includes('الترفيع'))
                  ));
                  const isComm = Boolean(r.affectsCommendations ?? r.affects_commendations ?? (
                    (r.administrative_effect && r.administrative_effect.includes('الشكر')) ||
                    (r.effects_options && r.effects_options.includes('كتب_الشكر'))
                  ));

                  let salType = r.salaryPaymentType || r.salary_payment_type;
                  if (!salType) {
                    const fin = r.financialEffect || r.financial_effect;
                    if (fin === 'بدون_راتب') salType = 'بدون_راتب';
                    else if (fin === 'براتب_ومخصصات_ثابتة') salType = 'منح_الراتب_والمخصصات_الثابتة_فقط';
                    else if (fin === 'استقطاع_جزئي') salType = 'استقطاع_جزئي';
                    else salType = 'منح_الراتب_كامل';
                  }

                  const finDed = r.financialDeductionPercentage ?? r.financial_deduction_percentage ?? 0;

                  return (
                    <tr key={r.id} className={`hover:bg-slate-50/50 transition-colors ${isPaused ? 'bg-slate-50/40 text-slate-400' : ''}`}>
                      {/* 1. اسم الإجازة */}
                      <td className="px-4 py-3 font-semibold text-slate-800 min-w-[170px]">
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

                      {/* 2. الحد الأقصى للأيام */}
                      <td className="px-4 py-3 text-slate-600 font-mono font-bold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editMaxDays}
                            onChange={(e) => setEditMaxDays(e.target.value)}
                            placeholder="غير محدد"
                            className="bg-white border border-slate-200 rounded p-1 text-xs w-20 text-center"
                          />
                        ) : (
                          r.maxDays || r.max_days ? `${r.maxDays || r.max_days} يوم` : 'مفتوح'
                        )}
                      </td>

                      {/* 3. الأثر الإداري (خيارات التأشير) */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex flex-col gap-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editAffectsPromotion}
                                onChange={(e) => setEditAffectsPromotion(e.target.checked)}
                                className="rounded text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                              />
                              <span>يوقف الترفيع</span>
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editAffectsIncrement}
                                onChange={(e) => setEditAffectsIncrement(e.target.checked)}
                                className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                              />
                              <span>يؤخر العلاوة</span>
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editAffectsCommendations}
                                onChange={(e) => setEditAffectsCommendations(e.target.checked)}
                                className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                              />
                              <span>يوقف كتب الشكر</span>
                            </label>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1 items-center">
                            {isPromo && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <TrendingUp size={10} className="rotate-180" />
                                توقف الترفيع
                              </span>
                            )}
                            {isInc && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock size={10} />
                                تؤخر العلاوة
                              </span>
                            )}
                            {isComm && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                <Award size={10} />
                                توقف كتب الشكر
                              </span>
                            )}
                            {!isPromo && !isInc && !isComm && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check size={10} />
                                لا يؤثر إدارياً
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 4. الأثر المالي وضوابط الراتب */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="space-y-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <select
                              value={editSalaryPaymentType}
                              onChange={(e) => setEditSalaryPaymentType(e.target.value)}
                              className="bg-white border border-slate-200 rounded p-1 text-xs font-bold w-full"
                            >
                              <option value="منح_الراتب_كامل">منح الراتب كامل</option>
                              <option value="منح_الراتب_والمخصصات_الثابتة_فقط">منح الراتب والمخصصات الثابتة فقط</option>
                              <option value="بدون_راتب">بدون راتب (استقطاع 100%)</option>
                              <option value="استقطاع_جزئي">استقطاع جزئي (%)</option>
                            </select>
                            {editSalaryPaymentType === 'استقطاع_جزئي' && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500 font-bold">النسبة:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="99"
                                  value={editFinancialDeductionPercentage}
                                  onChange={(e) => setEditFinancialDeductionPercentage(e.target.value)}
                                  className="bg-white border border-slate-200 rounded p-0.5 text-xs w-14 text-center font-bold"
                                  placeholder="50%"
                                />
                                <span className="text-[10px] text-slate-500 font-bold">%</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            {salType === 'منح_الراتب_كامل' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <Banknote size={11} />
                                منح الراتب كامل
                              </span>
                            )}
                            {salType === 'منح_الراتب_والمخصصات_الثابتة_فقط' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                <Banknote size={11} />
                                الراتب والمخصصات الثابتة فقط
                              </span>
                            )}
                            {salType === 'بدون_راتب' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <AlertTriangle size={11} />
                                بدون راتب (100%)
                              </span>
                            )}
                            {salType === 'استقطاع_جزئي' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Banknote size={11} />
                                استقطاع جزئي ({finDed}%)
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. الوصف */}
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate" title={r.description}>
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

                      {/* 6. الحالة */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
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

                      {/* 7. أزرار التحكم */}
                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(r.id)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 p-1.5 rounded-lg transition-colors border border-emerald-200"
                              title="حفظ"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors border border-slate-200"
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
      </div>

      {/* مودال تأكيد الحذف */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 pointer-events-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
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
