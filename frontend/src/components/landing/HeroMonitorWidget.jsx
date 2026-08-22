import { useState } from "react";
import { Loader2, Radio, Calendar, Zap } from "lucide-react";

const formatMetric = (val) => {
  if (val === undefined || val === null) return "0";
  if (val >= 1000000) return (val / 1000000).toFixed(1) + "M";
  if (val >= 1000) return (val / 1000).toFixed(1) + "K";
  return new Intl.NumberFormat("en-US").format(val);
};

export default function HeroMonitorWidget({ monitorStats, loadingMonitor }) {
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);

  return (
    <div className="relative">
      <div className="absolute -inset-2 bg-gradient-to-tr from-indigo-500/20 via-sky-500/20 to-cyan-500/20 blur-3xl rounded-3xl -z-10" />
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl p-6 sm:p-7 shadow-2xl relative min-h-[380px] flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-white/[0.08]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Campaign Monitor</p>
            <h3 className="font-bold text-white text-base mt-0.5">High-Volume Dispatch</h3>
          </div>
          {loadingMonitor ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold">
              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
              Checking...
            </span>
          ) : monitorStats?.is_active ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Routing Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Offline
            </span>
          )}
        </div>

        {/* Inactive State */}
        {!loadingMonitor && monitorStats && !monitorStats.is_active && (
          <div className="my-auto py-12 px-4 text-center flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 grid place-items-center mb-4 text-amber-400 shadow-lg shadow-amber-500/5">
              <Radio className="w-7 h-7" />
            </div>
            <h4 className="text-lg font-bold text-slate-100 tracking-tight">Mail Flow is inactive - data not available</h4>
            <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
              Live telemetry broadcasting is currently disabled by system administrators.
            </p>
          </div>
        )}

        {/* Loading State */}
        {loadingMonitor && (
          <div className="my-auto py-16 text-center text-slate-500 text-sm flex flex-col items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
            <span>Loading platform telemetry...</span>
          </div>
        )}

        {/* Active State */}
        {!loadingMonitor && monitorStats?.is_active && (
          <>
            {/* Top 3 Server-wide Monthly Metrics */}
            <div className="grid grid-cols-3 gap-3 my-5">
              <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-3.5 text-left">
                <span className="text-[10px] text-emerald-400 font-semibold block mb-0.5">30d Total</span>
                <strong className="block text-xl font-extrabold text-white tracking-tight">
                  {formatMetric(monitorStats.metrics?.delivered || 0)}
                </strong>
                <span className="text-[11px] text-slate-400">Delivered</span>
              </div>

              <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-3.5 text-left">
                <span className="text-[10px] text-emerald-400 font-semibold block mb-0.5">Server-wide</span>
                <strong className="block text-xl font-extrabold text-white tracking-tight">
                  {(monitorStats.metrics?.success_rate ?? 100).toFixed(1)}%
                </strong>
                <span className="text-[11px] text-slate-400">Success Rate</span>
              </div>

              <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-3.5 text-left">
                <span className="text-[10px] text-cyan-400 font-semibold block mb-0.5">Live</span>
                <strong className="block text-xl font-extrabold text-white tracking-tight">
                  {formatMetric(monitorStats.metrics?.in_queue || 0)}
                </strong>
                <span className="text-[11px] text-slate-400">In Queue</span>
              </div>
            </div>

            {/* 12-Day Interactive Bar Chart */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span className="flex items-center gap-1 font-medium">
                  <Calendar className="w-3 h-3 text-indigo-400" />
                  12-Day Activity
                </span>
                <span className="text-[10px] text-slate-400">
                  {selectedBarIndex !== null && monitorStats.daily_bars?.[selectedBarIndex] ? (
                    <span className="text-cyan-300 font-semibold">
                      {monitorStats.daily_bars[selectedBarIndex].label}: {formatMetric(monitorStats.daily_bars[selectedBarIndex].delivered)} sent · {monitorStats.daily_bars[selectedBarIndex].failed} failed
                    </span>
                  ) : (
                    "Click any bar to inspect daily data"
                  )}
                </span>
              </div>

              <div className="h-28 flex items-end gap-1.5 px-1 pb-1 pt-3">
                {(monitorStats.daily_bars || []).map((bar, i) => {
                  const isSelected = selectedBarIndex === i;
                  return (
                    <button
                      key={bar.date || i}
                      type="button"
                      onClick={() => setSelectedBarIndex(isSelected ? null : i)}
                      className={`flex-1 rounded-t transition-all duration-300 relative group cursor-pointer focus:outline-none ${isSelected
                          ? "bg-gradient-to-t from-cyan-500 via-sky-400 to-white shadow-lg shadow-cyan-500/50 scale-y-105"
                          : "bg-gradient-to-t from-indigo-600/40 via-indigo-400 to-cyan-300 hover:brightness-125"
                        }`}
                      style={{
                        height: `${bar.percentage || 25}%`,
                        opacity: isSelected ? 1 : 0.5 + (i * 0.04),
                      }}
                      title={`${bar.label} (${bar.date}): ${bar.delivered} delivered, ${bar.failed} failed`}
                      aria-label={`Inspect ${bar.label}`}
                    >
                      <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-700 text-cyan-300 text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-20 shadow-md">
                        {bar.label}: {bar.delivered}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Relay Health Card */}
            <div className="mt-4 p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-400/20 flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 grid place-items-center shrink-0">
                <Zap className="w-5 h-5 text-indigo-300" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                  Optimal SMTP Relay Health
                </p>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  {monitorStats.relay_health?.active_routes || 0} active route
                  {(monitorStats.relay_health?.active_routes || 0) === 1 ? "" : "s"} ·{" "}
                  {monitorStats.relay_health?.delivery_incidents || 0} delivery incident
                  {(monitorStats.relay_health?.delivery_incidents || 0) === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
