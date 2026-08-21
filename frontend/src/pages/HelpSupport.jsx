import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, LifeBuoy, Mail, Send } from "lucide-react";
import supportApi from "../services/supportApi";
import { isAuthenticated, getUser } from "../utils/auth";

const emptyForm = { name: "", email: "", subject: "", message: "" };

export default function HelpSupport() {
  const auth = isAuthenticated();
  const user = getUser();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    name: user?.username || "",
    email: user?.email || "",
    subject: searchParams.get("subject") || "",
    message: searchParams.get("message") || "",
  }));
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) return;
    supportApi
      .getTickets()
      .then((response) => setTickets(response.data.results || response.data || []))
      .catch(() => setTickets([]));
  }, [auth]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    setError("");
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      };
      const response = auth
        ? await supportApi.createTicket({ subject: payload.subject, message: payload.message })
        : await supportApi.createPublicTicket(payload);
      const ticketNumber = response.data.ticket_number || response.data.ticket_number || response.data.ticketNumber;
      setNotice(ticketNumber ? `Message sent. Ticket ${ticketNumber} has been created.` : "Message sent to Mail Flow support.");
      setForm({ ...emptyForm, name: user?.username || "", email: user?.email || "" });
      if (auth) {
        const ticketsResponse = await supportApi.getTickets();
        setTickets(ticketsResponse.data.results || ticketsResponse.data || []);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to send your support request.");
    } finally {
      setLoading(false);
    }
  }

  const update = (event) => setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));

  return (
    <main className={auth ? "space-y-6" : "min-h-screen bg-slate-950 text-slate-100"}>
      {!auth && (
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Mail Flow
          </Link>
          <Link to="/login" className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900">
            Login
          </Link>
        </header>
      )}

      <section className={auth ? "space-y-6" : "mx-auto grid max-w-5xl gap-8 px-6 pb-14 pt-6 lg:grid-cols-[0.9fr_1.1fr]"}>
        <div className={auth ? "" : "pt-8"}>
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-300">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-100">{auth ? "Help & Support" : "Contact Mail Flow support"}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Send account, billing, or deliverability questions to the Mail Flow team. Replies will come from the support workspace.
          </p>
          <div className="mt-6 rounded-md border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-slate-100">
              <Mail className="h-4 w-4 text-indigo-300" /> support@annomous.com
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Visitor messages are delivered to the admin support inbox and saved as support tickets.</p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-md border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20">
          {notice && <Notice><CheckCircle2 className="h-4 w-4" /> {notice}</Notice>}
          {error && <Notice error>{error}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" value={form.name} onChange={update} disabled={auth} required />
            <Field label="Email" type="email" name="email" value={form.email} onChange={update} disabled={auth} required />
          </div>
          <Field label="Subject" name="subject" value={form.subject} onChange={update} required className="mt-4" />
          <label className="mt-4 block text-xs font-semibold text-slate-400">
            Message
            <textarea
              name="message"
              required
              rows={8}
              value={form.message}
              onChange={update}
              className="mt-2 w-full resize-y rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>
          <button disabled={loading} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60">
            <Send className="h-4 w-4" /> {loading ? "Sending..." : "Send support request"}
          </button>
        </form>
      </section>

      {auth && tickets.length > 0 && (
        <section className="rounded-md border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 p-4">
            <h2 className="font-semibold text-slate-100">Your recent tickets</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {tickets.slice(0, 5).map((ticket) => (
              <div key={ticket.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-200">{ticket.subject}</p>
                  <p className="text-xs text-slate-500">{ticket.ticket_number} · {ticket.status}</p>
                </div>
                <span className="text-xs text-slate-500">{new Date(ticket.last_message_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Field({ label, className = "", ...props }) {
  return (
    <label className={`block text-xs font-semibold text-slate-400 ${className}`}>
      {label}
      <input
        {...props}
        className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 disabled:opacity-70"
      />
    </label>
  );
}

function Notice({ children, error }) {
  return (
    <div className={`mb-4 flex items-center gap-2 rounded-md border p-3 text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
      {children}
    </div>
  );
}
