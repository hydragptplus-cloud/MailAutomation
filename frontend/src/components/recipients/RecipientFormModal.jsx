import React, { useState, useEffect } from "react";
import FormModal from "../common/FormModal";
import CustomSelect from "../common/CustomSelect";
import recipientsApi from "../../services/recipientsApi";
import { useToast } from "../../hooks/useToast";

export default function RecipientFormModal({
  isOpen,
  onClose,
  recipient,
  onSuccess,
  lists = [],
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    website: "",
    list_id: "",
    tags: "",
    status: "active",
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (recipient) {
      setFormData({
        name: recipient.name || "",
        email: recipient.email || "",
        company: recipient.company || "",
        phone: recipient.phone || "",
        website: recipient.website || "",
        list_id: recipient.recipient_list || recipient.list_id || recipient.list?.id || (lists[0]?.id || ""),
        tags: Array.isArray(recipient.tags) ? recipient.tags.join(", ") : recipient.tags || "",
        status: recipient.status || "active",
      });
    } else {
      setFormData({
        name: "",
        email: "",
        company: "",
        phone: "",
        website: "",
        list_id: lists[0]?.id || "",
        tags: "",
        status: "active",
      });
    }
    setErrors({});
  }, [recipient, isOpen, lists]);

  const validate = () => {
    const newErrors = {};
    const trimmedEmail = formData.email.trim();
    if (!trimmedEmail) {
      newErrors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = "Please enter a valid email address.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    let targetListId = formData.list_id;

    try {
      // Auto create General Contacts list if lists array was empty
      if (!targetListId) {
        const newListRes = await recipientsApi.createList({ name: "General Contacts", description: "Default contact list" });
        targetListId = newListRes.data?.id;
      }

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        company: formData.company.trim(),
        phone: formData.phone.trim(),
        website: formData.website.trim(),
        recipient_list: targetListId,
        list_id: targetListId,
        tags: formData.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        status: formData.status,
      };

      if (recipient?.id) {
        await recipientsApi.updateRecipient(recipient.id, payload);
        toast.success("Recipient updated successfully.");
      } else {
        await recipientsApi.createRecipient(payload);
        toast.success("Recipient created successfully.");
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const respData = err.response?.data;
      if (respData && typeof respData === "object") {
        if (respData.email) {
          setErrors((prev) => ({ ...prev, email: Array.isArray(respData.email) ? respData.email[0] : respData.email }));
        } else {
          toast.error(respData.detail || "Failed to save recipient.");
        }
      } else {
        toast.error("Failed to save recipient.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={recipient ? "Edit Recipient" : "Add Recipient"}
      subtitle="Fill in details to add or edit recipient information."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Email Address <span className="text-rose-400">*</span>
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="john.doe@example.com"
            className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          {errors.email && <p className="text-xs text-rose-400 mt-1">{errors.email}</p>}
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="John Doe"
            className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Company & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Company</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="Acme Corp"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Phone</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://example.com"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* List & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Recipient List
            </label>
            <CustomSelect
              value={formData.list_id}
              onChange={(listId) => setFormData({ ...formData, list_id: listId })}
              options={lists.length === 0
                ? [{ value: "", label: "Auto-create General Contacts" }]
                : lists.map((list) => ({ value: list.id, label: list.list_name || list.name }))}
              ariaLabel="Recipient list"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
            <CustomSelect
              value={formData.status}
              onChange={(status) => setFormData({ ...formData, status })}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "unsubscribed", label: "Unsubscribed" },
                { value: "bounced", label: "Bounced" },
              ]}
              ariaLabel="Recipient status"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
            placeholder="VIP, Lead, Newsletter"
            className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/25 active:scale-95 disabled:opacity-50"
          >
            {loading ? "Saving..." : recipient ? "Update Recipient" : "Add Recipient"}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
