import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { apiError, recoverInvoice } from "../../services/billingApi";

export default function LandingSecurity() {
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [recovering, setRecovering] = useState(false);
  const recoveryResetTimer = useRef(null);

  useEffect(() => () => {
    if (recoveryResetTimer.current) clearTimeout(recoveryResetTimer.current);
  }, []);

  async function recover(event) {
    event.preventDefault();
    if (recoveryResetTimer.current) {
      clearTimeout(recoveryResetTimer.current);
      recoveryResetTimer.current = null;
    }
    setRecovering(true);
    setRecoveryNotice("");
    try {
      const response = await recoverInvoice(recoveryEmail);
      setRecoveryNotice({ text: response.detail, error: false });
      setRecoveryEmail("");
      recoveryResetTimer.current = setTimeout(() => {
        setRecoveryNotice("");
        setRecoveryEmail("");
        recoveryResetTimer.current = null;
      }, 5000);
    } catch (err) {
      setRecoveryNotice({ text: apiError(err), error: true });
    } finally {
      setRecovering(false);
    }
  }

  return (
    <section id="security" className="max-w-4xl mx-auto px-5 pb-28 space-y-6">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-emerald-400 text-xs font-bold uppercase tracking-[0.2em]">
          Trust & Security
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold mt-2 tracking-tight text-white">
          Ironclad protection.
        </h2>
        <p className="text-slate-400 text-sm mt-3">
          Your transactions are secured by on-chain validation and strict isolation.
        </p>
      </div>

      <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.03] backdrop-blur-lg p-6 sm:p-8 flex flex-col sm:flex-row gap-5 items-start">
        <span className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center shrink-0">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Decentralized & Verified On-Chain
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mt-2">
            We monitor contract events directly on-chain for exact invoice amount, transaction confirmations, and single-use validation.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Lock className="w-4 h-4 text-indigo-400" />
          <h2 className="text-base font-bold text-white">Find Existing Checkout Invoice</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Lost your payment URL? Enter your checkout email to receive a secure recovery link.
        </p>

        <form onSubmit={recover} className="mt-5 flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={recoveryEmail}
            onChange={(event) => setRecoveryEmail(event.target.value)}
            placeholder="you@domain.com"
            className="min-w-0 flex-1 bg-slate-950/80 border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none transition"
          />
          <button
            type="submit"
            disabled={recovering}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-3 rounded-xl text-sm font-bold text-white transition shrink-0 active:scale-95"
          >
            {recovering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              "Email secure link"
            )}
          </button>
        </form>

        {recoveryNotice && (
          <p
            className={`text-xs font-medium mt-3 ${recoveryNotice.error ? "text-rose-400" : "text-emerald-300"
              }`}
          >
            {recoveryNotice.text}
          </p>
        )}
      </div>
    </section>
  );
}
