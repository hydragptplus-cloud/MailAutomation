import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import BrandLogo from "../BrandLogo";

export default function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060911]/80 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto h-20 px-5 lg:px-8 flex items-center justify-between">
        <Link to="/" className="group" aria-label="Mail Flow home">
          <BrandLogo className="h-10 w-auto max-w-[190px] object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-white transition-colors duration-200">
            Features
          </a>
          <a href="#pricing" className="hover:text-white transition-colors duration-200">
            Pricing
          </a>
          <a href="#security" className="hover:text-white transition-colors duration-200">
            Security
          </a>
          <Link to="/help" className="hover:text-white transition-colors duration-200">
            Help
          </Link>
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="px-5 py-2.5 rounded-xl bg-white text-slate-950 text-sm font-bold hover:bg-slate-100 hover:shadow-lg hover:shadow-white/10 active:scale-95 transition-all"
          >
            Start free
          </Link>
        </div>

        <button
          className="md:hidden p-2.5 rounded-lg border border-white/10 text-slate-400 hover:text-white bg-slate-900/50"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden px-6 py-5 border-t border-white/10 bg-[#060911]/98 backdrop-blur-2xl flex flex-col gap-4 text-slate-200 font-medium text-sm animate-in slide-in-from-top-2">
          <a href="#features" onClick={() => setMobileOpen(false)} className="py-1 hover:text-indigo-400">
            Features
          </a>
          <a href="#pricing" onClick={() => setMobileOpen(false)} className="py-1 hover:text-indigo-400">
            Pricing
          </a>
          <a href="#security" onClick={() => setMobileOpen(false)} className="py-1 hover:text-indigo-400">
            Security
          </a>
          <Link to="/help" onClick={() => setMobileOpen(false)} className="py-1 hover:text-indigo-400">
            Help & Support
          </Link>
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5">
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="w-full text-center py-2.5 text-slate-300 font-semibold rounded-xl bg-white/5"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              onClick={() => setMobileOpen(false)}
              className="w-full text-center py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
