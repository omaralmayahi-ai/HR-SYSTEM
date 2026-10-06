import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings as SettingsIcon, 
  CalendarDays, 
  GraduationCap, 
  ShieldAlert, 
  Briefcase, 
  Wallet, 
  TrendingDown, 
  TrendingUp, 
  Clock, 
  FileSpreadsheet, 
  GripVertical, 
  ClipboardCheck,
  Coins,
  SlidersHorizontal,
  FolderKanban
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

// Sub-settings components
import SalaryScaleSettings from '@/components/SalaryScaleSettings';
import LeaveTypesSettings from '@/components/LeaveTypesSettings';
import EducationDegreesSettings from '@/components/EducationDegreesSettings';
import FinancialRulesSettings from '@/components/FinancialRulesSettings';
import ResponsibilitySettings from '@/components/ResponsibilitySettings';
import FixedCustomAllowancesSettings from '@/components/FixedCustomAllowancesSettings';
import FixedCustomDeductionsSettings from '@/components/FixedCustomDeductionsSettings';
import ShiftSystemsSettings from '@/components/ShiftSystemsSettings';
import EmployeeImportSettings from '@/components/EmployeeImportSettings';
import PenaltyTypesSettings from '@/components/PenaltyTypesSettings';
import EvaluationFormsSettings from '@/components/EvaluationFormsSettings';
import GoverningCoursesSettings from '@/components/GoverningCoursesSettings';
import JobTitlesSettings from '@/components/JobTitlesSettings';
import PromotionRulesSettings from '@/components/PromotionRulesSettings';

const DEFAULT_TABS = [
  {
    id: 'salaryScale',
    label: 'سلم الرواتب الحالي',
    icon: Coins,
  },
  {
    id: 'jobTitles',
    label: 'دليل العناوين الوظيفية والمهنية',
    icon: Briefcase,
  },
  {
    id: 'governingCourses',
    label: 'الدورات التدريبية الحاكمة',
    icon: GraduationCap,
  },
  {
    id: 'shifts',
    label: 'أنظمة عمل المناوبة',
    icon: Clock,
  },
  {
    id: 'fixedCustomAllowances',
    label: 'المخصصات الثابتة والمخصصة',
    icon: Wallet,
  },
  {
    id: 'fixedCustomDeductions',
    label: 'الاستقطاعات الثابتة والمخصصة',
    icon: TrendingDown,
  },
  {
    id: 'education',
    label: 'الشهادات والمخصصات العلمية',
    icon: GraduationCap,
  },
  {
    id: 'responsibility',
    label: 'مخصصات المسؤولية والمنصب',
    icon: ShieldAlert,
  },
  {
    id: 'rules',
    label: 'ضوابط الاحتساب والتقاعد',
    icon: SlidersHorizontal,
  },
  {
    id: 'penaltyTypes',
    label: 'أنواع العقوبات الإدارية',
    icon: ShieldAlert,
  },
  {
    id: 'evaluationForms',
    label: 'استمارات تقييم الأداء',
    icon: ClipboardCheck,
  },
  {
    id: 'leaves',
    label: 'دليل أنواع الإجازات',
    icon: CalendarDays,
  },
  {
    id: 'promotionRules',
    label: 'ضوابط الترقية والعلاوة',
    icon: TrendingUp,
  },
  {
    id: 'employeeImport',
    label: 'استيراد الموظفين (Excel)',
    icon: FileSpreadsheet,
  },
];

export default function SystemSettings() {
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
  const [activeTab, setActiveTab] = useState('salaryScale');
  const [tabs, setTabs] = useState(DEFAULT_TABS);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => {
    try {
      const savedOrder = localStorage.getItem('SYSTEM_SETTINGS_TABS_ORDER');
      if (savedOrder) {
        const orderIds = JSON.parse(savedOrder);
        if (Array.isArray(orderIds)) {
          const map = new Map(DEFAULT_TABS.map(t => [t.id, t]));
          const ordered = [];
          orderIds.forEach(id => {
            if (map.has(id)) {
              ordered.push(map.get(id));
              map.delete(id);
            }
          });
          map.forEach(t => ordered.push(t));
          setTabs(ordered);
        }
      }
    } catch (e) {
      console.error('Error loading tab order:', e);
    }
  }, []);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const nextTabs = [...tabs];
    const [movedTab] = nextTabs.splice(draggedIndex, 1);
    nextTabs.splice(targetIndex, 0, movedTab);

    setTabs(nextTabs);
    setDraggedIndex(null);
    setDragOverIndex(null);

    try {
      localStorage.setItem('SYSTEM_SETTINGS_TABS_ORDER', JSON.stringify(nextTabs.map(t => t.id)));
    } catch (err) {
      console.error('Error saving tab order:', err);
    }
  };

  return (
    <div className="space-y-5 settings-content" dir="rtl">
      {/* Unified Settings Header & Tabs Card (البطاقة الموحدة لإعدادات النظام والتنقل) */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3.5">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="w-8 h-8 rounded-xl bg-[#1B3A6B]/10 text-[#1B3A6B] flex items-center justify-center shrink-0">
            <SettingsIcon size={18} />
          </div>
          <h1 className="text-base font-black text-[#1B3A6B]">اعدادات النظام الادارية و المالية</h1>
        </div>

        {/* Organized Navigation Buttons */}
        <div className="flex flex-wrap gap-2 pt-0.5">
          {tabs.map((tab, index) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDragged = draggedIndex === index;
            const isDragOver = dragOverIndex === index;

            return (
              <button
                key={tab.id}
                type="button"
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onClick={() => setActiveTab(tab.id)}
                style={isActive ? {
                  backgroundColor: primaryColor,
                  color: '#ffffff',
                  borderColor: primaryColor,
                  boxShadow: `0 3px 12px ${primaryColor}28`
                } : {}}
                className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer select-none whitespace-nowrap ${
                  isActive
                    ? 'shadow-xs scale-[1.01]'
                    : 'bg-slate-50 border-slate-200/90 text-slate-700 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300'
                } ${isDragged ? 'opacity-40 bg-slate-200' : ''} ${
                  isDragOver ? 'border-r-4 border-r-indigo-600 bg-indigo-50/60' : ''
                }`}
              >
                <GripVertical
                  size={13}
                  className={isActive ? "text-white/60 shrink-0 cursor-grab active:cursor-grabbing" : "text-slate-300 group-hover:text-slate-500 shrink-0 cursor-grab active:cursor-grabbing"}
                  title="اسحب لإعادة الترتيب"
                />
                <TabIcon size={14} className={isActive ? "text-white shrink-0" : "text-slate-500 group-hover:text-[#1B3A6B] shrink-0"} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Full-width Active Settings Window (المساحة الكاملة لعرض النوافذ) */}
      <div className="w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'salaryScale' && (
            <motion.div
              key="salaryScale"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <SalaryScaleSettings />
            </motion.div>
          )}

          {activeTab === 'jobTitles' && (
            <motion.div
              key="jobTitles"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <JobTitlesSettings />
            </motion.div>
          )}

          {activeTab === 'employeeImport' && (
            <motion.div
              key="employeeImport"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <EmployeeImportSettings />
            </motion.div>
          )}

          {activeTab === 'shifts' && (
            <motion.div
              key="shifts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <ShiftSystemsSettings />
            </motion.div>
          )}

          {activeTab === 'fixedCustomAllowances' && (
            <motion.div
              key="fixedCustomAllowances"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <FixedCustomAllowancesSettings />
            </motion.div>
          )}

          {activeTab === 'fixedCustomDeductions' && (
            <motion.div
              key="fixedCustomDeductions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <FixedCustomDeductionsSettings />
            </motion.div>
          )}

          {activeTab === 'education' && (
            <motion.div
              key="education"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <EducationDegreesSettings />
            </motion.div>
          )}

          {activeTab === 'responsibility' && (
            <motion.div
              key="responsibility"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <ResponsibilitySettings />
            </motion.div>
          )}

          {activeTab === 'rules' && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <FinancialRulesSettings />
            </motion.div>
          )}

          {activeTab === 'penaltyTypes' && (
            <motion.div
              key="penaltyTypes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <PenaltyTypesSettings />
            </motion.div>
          )}

          {activeTab === 'evaluationForms' && (
            <motion.div
              key="evaluationForms"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <EvaluationFormsSettings />
            </motion.div>
          )}

          {activeTab === 'governingCourses' && (
            <motion.div
              key="governingCourses"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <GoverningCoursesSettings />
            </motion.div>
          )}

          {activeTab === 'leaves' && (
            <motion.div
              key="leaves"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <LeaveTypesSettings />
            </motion.div>
          )}

          {activeTab === 'promotionRules' && (
            <motion.div
              key="promotionRules"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              <PromotionRulesSettings />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
