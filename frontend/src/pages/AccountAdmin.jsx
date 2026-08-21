import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, CreditCard, Loader2 } from "lucide-react";
import api from "../services/api";
import { createAccountCustomInvoice, createAccountInvoice, getPlans } from "../services/billingApi";
import { getUser } from "../utils/auth";
import CustomSelect from "../components/common/CustomSelect";

const paidNetworks = [
  ["bsc", "BNB Smart Chain"],
  ["tron", "Tron"],
  ["ton", "TON"],
  ["ethereum", "Ethereum"],
];

const customAddonPrices = { email_10k: 120, admin: 150, user: 20, smtp: 300, recipient_10k: 100 };

function customPrice(customPlan, premiumPlan, limits) {
  if (!customPlan || !premiumPlan) return 0;
  const premiumWas = Number(premiumPlan.original_price_bdt || 0);
  const premiumPayable = Number(premiumPlan.price_bdt || premiumWas);
  const base = Number(premiumPlan.discount_percent || 0) > 0 && premiumWas > premiumPayable
    ? premiumWas
    : premiumPayable;
  const extras =
    Math.max(0, Math.ceil((limits.email_limit - premiumPlan.email_limit) / 10000)) * customAddonPrices.email_10k +
    Math.max(0, limits.max_admins - premiumPlan.max_admins) * customAddonPrices.admin +
    Math.max(0, limits.max_users - premiumPlan.max_users) * customAddonPrices.user +
    Math.max(0, limits.max_smtp_accounts - premiumPlan.max_smtp_accounts) * customAddonPrices.smtp +
    Math.max(0, Math.ceil((limits.max_recipients - premiumPlan.max_recipients) / 10000)) * customAddonPrices.recipient_10k;
  return Math.round((base + extras) * (1 - Number(customPlan.discount_percent || 0) / 100));
}

export default function AccountAdmin() {
  const navigate = useNavigate();
  const role = getUser().role;

  const [account, setAccount] = useState(null);
  const [plans, setPlans] = useState([]);
  const [upgrade, setUpgrade] = useState({ plan_slug: "premium", network: "bsc" });
  const [customLimits, setCustomLimits] = useState(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([
      api.get("/account/"),
      getPlans(),
    ]).then(([a, p]) => {
      setAccount(a.data);
      setPlans(p);
      const premiumPlus = p.find((plan) => plan.slug === "premium-plus");
      if (premiumPlus) {
        setCustomLimits({
          email_limit: Math.max(a.data.monthly_email_limit || 0, premiumPlus.email_limit, 300000),
          max_admins: Math.max(a.data.max_admins || 0, premiumPlus.max_admins, 8),
          max_users: Math.max(a.data.max_users || 0, premiumPlus.max_users, 80),
          max_smtp_accounts: Math.max(a.data.max_smtp_accounts || 0, premiumPlus.max_smtp_accounts, 15),
          max_recipients: Math.max(a.data.max_recipients || 0, premiumPlus.max_recipients, 50000),
        });
      }
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
      const invoice = upgrade.plan_slug === "custom"
        ? await createAccountCustomInvoice({
          network: upgrade.network,
          limits: customLimits,
          idempotency_key: idempotencyKey,
        })
        : await createAccountInvoice({ ...upgrade, idempotency_key: idempotencyKey });
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
  const premiumPlusPlan = plans.find((plan) => plan.slug === "premium-plus");
  const customPlan = plans.find((plan) => plan.slug === "custom");
  const customPayable = customLimits ? customPrice(customPlan, premiumPlusPlan, customLimits) : 0;

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
                    plan.slug === "custom"
                      ? "Custom - configure capacity"
                      : plan.discount_percent > 0
                      ? `${plan.name} - ৳${plan.price_bdt.toLocaleString()} (${plan.discount_percent}% off, was ৳${(
                        plan.original_price_bdt || plan.price_bdt
                      ).toLocaleString()})`
                      : `${plan.name} - ৳${plan.price_bdt.toLocaleString()}`,
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

          {upgrade.plan_slug === "custom" && customLimits && premiumPlusPlan && (
            <div className="mt-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-indigo-200">Custom capacity</h3>
                  <p className="text-xs text-slate-500">The server recalculates and locks these limits into the invoice.</p>
                </div>
                <p className="text-lg font-bold text-emerald-300">৳{customPayable.toLocaleString()} / 30 days</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <LimitInput label="Emails" value={customLimits.email_limit} min={premiumPlusPlan.email_limit} max={1000000} step={10000} onChange={(value) => setCustomLimits({ ...customLimits, email_limit: value })} />
                <LimitInput label="Admins" value={customLimits.max_admins} min={premiumPlusPlan.max_admins} max={25} onChange={(value) => setCustomLimits({ ...customLimits, max_admins: value })} />
                <LimitInput label="Users" value={customLimits.max_users} min={premiumPlusPlan.max_users} max={250} onChange={(value) => setCustomLimits({ ...customLimits, max_users: value })} />
                <LimitInput label="SMTP + inboxes" value={customLimits.max_smtp_accounts} min={premiumPlusPlan.max_smtp_accounts} max={40} onChange={(value) => setCustomLimits({ ...customLimits, max_smtp_accounts: value })} />
                <LimitInput label="Recipients" value={customLimits.max_recipients} min={premiumPlusPlan.max_recipients} max={200000} step={10000} onChange={(value) => setCustomLimits({ ...customLimits, max_recipients: value })} />
              </div>
            </div>
          )}
        </section>
      )}

      {/* User Management - redirect to Settings */}
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

function LimitInput({ label, value, onChange, ...props }) {
  return (
    <label className="text-xs font-semibold text-slate-300">
      {label}
      <input
        type="number"
        required
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        {...props}
        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
      />
    </label>
  );
}
