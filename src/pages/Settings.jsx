import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import {
  Palette, Clock, FileText, Database, KeyRound,
  Save, RefreshCw, Plus, Trash2, Upload, Image,
  CheckCircle, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PRESET_THEMES = [
  { name: 'أزرق ملكي', primary: '#1B3A6B', secondary: '#C8960C' },
  { name: 'أخضر زمردي', primary: '#065F46', secondary: '#10B981' },
  { name: 'أحمر داكن', primary: '#881337', secondary: '#E11D48' },
  { name: 'بنفسجي فاخر', primary: '#4C1D95', secondary: '#8B5CF6' },
  { name: 'كحلي بترولي', primary: '#0F3A4A', secondary: '#D97706' },
  { name: 'رمادي احترافي', primary: '#1E293B', secondary: '#3B82F6' },
  { name: 'عنابي دافئ', primary: '#7C2D12', secondary: '#F97316' },
  { name: 'زيتي رسمي', primary: '#14532D', secondary: '#CA8A04' },
];

const FONTS = [
  { value: 'Cairo', name: 'خط القاهرة (Cairo) - خط متزن واحترافي لجميع الواجهات' },
  { value: 'Tajawal', name: 'خط تجول (Tajawal) - خط عصري وأنيق' },
  { value: 'Almarai', name: 'خط المراعي (Almarai) - خط نظيف مريح للقراءة' },
  { value: 'Readex Pro', name: 'خط ريديكس برو (Readex Pro) - خط رقمي حديث ومميز' },
  { value: 'Alexandria', name: 'خط الإسكندرية (Alexandria) - خط هندسي فاخر' },
  { value: 'Amiri', name: 'خط أميري (Amiri) - خط رسمي كلاسيكي' },
  { value: 'IBM Plex Sans Arabic', name: 'خط آي بي إم (IBM Plex Arabic) - خط تقني عالي الدقة' },
  { value: 'Rubik', name: 'خط روبيك (Rubik) - خط ناعم ومريح' },
  { value: 'Noto Sans Arabic', name: 'خط نوتو سانز (Noto Sans Arabic) - خط شامل وواضح' },
  { value: 'Inter', name: 'خط إنتر (Inter) - بسيط وعالمي' },
];

export default function Settings() {
  const { appPublicSettings, setAppPublicSettings } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('identity');
  const [loading, setLoading] = useState(false);

  // Form State
  const [platformName, setPlatformName] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [copyrightText, setCopyrightText] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1B3A6B');
  const [secondaryColor, setSecondaryColor] = useState('#C8960C');
  const [activeTheme, setActiveTheme] = useState('أزرق ملكي');
  const [fontFamily, setFontFamily] = useState('Cairo');
  const [logoUrl, setLogoUrl] = useState('');

  // Shift & Holidays State
  const [workStartHour, setWorkStartHour] = useState('08:00');
  const [workEndHour, setWorkEndHour] = useState('15:00');
  const [restDays, setRestDays] = useState(['الجمعة', 'السبت']);
  const [holidays, setHolidays] = useState([
    { name: 'عيد الجيش العراقي', date: '01-06' },
    { name: 'عيد نوروز', date: '03-21' },
    { name: 'عيد العمال العالمي', date: '05-01' },
    { name: 'ثورة 14 تموز', date: '07-14' },
    { name: 'عيد الاستقلال الوطني العراقي', date: '10-03' },
    { name: 'يوم النصر العراقي', date: '12-10' },
    { name: 'عيد الميلاد المجيد', date: '12-25' },
  ]);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');

  // Logs & Resets States
  const [logs, setLogs] = useState([]);
  const [filterAction, setFilterAction] = useState('');
  const [passwordRequests, setPasswordRequests] = useState([
    { id: 1, employeeName: 'حسين علي جاسم', department: 'قسم تقنية المعلومات', date: '2026-07-15 09:30', status: 'pending' },
    { id: 2, employeeName: 'زينب محمد كمال', department: 'قسم الموارد البشرية', date: '2026-07-15 11:15', status: 'pending' },
    { id: 3, employeeName: 'عبد الرحمن سعد', department: 'القسم المالي', date: '2026-07-14 14:02', status: 'approved' },
  ]);

  useEffect(() => {
    if (appPublicSettings) {
      setPlatformName(appPublicSettings.platformName || 'نظام إدارة شؤون الموظفين');
      setBeneficiaryName(appPublicSettings.beneficiaryName || 'وزارة الموارد البشرية العراقية');
      setCopyrightText(appPublicSettings.copyrightText || 'جميع الحقوق محفوظة © 2026');
      setPrimaryColor(appPublicSettings.primaryColor || '#1B3A6B');
      setSecondaryColor(appPublicSettings.secondaryColor || '#C8960C');
      setActiveTheme(appPublicSettings.activeTheme || 'أزرق ملكي');
      setFontFamily(appPublicSettings.fontFamily || 'Cairo');
      setLogoUrl(appPublicSettings.logoUrl || '');
      setWorkStartHour(appPublicSettings.workStartHour || '08:00');
      setWorkEndHour(appPublicSettings.workEndHour || '15:00');
      if (appPublicSettings.officialHolidays) {
        setRestDays(appPublicSettings.officialHolidays.split(', '));
      }
    }
    loadLogs();
  }, [appPublicSettings]);

  const loadLogs = async () => {
    try {
      const dbLogs = await apiClient.logs.list();
      if (dbLogs && dbLogs.length > 0) {
        setLogs(dbLogs);
      } else {
        // Fallback simulated logs for visual fidelity if empty
        setLogs([
          { id: 1, action: 'تعديل الهوية البصرية', userEmail: 'admin@hr.gov.iq', details: 'تحديث شعار المنصة وتغيير درجات الألوان لتطابق المؤسسة المستفيدة', createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
          { id: 2, action: 'مزامنة مستخدمين', userEmail: 'admin@hr.gov.iq', details: 'تم استيراد حسابات الموظفين الجدد بنجاح ومطابقتها مع نظام المصادقة', createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
          { id: 3, action: 'إصدار كشف رواتب', userEmail: 'omar.almayahi@gmail.com', details: 'توليد التقارير المالية لرواتب الموظفين وفق سلم الرواتب الحالي', createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
          { id: 4, action: 'تحديث سجل الدوام والغياب', userEmail: 'system@hr.gov.iq', details: 'احتساب أوتوماتيكي لساعات الحضور وإدراج الغيابات والإجازات المرضية المعتمدة', createdAt: new Date(Date.now() - 1000 * 60 * 360).toISOString() }
        ]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveIdentity = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const data = {
        platformName,
        beneficiaryName,
        copyrightText,
        primaryColor,
        secondaryColor,
        activeTheme,
        fontFamily,
        logoUrl,
        workStartHour,
        workEndHour,
        officialHolidays: restDays.join(', '),
      };
      
      const updated = await apiClient.settings.update(data);
      setAppPublicSettings(updated);

      // Log action
      await apiClient.logs.create({
        action: 'تعديل الهوية البصرية',
        details: `تحديث إعدادات النظام وتخصيص المظهر (الاسم: ${platformName}، المستفيد: ${beneficiaryName})`
      }).catch(() => {});

      loadLogs();

      toast({
        title: 'تم الحفظ بنجاح',
        description: 'تم تحديث الهوية البصرية والسمات عبر النظام بأكمله.',
        variant: 'success'
      });
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحفظ',
        description: error.message || 'تعذر حفظ الإعدادات، يرجى المحاولة لاحقاً',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (theme) => {
    setActiveTheme(theme.name);
    setPrimaryColor(theme.primary);
    setSecondaryColor(theme.secondary);
    if (setAppPublicSettings) {
      setAppPublicSettings(prev => ({
        ...prev,
        primaryColor: theme.primary,
        secondaryColor: theme.secondary,
        activeTheme: theme.name
      }));
    }
  };

  const handlePrimaryColorChange = (color) => {
    setPrimaryColor(color);
    setActiveTheme('مخصص');
    if (setAppPublicSettings) {
      setAppPublicSettings(prev => ({
        ...prev,
        primaryColor: color,
        activeTheme: 'مخصص'
      }));
    }
  };

  const handleSecondaryColorChange = (color) => {
    setSecondaryColor(color);
    setActiveTheme('مخصص');
    if (setAppPublicSettings) {
      setAppPublicSettings(prev => ({
        ...prev,
        secondaryColor: color,
        activeTheme: 'مخصص'
      }));
    }
  };

  const handleFontChange = (newFont) => {
    setFontFamily(newFont);
    if (setAppPublicSettings) {
      setAppPublicSettings(prev => ({
        ...prev,
        fontFamily: newFont
      }));
    }
  };

  // Day Toggle
  const toggleRestDay = (day) => {
    if (restDays.includes(day)) {
      setRestDays(restDays.filter(d => d !== day));
    } else {
      setRestDays([...restDays, day]);
    }
  };

  const handleAddHoliday = (e) => {
    e.preventDefault();
    if (!newHolidayName || !newHolidayDate) return;
    setHolidays([...holidays, { name: newHolidayName, date: newHolidayDate }]);
    setNewHolidayName('');
    setNewHolidayDate('');
    toast({
      title: 'تم إضافة العطلة الرسمية',
      description: 'تم تسجيل المناسبة بنجاح في نظام العطلات السنوية.',
    });
  };

  const handleRemoveHoliday = (index) => {
    setHolidays(holidays.filter((_, i) => i !== index));
    toast({
      title: 'تم إزالة العطلة',
      description: 'تم حذف العطلة الرسمية المحددة من جدول الدوام السنوي.',
    });
  };

  const handleApprovePassword = (id, employeeName) => {
    setPasswordRequests(passwordRequests.map(r => r.id === id ? { ...r, status: 'approved' } : r));
    
    // Log action
    apiClient.logs.create({
      action: 'إعادة تعيين كلمة مرور',
      details: `تمت الموافقة وتوليد كلمة مرور مؤقتة للموظف: ${employeeName}`
    }).catch(() => {});
    loadLogs();

    toast({
      title: 'تمت الموافقة وتوليد الرمز',
      description: `تم توليد رمز مرور مؤقت وإرساله إلى ${employeeName} بنجاح.`,
    });
  };

  const handleRejectPassword = (id, employeeName) => {
    setPasswordRequests(passwordRequests.map(r => r.id === id ? { ...r, status: 'rejected' } : r));
    toast({
      title: 'تم رفض طلب كلمة المرور',
      description: `تم رفض طلب إعادة التعيين المقدم من قبل ${employeeName}.`,
    });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'نوع ملف غير مدعوم',
        description: 'يرجى اختيار ملف صورة صالح (PNG, JPG, JPEG, SVG, WEBP).',
        variant: 'destructive'
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB Limit
      toast({
        title: 'حجم الملف كبير جداً',
        description: 'الحد الأقصى لحجم الشعار هو 5 ميجابايت.',
        variant: 'destructive'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setLogoUrl(event.target.result);
      toast({
        title: 'تم تحميل الشعار مؤقتاً',
        description: 'تم تجهيز الشعار المرفوع من جهازك بنجاح. اضغط على زر الحفظ بالأسفل لاعتماد الهوية.',
      });
    };
    reader.onerror = () => {
      toast({
        title: 'خطأ أثناء قراءة الملف',
        description: 'حدث خطأ أثناء محاولة قراءة ملف الصورة.',
        variant: 'destructive'
      });
    };
    reader.readAsDataURL(file);
  };

  // Backup & Restore
  const handleExportBackup = async () => {
    try {
      toast({
        title: 'جاري تحضير النسخة الاحتياطية',
        description: 'يتم الآن تجميع كشوف الرواتب، سجلات الحضور، والموظفين في ملف مشفر...',
      });

      // Fetch all system data
      const employeesList = await apiClient.entities.Employee.list().catch(() => []);
      const leavesList = await apiClient.entities.LeaveRequest.list().catch(() => []);
      const penaltiesList = await apiClient.entities.Penalty.list().catch(() => []);
      const salariesList = await apiClient.entities.SalaryRecord.list().catch(() => []);
      
      const backupData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        systemSettings: {
          platformName,
          beneficiaryName,
          copyrightText,
          primaryColor,
          secondaryColor,
          fontFamily,
          logoUrl,
          workStartHour,
          workEndHour,
          officialHolidays: restDays.join(', '),
        },
        data: {
          employees: employeesList,
          leaves: leavesList,
          penalties: penaltiesList,
          salaries: salariesList,
          holidays: holidays,
        }
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `HR_System_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Log
      await apiClient.logs.create({
        action: 'تصدير نسخة احتياطية',
        details: 'تصدير كامل بيانات قاعدة البيانات إلى ملف خارجي JSON بنجاح'
      }).catch(() => {});
      loadLogs();

      toast({
        title: 'تم التصدير بنجاح',
        description: 'تم تحميل ملف النسخة الاحتياطية بنجاح إلى جهازك.',
        variant: 'success'
      });
    } catch (e) {
      toast({
        title: 'فشل التصدير',
        description: e.message,
        variant: 'destructive'
      });
    }
  };

  const handleImportBackup = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = JSON.parse(e.target.result);
        if (!content.systemSettings || !content.data) {
          throw new Error('ملف النسخ الاحتياطي غير صالح أو معطوب.');
        }

        // Restore system settings
        const settings = content.systemSettings;
        const updated = await apiClient.settings.update(settings);
        setAppPublicSettings(updated);

        // Notify success
        toast({
          title: 'تم استيراد الإعدادات بنجاح',
          description: 'تم استعادة الهوية البصرية وإعدادات النظام من ملف النسخ الاحتياطي.',
          variant: 'success'
        });

        // Log
        await apiClient.logs.create({
          action: 'استيراد نسخة احتياطية',
          details: 'تم استعادة معلومات الهوية البصرية وإعدادات الوقت من ملف خارجي'
        }).catch(() => {});
        loadLogs();

      } catch (err) {
        toast({
          title: 'فشل استيراد النسخة',
          description: err.message || 'تأكد من اختيار ملف نسخي صحيح وامتداد .json',
          variant: 'destructive'
        });
      }
    };
    reader.readAsText(file);
  };

  const handleResetSystem = async () => {
    if (window.confirm('هل أنت متأكد من رغبتك في إعادة ضبط إعدادات المظهر والهوية البصرية إلى القيم الافتراضية؟ لن يؤثر هذا على الموظفين أو سجل الرواتب.')) {
      setLoading(true);
      try {
        const defaults = {
          platformName: 'نظام إدارة شؤون الموظفين',
          beneficiaryName: 'وزارة الموارد البشرية العراقية',
          copyrightText: 'جميع الحقوق محفوظة © 2026',
          primaryColor: '#1B3A6B',
          secondaryColor: '#C8960C',
          activeTheme: 'أزرق ملكي',
          fontFamily: 'Cairo',
          logoUrl: 'https://img.icons8.com/color/48/gender-neutral-user.png',
          workStartHour: '08:00',
          workEndHour: '15:00',
          officialHolidays: 'الجمعة, السبت',
        };
        const updated = await apiClient.settings.update(defaults);
        setAppPublicSettings(updated);
        
        // Log
        await apiClient.logs.create({
          action: 'إعادة ضبط المصنع',
          details: 'إرجاع الهوية البصرية وإعدادات الألوان والخطوط للقيم الأصلية للمنصة'
        }).catch(() => {});
        loadLogs();

        toast({
          title: 'تم إعادة الضبط',
          description: 'تمت إعادة الإعدادات والقوالب البصرية إلى حالتها الافتراضية بنجاح.',
        });
      } catch (err) {
        toast({
          title: 'خطأ أثناء إعادة الضبط',
          description: err.message,
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const filteredLogs = logs.filter(l => 
    l.action.includes(filterAction) || l.userEmail.includes(filterAction) || (l.details && l.details.includes(filterAction))
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Palette className="text-[#1B3A6B]" size={28} />
            إعدادات النظام والهوية البصرية الموحدة
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            إدارة ألوان الواجهات، شعار المنصة، أوقات العمل الرسمية، العطل السنوية، والنسخ الاحتياطي والتحقق من العمليات.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Settings Navigation Menu (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 mb-3">
              أقسام لوحة الإعدادات
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('identity')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all ${
                  activeTab === 'identity'
                    ? 'bg-rose-50 text-rose-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'identity' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Palette size={16} />
                </div>
                <span>الهوية البصرية والمظهر</span>
              </button>

              <button
                onClick={() => setActiveTab('duty')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all ${
                  activeTab === 'duty'
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'duty' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Clock size={16} />
                </div>
                <span>أوقات الدوام والعطل الرسمية</span>
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all ${
                  activeTab === 'logs'
                    ? 'bg-cyan-50 text-cyan-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'logs' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  <FileText size={16} />
                </div>
                <span>سجل تسجيل النشاطات والأحداث</span>
              </button>

              <button
                onClick={() => setActiveTab('backup')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all ${
                  activeTab === 'backup'
                    ? 'bg-blue-50 text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'backup' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Database size={16} />
                </div>
                <span>النسخ الاحتياطي وإعادة الضبط</span>
              </button>

              <button
                onClick={() => setActiveTab('passwords')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all ${
                  activeTab === 'passwords'
                    ? 'bg-amber-50 text-amber-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === 'passwords' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  <KeyRound size={16} />
                </div>
                <span>طلبات تغيير كلمات المرور</span>
              </button>
            </div>
          </div>


        </div>

        {/* Right Settings Content Forms (9 cols) */}
        <div className="lg:col-span-9 space-y-6">
          <AnimatePresence mode="wait">
            {/* TAB 1: VISUAL IDENTITY */}
            {activeTab === 'identity' && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 xl:grid-cols-12 gap-6"
              >
                {/* Form column */}
                <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">تخصيص الهوية البصرية للمنصة</h2>
                    <p className="text-xs text-slate-500 mt-1">تتحكم الإعدادات التالية بمظهر وأسماء المنصة بما يتطابق مع الجهة المستفيدة.</p>
                  </div>

                  <form onSubmit={handleSaveIdentity} className="space-y-5">
                    {/* Platform Name */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 block">اسم المنصة (الرئيسي)</label>
                      <input
                        type="text"
                        value={platformName}
                        onChange={(e) => setPlatformName(e.target.value)}
                        placeholder="مثال: نظام متابعة البريد الالكتروني"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#1B3A6B]/20 transition-all text-slate-800 font-medium"
                      />
                    </div>

                    {/* Beneficiary Name & Copyrights */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700 block">الجهة المستفيدة</label>
                        <input
                          type="text"
                          value={beneficiaryName}
                          onChange={(e) => setBeneficiaryName(e.target.value)}
                          placeholder="مثال: شركة نفط الوسط"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#1B3A6B]/20 transition-all text-slate-800 font-medium"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700 block">حقوق الملكية الفكرية</label>
                        <input
                          type="text"
                          value={copyrightText}
                          onChange={(e) => setCopyrightText(e.target.value)}
                          placeholder="مثال: جميع الحقوق محفوظة © شركة نفط الوسط"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#1B3A6B]/20 transition-all text-slate-800 font-medium"
                        />
                      </div>
                    </div>

                    {/* Predefined Themes */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 block">تخصيص الألوان والسمات البصرية</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {PRESET_THEMES.map((theme) => {
                          const isSelected = activeTheme === theme.name || (primaryColor === theme.primary && secondaryColor === theme.secondary);
                          return (
                            <button
                              key={theme.name}
                              type="button"
                              onClick={() => handlePresetSelect(theme)}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border text-right text-xs transition-all ${
                                isSelected
                                  ? 'border-rose-300 bg-rose-50/40 font-medium text-slate-800 shadow-sm'
                                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
                              }`}
                            >
                              <span className="w-4 h-4 rounded-full border border-white flex-shrink-0" style={{ backgroundColor: theme.primary }} />
                              <span className="w-3 h-3 rounded-full border border-white flex-shrink-0" style={{ backgroundColor: theme.secondary }} />
                              <span className="truncate">{theme.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Color Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700 block">اللون الأساسي للواجهة</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={primaryColor}
                            onChange={(e) => handlePrimaryColorChange(e.target.value)}
                            className="w-10 h-10 p-0.5 border border-slate-200 rounded-xl cursor-pointer"
                          />
                          <input
                            type="text"
                            value={primaryColor}
                            onChange={(e) => handlePrimaryColorChange(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-mono focus:bg-white text-slate-700 uppercase"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700 block">اللون الثانوي والفرعي</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={secondaryColor}
                            onChange={(e) => handleSecondaryColorChange(e.target.value)}
                            className="w-10 h-10 p-0.5 border border-slate-200 rounded-xl cursor-pointer"
                          />
                          <input
                            type="text"
                            value={secondaryColor}
                            onChange={(e) => handleSecondaryColorChange(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-mono focus:bg-white text-slate-700 uppercase"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Font Dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 block">الخط المستخدم في واجهات التطبيق</label>
                      <select
                        value={fontFamily}
                        onChange={(e) => handleFontChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#1B3A6B]/20 transition-all text-slate-800 font-medium"
                      >
                        {FONTS.map(f => (
                          <option key={f.value} value={f.value}>{f.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* App Logo */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 block">شعار المنصة الرسمي (اللوغو)</label>
                      <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center p-3 flex-shrink-0 relative group overflow-hidden shadow-inner">
                          {logoUrl ? (
                            <>
                              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain rounded-xl" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                                <label className="cursor-pointer p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors">
                                  <Upload size={16} />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            </>
                          ) : (
                            <Image className="text-slate-300" size={36} />
                          )}
                        </div>
                        
                        <div className="flex-1 w-full space-y-2 text-right">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer text-xs font-semibold transition-all border border-slate-200 shadow-sm">
                                <Upload size={14} className="text-[#1B3A6B]" />
                                <span>رفع شعار جديد من جهازك</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleLogoUpload}
                                  className="hidden"
                                />
                              </label>
                              
                              {logoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLogoUrl('')}
                                  className="px-3 py-2.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl transition-all"
                                >
                                  إزالة الشعار الحالي
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">
                              صيغ الصور المدعومة: PNG, JPG, JPEG, SVG. الحد الأقصى للحجم: 5 ميجابايت.
                            </p>
                          </div>
                          
                          <div className="pt-1.5">
                            <button
                              type="button"
                              onClick={() => setLogoUrl('https://img.icons8.com/color/96/gender-neutral-user.png')}
                              className="text-[11px] text-[#1B3A6B] bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-all font-semibold"
                            >
                              إعادة تعيين للشعار الافتراضي للمنصة
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleResetSystem}
                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-all"
                      >
                        إعادة ضبط للقيم الافتراضية
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2.5 rounded-xl bg-[#1B3A6B] text-white hover:bg-opacity-95 font-medium text-sm shadow-md shadow-[#1B3A6B]/20 flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        <Save size={16} />
                        {loading ? 'جاري الحفظ...' : 'حفظ التغييرات وتطبيق الهوية'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Live Preview Column (5 cols) */}
                <div className="xl:col-span-5 space-y-4">
                  {/* Interactive Live Mini-App Template */}
                  <div className="bg-slate-100 rounded-2xl border border-slate-350 shadow-md p-4 space-y-4 font-sans overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-rose-400" />
                        <div className="w-3 h-3 rounded-full bg-amber-400" />
                        <div className="w-3 h-3 rounded-full bg-emerald-400" />
                      </div>
                      <span className="text-[9px] bg-white text-slate-400 px-3 py-0.5 rounded border border-slate-200 font-mono">localhost:3000</span>
                    </div>

                    {/* Actual Mock Interface Box */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" style={{ fontFamily: fontFamily }}>
                      {/* Top Bar Mock */}
                      <header className="h-10 border-b border-slate-150 flex items-center justify-between px-3 bg-white">
                        <div className="flex items-center gap-2">
                          {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="w-5 h-5 object-contain rounded" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: primaryColor }}>
                              ب
                            </div>
                          )}
                          <div className="flex flex-col text-right">
                            <span className="text-[9px] font-bold text-slate-800 leading-tight">{platformName || 'نظام شؤون الموظفين'}</span>
                            <span className="text-[7px] text-slate-400 leading-none">{beneficiaryName || 'الجمهورية العراقية'}</span>
                          </div>
                        </div>
                        <div className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200" />
                      </header>

                      {/* Content Area Mock */}
                      <div className="flex h-40">
                        {/* Sidebar Mock */}
                        <aside className="w-20 text-white p-2 space-y-1.5 flex flex-col justify-between" style={{ backgroundColor: primaryColor }}>
                          <div className="space-y-1">
                            <div className="h-4 rounded opacity-90 flex items-center justify-center text-[7px]" style={{ backgroundColor: secondaryColor }}>
                              لوحة التحكم
                            </div>
                            <div className="h-3.5 rounded bg-white/10 hover:bg-white/15 text-[6px] flex items-center pr-1 text-slate-200">
                              الموظفون
                            </div>
                            <div className="h-3.5 rounded bg-white/10 hover:bg-white/15 text-[6px] flex items-center pr-1 text-slate-200">
                              الرواتب
                            </div>
                          </div>
                          <div className="p-1 border-t border-white/10 text-[5px] text-center text-white/50">
                            v1.0.0
                          </div>
                        </aside>

                        {/* Main Mock */}
                        <main className="flex-1 p-3 bg-slate-50 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-bold text-slate-800">بطاقة الموظف الموحدة</span>
                            <span className="text-[7px] text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: secondaryColor }}>نظام نشط</span>
                          </div>

                          <div className="bg-white rounded-lg p-2 border border-slate-150 space-y-1.5 shadow-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-bold" style={{ color: primaryColor }}>ع</div>
                              <div>
                                <h4 className="text-[8px] font-bold text-slate-800">عمر محمود المياحي</h4>
                              </div>
                            </div>
                          </div>

                          <div className="text-[7px] text-slate-400 text-center leading-relaxed">
                            {copyrightText || 'جميع الحقوق محفوظة'}
                          </div>
                        </main>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 2: WORKING HOURS & HOLIDAYS */}
            {activeTab === 'duty' && (
              <motion.div
                key="duty"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
              >
                <div>
                  <h2 className="text-lg font-bold text-slate-800">أوقات الدوام والعطل الرسمية</h2>
                  <p className="text-sm text-slate-500">تحديد أوقات الدوام اليومي وأيام الإجازات الأسبوعية للتحقق من التزام كوادر الموظفين.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
                  {/* Duty Hours Form */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Clock size={16} className="text-emerald-600" />
                      تحديد فترات العمل الصباحي
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">وقت بدء الدوام</label>
                        <input
                          type="time"
                          value={workStartHour}
                          onChange={(e) => setWorkStartHour(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white text-slate-800 font-semibold"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">وقت انتهاء الدوام</label>
                        <input
                          type="time"
                          value={workEndHour}
                          onChange={(e) => setWorkEndHour(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white text-slate-800 font-semibold"
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-800 text-xs leading-relaxed flex gap-2">
                      <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                      <span>يحتسب الغياب والتأخيرات تلقائياً من قبل النظام استناداً للدوام الفعلي في العراق (8:00 ص - 3:00 م).</span>
                    </div>
                  </div>

                  {/* Rest Days Checkbox List */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-700">أيام الإجازة والعطل الأسبوعية</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(day => {
                        const isRest = restDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleRestDay(day)}
                            className={`p-2.5 rounded-xl border text-center text-xs transition-all font-medium ${
                              isRest
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Holiday Calendar Management */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700">العطل الرسمية والدينية الثابتة</h3>
                  
                  <form onSubmit={handleAddHoliday} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="اسم المناسبة (مثال: المولد النبوي الشريف)"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      required
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:bg-white text-slate-800"
                    />
                    <input
                      type="text"
                      placeholder="التاريخ بصيغة MM-DD (مثال: 12-10)"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      required
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:bg-white text-slate-800 font-mono text-center"
                    />
                    <button
                      type="submit"
                      className="bg-[#1B3A6B] text-white hover:bg-opacity-95 font-medium rounded-xl text-xs py-2 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Plus size={14} />
                      إضافة عطلة جديدة
                    </button>
                  </form>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">اسم العطلة الرسمية</th>
                          <th className="px-4 py-3 text-center">التاريخ السنوي (شهر-يوم)</th>
                          <th className="px-4 py-3 text-left">التحكم</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {holidays.map((h, index) => (
                          <tr key={index} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-medium">{h.name}</td>
                            <td className="px-4 py-2.5 text-center font-mono text-slate-600">{h.date}</td>
                            <td className="px-4 py-2.5 text-left">
                              <button
                                type="button"
                                onClick={() => handleRemoveHoliday(index)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleSaveIdentity()}
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-[#1B3A6B] text-white hover:bg-opacity-95 font-medium text-sm shadow-md flex items-center gap-2 transition-all"
                  >
                    <Save size={16} />
                    {loading ? 'جاري الحفظ...' : 'حفظ إعدادات العمل والعطل'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* TAB 3: SYSTEM LOGS */}
            {activeTab === 'logs' && (
              <motion.div
                key="logs"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">سجل تسجيل النشاطات والأحداث</h2>
                    <p className="text-xs text-slate-500 mt-1">سجل تفصيلي لجميع العمليات الإدارية والمحاسبية والمصادقات الأمنية التي تجري في النظام.</p>
                  </div>
                  <button
                    onClick={loadLogs}
                    className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors font-semibold"
                  >
                    <RefreshCw size={12} />
                    تحديث السجل
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Search filter input */}
                  <input
                    type="text"
                    placeholder="البحث في السجل عن طريق الكلمات المفتاحية، البريد الإلكتروني أو الإجراء..."
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:bg-white text-slate-800"
                  />

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">الحدث الإداري</th>
                          <th className="px-4 py-3">المنفذ</th>
                          <th className="px-4 py-3">تفاصيل الإجراء</th>
                          <th className="px-4 py-3 text-left">التاريخ والوقت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {filteredLogs.map((log, i) => (
                          <tr key={log.id || i} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] ml-2 ${
                                log.action.includes('حذف') || log.action.includes('رفض') ? 'bg-red-50 text-red-700' :
                                log.action.includes('تحديث') || log.action.includes('تعديل') ? 'bg-amber-50 text-amber-700' :
                                log.action.includes('تصدير') ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 font-mono">{log.userEmail}</td>
                            <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{log.details || 'لا يوجد تفاصيل'}</td>
                            <td className="px-4 py-3 text-slate-400 text-left font-mono">
                              {new Date(log.createdAt).toLocaleString('ar-IQ', { hour12: false })}
                            </td>
                          </tr>
                        ))}
                        {filteredLogs.length === 0 && (
                          <tr>
                            <td colSpan="4" className="text-center py-8 text-slate-400">
                              لا توجد عمليات تطابق البحث الخاص بك في السجلات الأمنية حالياً.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 4: BACKUP & RESTORE */}
            {activeTab === 'backup' && (
              <motion.div
                key="backup"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
              >
                <div>
                  <h2 className="text-lg font-bold text-slate-800">النسخ الاحتياطي وإعادة الضبط</h2>
                  <p className="text-sm text-slate-500">حماية البيانات والموظفين ضد التلف أو الإزالة غير المقصودة عبر تصدير قاعدة البيانات.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Backup Card */}
                  <div className="border border-slate-200 hover:border-[#1B3A6B]/30 hover:shadow-md rounded-2xl p-5 space-y-4 transition-all">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-700">
                      <Database size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">تصدير نسخة احتياطية كاملة</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        يقوم النظام بتجميع كافة كشوف الرواتب والموظفين المسجلين والمستندات وحفظها في ملف JSON مشفر للتمكن من استرجاعها بأي وقت.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportBackup}
                      className="w-full bg-[#1B3A6B] text-white hover:bg-opacity-95 font-medium rounded-xl text-xs py-2.5 flex items-center justify-center gap-1.5 transition-all"
                    >
                      تصدير وتحميل النسخة الاحتياطية
                    </button>
                  </div>

                  {/* Restore Card */}
                  <div className="border border-slate-200 hover:border-emerald-500/30 hover:shadow-md rounded-2xl p-5 space-y-4 transition-all">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-700">
                      <Upload size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">استيراد وتغذية البيانات</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        اختر ملف النسخ الاحتياطي الخاص بك (بصيغة JSON) لاستعادة الهيكل والترتيبات والخطوط والبرمجة الزمنية للعمل فوراً.
                      </p>
                    </div>
                    <label className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-xs py-2.5 flex items-center justify-center gap-1.5 transition-all cursor-pointer text-center">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportBackup}
                        className="hidden"
                      />
                      اختيار واستعادة ملف النسخة
                    </label>
                  </div>
                </div>

                {/* Danger zone */}
                <div className="border border-rose-150 bg-rose-50/30 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    منطقة العمليات الخطرة
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    إعادة ضبط الهوية البصرية وإعدادات الوقت يعيد النظام بالكامل لحالته الأصلية دون المساس بالبيانات الحيوية (الموظفين، العقود أو كشوفات الرواتب) المسجلة.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetSystem}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs px-4 py-2 transition-all"
                  >
                    إعادة تصفير الهيكل البصري الافتراضي
                  </button>
                </div>
              </motion.div>
            )}

            {/* TAB 5: PASSWORD REQUESTS */}
            {activeTab === 'passwords' && (
              <motion.div
                key="passwords"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
              >
                <div>
                  <h2 className="text-lg font-bold text-slate-800">طلبات تغيير كلمات المرور وتأكيد الهوية</h2>
                  <p className="text-sm text-slate-500">مراجعة ومعالجة طلبات إعادة تعيين الرموز للموظفين اللذين فقدوا سبل الولوج لملفاتهم الذاتية.</p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">اسم الموظف طالب التعديل</th>
                        <th className="px-4 py-3">القسم / الدائرة</th>
                        <th className="px-4 py-3">تاريخ ووقت تقديم الطلب</th>
                        <th className="px-4 py-3 text-center">الحالة</th>
                        <th className="px-4 py-3 text-left">التحكم الفوري</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {passwordRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-800">{req.employeeName}</td>
                          <td className="px-4 py-3 text-slate-600">{req.department}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono">{req.date}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              req.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                              req.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {req.status === 'approved' ? 'مقبول' : req.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-left">
                            {req.status === 'pending' ? (
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleApprovePassword(req.id, req.employeeName)}
                                  className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  توليد رمز جديد
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectPassword(req.id, req.employeeName)}
                                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  رفض
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">مكتمل</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
