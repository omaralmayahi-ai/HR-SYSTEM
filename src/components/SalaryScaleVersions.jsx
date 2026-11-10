// B4d (ق-5): إصدارات سلّم الرواتب — إصدار واحد نافذ، نسخة جديدة لأي تعديل لاحق، وتقرير فروقات قبل التفعيل.
import React, { useEffect, useState } from 'react';
import { Layers, CheckCircle2, Copy, BarChart3 } from 'lucide-react';
import apiClient from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const money = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toLocaleString('en-US')}`);

export default function SalaryScaleVersions({ onChanged }) {
  const { toast } = useToast();
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState('');
  const [diff, setDiff] = useState(null); // { version, data }
  const [cloneForm, setCloneForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setVersions(await apiClient.salaryScaleVersions.list()); setError(''); }
    catch (e) { setError(e.message || 'تعذّر تحميل الإصدارات'); }
  };
  useEffect(() => { load(); }, []);
  const active = versions.find(v => v.is_active);

  const showDiff = async (v) => {
    if (!active) return;
    setBusy(true);
    try { setDiff({ version: v, data: await apiClient.salaryScaleVersions.diff(active.id, v.id) }); }
    catch (e) { toast({ title: 'تعذّر إعداد التقرير', description: e.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const activate = async (v) => {
    setBusy(true);
    try {
      await apiClient.salaryScaleVersions.activate(v.id);
      toast({ title: 'صار الإصدار نافذاً', description: v.name });
      setDiff(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: 'تعذّر التفعيل', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const createClone = async () => {
    setBusy(true);
    try {
      await apiClient.salaryScaleVersions.create(cloneForm);
      toast({ title: 'أُنشئ الإصدار', description: 'غير نافذ لحين تفعيله؛ فعّله ثم عدّل مبالغه من الجدول أدناه' });
      setCloneForm(null);
      await load();
    } catch (e) {
      toast({ title: 'تعذّر الإنشاء', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="mb-4 bg-white border border-slate-100 rounded-2xl p-4" dir="rtl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2"><Layers className="w-4 h-4" /> إصدارات سلّم الرواتب</h3>
          <p className="text-[11px] text-slate-500 mt-1">الجدول أدناه = الإصدار النافذ وتعديلاته تنحفظ عليه. لتعديل بقرار جديد أنشئ إصداراً جديداً، راجع تقرير فروقاته، ثم فعّله.</p>
        </div>
        {active && (
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setCloneForm({ name: '', legal_basis: '', effective_from: '', copy_from: active.id })}>
            <Copy className="w-3.5 h-3.5" /> إصدار جديد
          </Button>
        )}
      </div>
      {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 mb-2">{error}</div>}
      <div className="space-y-2">
        {versions.map(v => (
          <div key={v.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${v.is_active ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-slate-50'}`}>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                {v.name}
                {v.is_active && <span className="text-[10px] text-emerald-700 bg-emerald-100 rounded px-1.5 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> نافذ</span>}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{v.legal_basis || 'بلا سند مسجل'}{v.effective_from ? ` · نافذ من ${String(v.effective_from).slice(0, 10)}` : ''} · {v.rows} صف</div>
              {v.notes && <div className="text-[10px] text-slate-400">{v.notes}</div>}
            </div>
            {!v.is_active && (
              <Button size="sm" variant="outline" disabled={busy} className="text-[11px] h-7 gap-1 shrink-0" onClick={() => showDiff(v)}>
                <BarChart3 className="w-3.5 h-3.5" /> الفروقات والتفعيل
              </Button>
            )}
          </div>
        ))}
      </div>

      {diff && (
        <Dialog open onOpenChange={(o) => { if (!o) setDiff(null); }}>
          <DialogContent className="max-w-2xl rounded-2xl" dir="rtl">
            <DialogHeader className="text-right"><DialogTitle className="text-base font-bold text-[#1B3A6B]">أثر تفعيل «{diff.version.name}»</DialogTitle></DialogHeader>
            <p className="text-[11px] text-slate-500">مقارنة بالإصدار النافذ «{active?.name}» للموظفين اللي يُولَّد لهم راتب. {diff.data.note}</p>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {[['الموظفون', diff.data.summary.employees], ['يزيد راتبهم', diff.data.summary.increased], ['ينقص راتبهم', diff.data.summary.decreased], ['الفرق الشهري الكلي', money(diff.data.summary.monthly_total_difference)]].map(([l, v]) => (
                <div key={l} className="bg-slate-50 rounded-xl p-2"><div className="text-slate-500 text-[10px]">{l}</div><div className="font-bold text-slate-800 mt-1" dir="ltr">{v}</div></div>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 sticky top-0"><tr><th className="text-right px-3 py-1.5">الدرجة</th><th className="text-right px-3 py-1.5">الموظفون</th><th className="text-right px-3 py-1.5">الفرق للموظف (من–إلى)</th><th className="text-right px-3 py-1.5">مجموع الفرق الشهري</th></tr></thead>
                <tbody>
                  {Object.entries(diff.data.by_grade).sort((a, b) => Number(a[0]) - Number(b[0])).map(([g, x]) => (
                    <tr key={g} className="border-t border-slate-50">
                      <td className="px-3 py-1.5 font-bold">{g}</td>
                      <td className="px-3 py-1.5">{x.employees}</td>
                      <td className="px-3 py-1.5" dir="ltr">{x.per_employee_min === x.per_employee_max ? money(x.per_employee_min) : `${money(x.per_employee_min)} … ${money(x.per_employee_max)}`}</td>
                      <td className={`px-3 py-1.5 font-bold ${x.total_difference < 0 ? 'text-red-600' : x.total_difference > 0 ? 'text-emerald-700' : ''}`} dir="ltr">{money(x.total_difference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {diff.data.summary.missing_scale > 0 && <p className="text-[11px] text-amber-700">{diff.data.summary.missing_scale} موظف درجته/مرحلته غير موجودة بأحد الإصدارين.</p>}
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDiff(null)}>إغلاق</Button>
              <Button size="sm" disabled={busy} className="bg-[#1B3A6B]" onClick={() => activate(diff.version)}>{busy ? 'جارٍ التفعيل...' : 'تفعيل هذا الإصدار'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {cloneForm && (
        <Dialog open onOpenChange={(o) => { if (!o) setCloneForm(null); }}>
          <DialogContent className="max-w-md rounded-2xl" dir="rtl">
            <DialogHeader className="text-right"><DialogTitle className="text-base font-bold text-[#1B3A6B]">إصدار جديد لسلّم الرواتب</DialogTitle></DialogHeader>
            <div className="space-y-2 text-xs">
              <label className="block">ينسخ من
                <select className="mt-1 w-full border rounded-lg h-9 px-2 bg-white" value={cloneForm.copy_from} onChange={e => setCloneForm({ ...cloneForm, copy_from: Number(e.target.value) })}>
                  {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <Input placeholder="اسم الإصدار *" value={cloneForm.name} onChange={e => setCloneForm({ ...cloneForm, name: e.target.value })} />
              <Input placeholder="السند القانوني (رقم القرار وتاريخه)" value={cloneForm.legal_basis} onChange={e => setCloneForm({ ...cloneForm, legal_basis: e.target.value })} />
              <label className="block">نافذ من<Input className="mt-1" type="date" value={cloneForm.effective_from} onChange={e => setCloneForm({ ...cloneForm, effective_from: e.target.value })} /></label>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setCloneForm(null)}>إلغاء</Button>
              <Button size="sm" disabled={busy || !cloneForm.name.trim()} className="bg-[#1B3A6B]" onClick={createClone}>إنشاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
