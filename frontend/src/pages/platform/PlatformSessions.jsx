import { useEffect, useMemo, useState } from "react";
import { LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import api from "../../services/api";
import SearchInput from "../../components/common/SearchInput";

export default function PlatformSessions() {
  const [sessions, setSessions] = useState([]);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = () => { setLoading(true); return api.get("/sessions/").then((response) => setSessions(response.data.results || response.data)).catch((requestError) => setError(requestError.response?.data?.detail || "Unable to load sessions.")).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => sessions.filter((session) => {
    const matchesStatus = filter === "all" || (filter === "active" ? !session.revoked_at : Boolean(session.revoked_at));
    const needle = search.toLowerCase();
    return matchesStatus && `${session.username} ${session.ip_address || ""}`.toLowerCase().includes(needle);
  }), [sessions, filter, search]);

  async function revoke(session) {
    if (!window.confirm(`Force ${session.username} to sign out?`)) return;
    try { await api.post(`/sessions/${session.id}/revoke/`); setMessage(`${session.username} was signed out.`); await load(); }
    catch (requestError) { setError(requestError.response?.data?.detail || "Unable to revoke this session."); }
  }

  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Sessions & Security</h2><p className="text-sm text-slate-500 mt-1">Review active access and revoke sessions that should no longer be trusted.</p></div><button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-slate-700 text-sm text-slate-300 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button></div>
    {message && <Notice>{message}</Notice>}{error && <Notice error>{error}</Notice>}
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="inline-flex self-start p-1 bg-slate-900 border border-slate-800 rounded-md">
        {[["active", "Active"], ["revoked", "Revoked"], ["all", "All"]].map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} className={`px-3 py-1.5 rounded text-xs font-medium ${filter === value ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search user or IP address..."
        className="md:w-80"
      />
    </div>
    <div className="overflow-x-auto border border-slate-800 rounded-md"><table><thead><tr><th>User</th><th>IP address</th><th>Created</th><th>Last seen</th><th>Status</th><th className="text-right">Action</th></tr></thead><tbody>{filtered.map((session) => <tr key={session.id}><td className="font-medium text-slate-200">{session.username}</td><td className="font-mono text-xs">{session.ip_address || "-"}</td><td>{new Date(session.created_at).toLocaleString()}</td><td>{new Date(session.last_seen_at).toLocaleString()}</td><td><span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${session.revoked_at ? "bg-slate-700/50 text-slate-400" : "bg-emerald-400/10 text-emerald-300"}`}><span className={`w-1.5 h-1.5 rounded-full ${session.revoked_at ? "bg-slate-500" : "bg-emerald-400"}`} />{session.revoked_at ? "Revoked" : "Active"}</span></td><td className="text-right">{!session.revoked_at && <button title="Force logout" aria-label={`Force ${session.username} to log out`} onClick={() => revoke(session)} className="inline-flex p-2 rounded text-rose-300 hover:bg-rose-500/10"><LogOut className="w-4 h-4" /></button>}</td></tr>)}{!loading && filtered.length === 0 && <tr><td colSpan="6" className="py-12 text-center text-slate-500"><ShieldCheck className="w-6 h-6 mx-auto mb-2" />No sessions match this view.</td></tr>}{loading && <tr><td colSpan="6" className="py-12 text-center text-slate-500">Loading sessions…</td></tr>}</tbody></table></div>
    <p className="text-xs text-slate-600">Showing {filtered.length} of {sessions.length} recorded sessions</p>
  </div>;
}

function Notice({ children, error }) { return <div className={`p-3 border rounded-md text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{children}</div>; }
