import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings as SettingsIcon, CalendarDays, GraduationCap, ShieldAlert, Briefcase, Wallet, TrendingDown } from 'lucide-react';

// Sub-settings components
import SalaryScaleSettings from '@/components/SalaryScaleSettings';
import LeaveTypesSettings from '@/components/LeaveTypesSettings';
import EducationDegreesSettings from '@/components/EducationDegreesSettings';
import FinancialRulesSettings from '@/components/FinancialRulesSettings';
import ResponsibilitySettings from '@/components/ResponsibilitySettings';
import FixedCustomAllowancesSettings from '@/components/FixedCustomAllowancesSettings';
import FixedCustomDeductionsSettings from '@/components/FixedCustomDeductionsSettings';

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState('salaryScale');

  const tabs = [
    {
      id: 'salaryScale',
      label: 'سُلّم الرواتب الموحد',
      icon: SettingsIcon,
      color: 'bg-violet-100 text-violet-700',
      activeColor: 'bg-violet-50 text-violet-700 shadow-sm border-violet-150',
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
      id: 'leaves',
      label: 'أنواع الإجازات السنوية',
      icon: CalendarDays,
      color: 'bg-teal-100 text-teal-700',
      activeColor: 'bg-teal-50 text-teal-700 shadow-sm border-teal-150',
    },
  ];

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
        <div className="lg:col-span-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
          <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-wider px-3 mb-3">أقسام الإعدادات</h2>
          <div className="space-y-1">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-right text-xs font-bold transition-all border ${
                    isActive
                      ? tab.activeColor
                      : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isActive ? tab.color : 'bg-slate-100 text-slate-500'
                  }`}>
                    <TabIcon size={15} />
                  </div>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
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
