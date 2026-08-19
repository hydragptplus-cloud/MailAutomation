import React from "react";
import { useNavigate } from "react-router-dom";
import { Menu, LogOut, LogIn, UserCheck } from "lucide-react";
import { clearTokens, isAuthenticated, getUser } from "../utils/auth";
import api from "../services/api";

export default function Navbar({ onToggleMobileMenu }) {
  const navigate = useNavigate();
  const auth = isAuthenticated();
  const user = getUser();

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout/");
    } finally {
      clearTokens();
      navigate("/login", { replace: true });
    }
  };

  const handleLogin = () => {
    navigate("/login", { replace: true });
  };

  return (
    <header className="h-16 px-4 sm:px-6 bg-slate-900/90 border-b border-slate-800/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-30 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Hamburger Toggle Button */}
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="truncate">
          <strong className="text-slate-100 font-semibold text-xs sm:text-sm md:text-base truncate block sm:inline">
          Mail Flow
          </strong>
          <span className="text-xs text-slate-400 hidden md:inline"> / Operations Console</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-800/60 border border-slate-700/50 rounded-full text-xs text-slate-300">
          <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>{user?.username || "Admin"}</span>
        </div>

        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
          {(user?.username || "A").charAt(0).toUpperCase()}
        </div>

        {auth ? (
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        ) : (
          <button
            onClick={handleLogin}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Login</span>
          </button>
        )}
      </div>
    </header>
  );
}
