import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Server,
  Zap,
  CheckCircle,
  Activity,
  Send,
  Edit2,
  Trash,
  Play,
  Pause,
  RefreshCw,
  Network,
} from "lucide-react";
import DataTable from "../../components/common/DataTable";
import StatusBadge from "../../components/common/StatusBadge";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import SMTPFormModal from "../../components/smtp/SMTPFormModal";
import SMTPTestModal from "../../components/smtp/SMTPTestModal";
import smtpApi from "../../services/smtpApi";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../hooks/useToast";
import { usePermissions } from "../../hooks/usePermissions";

export default function SMTPPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const formModal = useModal();
  const testModal = useModal();
  const deleteModal = useModal();
  const [testMode, setTestMode] = useState("connection"); // 'connection' or 'email'

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await smtpApi.getServers();
      setServers(res.data.results || res.data || []);
    } catch (_e) {
      toast.error("Failed to load SMTP configurations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Aggregate Stats
  const activeCount = servers.filter((s) => Boolean(s.status)).length;
  const totalDailyLimit = servers.reduce((acc, s) => acc + (s.daily_limit || 0), 0);
  const totalSentToday = servers.reduce((acc, s) => acc + (s.sent_today || s.emails_sent_today || 0), 0);
  const remainingCapacity = Math.max(0, totalDailyLimit - totalSentToday);

  const handleToggleStatus = async (server) => {
    const nextBool = !server.status;
    try {
      await smtpApi.updateServer(server.id, { status: nextBool });
      toast.success(`Server set to ${nextBool ? "active" : "inactive"}.`);
      fetchServers();
    } catch (_e) {
      toast.error("Failed to change status.");
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.data?.id) return;
    try {
      await smtpApi.deleteServer(deleteModal.data.id);
      toast.success("SMTP server deleted.");
      deleteModal.closeModal();
      fetchServers();
    } catch (_e) {
      toast.error("Failed to delete SMTP server.");
    }
  };

  const columns = [
    {
      key: "name",
      header: "SMTP Server",
      render: (val, row) => (
        <div>
          <span className="font-bold text-slate-100">{val}</span>
          <p className="text-[11px] text-slate-400 font-mono">
            {row.host}:{row.port} ({row.encryption})
          </p>
          {row.reply_to && (
            <p className="text-[11px] text-indigo-400 font-mono">
              Reply-To: {row.reply_to}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "username",
      header: "Username / Auth",
      render: (val) => <span className="font-mono text-slate-300">{val}</span>,
    },
    {
      key: "daily_limit",
      header: "Daily Capacity",
      render: (val, row) => {
        const sent = row.sent_today || row.emails_sent_today || 0;
        const limit = val || 1000;
        const percent = Math.min(100, Math.round((sent / limit) * 100));

        return (
          <div className="w-40 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold text-slate-200">{sent} / {limit}</span>
              <span className="text-slate-400">{percent}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                style={{ width: `${percent}%` }}
                className={`h-full transition-all ${
                  percent > 90 ? "bg-rose-500" : percent > 75 ? "bg-amber-500" : "bg-indigo-500"
                }`}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: "remaining",
      header: "Remaining",
      render: (_, row) => {
        const limit = row.daily_limit || 1000;
        const sent = row.sent_today || row.emails_sent_today || 0;
        return <span className="font-semibold text-emerald-400">{Math.max(0, limit - sent)}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (val) => <StatusBadge status={val ? "active" : "inactive"} />,
    },
    {
      key: "last_tested",
      header: "Last Tested",
      render: (val) => (val ? new Date(val).toLocaleString() : "Not tested yet"),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setTestMode("connection");
              testModal.openModal(row);
            }}
            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
            title="Test Connection"
          >
            <Network className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setTestMode("email");
              testModal.openModal(row);
            }}
            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
            title="Send Test Email"
          >
            <Send className="w-4 h-4" />
          </button>

          {hasPermission("manage_smtp") && (
            <>
              <button
                onClick={() => formModal.openModal(row)}
                className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                title="Edit Configuration"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleToggleStatus(row)}
                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                title={row.status ? "Deactivate" : "Activate"}
              >
                {row.status ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => deleteModal.openModal(row)}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                title="Delete Server"
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100">SMTP Management</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Configure email delivery servers, manage sending quotas, and test socket connectivity.
          </p>
        </div>

        {hasPermission("manage_smtp") && (
          <button
            onClick={() => formModal.openModal()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25 active:scale-95 whitespace-nowrap shrink-0 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            Add SMTP Server
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3 sm:gap-4 shadow-lg min-w-0">
          <div className="p-3 sm:p-3.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl shrink-0">
            <Server className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400 truncate">Active Servers</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-100 mt-0.5 truncate">{activeCount}</p>
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3 sm:gap-4 shadow-lg min-w-0">
          <div className="p-3 sm:p-3.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl shrink-0">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400 truncate">Total Daily Limit</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-100 mt-0.5 truncate">{totalDailyLimit.toLocaleString()}</p>
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3 sm:gap-4 shadow-lg min-w-0">
          <div className="p-3 sm:p-3.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl shrink-0">
            <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400 truncate">Sent Today</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-100 mt-0.5 truncate">{totalSentToday.toLocaleString()}</p>
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3 sm:gap-4 shadow-lg min-w-0">
          <div className="p-3 sm:p-3.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-xl shrink-0">
            <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400 truncate">Remaining Capacity</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-400 mt-0.5 truncate">{remainingCapacity.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Servers Data Table */}
      <DataTable
        columns={columns}
        data={servers}
        loading={loading}
        emptyTitle="No SMTP Servers Configured"
        emptyDescription="Add an SMTP server to begin sending email campaigns."
      />

      {/* Modals */}
      <SMTPFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.closeModal}
        server={formModal.data}
        onSuccess={fetchServers}
      />

      <SMTPTestModal
        isOpen={testModal.isOpen}
        onClose={testModal.closeModal}
        server={testModal.data}
        mode={testMode}
      />

      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onCancel={deleteModal.closeModal}
        onConfirm={handleDelete}
        title="Delete SMTP Server"
        message={`Are you sure you want to delete SMTP configuration "${deleteModal.data?.name}"?`}
        confirmLabel="Delete Server"
        isDanger={true}
      />
    </div>
  );
}
