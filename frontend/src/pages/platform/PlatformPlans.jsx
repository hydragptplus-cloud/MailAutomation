import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Tag, X } from "lucide-react";
import api from "../../services/api";

const emptyPlan = {
  slug: "", name: "", original_price_bdt: 0, discount_percent: 0, price_bdt: 0,
  email_limit: 0, daily_email_limit: 0, weekly_email_limit: 0,
  max_admins: 1, max_users: 1, max_smtp_accounts: 1,
  max_recipients: 10000, max_campaigns_per_day: 10,
  is_free: false, is_active: true, display_order: 0,
};

const numberFields = [
  ["original_price_bdt", "Original Price (BDT)"],
  ["discount_percent", "Discount percent (0-100%)"],
  ["email_limit", "Emails per 30 days"],
  ["daily_email_limit", "Daily email limit"],
  ["weekly_email_limit", "Weekly email limit"],
  ["max_admins", "Maximum administrators"],
  ["max_users", "Maximum users"],
  ["max_smtp_accounts", "SMTP accounts"],
  ["display_order", "Display order"],
  ["max_recipients", "Maximum recipients"],
  ["max_campaigns_per_day", "Campaigns per day"],
];

export default function PlatformPlans() {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(emptyPlan);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => api.get("/billing/platform/plans/").then((response) => setPlans(response.data.results || response.data));
  useEffect(() => { load().catch((requestError) => setError(requestError.response?.data?.detail || "Unable to load plans.")).finally(() => setLoading(false)); }, []);

  function createPlan() { setEditing(null); setForm({ ...emptyPlan, display_order: plans.length }); setModalOpen(true); setError(""); }
  function editPlan(plan) {
    setEditing(plan.id);
    setForm({
      ...emptyPlan,
      ...Object.fromEntries(Object.keys(emptyPlan).map((key) => [key, plan[key] !== undefined ? plan[key] : emptyPlan[key]])),
    });
    setModalOpen(true);
    setError("");
  }
  function close() { setModalOpen(false); setEditing(null); setForm(emptyPlan); }
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const payload = {
        ...form,
        original_price_bdt: form.is_free ? 0 : Number(form.original_price_bdt || 0),
        discount_percent: form.is_free ? 0 : Math.min(Math.max(Number(form.discount_percent || 0), 0), 100),
      };
      if (editing) await api.patch(`/billing/platform/plans/${editing}/`, payload);
      else await api.post("/billing/platform/plans/", payload);
      close(); setMessage("Pricing plan saved. The public pricing cards now use the updated values."); await load();
    } catch (requestError) { setError(requestError.response?.data?.detail || JSON.stringify(requestError.response?.data || "Unable to save pricing plan.")); }
    finally { setSaving(false); }
  }

  const calculatedPayable = form.is_free
    ? 0
    : Math.round(Number(form.original_price_bdt || 0) * (1 - Math.min(Math.max(Number(form.discount_percent || 0), 0), 100) / 100));

  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Pricing plans</h2><p className="text-sm text-slate-500 mt-1">Control the plans, limits, prices, discounts, and ordering shown on the public pricing page.</p></div><button onClick={createPlan} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-indigo-600 text-sm font-semibold"><Plus className="w-4 h-4" /> New plan</button></div>
    {message && <Notice>{message}</Notice>}{error && !modalOpen && <Notice error>{error}</Notice>}
    <div className="overflow-x-auto border border-slate-800 rounded-md"><table><thead><tr><th>Plan</th><th>Pricing & Discount</th><th>30-day emails</th><th>Daily / weekly</th><th>Team</th><th>SMTP</th><th>Order</th><th>Status</th><th className="text-right">Action</th></tr></thead><tbody>{plans.map((plan) => <tr key={plan.id}><td><strong className="block text-slate-200">{plan.name}</strong><span className="text-xs text-slate-600">{plan.slug}{plan.is_free ? " · free" : ""}</span></td><td>{plan.is_free ? <span className="font-semibold text-slate-300">Free</span> : <div className="space-y-0.5"><div className="flex items-center gap-2">{plan.discount_percent > 0 && <span className="text-xs text-slate-500 line-through">৳{new Intl.NumberFormat().format(plan.original_price_bdt || plan.price_bdt)}</span>}<span className="font-bold text-slate-200">৳{new Intl.NumberFormat().format(plan.price_bdt)}</span>{plan.discount_percent > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">-{plan.discount_percent}%</span>}</div></div>}</td><td>{new Intl.NumberFormat().format(plan.email_limit)}</td><td>{plan.daily_email_limit ? `${new Intl.NumberFormat().format(plan.daily_email_limit)} daily` : plan.weekly_email_limit ? `${new Intl.NumberFormat().format(plan.weekly_email_limit)} weekly` : "30-day only"}</td><td>{plan.max_admins} admin / {plan.max_users} users</td><td>{plan.max_smtp_accounts}</td><td>{plan.display_order}</td><td><span className={`inline-flex px-2 py-1 rounded text-xs ${plan.is_active ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-700/50 text-slate-400"}`}>{plan.is_active ? "Active" : "Hidden"}</span></td><td className="text-right"><button title="Edit plan" aria-label={`Edit ${plan.name}`} onClick={() => editPlan(plan)} className="inline-flex p-2 rounded text-indigo-300 hover:bg-slate-800"><Pencil className="w-4 h-4" /></button></td></tr>)}{!loading && plans.length === 0 && <tr><td colSpan="9" className="py-12 text-center text-slate-500">No pricing plans configured.</td></tr>}{loading && <tr><td colSpan="9" className="py-12 text-center text-slate-500">Loading pricing plans…</td></tr>}</tbody></table></div>
    <p className="text-xs text-slate-600">Inactive plans are hidden from new customers but remain attached to historical subscriptions and invoices.</p>

    {modalOpen && <div className="fixed inset-0 z-50 bg-slate-950/80 grid place-items-center p-4" role="dialog" aria-modal="true"><div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-md"><div className="sticky top-0 z-10 bg-slate-900 flex items-center justify-between p-5 border-b border-slate-800"><div><h3 className="font-semibold">{editing ? "Edit pricing plan" : "Create pricing plan"}</h3><p className="text-xs text-slate-500 mt-1">Changes to active plans appear on the landing page immediately.</p></div><button type="button" title="Close" onClick={close} className="p-2 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button></div><form onSubmit={save} className="p-5 space-y-5">{error && <Notice error>{error}</Notice>}<div className="grid sm:grid-cols-2 gap-4"><label className="text-xs text-slate-400">Plan name<input className="mt-1 w-full" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="text-xs text-slate-400">Slug<input className="mt-1 w-full" required pattern="[a-z0-9-]+" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label>{numberFields.map(([key, label]) => <label key={key} className="text-xs text-slate-400">{label}<input className="mt-1 w-full" required type="number" min="0" max={key === "discount_percent" ? 100 : undefined} disabled={(key === "original_price_bdt" || key === "discount_percent") && form.is_free} value={form[key]} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} /></label>)}</div><div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-between"><div className="flex items-center gap-3"><Tag className="w-5 h-5 text-indigo-400" /><div><p className="text-xs font-semibold text-indigo-200">Auto-calculated Payable Amount</p><p className="text-xs text-slate-400">{form.is_free ? "Free plan (always ৳0)" : `Original ৳${Number(form.original_price_bdt || 0).toLocaleString()} with ${Number(form.discount_percent || 0)}% discount`}</p></div></div><strong className="text-xl font-bold text-white">{form.is_free ? "Free (৳0)" : `৳${calculatedPayable.toLocaleString()}`}</strong></div><div className="grid sm:grid-cols-2 gap-3 border-t border-slate-800 pt-5"><Toggle checked={form.is_free} onChange={(checked) => setForm({ ...form, is_free: checked, original_price_bdt: checked ? 0 : form.original_price_bdt, discount_percent: checked ? 0 : form.discount_percent, price_bdt: 0 })} label="Free plan" note="Price & discount are fixed to zero." /><Toggle checked={form.is_active} onChange={(checked) => setForm({ ...form, is_active: checked })} label="Visible to customers" note="Inactive plans are hidden from pricing." /></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={close} className="px-4 py-2 rounded-md border border-slate-700">Cancel</button><button disabled={saving} className="px-4 py-2 rounded-md bg-indigo-600 font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save plan"}</button></div></form></div></div>}
  </div>;
}

function Toggle({ checked, onChange, label, note }) { return <label className={`flex gap-3 p-3 border rounded-md cursor-pointer ${checked ? "border-indigo-500/40 bg-indigo-500/5" : "border-slate-800"}`}><input className="sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className={`mt-0.5 w-5 h-5 shrink-0 rounded border grid place-items-center ${checked ? "bg-indigo-500 border-indigo-500" : "border-slate-600"}`}>{checked && <Check className="w-3.5 h-3.5" />}</span><span><strong className="block text-sm text-slate-200">{label}</strong><small className="text-slate-500">{note}</small></span></label>; }
function Notice({ children, error }) { return <div className={`p-3 border rounded-md text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{children}</div>; }
