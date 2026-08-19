import React from "react";
import { FolderOpen } from "lucide-react";

export default function EmptyState({
  title = "No data found",
  description = "There are no records matching your query or filter criteria.",
  actionLabel,
  onAction,
  icon: Icon = FolderOpen,
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 my-4">
      <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/50 text-indigo-400 mb-4 shadow-inner">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-semibold text-slate-100 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
