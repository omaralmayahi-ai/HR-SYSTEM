// B7 (ق-12): تقويم العطل الرسمية — محفوظ بقاعدة البيانات (جدول official_holidays).
// الميلادية الثابتة من قانون العطل الرسمية 12 لسنة 2024 وتُنسخ لكل سنة، والهجرية والطارئة
// يدخلها مسؤول الموارد سنوياً بتواريخها، وعطل الأديان الخاصة تُسجل للعلم وتُمنح بطلب الموظف.
import React, { useCallback, useEffect, useState } from 'react';
import { request } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Trash2, Copy } from 'lucide-react';

const KINDS = ['ميلادي ثابت', 'هجري', 'طارئ', 'ديني خاص'];
const KIND_STYLE = {
  'ميلادي ثابت': 'bg-sky-50 text-sky-700',
  'هجري': 'bg-amber-50 text-amber-700',
  'طارئ': 'bg-red-50 text-red-700',
  'ديني خاص': 'bg-violet-50 text-violet-700',
};

export default function OfficialHolidaysManager({ toast }) {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ holiday_date: '', name: '', kind: 'هجري', legal_basis: '', notes: '' });

  const notify = (title, description, variant) => toast?.({ title, description, variant });

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await request(`/api/official-holidays?year=${year}`)); }
    catch (e) { notify('تعذر تحميل العطل', e.message, 'destructive'); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.holiday_date || !form.name.trim()) return;
    try {
      await request('/api/official-holidays', { method: 'POST', body: JSON.stringify(form) });
      setForm({ ...form, holiday_date: '', name: '', notes: '' });
      notify('تمت إضافة العطلة');
      if (form.holiday_date.startsWith(String(year))) load(); else setYear(parseInt(form.holiday_date.slice(0, 4)));
    } catch (e2) { notify('تعذر الحفظ', e2.message, 'destructive'); }
  };

  const remove = async (row) => {
    if (!window.confirm(`حذف «${row.name}» بتاريخ ${row.holiday_date}؟`)) return;
    try { await request(`/api/official-holidays/${row.id}`, { method: 'DELETE' }); load(); }
    catch (e) { notify('تعذر الحذف', e.message, 'destructive'); }
  };

  const copyFixed = async () => {
    try {
      const r = await request('/api/official-holidays/copy-fixed', { method: 'POST', body: JSON.stringify({ from_year: year - 1, to_year: year }) });
      notify('نسخ العطل الثابتة', `أُضيفت ${r.inserted} عطلة من سنة ${year - 1}`);
      load();
    } catch (e) { notify('تعذر النسخ', e.message, 'destructive'); }
  };

  const hijriCount = rows.filter(r => r.kind === 'هجري').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-700">تقويم العطل الرسمية (قانون 12 لسنة 2024)</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setYear(year - 1)} className="px-2 py-1 rounded-lg border text-xs" title="السنة السابقة">›</button>
          <span className="font-mono text-sm font-bold w-12 text-center">{year}</span>
          <button type="button" onClick={() => setYear(year + 1)} className="px-2 py-1 rounded-lg border text-xs" title="السنة التالية">‹</button>
          {canEdit && <button type="button" onClick={copyFixed} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs">
            <Copy size={12} /> نسخ الثابتة من {year - 1}
          </button>}
        </div>
      </div>

      {hijriCount === 0 && !loading && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          لم تُدخل العطل الهجرية لسنة {year} بعد — تواريخها تتغير سنوياً، أدخلها حسب الإعلان الرسمي.
        </p>
      )}

      {!canEdit && <p className="text-[11px] text-slate-500">تعديل التقويم لمدير النظام.</p>}
      {canEdit && <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <input type="date" value={form.holiday_date} onChange={e => setForm({ ...form, holiday_date: e.target.value })}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm" required />
        <input placeholder="اسم العطلة" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm md:col-span-2" required />
        <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
          {KINDS.map(k => <option key={k}>{k}</option>)}
        </select>
        <button type="submit" className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-[#1B3A6B] text-white text-sm">
          <Plus size={14} /> إضافة
        </button>
        <input placeholder="السند (اختياري، مثل: إعلان الأمانة العامة لمجلس الوزراء)" value={form.legal_basis}
          onChange={e => setForm({ ...form, legal_basis: e.target.value })}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs md:col-span-5" />
      </form>}
      {canEdit && form.kind === 'ديني خاص' && (
        <p className="text-[11px] text-violet-700">عطل الأديان الخاصة لا تُعطّل الدائرة؛ تُمنح للموظف بطلبه حسب ديانته.</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">العطلة</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">السند</th>
              <th className="px-4 py-3 text-left"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading && <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-400">جاري التحميل…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-400">لا توجد عطل مسجلة لسنة {year}</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-mono">{r.holiday_date}</td>
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[10px] ${KIND_STYLE[r.kind] || ''}`}>{r.kind}</span></td>
                <td className="px-4 py-2.5 text-slate-500">{r.legal_basis || '—'}</td>
                <td className="px-4 py-2.5 text-left">
                  {canEdit && <button type="button" onClick={() => remove(r)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg"><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
