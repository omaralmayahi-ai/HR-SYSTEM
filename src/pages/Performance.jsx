import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSearchParams } from 'react-router-dom';

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 2, currentYear - 1, currentYear];

function getGrade(score) {
  if (score >= 90) return 'ممتاز';
  if (score >= 75) return 'جيد جداً';
  if (score >= 60) return 'جيد';
  if (score >= 50) return 'مقبول';
  return 'ضعيف';
}

export default function Performance() {
  const [evaluations, setEvaluations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [form, setForm] = useState({
    employee_id: searchParams.get('employee') || '',
    year: currentYear,
    attendance_score: 0, work_quality_score: 0, relations_score: 0, achievements_score: 0,
    notes: '', employee_remarks: '', status: 'مسودة',
    evaluation_date: new Date().toISOString().split('T')[0]
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.entities.PerformanceEvaluation.list('-year', 200),
      apiClient.entities.Employee.list()
    ]).then(([ev, emps]) => {
      setEvaluations(ev);
      setEmployees(emps);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const set = (f, v) => setForm(p => {
    const updated = { ...p, [f]: v };
    updated.total_score = (updated.attendance_score || 0) + (updated.work_quality_score || 0) + (updated.relations_score || 0) + (updated.achievements_score || 0);
    updated.grade = getGrade(updated.total_score);
    return updated;
  });

  const totalScore = (form.attendance_score || 0) + (form.work_quality_score || 0) + (form.relations_score || 0) + (form.achievements_score || 0);

  const handleSubmit = async () => {
    await apiClient.entities.PerformanceEvaluation.create({ ...form, total_score: totalScore, grade: getGrade(totalScore) });
    toast({ title: 'تم حفظ تقييم الأداء' });
    setShowForm(false);
    load();
  };

  const approve = async (id) => {
    await apiClient.entities.PerformanceEvaluation.update(id, { status: 'معتمد', approval_date: new Date().toISOString().split('T')[0] });
    toast({ title: 'تم اعتماد التقييم' });
    load();
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">تقييم الأداء السنوي</h1>
          <p className="text-slate-500 text-sm">النموذج الرسمي لتقييم كفاءة الموظفين</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-2">
          <Plus size={16} /> تقييم جديد
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-[#1B3A6B] mb-5">نموذج تقييم الأداء الوظيفي السنوي</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <div>
              <Label>الموظف *</Label>
              <Select value={form.employee_id} onValueChange={v => set('employee_id', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>سنة التقييم *</Label>
              <Select value={String(form.year)} onValueChange={v => set('year', parseInt(v))}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ التقييم</Label>
              <Input type="date" className="mt-1 rounded-xl" value={form.evaluation_date} onChange={e => set('evaluation_date', e.target.value)} />
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 mb-4">
            <h4 className="font-semibold text-[#1B3A6B] mb-4">محاور التقييم (المجموع من 100)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                { field: 'attendance_score', label: 'الالتزام بالدوام', max: 25 },
                { field: 'work_quality_score', label: 'جودة العمل والإنتاجية', max: 25 },
                { field: 'relations_score', label: 'التعامل مع الزملاء والمراجعين', max: 25 },
                { field: 'achievements_score', label: 'الإنجازات الخاصة والمبادرات', max: 25 },
              ].map(({ field, label, max }) => (
                <div key={field}>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-sm">{label}</Label>
                    <span className="text-xs text-slate-400">من {max}</span>
                  </div>
                  <Input
                    type="number" min={0} max={max}
                    className="rounded-xl"
                    value={form[field]}
                    onChange={e => set(field, Math.min(max, parseInt(e.target.value) || 0))}
                  />
                  <div className="mt-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#1B3A6B] rounded-full transition-all" style={{ width: `${((form[field] || 0) / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 p-4 bg-[#1B3A6B] rounded-xl flex items-center justify-between">
              <div>
                <p className="text-white/70 text-sm">المجموع الكلي</p>
                <p className="text-white font-bold text-2xl">{totalScore}/100</p>
              </div>
              <div className="text-left">
                <p className="text-white/70 text-sm">التقدير</p>
                <p className={`font-bold text-xl ${
                  getGrade(totalScore) === 'ممتاز' ? 'text-green-300' :
                  getGrade(totalScore) === 'جيد جداً' ? 'text-blue-300' :
                  getGrade(totalScore) === 'جيد' ? 'text-yellow-300' :
                  'text-red-300'
                }`}>{getGrade(totalScore)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>ملاحظات المقيّم</Label>
              <textarea className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            <div>
              <Label>تعليق الموظف</Label>
              <textarea className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30" rows={3} value={form.employee_remarks} onChange={e => set('employee_remarks', e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button className="bg-[#1B3A6B] text-white rounded-xl" onClick={handleSubmit}>حفظ التقييم</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1B3A6B] text-white">
                  <th className="text-right px-4 py-3 font-medium">#</th>
                  <th className="text-right px-4 py-3 font-medium">الموظف</th>
                  <th className="text-right px-4 py-3 font-medium">السنة</th>
                  <th className="text-right px-4 py-3 font-medium">الالتزام</th>
                  <th className="text-right px-4 py-3 font-medium">جودة العمل</th>
                  <th className="text-right px-4 py-3 font-medium">التعامل</th>
                  <th className="text-right px-4 py-3 font-medium">الإنجازات</th>
                  <th className="text-right px-4 py-3 font-medium">المجموع</th>
                  <th className="text-right px-4 py-3 font-medium">التقدير</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev, idx) => (
                  <tr key={ev.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#1B3A6B]">{empMap[ev.employee_id]?.full_name || '—'}</td>
                    <td className="px-4 py-3">{ev.year}</td>
                    <td className="px-4 py-3">{ev.attendance_score}/25</td>
                    <td className="px-4 py-3">{ev.work_quality_score}/25</td>
                    <td className="px-4 py-3">{ev.relations_score}/25</td>
                    <td className="px-4 py-3">{ev.achievements_score}/25</td>
                    <td className="px-4 py-3 font-bold">{ev.total_score}/100</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        ev.grade === 'ممتاز' ? 'bg-green-100 text-green-700' :
                        ev.grade === 'جيد جداً' ? 'bg-blue-100 text-blue-700' :
                        ev.grade === 'جيد' ? 'bg-yellow-100 text-yellow-700' :
                        ev.grade === 'مقبول' ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>{ev.grade}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${ev.status === 'معتمد' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{ev.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {ev.status !== 'معتمد' && (
                        <button onClick={() => approve(ev.id)} className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs">
                          <CheckCircle size={14} /> اعتماد
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {evaluations.length === 0 && <tr><td colSpan={11} className="px-4 py-12 text-center text-slate-400">لا توجد تقييمات أداء</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}