// B8a3: جدول سطور الراتب بتفسيرها (صفحة الرواتب وتبويب الموظف).
import React from 'react';

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('ar-IQ', { maximumFractionDigits: 3 }));

export function LinesTable({ lines }) {
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-slate-500 border-b">{['البند', 'المقطع', 'النصيب', 'المبلغ', 'التفسير'].map(h => <th key={h} className="p-1.5 text-right font-medium">{h}</th>)}</tr></thead>
      <tbody>
        {lines.map((l, i) => {
          const e = l.explain || {};
          const why = [e.level && `المستوى: ${e.level}`, e.full && `الكامل ${fmt(e.full)}`, e.withheld && 'محجوب', e.assignment && `إسناد ${e.assignment.kind}`, e.family && 'عائلية', e.cap && `سقف ${fmt(e.cap)}`,
            e.rounding && `تقريب ${fmt(e.rounding)}`, e.legal_basis && `السند: ${e.legal_basis}`, e.grade && `الدرجة ${e.grade}/${e.step}`].filter(Boolean).join(' · ');
          return (
            <tr key={i} className={`border-b ${l.direction === '-' ? 'text-rose-700' : l.kind === 'cap' ? 'text-amber-700' : ''}`}>
              <td className="p-1.5">{l.item_name ?? l.itemName}</td><td className="p-1.5">{l.segment_from ?? l.segmentFrom} ← {l.segment_to ?? l.segmentTo}</td><td className="p-1.5">{l.share}</td>
              <td className="p-1.5 font-bold">{l.direction === '-' ? '−' : ''}{fmt(l.amount)}</td><td className="p-1.5 text-slate-500">{why}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

