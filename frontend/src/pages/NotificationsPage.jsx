import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import api from "../services/api";

const filters = [
  ["", "All"],
  ["unread", "Unread"],
  ["broadcast", "Broadcasts"],
  ["billing", "Billing"],
  ["support", "Support"],
  ["system", "System"],
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  async function load() {
    setLoading(true);
    setError("");
    const params = {};
    if (filter === "unread") params.unread = true;
    if (filter && filter !== "unread") params.type = filter;
    try {
      const response = await api.get("/notifications/", { params });
      setNotifications(response.data.results || response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function markRead(notification) {
    if (!notification.is_read) {
      const response = await api.post(`/notifications/${notification.id}/read/`);
      setNotifications((items) => items.map((item) => item.id === notification.id ? response.data : item));
      setSelected(response.data);
    } else {
      setSelected(notification);
    }
  }

  async function markAllRead() {
    const response = await api.post("/notifications/mark-all-read/");
    setMessage(`${response.data.updated || 0} notification${response.data.updated === 1 ? "" : "s"} marked read.`);
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-300" />
            <h1 className="text-2xl font-bold text-slate-100">Notifications</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">Read platform broadcasts and future Mail Flow alerts.</p>
        </div>
        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={markAllRead}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          <CheckCheck className="h-4 w-4" /> Mark all as read
        </button>
      </div>

      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}

      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              filter === value
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-200"
                : "border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading && <div className="py-16 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading notifications...</div>}
        {!loading && notifications.length === 0 && <div className="rounded-xl border border-slate-800 py-16 text-center text-sm text-slate-500">No notifications found.</div>}
        {!loading && notifications.map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => markRead(notification)}
            className="block w-full rounded-xl border border-slate-800 bg-slate-950/35 p-4 text-left transition-colors hover:border-slate-700 hover:bg-slate-900/70"
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${notification.is_read ? "bg-slate-600" : "bg-indigo-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <strong className="text-base text-slate-100">{notification.title}</strong>
                  <span className="w-fit rounded-full border border-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-400">{notification.type}</span>
                </span>
                <span className="mt-2 line-clamp-2 block text-sm leading-6 text-slate-400">{notification.body}</span>
                <span className="mt-3 block text-xs text-slate-600">{new Date(notification.created_at).toLocaleString()}</span>
              </span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="border-b border-slate-800 p-5">
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-300">
                {selected.type}
              </span>
              <h2 className="mt-3 text-xl font-bold text-slate-100">{selected.title}</h2>
              <p className="mt-1 text-xs text-slate-500">{new Date(selected.created_at).toLocaleString()}</p>
            </div>
            <div className="whitespace-pre-wrap p-5 text-sm leading-7 text-slate-300">{selected.body}</div>
            <div className="flex justify-end border-t border-slate-800 p-4">
              <button type="button" onClick={() => setSelected(null)} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ children, error }) {
  return (
    <div className={`rounded-md border p-3 text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
      {children}
    </div>
  );
}
