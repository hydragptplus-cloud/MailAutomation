import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, LockKeyhole, Mail, ShieldCheck, X } from "lucide-react";
import { apiError, createCustomInvoice, createInvoice, getPlans, startCheckoutEmail, verifyCheckoutEmail } from "../services/billingApi";

const networks = [
  ["bsc", "BNB Smart Chain", "Low network fees"], ["tron", "Tron", "Popular USDT network"],
  ["ton", "TON", "Fast Jetton transfer"], ["ethereum", "Ethereum", "Higher network fees"],
];

const format = (value) => new Intl.NumberFormat("en-US").format(value || 0);

function applyDiscount(originalPrice, discountPercent) {
  const discount = Math.min(Math.max(Number(discountPercent || 0), 0), 100);
  return Math.round(Number(originalPrice || 0) * (1 - discount / 100));
}

function paramNumber(searchParams, key, fallback) {
  const value = Number(searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function customLimitsFromParams(searchParams, premiumPlusPlan) {
  const baseEmails = Number(premiumPlusPlan?.email_limit || 150000);
  const baseAdmins = Number(premiumPlusPlan?.max_admins || 5);
  const baseUsers = Number(premiumPlusPlan?.max_users || 50);
  const baseConnections = Number(premiumPlusPlan?.max_smtp_accounts || 10);
  const baseRecipients = Number(premiumPlusPlan?.max_recipients || 10000);
  return {
    email_limit: Math.min(Math.max(paramNumber(searchParams, "emails", 300000), baseEmails), 1000000),
    max_admins: Math.min(Math.max(paramNumber(searchParams, "admins", 8), baseAdmins), 25),
    max_users: Math.min(Math.max(paramNumber(searchParams, "users", 80), baseUsers), 250),
    max_smtp_accounts: Math.min(Math.max(paramNumber(searchParams, "connections", 15), baseConnections), 40),
    max_recipients: Math.min(Math.max(paramNumber(searchParams, "recipients", 50000), baseRecipients), 200000),
  };
}

function customPreview(customPlan, premiumPlusPlan, limits) {
  const premiumWasPrice = Number(premiumPlusPlan?.original_price_bdt || 0);
  const premiumPayablePrice = Number(premiumPlusPlan?.price_bdt || premiumWasPrice || 0);
  const premiumHasDiscount = Number(premiumPlusPlan?.discount_percent || 0) > 0 && premiumWasPrice > premiumPayablePrice;
  const basePrice = premiumHasDiscount ? premiumWasPrice : premiumPayablePrice;
  const extraPrice =
    Math.max(0, Math.ceil((limits.email_limit - Number(premiumPlusPlan?.email_limit || 150000)) / 10000)) * 120 +
    Math.max(0, limits.max_admins - Number(premiumPlusPlan?.max_admins || 5)) * 150 +
    Math.max(0, limits.max_users - Number(premiumPlusPlan?.max_users || 50)) * 20 +
    Math.max(0, limits.max_smtp_accounts - Number(premiumPlusPlan?.max_smtp_accounts || 10)) * 300 +
    Math.max(0, Math.ceil((limits.max_recipients - Number(premiumPlusPlan?.max_recipients || 10000)) / 10000)) * 100;
  const originalPrice = basePrice + extraPrice;
  const discountPercent = Number(customPlan?.discount_percent || 0);
  const payablePrice = applyDiscount(originalPrice, discountPercent);
  return {
    basePrice,
    extraPrice,
    originalPrice,
    discountPercent,
    discountAmount: Math.max(0, originalPrice - payablePrice),
    payablePrice,
  };
}

export default function Subscribe() {
  const { planSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plan, setPlan] = useState(null);
  const [premiumPlusPlan, setPremiumPlusPlan] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", organization_name: "", password: "", network: "bsc" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verificationBusy, setVerificationBusy] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [deliveryWaiting, setDeliveryWaiting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const turnstileRef = useRef(null);
  const widgetRef = useRef(null);
  const modalRef = useRef(null);
  const verificationTriggerRef = useRef(null);
  const deliveryTimerRef = useRef(null);
  const isCustom = planSlug === "custom";
  const customLimits = customLimitsFromParams(searchParams, premiumPlusPlan);
  const preview = isCustom ? customPreview(plan, premiumPlusPlan, customLimits) : null;

  useEffect(() => {
    getPlans().then((items) => {
      const premiumPlus = items.find((item) => item.slug === "premium-plus");
      const found = items.find((item) => item.slug === planSlug);
      if (found?.is_free) return navigate("/register", { replace: true });
      setPremiumPlusPlan(premiumPlus || null);
      setPlan(found || null);
    }).catch(() => setError("Unable to load this plan."));
  }, [planSlug, navigate]);

  useEffect(() => {
    if (!plan || plan.is_free || emailVerified || otpSent) return undefined;
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey || !turnstileRef.current) {
      if (!siteKey && plan && !plan.is_free) setTurnstileError(true);
      return undefined;
    }
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.turnstile || !turnstileRef.current || widgetRef.current !== null) return;
      try {
        widgetRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          action: "checkout",
          callback: (token) => { setTurnstileToken(token); setTurnstileError(false); },
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => { setTurnstileToken(""); setTurnstileError(true); },
        });
      } catch { setTurnstileError(true); }
    };
    if (window.turnstile) {
      render();
      return () => { cancelled = true; };
    }
    let script = document.querySelector('script[data-mailflow-turnstile="true"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.mailflowTurnstile = "true";
      document.body.appendChild(script);
    }
    script.addEventListener("load", render);
    return () => { cancelled = true; script.removeEventListener("load", render); };
  }, [emailVerified, otpSent, plan]);

  useEffect(() => {
    if (!verificationOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !verificationBusy) closeVerification();
      if (event.key !== "Tab" || !modalRef.current) return;
      const controls = [...modalRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => modalRef.current?.focus());
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [verificationOpen, verificationBusy]);

  useEffect(() => () => { if (deliveryTimerRef.current) clearTimeout(deliveryTimerRef.current); }, []);

  function resetTurnstile() {
    if (window.turnstile && widgetRef.current !== null) {
      try { window.turnstile.remove(widgetRef.current); } catch { /* Widget is already gone. */ }
    }
    widgetRef.current = null;
    setTurnstileToken("");
    setTurnstileError(false);
  }

  function resetVerificationAttempt() {
    if (deliveryTimerRef.current) clearTimeout(deliveryTimerRef.current);
    deliveryTimerRef.current = null;
    setDeliveryWaiting(false);
    setOtpSent(false);
    setOtpCode("");
    setVerificationError("");
    resetTurnstile();
  }

  function closeVerification() {
    if (verificationBusy) return;
    setVerificationOpen(false);
    resetVerificationAttempt();
    requestAnimationFrame(() => verificationTriggerRef.current?.focus());
  }

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    if (event.target.name === "email") { setEmailVerified(false); resetVerificationAttempt(); }
  };

  async function requestCode() {
    if (!turnstileToken) {
      setVerificationError(turnstileError
        ? "Checkout verification could not load. Disable content blockers, allow challenges.cloudflare.com, or try another network."
        : "Complete the checkout verification before requesting a code.");
      return;
    }
    setVerificationBusy("request");
    setVerificationError("");
    try {
      await startCheckoutEmail(form.email, turnstileToken);
      setOtpSent(true);
      setVerificationOpen(true);
      setDeliveryWaiting(true);
      resetTurnstile();
      deliveryTimerRef.current = setTimeout(() => { setDeliveryWaiting(false); deliveryTimerRef.current = null; }, 10000);
    } catch (err) {
      setVerificationError(apiError(err));
      resetTurnstile();
    } finally { setVerificationBusy(""); }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setVerificationBusy("verify");
    setVerificationError("");
    try {
      await verifyCheckoutEmail(form.email, otpCode);
      setEmailVerified(true);
      setVerificationOpen(false);
      resetVerificationAttempt();
      requestAnimationFrame(() => verificationTriggerRef.current?.focus());
    } catch (err) { setVerificationError(apiError(err)); }
    finally { setVerificationBusy(""); }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!emailVerified) { await requestCode(); return; }
    setLoading(true);
    try {
      const invoice = isCustom
        ? await createCustomInvoice({ ...form, limits: customLimits, idempotency_key: idempotencyKey })
        : await createInvoice({ ...form, plan_slug: plan.slug, idempotency_key: idempotencyKey });
      navigate(`/payment/${invoice.id || "current"}`);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }

  return <div className="min-h-screen bg-[#070b14] text-slate-100 px-4 py-8 lg:py-14">
    <div className="max-w-5xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Back to pricing</Link>
      <div className="mt-8 grid lg:grid-cols-[.8fr_1.2fr] rounded-3xl overflow-hidden border border-white/10 bg-slate-900/65 shadow-2xl">
        <aside className="p-8 lg:p-10 bg-gradient-to-br from-indigo-950/70 to-slate-950">
          <span className="w-11 h-11 rounded-2xl bg-indigo-500 grid place-items-center"><Mail className="w-5 h-5" /></span>
          <p className="text-indigo-300 text-xs font-bold uppercase tracking-[.16em] mt-10">Selected plan</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap"><h1 className="text-4xl font-black">{isCustom ? "Custom Plan" : plan?.name || "Loading…"}</h1>{plan?.discount_percent > 0 && !plan.is_free && <span className="px-3 py-1 rounded-full bg-[#10d8a5] text-slate-950 text-[11px] font-black uppercase tracking-wider shadow-lg shadow-emerald-950/60">{plan.discount_percent}% OFF</span>}</div>
          {plan && <><div className="mt-5">{isCustom && preview ? <CustomPriceSummary preview={preview} /> : <>{plan.discount_percent > 0 && !plan.is_free && <div className="flex items-center gap-2 mb-1.5 text-xs text-slate-400"><span className="line-through text-sm font-medium">৳{(plan.original_price_bdt || plan.price_bdt).toLocaleString()}</span><span className="px-2 py-0.5 rounded-md bg-[#0e3026] border border-[#165a49] text-[#1ddc9e] text-[11px] font-bold">Save {plan.discount_percent}%</span></div>}<p className="text-2xl font-bold">{plan.is_free ? "Free" : `৳${plan.price_bdt.toLocaleString()}`} <span className="text-sm text-slate-500 font-normal">/ 30 days</span></p></>}</div>
            <ul className="mt-8 space-y-4 text-sm text-slate-300">{(isCustom ? [`${format(customLimits.email_limit)} emails per cycle`, "30-day quota reset", `${format(customLimits.max_admins)} admins + ${format(customLimits.max_users)} users`, `${format(customLimits.max_smtp_accounts)} SMTP + inboxes`, `${format(customLimits.max_recipients)} recipients`] : [`${plan.email_limit.toLocaleString()} emails per cycle`, plan.weekly_email_limit ? `${plan.weekly_email_limit.toLocaleString()} weekly cap` : plan.daily_email_limit ? `${plan.daily_email_limit.toLocaleString()} daily cap` : "30-day quota reset", `${plan.max_admins} admin + ${plan.max_users} users`, `${plan.max_smtp_accounts} SMTP accounts`]).map((item) => <li key={item} className="flex gap-3"><Check className="w-4 h-4 text-emerald-400" />{item}</li>)}</ul></>}
          <div className="mt-10 pt-8 border-t border-white/10 flex gap-3 text-xs text-slate-500"><ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" /><p>Paid accounts activate only after the USDT transfer is independently verified on-chain.</p></div>
        </aside>
        <section className="p-7 sm:p-10">
          <h2 className="text-2xl font-black">Create your workspace</h2><p className="text-sm text-slate-500 mt-2">The first account becomes your organization administrator.</p>
          {error && <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}
          <form onSubmit={submit} className="mt-7 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4"><Field label="Your name" name="name" autoComplete="name" value={form.name} onChange={update} /><Field label="Work email" name="email" type="email" autoComplete="email" value={form.email} onChange={update} /></div>
            <Field label="Organization name" name="organization_name" autoComplete="organization" value={form.organization_name} onChange={update} />
            <Field label="Password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={update} minLength="8" />
            {plan && !plan.is_free && <div><label className="text-xs font-bold text-slate-300">USDT network</label><div className="grid sm:grid-cols-2 gap-3 mt-2">{networks.map(([value, label, note]) => <label key={value} className={`p-4 rounded-xl border cursor-pointer ${form.network === value ? "border-indigo-400 bg-indigo-500/10" : "border-slate-700 bg-slate-950/50"}`}><input className="sr-only" type="radio" name="network" value={value} checked={form.network === value} onChange={update} /><strong className="block text-sm">{label}</strong><span className="text-xs text-slate-500">{note}</span></label>)}</div></div>}
            {!emailVerified && <div><label className="mb-3 block text-xs font-bold text-slate-300">Checkout verification</label><div ref={turnstileRef} />{turnstileError && <p className="mt-2 text-xs text-amber-300">Cloudflare verification is unavailable. Refresh after allowing challenges.cloudflare.com.</p>}<p className="mt-3 text-xs leading-5 text-slate-500">After this check passes, clicking the button sends a six-digit OTP to your email.</p></div>}
            {emailVerified && <p className="flex items-center gap-2 text-sm text-emerald-300"><Check className="w-4 h-4" /> Email verified</p>}
            <button ref={verificationTriggerRef} disabled={!plan || loading || Boolean(verificationBusy)} className="w-full py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 font-bold disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : verificationBusy === "request" ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending OTP…</> : emailVerified ? "Create USDT invoice" : "Send OTP to verify email"}</button>
            <p className="flex justify-center items-center gap-2 text-[11px] text-slate-600"><LockKeyhole className="w-3 h-3" /> Passwords are securely hashed. We never request wallet keys.</p>
          </form>
        </section>
      </div>
    </div>

    {verificationOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeVerification(); }}>
      <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="email-verification-title" tabIndex="-1" className="my-8 w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5"><div><h2 id="email-verification-title" className="text-xl font-black">Verify your email</h2><p className="mt-1 text-sm text-slate-400">We’ll send a six-digit code to <strong className="text-slate-200">{form.email}</strong>.</p></div><button type="button" onClick={closeVerification} disabled={Boolean(verificationBusy)} aria-label="Close email verification" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"><X className="h-5 w-5" /></button></header>
        <div className="space-y-5 p-6">
          {verificationError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{verificationError}</div>}
          <form onSubmit={verifyCode} className="space-y-4"><Field label="Email verification code" name="otp_code" autoComplete="one-time-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))} inputMode="numeric" pattern="[0-9]{6}" minLength="6" maxLength="6" autoFocus /><div className="flex items-start gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-3 text-sm text-indigo-200">{deliveryWaiting && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}<p>{deliveryWaiting ? "Your email is on its way and may take 5–10 seconds to arrive." : "Check your inbox for the six-digit code. It expires in 10 minutes."} Please check Spam/Junk too; invoice emails can sometimes land there.</p></div><button disabled={Boolean(verificationBusy) || otpCode.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 font-bold hover:bg-indigo-400 disabled:opacity-50">{verificationBusy === "verify" ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</> : "Verify email"}</button><button type="button" onClick={closeVerification} disabled={Boolean(verificationBusy)} className="w-full text-sm font-semibold text-indigo-300 hover:text-indigo-200 disabled:opacity-50">Use a new code</button></form>
        </div>
      </section>
    </div>}
  </div>;
}

function CustomPriceSummary({ preview }) {
  return (
    <div>
      {preview.discountPercent > 0 && (
        <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-400">
          <span className="line-through text-sm font-medium">৳{format(preview.originalPrice)}</span>
          <span className="rounded-md border border-[#165a49] bg-[#0e3026] px-2 py-0.5 text-[11px] font-bold text-[#1ddc9e]">
            Save {preview.discountPercent}%
          </span>
        </div>
      )}
      <p className="text-2xl font-bold">
        ৳{format(preview.payablePrice)} <span className="text-sm font-normal text-slate-500">/ 30 days</span>
      </p>
      <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-slate-400">Premium+ base</span>
          <strong>৳{format(preview.basePrice)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <span className="text-slate-400">Selected extra capacity</span>
          <strong className="text-indigo-200">+৳{format(preview.extraPrice)}</strong>
        </div>
        {preview.discountPercent > 0 && (
          <div className="mt-2 flex justify-between gap-3">
            <span className="text-slate-400">Custom discount</span>
            <strong className="text-emerald-300">-৳{format(preview.discountAmount)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  return <label className="block"><span className="text-xs font-bold text-slate-300">{label}</span><input required {...props} className="mt-2 w-full rounded-xl bg-slate-950/70 border border-slate-700 px-4 py-3 text-sm outline-none focus:border-indigo-400" /></label>;
}
