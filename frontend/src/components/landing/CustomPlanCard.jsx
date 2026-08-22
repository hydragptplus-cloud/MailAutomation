import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, SlidersHorizontal } from "lucide-react";

const format = (value) => new Intl.NumberFormat("en-US").format(value || 0);

function applyDiscount(originalPrice, discountPercent) {
  const discount = Math.min(Math.max(Number(discountPercent || 0), 0), 100);
  return Math.round(Number(originalPrice || 0) * (1 - discount / 100));
}

function Range({ label, value, min, max, step, onChange }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-400">
        <span>{label}</span>
        <span className="text-cyan-200">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-cyan-400"
      />
    </label>
  );
}

export default function CustomPlanCard({ basePlan, customPlan }) {
  const [emails, setEmails] = useState(300000);
  const [admins, setAdmins] = useState(8);
  const [users, setUsers] = useState(80);
  const [connections, setConnections] = useState(15);
  const [recipients, setRecipients] = useState(50000);

  const premiumWasPrice = Number(basePlan?.original_price_bdt || 0);
  const premiumPayablePrice = Number(basePlan?.price_bdt || premiumWasPrice || 0);
  const premiumDiscountPercent = Number(basePlan?.discount_percent || 0);
  const premiumHasDiscount = premiumDiscountPercent > 0 && premiumWasPrice > premiumPayablePrice;
  const baseOriginal = premiumHasDiscount ? premiumWasPrice : premiumPayablePrice;
  const customDiscountPercent = Number(customPlan?.discount_percent || 0);
  const baseEmails = Number(basePlan?.email_limit || 150000);
  const baseAdmins = Number(basePlan?.max_admins || 5);
  const baseUsers = Number(basePlan?.max_users || 50);
  const baseConnections = Number(basePlan?.max_smtp_accounts || 10);
  const baseRecipients = Number(basePlan?.max_recipients || 10000);

  const emailExtra = Math.max(0, Math.ceil((emails - baseEmails) / 10000)) * 120;
  const adminExtra = Math.max(0, admins - baseAdmins) * 150;
  const userExtra = Math.max(0, users - baseUsers) * 20;
  const connectionExtra = Math.max(0, connections - baseConnections) * 300;
  const recipientExtra = Math.max(0, Math.ceil((recipients - baseRecipients) / 10000)) * 100;
  const extraOriginal = emailExtra + adminExtra + userExtra + connectionExtra + recipientExtra;
  const estimatedOriginal = baseOriginal + extraOriginal;
  const estimatedPayable = applyDiscount(estimatedOriginal, customDiscountPercent);
  const discountAmount = Math.max(0, estimatedOriginal - estimatedPayable);
  const needsQuote = emails > 1000000 || connections > 40 || users > 250 || admins > 25;
  const customParams = new URLSearchParams({
    emails: String(emails),
    admins: String(admins),
    users: String(users),
    connections: String(connections),
    recipients: String(recipients),
  });
  const quoteMessage = [
    "I want a Custom Mail Flow plan.",
    "",
    `Monthly emails: ${format(emails)}`,
    `Admins: ${format(admins)}`,
    `Users: ${format(users)}`,
    `SMTP + inboxes: ${format(connections)}`,
    `Recipients: ${format(recipients)}`,
    `Estimated price: ${needsQuote ? "Custom quote" : `৳${format(estimatedPayable)} / 30 days`}`,
  ].join("\n");

  return (
    <article className="relative rounded-3xl p-7 border border-cyan-400/40 bg-cyan-950/10 flex flex-col justify-between shadow-2xl shadow-cyan-950/30">
      {customDiscountPercent > 0 && (
        <div className="absolute top-0 right-0 w-28 h-28 overflow-hidden rounded-tr-[23px] pointer-events-none z-10">
          <div className="absolute transform rotate-45 bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black text-[10px] py-1 text-center w-36 top-5 -right-8 shadow-md uppercase tracking-wider">
            {customDiscountPercent}% OFF
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-300/20 grid place-items-center text-cyan-300">
            <SlidersHorizontal className="w-4 h-4" />
          </span>
          <h3 className="text-lg font-bold text-white tracking-tight">Custom</h3>
        </div>

        <div className="mt-5">
          {customDiscountPercent > 0 && (
            <span className="line-through text-xs font-semibold text-slate-400">
              ৳{format(estimatedOriginal)}
            </span>
          )}
          <div className="flex items-baseline gap-1">
            <strong className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {needsQuote ? "Custom quote" : `৳${format(estimatedPayable)}`}
            </strong>
            {!needsQuote && <span className="text-slate-400 text-xs font-medium">/ 30d</span>}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Starts from Premium+ {premiumHasDiscount ? "was price" : "payable price"}: ৳{format(baseOriginal)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {customDiscountPercent > 0 ? `${customDiscountPercent}% Custom discount applied.` : "Custom discount is separate from Premium+."}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-slate-950/45 p-4 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Premium+ base</span>
            <strong className="text-slate-100">৳{format(baseOriginal)}</strong>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-slate-400">Selected extra capacity</span>
            <strong className="text-cyan-200">+৳{format(extraOriginal)}</strong>
          </div>
          {customDiscountPercent > 0 && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-slate-400">Custom discount</span>
              <strong className="text-emerald-300">-৳{format(discountAmount)}</strong>
            </div>
          )}
          {!needsQuote && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
              <span className="font-semibold text-slate-300">Payable</span>
              <strong className="text-white">৳{format(estimatedPayable)}</strong>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-4">
          <Range label="Monthly emails" value={emails} min={baseEmails} max={1200000} step={10000} onChange={setEmails} suffix="" />
          <Range label="Admins" value={admins} min={baseAdmins} max={30} step={1} onChange={setAdmins} suffix="" />
          <Range label="Users" value={users} min={baseUsers} max={300} step={5} onChange={setUsers} suffix="" />
          <Range label="SMTP + inboxes" value={connections} min={baseConnections} max={50} step={1} onChange={setConnections} suffix="" />
          <Range label="Recipients" value={recipients} min={baseRecipients} max={200000} step={10000} onChange={setRecipients} suffix="" />
        </div>

        <ul className="space-y-3 mt-5 text-xs text-slate-300">
          <li className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Mail Workspace included</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{needsQuote ? "Admin approval for high scale" : "Extra 10k emails from ৳120"}</span>
          </li>
        </ul>
      </div>

      <Link
        to={needsQuote ? `/help?subject=${encodeURIComponent("Custom plan request")}&message=${encodeURIComponent(quoteMessage)}` : `/subscribe/custom?${customParams.toString()}`}
        className={`mt-8 w-full rounded-xl py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${needsQuote ? "border border-cyan-300/30 text-cyan-200 hover:bg-cyan-400/10" : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"}`}
      >
        <ChevronRight className="w-4 h-4" />
        <span>{needsQuote ? "Request custom quote" : "Continue checkout"}</span>
      </Link>
    </article>
  );
}
