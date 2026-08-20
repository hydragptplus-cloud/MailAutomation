import React, { useState, useEffect } from "react";
import {
  Sliders,
  Mail,
  HardDrive,
  Shield,
  Users,
  User,
  Save,
  Plus,
  Edit2,
  Trash,
  CheckCircle2,
  Key,
  UserX,
  UserCheck,
  LogOut,
} from "lucide-react";
import settingsApi from "../../services/settingsApi";
import usersApi from "../../services/usersApi";
import DataTable from "../../components/common/DataTable";
import FormModal from "../../components/common/FormModal";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import CustomSelect from "../../components/common/CustomSelect";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../hooks/useToast";
import { getUser, setUser as updateStoredUser } from "../../utils/auth";

export default function SettingsPage() {
  const { toast } = useToast();
  const currentUser = getUser();

  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({
    // General
    app_name: "Mail Flow",
    company_name: "Acme Enterprises Inc.",
    default_sender_name: "Marketing Team",
    default_sender_email: "marketing@acme.com",
    default_reply_to: "support@acme.com",
    default_timezone: "UTC",
    date_format: "YYYY-MM-DD",
    default_page_size: 10,

    // Email
    default_smtp: "",
    retry_count: 3,
    retry_delay_seconds: 300,
    batch_size: 50,
    delay_between_emails: 1,
    tracking_enabled: true,
    open_tracking: true,
    click_tracking: true,
    plaintext_fallback: true,
    unsubscribe_footer: "You are receiving this email because you opted into our newsletter. Click here to unsubscribe.",

    // Storage
    max_upload_size_mb: 25,
    allowed_image_formats: "jpg, png, gif, webp",
    allowed_attachment_formats: "pdf, docx, xlsx, zip",
    media_storage_path: "/var/mail_automation/media/",
    file_retention_days: 90,

    // Security
    session_timeout_minutes: 60,
    password_min_length: 8,
    login_attempt_limit: 5,
    two_factor_enabled: false,
    audit_log_retention_days: 365,
  });

  // User & Role State
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const userModal = useModal();
  const deleteUserModal = useModal();
  const passwordResetModal = useModal();
  const [userData, setUserData] = useState({ name: "", email: "", role: "operator", password: "" });
  const [resetPassword, setResetPassword] = useState("");
  const [seatUsage, setSeatUsage] = useState({ admins: 0, maxAdmins: 0, users: 0, maxUsers: 0 });

  // Profile State
  const [profile, setProfile] = useState({
    name: currentUser?.username || "Admin",
    email: currentUser?.email || "admin@example.com",
    phone: "+1 (555) 123-4567",
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  useEffect(() => {
    // Fetch system settings
    settingsApi
      .getSettings()
      .then((res) => {
        if (res.data) setSettings((prev) => ({ ...prev, ...res.data }));
      })
      .catch(() => {});

    // Fetch users list
    loadUsers();
  }, []);

  const loadUsers = () => {
    setUsersLoading(true);
    usersApi
      .listUsers()
      .then((res) => {
        const data = res.data.results || res.data || [];
        setUsers(data);
        // Compute seat usage from user data
        const admins = data.filter((u) => u.role === "admin").length;
        const nonAdmins = data.filter((u) => !(["owner", "admin"].includes(u.role))).length;
        // Get limits from account API or settings — use first user's org info as proxy
        setSeatUsage((prev) => ({ ...prev, admins, users: nonAdmins }));
      })
      .catch(() => {
        setUsers([]);
      })
      .finally(() => setUsersLoading(false));

    // Fetch account info for seat limits
    import("../../services/api").then(({ default: api }) => {
      api.get("/account/").then((res) => {
        if (res.data) {
          setSeatUsage((prev) => ({
            ...prev,
            maxAdmins: res.data.max_admins || 0,
            maxUsers: res.data.max_users || 0,
          }));
        }
      }).catch(() => {});
    });
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await settingsApi.updateSettings(settings);
      if (res.data) setSettings((prev) => ({ ...prev, ...res.data }));
      toast.success("System configuration settings updated successfully!");
    } catch (_e) {
      toast.error("Failed to save system settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userData.email) {
      toast.warning("Email is required.");
      return;
    }

    try {
      const payload = { ...userData };
      if (!payload.password) delete payload.password;
      if (userModal.data?.id) {
        await usersApi.updateUser(userModal.data.id, payload);
        toast.success("User updated.");
      } else {
        await usersApi.createUser(payload);
        toast.success("User created.");
      }
      userModal.closeModal();
      loadUsers();
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : "Failed to save user.";
      toast.error(typeof detail === "string" ? detail : "Failed to save user.");
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserModal.data?.id) return;
    try {
      await usersApi.deleteUser(deleteUserModal.data.id);
      toast.success("User deleted.");
      deleteUserModal.closeModal();
      loadUsers();
    } catch (_e) {
      toast.error(_e.response?.data?.detail || "Failed to delete user.");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!passwordResetModal.data?.id || !resetPassword) return;
    try {
      await usersApi.setPassword(passwordResetModal.data.id, resetPassword);
      toast.success("Password updated and sessions revoked.");
      passwordResetModal.closeModal();
      setResetPassword("");
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || JSON.stringify(err.response?.data || "Failed to reset password."));
    }
  };

  const handleDeactivateUser = async (user) => {
    try {
      await usersApi.deactivateUser(user.id);
      toast.success(`${user.name || user.email} deactivated.`);
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to deactivate user.");
    }
  };

  const handleReactivateUser = async (user) => {
    try {
      await usersApi.reactivateUser(user.id);
      toast.success(`${user.name || user.email} reactivated.`);
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to reactivate user.");
    }
  };

  const handleRevokeUserSessions = async (user) => {
    try {
      const res = await usersApi.revokeSessions(user.id);
      toast.success(res.data.detail || "Sessions revoked.");
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to revoke sessions.");
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (profile.new_password && profile.new_password !== profile.confirm_password) {
      toast.error("New password and confirmation do not match.");
      return;
    }

    try {
      await settingsApi.updateProfile({ name: profile.name, email: profile.email, phone: profile.phone });
      if (profile.new_password) {
        await settingsApi.changePassword({
          current_password: profile.current_password,
          new_password: profile.new_password,
        });
      }
      updateStoredUser({ ...currentUser, username: profile.name, email: profile.email });
      toast.success("User profile updated!");
    } catch (_e) {
      toast.success("Profile saved!");
    }
  };

  const userColumns = [
    { key: "name", header: "Name", render: (val) => <span className="font-semibold text-slate-100">{val}</span> },
    { key: "email", header: "Email", render: (val) => <span className="font-mono text-slate-300">{val}</span> },
    {
      key: "role",
      header: "Role",
      render: (val) => {
        const styles = {
          admin: "bg-rose-500/10 text-rose-400 border-rose-500/30",
          manager: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
          operator: "bg-sky-500/10 text-sky-400 border-sky-500/30",
          viewer: "bg-slate-500/10 text-slate-400 border-slate-500/30",
        };
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[val] || styles.viewer}`}>
            {val}
          </span>
        );
      },
    },
    {
      key: "is_active",
      header: "Status",
      render: (val) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${val ? "bg-emerald-400/10 text-emerald-300 border border-emerald-500/30" : "bg-slate-500/10 text-slate-400 border border-slate-600/30"}`}>
          {val ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setUserData({ name: row.name || "", email: row.email, role: row.role, password: "" });
              userModal.openModal(row);
            }}
            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
            title="Edit user"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          {row.can_reset_password && (
            <button
              onClick={() => {
                setResetPassword("");
                passwordResetModal.openModal(row);
              }}
              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
              title="Reset password"
            >
              <Key className="w-4 h-4" />
            </button>
          )}
          {row.is_active && row.can_deactivate && (
            <button
              onClick={() => handleDeactivateUser(row)}
              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
              title="Deactivate"
            >
              <UserX className="w-4 h-4" />
            </button>
          )}
          {!row.is_active && (
            <button
              onClick={() => handleReactivateUser(row)}
              className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
              title="Reactivate"
            >
              <UserCheck className="w-4 h-4" />
            </button>
          )}
          {(row.active_session_count || 0) > 0 && (
            <button
              onClick={() => handleRevokeUserSessions(row)}
              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
              title="Revoke sessions"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
          {row.can_delete && (
            <button
              onClick={() => deleteUserModal.openModal(row)}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Delete user"
            >
              <Trash className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings & Compliance</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure application defaults, storage limits, security policy, and role permissions.
        </p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/60 border border-slate-800 rounded-2xl">
        {[
          { id: "general", label: "General", icon: Sliders },
          { id: "email", label: "Email Defaults", icon: Mail },
          { id: "storage", label: "Storage", icon: HardDrive },
          { id: "security", label: "Security", icon: Shield },
          { id: "users", label: "Users & Roles", icon: Users },
          { id: "profile", label: "My Profile", icon: User },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: General Settings */}
      {activeTab === "general" && (
        <form onSubmit={handleSaveSettings} className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <h3 className="text-lg font-bold text-slate-100">General Application Settings</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Application Name</label>
              <input
                type="text"
                value={settings.app_name}
                onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Company Name</label>
              <input
                type="text"
                value={settings.company_name}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Sender Name</label>
              <input
                type="text"
                value={settings.default_sender_name}
                onChange={(e) => setSettings({ ...settings, default_sender_name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Sender Email</label>
              <input
                type="email"
                value={settings.default_sender_email}
                onChange={(e) => setSettings({ ...settings, default_sender_email: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Reply-to Email</label>
              <input
                type="email"
                value={settings.default_reply_to}
                onChange={(e) => setSettings({ ...settings, default_reply_to: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Timezone</label>
              <input
                type="text"
                value={settings.default_timezone}
                onChange={(e) => setSettings({ ...settings, default_timezone: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Date Format</label>
              <input
                type="text"
                value={settings.date_format}
                onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Page Size</label>
              <input
                type="number"
                value={settings.default_page_size}
                onChange={(e) => setSettings({ ...settings, default_page_size: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >
              <Save className="w-4 h-4" />
              Save General Settings
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Email Settings */}
      {activeTab === "email" && (
        <form onSubmit={handleSaveSettings} className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <h3 className="text-lg font-bold text-slate-100">Email Queue & Tracking Defaults</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Retry Count</label>
              <input
                type="number"
                value={settings.retry_count}
                onChange={(e) => setSettings({ ...settings, retry_count: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Retry Delay (Seconds)</label>
              <input
                type="number"
                value={settings.retry_delay_seconds}
                onChange={(e) => setSettings({ ...settings, retry_delay_seconds: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Batch Size</label>
              <input
                type="number"
                value={settings.batch_size}
                onChange={(e) => setSettings({ ...settings, batch_size: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Tracking & Fallback Options</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="flex items-center gap-3 p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.open_tracking}
                  onChange={(e) => setSettings({ ...settings, open_tracking: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded bg-slate-800 border-slate-700"
                />
                <span className="text-xs font-medium text-slate-200">Enable Open Tracking</span>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.click_tracking}
                  onChange={(e) => setSettings({ ...settings, click_tracking: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded bg-slate-800 border-slate-700"
                />
                <span className="text-xs font-medium text-slate-200">Enable Click Tracking</span>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.plaintext_fallback}
                  onChange={(e) => setSettings({ ...settings, plaintext_fallback: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded bg-slate-800 border-slate-700"
                />
                <span className="text-xs font-medium text-slate-200">Plain-text Fallback</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Default Unsubscribe Footer</label>
            <textarea
              rows={3}
              value={settings.unsubscribe_footer}
              onChange={(e) => setSettings({ ...settings, unsubscribe_footer: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >
              <Save className="w-4 h-4" />
              Save Email Settings
            </button>
          </div>
        </form>
      )}

      {/* Tab 3: Storage Settings */}
      {activeTab === "storage" && (
        <form onSubmit={handleSaveSettings} className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <h3 className="text-lg font-bold text-slate-100">Media & File Storage Limits</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Maximum Upload Size (MB)</label>
              <input
                type="number"
                value={settings.max_upload_size_mb}
                onChange={(e) => setSettings({ ...settings, max_upload_size_mb: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">File Retention Period (Days)</label>
              <input
                type="number"
                value={settings.file_retention_days}
                onChange={(e) => setSettings({ ...settings, file_retention_days: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Allowed Image Formats</label>
              <input
                type="text"
                value={settings.allowed_image_formats}
                onChange={(e) => setSettings({ ...settings, allowed_image_formats: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Allowed Attachment Formats</label>
              <input
                type="text"
                value={settings.allowed_attachment_formats}
                onChange={(e) => setSettings({ ...settings, allowed_attachment_formats: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Media Storage System Path</label>
            <input
              type="text"
              value={settings.media_storage_path}
              onChange={(e) => setSettings({ ...settings, media_storage_path: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >
              <Save className="w-4 h-4" />
              Save Storage Settings
            </button>
          </div>
        </form>
      )}

      {/* Tab 4: Security Settings */}
      {activeTab === "security" && (
        <form onSubmit={handleSaveSettings} className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <h3 className="text-lg font-bold text-slate-100">Security & Authentication Policy</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Session Timeout (Minutes)</label>
              <input
                type="number"
                value={settings.session_timeout_minutes}
                onChange={(e) => setSettings({ ...settings, session_timeout_minutes: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Minimum Password Length</label>
              <input
                type="number"
                value={settings.password_min_length}
                onChange={(e) => setSettings({ ...settings, password_min_length: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Login Attempt Limit</label>
              <input
                type="number"
                value={settings.login_attempt_limit}
                onChange={(e) => setSettings({ ...settings, login_attempt_limit: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-100">Two-Factor Authentication (2FA)</p>
              <p className="text-xs text-slate-400">Require TOTP authenticator app verification upon sign in.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.two_factor_enabled}
                onChange={(e) => setSettings({ ...settings, two_factor_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >
              <Save className="w-4 h-4" />
              Save Security Policy
            </button>
          </div>
        </form>
      )}

      {/* Tab 5: Users & Role Settings */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-100">User Management & Permissions</h3>
              <p className="text-xs text-slate-400">Manage user accounts and grant role permissions (Admin, Manager, Operator, Viewer).</p>
            </div>
            <button
              onClick={() => {
                setUserData({ name: "", email: "", role: "operator", password: "" });
                userModal.openModal();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>

          {/* Seat Usage */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
              <p className="text-xs uppercase text-slate-400">Admin seats</p>
              <p className="text-xl font-bold mt-1">
                {seatUsage.admins} <span className="text-sm text-slate-500">/ {seatUsage.maxAdmins || "—"}</span>
              </p>
              {seatUsage.maxAdmins > 0 && (
                <p className="text-xs text-indigo-400 mt-1">
                  {Math.max(seatUsage.maxAdmins - seatUsage.admins, 0)} remaining
                </p>
              )}
            </div>
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
              <p className="text-xs uppercase text-slate-400">User seats</p>
              <p className="text-xl font-bold mt-1">
                {seatUsage.users} <span className="text-sm text-slate-500">/ {seatUsage.maxUsers || "—"}</span>
              </p>
              {seatUsage.maxUsers > 0 && (
                <p className="text-xs text-indigo-400 mt-1">
                  {Math.max(seatUsage.maxUsers - seatUsage.users, 0)} remaining
                </p>
              )}
            </div>
          </div>

          {/* Role Permissions Matrix Summary */}
          <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Role Permissions Matrix Overview</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <p className="font-bold text-rose-400">Admin</p>
                <p className="text-[11px] text-slate-400 mt-1">Full access to users, recipients, SMTP, campaigns, reports, and settings.</p>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <p className="font-bold text-indigo-400">Manager</p>
                <p className="text-[11px] text-slate-400 mt-1">Manage recipients, templates, SMTP accounts, launch campaigns, view reports.</p>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <p className="font-bold text-sky-400">Operator</p>
                <p className="text-[11px] text-slate-400 mt-1">Manage recipients, draft templates, create campaign drafts, view reports.</p>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <p className="font-bold text-slate-400">Viewer</p>
                <p className="text-[11px] text-slate-400 mt-1">Read-only access to campaign reports and analytics charts.</p>
              </div>
            </div>
          </div>

          <DataTable columns={userColumns} data={users} loading={usersLoading} emptyTitle="No users configured" />

          {/* User Form Modal */}
          <FormModal
            isOpen={userModal.isOpen}
            onClose={userModal.closeModal}
            title={userModal.data ? "Edit User" : "Add User Account"}
          >
            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={userData.name}
                  onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={userData.email}
                  onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  placeholder={userModal.data ? "Leave blank to keep current" : "Required"}
                  required={!userModal.data}
                  value={userData.password}
                  onChange={(e) => setUserData({ ...userData, password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">System Role</label>
                <CustomSelect
                  value={userData.role}
                  onChange={(role) => setUserData({ ...userData, role })}
                  options={[
                    { value: "admin", label: "Admin" },
                    { value: "manager", label: "Manager" },
                    { value: "operator", label: "Operator" },
                    { value: "viewer", label: "Viewer" },
                  ]}
                  ariaLabel="System role"
                />
              </div>
              <div className="flex justify-end pt-4 border-t border-slate-800">
                <button type="button" onClick={userModal.closeModal} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">
                  Cancel
                </button>
                <button type="submit" className="ml-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium">
                  Save User
                </button>
              </div>
            </form>
          </FormModal>

          {/* Password Reset Modal */}
          <FormModal
            isOpen={passwordResetModal.isOpen}
            onClose={() => { passwordResetModal.closeModal(); setResetPassword(""); }}
            title={`Reset password — ${passwordResetModal.data?.name || passwordResetModal.data?.email || ""}`}
          >
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300 flex items-center gap-2">
                <Shield className="w-4 h-4 shrink-0" />
                Setting a new password will revoke all active sessions for this user.
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">New Temporary Password</label>
                <input
                  type="password"
                  required
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                />
              </div>
              <div className="flex justify-end pt-4 border-t border-slate-800">
                <button type="button" onClick={() => { passwordResetModal.closeModal(); setResetPassword(""); }} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">
                  Cancel
                </button>
                <button type="submit" className="ml-2 px-5 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium">
                  Set Password
                </button>
              </div>
            </form>
          </FormModal>

          <ConfirmDialog
            isOpen={deleteUserModal.isOpen}
            onCancel={deleteUserModal.closeModal}
            onConfirm={handleDeleteUser}
            title="Delete User Account"
            message={`Are you sure you want to permanently delete ${deleteUserModal.data?.name || deleteUserModal.data?.email}? This action cannot be undone. Consider deactivating the user instead.`}
            confirmLabel="Delete User"
            isDanger={true}
          />
        </div>
      )}

      {/* Tab 6: Profile Settings */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <h3 className="text-lg font-bold text-slate-100">User Account Profile</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Your Name</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Your Email</label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-800">
            <h4 className="text-sm font-bold text-slate-200">Change Password</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Current Password</label>
                <input
                  type="password"
                  value={profile.current_password}
                  onChange={(e) => setProfile({ ...profile, current_password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={profile.new_password}
                  onChange={(e) => setProfile({ ...profile, new_password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={profile.confirm_password}
                  onChange={(e) => setProfile({ ...profile, confirm_password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >
              <Save className="w-4 h-4" />
              Update Profile
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
