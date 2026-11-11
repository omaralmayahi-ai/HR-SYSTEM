// B8a3: صفحة الرواتب — الفترات (فتح ← احتساب ← اعتماد ← إصدار)، النتائج وتفسير السطور، تقرير المراجعة، والكشوف.
import React, { useEffect, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LinesTable } from '@/components/payroll/PayrollLinesTable';
import { Wallet, Calculator, CheckCircle2, Send, Undo2, FileSpreadsheet, AlertTriangle, Search, ListChecks, History, Loader2 } from 'lucide-react';

const statusStyle = {
  'مفتوحة': 'bg-sky-100 text-sky-800', 'محتسبة': 'bg-amber-100 text-amber-800',
  'معتمدة': 'bg-emerald-100 text-emerald-800', 'مُصدَرة': 'bg-slate-200 text-slate-700',
};
const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('ar-IQ', { maximumFractionDigits: 3 }));
const ym = (p) => `${p.year}/${String(p.month).padStart(2, '0')}`;
const ISSUE_LABELS = {
  NO_GRADE: 'بلا درجة', NO_SCALE: 'بلا خانة بالسلّم', NO_LEVEL: 'بلا مستوى', EVAL_FAILED: 'تعذّر تقييم شرط',
  FAMILY_MODE_MISSING: 'نمط العائلية غير محدد', DAUGHTER_FACTS_MISSING: 'حقائق البنت ناقصة', OVERRIDE_IGNORED: 'إسناد فردي لا يسري',
  NO_CAP_PRIORITY: 'بلا أولوية تخفيض', NOT_IN_PERIOD: 'غير مشمول بالفترة',
};

export default function Payroll() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [meta, setMeta] = useState(null);
  const [category, setCategory] = useState('PERM');
  const [periods, setPeriods] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('results');
  const [busy, setBusy] = useState('');
  const [openForm, setOpenForm] = useState({ year: '', month: '' });

  const err = (e, t = 'تعذّر') => toast({ title: t, description: e.message, variant: 'destructive' });
  const loadPeriods = async () => {
    try {
      const r = await apiClient.payroll.periods(category);
      setPeriods(r.periods);
      if (!selected && r.periods[0]) setSelected(r.periods[0].id);
      const last = r.periods.find(p => p.kind === 'عادية');
      const t = new Date();
      const next = last ? (last.month === 12 ? { year: last.year + 1, month: 1 } : { year: last.year, month: last.month + 1 }) : { year: t.getFullYear(), month: t.getMonth() + 1 };
      setOpenForm(next);
    } catch (e) { err(e, 'تعذّر تحميل الفترات'); }
  };
  const loadDetail = async (id = selected, check = true) => {
    if (!id) { setDetail(null); return; }
    try { setDetail(await apiClient.payroll.period(id, check)); } catch (e) { err(e, 'تعذّر تحميل الفترة'); }
  };
  useEffect(() => { apiClient.payroll.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { setSelected(null); setDetail(null); loadPeriods(); }, [category]);
  useEffect(() => { loadDetail(); }, [selected]);

  const act = async (name, fn, okMsg) => {
    setBusy(name);
    try { const r = await fn(); if (okMsg) toast({ title: typeof okMsg === 'function' ? okMsg(r) : okMsg }); await loadPeriods(); await loadDetail(selected, false); return r; }
    catch (e) { err(e); } finally { setBusy(''); }
  };
  const period = detail?.period;
  const currentRun = detail?.runs?.find(r => r.id === period?.current_run_id);
  const activeCategories = (meta?.categories || []).filter(c => c.isActive);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[#1B3A6B] flex items-center gap-2"><Wallet className="w-5 h-5" /> الرواتب</h1>
            <p className="text-xs text-slate-500 mt-1">فترة واحدة غير مُصدَرة لكل فئة. كل احتساب يُحفظ ثابتاً؛ الاعتماد يرفض إذا تغيّرت المدخلات بعد الاحتساب، ويعتمده مدير غير اللي احتسب.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={category} onChange={e => setCategory(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
              {(activeCategories.length ? activeCategories : [{ code: 'PERM', name: 'الدائميون' }]).map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <Input type="number" className="w-20 h-9" value={openForm.month} onChange={e => setOpenForm(f => ({ ...f, month: e.target.value }))} placeholder="الشهر" />
            <Input type="number" className="w-24 h-9" value={openForm.year} onChange={e => setOpenForm(f => ({ ...f, year: e.target.value }))} placeholder="السنة" />
            <Button size="sm" disabled={!!busy} onClick={() => act('open', () => apiClient.payroll.openPeriod({ category, year: Number(openForm.year), month: Number(openForm.month) }), 'فُتحت الفترة').then(p => p && setSelected(p.id))}>فتح فترة</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2 lg:col-span-1 max-h-[70vh] overflow-auto">
          {periods.length === 0 && <p className="text-xs text-slate-400 p-3">ما في فترات بعد لهذه الفئة.</p>}
          {periods.map(p => (
            <button key={p.id} onClick={() => setSelected(p.id)} className={`w-full text-right rounded-xl border p-3 ${selected === p.id ? 'border-[#1B3A6B] bg-slate-50' : 'border-slate-100'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{ym(p)}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusStyle[p.status] || ''}`}>{p.status}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">{p.pay_source}{p.totals ? ` · ${p.totals.computed} موظفاً · صافٍ ${fmt(p.totals.net)}` : ''}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          {!period && <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-400">اختر فترة أو افتح فترة جديدة.</div>}
          {period && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{period.category_name} — {ym(period)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle[period.status]}`}>{period.status}</span>
                    <span className="text-xs text-slate-500">({period.pay_source})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['مفتوحة', 'محتسبة'].includes(period.status) && (
                      <Button size="sm" disabled={!!busy} onClick={() => act('compute', () => apiClient.payroll.computePeriod(period.id), r => `احتُسبت: ${r.totals.computed} موظفاً، ${r.totals.lines} سطراً`)}>
                        {busy === 'compute' ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Calculator className="w-4 h-4 ml-1" />}{period.status === 'محتسبة' ? 'إعادة الاحتساب' : 'احتساب'}
                      </Button>
                    )}
                    {isAdmin && period.status === 'محتسبة' && (
                      <Button size="sm" variant="outline" disabled={!!busy || currentRun?.computedBy === user?.username} title={currentRun?.computedBy === user?.username ? 'ما تكدر تعتمد فترة احتسبتها أنت' : ''}
                        onClick={() => window.confirm('اعتماد الفترة؟ تُجمّد اللقطة وتُشتق المتغيرات.') && act('approve', () => apiClient.payroll.approvePeriod(period.id), r => `اعتُمدت الفترة${r.first_period ? ' (أول فترة: بلا متغيرات)' : `، ${r.variances} متغيراً`}`)}>
                        {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <CheckCircle2 className="w-4 h-4 ml-1" />}اعتماد
                      </Button>
                    )}
                    {isAdmin && period.status === 'معتمدة' && (
                      <>
                        <Button size="sm" disabled={!!busy} onClick={() => { const l = window.prompt('رقم كتاب الإرسال'); if (l) act('issue', () => apiClient.payroll.issuePeriod(period.id, l), 'أُصدرت الفترة'); }}><Send className="w-4 h-4 ml-1" />إصدار</Button>
                        <Button size="sm" variant="outline" disabled={!!busy || detail.pending_unapprove?.length > 0} onClick={() => { const r = window.prompt('سبب إلغاء الاعتماد (يعتمده مدير ثانٍ)'); if (r) act('unapprove', () => apiClient.payroll.unapprovePeriod(period.id, r), 'أُرسل طلب إلغاء الاعتماد لمدير ثانٍ'); }}><Undo2 className="w-4 h-4 ml-1" />طلب إلغاء الاعتماد</Button>
                      </>
                    )}
                  </div>
                </div>
                {detail.fingerprint?.changed && (
                  <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-800 rounded-lg p-2"><AlertTriangle className="w-4 h-4" /> تغيّرت مدخلات الفترة بعد الاحتساب؛ الاعتماد مرفوض حتى تعيد الاحتساب.</div>
                )}
                {detail.pending_unapprove?.length > 0 && (
                  <div className="text-xs bg-sky-50 text-sky-800 rounded-lg p-2">طلب إلغاء اعتماد بانتظار مدير ثانٍ (صفحة بنود الرواتب ← بانتظار الاعتماد): {detail.pending_unapprove[0].summary}</div>
                )}
                {currentRun?.totals && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
                    {[['الموظفون المحتسبون', currentRun.totals.computed, true], ['الاسمي', currentRun.totals.nominal], ['المخصصات', currentRun.totals.allowances], ['الاستقطاعات', currentRun.totals.deductions], ['الصافي', currentRun.totals.net]].map(([l, v, plain]) => (
                      <div key={l} className="bg-slate-50 rounded-xl p-2"><div className="text-[11px] text-slate-500">{l}</div><div className="font-bold text-sm">{plain ? v : fmt(v)}</div></div>
                    ))}
                  </div>
                )}
                {currentRun && <div className="text-[11px] text-slate-500">الاحتساب {currentRun.id} بواسطة {currentRun.computedBy} · {String(currentRun.finishedAt || '').slice(0, 16).replace('T', ' ')}{period.approved_by ? ` · اعتمده ${period.approved_by}` : ''}{period.dispatch_letter ? ` · كتاب ${period.dispatch_letter}` : ''}</div>}
                <div className="flex gap-2 pt-1">
                  {[['results', 'النتائج', Search], ['review', 'تقرير المراجعة', ListChecks], ['statements', 'الكشوف', FileSpreadsheet], ['runs', `الاحتسابات (${detail.runs.length})`, History]].map(([k, l, I]) => (
                    <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${tab === k ? 'bg-[#1B3A6B] text-white' : 'bg-slate-100 text-slate-600'}`}><I className="w-3.5 h-3.5" />{l}</button>
                  ))}
                </div>
              </div>
              {tab === 'results' && <ResultsTab period={period} key={`r${period.id}-${period.current_run_id}`} />}
              {tab === 'review' && <ReviewTab period={period} key={`v${period.id}-${period.current_run_id}`} />}
              {tab === 'statements' && <StatementsTab period={period} />}
              {tab === 'runs' && <RunsTab runs={detail.runs} currentId={period.current_run_id} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsTab({ period }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [emp, setEmp] = useState(null);
  const limit = 100;
  const load = () => {
    if (!period.current_run_id) { setData({ total: 0, results: [] }); return; }
    apiClient.payroll.periodResults(period.id, { q, filter, offset, limit }).then(setData).catch(e => toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }));
  };
  useEffect(() => { load(); }, [q, filter, offset]);
  if (!period.current_run_id) return <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-400 text-center">الفترة ما احتُسبت بعد.</div>;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input className="w-64 h-9" placeholder="بحث بالاسم أو رقم الشركة" value={q} onChange={e => { setOffset(0); setQ(e.target.value); }} />
        <select value={filter} onChange={e => { setOffset(0); setFilter(e.target.value); }} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
          <option value="">الكل</option><option value="issues">فيه تنبيهات</option><option value="not_computed">غير محتسب</option><option value="cap">بلغ السقف</option>
        </select>
        <span className="text-xs text-slate-500 self-center">{data?.total ?? 0} سجلاً</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-slate-500 border-b">{['رقم الشركة', 'الاسم', 'القسم', 'الدرجة', 'الاسمي', 'المخصصات', 'الاستقطاعات', 'الصافي', 'تنبيهات'].map(h => <th key={h} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {(data?.results || []).map(r => (
              <tr key={r.employee_id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setEmp(r.employee_id)}>
                <td className="p-2">{r.snapshot?.company_number}</td><td className="p-2">{r.snapshot?.full_name}</td><td className="p-2">{r.snapshot?.department || '—'}</td>
                <td className="p-2">{r.snapshot?.grade}/{r.snapshot?.step}</td><td className="p-2">{fmt(r.nominal)}</td><td className="p-2">{fmt(r.allowances)}</td><td className="p-2">{fmt(r.deductions)}</td>
                <td className="p-2 font-bold">{r.computed ? fmt(r.net) : <span className="text-rose-600">غير محتسب</span>}</td>
                <td className="p-2 text-amber-700">{(r.issues || []).map(i => ISSUE_LABELS[i.code] || i.code).filter((v, i, a) => a.indexOf(v) === i).join('، ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>السابق</Button>
        <Button size="sm" variant="outline" disabled={!data || offset + limit >= data.total} onClick={() => setOffset(offset + limit)}>التالي</Button>
      </div>
      {emp && <EmployeeLinesDialog periodId={period.id} employeeId={emp} onClose={() => setEmp(null)} />}
    </div>
  );
}

function EmployeeLinesDialog({ periodId, employeeId, onClose }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { apiClient.payroll.periodEmployee(periodId, employeeId).then(setD).catch(e => setError(e.message)); }, [periodId, employeeId]);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-4xl" dir="rtl">
        <DialogHeader><DialogTitle>{d ? `${d.result.snapshot?.full_name} — ${d.result.snapshot?.company_number}` : 'سطور الموظف'}</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {d && (
          <div className="space-y-3 max-h-[70vh] overflow-auto">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {[['الاسمي', d.result.nominal], ['المخصصات', d.result.allowances], ['الاستقطاعات', d.result.deductions], ['الصافي', d.result.net]].map(([l, v]) => <div key={l} className="bg-slate-50 rounded-lg p-2"><div className="text-slate-500">{l}</div><div className="font-bold">{fmt(v)}</div></div>)}
            </div>
            <LinesTable lines={d.lines} />
            {d.result.issues?.length > 0 && <div className="text-xs bg-amber-50 rounded-lg p-2 space-y-1">{d.result.issues.map((i, k) => <div key={k}>⚠ {i.message}</div>)}</div>}
            {d.variances?.length > 0 && (
              <div className="text-xs"><div className="font-bold mb-1">المتغيرات عن الشهر السابق</div>
                {d.variances.map((v, k) => <div key={k}>{v.item_name}: {fmt(v.before)} ← {fmt(v.after)} — {v.cause}</div>)}</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewTab({ period }) {
  const { toast } = useToast();
  const [r, setR] = useState(null);
  const [threshold, setThreshold] = useState(10);
  useEffect(() => {
    if (!period.current_run_id) return;
    apiClient.payroll.review(period.id, threshold).then(setR).catch(e => toast({ title: 'تعذّر', description: e.message, variant: 'destructive' }));
  }, [threshold]);
  if (!period.current_run_id) return <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-400 text-center">الفترة ما احتُسبت بعد.</div>;
  if (!r) return <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-400 text-center">جاري التحميل...</div>;
  const S = r.sections;
  const who = (x) => `${x.company_number ?? ''} ${x.name ?? ''}`;
  const blocks = [
    ['تغيّر الصافي أكثر من النسبة', S.net_changes, x => `${who(x)}: ${fmt(x.before)} ← ${fmt(x.after)} (${x.change_pct}%)`],
    ['صافٍ سالب (صُرف صفراً)', S.negative_net, x => `${who(x)}: −${fmt(x.negative)}`],
    ['بلغوا سقف 200%', S.cap_reached, who],
    ['بنود تغيّر عدد مستحقيها', S.item_beneficiary_changes, x => `${x.item_name}: ${x.before} ← ${x.after} (${x.change_pct}%)`],
    ['درجات 11–13 (سلّمها يُتحقق منه)', S.unverified_grades, x => `${who(x)} — الدرجة ${x.grade}`],
    ['حجب بنود عامة', S.general_withheld, x => `${who(x)}: ${x.items.join('، ')}`],
    ['موظفون جدد عن الشهر السابق', S.new_employees, x => `${who(x)}: ${fmt(x.net)}`],
    ['تغييرات المستخدمين والأدوار منذ الفترة السابقة', S.user_role_changes, x => `${String(x.at).slice(0, 16).replace('T', ' ')} ${x.action}: ${x.before_user ?? ''}${x.before_role ? `(${x.before_role})` : ''} ← ${x.after_user ?? ''}${x.after_role ? `(${x.after_role})` : ''} بواسطة ${x.actor ?? '—'}`],
    ['بنود فعّالة بقيم «يُتحقق» (تمنع الاعتماد)', S.unverified_items, x => `${x.code} ${x.name}`],
  ];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs"><span>نسبة التنبيه:</span><Input type="number" className="w-20 h-8" value={threshold} onChange={e => setThreshold(Number(e.target.value) || 10)} /><span>%</span>
        <span className="text-slate-500">{r.previous_period ? `مقارنة بالفترة ${r.previous_period}` : 'أول فترة: بلا مقارنة'}</span>{S.leavers?.length > 0 && <span className="text-slate-500">· {S.leavers.length} غادروا</span>}</div>
      {r.blocking?.length > 0 && <div className="text-xs bg-rose-50 text-rose-700 rounded-lg p-2">يمنع الاعتماد: {r.blocking.join('، ')}</div>}
      {blocks.map(([title, list, render]) => (
        <details key={title} className="border rounded-xl p-2" open={list?.length > 0 && list.length <= 20}>
          <summary className="text-sm font-bold cursor-pointer">{title} <span className="text-xs text-slate-500">({list?.length || 0})</span></summary>
          <div className="text-xs mt-2 space-y-0.5 max-h-60 overflow-auto">{(list || []).slice(0, 500).map((x, i) => <div key={i}>{render(x)}</div>)}</div>
        </details>
      ))}
      {Object.entries(S.issues || {}).map(([code, list]) => (
        <details key={code} className="border rounded-xl p-2">
          <summary className="text-sm font-bold cursor-pointer">تنبيه: {ISSUE_LABELS[code] || code} <span className="text-xs text-slate-500">({list.length})</span></summary>
          <div className="text-xs mt-2 space-y-0.5 max-h-60 overflow-auto">{list.slice(0, 500).map((x, i) => <div key={i}>{who(x)}: {x.message}</div>)}</div>
        </details>
      ))}
    </div>
  );
}

function StatementsTab({ period }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [item, setItem] = useState('');
  useEffect(() => { apiClient.payroll.items().then(list => { setItems(list); setItem(list[0]?.code || ''); }).catch(() => {}); }, []);
  const dl = async (kind, code) => { try { await apiClient.payroll.downloadStatement(period.id, kind, code); } catch (e) { toast({ title: 'تعذّر التصدير', description: e.message, variant: 'destructive' }); } };
  if (!period.current_run_id) return <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-400 text-center">الفترة ما احتُسبت بعد.</div>;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
      <p className="text-xs text-slate-500">الكشوف تُبنى من اللقطة المجمّدة للاحتساب الحالي، فالكشف المُصدَر يطلع مطابقاً لأصله دائماً. كل تصدير يُسجَّل بسجل النشاط.{period.status !== 'مُصدَرة' ? ' الفترة غير مُصدَرة: الكشف غير نهائي.' : ''}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => dl('full')}><FileSpreadsheet className="w-4 h-4 ml-1" />الكشف الكامل</Button>
        <Button size="sm" variant="outline" onClick={() => dl('variances')}><FileSpreadsheet className="w-4 h-4 ml-1" />كشف المتغيرات</Button>
        <Button size="sm" variant="outline" onClick={() => dl('exceptions')}><FileSpreadsheet className="w-4 h-4 ml-1" />تقرير الاستثناءات</Button>
      </div>
      <div className="flex gap-2 items-center">
        <select value={item} onChange={e => setItem(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">{items.map(i => <option key={i.id} value={i.code}>{i.code} — {i.name}</option>)}</select>
        <Button size="sm" variant="outline" disabled={!item} onClick={() => dl('item', item)}><FileSpreadsheet className="w-4 h-4 ml-1" />كشف البند</Button>
      </div>
    </div>
  );
}

function RunsTab({ runs, currentId }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <table className="w-full text-xs">
        <thead><tr className="text-slate-500 border-b">{['الاحتساب', 'الحالة', 'بواسطة', 'الوقت', 'المحتسبون', 'الصافي', 'البصمة', 'ملاحظة'].map(h => <th key={h} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
        <tbody>{runs.map(r => (
          <tr key={r.id} className={`border-b ${r.id === currentId ? 'bg-emerald-50' : ''}`}>
            <td className="p-2">{r.id}{r.id === currentId ? ' (الحالي)' : ''}</td><td className="p-2">{r.state}</td><td className="p-2">{r.computedBy}</td>
            <td className="p-2">{String(r.finishedAt || r.startedAt || '').slice(0, 16).replace('T', ' ')}</td><td className="p-2">{r.totals?.computed ?? '—'}</td><td className="p-2">{fmt(r.totals?.net)}</td>
            <td className="p-2 font-mono">{String(r.fingerprint || '').slice(0, 10)}</td><td className="p-2">{r.cancelReason || ''}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
