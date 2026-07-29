import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings as SettingsIcon, CalendarDays, GraduationCap, ShieldAlert, Briefcase, Wallet, TrendingDown, Clock, FileSpreadsheet, GripVertical, RotateCcw, ClipboardCheck } from 'lucide-react';

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

const DEFAULT_TABS = [
  {
    id: 'salaryScale',
    label: 'سُلّم الرواتب الموحد',
    icon: SettingsIcon,
    color: 'bg-violet-100 text-violet-700',
    activeColor: 'bg-violet-50 text-violet-700 shadow-sm border-violet-150',
  },
  {
    id: 'shifts',
    label: 'إدارة أنظمة عمل المناوبة',
    icon: Clock,
    color: 'bg-blue-100 text-blue-700',
    activeColor: 'bg-blue-50 text-blue-700 shadow-sm border-blue-150',
  },
  {
    id: 'fixedCustomAllowances',
    label: 'المخصصات الثابته و المخصصة',
    icon: Wallet,
    color: 'bg-cyan-100 text-cyan-700',
    activeColor: 'bg-cyan-50 text-cyan-700 shadow-sm border-cyan-150',
  },
  {
    id: 'fixedCustomDeductions',
    label: 'الاستقطاعات الثابته و المخصصة',
    icon: TrendingDown,
    color: 'bg-amber-100 text-amber-700',
    activeColor: 'bg-amber-50 text-amber-700 shadow-sm border-amber-150',
  },
  {
    id: 'education',
    label: 'الشهادات والمخصصات العلمية',
    icon: GraduationCap,
    color: 'bg-indigo-100 text-indigo-700',
    activeColor: 'bg-indigo-50 text-indigo-700 shadow-sm border-indigo-150',
  },
  {
    id: 'responsibility',
    label: 'مخصصات المسؤولية والمنصب',
    icon: Briefcase,
    color: 'bg-blue-100 text-blue-700',
    activeColor: 'bg-blue-50 text-blue-700 shadow-sm border-blue-150',
  },
  {
    id: 'rules',
    label: 'ضوابط الاحتساب والتقاعد',
    icon: ShieldAlert,
    color: 'bg-emerald-100 text-emerald-700',
    activeColor: 'bg-emerald-50 text-emerald-700 shadow-sm border-emerald-150',
  },
  {
    id: 'penaltyTypes',
    label: 'أنواع العقوبات الإدارية',
    icon: ShieldAlert,
    color: 'bg-rose-100 text-rose-700',
    activeColor: 'bg-rose-50 text-rose-700 shadow-sm border-rose-150',
  },
  {
    id: 'evaluationForms',
    label: 'استمارات تقييم الأداء والتخصيص',
    icon: ClipboardCheck,
    color: 'bg-indigo-100 text-indigo-700',
    activeColor: 'bg-indigo-50 text-indigo-700 shadow-sm border-indigo-150',
  },
  {
    id: 'leaves',
    label: 'أنواع الإجازات السنوية',
    icon: CalendarDays,
    color: 'bg-teal-100 text-teal-700',
    activeColor: 'bg-teal-50 text-teal-700 shadow-sm border-teal-150',
  },
  {
    id: 'employeeImport',
    label: 'إدارة واستيراد بيانات الموظفين (Excel)',
    icon: FileSpreadsheet,
    color: 'bg-emerald-100 text-emerald-700',
    activeColor: 'bg-emerald-50 text-emerald-800 shadow-sm border-emerald-200 font-black',
  },
];

export default function SystemSettings() {
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

  const resetOrder = () => {
    setTabs(DEFAULT_TABS);
    try {
      localStorage.removeItem('SYSTEM_SETTINGS_TABS_ORDER');
    } catch (e) {}
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-[#1B3A6B]">اعدادات النظام الادارية و المالية</h1>
          <p className="text-xs text-slate-500 mt-1">تخصيص وإدارة سلم الرواتب، قواعد المخصصات والاستقطاعات، وضوابط الإجازات السنوية المعتمدة.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Tabs Menu (3 cols) */}
        <div className="lg:col-span-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-wider px-1">أقسام الإعدادات</h2>
            <button
              onClick={resetOrder}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors"
              title="إعادة الترتيب الافتراضي"
            >
              <RotateCcw size={12} />
              <span>إعادة للترتيب</span>
            </button>
          </div>

          <div className="space-y-1">
            {tabs.map((tab, index) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDragged = draggedIndex === index;
              const isDragOver = dragOverIndex === index;

              return (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-right text-xs font-bold transition-all border cursor-pointer select-none ${
                    isActive
                      ? tab.activeColor
                      : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  } ${isDragged ? 'opacity-40 bg-slate-100' : ''} ${
                    isDragOver ? 'border-t-2 border-t-indigo-600 bg-indigo-50/40' : ''
                  }`}
                >
                  <GripVertical
                    size={14}
                    className="text-slate-300 group-hover:text-slate-500 shrink-0 cursor-grab active:cursor-grabbing"
                    title="اسحب لترتيب القسم"
                  />
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                    isActive ? tab.color : 'bg-slate-100 text-slate-500'
                  }`}>
                    <TabIcon size={15} />
                  </div>
                  <span className="truncate">{tab.label}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 text-center pt-1 border-t border-slate-100">
            💡 يمكنك إعادة ترتيب الأقسام بسحب الخيار وإفلاته في المكان المطلوب.
          </p>
        </div>

        {/* Right Active Content (9 cols) */}
        <div className="lg:col-span-9">
          <AnimatePresence mode="wait">
            {activeTab === 'salaryScale' && (
              <motion.div
                key="salaryScale"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <SalaryScaleSettings />
              </motion.div>
            )}

            {activeTab === 'employeeImport' && (
              <motion.div
                key="employeeImport"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <EmployeeImportSettings />
              </motion.div>
            )}

            {activeTab === 'shifts' && (
              <motion.div
                key="shifts"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <ShiftSystemsSettings />
              </motion.div>
            )}

            {activeTab === 'fixedCustomAllowances' && (
              <motion.div
                key="fixedCustomAllowances"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <FixedCustomAllowancesSettings />
              </motion.div>
            )}

            {activeTab === 'fixedCustomDeductions' && (
              <motion.div
                key="fixedCustomDeductions"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <FixedCustomDeductionsSettings />
              </motion.div>
            )}

            {activeTab === 'education' && (
              <motion.div
                key="education"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <EducationDegreesSettings />
              </motion.div>
            )}

            {activeTab === 'responsibility' && (
              <motion.div
                key="responsibility"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <ResponsibilitySettings />
              </motion.div>
            )}

            {activeTab === 'rules' && (
              <motion.div
                key="rules"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <FinancialRulesSettings />
              </motion.div>
            )}

            {activeTab === 'penaltyTypes' && (
              <motion.div
                key="penaltyTypes"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <PenaltyTypesSettings />
              </motion.div>
            )}

            {activeTab === 'evaluationForms' && (
              <motion.div
                key="evaluationForms"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <EvaluationFormsSettings />
              </motion.div>
            )}

            {activeTab === 'leaves' && (
              <motion.div
                key="leaves"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <LeaveTypesSettings />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
