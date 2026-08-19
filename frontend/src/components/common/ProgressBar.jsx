import React from "react";

export default function ProgressBar({
  sent = 0,
  failed = 0,
  pending = 0,
  total = 0,
  showLabels = true,
  height = "h-2.5",
}) {
  const calculatedTotal = total || (sent + failed + pending) || 1;
  const sentPercent = Math.min(100, Math.round((sent / calculatedTotal) * 100));
  const failedPercent = Math.min(100 - sentPercent, Math.round((failed / calculatedTotal) * 100));
  const pendingPercent = Math.max(0, 100 - sentPercent - failedPercent);

  return (
    <div className="w-full space-y-1.5">
      <div className={`w-full bg-slate-800 rounded-full overflow-hidden flex ${height}`}>
        {sentPercent > 0 && (
          <div
            style={{ width: `${sentPercent}%` }}
            className="bg-emerald-500 transition-all duration-500"
            title={`Sent: ${sent} (${sentPercent}%)`}
          />
        )}
        {failedPercent > 0 && (
          <div
            style={{ width: `${failedPercent}%` }}
            className="bg-rose-500 transition-all duration-500"
            title={`Failed: ${failed} (${failedPercent}%)`}
          />
        )}
        {pendingPercent > 0 && (
          <div
            style={{ width: `${pendingPercent}%` }}
            className="bg-slate-700 transition-all duration-500"
            title={`Pending: ${pending} (${pendingPercent}%)`}
          />
        )}
      </div>

      {showLabels && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-0.5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Sent: {sent}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Failed: {failed}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
              Pending: {pending}
            </span>
          </div>
          <span>{sentPercent}% Complete</span>
        </div>
      )}
    </div>
  );
}
