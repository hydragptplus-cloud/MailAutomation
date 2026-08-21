import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
import { setTokens, setUser } from "../utils/auth";
import twoFactorApi from "../services/twoFactorApi";
import { apiError } from "../utils/apiError";

const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const accountCreated = searchParams.get("created") === "1" || searchParams.get("registered") === "1";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 2FA State
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeEmail, setChallengeEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const digitRefs = useRef([]);

  // Auto-focus first digit when 2FA step activates
  useEffect(() => {
    if (twoFactorStep && !useBackupCode && digitRefs.current[0]) {
      setTimeout(() => digitRefs.current[0]?.focus(), 100);
    }
  }, [twoFactorStep, useBackupCode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${apiBase}/auth/token/`, {
        username: username.trim(),
        password,
      }, { withCredentials: true });

      const data = response.data;

      // Check if 2FA is required
      if (data.two_factor_required) {
        setChallengeToken(data.challenge_token);
        setChallengeEmail(data.email || username);
        setTwoFactorStep(true);
        setOtpDigits(["", "", "", "", "", ""]);
        setBackupCode("");
        setError("");
        setLoading(false);
        return;
      }

      // Normal login (no 2FA)
      const { user } = data;
      setTokens();
      setUser(user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(apiError(err, "Login failed. Please check your credentials."));
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index, value) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < 5 && digitRefs.current[index + 1]) {
      digitRefs.current[index + 1].focus();
    }

    // Auto-submit when all 6 digits are filled
    if (digit && index === 5) {
      const code = newDigits.join("");
      if (code.length === 6) {
        handleVerify2FA(code);
      }
    }
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  const handleDigitPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || "";
      }
      setOtpDigits(newDigits);
      // Focus the next empty or last
      const focusIndex = Math.min(pasted.length, 5);
      digitRefs.current[focusIndex]?.focus();
      // Auto-submit if full
      if (pasted.length === 6) {
        handleVerify2FA(pasted);
      }
    }
  };

  const handleVerify2FA = async (codeOverride) => {
    const code = codeOverride || (useBackupCode ? backupCode.trim() : otpDigits.join(""));
    if (!code) {
      setError("Please enter a verification code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await twoFactorApi.verifyLogin({ challenge_token: challengeToken, code });
      const { user } = response.data;
      setTokens();
      setUser(user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail || "Invalid verification code.";
      setError(typeof detail === "string" ? detail : "Verification failed.");
      // Clear OTP digits on failure
      if (!useBackupCode) {
        setOtpDigits(["", "", "", "", "", ""]);
        digitRefs.current[0]?.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setTwoFactorStep(false);
    setChallengeToken("");
    setOtpDigits(["", "", "", "", "", ""]);
    setBackupCode("");
    setError("");
    setUseBackupCode(false);
  };

  // ── 2FA Verification Step ─────────────────────────────────────────
  if (twoFactorStep) {
    return (
      <div className="min-h-screen w-full bg-[#070b14] text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-sky-600/15 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-950/40 p-8 sm:p-10 z-10 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-600/30 mb-4">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">
              Two-Factor Verification
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Enter the 6-digit code from your authenticator app
              {challengeEmail && (
                <span className="block text-xs text-slate-500 mt-1">for {challengeEmail}</span>
              )}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs sm:text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {!useBackupCode ? (
            /* OTP Digit Boxes */
            <div>
              <div className="flex justify-center gap-2.5" onPaste={handleDigitPaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (digitRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    className={`w-12 h-14 text-center text-xl font-bold bg-slate-950/80 border rounded-xl text-slate-100 focus:outline-none focus:ring-2 transition-all ${
                      digit
                        ? "border-indigo-500/60 focus:ring-indigo-500"
                        : "border-slate-700/80 focus:ring-indigo-500"
                    }`}
                    autoComplete="one-time-code"
                  />
                ))}
              </div>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setUseBackupCode(true);
                  }}
                  className="text-xs text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Use a backup code instead
                </button>
              </div>
            </div>
          ) : (
            /* Backup Code Input */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Backup Recovery Code
                </label>
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="Enter 8-character backup code"
                  autoFocus
                  className="w-full py-3 px-4 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 text-center tracking-[0.3em] font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => handleVerify2FA()}
                disabled={loading || !backupCode.trim()}
                className="w-full py-3 px-6 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    Verify Backup Code
                  </>
                )}
              </button>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setUseBackupCode(false);
                    setBackupCode("");
                  }}
                  className="text-xs text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Use authenticator code instead
                </button>
              </div>
            </div>
          )}

          {/* Back button */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </button>
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Encrypted Session
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal Login Form ─────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-[#070b14] text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden font-sans">
      {/* Ambient background glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-sky-600/15 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-5xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-950/40 grid grid-cols-1 lg:grid-cols-12 overflow-hidden z-10">

        {/* Left Side: Login Form */}
        <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-between space-y-8">

          {/* Header & Logo */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-600/30">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  Mail Flow <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">v2.0</span>
                </span>
                <p className="text-xs text-slate-400">Enterprise Campaign Dispatch Engine</p>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
              Welcome back
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Enter your authentication credentials to access the campaign dashboard.
            </p>
          </div>

          {/* Account Created Success Message */}
          {accountCreated && !error && (
            <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs sm:text-sm animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                Your free workspace is ready! Please enter your credentials to sign in.
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs sm:text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Username or Account ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin or username"
                  autoComplete="username"
                  required
                  style={{ paddingLeft: "42px" }}
                  className="w-full py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter account password"
                  autoComplete="current-password"
                  required
                  style={{ paddingLeft: "42px", paddingRight: "42px" }}
                  className="w-full py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-xs text-slate-400">Keep me signed in</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>

                  <ArrowRight className="w-4 h-4" />Sign In to Dashboard
                </>
              )}
            </button>
          </form>

          {/* Create account link */}
          <div className="pt-2 text-center text-xs text-slate-400">
            Don&apos;t have a workspace?{" "}
            <Link to="/register" className="font-semibold text-indigo-400 hover:text-indigo-300">
              Create free account
            </Link>
          </div>

          {/* Footer note */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Powered by Django REST & React</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Encrypted Session
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
