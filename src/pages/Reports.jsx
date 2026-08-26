import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Printer, Users, Wallet, CalendarDays, Star, GraduationCap } from 'lucide-react';
import { formatCurrency, calculateSalary } from '@/lib/salaryTable';

const REPORT_TYPES = [
  { id: 'employee_summary', label: 'خلاصة خدمة موظف', icon: Users },
  { id: 'salary_slip', label: 'قسيمة الراتب الشهرية', icon: Wallet },
  { id: 'salary_sheet', label: 'كشف رواتب الدائرة', icon: FileText },
  { id: 'leave_report', label: 'تقرير الإجازات', icon: CalendarDays },
  { id: 'performance_report', label: 'تقرير تقييمات الأداء', icon: Star },
  { id: 'training_report', label: 'تقرير الدورات التدريبية', icon: GraduationCap },
];

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [selectedReport, setSelectedReport] = useState('employee_summary');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.entities.Employee.list().then(setEmployees);
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      if (selectedReport === 'employee_summary' && selectedEmployee !== 'all') {
        const [emp, career, leaves, penalties, evals] = await Promise.all([
          apiClient.entities.Employee.get(selectedEmployee),
          apiClient.entities.CareerHistory.filter({ employee_id: selectedEmployee }, '-movement_date'),
          apiClient.entities.LeaveRequest.filter({ employee_id: selectedEmployee }),
          apiClient.entities.Penalty.filter({ employee_id: selectedEmployee }),
          apiClient.entities.PerformanceEvaluation.filter({ employee_id: selectedEmployee }),
        ]);
        setReportData({ type: 'employee_summary', emp, career, leaves, penalties, evals });
      } else if (selectedReport === 'salary_sheet') {
        const emps = await apiClient.entities.Employee.filter({ status: 'فعال' });
        setReportData({ type: 'salary_sheet', employees: emps });
      } else if (selectedReport === 'performance_report') {
        const evals = await apiClient.entities.PerformanceEvaluation.list('-year');
        setReportData({ type: 'performance_report', evals, employees });
      } else if (selectedReport === 'training_report') {
        const trainings = await apiClient.entities.Training.list('-start_date');
        const enrollments = await apiClient.entities.TrainingEnrollment.list();
        setReportData({ type: 'training_report', trainings, enrollments, employees });
      } else if (selectedReport === 'leave_report') {
        const query = selectedEmployee !== 'all' ? { employee_id: selectedEmployee } : {};
        const leaves = await apiClient.entities.LeaveRequest.filter(query);
        setReportData({ type: 'leave_report', leaves, employees });
      }
    } finally {
      setLoading(false);
    }
  };

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-[#1B3A6B]">التقارير والوثائق الرسمية</h1>
        <p className="text-slate-500 text-sm">توليد التقارير والأوامر الإدارية القابلة للطباعة</p>
      </div>

      {/* Report Selector */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {REPORT_TYPES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setSelectedReport(id); setReportData(null); }}
            className={`p-4 rounded-2xl border text-right transition-all ${
              selectedReport === id
                ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-lg'
                : 'bg-white text-slate-700 border-slate-200 hover:border-[#1B3A6B]/30'
            }`}
          >
            <Icon size={22} className={selectedReport === id ? 'text-[#C8960C]' : 'text-slate-400'} />
            <p className="text-xs font-medium mt-2 leading-tight">{label}</p>
          </button>
        ))}
      </div>

      {/* Options */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-wrap items-end gap-4">
        {!['salary_sheet', 'performance_report', 'training_report'].includes(selectedReport) && (
          <div>
            <p className="text-sm text-slate-500 mb-1">الموظف</p>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-60 rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الموظفين</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={generateReport} disabled={loading} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-2">
          <FileText size={16} /> {loading ? 'جاري التوليد...' : 'توليد التقرير'}
        </Button>
        {reportData && (
          <Button variant="outline" onClick={() => window.print()} className="rounded-xl gap-2 border-[#1B3A6B] text-[#1B3A6B]">
            <Printer size={16} /> طباعة
          </Button>
        )}
      </div>

      {/* Report Output */}
      {reportData && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden print:shadow-none" id="report-output">
          {/* Official Header */}
          <div className="p-6 border-b border-slate-200 text-center print:p-4">
            <div className="flex items-center justify-center gap-4 mb-3">
              <div className="w-12 h-12 rounded-full bg-[#1B3A6B] flex items-center justify-center">
                <span className="text-white font-bold text-sm">🇮🇶</span>
              </div>
              <div>
                <p className="font-bold text-[#1B3A6B] text-lg">جمهورية العراق</p>
                <p className="text-slate-500 text-sm">نظام إدارة شؤون الموظفين</p>
              </div>
            </div>
            <h2 className="font-bold text-xl text-[#1B3A6B] mt-2">
              {REPORT_TYPES.find(r => r.id === selectedReport)?.label}
            </h2>
            <p className="text-slate-400 text-sm">تاريخ الإصدار: {new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div className="p-6">
            {/* Employee Summary Report */}
            {reportData.type === 'employee_summary' && reportData.emp && (
              <div className="space-y-6">
                <section>
                  <h3 className="font-bold text-[#1B3A6B] mb-3 pb-2 border-b border-slate-200">أولاً: البيانات الشخصية</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {[
                      ['الاسم الكامل', reportData.emp.full_name],
                      ['الجنس', reportData.emp.gender],
                      ['تاريخ الميلاد', reportData.emp.birth_date],
                      ['الحالة الاجتماعية', reportData.emp.marital_status],
                      ['رقم الهوية', reportData.emp.national_id],
                      ['رقم الهاتف', reportData.emp.phone],
                    ].map(([l, v]) => v && (
                      <div key={l} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-slate-400 text-xs">{l}</p>
                        <p className="font-medium">{v}</p>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="font-bold text-[#1B3A6B] mb-3 pb-2 border-b border-slate-200">ثانياً: البيانات الوظيفية</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {[
                      ['العنوان الوظيفي', reportData.emp.job_title],
                      ['الدائرة', reportData.emp.department],
                      ['القسم', reportData.emp.section],
                      ['تاريخ التعيين', reportData.emp.appointment_date],
                      ['الدرجة / المرحلة', `الدرجة ${reportData.emp.grade} / المرحلة ${reportData.emp.step}`],
                      ['نوع الخدمة', reportData.emp.service_type],
                      ['الشهادة', `${reportData.emp.education_level || ''} ${reportData.emp.specialization || ''}`],
                    ].map(([l, v]) => v && (
                      <div key={l} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-slate-400 text-xs">{l}</p>
                        <p className="font-medium">{v}</p>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="font-bold text-[#1B3A6B] mb-3 pb-2 border-b border-slate-200">ثالثاً: خلاصة الخدمة</h3>
                  <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                    <thead><tr className="bg-slate-100">
                      <th className="text-right px-3 py-2 font-medium">نوع الحركة</th>
                      <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                      <th className="text-right px-3 py-2 font-medium">رقم الأمر</th>
                      <th className="text-right px-3 py-2 font-medium">الجهة</th>
                    </tr></thead>
                    <tbody>
                      {reportData.career.map(c => (
                        <tr key={c.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{c.movement_type}</td>
                          <td className="px-3 py-2">{c.movement_date}</td>
                          <td className="px-3 py-2 font-mono text-xs">{c.order_number}</td>
                          <td className="px-3 py-2">{c.to_department || '—'}</td>
                        </tr>
                      ))}
                      {reportData.career.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">لا توجد حركات وظيفية</td></tr>}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {/* Salary Sheet */}
            {reportData.type === 'salary_sheet' && (
              <div>
                <h3 className="font-bold text-[#1B3A6B] mb-4">كشف رواتب الموظفين الفعالين</h3>
                <table className="w-full text-sm border border-slate-200">
                  <thead><tr className="bg-[#1B3A6B] text-white">
                    <th className="text-right px-3 py-2">#</th>
                    <th className="text-right px-3 py-2">الموظف</th>
                    <th className="text-right px-3 py-2">الدرجة/المرحلة</th>
                    <th className="text-right px-3 py-2">الأساسي</th>
                    <th className="text-right px-3 py-2">العلاوات</th>
                    <th className="text-right px-3 py-2">الاستقطاعات</th>
                    <th className="text-right px-3 py-2">الصافي</th>
                  </tr></thead>
                  <tbody>
                    {reportData.employees.map((emp, i) => {
                      const calc = calculateSalary(emp);
                      return (
                        <tr key={emp.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-400">{i+1}</td>
                          <td className="px-3 py-2 font-medium">{emp.full_name}</td>
                          <td className="px-3 py-2">{emp.grade}/{emp.step}</td>
                          <td className="px-3 py-2">{formatCurrency(calc.base_salary)}</td>
                          <td className="px-3 py-2 text-green-600">+{formatCurrency(calc.total_allowances)}</td>
                          <td className="px-3 py-2 text-red-600">-{formatCurrency(calc.total_deductions)}</td>
                          <td className="px-3 py-2 font-bold text-[#1B3A6B]">{formatCurrency(calc.net_salary)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#1B3A6B]/5 font-bold">
                      <td colSpan={6} className="px-3 py-2 text-right text-[#1B3A6B]">إجمالي كتلة الرواتب:</td>
                      <td className="px-3 py-2 text-[#1B3A6B] text-lg">{formatCurrency(reportData.employees.reduce((s, e) => s + calculateSalary(e).net_salary, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Performance Report */}
            {reportData.type === 'performance_report' && (
              <div>
                <h3 className="font-bold text-[#1B3A6B] mb-4">تقرير تقييمات الأداء السنوي</h3>
                <table className="w-full text-sm border border-slate-200">
                  <thead><tr className="bg-[#1B3A6B] text-white">
                    <th className="text-right px-3 py-2">الموظف</th>
                    <th className="text-right px-3 py-2">السنة</th>
                    <th className="text-right px-3 py-2">المجموع</th>
                    <th className="text-right px-3 py-2">التقدير</th>
                    <th className="text-right px-3 py-2">الحالة</th>
                  </tr></thead>
                  <tbody>
                    {reportData.evals.map(ev => (
                      <tr key={ev.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{empMap[ev.employee_id]?.full_name || '—'}</td>
                        <td className="px-3 py-2">{ev.year}</td>
                        <td className="px-3 py-2 font-bold">{ev.total_score}/100</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            ev.grade === 'ممتاز' ? 'bg-green-100 text-green-700' :
                            ev.grade === 'جيد جداً' ? 'bg-blue-100 text-blue-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>{ev.grade}</span>
                        </td>
                        <td className="px-3 py-2">{ev.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Training Report */}
            {reportData.type === 'training_report' && (
              <div>
                <h3 className="font-bold text-[#1B3A6B] mb-4">تقرير الدورات التدريبية</h3>
                <table className="w-full text-sm border border-slate-200">
                  <thead><tr className="bg-[#1B3A6B] text-white">
                    <th className="text-right px-3 py-2">الدورة</th>
                    <th className="text-right px-3 py-2">النوع</th>
                    <th className="text-right px-3 py-2">الجهة</th>
                    <th className="text-right px-3 py-2">من</th>
                    <th className="text-right px-3 py-2">إلى</th>
                    <th className="text-right px-3 py-2">المشاركون</th>
                    <th className="text-right px-3 py-2">الحالة</th>
                  </tr></thead>
                  <tbody>
                    {reportData.trainings.map(t => {
                      const count = reportData.enrollments.filter(e => e.training_id === t.id).length;
                      return (
                        <tr key={t.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium">{t.course_name}</td>
                          <td className="px-3 py-2">{t.course_type}</td>
                          <td className="px-3 py-2">{t.provider || '—'}</td>
                          <td className="px-3 py-2">{t.start_date}</td>
                          <td className="px-3 py-2">{t.end_date}</td>
                          <td className="px-3 py-2 font-bold">{count}</td>
                          <td className="px-3 py-2">{t.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Leave Report */}
            {reportData.type === 'leave_report' && (
              <div>
                <h3 className="font-bold text-[#1B3A6B] mb-4">تقرير الإجازات</h3>
                <table className="w-full text-sm border border-slate-200">
                  <thead><tr className="bg-[#1B3A6B] text-white">
                    <th className="text-right px-3 py-2">الموظف</th>
                    <th className="text-right px-3 py-2">النوع</th>
                    <th className="text-right px-3 py-2">من</th>
                    <th className="text-right px-3 py-2">إلى</th>
                    <th className="text-right px-3 py-2">الأيام</th>
                    <th className="text-right px-3 py-2">الحالة</th>
                  </tr></thead>
                  <tbody>
                    {reportData.leaves.map(l => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{empMap[l.employee_id]?.full_name || '—'}</td>
                        <td className="px-3 py-2">{l.leave_type}</td>
                        <td className="px-3 py-2">{l.start_date}</td>
                        <td className="px-3 py-2">{l.end_date}</td>
                        <td className="px-3 py-2 font-bold">{l.days_count}</td>
                        <td className="px-3 py-2">{l.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Official Footer */}
          <div className="p-6 border-t border-slate-200 flex justify-between text-xs text-slate-400 print:p-4">
            <span>تاريخ الطباعة: {new Date().toLocaleDateString('ar-IQ')}</span>
            <span>نظام إدارة شؤون الموظفين — سري وخاص</span>
          </div>
        </div>
      )}
    </div>
  );
}