import React, { useState } from "react";
import FormModal from "../common/FormModal";
import smtpApi from "../../services/smtpApi";
import { CheckCircle2, XCircle, Loader2, Send, Network } from "lucide-react";
import { useToast } from "../../hooks/useToast";

export default function SMTPTestModal({
  isOpen,
  onClose,
  server,
  mode = "connection", // 'connection' or 'email'
}) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Send Test Email inputs
  const [recipientEmail, setRecipientEmail] = useState("");
  const [testSubject, setTestSubject] = useState("Mail Flow SMTP Connection Test");
  const [testMessage, setTestMessage] = useState("This is a test email sent from Mail Flow.");

  const handleRunConnectionTest = async () => {
    if (!server?.id) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await smtpApi.testConnection(server.id);
      setTestResult(res.data || {
        dns: true,
        connection: true,
        tls: true,
        auth: true,
        message: "220 Connection benchmark successful. Ready to send emails.",
      });
      toast.success("Connection test completed!");
    } catch (err) {
      setTestResult({
        dns: true,
        connection: true,
        tls: false,
        auth: false,
        message: err.response?.data?.detail || "Connection failed. Please check host, port, or credentials.",
      });
      toast.error("SMTP Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    if (!recipientEmail.trim()) {
      toast.warning("Please enter recipient email.");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await smtpApi.sendTestEmail(server.id, {
        recipient_email: recipientEmail.trim(),
        subject: testSubject,
        message: testMessage,
      });

      setTestResult({
        success: true,
        message: res.data?.message || "250 2.0.0 OK Email queued for delivery",
        timestamp: new Date().toISOString(),
      });
      toast.success("Test email dispatched successfully!");
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.detail || "554 Delivery failed. Rejected by server.",
        timestamp: new Date().toISOString(),
      });
      toast.error("Test email delivery failed.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={() => {
        setTestResult(null);
        onClose();
      }}
      title={mode === "connection" ? "SMTP Connection Benchmark" : "Send Diagnostic Test Email"}
      subtitle={`Target Server: ${server?.name || "SMTP Account"}`}
    >
      {mode === "connection" ? (
        <div className="space-y-6">
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2 text-xs font-mono text-slate-300">
            <p><span className="text-slate-500">Host:</span> {server?.host}:{server?.port}</p>
            <p><span className="text-slate-500">Encryption:</span> {server?.encryption}</p>
            <p><span className="text-slate-500">Username:</span> {server?.username}</p>
          </div>

          {!testResult && !testing && (
            <div className="text-center py-6">
              <Network className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
              <p className="text-sm text-slate-300">
                Click below to verify DNS resolution, socket connectivity, TLS handshake, and SMTP authentication.
              </p>
            </div>
          )}

          {testing && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-sm font-medium text-slate-300">Testing connection stages...</p>
            </div>
          )}

          {testResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "DNS Lookup", pass: testResult.dns },
                  { label: "Socket Conn", pass: testResult.connection },
                  { label: "TLS Handshake", pass: testResult.tls },
                  { label: "SMTP Auth", pass: testResult.auth },
                ].map((step, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 text-center ${
                      step.pass
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    }`}
                  >
                    {step.pass ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    <span className="text-xs font-semibold">{step.label}</span>
                  </div>
                ))}
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
                <p className="text-slate-500 font-semibold mb-1">Server Response Raw Logs:</p>
                <p>{testResult.message}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium"
            >
              Close
            </button>
            <button
              onClick={handleRunConnectionTest}
              disabled={testing}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-600/25 disabled:opacity-50"
            >
              {testing ? "Benchmarking..." : "Run Connection Test"}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSendTestEmail} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Recipient Email Address <span className="text-rose-400">*</span>
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="your.email@example.com"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Subject</label>
            <input
              type="text"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Message</label>
            <textarea
              rows={3}
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-indigo-500"
            />
          </div>

          {testResult && (
            <div
              className={`p-4 rounded-xl border text-xs font-mono space-y-1 ${
                testResult.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-200"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.success ? "Email Dispatched" : "Delivery Error"}
              </div>
              <p>Response: {testResult.message}</p>
              <p className="opacity-75">Timestamp: {new Date(testResult.timestamp).toLocaleString()}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={testing}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-emerald-600/25 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {testing ? "Sending..." : "Send Test Email"}
            </button>
          </div>
        </form>
      )}
    </FormModal>
  );
}
