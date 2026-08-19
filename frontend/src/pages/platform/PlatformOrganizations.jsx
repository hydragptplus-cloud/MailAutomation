import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Power, Search, UserPlus, X } from "lucide-react";
import api from "../../services/api";
import CustomSelect from "../../components/common/CustomSelect";

const emptyOrganization = { name: "", plan_slug: "" };

export default function PlatformOrganizations() {
  const [organizations, setOrganizations] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(emptyOrganization);
  const [editing, setEditing] = useState(null);
  const [organizationModal, setOrganizationModal] = useState(false);
  const [adminOrg, setAdminOrg] = useState(null);
  const [admin, setAdmin] = useState({ name: "", email: "", username: "", password: "" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => Promise.all([api.get("/organizations/"), api.get("/billing/platform/plans/")]).then(([orgResponse, planResponse]) => {
    setOrganizations(orgResponse.data.results || orgResponse.data);
    setPlans(planResponse.data.results || planResponse.data);
  });
  useEffect(() => { load().catch((requestError) => setError(requestError.response?.data?.detail || "Unable to load organizations.")).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => organizations.filter((org) => (status === "all" || org.status === status) && org.name.toLowerCase().includes(search.toLowerCase())), [organizations, search, status]);
  const selectedPlan = plans.find((plan) => plan.slug === form.plan_slug);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", plan_slug: plans.find((plan) => plan.is_active)?.slug || "" });
    setOrganizationModal(true); setMessage(""); setError("");
  }
  function openEdit(org) {
    setEditing(org.id);
    setForm({ name: org.name, plan_slug: org.subscription?.plan || "" });
    setOrganizationModal(true); setError("");
  }
  function closeOrganizationModal() { setOrganizationModal(false); setEditing(null); setForm(emptyOrganization); }

  async function saveOrganization(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (editing) await api.patch(`/organizations/${editing}/`, form);
      else await api.post("/organizations/", form);
      closeOrganizationModal(); setMessage("Organization and subscription saved."); await load();
    } catch (requestError) { setError(requestError.response?.data?.detail || JSON.stringify(requestError.response?.data || "Unable to save organization.")); }
    finally { setSaving(false); }
  }

  async function toggleStatus(org) {
    const action = org.status === "active" ? "suspend" : "reactivate";
    if (!window.confirm(`${action === "suspend" ? "Suspend" : "Reactivate"} ${org.name}?`)) return;
    try { await api.post(`/organizations/${org.id}/${action}/`); setMessage(`Organization ${action === "suspend" ? "suspended" : "reactivated"}.`); await load(); }
    catch (requestError) { setError(requestError.response?.data?.detail || "Unable to update organization status."); }
  }

  async function createAdmin(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api.post(`/organizations/${adminOrg.id}/create-admin/`, admin);
      setAdminOrg(null); setAdmin({ name: "", email: "", username: "", password: "" }); setMessage("Organization administrator created."); await load();
    } catch (requestError) { setError(requestError.response?.data?.detail || JSON.stringify(requestError.response?.data || "Unable to create administrator.")); }
    finally { setSaving(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Organizations</h2><p className="text-sm text-slate-500 mt-1">Assign a plan to provision every tenant limit and its 30-day subscription.</p></div><button onClick={openCreate} disabled={!plans.some((plan) => plan.is_active)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-indigo-600 text-sm font-semibold disabled:opacity-50"><Plus className="w-4 h-4" /> New organization</button></div>
    {message && <Notice>{message}</Notice>}{error && !organizationModal && <Notice error>{error}</Notice>}
    <div className="flex flex-col sm:flex-row gap-3"><label className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" /><input type="text" aria-label="Search organizations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search organizations" className="w-full pl-10" /></label><CustomSelect value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }, { value: "expired", label: "Expired" }]} ariaLabel="Filter organization status" className="sm:w-44" /></div>
    <div className="overflow-x-auto border border-slate-800 rounded-md"><table><thead><tr><th>Organization</th><th>Plan</th><th>Status</th><th>Users</th><th>SMTP</th><th>Recipients</th><th>Monthly usage</th><th className="text-right">Actions</th></tr></thead><tbody>{filtered.map((org) => <tr key={org.id}><td className="font-medium text-slate-200">{org.name}</td><td>{org.subscription?.plan_name || "No plan"}</td><td><Status value={org.status} /></td><td>{org.user_count}/{org.max_users}</td><td>{org.smtp_count}/{org.max_smtp_accounts}</td><td>{org.recipient_count}/{org.max_recipients}</td><td>{org.usage?.monthly_sent || 0}/{org.monthly_email_limit}</td><td><div className="flex justify-end gap-1"><IconButton title="Edit organization" onClick={() => openEdit(org)}><Pencil /></IconButton><IconButton title={org.status === "active" ? "Suspend organization" : "Reactivate organization"} onClick={() => toggleStatus(org)} tone="warning"><Power /></IconButton><IconButton title="Add administrator" onClick={() => setAdminOrg(org)} tone="success"><UserPlus /></IconButton></div></td></tr>)}{!loading && filtered.length === 0 && <tr><td colSpan="8" className="py-12 text-center text-slate-500">No organizations match these filters.</td></tr>}{loading && <tr><td colSpan="8" className="py-12 text-center text-slate-500">Loading organizations…</td></tr>}</tbody></table></div>
    <p className="text-xs text-slate-600">Showing {filtered.length} of {organizations.length} organizations</p>

    {organizationModal && <Modal title={editing ? "Edit organization" : "Create organization"} onClose={closeOrganizationModal}><form onSubmit={saveOrganization} className="space-y-5">{error && <Notice error>{error}</Notice>}<label className="block text-xs text-slate-400">Organization name<input type="text" className="mt-1 w-full" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><div><span className="block text-xs text-slate-400">Pricing plan</span><CustomSelect className="mt-1" value={form.plan_slug} onChange={(plan_slug) => setForm({ ...form, plan_slug })} options={[{ value: "", label: "Select a plan" }, ...plans.filter((plan) => plan.is_active || plan.slug === form.plan_slug).map((plan) => ({ value: plan.slug, label: `${plan.name}${plan.is_active ? "" : " (inactive)"}` }))]} ariaLabel="Pricing plan" /></div>{selectedPlan && <PlanSummary plan={selectedPlan} />}<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={closeOrganizationModal} className="px-4 py-2 rounded-md border border-slate-700">Cancel</button><button disabled={saving || !form.plan_slug} className="px-4 py-2 rounded-md bg-indigo-600 font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save organization"}</button></div></form></Modal>}
    {adminOrg && <Modal title={`Add administrator to ${adminOrg.name}`} onClose={() => setAdminOrg(null)}><form onSubmit={createAdmin} className="grid sm:grid-cols-2 gap-4">{Object.keys(admin).map((key) => <label key={key} className="text-xs text-slate-400">{key[0].toUpperCase() + key.slice(1)}<input className="mt-1 w-full" required type={key === "password" ? "password" : key === "email" ? "email" : "text"} value={admin[key]} onChange={(event) => setAdmin({ ...admin, [key]: event.target.value })} /></label>)}<div className="sm:col-span-2 flex justify-end gap-2"><button type="button" onClick={() => setAdminOrg(null)} className="px-4 py-2 rounded-md border border-slate-700">Cancel</button><button disabled={saving} className="px-4 py-2 rounded-md bg-indigo-600 font-semibold disabled:opacity-50">Create administrator</button></div></form></Modal>}
  </div>;
}

function PlanSummary({ plan }) { const items = [`${plan.max_admins} administrators`, `${plan.max_users} users`, `${plan.max_smtp_accounts} SMTP accounts`, `${new Intl.NumberFormat().format(plan.max_recipients)} recipients`, `${new Intl.NumberFormat().format(plan.email_limit)} emails / 30 days`, `${plan.max_campaigns_per_day} campaigns / day`]; return <div className="border border-indigo-500/20 bg-indigo-500/5 p-4 rounded-md"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-indigo-200">{plan.name} limits</strong><span className="text-sm font-semibold">{plan.is_free ? "Free" : `৳${new Intl.NumberFormat().format(plan.price_bdt)}`}</span></div><div className="grid sm:grid-cols-2 gap-2 mt-3">{items.map((item) => <span key={item} className="flex items-center gap-2 text-xs text-slate-400"><Check className="w-3.5 h-3.5 text-emerald-400" />{item}</span>)}</div></div>; }
function Status({ value }) { return <span className={`inline-flex px-2 py-1 rounded text-xs ${value === "active" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{value}</span>; }
function Modal({ title, onClose, children }) { return <div className="fixed inset-0 z-50 bg-slate-950/80 grid place-items-center p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-md"><div className="sticky top-0 z-10 bg-slate-900 flex items-center justify-between p-5 border-b border-slate-800"><h3 className="font-semibold">{title}</h3><button type="button" title="Close" onClick={onClose} className="p-2 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button></div><div className="p-5">{children}</div></div></div>; }
function IconButton({ title, onClick, tone = "default", children }) { const colors = { default: "text-indigo-300", warning: "text-amber-300", success: "text-emerald-300" }; return <button type="button" title={title} aria-label={title} onClick={onClick} className={`p-2 rounded hover:bg-slate-800 ${colors[tone]}`}><span className="[&>svg]:w-4 [&>svg]:h-4">{children}</span></button>; }
function Notice({ children, error }) { return <div className={`p-3 border rounded-md text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"}`}>{children}</div>; }
