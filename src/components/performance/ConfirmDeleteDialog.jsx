import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ConfirmDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'تأكيد الحذف',
  description = 'هل أنت متأكد من تنفيذ هذا الإجراء؟ لا يمكن التراجع عن هذه العملية.',
  confirmText = 'نعم، أكد الحذف النهائي',
  cancelText = 'تراجع / إلغاء',
  isDanger = true
}) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm();
    } catch (err) {
      console.error('Confirmation error:', err);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200" dir="rtl">
      <div 
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute left-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Modal Header Icon */}
        <div className="flex items-center gap-4">
          <div className={`p-3.5 rounded-2xl flex items-center justify-center shrink-0 ${
            isDanger ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
          }`}>
            <AlertTriangle size={28} />
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              الإجراء يتطلب تأكيد الموظف المسؤول
            </p>
          </div>
        </div>

        {/* Description Body */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-medium text-slate-700 leading-relaxed">
          {description}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer ${
              isDanger 
                ? 'bg-rose-600 hover:bg-rose-700 text-white' 
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>جاري التنفيذ...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} />
                <span>{confirmText}</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1 font-bold text-xs py-2.5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            {cancelText}
          </Button>
        </div>
      </div>
    </div>
  );
}
