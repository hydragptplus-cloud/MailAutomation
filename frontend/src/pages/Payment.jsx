import { useCallback, useEffect, useState } from "react";
import { Link, useBeforeUnload, useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { apiError, cancelInvoice, exchangeInvoiceCode, getCurrentInvoice, getInvoice, recoverInvoice, replaceInvoice, verifyInvoice } from "../services/billingApi";

const labels = { bsc: "BNB Smart Chain", ethereum: "Ethereum", tron: "Tron", ton: "TON" };

export default function Payment() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fragmentCode = new URLSearchParams((location.hash || "").replace(/^#/, "")).get("code") || "";
  const [invoice, setInvoice] = useState(null);
  const [transaction, setTransaction] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [copied, setCopied] = useState("");

  const shouldBlock = Boolean(invoice && ["pending", "verifying"].includes(invoice.status) && action !== "cancel");
  const blocker = useBlocker(({ currentLocation, nextLocation }) => shouldBlock && currentLocation.pathname !== nextLocation.pathname);
  useBeforeUnload(useCallback((event) => { if (shouldBlock) event.preventDefault(); }, [shouldBlock]));

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const value = invoiceId === "current" ? await getCurrentInvoice() : await getInvoice(invoiceId);
      setInvoice(value);
    } catch (err) { setError(apiError(err, "This invoice could not be loaded.")); }
    finally { setLoading(false); }
  }, [invoiceId]);

  useEffect(() => {
    async function openSession() {
      if (fragmentCode) {
        try {
          const value = await exchangeInvoiceCode(invoiceId, fragmentCode);
          setInvoice(value);
          navigate(location.pathname, { replace: true });
        } catch (err) {
          setError(apiError(err, "This invoice link is no longer valid."));
        } finally {
          setLoading(false);
        }
      } else {
        try {
          const value = invoiceId === "current" ? await getCurrentInvoice() : await getInvoice(invoiceId);
          setInvoice(value);
        } catch (err) {
          setError(apiError(err, "This invoice could not be loaded."));
        } finally {
          setLoading(false);
        }
      }
    }
    openSession();
  }, [invoiceId]); // Capture emailed one-time codes once, then remove them from browser history.

  async function verify(event) {
    event.preventDefault(); setAction("verify"); setError("");
    try {
      const value = await verifyInvoice(invoice?.id || invoiceId, transaction);
      setInvoice(value);
    } catch (err) { setError(apiError(err)); await load(); } finally { setAction(""); }
  }

  async function recover(event) {
    event.preventDefault(); setAction("recover"); setError("");
    try { setNotice((await recoverInvoice(recoveryEmail)).detail); }
    catch (err) { setError(apiError(err)); } finally { setAction(""); }
  }

  async function replace(event) {
    event.preventDefault(); setAction("replace"); setError("");
    try {
      const value = await replaceInvoice(invoice?.id || invoiceId, password);
      setInvoice(value);
      navigate("/payment/current", { replace: true });
    } catch (err) { setError(apiError(err)); } finally { setAction(""); }
  }

  async function cancel() {
    setAction("cancel"); setError("");
    try { setInvoice(await cancelInvoice(invoice?.id || invoiceId)); navigate("/"); }
    catch (err) { setError(apiError(err)); } finally { setAction(""); }
  }

  const copy = async (value, field) => {
    await navigator.clipboard.writeText(value); setCopied(field); setTimeout(() => setCopied(""), 1500);
  };

  if (loading) return <PageCenter><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /><p>Loading your secure invoice…</p></PageCenter>;
  if (!invoice && error) return <PageCenter><XCircle className="w-12 h-12 text-rose-400" /><h1 className="text-2xl font-black">Invoice access needed</h1><p className="max-w-md text-center">{error || "Use the secure link from your invoice email, or request a new recovery email."}</p><RecoveryForm email={recoveryEmail} setEmail={setRecoveryEmail} submit={recover} busy={action === "recover"} notice={notice} /><Link to="/#pricing" className="text-indigo-300">Back to pricing</Link></PageCenter>;
  if (!invoice) return <PageCenter><AlertTriangle className="w-12 h-12 text-amber-400" /><h1 className="text-2xl font-black">Unable to load invoice</h1><button onClick={() => load()} className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-indigo-500 font-bold"><RefreshCw className="w-4 h-4" /> Retry</button></PageCenter>;
  if (invoice.status === "paid") return <PageCenter><CheckCircle2 className="w-16 h-16 text-emerald-400" /><h1 className="text-3xl font-black">Payment verified</h1><p>Your {invoice.plan.name} workspace is active for the next 30 days.</p><Link to="/login?created=1" className="px-6 py-3 rounded-md bg-emerald-400 text-emerald-950 font-black">Sign in to your account</Link>{invoice.explorer_url && <a href={invoice.explorer_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-slate-500">View transaction <ExternalLink className="w-3 h-3" /></a>}</PageCenter>;
  if (invoice.status === "manual_review") return <PageCenter><Clock3 className="w-14 h-14 text-amber-300" /><h1 className="text-3xl font-black">Payment under review</h1><p className="max-w-lg text-center">We found the transfer after the quote expired. It is recorded for manual review, and we’ll contact you by email.</p>{invoice.explorer_url && <a href={invoice.explorer_url} target="_blank" rel="noreferrer" className="text-indigo-300">View transaction</a>}</PageCenter>;
  if (["cancelled", "replaced"].includes(invoice.status)) return <PageCenter><XCircle className="w-14 h-14 text-slate-500" /><h1 className="text-3xl font-black">Invoice {invoice.status}</h1><Link to={invoice.replaced_by ? `/payment/${invoice.replaced_by}` : "/#pricing"} className="text-indigo-300">Continue</Link></PageCenter>;

  const expired = invoice.status === "expired";
  return <div className="min-h-screen bg-[#070b14] text-slate-100 px-4 py-8 lg:py-14"><div className="max-w-3xl mx-auto">
    <Link to="/#pricing" className="inline-flex items-center gap-2 text-sm text-slate-400"><ArrowLeft className="w-4 h-4" /> Back to pricing</Link>
    <div className="mt-8 border border-white/10 bg-slate-900/65 overflow-hidden shadow-2xl rounded-md">
      <div className="p-7 sm:p-9 border-b border-white/7 flex flex-col sm:flex-row gap-5 sm:items-center justify-between"><div><p className="text-xs text-indigo-300 font-bold uppercase">USDT invoice</p><h1 className="text-3xl font-black mt-2">{invoice.plan.name}</h1><p className="text-sm text-slate-500 mt-1">{labels[invoice.network]} · invoice {invoice.id.slice(0, 8)}</p></div><span className={`flex items-center gap-2 text-sm ${expired ? "text-rose-300" : "text-amber-300"}`}><Clock3 className="w-4 h-4" /> {expired ? "Quote expired" : `Expires ${new Date(invoice.expires_at).toLocaleString()}`}</span></div>
      <div className="p-7 sm:p-9 space-y-7">
        {expired && <div className="border border-amber-400/25 bg-amber-400/5 p-4 rounded-md text-sm text-amber-100">Already sent payment? Paste the transaction below. Transfers made before expiry can still activate automatically; later transfers go to manual review.</div>}
        <div className="border border-indigo-400/20 bg-indigo-500/10 p-6 text-center rounded-md"><p className="text-sm text-indigo-200">Send exactly</p><p className="text-4xl font-black mt-2">{invoice.amount_usdt} <span className="text-lg">USDT</span></p><button onClick={() => copy(invoice.amount_usdt, "amount")} className="mt-3 text-xs text-slate-400 inline-flex gap-2"><Copy className="w-3 h-3" />{copied === "amount" ? "Copied" : "Copy exact amount"}</button></div>
        <div><p className="text-xs font-bold text-slate-400 mb-2">Receiving address</p><div className="bg-slate-950 border border-slate-700 p-4 flex items-center gap-3 rounded-md"><Wallet className="w-5 h-5 text-indigo-400 shrink-0" /><code className="text-xs sm:text-sm break-all flex-1">{invoice.receiving_address}</code><button title="Copy wallet address" onClick={() => copy(invoice.receiving_address, "wallet")}><Copy className="w-4 h-4" /></button></div></div>
        {!expired && <div className="border border-amber-400/20 bg-amber-400/5 p-4 rounded-md text-sm text-amber-100/80"><strong>Important:</strong> send USDT only on {labels[invoice.network]}.</div>}
        <form onSubmit={verify}><label className="text-xs font-bold text-slate-300">Transaction hash or explorer link</label><textarea value={transaction} onChange={(e) => setTransaction(e.target.value)} required rows="3" placeholder="Paste the completed transaction hash or link" className="mt-2 w-full bg-slate-950 border border-slate-700 p-4 rounded-md text-sm outline-none focus:border-indigo-400" />{(error || invoice.verification_error) && <div className="mt-3 text-sm text-rose-300">{error || invoice.verification_error}</div>}<button disabled={Boolean(action)} className="mt-4 w-full py-3.5 rounded-md bg-indigo-500 hover:bg-indigo-400 font-bold disabled:opacity-50 flex justify-center items-center gap-2">{action === "verify" ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking blockchain…</> : "Verify payment"}</button></form>
        {expired && <form onSubmit={replace} className="border-t border-white/10 pt-6"><h2 className="font-bold">Create a fresh quote</h2><p className="text-sm text-slate-500 mt-1">Enter your account password again to securely carry registration into a new invoice.</p><input type="password" minLength="8" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Account password" className="mt-4 w-full bg-slate-950 border border-slate-700 px-4 py-3 rounded-md" /><button disabled={Boolean(action)} className="mt-3 w-full border border-slate-600 py-3 rounded-md font-bold">Create replacement invoice</button></form>}
        <div className="flex gap-3 text-xs text-slate-500"><ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" /><p>Verification checks the official USDT contract, destination, amount, timestamp, confirmations, and one-time use.</p></div>
        {!expired && <button onClick={cancel} disabled={Boolean(action)} className="w-full text-sm text-slate-500 hover:text-rose-300">Cancel invoice</button>}
      </div>
    </div>
  </div>{blocker.state === "blocked" && <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4"><div className="w-full max-w-md bg-slate-900 border border-slate-700 p-6 rounded-md"><h2 className="text-xl font-black">Leave this payment?</h2><p className="text-sm text-slate-400 mt-2">Use the secure link from your email if you need to resume later.</p><div className="flex gap-3 mt-6"><button onClick={() => blocker.reset()} className="flex-1 bg-indigo-500 py-3 rounded-md font-bold">Continue payment</button><button onClick={() => blocker.proceed()} className="flex-1 border border-slate-600 py-3 rounded-md">Leave</button></div></div></div>}</div>;
}

function RecoveryForm({ email, setEmail, submit, busy, notice }) {
  return <form onSubmit={submit} className="w-full max-w-md"><div className="flex gap-2"><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your checkout email" className="min-w-0 flex-1 bg-slate-950 border border-slate-700 px-4 py-3 rounded-md" /><button disabled={busy} className="px-4 bg-indigo-500 rounded-md font-bold">Email link</button></div>{notice && <p className="mt-3 text-sm text-emerald-300">{notice}</p>}</form>;
}

function PageCenter({ children }) {
  return <div className="min-h-screen bg-[#070b14] text-slate-100 grid place-items-center p-5"><div className="max-w-xl w-full text-center flex flex-col items-center gap-5 border border-white/10 bg-slate-900/65 p-8 rounded-md">{children}</div></div>;
}
