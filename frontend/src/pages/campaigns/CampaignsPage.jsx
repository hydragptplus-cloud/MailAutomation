import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Copy,
  Eye,
  Edit2,
  Trash,
  BarChart3,
  Calendar,
  Layers,
  Activity,
  RotateCw,
} from "lucide-react";
import DataTable from "../../components/common/DataTable";
import SearchInput from "../../components/common/SearchInput";
import FilterDropdown from "../../components/common/FilterDropdown";
import StatusBadge from "../../components/common/StatusBadge";
import ProgressBar from "../../components/common/ProgressBar";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import campaignsApi from "../../services/campaignsApi";
import recipientsApi from "../../services/recipientsApi";
import smtpApi from "../../services/smtpApi";
import { usePagination } from "../../hooks/usePagination";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../hooks/useToast";
import { usePermissions } from "../../hooks/usePermissions";

export default function CampaignsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter Options
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { page, setPage, pageSize, setPageSize, totalItems, setTotalItems, totalPages } =
    usePagination(1, 10);

  const confirmModal = useModal();
  const [confirmAction, setConfirmAction] = useState({ type: "", title: "", message: "" });

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      };

      const res = await campaignsApi.getCampaigns(params);
      const items = res.data.results || res.data || [];
      const count = res.data.count ?? items.length;

      setCampaigns(items);
      setTotalItems(count);
    } catch (_e) {
      toast.error("Failed to load campaigns.");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Header Stat Counters
  const runningCount = campaigns.filter((c) => c.status === "running").length;
  const scheduledCount = campaigns.filter((c) => c.status === "scheduled").length;

  const handleExecuteAction = async () => {
    const { type, campaign } = confirmAction;
    if (!campaign?.id) return;

    try {
      if (type === "start") {
        await campaignsApi.startCampaign(campaign.id);
        toast.success("Campaign launched!");
      } else if (type === "pause") {
        await campaignsApi.pauseCampaign(campaign.id);
        toast.success("Campaign paused.");
      } else if (type === "resume") {
        await campaignsApi.resumeCampaign(campaign.id);
        toast.success("Campaign resumed.");
      } else if (type === "cancel") {
        await campaignsApi.cancelCampaign(campaign.id);
        toast.success("Campaign cancelled.");
      } else if (type === "delete") {
        await campaignsApi.deleteCampaign(campaign.id);
        toast.success("Campaign deleted.");
      }
      confirmModal.closeModal();
      fetchCampaigns();
    } catch (_e) {
      toast.error(`Failed to ${type} campaign.`);
    }
  };

  const handleDuplicate = async (campaign) => {
    try {
      const payload = {
        name: `${campaign.name} (Copy)`,
        subject: campaign.subject,
        description: campaign.description,
        template_id: campaign.template_id,
        recipient_list_id: campaign.recipient_list_id,
        smtp_id: campaign.smtp_id,
        status: "draft",
      };
      await campaignsApi.createCampaign(payload);
      toast.success("Campaign duplicated as Draft!");
      fetchCampaigns();
    } catch (_e) {
      toast.error("Failed to duplicate campaign.");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Campaign Name",
      render: (val, row) => (
        <div onClick={() => navigate(`/campaigns/${row.id}`)} className="cursor-pointer group">
          <span className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors">
            {val}
          </span>
          <p className="text-[11px] text-slate-400 font-mono line-clamp-1">{row.subject}</p>
        </div>
      ),
    },
    {
      key: "recipient_list",
      header: "Recipient List",
      render: (val, row) => row.recipient_list_name || val?.name || "Default List",
    },
    {
      key: "smtp",
      header: "SMTP Server",
      render: (val, row) => row.smtp_name || val?.name || "Default SMTP",
    },
    {
      key: "progress",
      header: "Sending Progress",
      render: (_, row) => {
        const sent = row.sent_count || 0;
        const failed = row.failed_count || 0;
        const pending = row.pending_count || 0;
        const total = row.total_recipients || sent + failed + pending;
        return <ProgressBar sent={sent} failed={failed} pending={pending} total={total} height="h-2" />;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (val) => <StatusBadge status={val} />,
    },
    {
      key: "scheduled_at",
      header: "Scheduled Time",
      render: (val) => (val ? new Date(val).toLocaleString() : "—"),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (_, row) => {
        const st = (row.status || "").toLowerCase();

        return (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => navigate(`/campaigns/${row.id}`)}
              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
              title="View Details"
            >
              <Eye className="w-4 h-4" />
            </button>

            {/* Status-based Action Controls */}
            {st === "draft" && (
              <>
                <button
                  onClick={() => {
                    setConfirmAction({
                      type: "start",
                      campaign: row,
                      title: "Launch Campaign",
                      message: `Are you sure you want to launch "${row.name}"? Emails will start sending immediately.`,
                    });
                    confirmModal.openModal();
                  }}
                  className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                  title="Start Campaign"
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setConfirmAction({
                      type: "delete",
                      campaign: row,
                      title: "Delete Campaign",
                      message: `Are you sure you want to delete draft "${row.name}"?`,
                    });
                    confirmModal.openModal();
                  }}
                  className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Delete Draft"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </>
            )}

            {st === "running" && (
              <>
                <button
                  onClick={() => {
                    setConfirmAction({
                      type: "pause",
                      campaign: row,
                      title: "Pause Campaign",
                      message: `Pause sending queue for "${row.name}"?`,
                    });
                    confirmModal.openModal();
                  }}
                  className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                  title="Pause Campaign"
                >
                  <Pause className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setConfirmAction({
                      type: "cancel",
                      campaign: row,
                      title: "Cancel Campaign",
                      message: `Cancel running campaign "${row.name}"?`,
                    });
                    confirmModal.openModal();
                  }}
                  className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Cancel Campaign"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </>
            )}

            {st === "paused" && (
              <>
                <button
                  onClick={() => {
                    setConfirmAction({
                      type: "resume",
                      campaign: row,
                      title: "Resume Campaign",
                      message: `Resume sending queue for "${row.name}"?`,
                    });
                    confirmModal.openModal();
                  }}
                  className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                  title="Resume Campaign"
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setConfirmAction({
                      type: "cancel",
                      campaign: row,
                      title: "Cancel Campaign",
                      message: `Cancel paused campaign "${row.name}"?`,
                    });
                    confirmModal.openModal();
                  }}
                  className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Cancel Campaign"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </>
            )}

            {(st === "completed" || st === "partially_completed" || st === "failed" || st === "cancelled") && (
              <>
                <button
                  onClick={() => handleDuplicate(row)}
                  className="p-1.5 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                  title="Duplicate Campaign"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate(`/reports/campaigns/${row.id}`)}
                  className="p-1.5 text-teal-400 hover:bg-teal-500/10 rounded-lg transition-colors"
                  title="View Analytics Report"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Campaigns</h1>
          <p className="text-sm text-slate-400 mt-1">
            Create, schedule, launch, and monitor email broadcasting campaigns.
          </p>
        </div>

        {hasPermission("create_campaigns") && (
          <button
            onClick={() => navigate("/campaigns/new")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-4 shadow-lg">
          <div className="p-3.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Total Campaigns</p>
            <p className="text-2xl font-bold text-slate-100 mt-0.5">{totalItems}</p>
          </div>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-4 shadow-lg">
          <div className="p-3.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Running Campaigns</p>
            <p className="text-2xl font-bold text-emerald-400 mt-0.5">{runningCount}</p>
          </div>
        </div>

        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-4 shadow-lg">
          <div className="p-3.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Scheduled Campaigns</p>
            <p className="text-2xl font-bold text-sky-400 mt-0.5">{scheduledCount}</p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Search campaign name or subject..."
          />

          <FilterDropdown
            label="Status"
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            options={[
              { value: "draft", label: "Draft" },
              { value: "scheduled", label: "Scheduled" },
              { value: "running", label: "Running" },
              { value: "paused", label: "Paused" },
              { value: "completed", label: "Completed" },
              { value: "partially_completed", label: "Partially Completed" },
              { value: "failed", label: "Failed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={campaigns}
        loading={loading}
        emptyTitle="No campaigns found"
        emptyDescription="Create your first campaign to begin automated email outreach."
        pagination={{
          page,
          pageSize,
          totalItems,
          totalPages,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      />

      {/* Action Confirmation Modal */}
      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onCancel={confirmModal.closeModal}
        onConfirm={handleExecuteAction}
        title={confirmAction.title}
        message={confirmAction.message}
        confirmLabel="Confirm Action"
        isDanger={confirmAction.type === "delete" || confirmAction.type === "cancel"}
      />
    </div>
  );
}
