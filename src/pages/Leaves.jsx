import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const LEAVE_TYPES = ['اعتيادية','مرضية','أمومة','حج','دراسية','اضطرارية','بدون راتب','عدة وفاة','زواج'];

export default function Leaves() {
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [form, setForm] = useState({
    employee_id: searchParams.get('employee') || '',
    leave_type: 'اعتيادية', start_date: '', end_date: '', reason: '', status: 'معلق', order_number: ''
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.entities.LeaveRequest.list('-created_date', 200),
      apiClient.entities.Employee.list()
    ]).then(([lv, emps]) => {
      setLeaves(lv);
      setEmployees(emps);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  const calcDays = (start, end) => {
    if (!start || !end) return 0;
    const d = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24) + 1;
    return Math.max(0, d);
  };

  const handleSubmit = async () => {
    const days = calcDays(form.start_date, form.end_date);
    await apiClient.entities.LeaveRequest.create({ ...form, days_count: days });
    toast({ title: 'تم تسجيل طلب الإجازة' });
    setShowForm(false);
    load();
  };

  const updateStatus = async (id, status, notes = '') => {
    await apiClient.entities.LeaveRequest.update(id, { status, manager_notes: notes, approval_date: new Date().toISOString().split('T')[0] });
    toast({ title: status === 'معتمد' ? 'تم اعتماد الإجازة' : 'تم رفض الإجازة' });
    load();
  };

  const filtered = leaves.filter(l => statusFilter === 'all' || l.status === statusFilter);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">إدارة الإجازات</h1>
          <p className="text-slate-500 text-sm">{filtered.length} إجازة</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-2">
          <Plus size={16} /> إضافة إجازة
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-[#1B3A6B] mb-4">تسجيل إجازة جديدة</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>الموظف *</Label>
              <Select value={form.employee_id} onValueChange={v => set('employee_id', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="اختر الموظف..." /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع الإجازة *</Label>
              <Select value={form.leave_type} onValueChange={v => set('leave_type', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ البدء *</Label>
              <Input type="date" className="mt-1 rounded-xl" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <Label>تاريخ الانتهاء *</Label>
              <Input type="date" className="mt-1 rounded-xl" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <div>
              <Label>عدد الأيام</Label>
              <Input className="mt-1 rounded-xl bg-slate-50" value={calcDays(form.start_date, form.end_date)} readOnly />
            </div>
            <div>
              <Label>رقم الأمر الإداري</Label>
              <Input className="mt-1 rounded-xl" value={form.order_number} onChange={e => set('order_number', e.target.value)} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Label>السبب</Label>
              <Input className="mt-1 rounded-xl" value={form.reason} onChange={e => set('reason', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button className="bg-[#1B3A6B] text-white rounded-xl" onClick={handleSubmit}>حفظ الإجازة</Button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            {['معلق','معتمد','مرفوض','ملغى'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-3 mr-auto">
          {[
            { label: 'معلق', color: 'bg-yellow-100 text-yellow-700', count: leaves.filter(l => l.status === 'معلق').length },
            { label: 'معتمد', color: 'bg-green-100 text-green-700', count: leaves.filter(l => l.status === 'معتمد').length },
            { label: 'مرفوض', color: 'bg-red-100 text-red-700', count: leaves.filter(l => l.status === 'مرفوض').length },
          ].map(b => (
            <span key={b.label} className={`px-3 py-1 rounded-full text-xs font-medium ${b.color}`}>{b.label}: {b.count}</span>
          ))}
        </div>
      </div>

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
                  <th className="text-right px-4 py-3 font-medium">نوع الإجازة</th>
                  <th className="text-right px-4 py-3 font-medium">من</th>
                  <th className="text-right px-4 py-3 font-medium">إلى</th>
                  <th className="text-right px-4 py-3 font-medium">الأيام</th>
                  <th className="text-right px-4 py-3 font-medium">السبب</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, idx) => (
                  <tr key={l.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#1B3A6B]">{empMap[l.employee_id]?.full_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{l.leave_type}</span>
                    </td>
                    <td className="px-4 py-3">{l.start_date}</td>
                    <td className="px-4 py-3">{l.end_date}</td>
                    <td className="px-4 py-3 font-medium">{l.days_count}</td>
                    <td className="px-4 py-3 text-slate-500">{l.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        l.status === 'معتمد' ? 'bg-green-100 text-green-700' :
                        l.status === 'معلق' ? 'bg-yellow-100 text-yellow-700' :
                        l.status === 'مرفوض' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {l.status === 'معلق' && (
                        <div className="flex gap-1">
                          <button onClick={() => updateStatus(l.id, 'معتمد')} className="w-7 h-7 rounded-lg bg-green-50 hover:bg-green-100 flex items-center justify-center">
                            <CheckCircle size={14} className="text-green-600" />
                          </button>
                          <button onClick={() => updateStatus(l.id, 'مرفوض')} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center">
                            <XCircle size={14} className="text-red-500" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">لا توجد إجازات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}