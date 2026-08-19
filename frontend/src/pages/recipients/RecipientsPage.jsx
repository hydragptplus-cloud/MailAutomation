import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Upload,
  Download,
  Trash2,
  Tag,
  UserCheck,
  FolderPlus,
  Eye,
  Edit2,
  Trash,
  RotateCcw,
  ListFilter,
} from "lucide-react";
import DataTable from "../../components/common/DataTable";
import SearchInput from "../../components/common/SearchInput";
import FilterDropdown from "../../components/common/FilterDropdown";
import StatusBadge from "../../components/common/StatusBadge";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import RecipientFormModal from "../../components/recipients/RecipientFormModal";
import BulkActionModal from "../../components/recipients/BulkActionModal";
import FormModal from "../../components/common/FormModal";
import CustomSelect from "../../components/common/CustomSelect";
import recipientsApi from "../../services/recipientsApi";
import { usePagination } from "../../hooks/usePagination";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../hooks/useToast";
import { usePermissions } from "../../hooks/usePermissions";

export default function RecipientsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [recipients, setRecipients] = useState([]);
  const [lists, setLists] = useState([]);
  const [tagsList, setTagsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedTag, setSelectedTag] = useState("");

  // Pagination & Multi-select
  const { page, setPage, pageSize, setPageSize, totalItems, setTotalItems, totalPages } =
    usePagination(1, 10);
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals
  const formModal = useModal();
  const bulkModal = useModal();
  const viewModal = useModal();
  const deleteModal = useModal();
  const exportModal = useModal();

  const [bulkActionType, setBulkActionType] = useState("status");
  const [exportScope, setExportScope] = useState("filtered");
  const [exportFormat, setExportFormat] = useState("csv");

  const fetchLists = async () => {
    try {
      const res = await recipientsApi.getLists();
      const items = res.data.results || res.data || [];
      setLists(items);
    } catch (_e) {
      // ignore
    }
  };

  const fetchRecipients = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
        search: search || undefined,
        list_id: selectedList || undefined,
        recipient_list: selectedList || undefined,
        status: selectedStatus || undefined,
        tag: selectedTag || undefined,
      };

      const res = await recipientsApi.getRecipients(params);
      const items = res.data.results || res.data || [];
      const count = res.data.count ?? items.length;

      setRecipients(items);
      setTotalItems(count);

      // Extract unique tags for filter dropdown
      const tagsSet = new Set();
      items.forEach((r) => {
        if (Array.isArray(r.tags)) r.tags.forEach((t) => tagsSet.add(t));
      });
      setTagsList(Array.from(tagsSet));
    } catch (err) {
      toast.error("Failed to load recipients list.");
      setRecipients([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, selectedList, selectedStatus, selectedTag]);

  useEffect(() => {
    fetchLists();
  }, []);

  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);

  const handleClearFilters = () => {
    setSearch("");
    setSelectedList("");
    setSelectedStatus("");
    setSelectedTag("");
    setPage(1);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(recipients.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id, checked) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleToggleStatus = async (recipient) => {
    const newStatus = recipient.status === "active" ? "inactive" : "active";
    try {
      await recipientsApi.updateRecipient(recipient.id, { status: newStatus });
      toast.success(`Recipient set to ${newStatus}.`);
      fetchRecipients();
    } catch (_e) {
      toast.error("Failed to update status.");
    }
  };

  const handleDeleteRecipient = async () => {
    if (!deleteModal.data?.id) return;
    try {
      await recipientsApi.deleteRecipient(deleteModal.data.id);
      toast.success("Recipient deleted successfully.");
      deleteModal.closeModal();
      fetchRecipients();
    } catch (_e) {
      toast.error("Failed to delete recipient.");
    }
  };

  const handleExportSubmit = async () => {
    try {
      const params = {
        scope: exportScope,
        format: exportFormat,
        search: exportScope === "filtered" ? search : undefined,
        list_id: exportScope === "filtered" ? selectedList : undefined,
        selected_ids: exportScope === "selected" ? selectedIds.join(",") : undefined,
      };

      const blobRes = await recipientsApi.exportRecipients(params);
      const url = window.URL.createObjectURL(new Blob([blobRes.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `recipients_export_${new Date().toISOString().slice(0, 10)}.${exportFormat}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Export generated successfully!");
      exportModal.closeModal();
    } catch (_e) {
      toast.error("Export failed.");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (val, row) => (
        <div>
          <span className="font-semibold text-slate-100">{val || "Unnamed"}</span>
          {row.company && <p className="text-[11px] text-slate-400">{row.company}</p>}
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (val) => <span className="font-mono text-slate-300">{val}</span>,
    },
    {
      key: "company",
      header: "Company",
      render: (val) => val || "—",
    },
    {
      key: "phone",
      header: "Phone",
      render: (val) => val || "—",
    },
    {
      key: "website",
      header: "Website",
      render: (val) => val ? (
        <a href={val.startsWith("http") ? val : `https://${val}`} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
          {val.replace(/^https?:\/\//, "")}
        </a>
      ) : "—",
    },
    {
      key: "list",
      header: "List",
      render: (val, row) => row.list_name || val?.name || "Default List",
    },
    {
      key: "tags",
      header: "Tags",
      render: (val) => {
        const tags = Array.isArray(val) ? val : [];
        if (!tags.length) return "—";
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((t, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (val) => <StatusBadge status={val} />,
    },
    {
      key: "created_at",
      header: "Created Date",
      render: (val) => (val ? new Date(val).toLocaleDateString() : "—"),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => viewModal.openModal(row)}
            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          {hasPermission("manage_recipients") && (
            <>
              <button
                onClick={() => formModal.openModal(row)}
                className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                title="Edit Recipient"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleToggleStatus(row)}
                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                title={row.status === "active" ? "Deactivate" : "Activate"}
              >
                <UserCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => deleteModal.openModal(row)}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Recipients Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Total Recipients: <span className="font-semibold text-indigo-400">{totalItems}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => navigate("/recipients/lists")}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 rounded-xl text-sm font-medium transition-colors"
          >
            <FolderPlus className="w-4 h-4 text-slate-400" />
            Manage Lists
          </button>

          {hasPermission("manage_recipients") && (
            <>
              <button
                onClick={() => navigate("/recipients/import")}
                className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 rounded-xl text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4 text-slate-400" />
                Import
              </button>
              <button
                onClick={() => exportModal.openModal()}
                className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 rounded-xl text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4 text-slate-400" />
                Export
              </button>
              <button
                onClick={() => formModal.openModal()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Add Recipient
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Search name, email, company..."
          />

          <FilterDropdown
            label="List"
            value={selectedList}
            onChange={(val) => {
              setSelectedList(val);
              setPage(1);
            }}
            options={lists.map((l) => ({ value: l.id, label: l.name || l.list_name || `List #${l.id}` }))}
          />

          <FilterDropdown
            label="Status"
            value={selectedStatus}
            onChange={(val) => {
              setSelectedStatus(val);
              setPage(1);
            }}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "unsubscribed", label: "Unsubscribed" },
              { value: "bounced", label: "Bounced" },
            ]}
          />

          <FilterDropdown
            label="Tag"
            value={selectedTag}
            onChange={(val) => {
              setSelectedTag(val);
              setPage(1);
            }}
            options={tagsList.map((t) => ({ value: t, label: t }))}
          />
        </div>

        {(search || selectedList || selectedStatus || selectedTag) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
            <span className="text-slate-400">Filters applied</span>
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Bulk Action Header Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-sm animate-fade-in">
          <span className="font-semibold text-indigo-200">
            {selectedIds.length} recipient(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setBulkActionType("status");
                bulkModal.openModal();
              }}
              className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-100 rounded-lg text-xs font-medium transition-colors"
            >
              Update Status
            </button>
            <button
              onClick={() => {
                setBulkActionType("list");
                bulkModal.openModal();
              }}
              className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-100 rounded-lg text-xs font-medium transition-colors"
            >
              Assign List
            </button>
            <button
              onClick={() => {
                setBulkActionType("tags");
                bulkModal.openModal();
              }}
              className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-100 rounded-lg text-xs font-medium transition-colors"
            >
              Assign Tags
            </button>
            <button
              onClick={() => {
                setBulkActionType("delete");
                bulkModal.openModal();
              }}
              className="px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-100 rounded-lg text-xs font-medium transition-colors"
            >
              Bulk Delete
            </button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={recipients}
        loading={loading}
        selectedIds={selectedIds}
        onSelectAll={handleSelectAll}
        onSelectRow={handleSelectRow}
        emptyTitle="No recipients found"
        emptyDescription="Try adjusting your filters or click 'Add Recipient' to create one."
        pagination={{
          page,
          pageSize,
          totalItems,
          totalPages,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      />

      {/* Modals */}
      <RecipientFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.closeModal}
        recipient={formModal.data}
        lists={lists}
        onSuccess={fetchRecipients}
      />

      <BulkActionModal
        isOpen={bulkModal.isOpen}
        onClose={bulkModal.closeModal}
        selectedIds={selectedIds}
        actionType={bulkActionType}
        lists={lists}
        onSuccess={() => {
          setSelectedIds([]);
          fetchRecipients();
        }}
      />

      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onCancel={deleteModal.closeModal}
        onConfirm={handleDeleteRecipient}
        title="Delete Recipient"
        message={`Are you sure you want to delete ${deleteModal.data?.email}? This action cannot be undone.`}
        confirmLabel="Delete"
        isDanger={true}
      />

      {/* View Details Modal */}
      <FormModal
        isOpen={viewModal.isOpen}
        onClose={viewModal.closeModal}
        title="Recipient Details"
        subtitle="Detailed record information."
      >
        {viewModal.data && (
          <div className="space-y-4 text-sm text-slate-200">
            <div className="grid grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div>
                <p className="text-xs text-slate-400 font-medium">Name</p>
                <p className="font-semibold">{viewModal.data.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Email</p>
                <p className="font-mono text-indigo-300">{viewModal.data.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Company</p>
                <p>{viewModal.data.company || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Phone</p>
                <p>{viewModal.data.phone || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Website</p>
                <p>
                  {viewModal.data.website ? (
                    <a href={viewModal.data.website.startsWith("http") ? viewModal.data.website : `https://${viewModal.data.website}`} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
                      {viewModal.data.website}
                    </a>
                  ) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Status</p>
                <StatusBadge status={viewModal.data.status} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">List</p>
                <p>{viewModal.data.list_name || viewModal.data.list?.name || "Default List"}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={viewModal.closeModal}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </FormModal>

      {/* Export Modal */}
      <FormModal
        isOpen={exportModal.isOpen}
        onClose={exportModal.closeModal}
        title="Export Recipients"
        subtitle="Download recipients list as CSV or Excel."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Export Range
            </label>
            <CustomSelect
              value={exportScope}
              onChange={setExportScope}
              options={[
                { value: "filtered", label: `Current Filtered Results (${totalItems})` },
                { value: "selected", label: `Selected Recipients (${selectedIds.length})`, disabled: selectedIds.length === 0 },
                { value: "all", label: "Entire List" },
              ]}
              ariaLabel="Export range"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              File Format
            </label>
            <CustomSelect
              value={exportFormat}
              onChange={setExportFormat}
              options={[
                { value: "csv", label: "CSV (.csv)" },
                { value: "xlsx", label: "Excel (.xlsx)" },
              ]}
              ariaLabel="Export file format"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={exportModal.closeModal}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleExportSubmit}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-600/25"
            >
              Download File
            </button>
          </div>
        </div>
      </FormModal>
    </div>
  );
}
