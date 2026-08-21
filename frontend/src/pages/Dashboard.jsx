import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  LayoutTemplate,
  Mail,
  Plus,
  Send,
  Users,
} from "lucide-react";
import api from "../services/api";

const fallback = {
  templates: 0,
  recipients: 0,
  campaigns: 0,
  sent_emails: 0,
  failed_emails: 0,
  recent_campaigns: [],
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/dashboard/summary/")
      .then((r) => setData(r.data))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const quotaCards = data.quota ? buildQuotaCards(data.quota) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-slate-100">Dashboard</h1>
            {data.quota && (
              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">
                Active allowance
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-400">Campaign delivery overview and operational health.</p>
        </div>
        <button
          onClick={() => navigate("/campaigns/new")}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-950/40 transition-colors hover:bg-indigo-500 disabled:opacity-60"
        >
          <Plus size={16} /> Create Campaign
        </button>
      </div>

      {data.quota && (
        <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "opacity-70" : ""}`}>
          {quotaCards.map((card) => (
            card.kind === "circle"
              ? <CircularQuotaCard key={card.title} {...card} />
              : <OpenQuotaCard key={card.title} {...card} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={LayoutTemplate} label="Templates" value={data.templates} note="Reusable layouts" />
        <StatCard icon={Users} label="Recipients" value={data.recipients} note="Across all lists" />
        <StatCard icon={Send} label="Campaigns" value={data.campaigns} note="All statuses" />
        <StatCard icon={CheckCircle2} label="Sent" value={data.sent_emails} note="Successful deliveries" tone="emerald" />
        <StatCard icon={AlertTriangle} label="Failed" value={data.failed_emails} note="Needs attention" tone="rose" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-100">Recent Campaigns</h2>
          <button
            onClick={() => navigate("/campaigns")}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
          >
            View All <ArrowRight size={14} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Campaign Name</th>
                <th>Status</th>
                <th>Sent Count</th>
                <th>Failed Count</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_campaigns && data.recent_campaigns.length ? (
                data.recent_campaigns.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <td className="font-semibold text-slate-200">{c.name}</td>
                    <td>
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {c.status}
                      </span>
                    </td>
                    <td className="text-emerald-400 font-medium">{c.sent_count || 0}</td>
                    <td className="text-rose-400 font-medium">{c.failed_count || 0}</td>
                    <td className="text-slate-400">{formatDate(c.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="py-10 text-center text-sm text-slate-400">
                    <Inbox className="mx-auto mb-3 h-9 w-9 text-slate-600" />
                    No campaigns created yet. Click "Create Campaign" above to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function buildQuotaCards(quota) {
  return [
    {
      kind: "circle",
      title: "30-day Email Quota",
      used: quota.monthly_sent || 0,
      remaining: quota.monthly_remaining || 0,
      icon: Mail,
      tone: "indigo",
    },
    {
      kind: "circle",
      title: "Campaigns Today",
      used: quota.campaigns_today || 0,
      remaining: quota.campaigns_remaining || 0,
      icon: Send,
      tone: "emerald",
    },
    quota.daily_remaining === null
      ? {
        kind: "open",
        title: "Daily quota",
        label: "No daily cap",
        icon: Clock3,
        tone: "amber",
      }
      : {
        kind: "circle",
        title: "Daily quota",
        used: quota.daily_sent || 0,
        remaining: quota.daily_remaining || 0,
        icon: Clock3,
        tone: "amber",
      },
    quota.weekly_remaining === null
      ? {
        kind: "open",
        title: "Weekly quota",
        label: "No weekly cap",
        icon: CalendarDays,
        tone: "slate",
      }
      : {
        kind: "circle",
        title: "Weekly quota",
        used: quota.weekly_sent || 0,
        remaining: quota.weekly_remaining || 0,
        icon: CalendarDays,
        tone: "violet",
      },
  ];
}

function CircularQuotaCard({ title, used, remaining, icon: Icon, tone }) {
  const total = used + remaining;
  const percent = total > 0 ? Math.min(Math.round((used / total) * 100), 100) : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = {
    amber: "#f59e0b",
    emerald: "#34d399",
    indigo: "#818cf8",
    violet: "#a78bfa",
  }[tone] || "#818cf8";

  return (
    <div className="min-h-[168px] rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-300">{title}</h2>
        <Icon className="h-4 w-4 text-indigo-300" />
      </div>
      <div className="flex items-center gap-5">
        <div className="relative grid h-28 w-28 shrink-0 place-items-center">
          <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <span className="absolute text-2xl font-black text-slate-100">{percent}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-3xl font-black text-slate-100">
            {formatNumber(used)}
            <span className="text-xl text-slate-500"> / {formatNumber(total)}</span>
          </p>
          <p className="mt-2 text-sm font-medium text-slate-400">{formatNumber(remaining)} remaining</p>
        </div>
      </div>
    </div>
  );
}

function OpenQuotaCard({ title, label, icon: Icon, tone }) {
  const toneClass = tone === "amber"
    ? "bg-amber-400/10 text-amber-300 ring-amber-400/20"
    : "bg-slate-700/40 text-slate-300 ring-slate-600/50";

  return (
    <div className="min-h-[168px] rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20">
      <h2 className="text-sm font-bold text-slate-300">{title}</h2>
      <div className="mt-8 flex items-center gap-4">
        <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-full ring-1 ${toneClass}`}>
          <Icon className="h-7 w-7" />
        </span>
        <p className="text-lg font-semibold text-slate-300">{label}</p>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note, tone = "indigo" }) {
  const toneClass = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    indigo: "text-indigo-400",
  }[tone];

  return (
    <div className="min-h-[150px] rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20">
      <div className="flex items-center justify-between text-slate-400">
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        <Icon size={18} className={toneClass} />
      </div>
      <div className="mt-5">
        <span className={`text-4xl font-black ${tone === "indigo" ? "text-slate-100" : toneClass}`}>
          {formatNumber(value || 0)}
        </span>
        <p className="mt-2 text-sm text-slate-400">{note}</p>
      </div>
    </div>
  );
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}
