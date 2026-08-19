import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Building2, Mail, ShieldCheck } from "lucide-react";
import api from "../../services/api";

export default function PlatformOverview() {
  const [organizations, setOrganizations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/organizations/"), api.get("/sessions/")])
      .then(([orgs, active]) => {
        setOrganizations(orgs.data.results || orgs.data);
        setSessions(active.data.results || active.data);
      })
      .catch((requestError) => setError(requestError.response?.data?.detail || "Unable to load the platform overview."))
      .finally(() => setLoading(false));
  }, []);

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
    <section className="border-t border-slate-800 pt-6"><div className="flex items-center justify-between gap-4 mb-4"><div><h2 className="text-lg font-semibold">Recently updated organizations</h2><p className="text-sm text-slate-500 mt-1">Quick access to the latest tenant records.</p></div><Link to="/platform/organizations" className="text-sm font-medium text-indigo-300">View all</Link></div><div className="overflow-x-auto border border-slate-800 rounded-md"><table><thead><tr><th>Organization</th><th>Status</th><th>Users</th><th>Monthly quota</th></tr></thead><tbody>{organizations.slice(0, 5).map((org) => <tr key={org.id}><td className="font-medium text-slate-200">{org.name}</td><td><Status value={org.status} /></td><td>{org.user_count}/{org.max_users}</td><td>{new Intl.NumberFormat().format(org.monthly_email_limit)}</td></tr>)}{organizations.length === 0 && <tr><td colSpan="4" className="text-center text-slate-500 py-10">No organizations yet.</td></tr>}</tbody></table></div></section>
  </div>;
}

function Status({ value }) {
  return <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${value === "active" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{value}</span>;
}

function Notice({ children, tone }) {
  return <div className={`p-3 border rounded-md text-sm ${tone === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"}`}>{children}</div>;
}
