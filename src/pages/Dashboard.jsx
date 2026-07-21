import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Users, CalendarDays, TrendingUp, GraduationCap, Star } from 'lucide-react';
import { Link } from 'react-router-dom';

function StatCard({ title, value, icon: Icon, color, bg, link }) {
  const card = (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm mb-1">{title}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center`}>
          <Icon size={22} className={color} />
        </div>
      </div>
    </div>
  );
  return link ? <Link to={link}>{card}</Link> : card;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, pending_leaves: 0, due_promotions: 0, pending_evals: 0, ongoing_trainings: 0 });
  const [loading, setLoading] = useState(true);
  const [recentEmployees, setRecentEmployees] = useState([]);

  useEffect(() => {
    Promise.all([
      apiClient.entities.Employee.list(),
      apiClient.entities.LeaveRequest.filter({ status: 'معلق' }),
      apiClient.entities.PerformanceEvaluation.filter({ status: 'مرفوع للاعتماد' }),
      apiClient.entities.Training.filter({ status: 'جاري' }),
    ]).then(([employees, leaves, evals, trainings]) => {
      const active = employees.filter(e => e.status === 'فعال').length;
      setStats({
        total: employees.length,
        active,
        pending_leaves: leaves.length,
        due_promotions: 0,
        pending_evals: evals.length,
        ongoing_trainings: trainings.length
      });
      setRecentEmployees(employees.slice(0, 5));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-[#1B3A6B]">لوحة التحكم</h1>
        <p className="text-slate-500 text-sm mt-1">نظرة عامة على الدائرة</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي الموظفين" value={stats.total} icon={Users} color="text-[#1B3A6B]" bg="bg-blue-50" link="/employees" />
        <StatCard title="الموظفون الفعالون" value={stats.active} icon={Users} color="text-green-600" bg="bg-green-50" link="/employees" />
        <StatCard title="طلبات إجازة معلقة" value={stats.pending_leaves} icon={CalendarDays} color="text-orange-600" bg="bg-orange-50" link="/leaves" />
        <StatCard title="تقييمات بانتظار الاعتماد" value={stats.pending_evals} icon={Star} color="text-purple-600" bg="bg-purple-50" link="/performance" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="الدورات الجارية" value={stats.ongoing_trainings} icon={GraduationCap} color="text-teal-600" bg="bg-teal-50" link="/training" />
        <StatCard title="مستحقو الترقية" value={stats.due_promotions} icon={TrendingUp} color="text-[#C8960C]" bg="bg-yellow-50" link="/employees" />
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 col-span-2">
          <p className="text-slate-500 text-sm mb-1">تاريخ اليوم</p>
          <p className="text-xl font-bold text-[#1B3A6B]">
            {new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Recent Employees */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-[#1B3A6B]">آخر الموظفين المضافين</h2>
          <Link to="/employees" className="text-sm text-[#1B3A6B] hover:underline">عرض الكل</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="text-right px-5 py-3 font-medium">الاسم</th>
                <th className="text-right px-5 py-3 font-medium">العنوان الوظيفي</th>
                <th className="text-right px-5 py-3 font-medium">الدرجة</th>
                <th className="text-right px-5 py-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {recentEmployees.map(emp => (
                <tr key={emp.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/employees/${emp.id}`} className="font-medium text-[#1B3A6B] hover:underline">{emp.full_name}</Link>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{emp.job_title || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">الدرجة {emp.grade} / المرحلة {emp.step}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      emp.status === 'فعال' ? 'bg-green-100 text-green-700' :
                      emp.status === 'إجازة' ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{emp.status || 'فعال'}</span>
                  </td>
                </tr>
              ))}
              {recentEmployees.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">لا يوجد موظفون مضافون بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}