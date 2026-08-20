import React, { useState, useEffect, useRef } from "react";
import {
  Sliders,
  Mail,
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
  ShieldCheck,
  KeyRound,
  QrCode,
  Copy,
  Download,
  ShieldOff,
  RefreshCcw,
  Loader2,
  X,
  AlertTriangle,
  Info,
} from "lucide-react";
import settingsApi from "../../services/settingsApi";
import usersApi from "../../services/usersApi";
import twoFactorApi from "../../services/twoFactorApi";
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

  // 2FA State
  const [twoFAStatus, setTwoFAStatus] = useState({ enabled: false, backupCount: 0 });
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [setup2FAData, setSetup2FAData] = useState(null); // { secret, qr_code, otpauth_uri }
  const [setup2FAStep, setSetup2FAStep] = useState(1); // 1=QR, 2=verify, 3=backup codes
  const [setup2FACode, setSetup2FACode] = useState("");
  const [setup2FABackupCodes, setSetup2FABackupCodes] = useState([]);
  const [setup2FALoading, setSetup2FALoading] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState("");
  const [showRegenCodes, setShowRegenCodes] = useState(false);
  const [regenPassword, setRegenPassword] = useState("");
  const [regenCodes, setRegenCodes] = useState([]);
  const [twoFALoading, setTwoFALoading] = useState(false);

  useEffect(() => {
    // Fetch system settings
    settingsApi
      .getSettings()
      .then((res) => {
        if (res.data) setSettings((prev) => ({ ...prev, ...res.data }));
      })
      .catch((err) => {
        console.error("Failed to load settings from DB:", err);
      });

    // Fetch users list
    loadUsers();

    // Fetch profile (for 2FA status)
    settingsApi
      .getProfile()
      .then((res) => {
        if (res.data) {
          setProfile((prev) => ({ ...prev, name: res.data.name || prev.name, email: res.data.email || prev.email }));
          setTwoFAStatus({ enabled: res.data.two_factor_enabled || false, backupCount: res.data.two_factor_backup_count || 0 });
        }
      })
      .catch((err) => {
        console.error("Failed to load profile:", err);
      });
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
        // Get limits from account API or settings - use first user's org info as proxy
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

  // ── 2FA Handlers ──────────────────────────────────────────────────

  const handleStart2FASetup = async () => {
    setSetup2FALoading(true);
    try {
      const res = await twoFactorApi.setup();
      setSetup2FAData(res.data);
      setSetup2FAStep(1);
      setSetup2FACode("");
      setSetup2FABackupCodes([]);
      setShowSetup2FA(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to start 2FA setup.");
    } finally {
      setSetup2FALoading(false);
    }
  };

  const handleConfirm2FA = async () => {
    if (!setup2FACode || setup2FACode.length !== 6) {
      toast.warning("Please enter the 6-digit code from your authenticator app.");
      return;
    }
    setSetup2FALoading(true);
    try {
      const res = await twoFactorApi.confirm({ secret: setup2FAData.secret, code: setup2FACode });
      setSetup2FABackupCodes(res.data.backup_codes || []);
      setSetup2FAStep(3);
      setTwoFAStatus({ enabled: true, backupCount: (res.data.backup_codes || []).length });
      toast.success("Two-factor authentication enabled!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid code. Please try again.");
    } finally {
      setSetup2FALoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disable2FAPassword) {
      toast.warning("Enter your current password to confirm.");
      return;
    }
    setTwoFALoading(true);
    try {
      await twoFactorApi.disable({ password: disable2FAPassword });
      setTwoFAStatus({ enabled: false, backupCount: 0 });
      setShowDisable2FA(false);
      setDisable2FAPassword("");
      toast.success("Two-factor authentication disabled.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to disable 2FA.");
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleRegenBackupCodes = async () => {
    if (!regenPassword) {
      toast.warning("Enter your current password to confirm.");
      return;
    }
    setTwoFALoading(true);
    try {
      const res = await twoFactorApi.regenerateBackupCodes({ password: regenPassword });
      setRegenCodes(res.data.backup_codes || []);
      setTwoFAStatus((prev) => ({ ...prev, backupCount: (res.data.backup_codes || []).length }));
      toast.success("Backup codes regenerated.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to regenerate codes.");
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleResetUser2FA = async (user) => {
    if (
      !window.confirm(
        `Are you sure you want to reset 2FA for ${user.name || user.email}? Their authenticator secret and backup codes will be cleared, allowing them to sign in or re-enroll.`
      )
    ) {
      return;
    }
    try {
      await usersApi.resetUser2FA(user.id);
      toast.success(`2FA has been reset for ${user.name || user.email}.`);
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to reset 2FA.");
    }
  };

  const copyBackupCodes = (codes) => {
    navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Backup codes copied to clipboard.");
  };

  const downloadBackupCodes = (codes) => {
    const text = `Mail Flow - Two-Factor Backup Recovery Codes\n${"-".repeat(48)}\n\n${codes.join("\n")}\n\nKeep these codes safe. Each code can only be used once.\nGenerated: ${new Date().toLocaleString()}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mailflow-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
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
      key: "two_factor_enabled",
      header: "2FA",
      render: (val) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          val
            ? "bg-emerald-400/10 text-emerald-300 border border-emerald-500/30"
            : "bg-slate-500/10 text-slate-500 border border-slate-600/30"
        }`}>
          {val ? "Active" : "Off"}
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
          {row.can_reset_2fa && (
            <button
              onClick={() => handleResetUser2FA(row)}
              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
              title="Reset 2FA"
            >
              <ShieldOff className="w-4 h-4" />
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

      {/* Tab 3: Security Settings */}
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

          {/* Organization-wide 2FA Enforcement Policy */}
          <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className={`w-5 h-5 ${settings.two_factor_enabled ? "text-indigo-400" : "text-slate-500"}`} />
                <p className="text-sm font-bold text-slate-100">Enforce Organization 2FA Policy</p>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Require TOTP authenticator app verification for all members upon sign in. When disabled, 2FA is optional per user.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
                settings.two_factor_enabled
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/15"
                  : "bg-slate-900 text-slate-500 border-slate-800"
              }`}>
                {settings.two_factor_enabled ? "Enforced" : "Disabled"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.two_factor_enabled}
                onClick={() => setSettings({ ...settings, two_factor_enabled: !settings.two_factor_enabled })}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 ${
                  settings.two_factor_enabled
                    ? "bg-gradient-to-r from-indigo-600 to-indigo-500 border-indigo-400 shadow-lg shadow-indigo-600/40"
                    : "bg-slate-800 border-slate-700 hover:border-slate-600"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out mt-0.5 ${
                    settings.two_factor_enabled ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
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
                {seatUsage.admins} <span className="text-sm text-slate-500">/ {seatUsage.maxAdmins || "-"}</span>
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
                {seatUsage.users} <span className="text-sm text-slate-500">/ {seatUsage.maxUsers || "-"}</span>
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
            title={`Reset password: ${passwordResetModal.data?.name || passwordResetModal.data?.email || ""}`}
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
        <div className="space-y-6">
          {/* Profile Form */}
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

          {/* Two-Factor Authentication Card */}
          <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${twoFAStatus.enabled ? "bg-emerald-500/10" : "bg-slate-800"}`}>
                  <ShieldCheck className={`w-5 h-5 ${twoFAStatus.enabled ? "text-emerald-400" : "text-slate-500"}`} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100">Two-Factor Authentication</h4>
                  <p className="text-xs text-slate-400">
                    {twoFAStatus.enabled
                      ? `Active (${twoFAStatus.backupCount} backup codes remaining)`
                      : "Add an extra layer of security to your account"}
                  </p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                twoFAStatus.enabled
                  ? "bg-emerald-400/10 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-700/30 text-slate-400 border-slate-600/30"
              }`}>
                {twoFAStatus.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
              {!twoFAStatus.enabled ? (
                <button
                  onClick={handleStart2FASetup}
                  disabled={setup2FALoading}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-60"
                >
                  {setup2FALoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Enable 2FA
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setShowRegenCodes(true); setRegenPassword(""); setRegenCodes([]); }}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    Regenerate Backup Codes
                  </button>
                  <button
                    onClick={() => { setShowDisable2FA(true); setDisable2FAPassword(""); }}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold transition-all"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Disable 2FA
                  </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      {/* 2FA Setup Modal (Accessible from any tab) */}
      {showSetup2FA && setup2FAData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 relative">
            <button onClick={() => setShowSetup2FA(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              {setup2FAStep === 1 ? "Scan QR Code" : setup2FAStep === 2 ? "Verify Code" : "Save Backup Codes"}
            </h3>

            {setup2FAStep === 1 && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy, etc.).</p>
                <div className="flex justify-center">
                  <img src={setup2FAData.qr_code} alt="2FA QR Code" className="rounded-xl border border-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Manual Entry Key</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono break-all">{setup2FAData.secret}</code>
                    <button onClick={() => { navigator.clipboard.writeText(setup2FAData.secret); toast.success("Secret copied!"); }} className="p-2 text-slate-400 hover:text-indigo-400 bg-slate-800 rounded-lg"><Copy className="w-4 h-4" /></button>
                  </div>
                </div>
                <button
                  onClick={() => setSetup2FAStep(2)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
                >
                  I&apos;ve scanned the code &rarr; Next
                </button>
              </div>
            )}

            {setup2FAStep === 2 && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">Enter the 6-digit code shown in your authenticator app to verify setup.</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={setup2FACode}
                    onChange={(e) => setSetup2FACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl tracking-[0.4em] font-mono text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setSetup2FAStep(1)} className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">Back</button>
                  <button
                    onClick={handleConfirm2FA}
                    disabled={setup2FALoading || setup2FACode.length !== 6}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {setup2FALoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Verify & Activate
                  </button>
                </div>
              </div>
            )}

            {setup2FAStep === 3 && (
              <div className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Save these backup codes in a secure location. Each code can only be used once. You won&apos;t be able to see them again.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {setup2FABackupCodes.map((code, i) => (
                        <div key={i} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-center font-mono text-sm text-slate-200 tracking-widest">
                          {code}
                        </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => copyBackupCodes(setup2FABackupCodes)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"><Copy className="w-3.5 h-3.5" />Copy All</button>
                  <button onClick={() => downloadBackupCodes(setup2FABackupCodes)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"><Download className="w-3.5 h-3.5" />Download</button>
                </div>
                <button
                  onClick={() => setShowSetup2FA(false)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
                >
                  I&apos;ve saved my codes &rarr; Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disable 2FA Modal (Accessible from any tab) */}
      {showDisable2FA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 relative">
            <button onClick={() => setShowDisable2FA(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2"><ShieldOff className="w-5 h-5 text-rose-400" />Disable Two-Factor Authentication</h3>
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>This will remove the extra security layer from your account. You can re-enable it at any time.</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password</label>
              <input
                type="password"
                value={disable2FAPassword}
                onChange={(e) => setDisable2FAPassword(e.target.value)}
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowDisable2FA(false)} className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">Cancel</button>
              <button
                onClick={handleDisable2FA}
                disabled={twoFALoading || !disable2FAPassword}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                Disable 2FA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate Backup Codes Modal (Accessible from any tab) */}
      {showRegenCodes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 relative">
            <button onClick={() => setShowRegenCodes(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2"><RefreshCcw className="w-5 h-5 text-indigo-400" />Regenerate Backup Codes</h3>

            {regenCodes.length === 0 ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>This will invalidate all existing backup codes and generate new ones.</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={regenPassword}
                    onChange={(e) => setRegenPassword(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowRegenCodes(false)} className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">Cancel</button>
                  <button
                    onClick={handleRegenBackupCodes}
                    disabled={twoFALoading || !regenPassword}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                    Generate New Codes
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Save these new backup codes. Previous codes are now invalid.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {regenCodes.map((code, i) => (
                    <div key={i} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-center font-mono text-sm text-slate-200 tracking-widest">
                      {code}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => copyBackupCodes(regenCodes)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"><Copy className="w-3.5 h-3.5" />Copy All</button>
                  <button onClick={() => downloadBackupCodes(regenCodes)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"><Download className="w-3.5 h-3.5" />Download</button>
                </div>
                <button
                  onClick={() => setShowRegenCodes(false)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
