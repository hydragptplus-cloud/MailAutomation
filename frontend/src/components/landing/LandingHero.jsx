import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import HeroMonitorWidget from "./HeroMonitorWidget";

export default function LandingHero({ monitorStats, loadingMonitor }) {
  return (
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
      <HeroMonitorWidget monitorStats={monitorStats} loadingMonitor={loadingMonitor} />
    </section>
  );
}
