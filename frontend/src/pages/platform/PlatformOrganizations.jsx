import { useState, useEffect, useMemo } from "react";
import {
  Check,
  Edit2,
  Key,
  LifeBuoy,
  LogOut,
  Pencil,
  Plus,
  Power,
  Search,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
  Shield,
  Trash2,
} from "lucide-react";
import api from "../../services/api";
import usersApi from "../../services/usersApi";
import CustomSelect from "../../components/common/CustomSelect";
import SearchInput from "../../components/common/SearchInput";
import { apiError } from "../../utils/apiError";

const emptyOrganization = { name: "", plan_slug: "" };

export default function PlatformOrganizations() {
  const [organizations, setOrganizations] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(emptyOrganization);
  const [editing, setEditing] = useState(null);
  const [organizationModal, setOrganizationModal] = useState(false);
  const [adminOrg, setAdminOrg] = useState(null);
  const [admin, setAdmin] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
  });
  const [viewUsersOrg, setViewUsersOrg] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // User modal action state
  const [editingRole, setEditingRole] = useState(null); // { userId, role }
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [tempPassword, setTempPassword] = useState("");

  const load = () =>
    Promise.all([
      api.get("/organizations/"),
      api.get("/billing/platform/plans/"),
    ]).then(([orgResponse, planResponse]) => {
      setOrganizations(orgResponse.data.results || orgResponse.data);
      setPlans(planResponse.data.results || planResponse.data);
    });

  useEffect(() => {
    load()
      .catch((requestError) =>
        setError(
          requestError.response?.data?.detail || "Unable to load organizations."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      organizations.filter(
        (org) =>
          (status === "all" || org.status === status) &&
          org.name.toLowerCase().includes(search.toLowerCase())
      ),
    [organizations, search, status]
  );

  const selectedPlan = plans.find((plan) => plan.slug === form.plan_slug);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      plan_slug: plans.find((plan) => plan.is_active)?.slug || "",
    });
    setOrganizationModal(true);
    setMessage("");
    setError("");
  }

  function openEdit(org) {
    setEditing(org.id);
    setForm({ name: org.name, plan_slug: org.subscription?.plan || "" });
    setOrganizationModal(true);
    setError("");
  }

  function closeOrganizationModal() {
    setOrganizationModal(false);
    setEditing(null);
    setForm(emptyOrganization);
  }

  async function openViewUsers(org) {
    setViewUsersOrg(org);
    setLoadingUsers(true);
    setError("");

    try {
      const response = await api.get(`/users/?organization=${org.id}`);
      setOrgUsers(response.data.results || response.data);
    } catch (e) {
      setError(
        e.response?.data?.detail || "Unable to fetch organization users."
      );
    } finally {
      setLoadingUsers(false);
    }
  }

  async function saveOrganization(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (editing) {
        await api.patch(`/organizations/${editing}/`, form);
      } else {
        await api.post("/organizations/", form);
      }
      closeOrganizationModal();
      setMessage("Organization and subscription saved.");
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
        JSON.stringify(
          requestError.response?.data || "Unable to save organization."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(org) {
    const action = org.status === "active" ? "suspend" : "reactivate";
    if (
      !window.confirm(
        `${action === "suspend" ? "Suspend" : "Reactivate"} ${org.name}?`
      )
    ) {
      return;
    }

    try {
      await api.post(`/organizations/${org.id}/${action}/`);
      setMessage(
        `Organization ${action === "suspend" ? "suspended" : "reactivated"}.`
      );
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
        "Unable to update organization status."
      );
    }
  }

  async function toggleSupportWorkspace(org) {
    if (!org.support_workspace_available && !org.support_workspace_enabled) {
      setError("Mail workspace is available only on Premium+ and Custom plans.");
      return;
    }
    setError("");
    try {
      await api.post(`/organizations/${org.id}/toggle-support-workspace/`, {
        enabled: !org.support_workspace_enabled,
      });
      setMessage(`Mail workspace ${org.support_workspace_enabled ? "hidden from" : "enabled for"} ${org.name}.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to update support workspace access.");
    }
  }

  async function createAdmin(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api.post(`/organizations/${adminOrg.id}/create-admin/`, admin);
      setAdminOrg(null);
      setAdmin({ name: "", email: "", username: "", password: "" });
      setMessage("Organization administrator created.");
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
        JSON.stringify(
          requestError.response?.data || "Unable to create administrator."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrgUser(userId) {
    if (
      !window.confirm(
        "Are you sure you want to permanently delete this user? Consider deactivating instead."
      )
    ) {
      return;
    }

    try {
      await usersApi.deleteUser(userId);
      setOrgUsers((prev) => prev.filter((u) => u.id !== userId));
      setMessage("User deleted.");
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to delete user.");
    }
  }

  async function handleRoleChange(userId, newRole) {
    setError("");
    try {
      await usersApi.updateUser(userId, { role: newRole });
      setOrgUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      setEditingRole(null);
      setMessage("Role updated.");
      await load();
    } catch (e) {
      setError(apiError(e, "Unable to update role."));
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setError("");
    try {
      await usersApi.setPassword(passwordTarget.id, tempPassword);
      setMessage("Password updated and sessions revoked.");
      setPasswordTarget(null);
      setTempPassword("");
      await openViewUsers(viewUsersOrg);
    } catch (e) {
      setError(apiError(e, "Unable to reset password."));
    }
  }

  async function toggleUserActive(user) {
    setError("");
    try {
      if (user.is_active) {
        await usersApi.deactivateUser(user.id);
        setMessage(`${user.name || user.username} deactivated.`);
      } else {
        await usersApi.reactivateUser(user.id);
        setMessage(`${user.name || user.username} reactivated.`);
      }
      await openViewUsers(viewUsersOrg);
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to update user status.");
    }
  }

  async function handleRevokeUserSessions(user) {
    setError("");
    try {
      const res = await usersApi.revokeSessions(user.id);
      setMessage(res.data.detail || "Sessions revoked.");
      await openViewUsers(viewUsersOrg);
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to revoke sessions.");
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Organizations</h2>
          <p className="text-sm text-slate-500 mt-1">
            Assign a plan to provision every tenant limit and its 30-day
            subscription.
          </p>
        </div>

        <button
          onClick={openCreate}
          disabled={!plans.some((plan) => plan.is_active)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-indigo-600 text-sm font-semibold disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> New organization
        </button>
      </div>

      {/* Notices */}
      {message && <Notice>{message}</Notice>}
      {error && !organizationModal && !adminOrg && !viewUsersOrg && (
        <Notice error>{error}</Notice>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search organizations..."
          className="flex-1"
        />

        <CustomSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
            { value: "expired", label: "Expired" },
          ]}
          ariaLabel="Filter organization status"
          className="sm:w-44"
        />
      </div>

      {/* Organizations Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-md">
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Admins</th>
              <th>Members</th>
              <th>SMTP</th>
              <th>Recipients</th>
              <th>Support</th>
              <th>Monthly usage</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((org) => (
              <tr key={org.id}>
                <td className="font-medium text-slate-200">{org.name}</td>
                <td>{org.subscription?.plan_name || "No plan"}</td>
                <td>
                  <Status value={org.status} />
                </td>
                <td>
                  <span
                    className={
                      org.admin_count >= org.max_admins
                        ? "text-amber-400 font-semibold"
                        : "text-slate-300"
                    }
                  >
                    {org.admin_count}/{org.max_admins}
                  </span>
                </td>
                <td>
                  {org.user_count}/{org.max_users}
                </td>
                <td>
                  {org.smtp_count}/{org.max_smtp_accounts}
                  {org.mailbox_count ? (
                    <span className="ml-1 text-xs text-slate-500" title="Support inboxes share the SMTP account limit">
                      +{org.mailbox_count} inbox
                    </span>
                  ) : null}
                </td>
                <td>
                  {org.recipient_count}/{org.max_recipients}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => toggleSupportWorkspace(org)}
                    disabled={!org.support_workspace_available && !org.support_workspace_enabled}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${org.support_workspace_enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-400"}`}
                    title={!org.support_workspace_available ? "Premium+ and Custom plans only" : org.support_workspace_enabled ? "Hide mail workspace from organization admins" : "Enable mail workspace for organization admins"}
                  >
                    <LifeBuoy className="h-3.5 w-3.5" />
                    {!org.support_workspace_available ? "Plan locked" : org.support_workspace_enabled ? "Enabled" : "Hidden"}
                  </button>
                </td>
                <td>
                  {org.usage?.monthly_sent || 0}/{org.monthly_email_limit}
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <IconButton
                      title="View team members & admins"
                      onClick={() => openViewUsers(org)}
                    >
                      <Users />
                    </IconButton>
                    <IconButton
                      title="Edit organization"
                      onClick={() => openEdit(org)}
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      title={
                        org.status === "active"
                          ? "Suspend organization"
                          : "Reactivate organization"
                      }
                      onClick={() => toggleStatus(org)}
                      tone="warning"
                    >
                      <Power />
                    </IconButton>
                    <IconButton
                      title="Add administrator"
                      onClick={() => {
                        setAdminOrg(org);
                        setError("");
                      }}
                      tone="success"
                    >
                      <UserPlus />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan="10" className="py-12 text-center text-slate-500">
                  No organizations match these filters.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan="10" className="py-12 text-center text-slate-500">
                  Loading organizations…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600">
        Showing {filtered.length} of {organizations.length} organizations
      </p>

      {/* Organization Modal */}
      {organizationModal && (
        <Modal
          title={editing ? "Edit organization" : "Create organization"}
          onClose={closeOrganizationModal}
        >
          <form onSubmit={saveOrganization} className="space-y-5">
            {error && <Notice error>{error}</Notice>}

            <label className="block text-xs text-slate-400">
              Organization name
              <input
                type="text"
                className="mt-1 w-full"
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>

            <div>
              <span className="block text-xs text-slate-400">Pricing plan</span>
              <CustomSelect
                className="mt-1"
                value={form.plan_slug}
                onChange={(plan_slug) => setForm({ ...form, plan_slug })}
                options={[
                  { value: "", label: "Select a plan" },
                  ...plans
                    .filter(
                      (plan) => plan.is_active || plan.slug === form.plan_slug
                    )
                    .map((plan) => ({
                      value: plan.slug,
                      label: `${plan.name}${plan.is_active ? "" : " (inactive)"}`,
                    })),
                ]}
                ariaLabel="Pricing plan"
              />
            </div>

            {selectedPlan && <PlanSummary plan={selectedPlan} />}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeOrganizationModal}
                className="px-4 py-2 rounded-md border border-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={saving || !form.plan_slug}
                className="px-4 py-2 rounded-md bg-indigo-600 font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save organization"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Administrator Modal */}
      {adminOrg && (
        <Modal
          title={`Add administrator to ${adminOrg.name}`}
          onClose={() => {
            setAdminOrg(null);
            setError("");
          }}
        >
          <form onSubmit={createAdmin} className="space-y-4">
            {error && <Notice error>{error}</Notice>}

            <div className="p-3 bg-slate-950/60 rounded-md border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>Current Admins in Organization:</span>
              <strong
                className={`font-bold ${adminOrg.admin_count >= adminOrg.max_admins
                    ? "text-rose-400"
                    : "text-emerald-400"
                  }`}
              >
                {adminOrg.admin_count} / {adminOrg.max_admins}
              </strong>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {Object.keys(admin).map((key) => (
                <label key={key} className="text-xs text-slate-400">
                  {key[0].toUpperCase() + key.slice(1)}
                  <input
                    className="mt-1 w-full"
                    required
                    type={
                      key === "password"
                        ? "password"
                        : key === "email"
                          ? "email"
                          : "text"
                    }
                    value={admin[key]}
                    onChange={(event) =>
                      setAdmin({ ...admin, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAdminOrg(null);
                  setError("");
                }}
                className="px-4 py-2 rounded-md border border-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="px-4 py-2 rounded-md bg-indigo-600 font-semibold disabled:opacity-50"
              >
                Create administrator
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* View Users Modal */}
      {viewUsersOrg && (
        <Modal
          title={`Team & Admins - ${viewUsersOrg.name}`}
          onClose={() => {
            setViewUsersOrg(null);
            setPasswordTarget(null);
            setEditingRole(null);
            setError("");
          }}
        >
          <div className="space-y-4">
            {error && <Notice error>{error}</Notice>}

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>
                Admins:{" "}
                <strong className="text-slate-200">
                  {viewUsersOrg.admin_count}/{viewUsersOrg.max_admins}
                </strong>
              </span>
              <span>
                Members:{" "}
                <strong className="text-slate-200">
                  {viewUsersOrg.user_count}/{viewUsersOrg.max_users}
                </strong>
              </span>
            </div>

            {/* Password reset inline form */}
            {passwordTarget && (
              <form onSubmit={handleSetPassword} className="p-3 bg-slate-950/60 border border-amber-500/30 rounded-md space-y-3">
                <div className="flex items-center gap-2 text-xs text-amber-300">
                  <Shield className="w-3.5 h-3.5" />
                  Reset password for <strong>{passwordTarget.name || passwordTarget.username}</strong> - sessions will be revoked.
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    required
                    placeholder="New temporary password"
                    className="flex-1 text-sm"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                  />
                  <button className="px-3 py-1.5 rounded-md bg-amber-600 text-xs font-semibold">Set</button>
                  <button type="button" onClick={() => { setPasswordTarget(null); setTempPassword(""); }} className="px-3 py-1.5 rounded-md border border-slate-700 text-xs">Cancel</button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto border border-slate-800 rounded-md">
              <table>
                <thead>
                  <tr>
                    <th>Name / Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="font-medium text-slate-200">
                          {u.name || u.username}
                        </div>
                        <div className="text-xs text-slate-500">
                          @{u.username}
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        {editingRole?.userId === u.id ? (
                          <CustomSelect
                            value={editingRole.role}
                            onChange={(role) => handleRoleChange(u.id, role)}
                            options={[
                              { value: "admin", label: "Admin" },
                              { value: "manager", label: "Manager" },
                              { value: "operator", label: "Operator" },
                              { value: "viewer", label: "Viewer" },
                            ]}
                            ariaLabel="Change role"
                            className="w-28"
                          />
                        ) : (
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs uppercase font-semibold cursor-pointer ${u.role === "admin"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                : "bg-slate-800 text-slate-300"
                              }`}
                            onClick={() => setEditingRole({ userId: u.id, role: u.role })}
                            title="Click to change role"
                          >
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${u.is_active ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-500/10 text-slate-400"}`}>
                          {u.is_active ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <IconButton
                            title="Reset password"
                            onClick={() => {
                              setPasswordTarget(u);
                              setTempPassword("");
                              setError("");
                            }}
                            tone="warning"
                          >
                            <Key />
                          </IconButton>
                          {u.is_active && u.can_deactivate && (
                            <IconButton
                              title="Deactivate"
                              onClick={() => toggleUserActive(u)}
                              tone="warning"
                            >
                              <UserX />
                            </IconButton>
                          )}
                          {!u.is_active && (
                            <IconButton
                              title="Reactivate"
                              onClick={() => toggleUserActive(u)}
                              tone="success"
                            >
                              <UserCheck />
                            </IconButton>
                          )}
                          {(u.active_session_count || 0) > 0 && (
                            <IconButton
                              title="Revoke sessions"
                              onClick={() => handleRevokeUserSessions(u)}
                              tone="warning"
                            >
                              <LogOut />
                            </IconButton>
                          )}
                          {u.can_delete && (
                            <IconButton
                              title="Delete user"
                              onClick={() => deleteOrgUser(u.id)}
                              tone="warning"
                            >
                              <Trash2 />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!loadingUsers && orgUsers.length === 0 && (
                    <tr>
                      <td
                        colSpan="5"
                        className="py-8 text-center text-slate-500"
                      >
                        No users found for this organization.
                      </td>
                    </tr>
                  )}

                  {loadingUsers && (
                    <tr>
                      <td
                        colSpan="5"
                        className="py-8 text-center text-slate-500"
                      >
                        Loading team members…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setViewUsersOrg(null);
                  setPasswordTarget(null);
                  setEditingRole(null);
                  setError("");
                }}
                className="px-4 py-2 rounded-md border border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PlanSummary({ plan }) {
  const items = [
    `${plan.max_admins} administrators`,
    `${plan.max_users} users`,
    `${plan.max_smtp_accounts} SMTP accounts + support inboxes`,
    `${new Intl.NumberFormat().format(plan.max_recipients)} recipients`,
    `${new Intl.NumberFormat().format(plan.email_limit)} emails / 30 days`,
    `${plan.max_campaigns_per_day} campaigns / day`,
  ];

  return (
    <div className="border border-indigo-500/20 bg-indigo-500/5 p-4 rounded-md">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm text-indigo-200">{plan.name} limits</strong>
        <span className="text-sm font-semibold">
          {plan.is_free
            ? "Free"
            : `৳${new Intl.NumberFormat().format(plan.price_bdt)}`}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        {items.map((item) => (
          <span
            key={item}
            className="flex items-center gap-2 text-xs text-slate-400"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function Status({ value }) {
  return (
    <span
      className={`inline-flex px-2 py-1 rounded text-xs ${value === "active"
          ? "bg-emerald-400/10 text-emerald-300"
          : "bg-amber-400/10 text-amber-300"
        }`}
    >
      {value}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-md">
        <div className="sticky top-0 z-10 bg-slate-900 flex items-center justify-between p-5 border-b border-slate-800">
          <h3 className="font-semibold">{title}</h3>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function IconButton({ title, onClick, tone = "default", children }) {
  const colors = {
    default: "text-indigo-300",
    warning: "text-amber-300",
    success: "text-emerald-300",
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-2 rounded hover:bg-slate-800 ${colors[tone]}`}
    >
      <span className="[&>svg]:w-4 [&>svg]:h-4">{children}</span>
    </button>
  );
}

function Notice({ children, error }) {
  return (
    <div
      className={`p-3 border rounded-md text-sm ${error
          ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
          : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
        }`}
    >
      {children}
    </div>
  );
}
