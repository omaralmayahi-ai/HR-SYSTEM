// شريط حالة قاعدة البيانات (B2d، قرار ق-2): يظهر عند أول رد 503 DB_UNAVAILABLE،
// ويفحص /api/health كل 10 ثوانٍ حتى تعود القاعدة ثم يختفي.
import { useEffect, useState } from 'react';
import { isDbDown, setDbDown } from '@/api/apiClient';

export default function DbStatusBanner() {
  const [down, setDown] = useState(isDbDown());

  useEffect(() => {
    const onStatus = (e) => setDown(Boolean(e.detail?.down));
    window.addEventListener('hr:db-status', onStatus);
    return () => window.removeEventListener('hr:db-status', onStatus);
  }, []);

  useEffect(() => {
    if (!down) return undefined;
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/health');
        if (r.ok) setDbDown(false);
      } catch { /* الخادم نفسه غير متاح: يبقى الشريط */ }
    }, 10000);
    return () => clearInterval(t);
  }, [down]);

  if (!down) return null;
  return (
    <div role="alert" dir="rtl" className="fixed top-0 inset-x-0 z-[1000] bg-red-700 text-white text-sm px-4 py-2 text-center shadow">
      قاعدة البيانات غير متاحة حالياً — لا يُحفظ ولا يُعرض أي شيء حتى تعود. يُعاد الفحص تلقائياً كل 10 ثوانٍ.
    </div>
  );
}
