import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Save,
  Send,
  Calendar,
  Sparkles,
  Layers,
  Users,
  Server,
  FileText,
  Clock,
} from "lucide-react";
import campaignsApi from "../../services/campaignsApi";
import recipientsApi from "../../services/recipientsApi";
import smtpApi from "../../services/smtpApi";
import templatesApi from "../../services/templatesApi";
import { useToast } from "../../hooks/useToast";
import DateTimePicker from "../../components/common/DateTimePicker";
import { apiError } from "../../utils/apiError";

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [campaignData, setCampaignData] = useState({
    name: "",
    subject: "",
    description: "",
    template_id: "",
    recipient_list_id: "",
    smtp_id: "",
    send_type: "now", // "now" | "scheduled"
    scheduled_at: "",
    timezone: "UTC",
  });

  // Resources state
  const [templates, setTemplates] = useState([]);
  const [lists, setLists] = useState([]);
  const [smtpServers, setSmtpServers] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);

  useEffect(() => {
    const loadResources = async () => {
      setLoadingResources(true);
      try {
        const [tplRes, listRes, smtpRes] = await Promise.all([
          templatesApi.getTemplates(),
          recipientsApi.getLists(),
          smtpApi.getServers(),
        ]);

        const fetchedTemplates = tplRes.data?.results || tplRes.data || [];
        const fetchedLists = listRes.data?.results || listRes.data || [];
        const fetchedSmtp = smtpRes.data?.results || smtpRes.data || [];

        setTemplates(fetchedTemplates);
        setLists(fetchedLists);
        setSmtpServers(fetchedSmtp);

        // Auto select defaults if available
        setCampaignData((prev) => ({
          ...prev,
          template_id: prev.template_id || fetchedTemplates[0]?.id || "",
          recipient_list_id: prev.recipient_list_id || fetchedLists[0]?.id || "",
          smtp_id: prev.smtp_id || fetchedSmtp[0]?.id || "",
        }));
      } catch (_e) {
        toast.error("Failed to load options.");
      } finally {
        setLoadingResources(false);
      }
    };
    loadResources();
  }, []);

  const handleNextStep = () => {
    if (step === 1) {
      if (!campaignData.name.trim() || !campaignData.subject.trim()) {
        toast.warning("Please enter campaign name and email subject.");
        return;
      }
    } else if (step === 2) {
      if (!campaignData.template_id) {
        toast.warning("Please select an email template.");
        return;
      }
    } else if (step === 3) {
      if (!campaignData.recipient_list_id) {
        toast.warning("Please select a target recipient list.");
        return;
      }
    } else if (step === 4) {
      if (!campaignData.smtp_id) {
        toast.warning("Please select an active SMTP server.");
        return;
      }
    } else if (step === 5) {
      if (campaignData.send_type === "scheduled" && !campaignData.scheduled_at) {
        toast.warning("Please select a scheduled date and time.");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 6));
  };

  const handleCreateCampaign = async (isDraft = false) => {
    setSubmitting(true);
    const payload = {
      name: campaignData.name.trim(),
      subject: campaignData.subject.trim(),
      description: campaignData.description.trim(),
      template: campaignData.template_id,
      recipient_list: campaignData.recipient_list_id,
      smtp: campaignData.smtp_id,
      status: isDraft ? "draft" : campaignData.send_type === "scheduled" ? "scheduled" : "queued",
      scheduled_at: campaignData.send_type === "scheduled" ? campaignData.scheduled_at : null,
    };

    try {
      const res = await campaignsApi.createCampaign(payload);
      const newId = res.data?.id;

      if (!isDraft && campaignData.send_type === "now" && newId) {
        await campaignsApi.startCampaign(newId);
        toast.success("Campaign launched successfully!");
      } else if (!isDraft) {
        toast.success("Campaign scheduled successfully!");
      } else {
        toast.success("Campaign saved as draft.");
      }

      navigate("/campaigns");
    } catch (err) {
      toast.error(apiError(err, "Failed to create campaign."));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTemplate = templates.find((t) => String(t.id) === String(campaignData.template_id));
  const selectedList = lists.find((l) => String(l.id) === String(campaignData.recipient_list_id));
  const selectedSmtp = smtpServers.find((s) => String(s.id) === String(campaignData.smtp_id));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/campaigns")}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Create Email Campaign</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Configure targeting, template layouts, SMTP servers, and send schedules.
          </p>
        </div>
      </div>

      {/* Stepper Progress */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl">
        {[
          { num: 1, label: "1. Details" },
          { num: 2, label: "2. Template" },
          { num: 3, label: "3. Audience" },
          { num: 4, label: "4. SMTP" },
          { num: 5, label: "5. Schedule" },
          { num: 6, label: "6. Review" },
        ].map((s) => (
          <div
            key={s.num}
            onClick={() => {
              if (step > s.num) setStep(s.num);
            }}
            className={`p-2.5 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer ${step === s.num
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : step > s.num
                  ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                  : "bg-slate-800/50 text-slate-400 opacity-60"
              }`}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
          <h3 className="text-lg font-bold text-slate-100 mb-4">Step 1: Campaign Details</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Campaign Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={campaignData.name}
              onChange={(e) => setCampaignData({ ...campaignData, name: e.target.value })}
              placeholder="e.g. Lead Generation Announcement 2026"
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Email Subject Line <span className="text-rose-400">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={campaignData.subject}
                onChange={(e) => setCampaignData({ ...campaignData, subject: e.target.value })}
                placeholder="e.g. Exclusive Business Insights for {company}"
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-indigo-500 pr-36"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCampaignData((prev) => ({ ...prev, subject: prev.subject + " {name}" }))}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono"
                  title="Insert {name} variable"
                >
                  +{`{name}`}
                </button>
                <button
                  type="button"
                  onClick={() => setCampaignData((prev) => ({ ...prev, subject: prev.subject + " {company}" }))}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono"
                  title="Insert {company} variable"
                >
                  +{`{company}`}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Tip: Use <code className="text-indigo-300">{`{name}`}</code> or <code className="text-indigo-300">{`{company}`}</code> to personalize subject lines for each recipient.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Optional Internal Description
            </label>
            <textarea
              rows={3}
              value={campaignData.description}
              onChange={(e) => setCampaignData({ ...campaignData, description: e.target.value })}
              placeholder="Internal notes regarding campaign target audience..."
              className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              onClick={handleNextStep}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >

              <ArrowRight className="w-4 h-4" />Next: Select Template
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select Template */}
      {step === 2 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Step 2: Select Email Template</h3>
            <p className="text-xs text-slate-400 mt-1">Choose a pre-designed layout for your campaign content.</p>
          </div>

          {templates.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-2xl">
              <FileText className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-300">No templates found.</p>
              <p className="text-xs text-slate-400 mt-1">Create a template in the Template Builder or select Default Template.</p>
              <button
                type="button"
                onClick={() => navigate("/templates")}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                Go to Template Builder
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map((tpl) => {
                const isSelected = String(tpl.id) === String(campaignData.template_id);
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setCampaignData({ ...campaignData, template_id: tpl.id })}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-3 ${isSelected
                        ? "bg-indigo-600/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-xl"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                      }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                          Template
                        </span>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-400" />}
                      </div>
                      <h4 className="text-base font-bold text-slate-100">{tpl.title || tpl.name}</h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {tpl.subject || tpl.description || "Responsive Email Layout"}
                      </p>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 border-t border-slate-800/80 pt-2">
                      Subject: {tpl.subject || campaignData.subject}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button onClick={() => setStep(1)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">
              Back
            </button>
            <button
              onClick={handleNextStep}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >

              <ArrowRight className="w-4 h-4" /> Next: Select Audience
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Audience */}
      {step === 3 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Step 3: Select Target Audience</h3>
            <p className="text-xs text-slate-400 mt-1">Choose recipient contact list for dispatch.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lists.map((l) => {
              const isSelected = String(l.id) === String(campaignData.recipient_list_id);
              return (
                <div
                  key={l.id}
                  onClick={() => setCampaignData({ ...campaignData, recipient_list_id: l.id })}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${isSelected
                      ? "bg-indigo-600/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-xl"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-base font-bold text-slate-100">{l.list_name || l.name}</h4>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {l.recipient_count || 0} Total Active Contacts
                    </p>
                  </div>
                  {isSelected && <CheckCircle2 className="w-6 h-6 text-indigo-400" />}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button onClick={() => setStep(2)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">
              Back
            </button>
            <button
              onClick={handleNextStep}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >

              <ArrowRight className="w-4 h-4" />Next: Select SMTP Server
            </button>
          </div>
        </div>
      )}

      {/* Step 4: SMTP Server */}
      {step === 4 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Step 4: Select SMTP Server</h3>
            <p className="text-xs text-slate-400 mt-1">Choose the outbound mail server configuration.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {smtpServers.map((s) => {
              const isSelected = String(s.id) === String(campaignData.smtp_id);
              return (
                <div
                  key={s.id}
                  onClick={() => setCampaignData({ ...campaignData, smtp_id: s.id })}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${isSelected
                      ? "bg-indigo-600/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-xl"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-base font-bold text-slate-100">{s.name}</h4>
                    </div>
                    <p className="text-xs font-mono text-slate-400 mt-1">
                      {s.host}:{s.port} ({s.from_email || s.username})
                    </p>
                  </div>
                  {isSelected && <CheckCircle2 className="w-6 h-6 text-indigo-400" />}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button onClick={() => setStep(3)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">
              Back
            </button>
            <button
              onClick={handleNextStep}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >

              <ArrowRight className="w-4 h-4" />Next: Schedule & Dispatch
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Schedule */}
      {step === 5 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Step 5: Schedule & Sending Options</h3>
            <p className="text-xs text-slate-400 mt-1">Choose immediate dispatch or set future delivery datetime.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => setCampaignData({ ...campaignData, send_type: "now" })}
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${campaignData.send_type === "now"
                  ? "bg-indigo-600/10 border-indigo-500 ring-2 ring-indigo-500/50"
                  : "bg-slate-950/60 border-slate-800"
                }`}
            >
              <div className="flex items-center gap-3">
                <Send className="w-6 h-6 text-indigo-400" />
                <div>
                  <h4 className="font-bold text-slate-100">Send Immediately</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Queue and launch campaign right now.</p>
                </div>
              </div>
            </div>

            <div
              onClick={() => setCampaignData({ ...campaignData, send_type: "scheduled" })}
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${campaignData.send_type === "scheduled"
                  ? "bg-indigo-600/10 border-indigo-500 ring-2 ring-indigo-500/50"
                  : "bg-slate-950/60 border-slate-800"
                }`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-6 h-6 text-emerald-400" />
                <div>
                  <h4 className="font-bold text-slate-100">Schedule for Later</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Pick specific future date and time.</p>
                </div>
              </div>
            </div>
          </div>

          {campaignData.send_type === "scheduled" && (
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4">
              <DateTimePicker
                value={campaignData.scheduled_at}
                onChange={(val) => setCampaignData({ ...campaignData, scheduled_at: val })}
                label="Select Scheduled Sending Date & Time"
                required={true}
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button onClick={() => setStep(4)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">
              Back
            </button>
            <button
              onClick={handleNextStep}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >

              <ArrowRight className="w-4 h-4" />Next: Review & Confirm
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Review */}
      {step === 6 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Step 6: Review Campaign Summary</h3>
            <p className="text-xs text-slate-400 mt-1">Verify configuration details before saving or launching.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/80 p-5 rounded-2xl border border-slate-800 text-sm">
            <div>
              <p className="text-xs text-slate-400 font-semibold">Campaign Name</p>
              <p className="font-bold text-slate-100 mt-0.5">{campaignData.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">Subject Line</p>
              <p className="font-mono text-indigo-300 mt-0.5">{campaignData.subject}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">Template</p>
              <p className="text-slate-200 mt-0.5">{selectedTemplate?.title || selectedTemplate?.name || "Selected Template"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">Recipient List</p>
              <p className="text-slate-200 mt-0.5">
                {selectedList?.list_name || selectedList?.name || "General Contacts"} ({selectedList?.recipient_count || 0} Contacts)
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">SMTP Server</p>
              <p className="text-slate-200 mt-0.5">{selectedSmtp?.name} ({selectedSmtp?.host})</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold">Schedule</p>
              <p className="text-emerald-400 font-semibold mt-0.5">
                {campaignData.send_type === "now" ? "Immediate Launch" : `Scheduled: ${campaignData.scheduled_at}`}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button onClick={() => setStep(5)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium">
              Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleCreateCampaign(true)}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                Save as Draft
              </button>
              <button
                onClick={() => handleCreateCampaign(false)}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/25 active:scale-95 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {submitting ? "Processing..." : campaignData.send_type === "now" ? "Launch Campaign Now" : "Schedule Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
