import React, { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';

// Layout
import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
import DbStatusBanner from '@/components/system/DbStatusBanner';
import SharedSettingsBanner from '@/components/system/SharedSettingsBanner';

// Lazy-loaded Pages
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Employees = lazy(() => import('@/pages/Employees'));
const EmployeeForm = lazy(() => import('@/pages/EmployeeForm'));
const EmployeeDetail = lazy(() => import('@/pages/EmployeeDetail'));
const Salaries = lazy(() => import('@/pages/Salaries'));
const Leaves = lazy(() => import('@/pages/Leaves'));
const Attendance = lazy(() => import('@/pages/Attendance'));
const Penalties = lazy(() => import('@/pages/Penalties'));
const Performance = lazy(() => import('@/pages/Performance'));
const Training = lazy(() => import('@/pages/Training'));
const Reports = lazy(() => import('@/pages/Reports'));
const Settings = lazy(() => import('@/pages/Settings'));
const UsersManagement = lazy(() => import('@/pages/UsersManagement'));
const OrgChart = lazy(() => import('@/pages/OrgChart'));
const SystemSettings = lazy(() => import('@/pages/SystemSettings'));
const PayrollItems = lazy(() => import('@/pages/PayrollItems'));
const Payroll = lazy(() => import('@/pages/Payroll'));
const ServiceManagement = lazy(() => import('@/pages/ServiceManagement'));
const PromotionsDue = lazy(() => import('@/pages/PromotionsDue'));
const AdministrativeOrders = lazy(() => import('@/pages/AdministrativeOrders'));

const PageLoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
    <div className="text-center">
      <div className="w-10 h-10 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin mx-auto mb-3" />
      <p className="text-sm text-[#1B3A6B] font-medium">جاري تحميل الصفحة...</p>
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 pointer-events-auto flex items-center justify-center bg-[#F5F7FA]" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#1B3A6B] font-medium">جاري تحميل النظام...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/employees/new" element={<EmployeeForm />} />
          <Route path="/employees/:id" element={<EmployeeDetail />} />
          <Route path="/employees/:id/edit" element={<EmployeeForm />} />
          <Route path="/service-management" element={<ServiceManagement />} />
          <Route path="/promotions-due" element={<PromotionsDue />} />
          <Route path="/administrative-orders" element={<AdministrativeOrders />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/payroll/items" element={<PayrollItems />} />
          <Route path="/salaries" element={<Salaries />} />
          <Route path="/leaves" element={<Leaves />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/penalties" element={<Penalties />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/training" element={<Training />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<UsersManagement />} />
          <Route path="/system-settings" element={<SystemSettings />} />
          <Route path="/org-chart" element={<OrgChart />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <DbStatusBanner />
          <SharedSettingsBanner />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App