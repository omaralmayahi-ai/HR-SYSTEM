import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { 
  ShieldAlert, 
  Settings2, 
  Save, 
  Clock, 
  UserPlus, 
  AlertTriangle,
  Check,
  UserCheck,
  X,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function FinancialRulesSettings() {
  const { toast } = useToast();
  const { setAppPublicSettings } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Settings Form States
  const [maxChildrenCount, setMaxChildrenCount] = useState(4);
  const [retirementAge, setRetirementAge] = useState(60);
  const [retirementNotificationPeriod, setRetirementNotificationPeriod] = useState('three_months');
  const [retirementNotificationDays, setRetirementNotificationDays] = useState(90);

  // Employees approaching retirement state
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  // Modal State for service extension
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [extensionOrderNumber, setExtensionOrderNumber] = useState('');
  const [extensionOrderDate, setExtensionOrderDate] = useState('');
  const [extensionYears, setExtensionYears] = useState(1);
  const [extensionMonths, setExtensionMonths] = useState(0);
  const [extensionNote, setExtensionNote] = useState('');

  useEffect(() => {
    fetchSettings();
    fetchEmployees();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await apiClient.settings.get();
      if (data) {
        setMaxChildrenCount(data.maxChildrenCount !== undefined ? data.maxChildrenCount : (data.max_children_count !== undefined ? data.max_children_count : 4));
        setRetirementAge(data.retirementAge !== undefined ? data.retirementAge : (data.retirement_age !== undefined ? data.retirement_age : 60));
        setRetirementNotificationPeriod(data.retirementNotificationPeriod || data.retirement_notification_period || 'three_months');
        setRetirementNotificationDays(data.retirementNotificationDays !== undefined ? data.retirementNotificationDays : (data.retirement_notification_days !== undefined ? data.retirement_notification_days : 90));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: 'خطأ في التحميل',
        description: 'تعذر تحميل الإعدادات المالية للتقاعد',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const data = await apiClient.entities.Employee.list();
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast({
        title: 'خطأ في التحميل',
        description: 'تعذر تحميل قائمة الموظفين لفحص التقاعد',
        variant: 'destructive',
      });
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // sync notification days based on period option
      let days = retirementNotificationDays;
      if (retirementNotificationPeriod === 'one_month') days = 30;
      else if (retirementNotificationPeriod === 'three_months') days = 90;
      else if (retirementNotificationPeriod === 'six_months') days = 180;
      else if (retirementNotificationPeriod === 'one_year') days = 365;

      const payload = {
        maxChildrenCount: parseInt(maxChildrenCount) || 4,
        retirementAge: parseInt(retirementAge) || 60,
        retirementNotificationPeriod,
        retirementNotificationDays: parseInt(days) || 90,
      };

      const updated = await apiClient.settings.update(payload);
      setAppPublicSettings(updated);
      
      // Save instantly to localStorage
      localStorage.setItem('SYSTEM_SETTINGS_PRESETS', JSON.stringify(updated));

      // Log action
      await apiClient.logs.create({
        action: 'تحديث قواعد التقاعد والمخصصات',
        details: `تحديث قواعد النظام (الحد الأقصى للأطفال: ${maxChildrenCount}، سن التقاعد: ${retirementAge} سنة، فترة الإشعار: ${retirementNotificationPeriod === 'custom_days' ? days + ' يوم' : retirementNotificationPeriod})`
      }).catch(() => {});

      toast({
        title: 'تم حفظ الإعدادات',
        description: 'تم تحديث الضوابط المالية وسن التقاعد بنجاح عبر النظام.',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'خطأ أثناء الحفظ',
        description: error.message || 'فشل تحديث الإعدادات القانونية والمالية',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Service Extension Submission
  const handleExtendService = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    if (!extensionOrderNumber.trim() || !extensionOrderDate) {
      toast({
        title: 'بيانات غير مكتملة',
        description: 'يرجى إدخال رقم وتاريخ الأمر الخاص بالتمديد',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Calculate new extension totals
      const currentYears = selectedEmployee.retirementExtensionYears !== undefined ? selectedEmployee.retirementExtensionYears : (selectedEmployee.retirementExtensionYears || 0);
      const currentMonths = selectedEmployee.retirementExtensionMonths !== undefined ? selectedEmployee.retirementExtensionMonths : (selectedEmployee.retirementExtensionMonths || 0);
      
      const newYears = currentYears + (parseInt(extensionYears) || 0);
      const newMonths = currentMonths + (parseInt(extensionMonths) || 0);

      const payload = {
        retirementExtensionOrderNumber: extensionOrderNumber,
        retirementExtensionOrderDate: extensionOrderDate,
        retirementExtensionYears: newYears,
        retirementExtensionMonths: newMonths,
        retirementExtensionNote: extensionNote,
      };

      await apiClient.entities.Employee.update(selectedEmployee.id, payload);
      
      toast({
        title: 'تم التمديد بنجاح',
        description: `تم تمديد خدمة الموظف "${selectedEmployee.name || selectedEmployee.fullName}" وتحديث موعد تقاعده.`,
        variant: 'success',
      });

      // Log action
      await apiClient.logs.create({
        action: 'تمديد الخدمة الوظيفية',
        details: `تمديد الخدمة للموظف (${selectedEmployee.name || selectedEmployee.fullName}) بموجب الأمر رقم (${extensionOrderNumber}) بتاريخ (${extensionOrderDate}) ولمدة إضافية: ${extensionYears} سنة و ${extensionMonths} شهر.${extensionNote ? ' سبب التأجيل: ' + extensionNote : ''}`
      }).catch(() => {});

      // Reset Modal & Refresh
      setSelectedEmployee(null);
      setExtensionOrderNumber('');
      setExtensionOrderDate('');
      setExtensionYears(1);
      setExtensionMonths(0);
      setExtensionNote('');
      fetchEmployees();
    } catch (error) {
      console.error('Error updating employee retirement:', error);
      toast({
        title: 'خطأ أثناء التحديث',
        description: error.message || 'تعذر تمديد الخدمة للموظف',
        variant: 'destructive',
      });
    }
  };

  // Calculation Helper
  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    // try standard formats
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) return d;

    // manual split for DD-MM-YYYY or DD/MM/YYYY
    const parts = cleanStr.split(/[-/]/);
    if (parts.length === 3) {
      // check if first part is Year
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
      // assuming DD-MM-YYYY
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return null;
  };

  const getRetirementDetails = (employee) => {
    const birthDateStr = employee.birth_date || employee.birthDate;
    const bDate = parseDate(birthDateStr);
    if (!bDate) return null;

    const rAge = parseInt(retirementAge) || 60;
    
    // Get extension values
    const extYears = employee.retirement_extension_years !== undefined 
      ? employee.retirement_extension_years 
      : (employee.retirementExtensionYears !== undefined ? employee.retirementExtensionYears : 0);
    const extMonths = employee.retirement_extension_months !== undefined 
      ? employee.retirement_extension_months 
      : (employee.retirementExtensionMonths !== undefined ? employee.retirementExtensionMonths : 0);

    // Basic retirement is birth date + retirementAge
    let rYear = bDate.getFullYear() + rAge;
    let rMonth = bDate.getMonth();
    let rDay = bDate.getDate();

    // Add extensions
    rYear += parseInt(extYears) || 0;
    rMonth += parseInt(extMonths) || 0;

    const retirementDate = new Date(rYear, rMonth, rDay);
    const today = new Date();
    
    // difference in days
    const diffTime = retirementDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      retirementDate,
      diffDays,
      hasExtended: extYears > 0 || extMonths > 0,
      extYears,
      extMonths,
      orderNumber: employee.retirement_extension_order_number || employee.retirementExtensionOrderNumber,
      orderDate: employee.retirement_extension_order_date || employee.retirementExtensionOrderDate,
      extensionNote: employee.retirement_extension_note || employee.retirementExtensionNote
    };
  };

  // Get Threshold In Days
  const getNotificationThreshold = () => {
    if (retirementNotificationPeriod === 'one_month') return 30;
    if (retirementNotificationPeriod === 'three_months') return 90;
    if (retirementNotificationPeriod === 'six_months') return 180;
    if (retirementNotificationPeriod === 'one_year') return 365;
    return parseInt(retirementNotificationDays) || 90;
  };

  // Filter employees approaching retirement
  const thresholdDays = getNotificationThreshold();
  const approachingEmployees = employees
    .map(emp => {
      const details = getRetirementDetails(emp);
      return { emp, details };
    })
    .filter(item => {
      if (!item.details) return false;
      // Show if remaining days are less than threshold, but within -365 days (recently retired is fine to keep showing)
      return item.details.diffDays <= thresholdDays && item.details.diffDays >= -365;
    })
    .sort((a, b) => a.details.diffDays - b.details.diffDays);

  return (
    <div className="space-y-6">
      {/* 1. Global Configuration Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Settings2 className="text-[#1B3A6B]" size={20} />
            ضوابط الاحتساب المالي والتقاعد القانوني
          </h2>
          <p className="text-xs text-slate-500 mt-1">تحديد السن القانونية للتقاعد وتدقيق الموظفين المقتربين لتعديل أو تمديد خدمتهم الوظيفية.</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <RefreshCw className="animate-spin text-[#1B3A6B]" size={24} />
            <span className="text-xs text-slate-500">جاري تحميل الضوابط...</span>
          </div>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Retirement Age */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">السن القانونية للتقاعد (سنوات)</label>
                <input
                  type="number"
                  min="30"
                  max="100"
                  value={retirementAge}
                  onChange={(e) => setRetirementAge(e.target.value)}
                  placeholder="الافتراضي: 60"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 focus:bg-white text-slate-800 font-bold transition-all"
                />
                <p className="text-[10px] text-slate-400">السن الرسمي لإحالة الموظف إلى التقاعد في العراق (مثلاً 60 أو 63 سنة).</p>
              </div>

              {/* Notification Period */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">مدة إرسال إشعار اقتراب التقاعد</label>
                <select
                  value={retirementNotificationPeriod}
                  onChange={(e) => setRetirementNotificationPeriod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 focus:bg-white text-slate-800 font-bold transition-all"
                >
                  <option value="one_month">قبل شهر (30 يوم)</option>
                  <option value="three_months">قبل ثلاثة أشهر (90 يوم)</option>
                  <option value="six_months">قبل ستة أشهر (180 يوم)</option>
                  <option value="one_year">قبل سنة كاملة (365 يوم)</option>
                  <option value="custom_days">تحديد يدوي بالأيام...</option>
                </select>
                <p className="text-[10px] text-slate-400">تحديد متى يظهر الموظف في قائمة الموظفين القريبين من التقاعد.</p>
              </div>

              {/* Custom Days Input */}
              {retirementNotificationPeriod === 'custom_days' && (
                <div className="space-y-2 animate-fadeIn">
                  <label className="text-xs font-bold text-slate-700 block">المدة اليدوية للإشعار (بالأيام)</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={retirementNotificationDays}
                    onChange={(e) => setRetirementNotificationDays(e.target.value)}
                    placeholder="أدخل عدد الأيام"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 focus:bg-white text-slate-800 font-bold transition-all"
                  />
                  <p className="text-[10px] text-slate-400">سيتم فحص اقتراب التقاعد بناءً على هذه الأيام بالضبط.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold rounded-xl px-6 py-2.5 text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                حفظ ضوابط وقوانين الاحتساب
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 2. List of Employees Approaching Retirement */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShieldAlert className="text-amber-500 animate-pulse" size={20} />
              الموظفون المقتربون أو البالغون للسن القانونية للتقاعد
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              استعراض الموظفين المشمولين بالإشعار ({thresholdDays} يوم) أو الذين تجاوزوا سن التقاعد ({retirementAge} سنة) دون تمديد أو إحالة للتقاعد.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/service-management"
              className="bg-[#1B3A6B] hover:bg-[#2a4f8f] text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
            >
              الانتقال إلى صفحة إدارة الخدمة والتمديدات
            </a>
            <div className="bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold px-3 py-1.5 rounded-xl">
              إجمالي المشمولين: {approachingEmployees.length} موظف
            </div>
          </div>
        </div>

        {employeesLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <RefreshCw className="animate-spin text-[#1B3A6B]" size={24} />
            <span className="text-xs text-slate-500">جاري فحص وتدقيق أعمار الموظفين...</span>
          </div>
        ) : approachingEmployees.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <UserCheck size={20} />
            </div>
            <p className="text-xs font-bold text-slate-600">كل الكوادر بعيدة حالياً عن سن التقاعد المحددة.</p>
            <p className="text-[10px] text-slate-400 mt-1">لا توجد إشعارات تقاعد مستحقة ضمن المدة المحددة ({thresholdDays} يوم).</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">الموظف</th>
                  <th className="px-4 py-3">القسم / الدائرة</th>
                  <th className="px-4 py-3">تاريخ الميلاد</th>
                  <th className="px-4 py-3">تاريخ التقاعد المقدر</th>
                  <th className="px-4 py-3">الوضع والمدة المتبقية</th>
                  <th className="px-4 py-3">حالة التمديد الحالية</th>
                  <th className="px-4 py-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-slate-700">
                {approachingEmployees.map(({ emp, details }) => {
                  const isPassed = details.diffDays < 0;
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {emp.photo ? (
                            <img src={emp.photo} alt={emp.full_name || emp.fullName || emp.name} className="w-8 h-8 rounded-full object-cover border border-slate-200" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#1B3A6B]/10 text-[#1B3A6B] flex items-center justify-center font-bold text-xs">
                              {(emp.full_name || emp.fullName || emp.name || '?').charAt(0)}
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-slate-800 block">{emp.full_name || emp.fullName || emp.name || '—'}</span>
                            <span className="text-[10px] text-slate-400 block">رقم الشركة: {emp.company_number || emp.companyNumber || emp.civil_service_number || emp.employee_number || emp.id || 'غير مدرج'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{emp.department || 'إدارة شؤون الموظفين'}</span>
                        <span className="text-[10px] text-slate-400 block">{emp.job_title || emp.jobTitle || 'موظف'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-600">
                        {emp.birth_date || emp.birthDate}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {details.retirementDate.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        {isPassed ? (
                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            <AlertTriangle size={12} />
                            تجاوز السن بـ {Math.abs(details.diffDays)} يوم
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            <Clock size={12} />
                            متبقي {details.diffDays} يوم للتقاعد
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {details.hasExtended ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              <Check size={10} />
                              ممدد لـ {details.extYears} سنة و {details.extMonths} شهر
                            </span>
                            <span className="text-[9px] text-slate-400 block leading-tight">الأمر: {details.orderNumber} ({details.orderDate})</span>
                            {details.extensionNote && (
                              <span className="text-[10px] text-slate-600 bg-slate-50 border border-slate-100 rounded px-2 py-1 mt-1 block leading-normal font-medium">
                                <span className="font-bold text-slate-700">الملاحظة:</span> {details.extensionNote}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">لا يوجد تمديد مسبق</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setExtensionOrderNumber(emp.retirement_extension_order_number || emp.retirementExtensionOrderNumber || '');
                            setExtensionOrderDate(emp.retirement_extension_order_date || emp.retirementExtensionOrderDate || '');
                            setExtensionYears(1);
                            setExtensionMonths(0);
                            setExtensionNote(emp.retirement_extension_note || emp.retirementExtensionNote || '');
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all flex items-center gap-1 mx-auto shadow-sm"
                        >
                          <UserPlus size={12} />
                          تمديد الخدمة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Extension dialog (overlay modal) */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn" dir="rtl">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#1B3A6B] text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold">تمديد الخدمة وتأجيل الإحالة للتقاعد</h3>
                <p className="text-[11px] text-white/80 mt-1">تأجيل تاريخ التقاعد للموظف: {selectedEmployee.full_name || selectedEmployee.fullName || selectedEmployee.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleExtendService} className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-amber-800 text-[11px] font-medium leading-relaxed">
                سيتم إضافة مدة التمديد الحالية إلى تاريخ التقاعد الأساسي المحسوب من تاريخ الميلاد والسن القانونية للتقاعد.
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Order Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">رقم الأمر الإداري الخاص بالتمديد *</label>
                  <input
                    type="text"
                    required
                    value={extensionOrderNumber}
                    onChange={(e) => setExtensionOrderNumber(e.target.value)}
                    placeholder="مثال: ق/4352"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-bold"
                  />
                </div>

                {/* Order Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">تاريخ الأمر الإداري *</label>
                  <input
                    type="date"
                    required
                    value={extensionOrderDate}
                    onChange={(e) => setExtensionOrderDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Extension Years */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">مدة التمديد المضافة (بالسنوات)</label>
                  <select
                    value={extensionYears}
                    onChange={(e) => setExtensionYears(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-bold"
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map(y => (
                      <option key={y} value={y}>{y === 0 ? 'بلا تمديد' : `${y} سنة`}</option>
                    ))}
                  </select>
                </div>

                {/* Extension Months */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">مدة التمديد المضافة (بالأشهر)</label>
                  <select
                    value={extensionMonths}
                    onChange={(e) => setExtensionMonths(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 font-bold"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => (
                      <option key={m} value={m}>{m} أشهر</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Extension Note / Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">ملاحظة / سبب تأجيل الإحالة للتقاعد</label>
                <textarea
                  value={extensionNote}
                  onChange={(e) => setExtensionNote(e.target.value)}
                  placeholder="اكتب هنا سبب تمديد الخدمة للموظف أو تفاصيل إضافية عن الأمر الإداري للتأجيل..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#1B3A6B]/20 text-slate-800 leading-relaxed font-medium resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedEmployee(null)}
                  className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold rounded-xl px-4 py-2.5 text-xs transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5 py-2.5 text-xs transition-colors shadow-sm"
                >
                  تأكيد التمديد وتحديث التقاعد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
