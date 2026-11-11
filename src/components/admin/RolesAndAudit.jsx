// B9: الأدوار المرنة (ق-3) وسجل التدقيق.
import React, { useEffect, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BASE_LABEL = { admin: 'مدير (كل الشاشات)', user: 'إدخال وتعديل', employee: 'اطلاع فقط' };

export function RolesPanel({ onChange }) {
  const { toast } = useToast();
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState(null);
  const load = () => apiClient.roles.list().then(setD).catch(e => toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }));
  useEffect(() => { load(); }, []);
  const err = (e) => toast({ title: 'تعذّر', description: e.message, variant: 'destructive' });
  const toggle = async (r, p) => {
    const permissions = r.permissions.includes(p) ? r.permissions.filter(x => x !== p) : [...r.permissions, p];
    try { await apiClient.roles.update(r.name, { permissions }); await load(); onChange?.(); } catch (e) { err(e); }
  };
  if (!d) return <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-400">جاري التحميل…</div>;
  const perms = Object.entries(d.permissions);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-800">الأدوار والصلاحيات</h2>
          <p className="text-xs text-slate-500 mt-1">كل دور له أساس يحدد الشاشات العامة، وصلاحيات دقيقة لوحدة الرواتب والإدارة. التعديل يسري فوراً ومسجّل بسجل التدقيق. المستخدم ما يكدر يغيّر دوره هو.</p>
        </div>
        {!draft && <Button size="sm" onClick={() => setDraft({ name: '', label: '', base: 'user', permissions: [] })}>دور جديد</Button>}
      </div>
      {draft && (
        <div className="flex flex-wrap gap-2 items-end border rounded-xl p-3">
          <Input className="w-40 h-9 font-mono" placeholder="الاسم (لاتيني)" value={draft.name} onChange={e => setDraft(x => ({ ...x, name: e.target.value }))} />
          <Input className="w-56 h-9" placeholder="الوصف (مثل: مسؤول رواتب)" value={draft.label} onChange={e => setDraft(x => ({ ...x, label: e.target.value }))} />
          <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={draft.base} onChange={e => setDraft(x => ({ ...x, base: e.target.value }))}>
            {d.bases.map(b => <option key={b} value={b}>{BASE_LABEL[b] || b}</option>)}
          </select>
          <Button size="sm" onClick={async () => { try { await apiClient.roles.create(draft); setDraft(null); await load(); onChange?.(); } catch (e) { err(e); } }}>حفظ</Button>
          <Button size="sm" variant="outline" onClick={() => setDraft(null)}>إلغاء</Button>
        </div>
      )}
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-slate-500 border-b"><th className="p-2 text-right">الدور</th><th className="p-2 text-right">الأساس</th><th className="p-2 text-right">المستخدمون</th>
            {perms.map(([k, l]) => <th key={k} className="p-2 text-center font-medium" title={l}>{l.split(' (')[0].slice(0, 28)}</th>)}<th /></tr></thead>
          <tbody>{d.roles.map(r => (
            <tr key={r.name} className="border-b">
              <td className="p-2"><b>{r.label}</b> <span className="font-mono text-slate-400">{r.name}</span>{r.isSystem ? <span className="text-[10px] text-slate-400"> · نظامي</span> : null}</td>
              <td className="p-2">{BASE_LABEL[r.base] || r.base}</td><td className="p-2">{r.users}</td>
              {perms.map(([k]) => <td key={k} className="p-2 text-center"><input type="checkbox" checked={r.permissions.includes(k)} disabled={r.name === 'admin' || r.base === 'employee'} onChange={() => toggle(r, k)} /></td>)}
              <td className="p-2">{!r.isSystem && r.users === 0 && <Button size="sm" variant="outline" onClick={async () => { if (!window.confirm(`حذف الدور ${r.label}؟`)) return; try { await apiClient.roles.remove(r.name); await load(); onChange?.(); } catch (e) { err(e); } }}>حذف</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">فصل المهام: من يحتسب الفترة ما يعتمدها، ومن يُدخل عملية رواتب ما يعتمدها، والمرتبط بموظف ما يعمل على سجله المالي.</p>
    </div>
  );
}

export function AuditPanel() {
  const { toast } = useToast();
  const [f, setF] = useState({ user: '', path: '', failed: false, offset: 0 });
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    apiClient.roles.audit({ user: f.user, path: f.path, failed: f.failed ? '1' : '', offset: f.offset, limit: 100 }).then(setD).catch(e => toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }));
  }, [f]);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3" dir="rtl">
      <div>
        <h2 className="font-bold text-slate-800">سجل التدقيق</h2>
        <p className="text-xs text-slate-500 mt-1">كل عملية كتابة على النظام: من، متى، ماذا، والنتيجة. السجل إلحاقي (ما يُعدَّل ولا يُحذف)، وكلمات المرور محجوبة.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <Input className="w-40 h-8" placeholder="المستخدم" value={f.user} onChange={e => setF(x => ({ ...x, user: e.target.value, offset: 0 }))} />
        <Input className="w-56 h-8" placeholder="المسار (مثل payroll)" value={f.path} onChange={e => setF(x => ({ ...x, path: e.target.value, offset: 0 }))} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.failed} onChange={e => setF(x => ({ ...x, failed: e.target.checked, offset: 0 }))} /> المرفوضة فقط</label>
        <span className="text-slate-500">{d?.total ?? 0} سجلاً</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-slate-500 border-b">{['الوقت', 'المستخدم', 'الدور', 'العملية', 'المسار', 'النتيجة', 'المدة'].map(h => <th key={h} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
          <tbody>{(d?.rows || []).map(r => (
            <React.Fragment key={r.id}>
              <tr className={`border-b cursor-pointer hover:bg-slate-50 ${r.status >= 400 ? 'text-rose-700' : ''}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <td className="p-2 font-mono">{String(r.at).slice(0, 19).replace('T', ' ')}</td><td className="p-2">{r.username || '—'}</td><td className="p-2">{r.role || '—'}</td>
                <td className="p-2 font-mono">{r.method}</td><td className="p-2 font-mono" dir="ltr">{r.path}</td><td className="p-2">{r.status}</td><td className="p-2" dir="ltr">{r.duration_ms ?? 0} ms</td>
              </tr>
              {open === r.id && <tr><td colSpan={7} className="p-2 bg-slate-50"><pre className="text-[11px] whitespace-pre-wrap font-mono" dir="ltr">{JSON.stringify(r.body, null, 2)}</pre></td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={f.offset === 0} onClick={() => setF(x => ({ ...x, offset: Math.max(0, x.offset - 100) }))}>السابق</Button>
        <Button size="sm" variant="outline" disabled={!d || f.offset + 100 >= d.total} onClick={() => setF(x => ({ ...x, offset: x.offset + 100 }))}>التالي</Button>
      </div>
    </div>
  );
}
