import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { apiError, createFreeAccount, createInvoice, getPlans, startCheckoutEmail, verifyCheckoutEmail } from "../services/billingApi";

const networks = [
  ["bsc", "BNB Smart Chain", "Low network fees"],
  ["tron", "Tron", "Popular USDT network"],
  ["ton", "TON", "Fast Jetton transfer"],
  ["ethereum", "Ethereum", "Higher network fees"],
];

export default function Subscribe() {
  const { planSlug } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", organization_name: "", password: "", network: "bsc" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const turnstileRef = useRef(null);

  useEffect(() => { getPlans().then((items) => setPlan(items.find((item) => item.slug === planSlug))).catch(() => setError("Unable to load this plan.")); }, [planSlug]);
  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey || !turnstileRef.current) return undefined;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          action: "checkout",
          callback: (token) => setTurnstileToken(token),
        });
      }
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, []);
  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    if (event.target.name === "email") {
      setOtpSent(false);
      setEmailVerified(false);
      setOtpCode("");
    }
  };

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      if (plan.is_free) {
        await createFreeAccount(form);
        navigate("/login?created=1");
      } else {
        if (!emailVerified) {
          if (!otpSent) {
            await startCheckoutEmail(form.email, turnstileToken);
            setOtpSent(true);
            return;
          }
          await verifyCheckoutEmail(form.email, otpCode);
          setEmailVerified(true);
          return;
        }
        await createInvoice({ ...form, plan_slug: plan.slug, idempotency_key: idempotencyKey });
        navigate("/payment/current");
      }
    } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }

  return <div className="min-h-screen bg-[#070b14] text-slate-100 px-4 py-8 lg:py-14">
    <div className="max-w-5xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Back to pricing</Link>
      <div className="mt-8 grid lg:grid-cols-[.8fr_1.2fr] rounded-3xl overflow-hidden border border-white/10 bg-slate-900/65 shadow-2xl">
        <aside className="p-8 lg:p-10 bg-gradient-to-br from-indigo-950/70 to-slate-950">
          <span className="w-11 h-11 rounded-2xl bg-indigo-500 grid place-items-center"><Mail className="w-5 h-5" /></span>
          <p className="text-indigo-300 text-xs font-bold uppercase tracking-[.16em] mt-10">Selected plan</p>
          <h1 className="text-4xl font-black mt-2">{plan?.name || "Loading…"}</h1>
          {plan && <><p className="text-2xl font-bold mt-5">{plan.is_free ? "Free" : `৳${plan.price_bdt.toLocaleString()}`} <span className="text-sm text-slate-500 font-normal">/ 30 days</span></p><ul className="mt-8 space-y-4 text-sm text-slate-300">{[
            `${plan.email_limit.toLocaleString()} emails per cycle`,
            plan.weekly_email_limit ? `${plan.weekly_email_limit.toLocaleString()} weekly cap` : plan.daily_email_limit ? `${plan.daily_email_limit.toLocaleString()} daily cap` : "30-day quota reset",
            `${plan.max_admins} admin + ${plan.max_users} users`, `${plan.max_smtp_accounts} SMTP accounts`,
          ].map((item) => <li key={item} className="flex gap-3"><Check className="w-4 h-4 text-emerald-400" />{item}</li>)}</ul></>}
          <div className="mt-10 pt-8 border-t border-white/10 flex gap-3 text-xs text-slate-500"><ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" /><p>Paid accounts activate only after the USDT transfer is independently verified on-chain.</p></div>
        </aside>
        <section className="p-7 sm:p-10">
          <h2 className="text-2xl font-black">Create your workspace</h2><p className="text-sm text-slate-500 mt-2">The first account becomes your organization administrator.</p>
          {error && <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}
          <form onSubmit={submit} className="mt-7 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4"><Field label="Your name" name="name" value={form.name} onChange={update} /><Field label="Work email" name="email" type="email" value={form.email} onChange={update} /></div>
            <Field label="Organization name" name="organization_name" value={form.organization_name} onChange={update} />
            <Field label="Password" name="password" type="password" value={form.password} onChange={update} minLength="8" />
            {plan && !plan.is_free && <div><label className="text-xs font-bold text-slate-300">USDT network</label><div className="grid sm:grid-cols-2 gap-3 mt-2">{networks.map(([value,label,note]) => <label key={value} className={`p-4 rounded-xl border cursor-pointer ${form.network === value ? "border-indigo-400 bg-indigo-500/10" : "border-slate-700 bg-slate-950/50"}`}><input className="sr-only" type="radio" name="network" value={value} checked={form.network === value} onChange={update} /><strong className="block text-sm">{label}</strong><span className="text-xs text-slate-500">{note}</span></label>)}</div></div>}
            {plan && !plan.is_free && !emailVerified && <div className="space-y-3">{otpSent ? <Field label="Email verification code" name="otp_code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} inputMode="numeric" maxLength="6" /> : <div ref={turnstileRef} />}</div>}
            <button disabled={!plan || loading} className="w-full py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 font-bold disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : plan?.is_free ? "Create free account" : !emailVerified ? otpSent ? "Verify email" : "Email verification code" : "Create USDT invoice"}</button>
            <p className="flex justify-center items-center gap-2 text-[11px] text-slate-600"><LockKeyhole className="w-3 h-3" /> Passwords are securely hashed. We never request wallet keys.</p>
          </form>
        </section>
      </div>
    </div>
  </div>;
}

function Field({ label, ...props }) { return <label className="block"><span className="text-xs font-bold text-slate-300">{label}</span><input required {...props} className="mt-2 w-full rounded-xl bg-slate-950/70 border border-slate-700 px-4 py-3 text-sm outline-none focus:border-indigo-400" /></label>; }
