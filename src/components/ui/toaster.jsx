import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const content = (
    <ToastProvider>
      {toasts
        .filter((t) => t.open !== false)
        .map(function ({ id, title, description, action, variant = "default", ...props }) {
          return (
            <Toast key={id} variant={variant} {...props}>
              <div className="flex items-start gap-3 w-full">
                {variant === "success" && (
                  <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                )}
                {variant === "destructive" && (
                  <div className="p-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                    <AlertCircle size={18} />
                  </div>
                )}
                {variant === "warning" && (
                  <div className="p-1.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                )}
                {variant === "default" && (
                  <div className="p-1.5 rounded-xl bg-blue-50 text-[#1B3A6B] border border-blue-200 shrink-0">
                    <Info size={18} />
                  </div>
                )}

                <div className="grid gap-0.5 flex-1 min-w-0 text-right">
                  {title && <ToastTitle>{title}</ToastTitle>}
                  {description && (
                    <ToastDescription>{description}</ToastDescription>
                  )}
                </div>

                {action}
                <ToastClose onClick={() => dismiss(id)} />
              </div>
            </Toast>
          );
        })}
      <ToastViewport />
    </ToastProvider>
  );

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(content, document.body);
} 