import React, { useState } from "react";
import FormModal from "../common/FormModal";
import CustomSelect from "../common/CustomSelect";
import recipientsApi from "../../services/recipientsApi";
import { useToast } from "../../hooks/useToast";

export default function BulkActionModal({
  isOpen,
  onClose,
  selectedIds = [],
  actionType = "status", // 'status', 'list', 'tags', 'delete'
  lists = [],
  onSuccess,
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState("");

  const titles = {
    status: "Bulk Update Status",
    list: "Bulk Assign Recipient List",
    tags: "Bulk Assign Tags",
    delete: "Bulk Delete Recipients",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (actionType !== "delete" && !value) {
      toast.warning("Please select or enter a value.");
      return;
    }

    setLoading(true);
    try {
      if (actionType === "delete") {
        await recipientsApi.bulkDelete(selectedIds);
        toast.success(`Successfully deleted ${selectedIds.length} recipients.`);
      } else {
        const payload = {
          ids: selectedIds,
          action: actionType,
          value: actionType === "tags" ? value.split(",").map((t) => t.trim()) : value,
        };
        await recipientsApi.bulkUpdate(payload);
        toast.success(`Successfully updated ${selectedIds.length} recipients.`);
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (_err) {
      toast.error("Failed to perform bulk operation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={titles[actionType] || "Bulk Action"}
      subtitle={`Apply action to ${selectedIds.length} selected recipients.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {actionType === "status" && (
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Select New Status
            </label>
            <CustomSelect
              value={value}
              onChange={setValue}
              options={[
                { value: "", label: "Select status..." },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "unsubscribed", label: "Unsubscribed" },
              ]}
              ariaLabel="Select new status"
            />
          </div>
        )}

        {actionType === "list" && (
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Select Target Recipient List
            </label>
            <CustomSelect
              value={value}
              onChange={setValue}
              options={[
                { value: "", label: "Select list..." },
                ...lists.map((list) => ({ value: list.id, label: list.name })),
              ]}
              ariaLabel="Select target recipient list"
            />
          </div>
        )}

        {actionType === "tags" && (
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Enter Tags (comma-separated)
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. Campaign-Ready, Qualified"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}

        {actionType === "delete" && (
          <p className="text-sm text-rose-300 font-medium">
            Are you sure you want to permanently delete {selectedIds.length} recipients? This action cannot be undone.
          </p>
        )}

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
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all shadow-md active:scale-95 disabled:opacity-50 ${
              actionType === "delete"
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25"
            }`}
          >
            {loading ? "Processing..." : "Confirm & Apply"}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
