import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { setTokens, setUser } from "../utils/auth";

const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      });

      const { access, refresh, user } = response.data;
      setTokens(access, refresh);

      // Save user details
      setUser(user);

      navigate("/dashboard", { replace: true });
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        (err.response?.data ? JSON.stringify(err.response.data) : "Login failed. Please check your credentials.");
      setError(typeof detail === "string" ? detail : "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };


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
                  Sign In to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Powered by Django REST & React</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Encrypted Session
            </span>
          </div>
        </div>

        {/* Right Side: Feature Showcase Panel */}
        <div className="hidden lg:col-span-5 lg:flex bg-gradient-to-br from-indigo-950/60 via-slate-950 to-slate-900/90 p-10 flex-col justify-between border-l border-slate-800/80 relative overflow-hidden">
          {/* Decorative shapes */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Badge top */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 text-xs font-semibold text-indigo-300 w-fit backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Automation & Delivery Cloud
          </div>

          {/* Center feature cards */}
          <div className="space-y-4 my-auto">
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl backdrop-blur-md flex items-start gap-3 shadow-xl">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">Multi-SMTP Delivery Routing</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Automatic load balancing and failover across configured mail servers.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl backdrop-blur-md flex items-start gap-3 shadow-xl">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">Real-Time Dispatch Analytics</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Track sent, pending, and failed campaign delivery statuses live.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl backdrop-blur-md flex items-start gap-3 shadow-xl">
              <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">Recipient Management</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Segment contacts into target audience lists with custom metadata fields.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom quote */}
          <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md text-xs text-slate-400">
            <p className="italic">"Seamless, resilient email dispatch built for scaling customer communication."</p>
          </div>
        </div>

      </div>
    </div>
  );
}
