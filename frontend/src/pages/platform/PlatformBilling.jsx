import { useEffect, useState } from "react";
import { CheckCircle2, CircleDollarSign, KeyRound, Save, Wallet } from "lucide-react";
import api from "../../services/api";

const emptyBilling = {
  usdt_bdt_rate: "", payment_evm_wallet: "", payment_tron_wallet: "", payment_ton_wallet: "",
  tron_api_key: "", toncenter_api_key: "", clear_tron_api_key: false, clear_toncenter_api_key: false,
  tron_api_key_configured: false, toncenter_api_key_configured: false,
};

export default function PlatformBilling() {
  const [billing, setBilling] = useState(emptyBilling);
  const [original, setOriginal] = useState(emptyBilling);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/platform/billing-configuration/").then((response) => {
      const value = { ...emptyBilling, ...response.data, tron_api_key: "", toncenter_api_key: "" };
      setBilling(value); setOriginal(value);
    }).catch((requestError) => setError(requestError.response?.data?.detail || "Unable to load billing configuration."))
      .finally(() => setLoading(false));
  }, []);

  async function save(event) {
    event.preventDefault(); setMessage(""); setError("");
    const walletsChanged = ["payment_evm_wallet", "payment_tron_wallet", "payment_ton_wallet"].some((key) => billing[key] !== original[key]);
    if (walletsChanged && !window.confirm("Change receiving wallets? New invoices will use the new addresses immediately.")) return;
    setSaving(true);
    const payload = {
      usdt_bdt_rate: billing.usdt_bdt_rate,
      payment_evm_wallet: billing.payment_evm_wallet,
      payment_tron_wallet: billing.payment_tron_wallet,
      payment_ton_wallet: billing.payment_ton_wallet,
      clear_tron_api_key: billing.clear_tron_api_key,
      clear_toncenter_api_key: billing.clear_toncenter_api_key,
    };
    if (billing.tron_api_key) payload.tron_api_key = billing.tron_api_key;
    if (billing.toncenter_api_key) payload.toncenter_api_key = billing.toncenter_api_key;
    try {
      const response = await api.patch("/platform/billing-configuration/", payload);
      const value = { ...emptyBilling, ...response.data, tron_api_key: "", toncenter_api_key: "" };
      setBilling(value); setOriginal(value); setMessage("Billing configuration saved.");
    } catch (requestError) { setError(requestError.response?.data?.detail || JSON.stringify(requestError.response?.data || "Unable to save billing configuration.")); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="py-16 text-center text-sm text-slate-500">Loading billing configuration…</div>;
  return <form onSubmit={save} className="space-y-8 max-w-5xl">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Billing & Payments</h2><p className="text-sm text-slate-500 mt-1">Control quote conversion, receiving wallets, and blockchain provider access.</p></div><button disabled={saving} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-indigo-600 text-sm font-semibold disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "Saving…" : "Save changes"}</button></div>
    {message && <Notice>{message}</Notice>}{error && <Notice error>{error}</Notice>}

    <Section icon={CircleDollarSign} title="Exchange rate" description="Used when creating new USDT quotes. Existing invoices retain their original rate."><label className="block max-w-sm text-xs text-slate-400">USDT to BDT rate<input className="mt-1 w-full" required type="number" min="0.0001" step="0.0001" value={billing.usdt_bdt_rate} onChange={(event) => setBilling({ ...billing, usdt_bdt_rate: event.target.value })} /></label></Section>

    <Section icon={Wallet} title="Receiving wallets" description="Each new invoice snapshots its receiving address. Verify every address before saving."><div className="space-y-4"><WalletField network="BSC + Ethereum" note="EVM-compatible USDT receiving address" value={billing.payment_evm_wallet} onChange={(value) => setBilling({ ...billing, payment_evm_wallet: value })} /><WalletField network="Tron" note="TRC-20 USDT receiving address" value={billing.payment_tron_wallet} onChange={(value) => setBilling({ ...billing, payment_tron_wallet: value })} /><WalletField network="TON" note="USDT Jetton receiving address" value={billing.payment_ton_wallet} onChange={(value) => setBilling({ ...billing, payment_ton_wallet: value })} /></div></Section>

    <Section icon={KeyRound} title="Provider credentials" description="Keys are encrypted at rest. Stored values are never returned to the browser."><div className="grid md:grid-cols-2 gap-6"><SecretField label="TronGrid API key" configured={billing.tron_api_key_configured} value={billing.tron_api_key} clear={billing.clear_tron_api_key} onValue={(value) => setBilling({ ...billing, tron_api_key: value, clear_tron_api_key: false })} onClear={(value) => setBilling({ ...billing, clear_tron_api_key: value, tron_api_key: value ? "" : billing.tron_api_key })} /><SecretField label="TON Center API key" configured={billing.toncenter_api_key_configured} value={billing.toncenter_api_key} clear={billing.clear_toncenter_api_key} onValue={(value) => setBilling({ ...billing, toncenter_api_key: value, clear_toncenter_api_key: false })} onClear={(value) => setBilling({ ...billing, clear_toncenter_api_key: value, toncenter_api_key: value ? "" : billing.toncenter_api_key })} /></div></Section>

    {(billing.updated_at || billing.updated_by_email) && <p className="text-xs text-slate-600">Last updated {billing.updated_at ? new Date(billing.updated_at).toLocaleString() : ""}{billing.updated_by_email ? ` by ${billing.updated_by_email}` : ""}</p>}
  </form>;
}

function Section({ icon: Icon, title, description, children }) { return <section className="border-t border-slate-800 pt-6"><div className="grid lg:grid-cols-[240px_1fr] gap-5"><div><Icon className="w-5 h-5 text-indigo-300" /><h3 className="font-semibold mt-3">{title}</h3><p className="text-xs leading-5 text-slate-500 mt-1">{description}</p></div><div>{children}</div></div></section>; }
function WalletField({ network, note, value, onChange }) { return <label className="grid sm:grid-cols-[160px_1fr] gap-2 sm:gap-4 sm:items-center"><span><strong className="block text-sm text-slate-200">{network}</strong><small className="text-slate-600">{note}</small></span><input type="text" className="w-full" required value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function SecretField({ label, configured, value, clear, onValue, onClear }) { return <div><div className="flex items-center justify-between gap-3 mb-2"><label className="text-sm font-medium text-slate-200" htmlFor={label}>{label}</label><span className={`inline-flex items-center gap-1 text-xs ${configured && !clear ? "text-emerald-300" : "text-slate-500"}`}>{configured && !clear && <CheckCircle2 className="w-3.5 h-3.5" />}{configured && !clear ? "Configured" : "Not configured"}</span></div><input id={label} type="password" autoComplete="new-password" value={value} disabled={clear} placeholder={configured ? "Enter a new key to replace" : "Enter API key"} onChange={(event) => onValue(event.target.value)} /><label className="mt-2 flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={clear} onChange={(event) => onClear(event.target.checked)} /> Remove stored key when saving</label></div>; }
function Notice({ children, error }) { return <div className={`p-3 border rounded-md text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{children}</div>; }
