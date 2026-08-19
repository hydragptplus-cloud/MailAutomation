import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Edit2, Trash, FolderOpen } from "lucide-react";
import recipientsApi from "../../services/recipientsApi";
import FormModal from "../../components/common/FormModal";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import EmptyState from "../../components/common/EmptyState";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../hooks/useToast";

export default function RecipientListsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);

  const formModal = useModal();
  const deleteModal = useModal();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchLists = async () => {
    setLoading(true);
    try {
      const res = await recipientsApi.getLists();
      setLists(res.data.results || res.data || []);
    } catch (_e) {
      toast.error("Failed to load recipient lists.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, []);

  const handleOpenForm = (list = null) => {
    if (list) {
      setName(list.name || "");
      setDescription(list.description || "");
      formModal.openModal(list);
    } else {
      setName("");
      setDescription("");
      formModal.openModal();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning("List name is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (formModal.data?.id) {
        await recipientsApi.updateList(formModal.data.id, { list_name: name.trim(), name: name.trim(), description: description.trim() });
        toast.success("List updated successfully.");
      } else {
        await recipientsApi.createList({ list_name: name.trim(), name: name.trim(), description: description.trim() });
        toast.success("List created successfully.");
      }
      formModal.closeModal();
      fetchLists();
    } catch (_e) {
      toast.error("Failed to save recipient list.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.data?.id) return;
    try {
      await recipientsApi.deleteList(deleteModal.data.id);
      toast.success("List deleted successfully.");
      deleteModal.closeModal();
      fetchLists();
    } catch (_e) {
      toast.error("Failed to delete recipient list.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/recipients")}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Recipient Lists</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Organize recipients into segment lists for targeted campaigns.
            </p>
          </div>
        </div>

        <button
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Create New List
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton type="cards" rows={4} />
      ) : lists.length === 0 ? (
        <EmptyState
          title="No lists created yet"
          description="Create recipient lists to categorize and manage email contacts."
          actionLabel="Create List"
          onAction={() => handleOpenForm()}
          icon={FolderOpen}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all shadow-xl"
            >
              <div>
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-semibold text-slate-100">{list.name}</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-medium">
                    {list.recipient_count ?? list.recipients_count ?? 0} Recipients
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                  {list.description || "No description provided."}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                <span>Created {list.created_at ? new Date(list.created_at).toLocaleDateString() : "Recently"}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenForm(list)}
                    className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteModal.openModal(list)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      <FormModal
        isOpen={formModal.isOpen}
        onClose={formModal.closeModal}
        title={formModal.data ? "Edit List" : "Create List"}
        subtitle="Manage recipient segment list metadata."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              List Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q3 Newsletter Leads"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of contacts in this list..."
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={formModal.closeModal}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-600/25"
            >
              {submitting ? "Saving..." : formModal.data ? "Update List" : "Create List"}
            </button>
          </div>
        </form>
      </FormModal>

      {/* Delete Modal */}
      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onCancel={deleteModal.closeModal}
        onConfirm={handleDelete}
        title="Delete List"
        message={`Are you sure you want to delete "${deleteModal.data?.name}"?`}
        confirmLabel="Delete List"
        isDanger={true}
      />
    </div>
  );
}
