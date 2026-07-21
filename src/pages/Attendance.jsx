import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const STATUS_OPTIONS = ['حاضر','غائب بإذن','غائب بدون إذن','إجازة','عطلة رسمية','انتداب','مأمورية'];

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const { toast } = useToast();
  const [form, setForm] = useState({ employee_id: '', date: new Date().toISOString().split('T')[0], status: 'حاضر', check_in: '', check_out: '', late_minutes: 0, notes: '' });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.entities.Attendance.filter({ date: filterDate }),
      apiClient.entities.Employee.filter({ status: 'فعال' })
    ]).then(([att, emps]) => {
      setRecords(att);
      setEmployees(emps);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [filterDate]);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async () => {
    await apiClient.entities.Attendance.create(form);
    toast({ title: 'تم تسجيل الحضور' });
    setShowForm(false);
    load();
  };

  const absentCount = records.filter(r => r.status === 'غائب بدون إذن').length;
  const presentCount = records.filter(r => r.status === 'حاضر').length;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">الحضور والغياب</h1>
          <p className="text-slate-500 text-sm">سجل الحضور اليومي</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-2">
          <Plus size={16} /> تسجيل حضور
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-[#1B3A6B] mb-4">تسجيل حضور / غياب</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>الموظف *</Label>
              <Select value={form.employee_id} onValueChange={v => set('employee_id', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>التاريخ *</Label>
              <Input type="date" className="mt-1 rounded-xl" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <Label>الحالة *</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>وقت الحضور</Label>
              <Input type="time" className="mt-1 rounded-xl" value={form.check_in} onChange={e => set('check_in', e.target.value)} />
            </div>
            <div>
              <Label>وقت الانصراف</Label>
              <Input type="time" className="mt-1 rounded-xl" value={form.check_out} onChange={e => set('check_out', e.target.value)} />
            </div>
            <div>
              <Label>دقائق التأخير</Label>
              <Input type="number" min={0} className="mt-1 rounded-xl" value={form.late_minutes} onChange={e => set('late_minutes', parseInt(e.target.value) || 0)} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Label>ملاحظات</Label>
              <Input className="mt-1 rounded-xl" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button className="bg-[#1B3A6B] text-white rounded-xl" onClick={handleSubmit}>حفظ</Button>
          </div>
        </div>
      )}

      {/* Date Filter + Stats */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-slate-500">التاريخ:</Label>
          <Input type="date" className="w-44 rounded-xl border-slate-200" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        </div>
        <div className="flex gap-3 mr-auto">
          <span className="px-3 py-1 rounded-full text-xs bg-green-100 text-green-700 font-medium">حاضر: {presentCount}</span>
          <span className="px-3 py-1 rounded-full text-xs bg-red-100 text-red-700 font-medium">غائب بدون إذن: {absentCount}</span>
          <span className="px-3 py-1 rounded-full text-xs bg-slate-100 text-slate-600 font-medium">الكل: {records.length}</span>
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
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium">الحضور</th>
                  <th className="text-right px-4 py-3 font-medium">الانصراف</th>
                  <th className="text-right px-4 py-3 font-medium">التأخير</th>
                  <th className="text-right px-4 py-3 font-medium">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#1B3A6B]">{empMap[r.employee_id]?.full_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'حاضر' ? 'bg-green-100 text-green-700' :
                        r.status === 'غائب بدون إذن' ? 'bg-red-100 text-red-700' :
                        r.status === 'غائب بإذن' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">{r.check_in || '—'}</td>
                    <td className="px-4 py-3">{r.check_out || '—'}</td>
                    <td className="px-4 py-3">{r.late_minutes > 0 ? `${r.late_minutes} دقيقة` : '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{r.notes || '—'}</td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">لا توجد سجلات لهذا اليوم</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}