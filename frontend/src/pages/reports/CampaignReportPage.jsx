import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  Clock,
  Send,
  Users,
} from "lucide-react";
import DataTable from "../../components/common/DataTable";
import StatusBadge from "../../components/common/StatusBadge";
import ProgressBar from "../../components/common/ProgressBar";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import reportsApi from "../../services/reportsApi";
import campaignsApi from "../../services/campaignsApi";
import { useToast } from "../../hooks/useToast";
import { usePagination } from "../../hooks/usePagination";

export default function CampaignReportPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [campaignReport, setCampaignReport] = useState(null);
  const [loading, setLoading] = useState(true);

  // Recipient logs pagination
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const { page, setPage, pageSize, setPageSize, totalItems, setTotalItems, totalPages } =
    usePagination(1, 10);

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getCampaignReport(campaignId);
      setCampaignReport(res.data);
    } catch (_e) {
      const cRes = await campaignsApi.getCampaign(campaignId).catch(() => null);
      if (cRes?.data) {
        const cData = cRes.data;
        const total = cData.total_count || cData.total_recipients || 0;
        const sent = cData.sent_count || 0;
        const failed = cData.failed_count || 0;
        const pending = Math.max(0, total - (sent + failed));
        const rate = (sent + failed) > 0 ? round((sent / (sent + failed)) * 100, 1) : 100.0;

        setCampaignReport({
          campaign: cData,
          summary: {
            total,
            sent,
            failed,
            pending,
            success_rate: rate,
            open_rate: 0.0,
            click_rate: 0.0,
          },
          timeline: [
            { stage: "Campaign Created", timestamp: cData.created_at || new Date().toISOString() },
          ],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await campaignsApi.getLogs(campaignId, { page, page_size: pageSize });
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
  }, [campaignId, page, pageSize]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = async (format = "csv") => {
    try {
      const res = await reportsApi.exportReports({ campaign_id: campaignId, format });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `campaign_${campaignId}_report.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Report downloaded!");
    } catch (_e) {
      toast.error("Export failed.");
    }
  };

  if (loading) {
    return <LoadingSkeleton type="form" rows={5} />;
  }

  const campaign = campaignReport?.campaign || {};
  const summary = campaignReport?.summary || {};
  const timeline = campaignReport?.timeline || [];

  const logColumns = [
    { key: "recipient_email", header: "Recipient Email", render: (val, row) => <span className="font-mono text-slate-200">{val || row.email}</span> },
    { key: "status", header: "Status", render: (val) => <StatusBadge status={val} /> },
    { key: "message", header: "Server Response", render: (val, row) => <span className="font-mono text-xs text-slate-300">{val || row.message || "—"}</span> },
    { key: "sent_at", header: "Timestamp", render: (val) => (val ? new Date(val).toLocaleString() : "—") },
  ];

  return (
    <div className="space-y-6 print:p-0 print:bg-white print:text-black">
      {/* Printable Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/reports")}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Campaign Performance Report</h1>
            <p className="text-sm text-slate-400 mt-0.5">Campaign: {campaign.name || "Campaign Details"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-medium transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
          <button
            onClick={() => handleExport("csv")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Printable Executive Header */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl print:border-black">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Executive Report</span>
            <h2 className="text-xl font-bold text-slate-100 mt-1">{campaign.name}</h2>
            <p className="text-xs text-slate-400">Subject: {campaign.subject}</p>
          </div>
          <StatusBadge status={campaign.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
            <p className="text-xs text-slate-400 font-medium">Total Volume</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{summary.total || 0}</p>
          </div>
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <p className="text-xs text-emerald-400 font-medium">Success Rate</p>
            <p className="text-2xl font-bold text-emerald-200 mt-1">{summary.success_rate || 100}%</p>
          </div>
          <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-xl">
            <p className="text-xs text-sky-400 font-medium">Open Rate</p>
            <p className="text-2xl font-bold text-sky-200 mt-1">{summary.open_rate || 0}%</p>
          </div>
          <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
            <p className="text-xs text-indigo-400 font-medium">Click Rate</p>
            <p className="text-2xl font-bold text-indigo-200 mt-1">{summary.click_rate || 0}%</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-300">Delivery Breakdown</p>
          <ProgressBar sent={summary.sent} failed={summary.failed} pending={summary.pending} total={summary.total} height="h-3" />
        </div>
      </div>

      {/* Timeline Section */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        <h3 className="text-sm font-bold text-slate-100">Campaign Execution Timeline</h3>
        <div className="space-y-3">
          {timeline.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 text-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span className="font-semibold text-slate-200">{item.stage}</span>
              <span className="text-slate-400">— {new Date(item.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recipient Level Logs */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-100">Recipient-Level Execution Logs</h3>
        <DataTable
          columns={logColumns}
          data={logs}
          loading={logsLoading}
          emptyTitle="No logs available"
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
