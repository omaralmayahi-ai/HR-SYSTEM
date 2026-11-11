// B8a1: بنود الرواتب (نسخ مؤرخة بسند وحالة تحقق)، العمليات بانتظار الاعتماد، وفحص جودة البيانات.
import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Coins, Clock3, ShieldCheck, Plus, Trash2, CheckCircle2, XCircle, CalendarClock } from 'lucide-react';
import EntitlementStates from '@/components/payroll/EntitlementStates';

const statusStyle = { 'مسودة': 'bg-amber-100 text-amber-800', 'فعّال': 'bg-emerald-100 text-emerald-800', 'موقوف': 'bg-slate-200 text-slate-600', 'منتهٍ': 'bg-slate-200 text-slate-500' };
const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');

export default function PayrollItems() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('items');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [pending, setPending] = useState([]);
  const [quality, setQuality] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [it, m, p] = await Promise.all([apiClient.payroll.items(), apiClient.payroll.meta(), apiClient.payroll.pending()]);
      setItems(it); setMeta(m); setPending(p);
    } catch (e) { toast({ title: 'تعذّر التحميل', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'quality' && !quality) apiClient.payroll.dataQuality().then(setQuality).catch(e => toast({ title: 'تعذّر الفحص', description: e.message, variant: 'destructive' })); }, [tab]);

  const decide = async (op, kind) => {
    try {
      if (kind === 'approve') await apiClient.payroll.approve(op.id);
      else if (kind === 'reject') { const r = window.prompt('سبب الرفض'); if (!r) return; await apiClient.payroll.reject(op.id, r); }
      else await apiClient.payroll.cancel(op.id);
      toast({ title: kind === 'approve' ? 'اعتُمدت العملية' : kind === 'reject' ? 'رُفضت العملية' : 'أُلغيت العملية' });
      load();
    } catch (e) { toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }); }
  };

  const groups = useMemo(() => [['+', 'المخصصات'], ['-', 'الاستقطاعات']].map(([d, l]) => [l, items.filter(i => i.direction === d)]), [items]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h1 className="text-lg font-bold text-[#1B3A6B] flex items-center gap-2"><Coins className="w-5 h-5" /> بنود الرواتب</h1>
        <p className="text-xs text-slate-500 mt-1">كل بند بنسخ مؤرخة بسندها وحالة تحققها. تعديل مسودة بند ما فُعّل يُحفظ مباشرة؛ التفعيل وأي تغيير على بند فعّال، والإسنادات والعائلة، تنتظر اعتماد مدير غير اللي أدخلها.</p>
        <div className="flex gap-2 mt-4">
          {[['items', 'البنود', Coins], ['pending', `بانتظار الاعتماد (${pending.length})`, Clock3], ['states', 'حالات الاستحقاق', CalendarClock], ['quality', 'جودة البيانات', ShieldCheck]].map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${tab === k ? 'bg-[#1B3A6B] text-white' : 'bg-slate-100 text-slate-600'}`}><I className="w-3.5 h-3.5" />{l}</button>
          ))}
        </div>
      </div>

      {tab === 'items' && groups.map(([label, list]) => (
        <div key={label} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 text-sm font-bold text-slate-700 border-b border-slate-100">{label}</div>
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 text-slate-500"><tr>
              <th className="px-4 py-2">الرمز</th><th className="px-4 py-2">البند</th><th className="px-4 py-2">التصنيف</th><th className="px-4 py-2">الإسناد</th>
              <th className="px-4 py-2">الحالة الحالية</th><th className="px-4 py-2">التحقق</th><th className="px-4 py-2">النفاذ</th><th className="px-4 py-2">السند</th><th className="px-4 py-2"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {loading && <tr><td colSpan={9} className="px-4 py-4 text-center text-slate-400">جاري التحميل…</td></tr>}
              {list.map(i => {
                const p = i.current?.props || {};
                return (
                  <tr key={i.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-mono">{i.code}</td>
                    <td className="px-4 py-2 font-bold text-slate-700">{i.name}</td>
                    <td className="px-4 py-2">{i.classification}</td>
                    <td className="px-4 py-2">{i.assignment_mode ?? i.assignmentMode}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusStyle[p.status] || ''}`}>{p.status || '—'}</span></td>
                    <td className="px-4 py-2">{p.verification === 'مؤكد' ? <span className="text-emerald-700">مؤكد</span> : <span className="text-amber-700">يُتحقق</span>}</td>
                    <td className="px-4 py-2 font-mono">{fmtDate(i.current?.validFrom)}{i.current?.validTo ? ` → ${fmtDate(i.current.validTo)}` : ''}</td>
                    <td className="px-4 py-2 text-slate-500 max-w-[220px] truncate" title={p.legal_basis}>{p.legal_basis || '—'}</td>
                    <td className="px-4 py-2 text-left whitespace-nowrap">
                      {i.pending_count > 0 && <span className="text-[10px] text-sky-700 ml-2">{i.pending_count} معلّقة</span>}
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setEditing(i)}>نسخة جديدة</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'pending' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-2">العملية</th><th className="px-4 py-2">النوع</th><th className="px-4 py-2">أدخلها</th><th className="px-4 py-2">متى</th><th className="px-4 py-2"></th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {pending.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">لا عمليات بانتظار الاعتماد</td></tr>}
              {pending.map(op => (
                <tr key={op.id}>
                  <td className="px-4 py-2 font-bold text-slate-700">{op.summary}</td>
                  <td className="px-4 py-2 font-mono text-[10px]">{op.opType}</td>
                  <td className="px-4 py-2">{op.enteredBy}</td>
                  <td className="px-4 py-2 font-mono">{String(op.enteredAt).slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-4 py-2 text-left whitespace-nowrap space-x-1 space-x-reverse">
                    {user?.role === 'admin' && op.enteredBy !== user?.username && <>
                      <Button size="sm" className="h-7 text-[11px] bg-emerald-600 gap-1" onClick={() => decide(op, 'approve')}><CheckCircle2 className="w-3.5 h-3.5" />اعتماد</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600 gap-1" onClick={() => decide(op, 'reject')}><XCircle className="w-3.5 h-3.5" />رفض</Button>
                    </>}
                    {op.enteredBy === user?.username && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => decide(op, 'cancel')}>إلغاء</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 px-4 py-2 border-t border-slate-100">يعتمدها مدير غير اللي أدخلها. العملية تُطبّق عند الاعتماد فقط، وقبلها ما إلها أثر بالاحتساب.</p>
        </div>
      )}

      {tab === 'states' && <EntitlementStates onSubmitted={load} />}

      {tab === 'quality' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
          {!quality && <div className="text-xs text-slate-400">جاري الفحص…</div>}
          {quality?.checks.map(c => (
            <details key={c.label} className={`rounded-xl border px-3 py-2 ${c.count ? 'border-amber-200 bg-amber-50/40' : 'border-emerald-100 bg-emerald-50/30'}`}>
              <summary className="text-xs font-bold cursor-pointer flex justify-between"><span>{c.label}</span><span className={c.count ? 'text-amber-700' : 'text-emerald-700'}>{c.count}</span></summary>
              {c.count > 0 && <div className="mt-2 text-[11px] text-slate-600 space-y-0.5 max-h-48 overflow-y-auto">
                {c.sample.map((r, i) => <div key={i}>{Object.values(r).filter(v => v !== null).join(' · ')}</div>)}
                {c.count > c.sample.length && <div className="text-slate-400">… و{c.count - c.sample.length} أخرى</div>}
              </div>}
            </details>
          ))}
          <p className="text-[11px] text-slate-500">البند ما يُفعَّل وبياناته ناقصة: يكمل كل فحص يخصه أولاً حتى ما يُحرم مستحق.</p>
        </div>
      )}

      {editing && meta && <VersionEditor item={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

const bool = (v) => v === true;

function VersionEditor({ item, meta, onClose, onSaved }) {
  const { toast } = useToast();
  const base = item.current?.props || {};
  // تعديل مسودة: نفس تاريخ النسخة الحالية حتى ما تنقسم المسودة بكل حفظ
  const [validFrom, setValidFrom] = useState(base.status === 'مسودة' && item.current?.validFrom ? item.current.validFrom : meta.today);
  const [validTo, setValidTo] = useState('');
  const [order, setOrder] = useState({ order_number: '', order_date: '' });
  const [p, setP] = useState(() => JSON.parse(JSON.stringify(base)));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setP(x => ({ ...x, [k]: v }));
  const src = p.level_source ? meta.level_sources[p.level_source] : null;
  const levelVal = (refId) => (p.levels || []).find(l => String(l.ref_id) === String(refId))?.value ?? '';
  const setLevel = (row, v) => setP(x => {
    const lv = (x.levels || []).filter(l => String(l.ref_id) !== String(row.id));
    if (v !== '' && v !== null) lv.push({ ref_id: row.id, label: row.name, value: Number(v) });
    return { ...x, levels: lv };
  });
  const conds = Array.isArray(p.conditions) ? p.conditions : [];
  const setConds = (c) => set('conditions', c);

  const save = async () => {
    setSaving(true);
    try {
      const body = { valid_from: validFrom, valid_to: validTo || null, props: p, order: order.order_number ? order : null };
      const r = await apiClient.payroll.proposeVersion(item.id, body);
      toast({ title: r.applied ? 'حُفظت المسودة' : 'أُرسلت للاعتماد', description: r.applied ? 'تعديل مسودة بند ما فُعّل يُطبّق مباشرة' : 'تُطبّق بعد اعتماد مدير آخر' });
      (r.warnings || []).forEach(w => toast({ title: 'تنبيه', description: w }));
      onSaved();
    } catch (e) { toast({ title: 'تعذّر الحفظ', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const L = ({ children }) => <label className="block text-[11px] font-bold text-slate-600">{children}</label>;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right"><DialogTitle className="text-base font-bold text-[#1B3A6B]">نسخة جديدة: {item.name} ({item.code})</DialogTitle></DialogHeader>
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div><L>نافذة من *</L><Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} /></div>
          <div><L>إلى (فارغ = مفتوح)</L><Input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} /></div>
          <div><L>رقم الأمر {p.status !== 'مسودة' && '*'}</L><Input value={order.order_number} onChange={e => setOrder({ ...order, order_number: e.target.value })} /></div>
          <div><L>تاريخ الأمر</L><Input type="date" value={order.order_date} onChange={e => setOrder({ ...order, order_date: e.target.value })} /></div>
          <div><L>الحالة</L><select className="w-full border rounded-lg h-9 px-2 bg-white" value={p.status} onChange={e => set('status', e.target.value)}>{['مسودة', 'فعّال', 'موقوف', 'منتهٍ'].map(s => <option key={s}>{s}</option>)}</select></div>
          <div><L>التحقق</L><select className="w-full border rounded-lg h-9 px-2 bg-white" value={p.verification} onChange={e => set('verification', e.target.value)}><option>مؤكد</option><option>يُتحقق</option></select></div>
          <div className="col-span-2"><L>السند القانوني</L><Input value={p.legal_basis || ''} onChange={e => set('legal_basis', e.target.value)} /></div>
          {item.method !== 'family' && !p.level_source && <>
            <div><L>نوع القيمة</L><select className="w-full border rounded-lg h-9 px-2 bg-white" value={p.value_kind || ''} onChange={e => set('value_kind', e.target.value || null)}><option value="">—</option><option>نسبة</option><option>مبلغ</option></select></div>
            <div><L>القيمة {p.value_kind === 'نسبة' ? '(%)' : '(دينار)'}</L><Input type="number" value={p.value ?? ''} onChange={e => set('value', e.target.value === '' ? null : Number(e.target.value))} /></div>
          </>}
          {item.direction === '+' && <>
            <div className="flex items-end gap-2"><input type="checkbox" checked={bool(p.inside_200_cap)} onChange={e => set('inside_200_cap', e.target.checked)} /><L>داخل سقف 200%</L></div>
            <div><L>أولوية التخفيض عند السقف (ق-6)</L><Input type="number" value={p.cap_reduction_priority ?? ''} onChange={e => set('cap_reduction_priority', e.target.value === '' ? null : Number(e.target.value))} /></div>
            <div><L>ترتيب الاحتساب</L><Input type="number" value={p.calc_order ?? ''} onChange={e => set('calc_order', e.target.value === '' ? null : Number(e.target.value))} /></div>
          </>}
          {item.direction === '-' && <>
            <div><L>أولوية الاستقطاع</L><Input type="number" value={p.deduction_priority ?? ''} onChange={e => set('deduction_priority', e.target.value === '' ? null : Number(e.target.value))} /></div>
            <div className="flex items-end gap-2"><input type="checkbox" checked={bool(p.round_line)} onChange={e => set('round_line', e.target.checked)} /><L>يُقرَّب لكل سطر (كشوف الجهات)</L></div>
          </>}
          <div className="flex items-end gap-2"><input type="checkbox" checked={p.withholdable !== false} onChange={e => set('withholdable', e.target.checked)} /><L>يقبل الحجب</L></div>
          <div className="flex items-end gap-2"><input type="checkbox" checked={bool(p.individual_override)} onChange={e => set('individual_override', e.target.checked)} /><L>يقبل الإسناد الفردي فوق القاعدة</L></div>
        </div>

        {item.method === 'family' && (
          <div className="grid grid-cols-5 gap-2 text-xs mt-2">
            {[['spouse_amount', 'الإعالة'], ['child_amount', 'الطفل'], ['max_children', 'أقصى أطفال'], ['son_age', 'عمر الابن'], ['son_student_age', 'عمر الابن الطالب']].map(([k, l]) => (
              <div key={k}><L>{l}</L><Input type="number" value={p.family?.[k] ?? ''} onChange={e => set('family', { ...(p.family || {}), [k]: Number(e.target.value) })} /></div>
            ))}
          </div>
        )}

        {src && (
          <div className="mt-3">
            <div className="text-xs font-bold text-slate-700 mb-1">المستويات حسب {src.label} ({p.value_kind === 'مبلغ' ? 'مبلغ بالدينار' : 'نسبة %'}) — الفارغ ما يُمنح ويظهر بفحص الجودة</div>
            <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl">
              <table className="w-full text-xs"><tbody>
                {src.rows.map(r => (
                  <tr key={r.id} className="border-b border-slate-50"><td className="px-3 py-1">{r.name}</td>
                    <td className="px-3 py-1 w-32"><Input className="h-7" type="number" value={levelVal(r.id)} onChange={e => setLevel(r, e.target.value)} /></td></tr>
                ))}
              </tbody></table>
            </div>
            {p.class_amounts && <p className="text-[10px] text-slate-500 mt-1">مبالغ التصنيفات بالقانون: {Object.entries(p.class_amounts).map(([k, v]) => `${k} ${Number(v).toLocaleString()}`).join(' · ')}</p>}
          </div>
        )}

        <div className="mt-3">
          <div className="flex items-center justify-between"><div className="text-xs font-bold text-slate-700">الشروط (مجموعات «أو»، وداخل المجموعة «و»)</div>
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setConds([...conds, [{ field: 'service_type', op: 'يساوي', value: '' }]])}><Plus className="w-3 h-3" />مجموعة</Button></div>
          {conds.map((g, gi) => (
            <div key={gi} className="border border-slate-100 rounded-xl p-2 mt-1 space-y-1">
              {g.map((c, ci) => (
                <div key={ci} className="flex gap-1">
                  <select className="border rounded h-8 px-1 text-xs bg-white" value={c.field} onChange={e => { const n = JSON.parse(JSON.stringify(conds)); n[gi][ci].field = e.target.value; setConds(n); }}>
                    {Object.entries(meta.condition_fields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                  </select>
                  <select className="border rounded h-8 px-1 text-xs bg-white" value={c.op} onChange={e => { const n = JSON.parse(JSON.stringify(conds)); n[gi][ci].op = e.target.value; setConds(n); }}>
                    {meta.operators.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <Input className="h-8 text-xs" value={Array.isArray(c.value) ? c.value.join('،') : (c.value ?? '')} placeholder="القيمة (القائمة مفصولة بفاصلة)" onChange={e => { const n = JSON.parse(JSON.stringify(conds)); const v = e.target.value; n[gi][ci].value = ['ضمن', 'ليس ضمن', 'بين'].includes(c.op) ? v.split(/[،,]/).map(s => s.trim()).filter(Boolean) : (meta.condition_fields[c.field]?.type === 'bool' ? v === 'true' || v === 'نعم' : v); setConds(n); }} />
                  <button className="text-red-500 px-1" onClick={() => { const n = JSON.parse(JSON.stringify(conds)); n[gi].splice(ci, 1); setConds(n.filter(x => x.length)); }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button className="text-[11px] text-sky-700" onClick={() => { const n = JSON.parse(JSON.stringify(conds)); n[gi].push({ field: 'grade', op: 'يساوي', value: '' }); setConds(n); }}>+ شرط «و»</button>
            </div>
          ))}
        </div>
        {p.notes && <p className="text-[11px] text-slate-500 mt-2">{p.notes}</p>}
        <DialogFooter className="gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" disabled={saving} className="bg-[#1B3A6B]" onClick={save}>{p.status === 'مسودة' ? 'حفظ' : 'إرسال للاعتماد'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
