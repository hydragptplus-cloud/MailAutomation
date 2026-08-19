import React, { useState, useEffect } from "react";
import FormModal from "../common/FormModal";
import CustomSelect from "../common/CustomSelect";
import smtpApi from "../../services/smtpApi";
import { useToast } from "../../hooks/useToast";

export default function SMTPFormModal({
  isOpen,
  onClose,
  server,
  onSuccess,
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    host: "",
    port: 587,
    username: "",
    password: "",
    encryption: "tls",
    from_name: "",
    from_email: "",
    reply_to: "",
    daily_limit: 1000,
    status: true,
  });

  const [loading, setLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name || "",
        host: server.host || "",
        port: server.port || 587,
        username: server.username || "",
        password: "••••••••••••",
        encryption: (server.encryption || "tls").toLowerCase(),
        from_name: server.from_name || "",
        from_email: server.from_email || "",
        reply_to: server.reply_to || "",
        daily_limit: server.daily_limit || 1000,
        status: server.status !== undefined ? server.status : true,
      });
      setPasswordTouched(false);
    } else {
      setFormData({
        name: "",
        host: "",
        port: 587,
        username: "",
        password: "",
        encryption: "tls",
        from_name: "",
        from_email: "",
        reply_to: "",
        daily_limit: 1000,
        status: true,
      });
      setPasswordTouched(true);
    }
  }, [server, isOpen]);

  const handleEncryptionChange = (newEncryption) => {
    const defaultPorts = {
      ssl: 465,
      tls: 587,
      none: 25,
    };
    const newPort = defaultPorts[newEncryption.toLowerCase()] ?? 587;
    setFormData((prev) => ({
      ...prev,
      encryption: newEncryption,
      port: newPort,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.host.trim() || !formData.username.trim()) {
      toast.warning("Please fill in all required SMTP server fields.");
      return;
    }

    setLoading(true);
    const payload = {
      ...formData,
      encryption: formData.encryption.toLowerCase(),
      from_email: formData.from_email || formData.username,
      port: Number(formData.port),
      daily_limit: Number(formData.daily_limit),
    };

    if (server?.id && !passwordTouched) {
      delete payload.password;
    }

    try {
      if (server?.id) {
        await smtpApi.updateServer(server.id, payload);
        toast.success("SMTP configuration updated successfully.");
      } else {
        await smtpApi.createServer(payload);
        toast.success("SMTP configuration created successfully.");
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const resp = err.response?.data;
      if (resp && typeof resp === "object") {
        if (resp.detail) {
          toast.error(resp.detail);
        } else {
          const msg = Object.entries(resp)
            .map(([k, v]) => `${k.replace("_", " ")}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join(" | ");
          toast.error(msg || "Failed to save SMTP configuration.");
        }
      } else {
        toast.error("Failed to save SMTP configuration.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={server ? "Edit SMTP Server" : "Add SMTP Server"}
      subtitle="Configure sending credentials and daily limits."
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name & Host */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              SMTP Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Mailgun Server or Backup SMTP"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Host <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              placeholder="e.g. smtp.mailgun.org or mail.example.com"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
        </div>

        {/* Port & Encryption */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Port <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
              placeholder="587"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Encryption</label>
            <CustomSelect
              value={formData.encryption}
              onChange={handleEncryptionChange}
              options={[
                { value: "tls", label: "STARTTLS (Port 587)" },
                { value: "ssl", label: "SSL / TLS (Port 465)" },
                { value: "none", label: "None (Port 25)" },
              ]}
              ariaLabel="SMTP encryption"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
            <CustomSelect
              value={formData.status ? "true" : "false"}
              onChange={(status) => setFormData({ ...formData, status: status === "true" })}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
              ariaLabel="SMTP status"
            />
          </div>
        </div>

        {/* Username & Password */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Username <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="postmaster@domain.com"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Password <span className="text-rose-400">*</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => {
                setPasswordTouched(true);
                setFormData({ ...formData, password: e.target.value });
              }}
              placeholder="••••••••••••"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
        </div>

        {/* Sender Info & Reply-To */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">From Name</label>
            <input
              type="text"
              value={formData.from_name}
              onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
              placeholder="Marketing Team"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">From Email</label>
            <input
              type="email"
              value={formData.from_email}
              onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
              placeholder="no-reply@domain.com"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Reply-To Email</label>
            <input
              type="email"
              value={formData.reply_to}
              onChange={(e) => setFormData({ ...formData, reply_to: e.target.value })}
              placeholder="support@domain.com"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
        </div>

        {/* Limits */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Daily Limit</label>
          <input
            type="number"
            value={formData.daily_limit}
            onChange={(e) => setFormData({ ...formData, daily_limit: Number(e.target.value) })}
            className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25 active:scale-95 disabled:opacity-50"
          >
            {loading ? "Saving..." : server ? "Update Server" : "Save SMTP Server"}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
