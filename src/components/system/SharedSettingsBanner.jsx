// B6: تنبيه ظاهر إذا فشل تحميل أو حفظ الإعدادات المشتركة (قواعد الرواتب وغيرها) بدل رسالة بالـconsole.
import React, { useEffect, useState } from 'react';
import { onSharedSettingsStatus } from '@/lib/sharedSettings';

export default function SharedSettingsBanner() {
  const [status, setStatus] = useState({ ok: true });
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => onSharedSettingsStatus(s => { setStatus(s); if (!s.ok) setDismissed(false); }), []);
  if (status.ok || dismissed) return null;
  return (
    <div dir="rtl" className="fixed bottom-4 left-4 z-[9999] max-w-md bg-amber-50 border border-amber-300 text-amber-900 rounded-xl shadow-lg p-3 text-xs flex gap-3 items-start">
      <div className="flex-1">
        <div className="font-bold mb-0.5">الإعدادات المشتركة</div>
        <div>{status.error}</div>
      </div>
      <button type="button" onClick={() => setDismissed(true)} className="text-amber-700 hover:text-amber-900 font-bold">×</button>
    </div>
  );
}
