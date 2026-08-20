import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  BarChart3,
  Send,
  CheckCircle2,
  AlertTriangle,
  Users,
  Layers,
  Filter,
  Eye,
  RotateCcw,
} from "lucide-react";
import DataTable from "../../components/common/DataTable";
import SearchInput from "../../components/common/SearchInput";
import FilterDropdown from "../../components/common/FilterDropdown";
import StatusBadge from "../../components/common/StatusBadge";
import ReportCharts from "../../components/reports/ReportCharts";
import reportsApi from "../../services/reportsApi";
import campaignsApi from "../../services/campaignsApi";
import smtpApi from "../../services/smtpApi";
import recipientsApi from "../../services/recipientsApi";
import { usePagination } from "../../hooks/usePagination";
import { useToast } from "../../hooks/useToast";

export default function ReportsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("campaigns"); // 'campaigns' or 'logs'
  const [summary, setSummary] = useState({
    total_campaigns: 0,
    total_emails_sent: 0,
    successful_deliveries: 0,
    failed_deliveries: 0,
    success_rate: 0,
    active_recipients: 0,
  });

  const [chartData, setChartData] = useState({
    dailyVolume: [],
    successRatio: [],
    campaignPerformance: [],
    smtpUsage: [],
    failureReasons: [],
  });

  // Filter States
  const [dateRange, setDateRange] = useState("30");
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedSmtp, setSelectedSmtp] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  // Dropdown options
  const [campaignOptions, setCampaignOptions] = useState([]);
  const [smtpOptions, setSmtpOptions] = useState([]);
  const [listOptions, setListOptions] = useState([]);

  // Campaign Reports Table State
  const [campaignReports, setCampaignReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Delivery Logs Table State
  const [logs, setLogs] = useState([]);
  const [logSearch, setLogSearch] = useState("");

  const { page, setPage, pageSize, setPageSize, totalItems, setTotalItems, totalPages } =
    usePagination(1, 10);

  const fetchDropdownOptions = async () => {
    campaignsApi.getCampaigns().then((res) => setCampaignOptions(res.data.results || res.data || [])).catch(() => {});
    smtpApi.getServers().then((res) => setSmtpOptions(res.data.results || res.data || [])).catch(() => {});
    recipientsApi.getLists().then((res) => setListOptions(res.data.results || res.data || [])).catch(() => {});
  };

  const fetchSummary = useCallback(async () => {
    try {
      const res = await reportsApi.getSummary({
        date_range: dateRange,
        campaign_id: selectedCampaign || undefined,
        smtp_id: selectedSmtp || undefined,
        list_id: selectedList || undefined,
      });

      const data = res.data || {};
      setSummary({
        total_campaigns: data.total_campaigns ?? 0,
        total_emails_sent: data.total_emails_sent ?? 0,
        successful_deliveries: data.successful_deliveries ?? 0,
        failed_deliveries: data.failed_deliveries ?? 0,
        success_rate: data.success_rate ?? 0,
        active_recipients: data.active_recipients ?? 0,
      });

      if (data.charts) {
        setChartData(data.charts);
      }
    } catch (_e) {
      setSummary({
        total_campaigns: 0,
        total_emails_sent: 0,
        successful_deliveries: 0,
        failed_deliveries: 0,
        success_rate: 0,
        active_recipients: 0,
      });
    }
  }, [dateRange, selectedCampaign, selectedSmtp, selectedList]);

  const fetchTableData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "campaigns") {
        const res = await reportsApi.getCampaignReports({
          page,
          page_size: pageSize,
          campaign_id: selectedCampaign || undefined,
          smtp_id: selectedSmtp || undefined,
          status: selectedStatus || undefined,
        });
        const items = res.data.results || res.data || [];
        setCampaignReports(items);
        setTotalItems(res.data.count ?? items.length);
      } else {
        const res = await reportsApi.getDeliveryLogs({
          page,
          page_size: pageSize,
          search: logSearch || undefined,
          status: selectedStatus || undefined,
        });
        const items = res.data.results || res.data || [];
        setLogs(items);
        setTotalItems(res.data.count ?? items.length);
      }
    } catch (_e) {
      setCampaignReports([]);
      setLogs([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, pageSize, selectedCampaign, selectedSmtp, selectedStatus, logSearch]);

  useEffect(() => {
    fetchDropdownOptions();
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  const handleExport = async (type = "campaigns", format = "csv") => {
    try {
      const res = await reportsApi.exportReports({
        type,
        format,
        campaign_id: selectedCampaign || undefined,
        smtp_id: selectedSmtp || undefined,
      });
      const mimeType = format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv;charset=utf-8;";
      const blob = new Blob([res.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `reports_${type}_export.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${type} reports as ${format.toUpperCase()}`);
    } catch (_e) {
      toast.error("Export failed.");
    }
  };

  const campaignColumns = [
    {
      key: "name",
      header: "Campaign Name",
      render: (val, row) => (
        <div onClick={() => navigate(`/reports/campaigns/${row.id}`)} className="cursor-pointer group">
          <span className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors">
            {val || row.campaign_name}
          </span>
          <p className="text-[11px] text-slate-400 font-mono">{row.subject}</p>
        </div>
      ),
    },
    { key: "recipients", header: "Recipients", render: (val, row) => val || row.total_recipients || 0 },
    { key: "sent", header: "Sent", render: (val, row) => <span className="text-emerald-400 font-semibold">{val || row.sent_count || 0}</span> },
    { key: "failed", header: "Failed", render: (val, row) => <span className="text-rose-400 font-semibold">{val || row.failed_count || 0}</span> },
    {
      key: "success_rate",
      header: "Success Rate",
      render: (val, row) => {
        const rate = val || row.rate || 100;
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold text-xs">
            {rate}%
          </span>
        );
      },
    },
    { key: "started_at", header: "Started Time", render: (val) => (val ? new Date(val).toLocaleDateString() : "-") },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (_, row) => (
        <button
          onClick={() => navigate(`/reports/campaigns/${row.id}`)}
          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
          title="View Full Report"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  const logColumns = [
    { key: "recipient_email", header: "Recipient Email", render: (val) => <span className="font-mono text-slate-200">{val}</span> },
    { key: "campaign_name", header: "Campaign", render: (val) => val || "Campaign" },
    { key: "smtp_name", header: "SMTP Server", render: (val) => val || "Default SMTP" },
    { key: "status", header: "Status", render: (val) => <StatusBadge status={val} /> },
    { key: "message", header: "Server Response", render: (val) => <span className="font-mono text-xs text-slate-400">{val || "250 2.0.0 OK"}</span> },
    { key: "sent_at", header: "Sent Time", render: (val) => (val ? new Date(val).toLocaleString() : "-") },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Reports & Delivery Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor campaign benchmarks, email quotas, and delivery diagnostic logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport(activeTab, "csv")}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 rounded-xl text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4 text-slate-400" />
            Export CSV
          </button>
          <button
            onClick={() => handleExport(activeTab, "xlsx")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-lg">
          <p className="text-xs font-semibold text-slate-400">Total Campaigns</p>
          <p className="text-xl font-bold text-slate-100 mt-1">{summary.total_campaigns}</p>
        </div>
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-lg">
          <p className="text-xs font-semibold text-slate-400">Emails Sent</p>
          <p className="text-xl font-bold text-indigo-400 mt-1">{summary.total_emails_sent.toLocaleString()}</p>
        </div>
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl shadow-lg">
          <p className="text-xs font-semibold text-emerald-400">Deliveries</p>
          <p className="text-xl font-bold text-emerald-200 mt-1">{summary.successful_deliveries.toLocaleString()}</p>
        </div>
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl shadow-lg">
          <p className="text-xs font-semibold text-rose-400">Failed Emails</p>
          <p className="text-xl font-bold text-rose-200 mt-1">{summary.failed_deliveries.toLocaleString()}</p>
        </div>
        <div className="p-4 bg-teal-500/10 border border-teal-500/30 rounded-2xl shadow-lg">
          <p className="text-xs font-semibold text-teal-400">Success Rate</p>
          <p className="text-xl font-bold text-teal-200 mt-1">{summary.success_rate}%</p>
        </div>
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-lg">
          <p className="text-xs font-semibold text-slate-400">Active Recipients</p>
          <p className="text-xl font-bold text-slate-100 mt-1">{summary.active_recipients.toLocaleString()}</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <FilterDropdown
            label="Date Range"
            value={dateRange}
            onChange={setDateRange}
            options={[
              { value: "7", label: "Last 7 Days" },
              { value: "30", label: "Last 30 Days" },
              { value: "90", label: "Last 90 Days" },
            ]}
          />

          <FilterDropdown
            label="Campaign"
            value={selectedCampaign}
            onChange={setSelectedCampaign}
            options={campaignOptions.map((c) => ({ value: c.id, label: c.name }))}
          />

          <FilterDropdown
            label="SMTP Server"
            value={selectedSmtp}
            onChange={setSelectedSmtp}
            options={smtpOptions.map((s) => ({ value: s.id, label: s.name }))}
          />

          <FilterDropdown
            label="Recipient List"
            value={selectedList}
            onChange={setSelectedList}
            options={listOptions.map((l) => ({ value: l.id, label: l.name }))}
          />
        </div>
      </div>

      {/* Charts Section */}
      <ReportCharts
        dailyVolume={chartData.dailyVolume}
        successRatio={chartData.successRatio}
        campaignPerformance={chartData.campaignPerformance}
        smtpUsage={chartData.smtpUsage}
        failureReasons={chartData.failureReasons}
      />

      {/* Reports Data Table Tabs */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab("campaigns");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "campaigns"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Campaign Reports
            </button>
            <button
              onClick={() => {
                setActiveTab("logs");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "logs"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Delivery Logs
            </button>
          </div>

          {activeTab === "logs" && (
            <SearchInput
              value={logSearch}
              onChange={(val) => {
                setLogSearch(val);
                setPage(1);
              }}
              placeholder="Search delivery log recipient..."
              className="w-64"
            />
          )}
        </div>

        <DataTable
          columns={activeTab === "campaigns" ? campaignColumns : logColumns}
          data={activeTab === "campaigns" ? campaignReports : logs}
          loading={loading}
          emptyTitle={activeTab === "campaigns" ? "No campaign reports" : "No delivery logs"}
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
