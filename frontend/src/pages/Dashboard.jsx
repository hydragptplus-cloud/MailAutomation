import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Send, Users, LayoutTemplate, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
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
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Campaign delivery overview and operational health.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/campaigns/new")}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg"
          >
            <Plus size={16} /> Create Campaign
          </button>
        </div>
      </div>

      {/* Stats Cards Grid */}
      {data.quota && <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-sm text-indigo-200">Daily quota: {data.quota.daily_sent} used, {data.quota.daily_remaining === null ? "unlimited" : `${data.quota.daily_remaining} remaining`}</div>
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-sm text-indigo-200">Weekly quota: {data.quota.weekly_sent || 0} used, {data.quota.weekly_remaining === null ? "unlimited" : `${data.quota.weekly_remaining} remaining`}</div>
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-sm text-indigo-200">30-day quota: {data.quota.monthly_sent} used, {data.quota.monthly_remaining} remaining</div>
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-sm text-indigo-200">Campaigns today: {data.quota.campaigns_today} used, {data.quota.campaigns_remaining} remaining</div>
      </div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Templates</span>
            <LayoutTemplate size={18} className="text-indigo-400" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-slate-100">{data.templates}</span>
            <p className="text-xs text-slate-400 mt-1">Reusable layouts</p>
          </div>
        </div>

        <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Recipients</span>
            <Users size={18} className="text-indigo-400" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-slate-100">{data.recipients}</span>
            <p className="text-xs text-slate-400 mt-1">Across all lists</p>
          </div>
        </div>

        <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Campaigns</span>
            <Send size={18} className="text-indigo-400" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-slate-100">{data.campaigns}</span>
            <p className="text-xs text-slate-400 mt-1">All statuses</p>
          </div>
        </div>

        <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Sent</span>
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-emerald-400">{data.sent_emails}</span>
            <p className="text-xs text-slate-400 mt-1">Successful deliveries</p>
          </div>
        </div>

        <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Failed</span>
            <AlertTriangle size={18} className="text-rose-400" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-rose-400">{data.failed_emails}</span>
            <p className="text-xs text-slate-400 mt-1">Needs attention</p>
          </div>
        </div>
      </div>

      {/* Recent Campaigns Panel */}
      <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-100">Recent Campaigns</h2>
          <button
            onClick={() => navigate("/campaigns")}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center py-8 text-slate-400 text-sm">
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
