import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Building2, Loader2, Mail, Radio, ShieldCheck } from "lucide-react";
import api from "../../services/api";

export default function PlatformOverview() {
  const [organizations, setOrganizations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [monitorActive, setMonitorActive] = useState(true);
  const [togglingMonitor, setTogglingMonitor] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/organizations/"),
      api.get("/sessions/"),
      api.get("/platform/billing-configuration/"),
    ])
      .then(([orgs, active, billingConfig]) => {
        setOrganizations(orgs.data.results || orgs.data);
        setSessions(active.data.results || active.data);
        if (billingConfig.data?.public_landing_monitor_active !== undefined) {
          setMonitorActive(Boolean(billingConfig.data.public_landing_monitor_active));
        }
      })
      .catch((requestError) => setError(requestError.response?.data?.detail || "Unable to load the platform overview."))
      .finally(() => setLoading(false));
  }, []);

  const handleToggleMonitor = async () => {
    setTogglingMonitor(true);
    try {
      const nextState = !monitorActive;
      await api.patch("/platform/billing-configuration/", { public_landing_monitor_active: nextState });
      setMonitorActive(nextState);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Failed to update landing page monitor setting.");
    } finally {
      setTogglingMonitor(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-500">Loading platform overview…</div>;
  const activeOrganizations = organizations.filter((item) => item.status === "active").length;
  const activeSessions = sessions.filter((item) => !item.revoked_at).length;
  const monthlyCapacity = organizations.reduce((sum, item) => sum + (Number(item.monthly_email_limit) || 0), 0);
  const stats = [
    ["Organizations", organizations.length, `${activeOrganizations} active`, Building2, "text-indigo-300"],
    ["Active sessions", activeSessions, `${sessions.length} recorded`, ShieldCheck, "text-emerald-300"],
    ["Monthly capacity", new Intl.NumberFormat().format(monthlyCapacity), "emails allocated", Mail, "text-cyan-300"],
    ["Suspended", organizations.length - activeOrganizations, "organizations", Activity, "text-amber-300"],
  ];

  return <div className="space-y-7">
    {error && <Notice tone="error">{error}</Notice>}
    <section><div className="mb-4"><h2 className="text-lg font-semibold">Operational overview</h2><p className="text-sm text-slate-500 mt-1">A current snapshot of tenants and platform access.</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{stats.map(([label, value, note, Icon, color]) => <article key={label} className="border border-slate-800 bg-slate-900 p-4 rounded-md"><div className="flex items-start justify-between"><div><p className="text-xs text-slate-500">{label}</p><strong className="block text-2xl mt-2 text-slate-100">{value}</strong><span className="text-xs text-slate-500">{note}</span></div><Icon className={`w-5 h-5 ${color}`} /></div></article>)}</div></section>

    {/* Landing Monitor Quick Control Card */}
    <section className="border-t border-slate-800 pt-6">
      <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${monitorActive ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border border-amber-500/20 text-amber-400"}`}>
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-slate-100">Public Landing Page Monitor</h3>
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${monitorActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>
                {monitorActive ? "Active (Broadcasting)" : "Inactive (Paused)"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {monitorActive
                ? "The landing page is actively showing server-wide 30-day delivery metrics, 12-day activity, and SMTP relay health."
                : "The landing page is showing 'Mail Flow is inactive - data not available'."}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={togglingMonitor}
          onClick={handleToggleMonitor}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shrink-0 ${
            monitorActive
              ? "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
          }`}
        >
          {togglingMonitor && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {monitorActive ? "Pause Public Monitor" : "Activate Public Monitor"}
        </button>
      </div>
    </section>

    <section className="border-t border-slate-800 pt-6"><div className="flex items-center justify-between gap-4 mb-4"><div><h2 className="text-lg font-semibold">Recently updated organizations</h2><p className="text-sm text-slate-500 mt-1">Quick access to the latest tenant records.</p></div><Link to="/platform/organizations" className="text-sm font-medium text-indigo-300">View all</Link></div><div className="overflow-x-auto border border-slate-800 rounded-md"><table><thead><tr><th>Organization</th><th>Status</th><th>Users</th><th>Monthly quota</th></tr></thead><tbody>{organizations.slice(0, 5).map((org) => <tr key={org.id}><td className="font-medium text-slate-200">{org.name}</td><td><Status value={org.status} /></td><td>{org.user_count}/{org.max_users}</td><td>{new Intl.NumberFormat().format(org.monthly_email_limit)}</td></tr>)}{organizations.length === 0 && <tr><td colSpan="4" className="text-center text-slate-500 py-10">No organizations yet.</td></tr>}</tbody></table></div></section>
  </div>;
}

function Status({ value }) {
  return <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${value === "active" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{value}</span>;
}

function Notice({ children, tone }) {
  return <div className={`p-3 border rounded-md text-sm ${tone === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"}`}>{children}</div>;
}

