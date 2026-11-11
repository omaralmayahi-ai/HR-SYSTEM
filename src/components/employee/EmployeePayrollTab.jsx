// B8a1: تبويب «الراتب والعائلة» بصفحة الموظف — الإسنادات والحجب وأفراد العائلة وحقائقهم ونمط الاستحقاق.
// كل إضافة تُرسل للاعتماد (ق-3، س15.3) وتظهر «معلّقة» لحد ما يعتمدها مدير آخر.
import React, { useEffect, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Users, Coins, Clock3, Calculator } from 'lucide-react';
import { LinesTable } from '@/components/payroll/PayrollLinesTable';

const FACTS = ['يدرس', 'متزوج', 'موظف', 'عاجز', 'حضانة بحكم', 'متوفى', 'يستلم الإعالة'];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date()); // بتوقيت بغداد

export default function EmployeePayrollTab({ employeeId }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [family, setFamily] = useState(null);
  const [form, setForm] = useState(null); // 'assign' | 'member' | 'fact' | 'mode' | 'ext'
  const [f, setF] = useState({});

  const load = async () => {
    try {
      const [it, as, fam] = await Promise.all([apiClient.payroll.items(), apiClient.payroll.assignments(employeeId), apiClient.payroll.family(employeeId)]);
      setItems(it); setAssignments(as); setFamily(fam);
    } catch (e) { toast({ title: 'تعذّر التحميل', description: e.message, variant: 'destructive' }); }
  };
  useEffect(() => { load(); }, [employeeId]);

  const open = (kind, init = {}) => { setForm(kind); setF({ valid_from: today(), effective_date: today(), ...init }); };
  const order = () => (f.order_number ? { order_number: f.order_number, order_date: f.order_date } : null);
  const send = async () => {
    try {
      let r;
      if (form === 'assign') r = await apiClient.payroll.assign({ employee_id: Number(employeeId), item_id: Number(f.item_id), kind: f.kind || 'منح', value_kind: f.value_kind, value: f.value, valid_from: f.valid_from, valid_to: f.valid_to || null, principal: f.principal, installments_count: f.installments_count, installment: f.installment, reason: f.reason, order: order() });
      if (form === 'end') r = await apiClient.payroll.endAssignment(f.assignment_id, { end_date: f.end_date, reason: f.reason, order: order() });
      if (form === 'member') r = await apiClient.payroll.addMember(employeeId, { relation: f.relation || 'ابن', name: f.name, birth_date: f.birth_date || null, order: order() });
      if (form === 'fact') r = await apiClient.payroll.addFact({ member_id: Number(f.member_id), fact: f.fact || 'يدرس', value: f.value !== 'false', valid_from: f.valid_from || null, reason: f.reason, order: order() });
      if (form === 'mode') r = await apiClient.payroll.setMode(employeeId, { mode: f.mode || 'كامل', effective_date: f.effective_date, reason: f.reason, order: order() });
      if (form === 'ext') r = await apiClient.payroll.addExtension({ member_id: Number(f.member_id), valid_from: f.valid_from, valid_to: f.valid_to, reason: f.reason, order: order() });
      toast({ title: 'أُرسلت للاعتماد', description: 'تُطبّق بعد اعتماد مدير آخر' });
      (r?.warnings || []).forEach(w => toast({ title: 'تنبيه', description: w }));
      setForm(null); load();
    } catch (e) { toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }); }
  };

  const item = items.find(i => String(i.id) === String(f.item_id));
  const field = (k, label, type = 'text', extra = {}) => (
    <label className="block text-[11px] font-bold text-slate-600">{label}
      <Input type={type} className="mt-1 h-8 text-xs" value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} {...extra} />
    </label>
  );
  const factsOf = (m) => (family?.facts || []).filter(x => x.member_id === m.id);

  return (
    <div className="space-y-4" dir="rtl">
      <SalaryPreview employeeId={employeeId} />
      <BankAccounts employeeId={employeeId} />
      {(family?.pending?.length > 0) && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-800 flex items-center gap-2"><Clock3 className="w-4 h-4" /> {family.pending.length} عملية عائلة بانتظار الاعتماد: {family.pending.map(p => p.summary).join(' · ')}</div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2"><Coins className="w-4 h-4" /> الإسنادات الفردية والحجب</h3>
          <Button size="sm" className="h-8 text-xs gap-1 bg-[#1B3A6B]" onClick={() => open('assign', { kind: 'منح' })}><Plus className="w-3.5 h-3.5" /> إسناد / حجب</Button>
        </div>
        <table className="w-full text-xs text-right">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-1.5">البند</th><th className="px-3 py-1.5">النوع</th><th className="px-3 py-1.5">القيمة</th><th className="px-3 py-1.5">من</th><th className="px-3 py-1.5">إلى</th><th className="px-3 py-1.5">الأمر</th><th className="px-3 py-1.5">السبب</th><th></th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {assignments.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">لا إسنادات</td></tr>}
            {assignments.map(a => (
              <tr key={a.id}>
                <td className="px-3 py-1.5 font-bold">{a.item_name}</td>
                <td className="px-3 py-1.5">{a.kind}{a.kind === 'حجب' && a.classification === 'عام' && <span className="text-red-600"> (بند عام)</span>}</td>
                <td className="px-3 py-1.5 font-mono">{a.principal ? `أصل ${Number(a.principal).toLocaleString()}` : a.value != null ? `${Number(a.value).toLocaleString()}${a.valueKind === 'نسبة' ? '%' : ''}` : 'قيمة القاعدة'}</td>
                <td className="px-3 py-1.5 font-mono">{a.validFrom}</td>
                <td className="px-3 py-1.5 font-mono">{a.validTo || '—'}</td>
                <td className="px-3 py-1.5">{a.order_number} {a.order_date ? `(${a.order_date})` : ''}</td>
                <td className="px-3 py-1.5 text-slate-500">{a.reason}</td>
                <td className="px-3 py-1.5"><button className="text-[11px] text-sky-700" onClick={() => open('end', { assignment_id: a.id, end_date: today() })}>إنهاء/إلغاء</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2"><Users className="w-4 h-4" /> العائلة (المادة 14)</h3>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => open('mode', { mode: family?.employee?.familyMode || 'كامل' })}>نمط الاستحقاق: {family?.employee?.familyMode || 'لم يُحدد'}</Button>
            <Button size="sm" className="h-8 text-xs gap-1 bg-[#1B3A6B]" onClick={() => open('member', { relation: 'ابن' })}><Plus className="w-3.5 h-3.5" /> فرد</Button>
          </div>
        </div>
        <div className="space-y-2">
          {(family?.members || []).length === 0 && <div className="text-xs text-slate-400 text-center py-3">لا أفراد مسجلين</div>}
          {(family?.members || []).map(m => (
            <div key={m.id} className="border border-slate-100 rounded-xl px-3 py-2 text-xs flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700">{m.name || '—'}</span>
              <span className="text-slate-500">{m.relation}</span>
              <span className="font-mono text-slate-500">{m.birthDate || 'تاريخ الميلاد غير مسجل'}</span>
              {factsOf(m).map(x => <span key={x.id} className="bg-slate-100 rounded px-1.5">{x.fact}: {x.value === true ? 'نعم' : 'لا'}{x.valid_from ? ` من ${x.valid_from}` : ''}</span>)}
              {(family?.extensions || []).filter(x => x.member_id === m.id).map(x => <span key={x.id} className="bg-sky-50 text-sky-700 rounded px-1.5">تمديد {x.valid_from} → {x.valid_to}</span>)}
              <span className="mr-auto flex gap-2">
                <button className="text-[11px] text-sky-700" onClick={() => open('fact', { member_id: m.id, fact: 'يدرس', value: 'true' })}>+ حقيقة</button>
                {['ابن', 'بنت', 'طفل'].includes(m.relation) && <button className="text-[11px] text-sky-700" onClick={() => open('ext', { member_id: m.id })}>+ تمديد</button>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {form && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
          <div className="text-sm font-bold text-slate-700">{{ assign: 'إسناد فردي أو حجب', end: 'إنهاء أو إلغاء إسناد', member: 'إضافة فرد عائلة', fact: 'حقيقة لفرد العائلة', mode: 'نمط الاستحقاق العائلي', ext: 'تمديد استحقاق طفل' }[form]}</div>
          <div className="grid grid-cols-4 gap-2">
            {form === 'assign' && <>
              <label className="block text-[11px] font-bold text-slate-600">البند
                <select className="mt-1 w-full border rounded-lg h-8 px-2 bg-white text-xs" value={f.item_id || ''} onChange={e => setF({ ...f, item_id: e.target.value })}>
                  <option value="">—</option>{items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
                </select></label>
              <label className="block text-[11px] font-bold text-slate-600">النوع
                <select className="mt-1 w-full border rounded-lg h-8 px-2 bg-white text-xs" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option>منح</option><option>تعديل</option><option>حجب</option></select></label>
              {f.kind !== 'حجب' && item?.method === 'installments' && <>{field('principal', 'أصل المبلغ', 'number')}{field('installments_count', 'عدد الأقساط', 'number')}</>}
              {f.kind !== 'حجب' && item?.method !== 'installments' && <>
                <label className="block text-[11px] font-bold text-slate-600">نوع القيمة
                  <select className="mt-1 w-full border rounded-lg h-8 px-2 bg-white text-xs" value={f.value_kind || ''} onChange={e => setF({ ...f, value_kind: e.target.value })}><option value="">—</option><option>نسبة</option><option>مبلغ</option></select></label>
                {field('value', 'القيمة', 'number')}
              </>}
              {field('valid_from', 'من', 'date')}{field('valid_to', 'إلى (للبند التلقائي إلزامي)', 'date')}
            </>}
            {form === 'end' && field('end_date', 'تاريخ الإنهاء (قبل البداية = إلغاء)', 'date')}
            {form === 'member' && <>
              <label className="block text-[11px] font-bold text-slate-600">الصلة
                <select className="mt-1 w-full border rounded-lg h-8 px-2 bg-white text-xs" value={f.relation} onChange={e => setF({ ...f, relation: e.target.value })}>{['ابن', 'بنت', 'زوجة', 'زوج', 'طفل'].map(x => <option key={x}>{x}</option>)}</select></label>
              {field('name', 'الاسم')}{field('birth_date', 'تاريخ الميلاد', 'date')}
            </>}
            {form === 'fact' && <>
              <label className="block text-[11px] font-bold text-slate-600">الحقيقة
                <select className="mt-1 w-full border rounded-lg h-8 px-2 bg-white text-xs" value={f.fact} onChange={e => setF({ ...f, fact: e.target.value })}>{FACTS.map(x => <option key={x}>{x}</option>)}</select></label>
              <label className="block text-[11px] font-bold text-slate-600">القيمة
                <select className="mt-1 w-full border rounded-lg h-8 px-2 bg-white text-xs" value={f.value} onChange={e => setF({ ...f, value: e.target.value })}><option value="true">نعم</option><option value="false">لا</option></select></label>
              {field('valid_from', 'من (فارغ = منذ البداية)', 'date')}
            </>}
            {form === 'mode' && <>
              <label className="block text-[11px] font-bold text-slate-600">النمط
                <select className="mt-1 w-full border rounded-lg h-8 px-2 bg-white text-xs" value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}>{['كامل', 'الأطفال فقط', 'محجوب', 'لا يستحق'].map(x => <option key={x}>{x}</option>)}</select></label>
              {field('effective_date', 'نافذ من', 'date')}
            </>}
            {form === 'ext' && <>{field('valid_from', 'من', 'date')}{field('valid_to', 'إلى', 'date')}</>}
            {field('order_number', 'رقم الأمر')}{field('order_date', 'تاريخ الأمر', 'date')}
            <div className="col-span-2">{field('reason', 'السبب')}</div>
          </div>
          <div className="flex gap-2 justify-end"><Button variant="outline" size="sm" onClick={() => setForm(null)}>إلغاء</Button><Button size="sm" className="bg-[#1B3A6B]" onClick={send}>إرسال للاعتماد</Button></div>
        </div>
      )}
    </div>
  );
}

// B8a3: سطور الشهر بتفسيرها (معاينة بالبنود الفعّالة) وتاريخ الرواتب المعتمدة
function SalaryPreview({ employeeId }) {
  const t = new Date();
  const [ym, setYm] = useState({ year: t.getFullYear(), month: t.getMonth() + 1 });
  const [p, setP] = useState(null);
  const [hist, setHist] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { apiClient.payroll.employeeHistory(employeeId).then(setHist).catch(() => {}); }, [employeeId]);
  const [bal, setBal] = useState(null);
  useEffect(() => { apiClient.payroll.employeeBalances(employeeId).then(setBal).catch(() => {}); }, [employeeId]);
  useEffect(() => { setError(''); apiClient.payroll.preview(employeeId, ym.year, ym.month).then(setP).catch(e => { setP(null); setError(e.message); }); }, [employeeId, ym.year, ym.month]);
  const n = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ar-IQ', { maximumFractionDigits: 3 }));
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2"><Calculator className="w-4 h-4" /> الراتب</h3>
        <div className="flex gap-1 items-center text-xs">
          <Input type="number" className="w-16 h-8" value={ym.month} onChange={e => setYm(v => ({ ...v, month: Number(e.target.value) }))} />
          <Input type="number" className="w-20 h-8" value={ym.year} onChange={e => setYm(v => ({ ...v, year: Number(e.target.value) }))} />
        </div>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {p && (
        <>
          <p className="text-[11px] text-slate-500">{p.note}</p>
          {!p.computed && <p className="text-xs text-amber-700">{(p.issues || []).map(i => i.message).join('، ')}</p>}
          {p.computed && (
            <>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {[['الاسمي', p.nominal], ['المخصصات', p.allowances], ['الاستقطاعات', p.deductions], ['الصافي', p.net]].map(([l, v]) => <div key={l} className="bg-slate-50 rounded-lg p-2"><div className="text-slate-500">{l}</div><div className="font-bold">{n(v)}</div></div>)}
              </div>
              <div className="overflow-auto"><LinesTable lines={p.lines} /></div>
              {p.issues?.length > 0 && <div className="text-xs bg-amber-50 rounded-lg p-2">{p.issues.map((i, k) => <div key={k}>⚠ {i.message}</div>)}</div>}
            </>
          )}
        </>
      )}
      {bal && (bal.installments.length > 0 || Number(bal.held) > 0 || Number(bal.debit) > 0) && (
        <div className="text-xs bg-slate-50 rounded-lg p-2 space-y-1">
          <div className="font-bold">الأرصدة (من الفترات المعتمدة)</div>
          {Number(bal.held) > 0 && <div>المحجوز: {n(bal.held)}</div>}
          {Number(bal.debit) > 0 && <div>رصيد مدين مرحّل: {n(bal.debit)}</div>}
          {bal.installments.map(x => <div key={x.assignment_id}>{x.name}: الأصل {n(x.principal)} · المسدد {n(x.paid)} · الباقي {n(x.remaining)}</div>)}
        </div>
      )}
      {hist.length > 0 && (
        <div>
          <div className="text-xs font-bold mb-1">الرواتب المعتمدة</div>
          <table className="w-full text-xs"><thead><tr className="text-slate-500 border-b">{['الفترة', 'الفئة', 'الحالة', 'الاسمي', 'المخصصات', 'الاستقطاعات', 'الصافي'].map(h => <th key={h} className="p-1.5 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody>{hist.map(h => <tr key={h.period_id} className="border-b"><td className="p-1.5"><a className="underline" href={`/payroll/payslip/${h.period_id}/${employeeId}`} target="_blank" rel="noreferrer">{h.year}/{h.month}</a></td><td className="p-1.5">{h.category}</td><td className="p-1.5">{h.status}</td><td className="p-1.5">{n(h.nominal)}</td><td className="p-1.5">{n(h.allowances)}</td><td className="p-1.5">{n(h.deductions)}</td><td className="p-1.5 font-bold">{n(h.net)}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}

// B8c: الحساب المصرفي المؤرخ — الإضافة أو التغيير بمُعتمِد ثانٍ (حالة 12)
function BankAccounts({ employeeId }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => apiClient.payroll.bankAccounts(employeeId).then(setList).catch(() => {});
  useEffect(() => { load(); }, [employeeId]);
  const live = list.filter(a => !a.superseded_at);
  const save = async () => {
    try { const r = await apiClient.payroll.addBankAccount(employeeId, form); setMsg(r.applied ? 'طُبّق' : 'أُرسل لمدير ثانٍ للاعتماد'); setForm(null); load(); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">الحساب المصرفي</h3>
        {!form && <Button size="sm" variant="outline" onClick={() => setForm({ bank_name: '', account_number: '', valid_from: new Date().toISOString().slice(0, 10) })}>إضافة أو تغيير</Button>}
      </div>
      {live.length === 0 && <p className="text-slate-400">ما في حساب مصرفي نافذ؛ الموظف يظهر بورقة «بلا حساب» بكشف المصرف.</p>}
      {live.map(a => <div key={a.id}>{a.bank_name} — <span className="font-mono">{a.account_number}</span> من {a.valid_from} <span className="text-slate-400">(أدخله {a.entered_by}، اعتمده {a.approved_by})</span></div>)}
      {form && (
        <div className="flex flex-wrap gap-2 items-end">
          <Input className="w-40 h-8" placeholder="المصرف" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} />
          <Input className="w-48 h-8 font-mono" placeholder="رقم الحساب أو البطاقة" value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} />
          <Input type="date" className="w-40 h-8" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
          <Button size="sm" onClick={save}>إرسال للاعتماد</Button><Button size="sm" variant="outline" onClick={() => setForm(null)}>إلغاء</Button>
        </div>
      )}
      {msg && <p className="text-slate-600">{msg}</p>}
    </div>
  );
}
