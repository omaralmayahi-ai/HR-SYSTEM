// B4c: سجل الأوامر الإدارية — إضافة أمر، وإلغاؤه بأمر إلغاء (للمدير) مع إرجاع أثره على السجل الوظيفي.
import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Ban, Search } from 'lucide-react';
import apiClient from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const EMPTY = { order_number: '', order_date: '', issuer: '', subject: '', order_kind: '', effective_date: '', notes: '' };
const KINDS = ['ترفيع', 'علاوة', 'نقل', 'تكليف', 'تغيير حالة', 'تعيين', 'إنهاء خدمة', 'أخرى'];

export default function AdministrativeOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ['admin', 'super_admin', 'hr_admin'].includes(user?.role);
  const canWrite = user && user.role !== 'employee';
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = async () => {
    setError('');
    try { setOrders(await apiClient.careerHistory.listOrders()); } catch (e) { setError(e.message || 'تعذّر تحميل الأوامر'); }
  };
  useEffect(() => { load(); }, []);

  const byId = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const shown = useMemo(() => {
    const t = q.trim();
    if (!t) return orders;
    return orders.filter(o => [o.order_number, o.issuer, o.subject, o.order_kind].some(v => String(v || '').includes(t)));
  }, [orders, q]);

  const save = async () => {
    setFormErr(''); setBusy(true);
    try {
      if (cancelling) {
        const r = await apiClient.careerHistory.cancelOrder(cancelling.id, form);
        toast({ title: 'أُلغي الأمر', description: `أُعيد بناء سجل ${r.affected_employees} موظف` });
      } else {
        await apiClient.careerHistory.createOrder(form);
        toast({ title: 'حُفظ الأمر الإداري' });
      }
      setForm(null); setCancelling(null);
      await load();
    } catch (e) {
      setFormErr(e.message || 'تعذّر الحفظ');
    } finally { setBusy(false); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="p-4 sm:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1B3A6B] flex items-center gap-2"><FileText className="w-5 h-5" /> الأوامر الإدارية</h1>
          <p className="text-xs text-slate-500 mt-1">الأوامر المرتبطة بحركات السجل الوظيفي. الأمر ما يُحذف؛ يُلغى بأمر إلغاء فيرجع أثره.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative"><Search className="w-4 h-4 absolute right-2 top-2.5 text-slate-400" /><Input className="pr-8 h-9 w-56" placeholder="بحث برقم الأمر أو الجهة" value={q} onChange={e => setQ(e.target.value)} /></div>
          {canWrite && <Button size="sm" className="bg-[#1B3A6B] gap-1" onClick={() => { setCancelling(null); setForm({ ...EMPTY }); }}><Plus className="w-4 h-4" /> أمر جديد</Button>}
        </div>
      </div>

      {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl">{error}</div>}

      <div className="bg-white border border-slate-100 rounded-2xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['رقم الأمر', 'التاريخ', 'الجهة', 'النوع', 'الموضوع', 'النفاذ', 'الحالة', ''].map(h => <th key={h} className="text-right px-3 py-2 font-bold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">لا توجد أوامر</td></tr>}
            {shown.map(o => {
              const cancelled = !!o.cancelled_by_order_id;
              return (
                <tr key={o.id} className={`border-t border-slate-50 ${cancelled ? 'text-slate-400 line-through' : ''}`}>
                  <td className="px-3 py-2 font-bold">{o.order_number}</td>
                  <td className="px-3 py-2">{String(o.order_date).slice(0, 10)}</td>
                  <td className="px-3 py-2">{o.issuer || '—'}</td>
                  <td className="px-3 py-2">{o.order_kind || '—'}</td>
                  <td className="px-3 py-2">{o.subject || '—'}</td>
                  <td className="px-3 py-2">{o.effective_date ? String(o.effective_date).slice(0, 10) : '—'}</td>
                  <td className="px-3 py-2 no-underline">
                    {cancelled ? `ملغى بالأمر ${byId.get(o.cancelled_by_order_id)?.order_number || ''}`
                      : o.cancels_order_id ? `يلغي الأمر ${byId.get(o.cancels_order_id)?.order_number || ''}` : 'نافذ'}
                  </td>
                  <td className="px-3 py-2">
                    {isAdmin && !cancelled && !o.cancels_order_id && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-red-600" onClick={() => { setCancelling(o); setForm({ ...EMPTY, order_kind: 'إلغاء أمر' }); }}>
                        <Ban className="w-3 h-3" /> إلغاء
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <Dialog open onOpenChange={(o) => { if (!o) { setForm(null); setCancelling(null); } }}>
          <DialogContent className="max-w-md rounded-2xl" dir="rtl">
            <DialogHeader className="text-right">
              <DialogTitle className="text-base font-bold text-[#1B3A6B]">{cancelling ? `إلغاء الأمر ${cancelling.order_number}` : 'أمر إداري جديد'}</DialogTitle>
            </DialogHeader>
            {cancelling && <p className="text-[11px] text-slate-500">أدخل بيانات أمر الإلغاء. كل حركات السجل المرتبطة بالأمر الملغى تُستثنى، وترجع بيانات الموظفين لما قبلها.</p>}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Input placeholder="رقم الأمر *" value={form.order_number} onChange={e => set('order_number', e.target.value)} />
              <Input type="date" value={form.order_date} onChange={e => set('order_date', e.target.value)} />
              <Input className="col-span-2" placeholder="الجهة المصدرة" value={form.issuer} onChange={e => set('issuer', e.target.value)} />
              {!cancelling && (
                <select className="border rounded-md h-9 px-2 bg-white" value={form.order_kind} onChange={e => set('order_kind', e.target.value)}>
                  <option value="">نوع الأمر</option>
                  {KINDS.map(k => <option key={k}>{k}</option>)}
                </select>
              )}
              {!cancelling && <Input type="date" title="تاريخ النفاذ" value={form.effective_date} onChange={e => set('effective_date', e.target.value)} />}
              <Input className="col-span-2" placeholder="الموضوع" value={form.subject} onChange={e => set('subject', e.target.value)} />
              <Input className="col-span-2" placeholder="ملاحظات" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            {formErr && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{formErr}</div>}
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => { setForm(null); setCancelling(null); }}>تراجع</Button>
              <Button size="sm" disabled={busy} className={cancelling ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1B3A6B]'} onClick={save}>{busy ? 'جارٍ الحفظ...' : cancelling ? 'تأكيد الإلغاء' : 'حفظ'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
