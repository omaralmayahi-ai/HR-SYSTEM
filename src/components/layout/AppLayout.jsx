import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Bell, LogOut, User } from 'lucide-react';
import { apiClient } from '@/api/apiClient';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function AppLayout() {
  const [user, setUser] = useState(null);
  const [employeeRole, setEmployeeRole] = useState('employee');
  const { appPublicSettings, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', isCollapsed);
  }, [isCollapsed]);

  useEffect(() => {
    apiClient.auth.me().then(u => {
      setUser(u);
      if (u) {
        setEmployeeRole(u.role === 'admin' ? 'hr_admin' : 'employee');
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen bg-[#F5F7FA]" dir="rtl">
      <Sidebar role={employeeRole} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-3">
            {appPublicSettings?.logoUrl && (
              <img 
                src={appPublicSettings.logoUrl} 
                alt="Logo" 
                className="w-8 h-8 object-contain rounded"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <span className="text-[#1B3A6B] font-bold text-lg block md:inline-block">
                {appPublicSettings?.platformName || 'نظام شؤون الموظفين'}
              </span>
              <span className="text-[11px] bg-[#1B3A6B]/10 text-[#1B3A6B] px-2 py-0.5 rounded-full mr-2 font-medium">
                {appPublicSettings?.beneficiaryName || 'الجمهورية العراقية'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors relative">
              <Bell size={16} className="text-slate-600" />
              <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center">3</span>
            </button>
            <div className="flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5">
              <div className="w-6 h-6 rounded-full bg-[#1B3A6B] flex items-center justify-center">
                <User size={12} className="text-white" />
              </div>
              <span className="text-sm text-slate-700 font-medium">{user?.name || user?.username || 'المستخدم'}</span>
            </div>
            <button
              onClick={() => logout(true)}
              className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut size={16} className="text-red-500" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}