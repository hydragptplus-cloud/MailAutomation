import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Megaphone, RefreshCw, Send, X } from "lucide-react";
import api from "../../services/api";
import ConfirmDialog from "../../components/common/ConfirmDialog";

const emptyForm = {
  subject: "",
  body: "",
  target_roles: [],
  target_plan_slugs: [],
  target_organization_statuses: [],
  active_only: true,
};

const roleOptions = [
  ["owner", "Owner"],
  ["admin", "Admin"],
  ["manager", "Manager"],
  ["operator", "Operator"],
  ["viewer", "Viewer"],
];

const organizationStatusOptions = [
  ["active", "Active"],
  ["suspended", "Suspended"],
  ["expired", "Expired"],
];

export default function PlatformBroadcasts() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewCount, setPreviewCount] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);

  const currentPreview = useMemo(() => {
    if (previewCount !== null) return previewCount;
    return form.subject || form.body ? "Check target" : "Not checked";
  }, [form, previewCount]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [broadcastResponse, planResponse] = await Promise.all([
        api.get("/platform/broadcasts/"),
        api.get("/billing/plans/"),
      ]);
      setBroadcasts(broadcastResponse.data.results || broadcastResponse.data || []);
      setPlans(planResponse.data.results || planResponse.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to load broadcasts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadDeliveries(broadcast) {
    setSelected(broadcast);
    setDeliveries([]);
    try {
      const response = await api.get(`/platform/broadcasts/${broadcast.id}/deliveries/`);
      setDeliveries(response.data.results || response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to load delivery log.");
    }
  }

  async function preview(event) {
    event.preventDefault();
    setPreviewing(true);
    setError("");
    setPreviewCount(null);
    try {
      const response = await api.post("/platform/broadcasts/preview/", form);
      setPreviewCount(response.data.count);
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setPreviewing(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post("/platform/broadcasts/", form);
      setForm(emptyForm);
      setPreviewCount(null);
      setMessage("Broadcast draft saved.");
      await load();
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function launchBroadcast(broadcast) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post(`/platform/broadcasts/${broadcast.id}/launch/`);
      setMessage("Broadcast queued.");
      await load();
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function cancelBroadcast(broadcast) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post(`/platform/broadcasts/${broadcast.id}/cancel/`);
      setMessage("Broadcast cancelled.");
      await load();
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Broadcasts</h2>
          <p className="text-sm text-slate-500 mt-1">
            Send platform updates to Mail Flow users from the general mailbox.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-slate-700 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}

      <form onSubmit={preview} className="border border-slate-800 rounded-xl p-5 bg-slate-950/30 space-y-5">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-indigo-300" />
          <h3 className="font-semibold text-slate-100">New broadcast</h3>
        </div>

        <div className="grid lg:grid-cols-[1fr_280px] gap-5">
          <div className="space-y-4">
            <Field label="Subject">
              <input
                required
                className="mt-1 w-full"
                value={form.subject}
                onChange={(event) => {
                  setForm({ ...form, subject: event.target.value });
                  setPreviewCount(null);
                }}
              />
            </Field>
            <Field label="Message">
              <textarea
                required
                rows={8}
                className="mt-1 w-full resize-y"
                value={form.body}
                onChange={(event) => {
                  setForm({ ...form, body: event.target.value });
                  setPreviewCount(null);
                }}
              />
            </Field>
          </div>

          <div className="space-y-4">
            <Checklist
              label="Roles"
              options={roleOptions}
              values={form.target_roles}
              onChange={(values) => {
                setForm({ ...form, target_roles: values });
                setPreviewCount(null);
              }}
            />
            <Checklist
              label="Plans"
              options={plans.map((plan) => [plan.slug, plan.name])}
              values={form.target_plan_slugs}
              onChange={(values) => {
                setForm({ ...form, target_plan_slugs: values });
                setPreviewCount(null);
              }}
            />
            <Checklist
              label="Organization status"
              options={organizationStatusOptions}
              values={form.target_organization_statuses}
              onChange={(values) => {
                setForm({ ...form, target_organization_statuses: values });
                setPreviewCount(null);
              }}
            />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.active_only}
                onChange={(event) => {
                  setForm({ ...form, active_only: event.target.checked });
                  setPreviewCount(null);
                }}
              />
              Active users only
            </label>
            <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-xs text-slate-500">Matching users</p>
              <p className="mt-1 text-2xl font-bold text-slate-100">{currentPreview}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="submit"
            disabled={previewing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-slate-700 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Check target
          </button>
          <button
            type="button"
            disabled={saving || previewCount === null || previewCount <= 0}
            onClick={saveDraft}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-indigo-600 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            Save draft
          </button>
        </div>
      </form>

      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table>
          <thead>
            <tr>
              <th>Broadcast</th>
              <th>Target</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Created</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((broadcast) => (
              <tr key={broadcast.id}>
                <td>
                  <div className="font-medium text-slate-200">{broadcast.subject}</div>
                  <div className="text-xs text-slate-500">{broadcast.created_by_email || "Owner"}</div>
                </td>
                <td className="text-xs text-slate-400">{targetSummary(broadcast)}</td>
                <td><StatusBadge status={broadcast.status} /></td>
                <td className="text-sm text-slate-300">
                  {broadcast.sent_count}/{broadcast.total_count || broadcast.preview_count || 0} sent
                  {broadcast.failed_count > 0 && <span className="ml-2 text-rose-300">{broadcast.failed_count} failed</span>}
                </td>
                <td className="text-xs text-slate-500">{new Date(broadcast.created_at).toLocaleString()}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => loadDeliveries(broadcast)} className="px-3 py-1.5 rounded-md border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-800">
                      Log
                    </button>
                    {broadcast.status === "draft" && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          const count = broadcast.preview_count ?? broadcast.total_count ?? 0;
                          setConfirmAction({
                            type: "launch",
                            broadcast,
                            title: "Send broadcast",
                            message: `Send "${broadcast.subject}" to ${count} matching user${count === 1 ? "" : "s"}?`,
                            confirmLabel: "Send broadcast",
                            isDanger: false,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" /> Send
                      </button>
                    )}
                    {["draft", "queued", "sending"].includes(broadcast.status) && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setConfirmAction({
                          type: "cancel",
                          broadcast,
                          title: "Cancel broadcast",
                          message: `Cancel "${broadcast.subject}"? Pending deliveries will be skipped.`,
                          confirmLabel: "Cancel broadcast",
                          isDanger: true,
                        })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-500/40 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan="6" className="py-12 text-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading broadcasts...
                </td>
              </tr>
            )}
            {!loading && broadcasts.length === 0 && (
              <tr>
                <td colSpan="6" className="py-12 text-center text-slate-500">No broadcasts yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 p-5">
              <div>
                <h3 className="font-semibold text-slate-100">Delivery log</h3>
                <p className="text-xs text-slate-500">{selected.subject}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              {deliveries.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                  <AlertTriangle className="w-4 h-4" /> No delivery rows have been created yet.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table>
                    <thead>
                      <tr>
                        <th>Recipient</th>
                        <th>Status</th>
                        <th>Attempts</th>
                        <th>Message</th>
                        <th>Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((delivery) => (
                        <tr key={delivery.id}>
                          <td>
                            <div className="text-sm font-medium text-slate-200">{delivery.recipient_email}</div>
                            <div className="text-xs text-slate-500">{delivery.recipient_name || "-"}</div>
                          </td>
                          <td><StatusBadge status={delivery.status} /></td>
                          <td className="text-sm text-slate-400">{delivery.attempts}</td>
                          <td className="text-xs text-slate-500">{delivery.message || "-"}</td>
                          <td className="text-xs text-slate-500">{delivery.sent_at ? new Date(delivery.sent_at).toLocaleString() : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        isDanger={confirmAction?.isDanger}
        loading={saving}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          const action = confirmAction;
          if (!action) return;
          setConfirmAction(null);
          if (action.type === "launch") {
            await launchBroadcast(action.broadcast);
          } else {
            await cancelBroadcast(action.broadcast);
          }
        }}
      />
    </div>
  );
}

function Checklist({ label, options, values, onChange }) {
  function toggle(value) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <div className="mt-2 space-y-1.5">
        {options.map(([value, text]) => (
          <label key={value} className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={values.includes(value)} onChange={() => toggle(value)} />
            {text}
          </label>
        ))}
        {options.length === 0 && <p className="text-xs text-slate-600">No options available.</p>}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold text-slate-400">
      {label}
      {children}
    </label>
  );
}

function Notice({ children, error }) {
  return (
    <div className={`p-3 border rounded-md text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const tones = {
    draft: "border-slate-600 bg-slate-600/10 text-slate-300",
    queued: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    sending: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
    completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    failed: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    cancelled: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    sent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    pending: "border-slate-600 bg-slate-600/10 text-slate-300",
    skipped: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${tones[status] || tones.draft}`}>{status}</span>;
}

function targetSummary(broadcast) {
  const parts = [];
  if (broadcast.active_only) parts.push("active users");
  if (broadcast.target_roles?.length) parts.push(`roles: ${broadcast.target_roles.join(", ")}`);
  if (broadcast.target_plan_slugs?.length) parts.push(`plans: ${broadcast.target_plan_slugs.join(", ")}`);
  if (broadcast.target_organization_statuses?.length) parts.push(`org: ${broadcast.target_organization_statuses.join(", ")}`);
  return parts.length ? parts.join(" | ") : "all users";
}

function formatError(requestError) {
  const data = requestError.response?.data;
  if (!data) return "Request failed.";
  if (typeof data === "string") return data;
  return data.detail || Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join(" ");
}
