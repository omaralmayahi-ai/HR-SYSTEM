// B8a4: المطابقة مع كشف الرواتب الخارجي — ملف تعريف قابل للضبط (أي صيغة)، استيراد، وفروق.
// الملف نفسه ما يُحفظ بالنظام: بصمته والمبالغ المربوطة بالأعمدة فقط.
import React, { useEffect, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ar-IQ', { maximumFractionDigits: 2 }));
const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
  r.readAsDataURL(file);
});

export default function ReconcileTab({ period, category, canEnter, canApprove, user }) {
  const { toast } = useToast();
  const [meta, setMeta] = useState(null);
  const [profileId, setProfileId] = useState('');
  const [file, setFile] = useState(null);
  const [inspect, setInspect] = useState(null);
  const [draft, setDraft] = useState(null);
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState('');
  const err = (e) => toast({ title: 'تعذّر', description: e.message, variant: 'destructive' });
  const loadMeta = () => apiClient.payroll.importProfiles(category).then(m => { setMeta(m); if (!profileId && m.profiles[0]) setProfileId(String(m.profiles[0].id)); }).catch(err);
  const loadRec = () => apiClient.payroll.reconciliation(period.id).then(setRec).catch(err);
  useEffect(() => { loadMeta(); loadRec(); }, [period.id]);

  const pick = async (f, sheet) => {
    setFile(f); setInspect(null);
    if (!f) return;
    try { const b64 = await toBase64(f); const i = await apiClient.payroll.inspectExternal(b64, sheet); setInspect({ ...i, b64 }); }
    catch (e) { err(e); }
  };
  const confirm = async () => {
    setBusy('confirm');
    try { await apiClient.payroll.confirmExternalImport(period.id, rec.import.id); toast({ title: 'أُكّد الاستيراد' }); await loadRec(); }
    catch (e) { err(e); } finally { setBusy(''); }
  };
  const imp = rec?.import;
  const confirmBox = imp && (
    <div className={`rounded-xl p-2 text-[11px] flex items-center justify-between gap-2 ${imp.confirmed_by ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
      <span>{imp.confirmed_by ? `مؤكد من ${imp.confirmed_by} — ${String(imp.confirmed_at).slice(0, 16).replace('T', ' ')}` : 'غير مؤكد: يؤكده مستخدم بصلاحية الاعتماد غير الذي استورده، وبدون التأكيد ما يصير أساساً للفروق الرجعية بالفترة الظلّية.'}</span>
      {!imp.confirmed_by && canApprove && imp.imported_by !== user && <Button size="sm" disabled={!!busy} onClick={confirm}>{busy === 'confirm' ? 'جاري…' : 'تأكيد الاستيراد'}</Button>}
    </div>
  );
  const doImport = async () => {
    setBusy('import');
    try {
      const r = await apiClient.payroll.importExternal(period.id, { profile_id: Number(profileId), file_base64: inspect.b64, file_name: file.name, sheet: inspect.sheet });
      const notes = [r.unmatched && `${r.unmatched} رقماً غير موجود بالنظام`, r.other_category && `${r.other_category} من فئة أخرى`, r.bad_count && `${r.bad_count} خلية غير رقمية`, r.blank_count && `${r.blank_count} خلية فارغة`].filter(Boolean);
      toast({ title: `استُورد: ${r.matched} موظفاً من ${r.rows} صفاً`, description: notes.length ? notes.join('، ') : undefined });
      await loadRec();
    } catch (e) { err(e); } finally { setBusy(''); }
  };
  const targets = meta ? [...Object.entries(meta.targets).map(([code, name]) => ({ code, name })), ...meta.items.map(i => ({ code: i.code, name: `${i.code} — ${i.name}` }))] : [];
  const label = (t) => rec?.targets?.find(x => x.code === t)?.label ?? t;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
        <div>
          <h3 className="font-bold text-sm">المطابقة مع كشف الرواتب الخارجي</h3>
          <p className="text-[11px] text-slate-500">ارفع ملف Excel للكشف الفعلي لنفس الشهر. ملف التعريف يحدد أي عمود هو رقم الشركة وأي عمود يقابل أي بند، ويُحفظ لكل مرة. النظام ما يحفظ الملف: بصمته والمبالغ المربوطة فقط. بالفترة الظلّية تصير هذه المبالغ أساس الفروق الرجعية (س12.8).</p>
        </div>
        {canEnter && (
          <div className="flex flex-wrap gap-2 items-center">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => pick(e.target.files?.[0] || null)} className="text-xs" />
            {meta && (
              <select value={profileId} onChange={e => setProfileId(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
                <option value="">— ملف التعريف —</option>
                {meta.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <Button size="sm" variant="outline" disabled={!inspect} onClick={() => {
              const p = meta?.profiles.find(x => String(x.id) === profileId);
              setDraft(p ? { id: p.id, name: p.name, key_column: p.keyColumn, columns: p.columns } : { id: null, name: 'الكشف الشهري', key_column: inspect.headers[0] || '', columns: [] });
            }}>{profileId ? 'تعديل ملف التعريف' : 'ملف تعريف جديد'}</Button>
            <Button size="sm" disabled={!inspect || !profileId || !!busy} onClick={doImport}>{busy === 'import' ? 'جاري الاستيراد…' : 'استيراد ومطابقة'}</Button>
          </div>
        )}
        {inspect && (
          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
            {inspect.sheets?.length > 1 && (
              <select className="h-7 rounded border border-slate-200 px-1" value={inspect.sheet} onChange={e => pick(file, e.target.value)}>{inspect.sheets.map(n => <option key={n}>{n}</option>)}</select>
            )}
            <span>الورقة «{inspect.sheet}»، صف الرؤوس {inspect.header_row}، {inspect.data_rows} صف بيانات، {inspect.headers.length} عموداً.</span>
          </div>
        )}
      </div>

      {draft && inspect && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2 text-xs">
          <div className="flex gap-2 items-center"><span>الاسم</span><Input className="w-56 h-8" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></div>
          <div className="flex gap-2 items-center"><span>عمود رقم الشركة</span>
            <select className="h-8 rounded-lg border border-slate-200 px-2" value={draft.key_column} onChange={e => setDraft(d => ({ ...d, key_column: e.target.value }))}>{inspect.headers.map(h => <option key={h}>{h}</option>)}</select></div>
          <div className="grid md:grid-cols-2 gap-1 max-h-80 overflow-auto">
            {inspect.headers.filter(h => h !== draft.key_column).map(h => {
              const cur = draft.columns.find(c => c.header === h)?.target ?? '';
              return (
                <label key={h} className="flex items-center justify-between gap-2 border rounded-lg p-1.5">
                  <span className="truncate" title={h}>{h}</span>
                  <select className="h-7 rounded border border-slate-200 px-1 max-w-[60%]" value={cur} onChange={e => setDraft(d => ({ ...d, columns: [...d.columns.filter(c => c.header !== h), ...(e.target.value ? [{ header: h, target: e.target.value }] : [])] }))}>
                    <option value="">تجاهل</option>{targets.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={async () => {
              try { const r = await apiClient.payroll.saveImportProfile(draft.id, { ...draft, category }); toast({ title: 'حُفظ ملف التعريف' }); setDraft(null); await loadMeta(); setProfileId(String(r.id)); }
              catch (e) { err(e); }
            }}>حفظ</Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>إلغاء</Button>
          </div>
        </div>
      )}

      {rec && !rec.has_import && <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-400 text-center">ما استُورد كشف خارجي لهذه الفترة بعد.</div>}
      {rec?.has_import && !rec.has_run && <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-400 text-center space-y-2"><div>استُورد الكشف ({rec.import.file_name})؛ احتسب الفترة لتظهر المطابقة.</div>{confirmBox}</div>}
      {rec?.has_run && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div>الملف: <b>{rec.import.file_name}</b> · استورده {rec.import.imported_by} · {String(rec.import.imported_at).slice(0, 16).replace('T', ' ')}</div>
            <Button size="sm" variant="outline" onClick={() => apiClient.payroll.downloadReconciliation(period.id).catch(err)}>تصدير Excel</Button>
          </div>
          {confirmBox}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-center">
            {[['المطابقون', rec.summary.matched_employees], ['تطابق تام', rec.summary.exact_employees], ['بفروق', rec.summary.with_diffs], ['خلايا ناقصة', rec.summary.missing_cells], ['نسبة المطابقة', `${rec.summary.match_pct}%`], ['بالخارجي فقط', rec.summary.only_external], ['بالنظام فقط', rec.summary.only_system]].map(([l, v]) => (
              <div key={l} className="bg-slate-50 rounded-xl p-2"><div className="text-[11px] text-slate-500">{l}</div><div className="font-bold">{v}</div></div>
            ))}
          </div>
          <table className="w-full"><thead><tr className="text-slate-500 border-b">{['الهدف', 'النظام', 'الخارجي', 'الفرق'].map(h => <th key={h} className="p-1.5 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody>{Object.entries(rec.totals).map(([k, v]) => <tr key={k} className="border-b"><td className="p-1.5">{label(k)}</td><td className="p-1.5">{fmt(v.system)}</td><td className="p-1.5">{fmt(v.external)}</td><td className={`p-1.5 font-bold ${Number(v.diff) ? 'text-rose-700' : ''}`}>{fmt(v.diff)}</td></tr>)}</tbody></table>
          {rec.diffs.length > 0 && (
            <details open><summary className="font-bold cursor-pointer">الفروق ({rec.diffs.length})</summary>
              <table className="w-full mt-2"><thead><tr className="text-slate-500 border-b">{['رقم الشركة', 'الاسم', 'الهدف', 'النظام', 'الخارجي', 'الفرق'].map(h => <th key={h} className="p-1.5 text-right font-medium">{h}</th>)}</tr></thead>
                <tbody>{rec.diffs.slice(0, 300).map((d, i) => <tr key={i} className="border-b"><td className="p-1.5">{d.company_number}</td><td className="p-1.5">{d.name}</td><td className="p-1.5">{label(d.target)}</td><td className="p-1.5">{fmt(d.system)}</td><td className="p-1.5">{fmt(d.external)}</td><td className="p-1.5 font-bold text-rose-700">{fmt(d.diff)}</td></tr>)}</tbody></table>
            </details>
          )}
          {rec.missing_cells?.length > 0 && (
            <details><summary className="font-bold cursor-pointer">خلايا فارغة أو غير رقمية بالكشف ({rec.summary.missing_cells}) — ما تُقارن ولا تُعتبر صفراً</summary>
              <table className="w-full mt-2"><thead><tr className="text-slate-500 border-b">{['رقم الشركة', 'الاسم', 'الهدف', 'النظام'].map(h => <th key={h} className="p-1.5 text-right font-medium">{h}</th>)}</tr></thead>
                <tbody>{rec.missing_cells.slice(0, 300).map((d, i) => <tr key={i} className="border-b"><td className="p-1.5">{d.company_number}</td><td className="p-1.5">{d.name}</td><td className="p-1.5">{label(d.target)}</td><td className="p-1.5">{fmt(d.system)}</td></tr>)}</tbody></table>
            </details>
          )}
          {(rec.only_external?.length > 0 || rec.only_system?.length > 0) && (
            <details><summary className="font-bold cursor-pointer">غير المتطابقين ({rec.summary.only_external + rec.summary.only_system})</summary>
              <ul className="mt-2 space-y-0.5">
                {rec.only_external.map(x => <li key={`e${x.employee_id}`}>{x.company_number} {x.name} — بالكشف الخارجي فقط (ما احتسبه النظام)</li>)}
                {rec.only_system.map(x => <li key={`s${x.employee_id}`}>{x.company_number} {x.name} — بالنظام فقط</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
