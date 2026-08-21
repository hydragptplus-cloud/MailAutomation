import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  Layers3,
  Loader2,
  Lock,
  Mail,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { apiError, createFreeAccount, getPlans } from "../services/billingApi";
import { setTokens, setUser } from "../utils/auth";

export default function Register() {
  const navigate = useNavigate();

  const [freePlan, setFreePlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [form, setForm] = useState({
    name: "",
    email: "",
    organization_name: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef(null);

  useEffect(() => {
    getPlans()
      .then((plans) => {
        const found = plans.find((p) => p.is_free || (p.price_bdt === 0 && !p.original_price_bdt) || p.slug === "free");
        setFreePlan(found || null);
      })
      .catch(() => {
        // Fallback gracefully if plans endpoint has delay
      })
      .finally(() => setLoadingPlan(false));
  }, []);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey || !turnstileRef.current) {
      if (!siteKey) setTurnstileError(true);
      return undefined;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          action: "checkout",
          callback: (token) => {
            setTurnstileToken(token);
            setTurnstileError(false);
          },
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => {
            setTurnstileToken("");
            setTurnstileError(true);
          },
        });
      }
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, []);

  const handleChange = (e) => {
    setForm((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (!turnstileToken) {
        setError(
          turnstileError
            ? "Checkout verification could not load. Disable content blockers, allow challenges.cloudflare.com, or try another network and refresh the page."
            : "Complete the checkout verification before continuing."
        );
        return;
      }

      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        organization_name: form.organization_name.trim(),
        password: form.password,
        turnstile_token: turnstileToken,
        ...(freePlan?.slug ? { plan_slug: freePlan.slug } : {}),
      };

      const response = await createFreeAccount(payload);

      // Authentication tokens are set as HttpOnly cookies by the backend.
      if (response.user) {
        setTokens();
        setUser(response.user);
        navigate("/dashboard", { replace: true });
      } else {
        // Fallback redirect to login with created param
        navigate("/login?created=1", { replace: true });
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const formatNum = (val) => new Intl.NumberFormat("en-US").format(val || 0);

  return (
    <div className="min-h-screen w-full bg-[#060911] text-slate-100 selection:bg-indigo-500 selection:text-white flex items-center justify-center p-4 sm:p-6 lg:p-10 relative overflow-x-hidden font-sans">
      {/* Ambient background glow effects */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-600/10 blur-[130px] pointer-events-none" />

      <div className="w-full max-w-5xl z-10 space-y-4">
        {/* Navigation back to landing */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home & pricing
        </Link>

        {/* Main Card */}
        <div className="w-full bg-slate-900/70 border border-slate-800/90 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-indigo-950/40 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Column: Signup Form */}
          <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-between space-y-6">
            <div>
              {/* Logo & Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-600/30">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                    Mail Flow
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold uppercase">
                      Free Tier
                    </span>
                  </span>
                  <p className="text-xs text-slate-400">
                    Free Account Workspace Registration
                  </p>
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Create your workspace
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                Get started with multi-SMTP dispatching, recipient lists, and analytics. No payment or credit card required.
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs sm:text-sm animate-fade-in flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                <div className="flex-1">{error}</div>
              </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Alex Mercer"
                    autoComplete="name"
                    className="w-full py-3 px-4 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Work Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="w-full py-3 px-4 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Organization / Workspace Name
                </label>
                <input
                  type="text"
                  name="organization_name"
                  required
                  value={form.organization_name}
                  onChange={handleChange}
                  placeholder="e.g. Acme Studio"
                  autoComplete="organization"
                  className="w-full py-3 px-4 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={handleChange}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    style={{ paddingRight: "42px" }}
                    className="w-full py-3 px-4 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Must contain at least 8 characters.
                </p>
              </div>

              <div className="space-y-2">
                <div ref={turnstileRef} />
                {turnstileError && (
                  <p className="text-xs text-amber-300">
                    Checkout verification is unavailable. Refresh after allowing Cloudflare challenges.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-6 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Free Workspace...
                  </>
                ) : (
                  <>

                    <ArrowRight className="w-4 h-4" />Create Free Workspace
                  </>
                )}
              </button>
            </form>

            {/* Bottom link to login */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <span>
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
                  Sign in here
                </Link>
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" /> No credit card needed
              </span>
            </div>
          </div>

          {/* Right Column: Free Plan Details & Features */}
          <div className="hidden lg:col-span-5 lg:flex bg-gradient-to-br from-indigo-950/70 via-slate-950 to-slate-900/90 p-10 flex-col justify-between border-l border-slate-800/80 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-300 w-fit backdrop-blur-md mb-6">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Free Plan Allowance</span>
              </div>

              <h3 className="text-xl font-bold text-white tracking-tight">
                {freePlan?.name || "Free Starter"}
              </h3>
              <div className="flex items-baseline gap-2 mt-2">
                <strong className="text-3xl font-extrabold text-white">৳0</strong>
                <span className="text-xs text-slate-400 font-medium">/ 30-day allowance</span>
              </div>

              {/* Dynamic plan limits */}
              <div className="mt-6 space-y-3.5 bg-slate-950/60 p-5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-3 text-xs text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong className="text-white font-bold">
                      {loadingPlan ? "..." : formatNum(freePlan?.email_limit || 1000)}
                    </strong>{" "}
                    emails included every 30 days
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {freePlan?.daily_email_limit ? (
                      `${formatNum(freePlan.daily_email_limit)} emails/day rate limit`
                    ) : freePlan?.weekly_email_limit ? (
                      `${formatNum(freePlan.weekly_email_limit)} emails/week rate limit`
                    ) : (
                      "Full 30-day quota reset"
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong className="text-white font-bold">
                      {freePlan?.max_admins || 1}
                    </strong>{" "}
                    administrator +{" "}
                    <strong className="text-white font-bold">
                      {freePlan?.max_users || 1}
                    </strong>{" "}
                    team member
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong className="text-white font-bold">
                      {freePlan?.max_smtp_accounts || 1}
                    </strong>{" "}
                    SMTP sending server
                  </span>
                </div>
              </div>
            </div>

            {/* Feature preview cards */}
            <div className="space-y-3 my-6">
              <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-xl flex items-start gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg shrink-0">
                  <ServerCog className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Multi-SMTP Delivery</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Connect your own custom SMTP servers with failover protection.
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-xl flex items-start gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Fast Campaign Dispatch</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Automated background queuing and delivery progress metrics.
                  </p>
                </div>
              </div>
            </div>

            {/* Upgrade note */}
            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200 flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-indigo-300 shrink-0" />
              <span>
                Need higher email limits? You can upgrade to paid plans with direct USDT transfers anytime from your dashboard.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
