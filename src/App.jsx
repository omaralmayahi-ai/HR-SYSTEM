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

// Pages
import Dashboard from '@/pages/Dashboard';
import Employees from '@/pages/Employees';
import EmployeeForm from '@/pages/EmployeeForm';
import EmployeeDetail from '@/pages/EmployeeDetail';
import Salaries from '@/pages/Salaries';
import Leaves from '@/pages/Leaves';
import Attendance from '@/pages/Attendance';
import Penalties from '@/pages/Penalties';
import Performance from '@/pages/Performance';
import Training from '@/pages/Training';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import UsersManagement from '@/pages/UsersManagement';
import OrgChart from '@/pages/OrgChart';
import SystemSettings from '@/pages/SystemSettings';
import ServiceManagement from '@/pages/ServiceManagement';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#F5F7FA]" dir="rtl">
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
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/employees/new" element={<EmployeeForm />} />
        <Route path="/employees/:id" element={<EmployeeDetail />} />
        <Route path="/employees/:id/edit" element={<EmployeeForm />} />
        <Route path="/service-management" element={<ServiceManagement />} />
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
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App