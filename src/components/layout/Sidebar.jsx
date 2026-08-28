import { Link, useLocation } from 'react-router-dom';
import {
  Users, LayoutDashboard, Wallet, CalendarDays, Clock,
  ShieldAlert, Star, GraduationCap, FileText, Settings,
  ChevronLeft, ChevronRight, Building2, UserCog, Network, SlidersHorizontal, Hourglass, Award
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'لوحة التحكم' },
  { path: '/employees', icon: Users, label: 'الموظفون' },
  { path: '/promotions-due', icon: Award, label: 'مستحقات الترفيع والعلاوة' },
  { path: '/salaries', icon: Wallet, label: 'الرواتب' },
  { path: '/leaves', icon: CalendarDays, label: 'الإجازات' },
  { path: '/attendance', icon: Clock, label: 'الحضور والغياب' },
  { path: '/penalties', icon: ShieldAlert, label: 'التشكرات والعقوبات' },
  { path: '/performance', icon: Star, label: 'تقييم الأداء' },
  { path: '/training', icon: GraduationCap, label: 'التدريب والدورات' },
  { path: '/service-management', icon: Hourglass, label: 'التمديدات والخدمات المضافة' },
  { path: '/reports', icon: FileText, label: 'التقارير' },
  { path: '/org-chart', icon: Network, label: 'الهيكل التنظيمي', adminOnly: true },
  { path: '/users', icon: UserCog, label: 'إدارة المستخدمين', adminOnly: true },
  { path: '/system-settings', icon: SlidersHorizontal, label: 'اعدادات النظام الادارية و المالية', adminOnly: true },
  { path: '/settings', icon: Settings, label: 'الإعدادات والهوية البصرية', adminOnly: true },
];

export default function Sidebar({ role, isCollapsed, setIsCollapsed }) {
  const location = useLocation();
  const { appPublicSettings } = useAuth();

  const visibleItems = navItems.filter(item => {
    if (role === 'employee') {
      return ['/', '/leaves', '/performance', '/training'].includes(item.path);
    }
    if (item.adminOnly && role !== 'hr_admin') {
      return false;
    }
    return true;
  });

  return (
    <aside 
      className={cn(
        "min-h-screen bg-[#1B3A6B] flex flex-col shadow-xl transition-all duration-300 ease-in-out relative shrink-0 z-50",
        isCollapsed ? "w-20" : "w-64"
      )} 
      dir="rtl"
    >
      {/* Floating Collapse/Expand Toggle Button */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-5 -left-4 w-8 h-8 rounded-full bg-[#C8960C] hover:bg-[#b0830a] text-white flex items-center justify-center border-2 border-white shadow-lg transition-all duration-200 hover:scale-110 z-50 cursor-pointer"
        title={isCollapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
      >
        {isCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      {/* Logo */}
      <div className={cn("p-5 border-b border-[#2a4f8f] flex items-center", isCollapsed ? "justify-center" : "justify-between")}>
        <div className="flex items-center gap-3 min-w-0">
          {appPublicSettings?.logoUrl ? (
            <img 
              src={appPublicSettings.logoUrl} 
              alt="Platform Logo" 
              className="w-10 h-10 bg-white p-1 rounded-lg object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-10 h-10 bg-[#C8960C] rounded-lg flex items-center justify-center shrink-0">
              <Building2 size={22} className="text-white" />
            </div>
          )}
          {!isCollapsed && (
            <div className="min-w-0 flex-1 animate-fadeIn">
              <p className="text-white font-bold text-sm leading-tight truncate">
                {appPublicSettings?.platformName || 'نظام شؤون'}
              </p>
              <p className="text-[#C8960C] text-xs font-semibold truncate">
                {appPublicSettings?.beneficiaryName || 'الموظفين'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                "flex items-center gap-3 rounded-xl transition-all duration-200 group relative",
                isCollapsed ? "justify-center p-3" : "px-4 py-3",
                isActive
                  ? "bg-[#C8960C] text-white shadow-lg"
                  : "text-slate-300 hover:bg-[#2a4f8f] hover:text-white"
              )}
              title={isCollapsed ? label : undefined}
            >
              <Icon size={18} className={cn(isActive ? "text-white" : "text-slate-400 group-hover:text-white shrink-0")} />
              {!isCollapsed && <span className="text-sm font-medium animate-fadeIn whitespace-nowrap">{label}</span>}
              {isActive && !isCollapsed && <ChevronLeft size={14} className="mr-auto text-white/70" />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}