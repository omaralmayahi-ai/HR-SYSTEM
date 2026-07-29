import { useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Download, Copy, Printer, QrCode, Check, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function EmployeeQuickAccessQR({ employee, compact = false }) {
  const { toast } = useToast();
  const cardRef = useRef(null);
  const qrCanvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [qrType, setQrType] = useState('url'); // 'url' or 'vcard'
  const [isDownloading, setIsDownloading] = useState(false);

  if (!employee) return null;

  // Build unique access token & URLs
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const profileUrl = `${baseUrl}/employees/${employee.id}`;
  const uniqueToken = `QR-EMP-${employee.company_number || employee.civil_service_number || employee.id}`;

  // Formatted VCard info for QR scanning
  const vcardText = `BEGIN:VCARD
VERSION:3.0
N:${employee.surname || ''};${employee.first_name || ''};${employee.father_name || ''};;
FN:${employee.full_name || ''} ${employee.surname || ''}
ORG:${employee.department || employee.section || 'شركة النفط'}
TITLE:${employee.job_title || ''}
TEL;TYPE=CELL:${employee.phone || ''}
EMAIL:${employee.email || ''}
NOTE:رقم الشركة: ${employee.company_number || ''} | الرقم الوظيفي: ${employee.civil_service_number || ''}
URL:${profileUrl}
END:VCARD`;

  const qrValue = qrType === 'url' ? profileUrl : vcardText;

  // 1. Direct QR Image Download (PNG)
  const downloadQRImage = () => {
    try {
      const canvas = document.getElementById(`employee-qr-canvas-${employee.id}`);
      if (!canvas) {
        toast({ title: 'خطأ', description: 'تعذر العثور على عنصر QR كود', variant: 'destructive' });
        return;
      }
      const imageUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `QR_Code_${employee.full_name?.replace(/\s+/g, '_')}_${employee.company_number || employee.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'تم تنزيل الرمز بنجاح',
        description: 'تمت إضافه صورة رمز QR إلى التنزيلات الخاصة بك.',
      });
    } catch (err) {
      console.error('QR Download Error:', err);
      toast({ title: 'خطأ أثناء التنزيل', description: err.message, variant: 'destructive' });
    }
  };

  // 2. Full Digital Pass Badge Download (PNG)
  const downloadFullPassCard = async () => {
    if (!cardRef.current) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3, // High DPI resolution for crisp images
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      const imageUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `بطاقة_وصول_سريع_${employee.full_name?.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'تم تحمبل بطاقة الوصول بنجاح',
        description: 'تمت إضافه بطاقة الهوية الرقمية كصورة عالية الدقة إلى جهازك.',
      });
    } catch (err) {
      console.error('Pass Card Download Error:', err);
      toast({ title: 'خطأ أثناء تنزيل البطاقة', description: err.message, variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  // 3. Copy Access Link
  const handleCopy = () => {
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    toast({
      title: 'تم نسخ رابط الوصول السريع',
      description: profileUrl,
    });
    setTimeout(() => setCopied(false), 2500);
  };

  // 4. Quick Print
  const handlePrint = () => {
    try {
      const qrCanvas = document.getElementById(`employee-qr-canvas-${employee.id}`);
      const qrDataUrl = qrCanvas ? qrCanvas.toDataURL('image/png') : '';

      const win = window.open('', '_blank');
      if (!win) {
        toast({ title: 'تنبيه', description: 'يرجى السماح بالنوافذ المنبثقة لطباعة البطاقة', variant: 'destructive' });
        return;
      }

      const photoHtml = employee.photo
        ? `<img src="${employee.photo}" class="emp-photo" alt="صورة الموظف" />`
        : `<div class="emp-avatar">${employee.full_name?.charAt(0) || 'م'}</div>`;

      win.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8" />
            <title>بطاقة هوية ورمز وصول سريع - ${employee.full_name}</title>
            <style>
              @page { size: A4 portrait; margin: 15mm; }
              body {
                font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: #f8fafc;
                margin: 0;
                padding: 20px;
                color: #0f172a;
                direction: rtl;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
              }
              .badge-card {
                background: #ffffff;
                width: 380px;
                border: 2px solid #1B3A6B;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.08);
                overflow: hidden;
                position: relative;
                page-break-inside: avoid;
              }
              .header-bar {
                background: linear-gradient(135deg, #1B3A6B 0%, #0d1f3c 100%);
                color: #ffffff;
                padding: 16px;
                text-align: center;
                border-bottom: 3px solid #f59e0b;
              }
              .header-bar h2 { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 0.3px; }
              .header-bar p { margin: 4px 0 0 0; font-size: 11px; opacity: 0.85; }
              
              .body-content { padding: 18px; text-align: center; }
              
              .emp-profile {
                display: flex;
                align-items: center;
                gap: 14px;
                background: #f1f5f9;
                padding: 12px;
                border-radius: 12px;
                border: 1px solid #e2e8f0;
                text-align: right;
                margin-bottom: 16px;
              }
              .emp-photo { width: 68px; height: 68px; border-radius: 10px; object-fit: cover; border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.1); flex-shrink: 0; }
              .emp-avatar { width: 68px; height: 68px; border-radius: 10px; background: #1B3A6B; color: #ffffff; font-size: 28px; font-weight: bold; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
              
              .emp-info { flex: 1; min-width: 0; }
              .emp-name { font-size: 15px; font-weight: 800; color: #1B3A6B; margin: 0 0 4px 0; }
              .emp-title { font-size: 12px; font-weight: 600; color: #475569; margin: 0 0 2px 0; }
              .emp-dept { font-size: 10px; color: #64748b; margin: 0; }
              
              .qr-box {
                background: #f8fafc;
                border: 2px dashed #cbd5e1;
                border-radius: 14px;
                padding: 14px;
                margin: 14px 0;
                display: inline-block;
                width: calc(100% - 32px);
                box-sizing: border-box;
              }
              .qr-img { width: 150px; height: 150px; display: block; margin: 0 auto; }
              .qr-token { font-family: monospace; font-size: 11px; font-weight: bold; color: #1B3A6B; margin-top: 8px; letter-spacing: 0.5px; }
              .qr-hint { font-size: 10px; color: #64748b; margin-top: 4px; font-weight: 600; }
              
              .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-top: 12px;
                font-size: 11px;
                text-align: center;
              }
              .info-item { background: #f8fafc; padding: 6px 8px; border-radius: 8px; border: 1px solid #e2e8f0; }
              .info-label { font-size: 9px; color: #64748b; font-weight: 700; display: block; }
              .info-val { font-weight: 800; color: #0f172a; font-size: 11px; }

              .footer-stamp {
                background: #f1f5f9;
                padding: 10px 16px;
                border-top: 1px solid #e2e8f0;
                font-size: 9px;
                color: #64748b;
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .stamp-badge { color: #d97706; font-weight: 800; display: flex; align-items: center; gap: 4px; }
              
              @media print {
                body { background: transparent; padding: 0; }
                .badge-card { box-shadow: none; border-color: #000; }
              }
            </style>
          </head>
          <body>
            <div class="badge-card">
              <div class="header-bar">
                <h2>جمهورية العراق - وزارة النفط</h2>
                <p>بطاقة الوصول السريع والفحص الإلكتروني للجهات المختصة</p>
              </div>
              
              <div class="body-content">
                <div class="emp-profile">
                  ${photoHtml}
                  <div class="emp-info">
                    <div class="emp-name">${employee.full_name} ${employee.surname || ''}</div>
                    <div class="emp-title">${employee.job_title || 'موظف'}</div>
                    <div class="emp-dept">${employee.section || employee.department || 'الشركة العامة'}</div>
                  </div>
                </div>

                <div class="qr-box">
                  ${qrDataUrl ? `<img src="${qrDataUrl}" class="qr-img" alt="رمز QR" />` : '<p style="color:red">تعذر تحميل الرمز</p>'}
                  <div class="qr-token">${uniqueToken}</div>
                  <div class="qr-hint">امسح الرمز بوساطة كاميرا الهاتف لفحص البيانات الموثقة</div>
                </div>

                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">رقم الشركة</span>
                    <span class="info-val">${employee.company_number || '—'}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">الرقم الوظيفي</span>
                    <span class="info-val">${employee.civil_service_number || '—'}</span>
                  </div>
                </div>
              </div>

              <div class="footer-stamp">
                <span class="stamp-badge">✓ بطاقة توثيق رسمية</span>
                <span>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-IQ')}</span>
              </div>
            </div>

            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 400);
              };
            </script>
          </body>
        </html>
      `);
      win.document.close();
    } catch (err) {
      console.error('Print Error:', err);
      toast({ title: 'خطأ أثناء الطباعة', description: err.message, variant: 'destructive' });
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs shrink-0">
          <QRCodeCanvas
            id={`employee-qr-canvas-${employee.id}`}
            value={qrValue}
            size={80}
            bgColor="#ffffff"
            fgColor="#1B3A6B"
            level="H"
            includeMargin={false}
          />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#1B3A6B]">
            <QrCode size={14} className="text-amber-500" />
            <span>رمز الوصول السريع</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate font-mono">{uniqueToken}</p>
          <div className="flex gap-1.5 pt-1">
            <Button size="xs" variant="outline" onClick={downloadQRImage} className="text-[10px] h-7 px-2 gap-1 rounded-lg border-slate-300">
              <Download size={12} /> تحميل
            </Button>
            <Button size="xs" variant="ghost" onClick={handleCopy} className="text-[10px] h-7 px-2 gap-1 rounded-lg text-slate-600">
              {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 via-white to-amber-50/20 p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1B3A6B] to-[#0f2444] text-amber-400 flex items-center justify-center shadow-xs shrink-0">
            <QrCode size={18} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#1B3A6B] flex items-center gap-2">
              رمز الوصول السريع (Quick Access QR)
              <span className="bg-amber-100 text-amber-800 text-[9px] px-2 py-0.5 rounded-full font-bold">هوية رقمية</span>
            </h3>
            <p className="text-[11px] text-slate-500">رمز استجابة سريعة فريد قابل للتنزيل كصورة PNG عالية الدقة</p>
          </div>
        </div>

        {/* QR Content Toggle */}
        <div className="flex items-center bg-slate-100/80 p-0.5 rounded-lg self-start sm:self-auto border border-slate-200/60 shrink-0">
          <button
            onClick={() => setQrType('url')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
              qrType === 'url' ? 'bg-white text-[#1B3A6B] shadow-2xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            رابط الملف
          </button>
          <button
            onClick={() => setQrType('vcard')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
              qrType === 'vcard' ? 'bg-white text-[#1B3A6B] shadow-2xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            بطاقة الاتصال (VCard)
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Rendered Digital Pass Card Container */}
        <div className="md:col-span-6 flex justify-center">
          <div
            ref={cardRef}
            className="w-full max-w-[290px] bg-white rounded-xl border-2 border-[#1B3A6B]/20 p-3.5 shadow-sm relative overflow-hidden text-right"
            style={{ direction: 'rtl' }}
          >
            {/* Card Decorative Top Bar */}
            <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-[#1B3A6B] via-amber-500 to-[#1B3A6B]" />
            
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 pt-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-md bg-[#1B3A6B] text-white flex items-center justify-center font-bold text-[10px]">
                  HR
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-[#1B3A6B] leading-none">نظام الموارد البشرية</h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">بطاقة الوصول الرقمي</p>
                </div>
              </div>
              <ShieldCheck size={16} className="text-emerald-600" />
            </div>

            {/* Employee Main Info */}
            <div className="flex items-center gap-2.5 mb-2.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
              {employee.photo ? (
                <img
                  src={employee.photo}
                  alt={employee.full_name}
                  className="w-11 h-11 rounded-lg object-cover border border-white shadow-2xs shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-[#1B3A6B] to-[#122748] text-white font-extrabold text-base flex items-center justify-center shadow-2xs shrink-0">
                  {employee.full_name?.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <h3 className="font-bold text-xs text-[#1B3A6B] truncate">
                  {employee.full_name} {employee.surname || ''}
                </h3>
                <p className="text-[10px] text-slate-600 font-medium truncate">{employee.job_title || 'موظف'}</p>
                <p className="text-[9px] text-slate-400 truncate">{employee.section || employee.department || 'الشركة العامة'}</p>
              </div>
            </div>

            {/* QR Code Canvas Frame */}
            <div className="bg-gradient-to-b from-slate-50 to-white p-2.5 rounded-lg border border-slate-200/80 flex flex-col items-center justify-center my-2 text-center shadow-2xs">
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <QRCodeCanvas
                  id={`employee-qr-canvas-${employee.id}`}
                  value={qrValue}
                  size={120}
                  bgColor="#ffffff"
                  fgColor="#1B3A6B"
                  level="H"
                  includeMargin={false}
                />
              </div>
              <p className="text-[9px] text-slate-400 font-mono mt-1.5 dir-ltr tracking-wider">
                {uniqueToken}
              </p>
              <span className="text-[9px] text-slate-500 font-medium mt-0.5">
                امسح الرمز بواسطة كاميرا الهاتف للوصول
              </span>
            </div>

            {/* Key IDs Bar */}
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="bg-slate-50 p-1.5 rounded-md text-center border border-slate-100">
                <span className="text-slate-400 block text-[8px] font-bold">رقم الشركة</span>
                <span className="font-extrabold text-slate-700">{employee.company_number || '—'}</span>
              </div>
              <div className="bg-slate-50 p-1.5 rounded-md text-center border border-slate-100">
                <span className="text-slate-400 block text-[8px] font-bold">الرقم الوظيفي</span>
                <span className="font-extrabold text-slate-700">{employee.civil_service_number || '—'}</span>
              </div>
            </div>

            {/* Footer stamp */}
            <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[8px] text-slate-400">
              <span className="flex items-center gap-1">
                <Sparkles size={9} className="text-amber-500" /> موثق إلكترونياً
              </span>
              <span>{new Date().toLocaleDateString('ar-IQ')}</span>
            </div>
          </div>
        </div>

        {/* Control Actions & Instructions */}
        <div className="md:col-span-6 space-y-3">
          <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs space-y-1.5">
            <h4 className="text-xs font-bold text-[#1B3A6B] flex items-center gap-1.5">
              <Smartphone size={14} className="text-amber-500" />
              التحميل والتنزيل
            </h4>
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside leading-normal">
              <li>تنزيل <b>رمز QR فقط</b> كصورة PNG منفصلة.</li>
              <li>تنزيل <b>بطاقة الوصول الرقمية الكاملة</b> كصورة PNG.</li>
              <li>قراءة الرمز تنتقل مباشرة لملف الموظف بالكامل.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Button
              onClick={downloadQRImage}
              className="w-full bg-[#1B3A6B] hover:bg-[#142d54] text-white font-bold rounded-xl gap-2 shadow-2xs h-9 text-xs"
            >
              <Download size={15} /> تنزيل رمز QR (PNG)
            </Button>

            <Button
              onClick={downloadFullPassCard}
              disabled={isDownloading}
              variant="outline"
              className="w-full border-amber-600/80 text-amber-900 hover:bg-amber-50 font-bold rounded-xl gap-2 h-9 text-xs"
            >
              <QrCode size={15} className="text-amber-600" />
              {isDownloading ? 'جاري إنشاء الصورة...' : 'تنزيل البطاقة الكاملة (PNG)'}
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleCopy}
                variant="secondary"
                className="rounded-xl gap-1 text-[11px] font-bold h-8"
              >
                {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                {copied ? 'تم النسخ' : 'نسخ الرابط'}
              </Button>

              <Button
                onClick={handlePrint}
                variant="ghost"
                className="rounded-xl gap-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 h-8 border border-slate-200"
              >
                <Printer size={13} /> طباعة البطاقة
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
