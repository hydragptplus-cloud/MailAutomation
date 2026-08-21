import { useEffect, useState } from "react";
import { Save, Settings } from "lucide-react";
import settingsApi from "../../services/settingsApi";
import { apiError } from "../../utils/apiError";

export default function PlatformSettings() {
  const [appName, setAppName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    settingsApi
      .getSettings()
      .then((response) => setAppName(response.data.app_name || ""))
      .catch((requestError) => setError(apiError(requestError, "Unable to load platform settings.")))
      .finally(() => setLoading(false));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await settingsApi.updateSettings({ app_name: appName.trim() });
      setAppName(response.data.app_name || "");
      setMessage("Platform settings updated.");
    } catch (requestError) {
      setError(apiError(requestError, "Unable to update platform settings."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Platform settings</h2>
        <p className="mt-1 text-sm text-slate-500">Control owner-managed platform branding and global defaults.</p>
      </div>

      {message && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
      {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}

      <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-100">
          <Settings className="h-5 w-5 text-indigo-400" /> Platform branding
        </h3>
        <label className="block max-w-xl text-xs font-semibold text-slate-300">
          Application Name
          <input
            type="text"
            required
            maxLength={255}
            disabled={loading || saving}
            value={appName}
            onChange={(event) => setAppName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700/70 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 disabled:opacity-60"
          />
        </label>
        <div className="flex justify-end border-t border-slate-800 pt-4">
          <button
            type="submit"
            disabled={loading || saving || !appName.trim()}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Platform Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
