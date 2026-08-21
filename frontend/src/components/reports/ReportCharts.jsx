import React, { useState } from "react";
import { BarChart2, AlertCircle, Inbox, CheckCircle, TrendingUp } from "lucide-react";

export default function ReportCharts({
  dailyVolume = [],
  successRatio = [],
  campaignPerformance = [],
  smtpUsage = [],
  failureReasons = [],
}) {
  const [activeTooltip, setActiveTooltip] = useState(null);

  // Use actual database data (no fake mocks)
  const dailyData = dailyVolume;
  const successData = successRatio;
  const perfData = campaignPerformance;
  const failuresData = failureReasons;

  // Calculations for Area Chart
  const maxSent = Math.max(...dailyData.map((d) => d.sent || 0), 1);
  const svgWidth = 500;
  const svgHeight = 180;
  const padding = 30;
  const chartWidth = svgWidth - padding * 2;
  const chartHeight = svgHeight - padding * 2;

  const points = dailyData.map((d, i) => {
    const x = padding + (i / (dailyData.length - 1 || 1)) * chartWidth;
    const y = svgHeight - padding - ((d.sent || 0) / maxSent) * chartHeight;
    return { x, y, data: d };
  });

  const pathD = points.reduce(
    (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
    ""
  );
  const areaD = points.length
    ? `${pathD} L ${points[points.length - 1]?.x || 0} ${svgHeight - padding} L ${points[0]?.x || 0} ${svgHeight - padding} Z`
    : "";

  // Calculations for Donut Chart
  const totalSuccessVal = successData.reduce((a, b) => a + (b.value || 0), 0);
  const successCount = successData.find((s) => s.name === "Successful")?.value || 0;
  const failureCount = Math.max(totalSuccessVal - successCount, 0);
  const hasDeliveryData = totalSuccessVal > 0;
  const successPercent = totalSuccessVal > 0 ? Math.round((successCount / totalSuccessVal) * 100) : 0;

  // Calculations for Bar Chart
  const maxPerfVal = Math.max(...perfData.map((d) => d.sent || 0), 1);

  // Calculations for Horizontal Failure Bar Chart
  const maxFailureVal = Math.max(...failuresData.map((d) => d.count || 0), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Emails Sent by Day (SVG Area Chart) */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4 shadow-xl relative min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            Emails Sent by Day
          </h3>
          {dailyData.length > 0 && (
            <span className="text-xs text-indigo-400 font-mono font-semibold">
              Peak: {maxSent.toLocaleString()}
            </span>
          )}
        </div>

        {dailyData.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center space-y-2 text-slate-500">
            <BarChart2 className="w-8 h-8 opacity-40 text-indigo-400" />
            <p className="text-xs">No daily dispatch activity logged yet.</p>
          </div>
        ) : (
          <div className="w-full relative">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible">
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padding + ratio * chartHeight;
                return (
                  <line
                    key={idx}
                    x1={padding}
                    y1={y}
                    x2={svgWidth - padding}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Filled Area */}
              {areaD && <path d={areaD} fill="url(#areaGradient)" />}

              {/* Smooth Line */}
              {pathD && <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2.5" />}

              {/* Interactive Points */}
              {points.map((p, i) => (
                <g key={i} className="group cursor-pointer">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4"
                    className="fill-indigo-500 stroke-slate-900 stroke-2 group-hover:r-6 transition-all"
                    onMouseEnter={() => setActiveTooltip({ type: "daily", ...p })}
                    onMouseLeave={() => setActiveTooltip(null)}
                  />
                  <text
                    x={p.x}
                    y={svgHeight - 10}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-400 font-sans"
                  >
                    {p.data.day}
                  </text>
                </g>
              ))}
            </svg>

            {/* Active Hover Tooltip */}
            {activeTooltip && activeTooltip.type === "daily" && (
              <div
                className="absolute pointer-events-none bg-slate-950/95 border border-indigo-500/40 p-2.5 rounded-xl text-xs shadow-2xl space-y-0.5 z-20"
                style={{
                  left: `${(activeTooltip.x / svgWidth) * 100}%`,
                  top: `${(activeTooltip.y / svgHeight) * 100 - 40}%`,
                  transform: "translate(-50%, -100%)",
                }}
              >
                <p className="font-bold text-slate-100">{activeTooltip.data.day}</p>
                <p className="text-indigo-400 font-mono font-semibold">
                  Sent: {(activeTooltip.data.sent || 0).toLocaleString()}
                </p>
                <p className="text-emerald-400 text-[11px]">
                  Success: {(activeTooltip.data.success || 0).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Success vs Failure Donut Chart */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4 shadow-xl min-w-0">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          Delivery Success vs. Failure
        </h3>

        <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
          {/* Donut Circle */}
          <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="#1e293b"
                strokeWidth="12"
              />
              {successCount > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray={`${(successPercent * 251.2) / 100} 251.2`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              )}
              {failureCount > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#ef4444"
                  strokeWidth="12"
                  strokeDasharray={`${((100 - successPercent) * 251.2) / 100} 251.2`}
                  strokeDashoffset={`-${(successPercent * 251.2) / 100}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-black text-slate-100">
                {hasDeliveryData ? `${successPercent}%` : "—"}
              </span>
              <span className={`text-[10px] uppercase font-bold tracking-wider ${hasDeliveryData ? "text-emerald-400" : "text-slate-500"}`}>
                {hasDeliveryData ? "Success" : "No data"}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-3 text-xs w-full max-w-xs">
            {successData.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color || (idx === 0 ? "#10b981" : "#ef4444") }}
                  />
                  <span className="font-semibold text-slate-200">{item.name}</span>
                </div>
                <span className="font-mono font-bold text-slate-100">
                  {(item.value || 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Campaign Performance (Grouped SVG Bars) */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4 shadow-xl min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Campaign Delivery Metrics</h3>
          {perfData.length > 0 && (
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <span className="flex items-center gap-1 text-sky-400">
                <span className="w-2 h-2 rounded-full bg-sky-500" /> Sent
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Delivered
              </span>
              <span className="flex items-center gap-1 text-indigo-400">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> Clicked
              </span>
            </div>
          )}
        </div>

        {perfData.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center space-y-2 text-slate-500">
            <Inbox className="w-8 h-8 opacity-40 text-sky-400" />
            <p className="text-xs">No active campaign dispatches recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3.5 pt-1">
            {perfData.map((c, idx) => {
              const sentPct = Math.round(((c.sent || 0) / maxPerfVal) * 100);
              const deliveredPct = Math.round(((c.delivered || 0) / maxPerfVal) * 100);
              const clickedPct = Math.round(((c.clicks || 0) / maxPerfVal) * 100);

              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-200 truncate">{c.name}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {c.delivered || 0} delivered · {c.clicks || 0} clicked
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                      <div style={{ width: `${sentPct}%` }} className="bg-sky-500 h-full rounded-full" />
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                      <div style={{ width: `${deliveredPct}%` }} className="bg-emerald-500 h-full rounded-full" />
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                      <div style={{ width: `${clickedPct}%` }} className="bg-indigo-500 h-full rounded-full" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Failure Reasons Breakdown */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4 shadow-xl min-w-0">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          Failure Reasons Breakdown
        </h3>

        {failuresData.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center space-y-2 text-slate-500">
            <CheckCircle className="w-8 h-8 opacity-40 text-emerald-400" />
            <p className="text-xs">No delivery errors or failures logged.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {failuresData.map((f, idx) => {
              const pct = Math.round(((f.count || 0) / maxFailureVal) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-300 truncate">{f.reason}</span>
                    <span className="font-mono text-rose-400 font-semibold">{f.count} errors</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="bg-rose-500 h-full rounded-full transition-all duration-700"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
