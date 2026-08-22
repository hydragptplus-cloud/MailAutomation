import { useEffect, useState } from "react";
import { getPlans, getPublicMonitorStats } from "../services/billingApi";
import LandingHeader from "../components/landing/LandingHeader";
import LandingHero from "../components/landing/LandingHero";
import LandingFeatures from "../components/landing/LandingFeatures";
import LandingPricing from "../components/landing/LandingPricing";
import LandingSecurity from "../components/landing/LandingSecurity";
import LandingFooter from "../components/landing/LandingFooter";

export default function Landing() {
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [monitorStats, setMonitorStats] = useState(null);
  const [loadingMonitor, setLoadingMonitor] = useState(true);
  const [error, setError] = useState("");

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

      <LandingHeader />

      <main className="relative z-10">
        <LandingHero monitorStats={monitorStats} loadingMonitor={loadingMonitor} />
        <LandingFeatures />
        <LandingPricing plans={plans} loadingPlans={loadingPlans} error={error} />
        <LandingSecurity />
      </main>

      <LandingFooter />
    </div>
  );
}
