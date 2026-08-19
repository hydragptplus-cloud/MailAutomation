import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, BarChart3, Check, ChevronRight, Gauge, Layers3, Mail,
  Menu, ServerCog, ShieldCheck, Sparkles, Users, X, Zap,
} from "lucide-react";
import { apiError, getPlans, recoverInvoice } from "../services/billingApi";

const format = (value) => new Intl.NumberFormat("en-US").format(value);

export default function Landing() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => setError("Pricing is temporarily unavailable. Please refresh shortly."));
  }, []);

  async function recover(event) {
    event.preventDefault(); setRecovering(true); setRecoveryNotice("");
    try { setRecoveryNotice((await recoverInvoice(recoveryEmail)).detail); }
    catch (err) { setRecoveryNotice(apiError(err)); } finally { setRecovering(false); }
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-70" style={{ background: "radial-gradient(circle at 15% 10%, rgba(79,70,229,.22), transparent 32%), radial-gradient(circle at 86% 24%, rgba(14,165,233,.13), transparent 28%)" }} />
      <header className="relative z-20 border-b border-white/5 bg-[#070b14]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-20 px-5 lg:px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 grid place-items-center shadow-lg shadow-indigo-500/20"><Mail className="w-5 h-5" /></span>
            <span><strong className="block tracking-tight">Mail Flow</strong><small className="text-slate-500">Delivery cloud</small></span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#security" className="hover:text-white">Security</a>
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="px-4 py-2 text-sm text-slate-300 hover:text-white">Sign in</Link>
            <a href="#pricing" className="px-5 py-2.5 rounded-xl bg-white text-slate-950 text-sm font-bold hover:bg-indigo-100">Start sending</a>
          </div>
          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button>
        </div>
        {mobileOpen && <div className="md:hidden px-5 pb-5 flex flex-col gap-4 text-slate-300"><a href="#features">Features</a><a href="#pricing">Pricing</a><Link to="/login">Sign in</Link></div>}
      </header>

      <main className="relative z-10">
        <section className="max-w-7xl mx-auto px-5 lg:px-8 pt-20 pb-24 lg:pt-28 lg:pb-32 grid lg:grid-cols-[1.08fr_.92fr] gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-400/20 bg-indigo-400/10 text-indigo-300 text-xs font-semibold mb-7"><Sparkles className="w-3.5 h-3.5" /> Campaign infrastructure without enterprise friction</div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-.045em] leading-[.98]">Send with confidence.<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-cyan-300">Scale without chaos.</span></h1>
            <p className="mt-7 text-lg text-slate-400 leading-8 max-w-2xl">One workspace for SMTP routing, campaign automation, recipient management, delivery tracking, and team access—with limits that stay predictable.</p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <a href="#pricing" className="inline-flex justify-center items-center px-6 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 font-bold shadow-xl shadow-indigo-700/25">
                <span className="inline-flex items-center gap-1.5">Choose your plan <ArrowRight className="w-4 h-4 shrink-0 translate-y-px" strokeWidth={2.25} /></span>
              </a>
              <Link to="/login" className="inline-flex justify-center items-center gap-2 px-6 py-3.5 rounded-xl border border-slate-700 bg-slate-900/60 hover:border-slate-500 font-semibold">Open dashboard</Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500"><span className="flex gap-2"><Check className="w-4 h-4 text-emerald-400" /> Free 30-day allowance</span><span className="flex gap-2"><Check className="w-4 h-4 text-emerald-400" /> No card required</span><span className="flex gap-2"><Check className="w-4 h-4 text-emerald-400" /> Direct USDT payment</span></div>
          </div>

          <div className="relative">
            <div className="absolute -inset-10 bg-indigo-500/10 blur-3xl rounded-full" />
            <div className="relative rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-5 border-b border-white/5"><div><p className="text-xs text-slate-500">Campaign pulse</p><h3 className="font-bold mt-1">August dispatch</h3></div><span className="px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs">Live</span></div>
              <div className="grid grid-cols-3 gap-3 my-5">{[["29.4K","Delivered"],["97.8%","Success"],["842","Queued"]].map(([v,l]) => <div key={l} className="rounded-2xl bg-slate-950/70 border border-white/5 p-4"><strong className="block text-xl">{v}</strong><span className="text-[11px] text-slate-500">{l}</span></div>)}</div>
              <div className="h-44 flex items-end gap-2 px-2 pb-2">{[35,48,42,68,55,83,72,91,78,96,88,100].map((height, i) => <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-indigo-600/40 to-cyan-300" style={{ height: `${height}%`, opacity: .45 + i * .04 }} />)}</div>
              <div className="mt-4 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-400/15 flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-indigo-500/20 grid place-items-center"><Zap className="w-4 h-4 text-indigo-300" /></span><div><p className="text-sm font-semibold">SMTP routing is healthy</p><p className="text-xs text-slate-500">5 active routes · 0 delivery incidents</p></div></div>
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-white/5 bg-slate-950/35">
          <div className="max-w-7xl mx-auto px-5 lg:px-8 py-24">
            <div className="max-w-2xl"><p className="text-indigo-400 text-sm font-bold uppercase tracking-[.18em]">Built for real operations</p><h2 className="text-3xl sm:text-4xl font-black mt-3 tracking-tight">Everything between compose and delivered.</h2></div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
              {[
                [ServerCog,"Multi-SMTP routing","Organize multiple sending accounts and monitor each connection."],
                [Layers3,"Campaign workflows","Create, schedule, launch, and audit campaigns from one place."],
                [Users,"Recipient intelligence","Import, segment, and maintain clean audience lists."],
                [BarChart3,"Delivery reporting","Track sent, failed, pending, and campaign-level outcomes."],
                [ShieldCheck,"Tenant isolation","Keep every customer, credential, list, and campaign separated."],
                [Gauge,"Quota controls","Understand daily, weekly, and 30-day capacity before you send."],
              ].map(([Icon,title,copy]) => <article key={title} className="p-6 rounded-2xl border border-white/7 bg-slate-900/55 hover:bg-slate-900 transition"><span className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-300 grid place-items-center"><Icon className="w-5 h-5" /></span><h3 className="font-bold mt-5">{title}</h3><p className="text-sm text-slate-500 leading-6 mt-2">{copy}</p></article>)}
            </div>
          </div>
        </section>

        <section id="pricing" className="max-w-7xl mx-auto px-5 lg:px-8 py-24">
          <div className="text-center max-w-2xl mx-auto"><p className="text-indigo-400 text-sm font-bold uppercase tracking-[.18em]">Simple pricing</p><h2 className="text-4xl font-black mt-3">A clear limit for every stage.</h2><p className="text-slate-500 mt-4">Every allowance renews on your own 30-day subscription cycle.</p></div>
          {error && <div className="mt-8 text-center text-rose-300">{error}</div>}
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-12">
            {plans.map((plan) => {
              const featured = plan.slug === "premium";
              return <article key={plan.slug} className={`relative rounded-3xl p-6 border flex flex-col ${featured ? "border-indigo-400/50 bg-indigo-500/10 shadow-2xl shadow-indigo-950" : "border-white/8 bg-slate-900/55"}`}>
                {featured && <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-indigo-400 text-indigo-950 text-[11px] font-black uppercase">Most popular</span>}
                <h3 className="text-xl font-black">{plan.name}</h3>
                <div className="mt-5"><strong className="text-4xl font-black">{plan.is_free ? "Free" : `৳${format(plan.price_bdt)}`}</strong>{!plan.is_free && <span className="text-slate-500 text-sm"> / 30 days</span>}</div>
                <p className="text-sm text-slate-400 mt-5 pb-5 border-b border-white/7"><strong className="text-white">{format(plan.email_limit)}</strong> emails every 30 days</p>
                <ul className="space-y-3 mt-5 text-sm text-slate-400 flex-1">
                  <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> {plan.daily_email_limit ? `${format(plan.daily_email_limit)} emails daily` : plan.weekly_email_limit ? `${format(plan.weekly_email_limit)} emails weekly` : "30-day allowance"}</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> {plan.max_admins} admin{plan.max_admins > 1 ? "s" : ""} + {plan.max_users} user{plan.max_users > 1 ? "s" : ""}</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> {plan.max_smtp_accounts} SMTP account{plan.max_smtp_accounts > 1 ? "s" : ""}</li>
                </ul>
                <button onClick={() => navigate(`/subscribe/${plan.slug}`)} className={`mt-7 w-full rounded-xl py-3 font-bold flex items-center justify-center gap-2 ${featured ? "bg-indigo-500 hover:bg-indigo-400" : "bg-white/7 hover:bg-white/12"}`}>{plan.is_free ? "Create free account" : "Pay with USDT"}<ChevronRight className="w-4 h-4" /></button>
              </article>;
            })}
          </div>
        </section>

        <section id="security" className="max-w-5xl mx-auto px-5 pb-24 space-y-5"><div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-8 md:p-10 flex flex-col md:flex-row gap-6 items-start"><span className="w-14 h-14 rounded-2xl bg-emerald-400/10 grid place-items-center shrink-0"><ShieldCheck className="w-7 h-7 text-emerald-300" /></span><div><h2 className="text-2xl font-black">Payment verified directly on-chain.</h2><p className="text-slate-400 leading-7 mt-3">We verify the approved USDT contract, destination wallet, exact invoice amount, transaction status, network confirmation, and one-time use before activating an account. Wallet private keys are never requested or stored.</p></div></div><div className="border border-white/10 bg-slate-900/60 p-6 rounded-md"><h2 className="text-xl font-black">Find my invoice</h2><p className="text-sm text-slate-500 mt-1">We’ll email a secure link when an active invoice exists.</p><form onSubmit={recover} className="mt-4 flex flex-col sm:flex-row gap-2"><input type="email" required value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="Checkout email" className="min-w-0 flex-1 bg-slate-950 border border-slate-700 px-4 py-3 rounded-md" /><button disabled={recovering} className="bg-indigo-500 px-5 py-3 rounded-md font-bold">{recovering ? "Sending…" : "Email secure link"}</button></form>{recoveryNotice && <p className="text-sm text-emerald-300 mt-3">{recoveryNotice}</p>}</div></section>
      </main>
      <footer className="relative z-10 border-t border-white/5"><div className="max-w-7xl mx-auto px-5 lg:px-8 py-8 flex flex-col sm:flex-row justify-between gap-3 text-xs text-slate-600"><span>© 2026 Mail Flow</span><span>Reliable infrastructure for responsible email delivery.</span></div></footer>
    </div>
  );
}
