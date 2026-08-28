import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Users, CalendarDays, GraduationCap, Star, Hourglass, AlertTriangle, ShieldAlert, Bell, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

function StatCard({ title, value, icon: Icon, color, bg, link, subtitle }) {
  const card = (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-xs font-semibold mb-1">{title}</p>
          <p className={`text-2xl font-black ${color}`}>{value}</p>
          {subtitle && <p className="text-[10px] text-slate-400 mt-1 font-medium">{subtitle}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
          <Icon size={20} className={color} />
        </div>
      </div>
    </div>
  );
  return link ? <Link to={link}>{card}</Link> : card;
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    pending_leaves: 0,
    due_promotions: 0,
    pending_evals: 0,
    ongoing_trainings: 0,
    service_records_count: 0,
    approaching_retirement_count: 0,
    reached_retirement_no_extension: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentEmployees, setRecentEmployees] = useState([]);
  const [approachingEmployeesList, setApproachingEmployeesList] = useState([]);
  const [dueDelayReminders, setDueDelayReminders] = useState({ reminders: [], totalDue: 0, summaryByType: {} });

  useEffect(() => {
    Promise.all([
      apiClient.entities.Employee.list(),
      apiClient.entities.LeaveRequest.filter({ status: 'معلق' }),
      apiClient.entities.PerformanceEvaluation.filter({ status: 'مرفوع للاعتماد' }),
      apiClient.entities.Training.filter({ status: 'جاري' }),
      apiClient.entities.ServiceRecord.list().catch(() => []),
      apiClient.settings.get().catch(() => null),
      apiClient.promotionDelayReasons.getDueReminders().catch(() => ({ reminders: [], totalDue: 0, summaryByType: {} })),
    ]).then(([employees, leaves, evals, trainings, serviceRecords, settingsRes, dueRemindersRes]) => {
      const active = employees.filter(e => e.status === 'فعال' || e.status === 'مستمر' || e.status === 'متقاعد مع تمديد').length;
      
      const retirementAge = settingsRes?.retirementAge || settingsRes?.retirement_age || 60;
      const notificationDays = settingsRes?.retirementNotificationDays || settingsRes?.retirement_notification_days || 180;
      const today = new Date();

      let approachingCount = 0;
      let reachedNoExtCount = 0;
      const approachingList = [];

      employees.forEach(emp => {
        if (!emp.birth_date && !emp.birthDate) return;
        const birthDate = new Date(emp.birth_date || emp.birthDate);
        if (isNaN(birthDate.getTime())) return;

        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

        const retDate = new Date(birthDate);
        retDate.setFullYear(birthDate.getFullYear() + retirementAge);
        const daysToRetirement = Math.ceil((retDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

        const hasExtension = Boolean(
          (emp.retirement_extension_years > 0 || emp.retirementExtensionYears > 0) ||
          (emp.retirement_extension_order_number || emp.retirementExtensionOrderNumber)
        );
        const isRetired = emp.status === 'متقاعد';

        if (age >= retirementAge) {
          if (!hasExtension && !isRetired) {
            reachedNoExtCount++;
            approachingList.push({ ...emp, age, daysToRetirement, statusBadge: 'بلغ السن التقاعدي' });
          }
        } else if (daysToRetirement > 0 && daysToRetirement <= notificationDays && !isRetired) {
          approachingCount++;
          approachingList.push({ ...emp, age, daysToRetirement, statusBadge: `باقي ${daysToRetirement} يوم` });
        }
      });

      setStats({
        total: employees.length,
        active,
        pending_leaves: leaves.length,
        due_promotions: 0,
        pending_evals: evals.length,
        ongoing_trainings: trainings.length,
        service_records_count: serviceRecords.length,
        approaching_retirement_count: approachingCount,
        reached_retirement_no_extension: reachedNoExtCount,
      });
      setRecentEmployees(employees.slice(0, 5));
      setApproachingEmployeesList(approachingList.slice(0, 5));
      if (dueRemindersRes) {
        setDueDelayReminders(dueRemindersRes);
      }
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#1B3A6B]">لوحة التحكم الموحدة</h1>
          <p className="text-slate-500 text-xs mt-1">نظرة عامة على الموارد البشرية والخدمة والتقاعد</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm text-xs font-bold text-[#1B3A6B]">
          {new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي الموظفين" value={stats.total} icon={Users} color="text-[#1B3A6B]" bg="bg-blue-50" link="/employees" />
        <StatCard title="الموظفون الفعالون" value={stats.active} icon={Users} color="text-emerald-600" bg="bg-emerald-50" link="/employees" />
        <StatCard title="سجلات الخدمة والتمديد" value={stats.service_records_count} icon={Hourglass} color="text-indigo-600" bg="bg-indigo-50" link="/service-management" />
        <StatCard title="بلغوا السن دون تمديد" value={stats.reached_retirement_no_extension} icon={AlertTriangle} color="text-amber-700" bg="bg-amber-50" link="/service-management" subtitle="يتطلب اتخاذ إجراء تمديد أو إحالة" />
      </div>

      {/* Secondary Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="طلبات إجازة معلقة" value={stats.pending_leaves} icon={CalendarDays} color="text-orange-600" bg="bg-orange-50" link="/leaves" />
        <StatCard title="تقييمات بانتظار الاعتماد" value={stats.pending_evals} icon={Star} color="text-purple-600" bg="bg-purple-50" link="/performance" />
        <StatCard title="الدورات التدريبية الجارية" value={stats.ongoing_trainings} icon={GraduationCap} color="text-teal-600" bg="bg-teal-50" link="/training" />
        <StatCard title="مقتربون من التقاعد" value={stats.approaching_retirement_count} icon={ShieldAlert} color="text-rose-600" bg="bg-rose-50" link="/service-management" />
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approaching Retirement Widget */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-amber-50/50 border-b border-amber-100 flex items-center justify-between">
            <h2 className="font-bold text-amber-900 text-sm flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600" />
              المقتربون والبالغون للسن التقاعدي
            </h2>
            <Link to="/service-management" className="text-xs font-bold text-[#1B3A6B] hover:underline">التمديدات والخدمات المضافة ←</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                  <th className="px-4 py-2.5">الموظف</th>
                  <th className="px-4 py-2.5">العمر</th>
                  <th className="px-4 py-2.5">الموقف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {approachingEmployeesList.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                      لا يوجد موظفون بلغوا أو اقتربوا من السن التقاعدي حالياً
                    </td>
                  </tr>
                ) : (
                  approachingEmployeesList.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link to={`/employees/${emp.id}`} className="font-bold text-[#1B3A6B] hover:underline">
                          {emp.full_name || emp.fullName}
                        </Link>
                        <p className="text-[10px] text-slate-400">{emp.job_title || emp.jobTitle || '—'}</p>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-700">{emp.age} سنة</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          {emp.statusBadge}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Employees Widget */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-[#1B3A6B] text-sm">آخر الموظفين المضافين</h2>
            <Link to="/employees" className="text-xs font-bold text-[#1B3A6B] hover:underline">عرض جميع الموظفين ←</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                  <th className="px-4 py-2.5">الاسم</th>
                  <th className="px-4 py-2.5">العنوان الوظيفي</th>
                  <th className="px-4 py-2.5">الدرجة والمرحلة</th>
                  <th className="px-4 py-2.5">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {recentEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      لا يوجد موظفون مضافون بعد
                    </td>
                  </tr>
                ) : (
                  recentEmployees.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link to={`/employees/${emp.id}`} className="font-bold text-[#1B3A6B] hover:underline">
                          {emp.full_name || emp.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{emp.job_title || emp.jobTitle || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">د {emp.grade || '—'} / م {emp.step || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          emp.status === 'فعال' || emp.status === 'مستمر' ? 'bg-emerald-100 text-emerald-800' :
                          emp.status === 'متقاعد مع تمديد' ? 'bg-amber-100 text-amber-900' :
                          emp.status === 'إجازة' ? 'bg-orange-100 text-orange-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>{emp.status || 'فعال'}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Due Promotion & Increment Delay Reminders Widget (Phase 4: Transparency & Reminders) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1B3A6B]/10 text-[#1B3A6B] flex items-center justify-center font-bold">
              <Bell size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-[#1B3A6B] text-sm">تذكيرات معالجة موانع الترقية والعلاوة المستحقة</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                  (dueDelayReminders?.totalDue || 0) > 0
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {(dueDelayReminders?.totalDue || 0)} تذكير مستحق
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                متابعة الموظفين الذين حان موعد مراجعة أسباب تأخير أو إيقاف استحقاقاتهم الإدارية والمالية.
              </p>
            </div>
          </div>

          {/* Type Summary Pills */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold">
            <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">
              دورات: {dueDelayReminders?.summaryByType?.['دورة'] || 0}
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-100">
              عقوبات: {dueDelayReminders?.summaryByType?.['عقوبة'] || 0}
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
              إجازات: {dueDelayReminders?.summaryByType?.['اجازة'] || 0}
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-800 border border-purple-100">
              تقييم: {dueDelayReminders?.summaryByType?.['تقييم'] || 0}
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-800 border border-orange-100">
              غياب: {dueDelayReminders?.summaryByType?.['غياب'] || 0}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5">الموظف</th>
                <th className="px-4 py-2.5">نوع المانع</th>
                <th className="px-4 py-2.5">التفاصيل والتأثير</th>
                <th className="px-4 py-2.5">تاريخ التذكير</th>
                <th className="px-4 py-2.5 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {!dueDelayReminders?.reminders || dueDelayReminders.reminders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    لا توجد تذكيرات مستحقة حالياً لموانع الترقية والعلاوة
                  </td>
                </tr>
              ) : (
                dueDelayReminders.reminders.map(item => {
                  const rType = item.reasonType || item.reason_type || 'دورة';
                  const badgeClasses = {
                    'دورة': 'bg-blue-100 text-blue-800 border-blue-200',
                    'عقوبة': 'bg-rose-100 text-rose-800 border-rose-200',
                    'اجازة': 'bg-amber-100 text-amber-900 border-amber-200',
                    'تقييم': 'bg-purple-100 text-purple-900 border-purple-200',
                    'غياب': 'bg-orange-100 text-orange-900 border-orange-200',
                  }[rType] || 'bg-slate-100 text-slate-700';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/employees/${item.employeeId || item.employee_id}?tab=promotions`}
                          className="font-bold text-[#1B3A6B] hover:underline block"
                        >
                          {item.employeeName}
                        </Link>
                        <span className="text-[10px] text-slate-400">
                          {item.jobTitle || '—'} {item.department ? `• ${item.department}` : ''}
                        </span>
                      </td>

                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeClasses}`}>
                          {rType}
                        </span>
                      </td>

                      <td className="px-4 py-2.5">
                        <p className="text-slate-800 font-medium text-[11px] leading-relaxed max-w-md">
                          {item.description}
                        </p>
                        <span className="text-[9px] text-slate-400 font-bold">
                          يؤثر على: {item.affects || 'كلاهما'}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 font-mono font-bold text-rose-700">
                        {item.reminderDate || item.reminder_date}
                      </td>

                      <td className="px-4 py-2.5 text-center">
                        <Link
                          to={`/employees/${item.employeeId || item.employee_id}?tab=promotions`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1B3A6B] hover:text-[#152d54] bg-[#1B3A6B]/5 hover:bg-[#1B3A6B]/10 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          معاينة الملف ←
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
