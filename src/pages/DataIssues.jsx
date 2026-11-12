// المرحلة C: حالات الاستفسار — ما رحّله نظام المخصصات (الشبهات وغير الموجودين بالكشف) وتعارضات الترحيل.
// الحالة ما تُحذف: تُعالج بوضع وقرار مكتوب، وكل تغيير بسجل التدقيق.
import React, { useEffect, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { can } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList } from 'lucide-react';

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ar-IQ', { maximumFractionDigits: 0 }));
const badge = { 'مفتوحة': 'bg-amber-50 text-amber-800', 'قيد المراجعة': 'bg-sky-50 text-sky-800', 'محلولة': 'bg-emerald-50 text-emerald-800', 'مستبعدة': 'bg-slate-100 text-slate-600' };

export default function DataIssues() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = can(user, 'payroll.enter');
  const [filters, setFilters] = useState({ status: 'مفتوحة', code: '', q: '', offset: 0 });
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => apiClient.dataIssues.list(filters).then(setData).catch(e => toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }));
  useEffect(() => { load(); }, [filters.status, filters.code, filters.offset]);

  const codes = data ? [...new Map(data.counts.map(c => [c.issue_code, c.title])).entries()] : [];
  const total = (code) => (data?.counts || []).filter(c => !code || c.issue_code === code).reduce((a, c) => a + (filters.status && c.status !== filters.status ? 0 : c.n), 0);
  const save = async () => {
    try { await apiClient.dataIssues.update(edit.id, { status: edit.status, resolution: edit.resolution }); toast({ title: 'حُفظ القرار' }); setEdit(null); await load(); }
    catch (e) { toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
        <div className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-[#1B3A6B]" /><h1 className="font-bold text-lg">حالات الاستفسار</h1></div>
        <p className="text-xs text-slate-500">ما رحّله نظام المخصصات للاستفسار (شبهات العائلية، غير الموجودين بكشف الرواتب) وتعارضات ترحيله مع HR-SYSTEM. الحالة تُعالج بقرار مكتوب ولا تُحذف؛ تصحيح البيانات نفسها من سجل الموظف أو العائلة.</p>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <select className="h-9 rounded-lg border border-slate-200 px-2" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, offset: 0 }))}>
            <option value="">كل الحالات</option>{(data?.statuses || []).map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-slate-200 px-2 max-w-xs" value={filters.code} onChange={e => setFilters(f => ({ ...f, code: e.target.value, offset: 0 }))}>
            <option value="">كل الأنواع ({total('')})</option>{codes.map(([c, t]) => <option key={c} value={c}>{t} ({total(c)})</option>)}
          </select>
          <Input className="w-56 h-9" placeholder="رقم الشركة أو الاسم" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} onKeyDown={e => e.key === 'Enter' && load()} />
          <Button size="sm" variant="outline" onClick={() => (filters.offset ? setFilters(f => ({ ...f, offset: 0 })) : load())}>بحث</Button>
          {data && <span className="text-xs text-slate-500">{data.total ? `${data.offset + 1}–${data.offset + data.issues.length} من ${data.total}` : ''}</span>}
          {data && data.offset > 0 && <Button size="sm" variant="outline" onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, f.offset - data.page_size) }))}>السابق</Button>}
          {data && data.offset + data.issues.length < data.total && <Button size="sm" variant="outline" onClick={() => setFilters(f => ({ ...f, offset: f.offset + data.page_size }))}>التالي</Button>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-2 overflow-auto">
        {!data ? <div className="p-6 text-center text-sm text-slate-400">جاري التحميل…</div> : !data.issues.length ? <div className="p-6 text-center text-sm text-slate-400">ما في حالات بهذا الفلتر.</div> : (
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500 border-b">{['رقم الشركة', 'الاسم', 'النوع', 'التفاصيل', 'بالكشف', 'المحتسب', 'الحالة', 'القرار', ''].map(h => <th key={h} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody>{data.issues.map(i => (
              <tr key={i.id} className="border-b align-top">
                <td className="p-2 whitespace-nowrap">{i.company_number}</td>
                <td className="p-2">{i.full_name ?? <span className="text-rose-600">غير موجود بـ HR</span>}</td>
                <td className="p-2">{i.title}<div className="text-[10px] text-slate-400">{i.source}</div></td>
                <td className="p-2 max-w-xs">{i.details}</td>
                <td className="p-2">{fmt(i.external_amount)}</td>
                <td className="p-2">{fmt(i.computed_amount)}</td>
                <td className="p-2"><span className={`rounded-full px-2 py-0.5 ${badge[i.status] || ''}`}>{i.status}</span></td>
                <td className="p-2 max-w-xs">{i.resolution}{i.resolved_by && <div className="text-[10px] text-slate-400">{i.resolved_by}</div>}</td>
                <td className="p-2">{canEdit && <Button size="sm" variant="outline" onClick={() => setEdit({ id: i.id, status: i.status, resolution: i.resolution || '' })}>معالجة</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {edit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold">معالجة الحالة</h3>
            <select className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" value={edit.status} onChange={e => setEdit(x => ({ ...x, status: e.target.value }))}>
              {data.statuses.map(s => <option key={s}>{s}</option>)}
            </select>
            <textarea className="w-full rounded-lg border border-slate-200 p-2 text-sm h-24" placeholder="القرار (إلزامي للمحلولة والمستبعدة): مثلاً صُحح تاريخ الميلاد بأمر رقم…" value={edit.resolution} onChange={e => setEdit(x => ({ ...x, resolution: e.target.value }))} />
            <div className="flex gap-2"><Button size="sm" onClick={save}>حفظ</Button><Button size="sm" variant="outline" onClick={() => setEdit(null)}>إلغاء</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
