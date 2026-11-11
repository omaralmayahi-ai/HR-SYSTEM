// B8b: حالات الاستحقاق (القسم 9) وربطها بأنواع الإجازات وحالات الموظف. كل تعديل يذهب لمدير ثانٍ.
import React, { useEffect, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const BEHAVIORS = ['يتبع', 'كامل', 'يتوقف', 'الثابتة فقط'];

export default function EntitlementStates({ onSubmitted }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => apiClient.payroll.states().then(setData).catch(e => toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }));
  useEffect(() => { load(); }, []);
  const sent = (r) => { toast({ title: r.applied ? 'طُبّق' : 'أُرسل لمدير ثانٍ للاعتماد', description: r.warnings?.join('؛ ') }); onSubmitted?.(); load(); };
  const map = async (table, id, state_id) => {
    try { sent(await apiClient.payroll.mapState({ table, id, state_id: state_id === '' ? null : Number(state_id) })); }
    catch (e) { toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }); }
  };
  if (!data) return <div className="bg-white rounded-2xl border border-slate-100 p-4 text-xs text-slate-400">جاري التحميل…</div>;
  const stateSelect = (table, row) => (
    <select disabled={!isAdmin} value={row.entitlement_state_id ?? ''} onChange={e => map(table, row.id, e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs">
      <option value="">{table === 'leave_types' ? 'حسب طريقة الصرف' : 'بلا حالة (دوام)'}</option>
      {data.states.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">حالات الاستحقاق</h3>
            <p className="text-[11px] text-slate-500">لكل يوم حالة: نسبة الاسمي، والمحجوز، وسلوك البنود، والتقاعد. إذا تداخلت حالتان تُطبّق الأعلى أسبقية. اليوم بلا حالة = دوام كامل. السقف يُحسب على الكامل قبل الحالة.</p>
          </div>
          {isAdmin && <Button size="sm" onClick={() => setEdit({ code: '', name: '', nominal_pct: 100, held_pct: 0, default_behavior: 'يتبع', item_behaviors: {}, retirement: 'على المستحق', precedence: 10, verification: 'يُتحقق', legal_basis: '', is_active: true })}>حالة جديدة</Button>}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500 border-b">{['الحالة', 'الاسمي', 'المحجوز', 'سلوك البنود', 'خاص ببنود', 'التقاعد', 'الأسبقية', 'التحقق', 'السند', ''].map(h => <th key={h} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody>{data.states.map(s => (
              <tr key={s.id} className={`border-b ${s.is_active ? '' : 'opacity-50'}`}>
                <td className="p-2 font-bold">{s.name} <span className="text-slate-400 font-mono">{s.code}</span></td>
                <td className="p-2">{Number(s.nominal_pct)}%</td><td className="p-2">{Number(s.held_pct) ? `${Number(s.held_pct)}%` : '—'}</td>
                <td className="p-2">{s.default_behavior}</td><td className="p-2">{Object.entries(s.item_behaviors || {}).map(([k, v]) => `${k}: ${v}`).join('، ') || '—'}</td>
                <td className="p-2">{s.retirement}</td><td className="p-2">{s.precedence}</td>
                <td className="p-2"><span className={`px-2 py-0.5 rounded-full ${s.verification === 'مؤكد' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{s.verification}</span></td>
                <td className="p-2 text-slate-500">{s.legal_basis || '—'}</td>
                <td className="p-2">{isAdmin && <Button size="sm" variant="outline" onClick={() => setEdit({ ...s, nominal_pct: Number(s.nominal_pct), held_pct: Number(s.held_pct) })}>تعديل</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
          <h3 className="font-bold text-sm">أنواع الإجازات ← الحالة (ق-17)</h3>
          {data.leave_types.length === 0 && <p className="text-xs text-slate-400">ما في أنواع إجازات.</p>}
          {data.leave_types.map(l => <div key={l.id} className="flex items-center justify-between text-xs gap-2"><span>{l.name} <span className="text-slate-400">({l.salary_payment_type || '—'})</span></span>{stateSelect('leave_types', l)}</div>)}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
          <h3 className="font-bold text-sm">حالات الموظف ← الحالة</h3>
          <p className="text-[11px] text-slate-500">مثل «مسحوب اليد» ← سحب اليد. الحالة لازم تكون مشمولة بالصرف حتى تأثر.</p>
          {data.statuses.map(s => <div key={s.id} className="flex items-center justify-between text-xs gap-2"><span>{s.name} {!s.payroll_eligible && <span className="text-slate-400">(غير مشمولة بالصرف)</span>}</span>{stateSelect('employee_statuses', s)}</div>)}
        </div>
      </div>
      {edit && <StateEditor value={edit} onClose={() => setEdit(null)} onSaved={r => { setEdit(null); sent(r); }} />}
    </div>
  );
}

const F = ({ label, children }) => <label className="text-xs space-y-1 block"><span className="text-slate-500">{label}</span>{children}</label>;

function StateEditor({ value, onClose, onSaved }) {
  const { toast } = useToast();
  const [v, setV] = useState({ ...value, item_behaviors_text: Object.entries(value.item_behaviors || {}).map(([k, b]) => `${k}=${b}`).join('\n') });
  const set = (k, x) => setV(o => ({ ...o, [k]: x }));
  const save = async () => {
    try {
      for (const [k, label] of [['nominal_pct', 'نسبة الاسمي'], ['held_pct', 'نسبة المحجوز'], ['precedence', 'الأسبقية']]) {
        if (String(v[k] ?? '').trim() === '' || !Number.isFinite(Number(v[k]))) throw new Error(`${label} مطلوبة`);
      }
      const item_behaviors = {};
      for (const line of v.item_behaviors_text.split('\n').map(x => x.trim()).filter(Boolean)) {
        const [k, b] = line.split('=').map(x => x.trim());
        if (!k || !BEHAVIORS.includes(b)) throw new Error(`سطر غير صالح: ${line} (الصيغة: رمز=سلوك)`);
        item_behaviors[k] = b;
      }
      const fields = { name: v.name, nominal_pct: Number(v.nominal_pct), held_pct: Number(v.held_pct), default_behavior: v.default_behavior, item_behaviors, retirement: v.retirement,
        precedence: Number(v.precedence), verification: v.verification, legal_basis: v.legal_basis, is_active: !!v.is_active };
      onSaved(v.id ? await apiClient.payroll.updateState(v.id, fields) : await apiClient.payroll.createState({ ...fields, code: v.code }));
    } catch (e) { toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }); }
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader><DialogTitle>{v.id ? `تعديل «${value.name}»` : 'حالة استحقاق جديدة'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {!v.id && <F label="الرمز (لاتيني)"><Input value={v.code} onChange={e => set('code', e.target.value)} /></F>}
          <F label="الاسم"><Input value={v.name} onChange={e => set('name', e.target.value)} /></F>
          <F label="نسبة الاسمي %"><Input type="number" value={v.nominal_pct} onChange={e => set('nominal_pct', e.target.value)} /></F>
          <F label="نسبة المحجوز %"><Input type="number" value={v.held_pct} onChange={e => set('held_pct', e.target.value)} /></F>
          <F label="سلوك البنود الافتراضي"><select className="h-9 w-full rounded-lg border border-slate-200 px-2" value={v.default_behavior} onChange={e => set('default_behavior', e.target.value)}>{BEHAVIORS.map(b => <option key={b}>{b}</option>)}</select></F>
          <F label="التوقيفات التقاعدية"><select className="h-9 w-full rounded-lg border border-slate-200 px-2" value={v.retirement} onChange={e => set('retirement', e.target.value)}><option>على المستحق</option><option>لا تُستوفى</option></select></F>
          <F label="الأسبقية"><Input type="number" value={v.precedence} onChange={e => set('precedence', e.target.value)} /></F>
          <F label="التحقق"><select className="h-9 w-full rounded-lg border border-slate-200 px-2" value={v.verification} onChange={e => set('verification', e.target.value)}><option>يُتحقق</option><option>مؤكد</option></select></F>
          <div className="col-span-2"><F label="السند القانوني"><Input value={v.legal_basis || ''} onChange={e => set('legal_basis', e.target.value)} /></F></div>
          <div className="col-span-2"><F label="سلوك خاص لبنود (سطر لكل بند: الرمز=السلوك، مثل OVERTIME=يتوقف)">
            <textarea className="w-full h-20 rounded-lg border border-slate-200 p-2 font-mono" value={v.item_behaviors_text} onChange={e => set('item_behaviors_text', e.target.value)} /></F></div>
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={!!v.is_active} onChange={e => set('is_active', e.target.checked)} /> فعّالة</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>إرسال للاعتماد</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
