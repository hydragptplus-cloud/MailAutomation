import React from "react";

export default function LoadingSkeleton({ type = "table", rows = 5 }) {
  if (type === "cards") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="h-28 bg-slate-800/60 rounded-2xl border border-slate-700/40 p-4" />
        ))}
      </div>
    );
  }

  if (type === "form") {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-slate-800/60 rounded-xl" />
        <div className="h-10 bg-slate-800/60 rounded-xl" />
        <div className="h-24 bg-slate-800/60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-pulse">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="h-12 bg-slate-800/50 rounded-xl border border-slate-800/60" />
      ))}
    </div>
  );
}
