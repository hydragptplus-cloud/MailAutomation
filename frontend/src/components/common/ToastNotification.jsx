import React from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { useToastContext } from "../../context/ToastContext";

export default function ToastNotification() {
  const { toasts, removeToast } = useToastContext();

  if (!toasts.length) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-500 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
  };

  const bgStyles = {
    success: "bg-slate-900/95 border-emerald-500/30 text-emerald-100",
    error: "bg-slate-900/95 border-rose-500/30 text-rose-100",
    info: "bg-slate-900/95 border-sky-500/30 text-sky-100",
    warning: "bg-slate-900/95 border-amber-500/30 text-amber-100",
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full px-4 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 pointer-events-auto ${
            bgStyles[t.type] || bgStyles.info
          }`}
        >
          {icons[t.type] || icons.info}
          <div className="flex-1 text-sm font-medium leading-relaxed">{t.message}</div>
          <button
            onClick={() => removeToast(t.id)}
            className="text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
