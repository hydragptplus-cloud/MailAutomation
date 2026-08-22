import { Link } from "react-router-dom";

export default function LandingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/5 bg-[#060911]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
        <span>© 2026 Mail Flow. All rights reserved.</span>
        <Link to="/help" className="hover:text-slate-300">
          Help & Support
        </Link>
      </div>
    </footer>
  );
}
