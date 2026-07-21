import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, History } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const MOVEMENT_TYPES = ['نقل', 'إعارة', 'انتداب', 'ترفيع', 'تعديل درجة', 'تغيير عنوان وظيفي', 'إعادة تعيين', 'إحالة للتقاعد'];

export default function CareerHistoryTab({ employeeId }) {
  const [records, setRecords] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({ movement_type: 'نقل', movement_date: '', order_number: '', from_department: '', to_department: '', from_grade: '', from_step: '', to_grade: '', to_step: '', new_job_title: '', notes: '' });

  const load = () => {
    apiClient.entities.CareerHistory.filter({ employee_id: employeeId }, '-movement_date').then(setRecords);
  };
  useEffect(() => { load(); }, [employeeId]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    await apiClient.entities.CareerHistory.create({ ...form, employee_id: employeeId });
    if (form.to_grade || form.to_step) {
      const update = {};
      if (form.to_grade) update.grade = parseInt(form.to_grade);
      if (form.to_step) update.step = parseInt(form.to_step);
      if (form.movement_date) update.grade_date = form.movement_date;
      if (form.new_job_title) update.job_title = form.new_job_title;
      if (form.to_department) update.department = form.to_department;
      await apiClient.entities.Employee.update(employeeId, update);
    }
    toast({ title: 'تمت إضافة الحركة الوظيفية' });
    setShowForm(false);
    load();
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[#1B3A6B]">خلاصة الخدمة والحركات الوظيفية</h3>
        <Button size="sm" className="bg-[#1B3A6B] text-white rounded-xl gap-1" onClick={() => setShowForm(true)}>
          <Plus size={14} /> إضافة حركة وظيفية
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-5 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-[#1B3A6B]">حركة وظيفية جديدة</h4>
            <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 flex items-center justify-center">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">نوع الحركة *</Label>
              <Select value={form.movement_type} onValueChange={v => set('movement_type', v)}>
                <SelectTrigger className="mt-1 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{MOVEMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">التاريخ *</Label>
              <Input type="date" className="mt-1 rounded-xl text-sm" value={form.movement_date} onChange={e => set('movement_date', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">رقم الأمر الإداري *</Label>
              <Input className="mt-1 rounded-xl text-sm" value={form.order_number} onChange={e => set('order_number', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">من دائرة</Label>
              <Input className="mt-1 rounded-xl text-sm" value={form.from_department} onChange={e => set('from_department', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">إلى دائرة</Label>
              <Input className="mt-1 rounded-xl text-sm" value={form.to_department} onChange={e => set('to_department', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">الدرجة الجديدة</Label>
              <Select value={String(form.to_grade)} onValueChange={v => set('to_grade', v)}>
                <SelectTrigger className="mt-1 rounded-xl text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6,7,8,9,10].map(g => <SelectItem key={g} value={String(g)}>الدرجة {g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">المرحلة الجديدة</Label>
              <Select value={String(form.to_step)} onValueChange={v => set('to_step', v)}>
                <SelectTrigger className="mt-1 rounded-xl text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6,7,8,9,10].map(s => <SelectItem key={s} value={String(s)}>المرحلة {s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">العنوان الوظيفي الجديد</Label>
              <Input className="mt-1 rounded-xl text-sm" value={form.new_job_title} onChange={e => set('new_job_title', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Input className="mt-1 rounded-xl text-sm" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button size="sm" className="bg-[#1B3A6B] text-white rounded-xl" onClick={handleSave}>حفظ الحركة</Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {records.length === 0 ? (
          <p className="text-center text-slate-400 py-8">لا توجد حركات وظيفية مسجلة</p>
        ) : (
          <div className="space-y-0">
            {records.map((r, idx) => (
              <div key={r.id} className="flex gap-4 pb-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-[#1B3A6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    <History size={14} />
                  </div>
                  {idx < records.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 mt-1" />}
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl p-4 mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[#1B3A6B] text-sm">{r.movement_type}</span>
                    <span className="text-slate-400 text-xs">{r.movement_date}</span>
                  </div>
                  <p className="text-slate-500 text-xs">رقم الأمر: {r.order_number}</p>
                  {(r.to_department || r.from_department) && (
                    <p className="text-slate-600 text-xs mt-1">{r.from_department && `من: ${r.from_department}`} {r.to_department && `← إلى: ${r.to_department}`}</p>
                  )}
                  {(r.to_grade || r.to_step) && (
                    <p className="text-slate-600 text-xs mt-1">الدرجة: {r.from_grade || '—'} → {r.to_grade || '—'} / المرحلة: {r.from_step || '—'} → {r.to_step || '—'}</p>
                  )}
                  {r.notes && <p className="text-slate-400 text-xs mt-1 italic">{r.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}