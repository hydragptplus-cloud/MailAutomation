import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, CreditCard, Loader2 } from "lucide-react";
import api from "../services/api";
import { createAccountInvoice, getPlans } from "../services/billingApi";
import { getUser } from "../utils/auth";
import CustomSelect from "../components/common/CustomSelect";

const paidNetworks = [
  ["bsc", "BNB Smart Chain"],
  ["tron", "Tron"],
  ["ton", "TON"],
  ["ethereum", "Ethereum"],
];

export default function AccountAdmin() {
  const navigate = useNavigate();
  const role = getUser().role;

  const [account, setAccount] = useState(null);
  const [plans, setPlans] = useState([]);
  const [upgrade, setUpgrade] = useState({ plan_slug: "premium", network: "bsc" });
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([
      api.get("/account/"),
      getPlans(),
    ]).then(([a, p]) => {
      setAccount(a.data);
      setPlans(p);
    });

  useEffect(() => {
    load().catch((e) => {
      setError(e.response?.data?.detail || "Unable to load account.");
    });
  }, []);

  const beginUpgrade = async () => {
    setUpgrading(true);
    setError("");

    try {
      const invoice = await createAccountInvoice(upgrade);
      navigate(`/payment/${invoice.id || "current"}`);
    } catch (e) {
      setError(
        e.response?.data?.detail || "Unable to create subscription invoice."
      );
    } finally {
      setUpgrading(false);
    }
  };

  if (!account) {
    return <div className="text-slate-400">Loading account...</div>;
  }

  const unlimited = (limit) => (limit === 0 ? "Unlimited" : limit);

  const cards = [
    ["Administrators", account.admin_count, account.max_admins],
    ["Users", account.user_count, account.max_users],
    ["SMTP accounts", account.smtp_count, account.max_smtp_accounts],
    ["Daily emails", account.usage.daily_sent, unlimited(account.daily_email_limit)],
    ["Weekly emails", account.usage.weekly_sent, unlimited(account.weekly_email_limit)],
    ["30-day emails", account.usage.monthly_sent, account.monthly_email_limit],
  ];

  return (
    <div className="space-y-6">
      {/* Header & Status */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{account.name}</h1>
          <p className="text-sm text-slate-400">
            Account status:{" "}
            <span
              className={
                account.status === "active"
                  ? "text-emerald-400"
                  : "text-rose-400"
              }
            >
              {account.status}
            </span>
          </p>
        </div>

        {account.subscription && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <CalendarClock className="w-5 h-5 text-indigo-400" />
            <div>
              <p className="font-bold text-sm">{account.subscription.plan_name}</p>
              <p className="text-xs text-slate-500">
                Renews or expires{" "}
                {new Date(
                  account.subscription.current_period_end
                ).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Usage Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(([label, used, limit]) => (
          <div
            key={label}
            className="p-5 bg-slate-900 border border-slate-800 rounded-2xl"
          >
            <p className="text-xs uppercase text-slate-400">{label}</p>
            <p className="text-2xl font-bold mt-2">
              {used} <span className="text-sm text-slate-500">/ {limit}</span>
            </p>
            {typeof limit === "number" && (
              <p className="text-xs text-indigo-400 mt-1">
                {Math.max(limit - used, 0)} remaining
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Upgrade Subscription Section */}
      {role === "admin" && (
        <section className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="flex gap-3 items-start">
            <CreditCard className="w-5 h-5 text-indigo-400 mt-1" />
            <div>
              <h2 className="font-semibold">Renew or change subscription</h2>
              <p className="text-xs text-slate-500 mt-1">
                The plan is applied after your direct USDT transfer is verified
                on-chain.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 mt-5">
            <CustomSelect
              value={upgrade.plan_slug}
              onChange={(plan_slug) => setUpgrade({ ...upgrade, plan_slug })}
              options={plans
                .filter((plan) => !plan.is_free)
                .map((plan) => ({
                  value: plan.slug,
                  label:
                    plan.discount_percent > 0
                      ? `${plan.name} — ৳${plan.price_bdt.toLocaleString()} (${plan.discount_percent}% off, was ৳${(
                        plan.original_price_bdt || plan.price_bdt
                      ).toLocaleString()})`
                      : `${plan.name} — ৳${plan.price_bdt.toLocaleString()}`,
                }))}
              ariaLabel="Subscription plan"
            />

            <CustomSelect
              value={upgrade.network}
              onChange={(network) => setUpgrade({ ...upgrade, network })}
              options={paidNetworks.map(([value, label]) => ({ value, label }))}
              ariaLabel="Payment network"
            />

            <button
              onClick={beginUpgrade}
              disabled={upgrading}
              className="px-5 py-2 rounded-xl bg-indigo-600 font-semibold flex items-center justify-center gap-2"
            >
              {upgrading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />Continue
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* User Management — redirect to Settings */}
      {role === "admin" && (
        <section className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Team members</h2>
              <p className="text-xs text-slate-500 mt-1">
                Create, edit, and manage user accounts for your organization.
              </p>
            </div>
            <button
              onClick={() => navigate("/settings")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-sm font-semibold"
            >
              <ArrowRight className="w-4 h-4" /> Manage users
            </button>
          </div>
        </section>
      )}
    </div>
  );
}