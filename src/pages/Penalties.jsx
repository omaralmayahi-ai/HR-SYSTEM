import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSearchParams } from 'react-router-dom';
import { formatCurrency } from '@/lib/salaryTable';

const PENALTY_TYPES = ['إنذار شفهي','إنذار خطي','خصم يوم','خصم أيام','وقف عن الدوام','إحالة للتحقيق','تنزيل درجة','فصل'];

export default function Penalties() {
  const [penalties, setPenalties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [form, setForm] = useState({
    employee_id: searchParams.get('employee') || '',
    penalty_type: 'إنذار خطي', penalty_date: new Date().toISOString().split('T')[0],
    order_number: '', reason: '', days_count: 0, financial_amount: 0, notes: '', status: 'نافذ'
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.entities.Penalty.list('-penalty_date', 200),
      apiClient.entities.Employee.list()
    ]).then(([pen, emps]) => {
      setPenalties(pen);
      setEmployees(emps);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async () => {
    await apiClient.entities.Penalty.create(form);
    toast({ title: 'تم تسجيل العقوبة' });
    setShowForm(false);
    load();
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">العقوبات الإدارية</h1>
          <p className="text-slate-500 text-sm">{penalties.length} عقوبة مسجلة</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-2">
          <Plus size={16} /> تسجيل عقوبة
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-[#1B3A6B] mb-4">تسجيل عقوبة إدارية</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>الموظف *</Label>
              <Select value={form.employee_id} onValueChange={v => set('employee_id', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع العقوبة *</Label>
              <Select value={form.penalty_type} onValueChange={v => set('penalty_type', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{PENALTY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ العقوبة *</Label>
              <Input type="date" className="mt-1 rounded-xl" value={form.penalty_date} onChange={e => set('penalty_date', e.target.value)} />
            </div>
            <div>
              <Label>رقم الأمر الإداري *</Label>
              <Input className="mt-1 rounded-xl" value={form.order_number} onChange={e => set('order_number', e.target.value)} />
            </div>
            <div>
              <Label>عدد أيام الخصم</Label>
              <Input type="number" min={0} className="mt-1 rounded-xl" value={form.days_count} onChange={e => set('days_count', parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>المبلغ المالي المخصوم (د.ع)</Label>
              <Input type="number" min={0} className="mt-1 rounded-xl" value={form.financial_amount} onChange={e => set('financial_amount', parseInt(e.target.value) || 0)} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Label>سبب العقوبة *</Label>
              <Input className="mt-1 rounded-xl" value={form.reason} onChange={e => set('reason', e.target.value)} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Label>ملاحظات</Label>
              <Input className="mt-1 rounded-xl" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white rounded-xl" onClick={handleSubmit}>تسجيل العقوبة</Button>
          </div>
        </div>
      )}

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
                  <th className="text-right px-4 py-3 font-medium">نوع العقوبة</th>
                  <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-3 font-medium">رقم الأمر</th>
                  <th className="text-right px-4 py-3 font-medium">السبب</th>
                  <th className="text-right px-4 py-3 font-medium">الخصم المالي</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {penalties.map((p, idx) => (
                  <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#1B3A6B]">{empMap[p.employee_id]?.full_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 font-medium">{p.penalty_type}</span>
                    </td>
                    <td className="px-4 py-3">{p.penalty_date}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.order_number}</td>
                    <td className="px-4 py-3 text-slate-600">{p.reason}</td>
                    <td className="px-4 py-3 text-red-600">{p.financial_amount > 0 ? formatCurrency(p.financial_amount) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.status === 'نافذ' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
                {penalties.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">لا توجد عقوبات مسجلة</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}