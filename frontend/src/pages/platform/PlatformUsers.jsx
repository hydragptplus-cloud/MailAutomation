import { useEffect, useMemo, useState } from "react";
import {
  Edit2,
  Key,
  Loader2,
  LogOut,
  Plus,
  Power,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import usersApi from "../../services/usersApi";
import api from "../../services/api";
import CustomSelect from "../../components/common/CustomSelect";
import SearchInput from "../../components/common/SearchInput";
import ConfirmDialog from "../../components/common/ConfirmDialog";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
];

const emptyForm = {
  name: "",
  email: "",
  username: "",
  password: "",
  role: "operator",
  organization: "",
};

export default function PlatformUsers() {
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterOrg, setFilterOrg] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Modals
  const [userModal, setUserModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [passwordModal, setPasswordModal] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    try {
      const params = {};
      if (filterOrg) params.organization = filterOrg;
      if (filterRole) params.role = filterRole;
      if (filterStatus === "active") params.is_active = true;
      if (filterStatus === "inactive") params.is_active = false;

      const [userRes, orgRes] = await Promise.all([
        usersApi.listUsers(params),
        api.get("/organizations/"),
      ]);
      setUsers(userRes.data.results || userRes.data || []);
      setOrganizations(orgRes.data.results || orgRes.data || []);
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filterOrg, filterRole, filterStatus]);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
  }, [users, search]);

  const [editingUser, setEditingUser] = useState(null);

  function openCreate() {
    setEditing(null);
    setEditingUser(null);
    setForm(emptyForm);
    setUserModal(true);
    setError("");
  }

  function openEdit(user) {
    setEditing(user.id);
    setEditingUser(user);
    setForm({
      name: user.name || "",
      email: user.email,
      username: user.username,
      password: "",
      role: user.role,
      organization: user.organization || "",
    });
    setUserModal(true);
    setError("");
  }

  function closeUserModal() {
    setUserModal(false);
    setEditing(null);
    setEditingUser(null);
    setForm(emptyForm);
  }

  async function saveUser(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (payload.organization) payload.organization = Number(payload.organization);
      if (editing) {
        await usersApi.updateUser(editing, payload);
        setMessage("User updated.");
      } else {
        await usersApi.createUser(payload);
        setMessage("User created.");
      }
      closeUserModal();
      await load();
    } catch (e) {
      setError(
        e.response?.data?.detail ||
        JSON.stringify(e.response?.data || "Unable to save user.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await usersApi.setPassword(passwordModal.id, newPassword);
      setMessage("Password updated and sessions revoked.");
      setPasswordModal(null);
      setNewPassword("");
      await load();
    } catch (e) {
      setError(
        e.response?.data?.detail ||
        JSON.stringify(e.response?.data || "Unable to reset password.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await usersApi.deleteUser(deleteTarget.id);
      setMessage("User deleted.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to delete user.");
    }
  }

  async function toggleActive(user) {
    setError("");
    try {
      if (user.is_active) {
        await usersApi.deactivateUser(user.id);
        setMessage(`${user.name || user.username} deactivated.`);
      } else {
        await usersApi.reactivateUser(user.id);
        setMessage(`${user.name || user.username} reactivated.`);
      }
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to update status.");
    }
  }

  async function handleRevokeSessions(user) {
    setError("");
    try {
      const res = await usersApi.revokeSessions(user.id);
      setMessage(res.data.detail || "Sessions revoked.");
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to revoke sessions.");
    }
  }

  async function handleReset2FA(user) {
    if (
      !window.confirm(
        `Are you sure you want to reset 2FA for ${user.name || user.username}? Their authenticator secret and backup codes will be cleared immediately.`
      )
    ) {
      return;
    }
    setError("");
    try {
      await usersApi.resetUser2FA(user.id);
      setMessage(`2FA has been reset for ${user.name || user.username}.`);
      await load();
      if (editing && editingUser?.id === user.id) {
        setEditingUser((prev) => (prev ? { ...prev, two_factor_enabled: false } : prev));
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to reset 2FA.");
    }
  }

  const roleBadge = (role) => {
    const colors = {
      admin: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      manager: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
      operator: "bg-sky-500/10 text-sky-400 border-sky-500/30",
      viewer: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    };
    return (
      <span
        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
          colors[role] || colors.viewer
        }`}
      >
        {role}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage all platform users across organizations.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-sm font-semibold shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add user
        </button>
      </div>

      {/* Notices */}
      {message && <Notice>{message}</Notice>}
      {error && !userModal && !passwordModal && (
        <Notice error>{error}</Notice>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, email, username..."
          className="flex-1"
        />
        <CustomSelect
          value={filterOrg}
          onChange={setFilterOrg}
          options={[
            { value: "", label: "All organizations" },
            ...organizations.map((o) => ({ value: String(o.id), label: o.name })),
          ]}
          ariaLabel="Filter by organization"
          className="sm:w-48"
        />
        <CustomSelect
          value={filterRole}
          onChange={setFilterRole}
          options={[
            { value: "", label: "All roles" },
            ...ROLES,
          ]}
          ariaLabel="Filter by role"
          className="sm:w-36"
        />
        <CustomSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
          ariaLabel="Filter by status"
          className="sm:w-36"
        />
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Organization</th>
              <th>2FA</th>
              <th>Status</th>
              <th>Sessions</th>
              <th>Last seen</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="font-medium text-slate-200">
                    {user.name || user.username}
                  </div>
                  <div className="text-xs text-slate-500">@{user.username}</div>
                </td>
                <td className="text-sm">{user.email}</td>
                <td>{roleBadge(user.role)}</td>
                <td className="text-sm text-slate-300">
                  {user.organization_name || "-"}
                </td>
                <td>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      user.two_factor_enabled
                        ? "bg-emerald-400/10 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-500/10 text-slate-500 border-slate-600/30"
                    }`}
                  >
                    {user.two_factor_enabled ? "Active" : "Off"}
                  </span>
                </td>
                <td>
                  <StatusBadge active={user.is_active} />
                </td>
                <td className="text-sm text-slate-400">
                  {user.active_session_count || 0}
                </td>
                <td className="text-xs text-slate-500">
                  {user.last_seen_at
                    ? new Date(user.last_seen_at).toLocaleString()
                    : "-"}
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <IconBtn
                      title="Edit user"
                      onClick={() => openEdit(user)}
                    >
                      <Edit2 />
                    </IconBtn>
                    {user.can_reset_password && (
                      <IconBtn
                        title="Reset password"
                        onClick={() => {
                          setPasswordModal(user);
                          setNewPassword("");
                          setError("");
                        }}
                        tone="warning"
                      >
                        <Key />
                      </IconBtn>
                    )}
                    {user.can_reset_2fa && (
                      <IconBtn
                        title="Reset 2FA Authenticator"
                        onClick={() => handleReset2FA(user)}
                        tone="warning"
                      >
                        <ShieldOff />
                      </IconBtn>
                    )}
                    {user.is_active && user.can_deactivate && (
                      <IconBtn
                        title="Deactivate"
                        onClick={() => toggleActive(user)}
                        tone="warning"
                      >
                        <UserX />
                      </IconBtn>
                    )}
                    {!user.is_active && (
                      <IconBtn
                        title="Reactivate"
                        onClick={() => toggleActive(user)}
                        tone="success"
                      >
                        <UserCheck />
                      </IconBtn>
                    )}
                    {user.active_session_count > 0 && (
                      <IconBtn
                        title="Revoke all sessions"
                        onClick={() => handleRevokeSessions(user)}
                        tone="warning"
                      >
                        <LogOut />
                      </IconBtn>
                    )}
                    {user.can_delete && (
                      <IconBtn
                        title="Delete user"
                        onClick={() => setDeleteTarget(user)}
                        tone="danger"
                      >
                        <Trash2 />
                      </IconBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan="8" className="py-12 text-center text-slate-500">
                  No users match these filters.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan="8" className="py-12 text-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                  Loading users…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600">
        Showing {filtered.length} of {users.length} users
      </p>

      {/* Add / Edit User Modal */}
      {userModal && (
        <Modal
          title={editing ? "Edit user" : "Add user"}
          onClose={closeUserModal}
        >
          <form onSubmit={saveUser} className="space-y-4">
            {error && <Notice error>{error}</Notice>}

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name">
                <input
                  type="text"
                  className="mt-1 w-full"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Email address">
                <input
                  type="email"
                  required
                  className="mt-1 w-full"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Username">
                <input
                  type="text"
                  className="mt-1 w-full"
                  placeholder="Auto-generated from email if empty"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  className="mt-1 w-full"
                  placeholder={editing ? "Leave blank to keep" : "Required"}
                  required={!editing}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Organization">
                <CustomSelect
                  className="mt-1"
                  value={String(form.organization)}
                  onChange={(val) =>
                    setForm({ ...form, organization: val })
                  }
                  options={[
                    { value: "", label: "Select organization" },
                    ...organizations.map((o) => ({
                      value: String(o.id),
                      label: o.name,
                    })),
                  ]}
                  ariaLabel="Organization"
                />
              </Field>
              <Field label="Role">
                <CustomSelect
                  className="mt-1"
                  value={form.role}
                  onChange={(role) => setForm({ ...form, role })}
                  options={ROLES}
                  ariaLabel="Role"
                />
              </Field>
            </div>

            {/* 2FA Security in Edit User Modal */}
            {editing && editingUser && (
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Shield className={`w-4 h-4 ${editingUser.two_factor_enabled ? "text-emerald-400" : "text-slate-500"}`} />
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Two-Factor Authentication (2FA)</p>
                    <p className="text-[11px] text-slate-400">
                      {editingUser.two_factor_enabled
                        ? "Authenticator app is active for this account."
                        : "2FA is not enabled for this user."}
                    </p>
                  </div>
                </div>
                {editingUser.can_reset_2fa && (
                  <button
                    type="button"
                    onClick={() => handleReset2FA(editingUser)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-medium transition-colors"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Reset 2FA
                  </button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={closeUserModal}
                className="px-4 py-2 rounded-xl border border-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : editing ? "Update user" : "Create user"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {passwordModal && (
        <Modal
          title={`Reset password - ${passwordModal.name || passwordModal.username}`}
          onClose={() => {
            setPasswordModal(null);
            setError("");
          }}
        >
          <form onSubmit={handleSetPassword} className="space-y-4">
            {error && <Notice error>{error}</Notice>}

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300 flex items-center gap-2">
              <Shield className="w-4 h-4 shrink-0" />
              Setting a new password will revoke all active sessions for this user.
            </div>

            <Field label="New temporary password">
              <input
                type="password"
                required
                className="mt-1 w-full"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setPasswordModal(null);
                  setError("");
                }}
                className="px-4 py-2 rounded-xl border border-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-amber-600 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Setting…" : "Set password"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete user"
        message={`Are you sure you want to permanently delete ${
          deleteTarget?.name || deleteTarget?.username
        }? This action cannot be undone. Consider deactivating instead.`}
        confirmLabel="Delete permanently"
        isDanger
      />
    </div>
  );
}

/* ── Utility components (local to this file) ─────────────────────── */

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        active
          ? "bg-emerald-400/10 text-emerald-300 border border-emerald-500/30"
          : "bg-slate-500/10 text-slate-400 border border-slate-600/30"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
        <div className="sticky top-0 z-10 bg-slate-900 flex items-center justify-between p-5 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100">{title}</h3>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
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

function IconBtn({ title, onClick, tone = "default", children }) {
  const colors = {
    default: "text-indigo-300 hover:bg-indigo-500/10",
    warning: "text-amber-300 hover:bg-amber-500/10",
    success: "text-emerald-300 hover:bg-emerald-500/10",
    danger: "text-rose-300 hover:bg-rose-500/10",
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-2 rounded-lg transition-colors ${colors[tone]}`}
    >
      <span className="[&>svg]:w-4 [&>svg]:h-4">{children}</span>
    </button>
  );
}

function Notice({ children, error }) {
  return (
    <div
      className={`p-3 border rounded-xl text-sm ${
        error
          ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
          : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
      }`}
    >
      {children}
    </div>
  );
}
