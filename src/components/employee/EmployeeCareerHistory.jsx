// B4c: تبويب «السجل الوظيفي» بصفحة الموظف — الخط الزمني لكل حقل متتبع + تسجيل حركة بأمر إداري.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Plus, FileText, Loader2 } from 'lucide-react';
import apiClient from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const SOURCE_STYLE = {
  'تقديري': 'bg-amber-50 text-amber-700 border-amber-200',
  'أمر': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'تعديل مباشر': 'bg-slate-50 text-slate-600 border-slate-200',
  'ترحيل قديم': 'bg-blue-50 text-blue-700 border-blue-200',
};

const fmtValue = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const fmtDate = (d) => (d ? String(d).slice(0, 10) : 'قبل بدء السجل');

export default function EmployeeCareerHistory({ employeeId, onChanged }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const canWrite = user && user.role !== 'employee';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await apiClient.careerHistory.get(employeeId));
    } catch (err) {
      setError(err.message || 'تعذّر تحميل السجل الوظيفي');
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const labels = data?.labels || {};
  const grouped = useMemo(() => {
    if (!data) return [];
    const byField = new Map();
    for (const r of data.baseline || []) byField.set(r.field, [{ ...r }]);
    for (const r of data.fields || []) {
      if (!byField.has(r.field) || byField.get(r.field)[0]?.virtual) byField.set(r.field, []);
      byField.get(r.field).push(r);
    }
    return Object.keys(labels).filter(f => byField.has(f)).map(f => ({ field: f, rows: byField.get(f) }));
  }, [data, labels]);

  if (error) return <div className="p-4 text-sm text-red-600 bg-red-50 rounded-xl">{error}</div>;
  if (!data) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  const today = data.today;
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2"><History className="w-4 h-4" /> السجل الوظيفي المؤرخ</h3>
          <p className="text-[11px] text-slate-500 mt-1">كل تغيير على الدرجة والمرحلة والعنوان والتشكيل والحالة يُحفظ بتاريخ نفاذه وأمره. «تقديري» = القيمة قبل بدء السجل.</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setOpen(true)} className="bg-[#1B3A6B] hover:bg-[#15305a] text-xs gap-1">
            <Plus className="w-3.5 h-3.5" /> تسجيل حركة
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {grouped.map(({ field, rows }) => (
          <div key={field} className="border border-slate-100 rounded-xl bg-white overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 text-xs font-bold text-slate-700">{labels[field] || field}</div>
            <table className="w-full text-[11px]">
              <thead className="text-slate-400">
                <tr><th className="text-right px-3 py-1 font-normal">القيمة</th><th className="text-right px-2 py-1 font-normal">من</th><th className="text-right px-2 py-1 font-normal">إلى</th><th className="text-right px-2 py-1 font-normal">المصدر</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const future = r.valid_from && String(r.valid_from).slice(0, 10) > today;
                  return (
                    <tr key={r.id || `v${i}`} className={`border-t border-slate-50 ${future ? 'text-slate-400' : ''}`}>
                      <td className="px-3 py-1.5 font-bold text-slate-700">{fmtValue(r.value)}{future && <span className="mr-1 text-[10px] text-blue-500">(مؤجل)</span>}</td>
                      <td className="px-2 py-1.5">{fmtDate(r.valid_from)}</td>
                      <td className="px-2 py-1.5">{r.valid_to ? String(r.valid_to).slice(0, 10) : 'الآن'}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block border rounded px-1.5 ${SOURCE_STYLE[r.source] || ''}`}>{r.source}</span>
                        {r.order_number && <span className="block text-[10px] text-slate-500 mt-0.5"><FileText className="inline w-3 h-3" /> أمر {r.order_number} في {String(r.order_date || '').slice(0, 10)}</span>}
                        {r.reason && r.source !== 'تقديري' && <span className="block text-[10px] text-slate-400">{r.reason}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {(data.events || []).length > 0 && (
        <div className="border border-slate-100 rounded-xl bg-white p-3">
          <div className="text-xs font-bold text-slate-700 mb-2">أحداث</div>
          <ul className="space-y-1 text-[11px] text-slate-600">
            {data.events.map(e => (
              <li key={e.id}>{fmtDate(e.valid_from)} — {fmtValue(e.value)}{e.order_number ? ` (أمر ${e.order_number})` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <MovementDialog
          employeeId={employeeId}
          labels={labels}
          onClose={() => setOpen(false)}
          onSaved={async (res) => {
            setOpen(false);
            toast({ title: 'تم تسجيل الحركة', description: res?.pending?.length ? 'الحركة مؤجلة لحين تاريخ نفاذها' : 'حُدّثت بيانات الموظف' });
            await load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function MovementDialog({ employeeId, labels, onClose, onSaved }) {
  const [field, setField] = useState('grade');
  const [value, setValue] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [reason, setReason] = useState('');
  const [orders, setOrders] = useState([]);
  const [orderMode, setOrderMode] = useState('none'); // none | existing | new
  const [orderId, setOrderId] = useState('');
  const [newOrder, setNewOrder] = useState({ order_number: '', order_date: '', issuer: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiClient.careerHistory.listOrders().then(list => setOrders((list || []).filter(o => !o.cancelled_by_order_id && !o.cancels_order_id))).catch(() => {});
  }, []);

  const submit = async () => {
    setErr('');
    setSaving(true);
    try {
      let oid = null;
      if (orderMode === 'existing') {
        if (!orderId) throw new Error('اختر الأمر الإداري');
        oid = Number(orderId);
      } else if (orderMode === 'new') {
        const created = await apiClient.careerHistory.createOrder({ ...newOrder, effective_date: effectiveDate });
        oid = created.id;
      }
      const res = await apiClient.careerHistory.recordMovement(employeeId, {
        effective_date: effectiveDate,
        changes: { [field]: value },
        order_id: oid,
        reason: reason || null,
      });
      await onSaved(res);
    } catch (e) {
      setErr(e.message || 'تعذّر تسجيل الحركة');
    } finally {
      setSaving(false);
    }
  };

  const numeric = field === 'grade' || field === 'step';
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl" dir="rtl">
        <DialogHeader className="text-right"><DialogTitle className="text-base font-bold text-[#1B3A6B]">تسجيل حركة على السجل الوظيفي</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs">
          <label className="block">الحقل
            <select className="mt-1 w-full border rounded-lg h-9 px-2 bg-white" value={field} onChange={e => { setField(e.target.value); setValue(''); }}>
              {Object.entries(labels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="block">القيمة الجديدة
            <Input className="mt-1" type={numeric ? 'number' : 'text'} min={1} max={field === 'grade' ? 10 : 11} value={value} onChange={e => setValue(e.target.value)} />
          </label>
          <label className="block">تاريخ النفاذ
            <Input className="mt-1" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
            <span className="text-[10px] text-slate-400">تاريخ سابق = أثر رجعي، وتاريخ لاحق = يُطبَّق عند حلوله.</span>
          </label>
          <div>
            <div className="mb-1">الأمر الإداري</div>
            <div className="flex gap-3">
              {[['none', 'بلا أمر'], ['existing', 'أمر مسجل'], ['new', 'أمر جديد']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1"><input type="radio" checked={orderMode === k} onChange={() => setOrderMode(k)} /> {l}</label>
              ))}
            </div>
            {orderMode === 'existing' && (
              <select className="mt-2 w-full border rounded-lg h-9 px-2 bg-white" value={orderId} onChange={e => setOrderId(e.target.value)}>
                <option value="">— اختر —</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} — {String(o.order_date).slice(0, 10)}{o.issuer ? ` — ${o.issuer}` : ''}</option>)}
              </select>
            )}
            {orderMode === 'new' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input placeholder="رقم الأمر" value={newOrder.order_number} onChange={e => setNewOrder({ ...newOrder, order_number: e.target.value })} />
                <Input type="date" value={newOrder.order_date} onChange={e => setNewOrder({ ...newOrder, order_date: e.target.value })} />
                <Input className="col-span-2" placeholder="الجهة المصدرة (اختياري)" value={newOrder.issuer} onChange={e => setNewOrder({ ...newOrder, issuer: e.target.value })} />
              </div>
            )}
          </div>
          <label className="block">السبب / ملاحظة
            <Input className="mt-1" value={reason} onChange={e => setReason(e.target.value)} />
          </label>
          {err && <div className="text-red-600 bg-red-50 rounded-lg p-2">{err}</div>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" disabled={saving} onClick={submit} className="bg-[#1B3A6B]">{saving ? 'جارٍ الحفظ...' : 'حفظ الحركة'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
