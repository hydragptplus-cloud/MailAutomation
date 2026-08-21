import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../services/api";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const [listResponse, countResponse] = await Promise.all([
        api.get("/notifications/", { params: { page_size: 8 } }),
        api.get("/notifications/unread-count/"),
      ]);
      setNotifications(listResponse.data.results || listResponse.data || []);
      setUnreadCount(countResponse.data.count || 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleClick(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markAllRead() {
    await api.post("/notifications/mark-all-read/");
    await load();
  }

  async function markRead(notification) {
    if (!notification.is_read) {
      await api.post(`/notifications/${notification.id}/read/`);
      await load();
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) load();
        }}
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-700/70 bg-slate-800/60 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-slate-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/40">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-100">Notifications</p>
              <p className="text-xs text-slate-500">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              disabled={unreadCount === 0}
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="py-8 text-center text-sm text-slate-500">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</div>
            )}
            {!loading && notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => markRead(notification)}
                className="block w-full border-b border-slate-800 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-800/70"
              >
                <div className="flex gap-3">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.is_read ? "bg-slate-600" : "bg-indigo-400"}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-100">{notification.title}</span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-400">{notification.body}</span>
                    <span className="mt-2 block text-[11px] uppercase tracking-wide text-slate-600">
                      {notification.type} · {formatTime(notification.created_at)}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-800 px-4 py-3 text-center text-sm font-semibold text-indigo-300 hover:bg-indigo-500/10"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function formatTime(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hour${Math.floor(diff / hour) === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}
