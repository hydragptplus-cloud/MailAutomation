import { useEffect, useMemo, useState } from "react";
import { Inbox, MailPlus, RefreshCw, Send, Settings2 } from "lucide-react";
import supportApi from "../services/supportApi";
import CustomSelect from "../components/common/CustomSelect";
import { apiError } from "../utils/apiError";

const ticketFilterOptions = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting" },
  { value: "resolved", label: "Resolved" },
];

const emptyMailbox = {
  name: "",
  email: "",
  imap_host: "mail.annomous.com",
  imap_port: 993,
  imap_encryption: "ssl",
  imap_username: "",
  imap_password: "",
  smtp_host: "mail.annomous.com",
  smtp_port: 465,
  smtp_encryption: "ssl",
  smtp_username: "",
  smtp_password: "",
  from_name: "Mail Flow Support",
  is_active: true,
};

export default function MailWorkspace() {
  const [tickets, setTickets] = useState([]);
  const [mailboxes, setMailboxes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState("");
  const [mailboxId, setMailboxId] = useState("");
  const [mailboxForm, setMailboxForm] = useState(emptyMailbox);
  const [showMailboxForm, setShowMailboxForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState(null);

  const selected = tickets.find((ticket) => ticket.id === selectedId) || tickets[0] || null;
  const visibleTickets = useMemo(
    () => tickets.filter((ticket) => filter === "all" || ticket.status === filter),
    [tickets, filter]
  );

  async function loadTickets(nextMailboxId, role = access?.role) {
    if (!nextMailboxId && role !== "owner") {
      setTickets([]);
      setSelectedId(null);
      return;
    }
    const ticketResponse = await supportApi.getTickets(role === "owner" ? undefined : { mailbox: nextMailboxId });
    const nextTickets = ticketResponse.data.results || ticketResponse.data || [];
    setTickets(nextTickets);
    setSelectedId(nextTickets[0]?.id || null);
  }

  async function load(role = access?.role) {
    const mailboxResponse = await supportApi.getMailboxes();
    const nextMailboxes = mailboxResponse.data.results || mailboxResponse.data || [];
    setMailboxes(nextMailboxes);
    const nextMailboxId = mailboxId || (nextMailboxes[0] ? String(nextMailboxes[0].id) : "");
    setMailboxId(nextMailboxId);
    await loadTickets(nextMailboxId, role);
  }

  async function selectMailbox(id) {
    const nextMailboxId = String(id);
    setMailboxId(nextMailboxId);
    setLoading(true);
    setError("");
    try {
      await loadTickets(nextMailboxId, access?.role);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to load mailbox messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    supportApi
      .workspaceAccess()
      .then((response) => {
        setAccess(response.data);
        if (!response.data.enabled) {
          setError(response.data.plan_available === false ? "Mail workspace is available only on Premium+ and Custom plans." : "Mail workspace is not enabled for this organization.");
          return null;
        }
        return load(response.data.role);
      })
      .catch((requestError) => setError(requestError.response?.data?.detail || "Mail workspace is not available."))
      .finally(() => setLoading(false));
  }, []);

  async function sendReply(event) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    if (access?.role === "owner" && !mailboxId) {
      setError("Add and select a platform support inbox before replying.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await supportApi.reply(selected.id, {
        body: reply.trim(),
        mailbox: mailboxId || null,
      });
      setTickets((prev) => prev.map((ticket) => (ticket.id === selected.id ? response.data : ticket)));
      setReply("");
      setMessage("Reply sent and added to the ticket thread.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to send reply.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await supportApi.setStatus(selected.id, status);
      setTickets((prev) => prev.map((ticket) => (ticket.id === selected.id ? response.data : ticket)));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to update ticket status.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMailbox(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = { ...mailboxForm };
      if (!payload.smtp_password) delete payload.smtp_password;
      await supportApi.createMailbox(payload);
      setMailboxForm(emptyMailbox);
      setShowMailboxForm(false);
      setMessage("Mailbox added to the workspace.");
      await load();
    } catch (requestError) {
      setError(apiError(requestError, "Unable to save mailbox."));
    } finally {
      setBusy(false);
    }
  }

  async function syncMailbox(id) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await supportApi.syncMailbox(id);
      setMessage(`Mailbox synced. Imported ${response.data.imported || 0} message(s).`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Mailbox sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{access?.role === "owner" ? "Platform Support Workspace" : "Mail Workspace"}</h1>
          <p className="mt-1 text-sm text-slate-400">{access?.role === "owner" ? "Manage Help & Support requests and reply from platform support inboxes." : "Read mail and reply from this organization's connected inboxes."}</p>
        </div>
        <button
          onClick={() => setShowMailboxForm((value) => !value)}
          disabled={access?.mail_connection_usage && access.mail_connection_usage.used >= access.mail_connection_usage.limit}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-bold disabled:opacity-60"
          title={access?.mail_connection_usage ? `${access.mail_connection_usage.used}/${access.mail_connection_usage.limit} SMTP + inbox connections used` : "Add mailbox"}
        >
          <MailPlus className="h-4 w-4" /> Add mailbox
        </button>
      </div>

      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {access?.mail_connection_usage && (
        <Notice>
          Mail connections used: {access.mail_connection_usage.used}/{access.mail_connection_usage.limit} SMTP + inboxes.
        </Notice>
      )}

      {showMailboxForm && (
        <form onSubmit={saveMailbox} className="rounded-md border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Settings2 className="h-4 w-4 text-indigo-300" /> Mailbox details
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["name", "Name"],
              ["email", "Email"],
              ["from_name", "From name"],
              ["imap_host", "IMAP host"],
              ["imap_port", "IMAP port", "number"],
              ["imap_username", "IMAP username"],
              ["imap_password", "IMAP password", "password"],
              ["smtp_host", "SMTP host"],
              ["smtp_port", "SMTP port", "number"],
              ["smtp_username", "SMTP username"],
              ["smtp_password", "SMTP password", "password"],
            ].map(([key, label, type = "text"]) => (
              <label key={key} className="text-xs font-semibold text-slate-400">
                {label}
                <input
                  type={type}
                  required={!["smtp_password"].includes(key)}
                  value={mailboxForm[key]}
                  onChange={(event) => setMailboxForm({ ...mailboxForm, [key]: type === "number" ? Number(event.target.value) : event.target.value })}
                  className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowMailboxForm(false)} className="rounded-md border border-slate-700 px-4 py-2 text-sm">Cancel</button>
            <button disabled={busy} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold disabled:opacity-60">Save mailbox</button>
          </div>
        </form>
      )}

      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[360px_1fr_280px]">
        <section className="rounded-md border border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between border-b border-slate-800 p-4">
            <div className="flex items-center gap-2 font-semibold text-slate-100">
              <Inbox className="h-4 w-4 text-indigo-300" /> Tickets
            </div>
            <CustomSelect
              value={filter}
              onChange={setFilter}
              options={ticketFilterOptions}
              ariaLabel="Filter tickets by status"
              size="sm"
              className="w-32 bg-slate-950"
            />
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {visibleTickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => setSelectedId(ticket.id)}
                className={`block w-full border-b border-slate-800 p-4 text-left hover:bg-slate-800/60 ${selected?.id === ticket.id ? "bg-indigo-500/10" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-100">{ticket.subject}</p>
                  <Status value={ticket.status} />
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">{ticket.name} · {ticket.email}</p>
                <p className="mt-2 text-[11px] text-slate-500">{ticket.ticket_number}</p>
              </button>
            ))}
            {!loading && visibleTickets.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No tickets found.</p>}
            {loading && <p className="p-8 text-center text-sm text-slate-500">Loading tickets...</p>}
          </div>
        </section>

        <section className="flex min-h-[680px] flex-col rounded-md border border-slate-800 bg-slate-900/50">
          {selected ? (
            <>
              <div className="border-b border-slate-800 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-indigo-300">{selected.ticket_number}</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-100">{selected.subject}</h2>
                    <p className="mt-1 text-sm text-slate-400">{selected.name} · {selected.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["open", "waiting", "resolved", "closed"].map((status) => (
                      <button key={status} onClick={() => setStatus(status)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800">
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {(selected.messages || []).map((entry) => (
                  <div key={entry.id} className={`flex ${entry.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-md px-4 py-3 ${entry.direction === "outbound" ? "bg-indigo-600 text-white" : "border border-slate-800 bg-slate-950/70 text-slate-200"}`}>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">{entry.body}</p>
                      <p className={`mt-2 text-[11px] ${entry.direction === "outbound" ? "text-indigo-100" : "text-slate-500"}`}>
                        {entry.sender_name || entry.sender_email} · {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={sendReply} className="border-t border-slate-800 p-4">
                <p className="mb-3 text-xs text-slate-400">Replying from {mailboxes.find((item) => String(item.id) === mailboxId)?.email}</p>
                <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={5} className="w-full resize-y rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                <button disabled={busy || !reply.trim() || (access?.role === "owner" && !mailboxId)} className="mt-3 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold disabled:opacity-60">
                  <Send className="h-4 w-4" /> Send reply
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-slate-500">Select a ticket to open the thread.</div>
          )}
        </section>

        <section className="rounded-md border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 p-4">
            <h2 className="font-semibold text-slate-100">{access?.role === "owner" ? "Support inboxes" : "Mailboxes"}</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {mailboxes.map((mailbox) => (
              <div key={mailbox.id} className={`p-2 ${String(mailbox.id) === mailboxId ? "bg-indigo-500/10" : ""}`}>
                <button onClick={() => selectMailbox(mailbox.id)} className="w-full rounded-md p-2 text-left hover:bg-slate-800/60">
                  <p className="font-medium text-slate-100">{mailbox.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{mailbox.email}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{mailbox.last_synced_at ? `Synced ${new Date(mailbox.last_synced_at).toLocaleString()}` : "Not synced yet"}</p>
                </button>
                {mailbox.last_error && <p className="mt-2 text-xs text-rose-300">{mailbox.last_error}</p>}
                <button disabled={busy} onClick={() => syncMailbox(mailbox.id)} className="mx-2 mb-2 mt-1 inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-60">
                  <RefreshCw className="h-3.5 w-3.5" /> Sync
                </button>
              </div>
            ))}
            {mailboxes.length === 0 && <p className="p-5 text-sm text-slate-500">No mailboxes connected.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Status({ value }) {
  const tone = value === "new" ? "text-emerald-300 bg-emerald-500/10" : value === "resolved" ? "text-slate-300 bg-slate-700/60" : "text-amber-300 bg-amber-500/10";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{value}</span>;
}

function Notice({ children, error }) {
  return <div className={`rounded-md border p-3 text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"}`}>{children}</div>;
}
