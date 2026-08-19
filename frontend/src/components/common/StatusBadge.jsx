import React from "react";

export default function StatusBadge({ status }) {
  const normalized = (status || "").toLowerCase().replace(/\s+/g, "_");

  const styles = {
    // Recipient & General statuses
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    inactive: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    unsubscribed: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    bounced: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    complained: "bg-purple-500/10 text-purple-400 border-purple-500/30",

    // Campaign statuses
    draft: "bg-slate-500/10 text-slate-300 border-slate-500/30",
    scheduled: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    queued: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    running: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse",
    paused: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    completed: "bg-teal-500/10 text-teal-300 border-teal-500/30",
    partially_completed: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
    failed: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    cancelled: "bg-slate-600/20 text-slate-400 border-slate-600/40",

    // Delivery & SMTP statuses
    sent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    pending: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    error: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    testing: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  };

  const badgeStyle = styles[normalized] || "bg-slate-500/10 text-slate-300 border-slate-500/30";

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeStyle}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-75" />
      {status || "Unknown"}
    </span>
  );
}
