import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RotateCcw,
  Send,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
} from "lucide-react";
import ProgressBar from "../../components/common/ProgressBar";
import StatusBadge from "../../components/common/StatusBadge";
import DataTable from "../../components/common/DataTable";
import SearchInput from "../../components/common/SearchInput";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import campaignsApi from "../../services/campaignsApi";
import { useToast } from "../../hooks/useToast";
import { usePagination } from "../../hooks/usePagination";

export default function CampaignDetailsPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  // Delivery Logs Table State
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const { page, setPage, pageSize, setPageSize, totalItems, setTotalItems, totalPages } =
    usePagination(1, 10);

  const fetchCampaign = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignsApi.getCampaign(campaignId);
      setCampaign(res.data);
    } catch (_e) {
      toast.error("Failed to load campaign details.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await campaignsApi.getLogs(campaignId, {
        page,
        page_size: pageSize,
        search: logSearch || undefined,
      });
      const items = res.data.results || res.data || [];
      const count = res.data.count ?? items.length;
      setLogs(items);
      setTotalItems(count);
    } catch (_e) {
      setLogs([]);
      setTotalItems(0);
    } finally {
      setLogsLoading(false);
    }
  }, [campaignId, page, pageSize, logSearch]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      await campaignsApi.retryFailed(campaignId);
      toast.success("Retry command issued for failed recipients!");
      fetchCampaign();
      fetchLogs();
    } catch (_e) {
      toast.error("Failed to retry emails.");
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton type="form" rows={4} />;
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center text-slate-300">
        <p>Campaign not found.</p>
        <button
          onClick={() => navigate("/campaigns")}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm"
        >
          Back to Campaigns
        </button>
      </div>
    );
  }

  const sent = campaign.sent_count || 0;
  const failed = campaign.failed_count || 0;
  const pending = campaign.pending_count || 0;
  const total = campaign.total_recipients || sent + failed + pending;
  const openRate = campaign.open_rate || 0;
  const clickRate = campaign.click_rate || 0;

  const logColumns = [
    {
      key: "recipient_email",
      header: "Recipient Email",
      render: (val, row) => (
        <div>
          <span className="font-mono text-slate-100">{val || row.email}</span>
          {row.recipient_name && <p className="text-[11px] text-slate-400">{row.recipient_name}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (val) => <StatusBadge status={val} />,
    },
    {
      key: "message",
      header: "Server Response / Reason",
      render: (val) => (
        <span className="text-slate-300 text-xs font-mono truncate max-w-xs block" title={val}>
          {val || "-"}
        </span>
      ),
    },
    {
      key: "attempt_count",
      header: "Attempts",
      render: (val) => val || 1,
    },
    {
      key: "sent_at",
      header: "Sent Time",
      render: (val) => (val ? new Date(val).toLocaleString() : "-"),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/campaigns")}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-100">{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
            </div>
            <p className="text-sm text-slate-400 mt-0.5">Subject: {campaign.subject}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {failed > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={retrying}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-600/25 active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Retrying..." : `Retry ${failed} Failed Emails`}
            </button>
          )}
          <button
            onClick={() => navigate(`/reports/campaigns/${campaign.id}`)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
          >
            <BarChart3 className="w-4 h-4" />
            Full Analytics Report
          </button>
        </div>
      </div>

      {/* Progress & Stat Cards */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="font-semibold text-slate-200">Delivery Progress</span>
            <span className="text-xs text-slate-400">Total Volume: {total}</span>
          </div>
          <ProgressBar sent={sent} failed={failed} pending={pending} total={total} height="h-3" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
            <p className="text-xs text-slate-400 font-semibold">Total Recipients</p>
            <p className="text-xl font-bold text-slate-100 mt-1">{total}</p>
          </div>
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <p className="text-xs text-emerald-400 font-semibold">Sent Successfully</p>
            <p className="text-xl font-bold text-emerald-200 mt-1">{sent}</p>
          </div>
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
            <p className="text-xs text-rose-400 font-semibold">Failed Deliveries</p>
            <p className="text-xl font-bold text-rose-200 mt-1">{failed}</p>
          </div>
          <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-xl">
            <p className="text-xs text-sky-400 font-semibold">Open Rate</p>
            <p className="text-xl font-bold text-sky-200 mt-1">{openRate}%</p>
          </div>
          <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
            <p className="text-xs text-indigo-400 font-semibold">Click Rate</p>
            <p className="text-xl font-bold text-indigo-200 mt-1">{clickRate}%</p>
          </div>
        </div>
      </div>

      {/* Delivery Logs Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-100">Recipient Delivery Logs</h3>
          <SearchInput
            value={logSearch}
            onChange={(val) => {
              setLogSearch(val);
              setPage(1);
            }}
            placeholder="Search email or response..."
            className="w-72"
          />
        </div>

        <DataTable
          columns={logColumns}
          data={logs}
          loading={logsLoading}
          emptyTitle="No delivery logs"
          emptyDescription="Logs will populate as emails are processed by the worker queue."
          pagination={{
            page,
            pageSize,
            totalItems,
            totalPages,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
          }}
        />
      </div>
    </div>
  );
}
