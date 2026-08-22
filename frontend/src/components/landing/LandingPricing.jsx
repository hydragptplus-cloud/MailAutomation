import { useNavigate } from "react-router-dom";
import { Check, ChevronRight } from "lucide-react";
import CustomPlanCard from "./CustomPlanCard";

const format = (value) => new Intl.NumberFormat("en-US").format(value || 0);

export default function LandingPricing({ plans, loadingPlans, error }) {
  const navigate = useNavigate();
  const premiumPlusPlan = plans.find((plan) => plan.slug === "premium-plus") || plans.find((plan) => plan.name?.toLowerCase() === "premium+");
  const customPlan = plans.find((plan) => plan.slug === "custom");
  const visibleFixedPlans = plans.filter((plan) => plan.slug !== "custom");

  return (
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
      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-6 mt-14">
        {loadingPlans
          ? Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-96 rounded-3xl border border-white/5 bg-slate-900/30 p-6 animate-pulse"
            />
          )) : (
            <>
              {visibleFixedPlans.map((plan) => {
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
              <CustomPlanCard basePlan={premiumPlusPlan} customPlan={customPlan} />
            </>
          )}
      </div>
    </section>
  );
}
