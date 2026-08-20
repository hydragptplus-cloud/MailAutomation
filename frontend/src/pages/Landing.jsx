import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Gauge,
  Layers3,
  Loader2,
  Lock,
  Mail,
  Menu,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
  Radio,
  Calendar,
} from "lucide-react";
import { apiError, getPlans, getPublicMonitorStats, recoverInvoice } from "../services/billingApi";

const format = (value) => new Intl.NumberFormat("en-US").format(value || 0);

const FEATURES = [
  {
    icon: ServerCog,
    title: "Multi-SMTP Routing",
    copy: "Organize multiple sending accounts, load-balance dispatches, and monitor connection health seamlessly.",
  },
  {
    icon: Layers3,
    title: "Campaign Workflows",
    copy: "Create, schedule, launch, and audit full broadcast cycles from an unified command interface.",
  },
  {
    icon: Users,
    title: "Recipient Intelligence",
    copy: "Import, tag, filter, and maintain clean audience segments without list decay or pollution.",
  },
  {
    icon: BarChart3,
    title: "Delivery Reporting",
    copy: "Real-time tracking for delivered, bounced, queued, and campaign-level open/click engagement.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant Isolation",
    copy: "Strict operational separation for team members, credentials, audience lists, and logs.",
  },
  {
    icon: Gauge,
    title: "Quota Controls",
    copy: "Granular visibility into daily, weekly, and rolling 30-day capacity before dispatching.",
  },
];

const formatMetric = (val) => {
  if (val === undefined || val === null) return "0";
  if (val >= 1000000) return (val / 1000000).toFixed(1) + "M";
  if (val >= 1000) return (val / 1000).toFixed(1) + "K";
  return new Intl.NumberFormat("en-US").format(val);
};

export default function Landing() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [monitorStats, setMonitorStats] = useState(null);
  const [loadingMonitor, setLoadingMonitor] = useState(true);
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    getPlans()
      .then((data) => {
        setPlans(data || []);
      })
      .catch(() =>
        setError("Pricing is temporarily unavailable. Please refresh shortly.")
      )
      .finally(() => setLoadingPlans(false));

    getPublicMonitorStats()
      .then((data) => {
        setMonitorStats(data);
      })
      .catch(() => {
        setMonitorStats({ is_active: false, message: "Mail Flow is inactive - data not available" });
      })
      .finally(() => setLoadingMonitor(false));
  }, []);

  async function recover(event) {
    event.preventDefault();
    setRecovering(true);
    setRecoveryNotice("");
    try {
      const response = await recoverInvoice(recoveryEmail);
      setRecoveryNotice({ text: response.detail, error: false });
      setRecoveryEmail("");
    } catch (err) {
      setRecoveryNotice({ text: apiError(err), error: true });
    } finally {
      setRecovering(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 selection:bg-indigo-500 selection:text-white relative overflow-x-hidden font-sans">
      {/* Background Gradients & Grid Pattern */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      <div
        className="fixed inset-0 pointer-events-none opacity-40"
        style={{
          background:
            "radial-gradient(circle at 15% 15%, rgba(99,102,241,0.25), transparent 40%), radial-gradient(circle at 85% 25%, rgba(56,189,248,0.18), transparent 35%), radial-gradient(circle at 50% 75%, rgba(129,140,248,0.12), transparent 50%)",
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060911]/80 backdrop-blur-xl transition-all">
        <div className="max-w-7xl mx-auto h-20 px-5 lg:px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 grid place-items-center shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform duration-300">
              <Mail className="w-5 h-5 text-white" />
            </span>
            <span>
              <strong className="block text-base tracking-tight font-bold text-white group-hover:text-indigo-300 transition-colors">
                Mail Flow
              </strong>
              <small className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold block -mt-0.5">
                Delivery cloud
              </small>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition-colors duration-200">
              Features
            </a>
            <a href="#pricing" className="hover:text-white transition-colors duration-200">
              Pricing
            </a>
            <a href="#security" className="hover:text-white transition-colors duration-200">
              Security
            </a>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 rounded-xl bg-white text-slate-950 text-sm font-bold hover:bg-slate-100 hover:shadow-lg hover:shadow-white/10 active:scale-95 transition-all"
            >
              Start free
            </Link>
          </div>

          <button
            className="md:hidden p-2.5 rounded-lg border border-white/10 text-slate-400 hover:text-white bg-slate-900/50"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden px-6 py-5 border-t border-white/10 bg-[#060911]/98 backdrop-blur-2xl flex flex-col gap-4 text-slate-200 font-medium text-sm animate-in slide-in-from-top-2">
            <a href="#features" onClick={() => setMobileOpen(false)} className="py-1 hover:text-indigo-400">
              Features
            </a>
            <a href="#pricing" onClick={() => setMobileOpen(false)} className="py-1 hover:text-indigo-400">
              Pricing
            </a>
            <a href="#security" onClick={() => setMobileOpen(false)} className="py-1 hover:text-indigo-400">
              Security
            </a>
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="w-full text-center py-2.5 text-slate-300 font-semibold rounded-xl bg-white/5"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileOpen(false)}
                className="w-full text-center py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-5 lg:px-8 pt-16 pb-20 lg:pt-28 lg:pb-36 grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold mb-6 backdrop-blur-md shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Enterprise-grade email relay with zero friction</span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-extrabold tracking-[-0.035em] leading-[1.08] text-white">
              Send with confidence.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-cyan-300">
                Scale without chaos.
              </span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-400 leading-relaxed max-w-xl">
              One central cockpit for multi-SMTP routing, campaign automation,
              subscriber segments, delivery analytics, and team quotas with predictable USDT payments.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <a
                href="#pricing"
                className="group inline-flex justify-center items-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 active:scale-95 transition-all"
              >

                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                <span>Choose your plan</span>
              </a>
              <Link
                to="/login"
                className="inline-flex justify-center items-center px-6 py-3.5 rounded-xl border border-white/10 bg-slate-900/60 hover:bg-slate-800/80 hover:border-slate-600 text-slate-200 font-semibold active:scale-95 transition"
              >
                Open dashboard
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Free 30-day allowance
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" /> No credit card needed
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Direct USDT settlements
              </span>
            </div>
          </div>

          {/* Hero Live Pulse Widget */}
          <div className="relative">
            <div className="absolute -inset-2 bg-gradient-to-tr from-indigo-500/20 via-sky-500/20 to-cyan-500/20 blur-3xl rounded-3xl -z-10" />
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl p-6 sm:p-7 shadow-2xl relative min-h-[380px] flex flex-col justify-between">
              {/* Header */}
              <div className="flex items-center justify-between pb-5 border-b border-white/[0.08]">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Campaign Monitor</p>
                  <h3 className="font-bold text-white text-base mt-0.5">High-Volume Dispatch</h3>
                </div>
                {loadingMonitor ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold">
                    <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                    Checking...
                  </span>
                ) : monitorStats?.is_active ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Routing Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Offline
                  </span>
                )}
              </div>

              {/* Inactive State */}
              {!loadingMonitor && monitorStats && !monitorStats.is_active && (
                <div className="my-auto py-12 px-4 text-center flex flex-col items-center justify-center animate-in fade-in duration-300">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 grid place-items-center mb-4 text-amber-400 shadow-lg shadow-amber-500/5">
                    <Radio className="w-7 h-7" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-100 tracking-tight">Mail Flow is inactive - data not available</h4>
                  <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
                    Live telemetry broadcasting is currently disabled by system administrators.
                  </p>
                </div>
              )}

              {/* Loading State */}
              {loadingMonitor && (
                <div className="my-auto py-16 text-center text-slate-500 text-sm flex flex-col items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
                  <span>Loading platform telemetry...</span>
                </div>
              )}

              {/* Active State */}
              {!loadingMonitor && monitorStats?.is_active && (
                <>
                  {/* Top 3 Server-wide Monthly Metrics */}
                  <div className="grid grid-cols-3 gap-3 my-5">
                    <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-3.5 text-left">
                      <span className="text-[10px] text-emerald-400 font-semibold block mb-0.5">30d Total</span>
                      <strong className="block text-xl font-extrabold text-white tracking-tight">
                        {formatMetric(monitorStats.metrics?.delivered || 0)}
                      </strong>
                      <span className="text-[11px] text-slate-400">Delivered</span>
                    </div>

                    <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-3.5 text-left">
                      <span className="text-[10px] text-emerald-400 font-semibold block mb-0.5">Server-wide</span>
                      <strong className="block text-xl font-extrabold text-white tracking-tight">
                        {(monitorStats.metrics?.success_rate ?? 100).toFixed(1)}%
                      </strong>
                      <span className="text-[11px] text-slate-400">Success Rate</span>
                    </div>

                    <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-3.5 text-left">
                      <span className="text-[10px] text-cyan-400 font-semibold block mb-0.5">Live</span>
                      <strong className="block text-xl font-extrabold text-white tracking-tight">
                        {formatMetric(monitorStats.metrics?.in_queue || 0)}
                      </strong>
                      <span className="text-[11px] text-slate-400">In Queue</span>
                    </div>
                  </div>

                  {/* 12-Day Interactive Bar Chart */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="w-3 h-3 text-indigo-400" />
                        12-Day Activity
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {selectedBarIndex !== null && monitorStats.daily_bars?.[selectedBarIndex] ? (
                          <span className="text-cyan-300 font-semibold">
                            {monitorStats.daily_bars[selectedBarIndex].label}: {formatMetric(monitorStats.daily_bars[selectedBarIndex].delivered)} sent · {monitorStats.daily_bars[selectedBarIndex].failed} failed
                          </span>
                        ) : (
                          "Click any bar to inspect daily data"
                        )}
                      </span>
                    </div>

                    <div className="h-28 flex items-end gap-1.5 px-1 pb-1 pt-3">
                      {(monitorStats.daily_bars || []).map((bar, i) => {
                        const isSelected = selectedBarIndex === i;
                        return (
                          <button
                            key={bar.date || i}
                            type="button"
                            onClick={() => setSelectedBarIndex(isSelected ? null : i)}
                            className={`flex-1 rounded-t transition-all duration-300 relative group cursor-pointer focus:outline-none ${
                              isSelected
                                ? "bg-gradient-to-t from-cyan-500 via-sky-400 to-white shadow-lg shadow-cyan-500/50 scale-y-105"
                                : "bg-gradient-to-t from-indigo-600/40 via-indigo-400 to-cyan-300 hover:brightness-125"
                            }`}
                            style={{
                              height: `${bar.percentage || 25}%`,
                              opacity: isSelected ? 1 : 0.5 + (i * 0.04),
                            }}
                            title={`${bar.label} (${bar.date}): ${bar.delivered} delivered, ${bar.failed} failed`}
                            aria-label={`Inspect ${bar.label}`}
                          >
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-700 text-cyan-300 text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-20 shadow-md">
                              {bar.label}: {bar.delivered}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Relay Health Card */}
                  <div className="mt-4 p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-400/20 flex items-center gap-3.5">
                    <span className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 grid place-items-center shrink-0">
                      <Zap className="w-5 h-5 text-indigo-300" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                        Optimal SMTP Relay Health
                      </p>
                      <p className="text-[11px] sm:text-xs text-slate-400">
                        {monitorStats.relay_health?.active_routes || 0} active route
                        {(monitorStats.relay_health?.active_routes || 0) === 1 ? "" : "s"} ·{" "}
                        {monitorStats.relay_health?.delivery_incidents || 0} delivery incident
                        {(monitorStats.relay_health?.delivery_incidents || 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="border-y border-white/5 bg-slate-950/50 py-24">
          <div className="max-w-7xl mx-auto px-5 lg:px-8">
            <div className="max-w-2xl">
              <span className="text-indigo-400 text-xs font-bold uppercase tracking-[0.2em]">
                Built for real operations
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold mt-2 tracking-tight text-white">
                Everything between compose and delivered.
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
              {FEATURES.map(({ icon: Icon, title, copy }) => (
                <article
                  key={title}
                  className="p-7 rounded-2xl border border-white/[0.06] bg-slate-900/40 hover:bg-slate-900/80 hover:border-indigo-500/30 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group shadow-sm"
                >
                  <div>
                    <span className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 grid place-items-center group-hover:bg-indigo-500/20 group-hover:scale-110 transition-all duration-300">
                      <Icon className="w-6 h-6" />
                    </span>
                    <h3 className="font-bold text-white text-lg mt-5 tracking-tight">{title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed mt-2.5">
                      {copy}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="max-w-7xl mx-auto px-5 lg:px-8 py-28">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-indigo-400 text-xs font-bold uppercase tracking-[0.2em]">
              Simple & Predictable
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold mt-2 tracking-tight text-white">
              A clear limit for every scale.
            </h2>
            <p className="text-slate-400 text-sm mt-3">
              Allowances renew on your personal 30-day subscription cycle with seamless on-chain USDT renewal.
            </p>
          </div>

          {error && (
            <div className="mt-8 max-w-md mx-auto p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-center text-sm text-rose-300 font-medium">
              {error}
            </div>
          )}

          {/* Pricing Skeleton / List */}
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6 mt-14">
            {loadingPlans
              ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-96 rounded-3xl border border-white/5 bg-slate-900/30 p-6 animate-pulse"
                />
              )) : plans.map((plan) => {
                const featured = plan.slug === "premium";
                const isPlanFree = Boolean(plan.is_free || (plan.price_bdt === 0 && !plan.original_price_bdt) || plan.slug === "free");
                return (
                  <article
                    key={plan.slug}
                    className={`relative rounded-3xl p-7 border flex flex-col justify-between transition-all duration-200 ${featured
                      ? "border-indigo-500/60 bg-indigo-950/20 shadow-2xl shadow-indigo-950/60 hover:border-indigo-400"
                      : "border-white/[0.08] bg-slate-900/40 hover:border-white/20 hover:bg-slate-900/70"
                      }`}
                  >
                    {featured && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-lg shadow-indigo-500/20 z-20">
                        Recommended
                      </span>
                    )}

                    {plan.discount_percent > 0 && !isPlanFree && (
                      <div className="absolute top-0 right-0 w-28 h-28 overflow-hidden rounded-tr-[23px] pointer-events-none z-10">
                        <div className="absolute transform rotate-45 bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black text-[10px] py-1 text-center w-36 top-5 -right-8 shadow-md uppercase tracking-wider">
                          {plan.discount_percent}% OFF
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">{plan.name}</h3>

                      <div className="mt-5 flex items-baseline justify-between gap-3">
                        {plan.discount_percent > 0 && !isPlanFree ? (
                          <div className="flex flex-col">
                            <span className="line-through text-xs font-semibold text-slate-400">
                              ৳{format(plan.original_price_bdt || plan.price_bdt)}
                            </span>
                            <div className="flex items-baseline gap-1">
                              <strong className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                                ৳{format(plan.price_bdt)}
                              </strong>
                              <span className="text-slate-400 text-xs font-medium">/ 30d</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1">
                            <strong className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                              {isPlanFree ? "Free" : `৳${format(plan.price_bdt)}`}
                            </strong>
                            {!isPlanFree && (
                              <span className="text-slate-400 text-xs font-medium">/ 30d</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-slate-300 mt-4 pb-4 border-b border-white/[0.08]">
                        <strong className="text-white font-semibold text-sm">
                          {format(plan.email_limit)}
                        </strong>{" "}
                        emails included
                      </div>

                      <ul className="space-y-3.5 mt-5 text-xs text-slate-300">
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            {plan.daily_email_limit
                              ? `${format(plan.daily_email_limit)} emails/day`
                              : plan.weekly_email_limit
                                ? `${format(plan.weekly_email_limit)} emails/week`
                                : "Full monthly bucket"}
                          </span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            {plan.max_admins} admin{plan.max_admins > 1 ? "s" : ""} +{" "}
                            {plan.max_users} member{plan.max_users > 1 ? "s" : ""}
                          </span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            {plan.max_smtp_accounts} SMTP account
                            {plan.max_smtp_accounts > 1 ? "s" : ""}
                          </span>
                        </li>
                      </ul>
                    </div>

                    <button
                      onClick={() => {
                        if (isPlanFree) {
                          navigate("/register");
                        } else {
                          navigate(`/subscribe/${plan.slug}`);
                        }
                      }}
                      className={`mt-8 w-full rounded-xl py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${featured
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25"
                        : "bg-white/10 hover:bg-white/20 text-white"
                        }`}
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span>{isPlanFree ? "Create free account" : "Subscribe with USDT"}</span>
                    </button>
                  </article>
                );
              })}
          </div>
        </section>

        {/* Security & Recovery Section */}
        <section id="security" className="max-w-4xl mx-auto px-5 pb-28 space-y-6">
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.03] backdrop-blur-lg p-6 sm:p-8 flex flex-col sm:flex-row gap-5 items-start">
            <span className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Decentralized & Verified On-Chain
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mt-2">
                We monitor contract events directly on-chain for exact invoice amount, transaction confirmations, and single-use validation.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-indigo-400" />
              <h2 className="text-base font-bold text-white">Find Existing Checkout Invoice</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Lost your payment URL? Enter your checkout email to receive a secure recovery link.
            </p>

            <form onSubmit={recover} className="mt-5 flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                placeholder="you@domain.com"
                className="min-w-0 flex-1 bg-slate-950/80 border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none transition"
              />
              <button
                type="submit"
                disabled={recovering}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-3 rounded-xl text-sm font-bold text-white transition shrink-0 active:scale-95"
              >
                {recovering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  "Email secure link"
                )}
              </button>
            </form>

            {recoveryNotice && (
              <p
                className={`text-xs font-medium mt-3 ${recoveryNotice.error ? "text-rose-400" : "text-emerald-300"
                  }`}
              >
                {recoveryNotice.text}
              </p>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-[#060911]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <span>© 2026 Mail Flow. All rights reserved.</span>
          <span>Reliable infrastructure for responsible email delivery.</span>
        </div>
      </footer>
    </div>
  );
}