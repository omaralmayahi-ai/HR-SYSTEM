// B8b: قسيمة الموظف للطباعة/PDF — من اللقطة المجمّدة للاحتساب (لا من البيانات الحية).
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('ar-IQ', { maximumFractionDigits: 0 }));

export default function Payslip() {
  const { periodId, employeeId } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([apiClient.payroll.period(periodId), apiClient.payroll.periodEmployee(periodId, employeeId), apiClient.payroll.employeeBalances(employeeId, periodId)])
      .then(([p, e, b]) => setD({ period: p.period, ...e, balances: b })).catch(x => setError(x.message));
  }, [periodId, employeeId]);
  if (error) return <div className="p-8 text-rose-600" dir="rtl">{error}</div>;
  if (!d) return <div className="p-8 text-slate-400" dir="rtl">جاري التحميل…</div>;
  const s = d.result.snapshot || {};
  // تجميع السطور لكل بند (المقاطع تظهر بالتفصيل بشاشة الموظف)
  const group = new Map();
  for (const l of d.lines) {
    if (l.kind === 'held') continue;
    const k = `${l.kind === 'cap' ? 'cap:' : ''}${l.item_code}`;
    const g = group.get(k) || { name: l.item_name, direction: l.kind === 'cap' ? '+' : l.direction, amount: 0, note: [] };
    g.amount += Number(l.amount);
    if (l.explain?.deferred) g.note.push(`مؤجل ${fmt(l.explain.deferred)}`);
    if (l.explain?.state) g.note.push(l.explain.state);
    if (l.explain?.remaining_after) g.note.push(`الباقي ${fmt(l.explain.remaining_after)}`);
    group.set(k, g);
  }
  const plus = [...group.values()].filter(g => g.direction === '+'), minus = [...group.values()].filter(g => g.direction === '-');
  const held = d.lines.filter(l => l.kind === 'held').reduce((a, l) => a + Number(l.amount), 0);
  const final = d.period.status === 'مُصدَرة';
  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-sm print:p-0" dir="rtl">
      <style>{'@media print { .no-print { display: none !important } aside, header, nav { display: none !important } }'}</style>
      <div className="no-print flex justify-end mb-4"><Button onClick={() => window.print()}>طباعة / PDF</Button></div>
      <div className="text-center border-b pb-3 mb-3">
        <div className="font-bold text-lg">قسيمة راتب — {d.period.year}/{String(d.period.month).padStart(2, '0')}</div>
        <div className="text-xs text-slate-500">{d.period.category_name} · الاحتساب {d.run_id} · {final ? `مُصدَرة بكتاب ${d.period.dispatch_letter}` : `${d.period.status} (غير نهائية)`}</div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs mb-4">
        <div>الاسم: <b>{s.full_name}</b></div><div>رقم الشركة: <b>{s.company_number}</b></div>
        <div>القسم: {s.department || '—'}</div><div>الشعبة: {s.section || '—'}</div>
        <div>العنوان الوظيفي: {s.job_title || '—'}</div><div>الدرجة/المرحلة: {s.grade}/{s.step}</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <table className="w-full text-xs border"><thead><tr className="bg-slate-50"><th className="p-1.5 text-right">الاستحقاقات</th><th className="p-1.5 text-right">المبلغ</th></tr></thead>
          <tbody>{plus.map((g, i) => <tr key={i} className="border-t"><td className="p-1.5">{g.name}{g.note.length ? <div className="text-[10px] text-slate-500">{g.note.join('، ')}</div> : null}</td><td className="p-1.5">{fmt(g.amount)}</td></tr>)}</tbody></table>
        <table className="w-full text-xs border"><thead><tr className="bg-slate-50"><th className="p-1.5 text-right">الاستقطاعات</th><th className="p-1.5 text-right">المبلغ</th></tr></thead>
          <tbody>{minus.map((g, i) => <tr key={i} className="border-t"><td className="p-1.5">{g.name}{g.note.length ? <div className="text-[10px] text-slate-500">{g.note.join('، ')}</div> : null}</td><td className="p-1.5">{fmt(g.amount)}</td></tr>)}</tbody></table>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mt-4">
        <div className="border rounded p-2"><div className="text-[11px] text-slate-500">مجموع الاستحقاقات</div><b>{fmt(Number(d.result.nominal) + Number(d.result.allowances))}</b></div>
        <div className="border rounded p-2"><div className="text-[11px] text-slate-500">مجموع الاستقطاعات</div><b>{fmt(d.result.deductions)}</b></div>
        <div className="border rounded p-2 bg-slate-50"><div className="text-[11px] text-slate-500">الصافي</div><b className="text-base">{fmt(d.result.net)}</b></div>
      </div>
      {(held > 0 || Number(d.balances.held) > 0 || Number(d.balances.debit) > 0 || d.balances.installments.length > 0) && (
        <div className="mt-4 text-xs border rounded p-2 space-y-1">
          <div className="font-bold">الأرصدة</div>
          {held > 0 && <div>محجوز هذا الشهر: {fmt(held)}</div>}
          {Number(d.balances.held) > 0 && <div>رصيد المحجوز بعد هذه الفترة: {fmt(d.balances.held)}</div>}
          {Number(d.balances.debit) > 0 && <div>رصيد مدين مرحّل: {fmt(d.balances.debit)}</div>}
          {d.balances.installments.map(x => <div key={x.assignment_id}>{x.name}: الأصل {fmt(x.principal)} · المسدد {fmt(x.paid)} · الباقي {fmt(x.remaining)}</div>)}
        </div>
      )}
      {Number(d.result.negative) > 0 && <div className="mt-2 text-xs text-rose-700">الصافي سالب بمقدار {fmt(d.result.negative)}؛ صُرف صفراً ويُرحَّل رصيداً مديناً.</div>}
    </div>
  );
}
