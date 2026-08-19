import React from "react";
import { Calendar } from "lucide-react";

export default function DateTimePicker({
  label,
  value,
  onChange,
  required = false,
  min,
  className = "",
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-300">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          type="datetime-local"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
        />
      </div>
    </div>
  );
}
