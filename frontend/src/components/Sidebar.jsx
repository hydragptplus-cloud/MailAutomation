import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Mail,
  Settings,
  Server,
  Users,
  X,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { getUser } from "../utils/auth";
import api from "../services/api";
import BrandLogo from "./BrandLogo";

const items = [
  ["/dashboard", "Dashboard", LayoutDashboard, ["owner", "admin", "manager", "operator", "viewer"]],
  ["/platform", "Platform", ShieldCheck, ["owner"]],
  ["/account", "Account & Users", Building2, ["admin", "manager", "operator", "viewer"]],
  ["/templates", "Templates", FileText, ["owner", "admin", "manager", "operator", "viewer"]],
  ["/recipients", "Recipients", Users, ["owner", "admin", "manager", "operator", "viewer"]],
  ["/campaigns", "Campaigns", Mail, ["owner", "admin", "manager", "operator", "viewer"]],
  ["/smtp", "SMTP", Server, ["owner", "admin", "manager", "operator", "viewer"]],
  ["/reports", "Reports", BarChart3, ["owner", "admin", "manager", "operator", "viewer"]],
  ["/support", "Help & Support", HelpCircle, ["admin", "manager", "operator", "viewer"]],
  ["/mail-workspace", "Mail Workspace", Mail, ["owner", "admin"], "support_workspace"],
  ["/settings", "Settings", Settings, ["admin"]],
];

export default function Sidebar({ isOpen, onClose }) {
  const role = getUser().role;
  const [account, setAccount] = useState(null);

  useEffect(() => {
    if (role === "owner") return;
    let active = true;
    api
      .get("/account/")
      .then((response) => {
        if (active) setAccount(response.data);
      })
      .catch(() => {
        if (active) setAccount(null);
      });
    return () => {
      active = false;
    };
  }, [role]);

  const planSlug = account?.subscription?.plan;
  const planName = account?.subscription?.plan_name || "Current Plan";
  const isFreePlan = planSlug === "free";
  const showPlanCard = role !== "owner" && Boolean(account?.subscription) && isFreePlan;

  return (
    <>
      {/* Mobile Drawer Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`sidebar fixed lg:sticky top-0 left-0 z-50 h-screen w-64 lg:w-60 bg-slate-900 border-r border-slate-800 p-5 flex flex-col justify-between transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
      >
        <div>
          {/* Brand Header */}
          <div className="flex items-center justify-between mb-8 px-1">
            <div className="flex items-center gap-3 min-w-0">
              <BrandLogo variant="mark" className="w-10 h-10 object-contain shrink-0" alt="" />
              <div>
                <span className="font-bold text-white tracking-tight flex items-center text-base">
                  Mail Flow
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">v2.0 Enterprise</span>
              </div>
            </div>

            {/* Close button on mobile */}
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {items.filter(([, , , roles, feature]) => roles.includes(role) && (!feature || role === "owner" || (account?.support_workspace_enabled && account?.support_workspace_available))).map(([to, label, Icon]) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  }`
                }
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="space-y-3">
          {showPlanCard && (
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/55 p-4 shadow-xl shadow-slate-950/20">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-bold text-slate-100">{planName}</p>
                <span className="rounded-full border border-amber-400/20 bg-amber-400/15 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                  Free
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Upgrade for more sending power.
              </p>
              <NavLink
                to="/account"
                onClick={onClose}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/70 px-3 py-2.5 text-sm font-bold text-indigo-300 transition-colors hover:bg-indigo-500/10 hover:text-indigo-200"
              >
                <ArrowRight className="h-4 w-4" /> Upgrade Plan
              </NavLink>
            </div>
          )}

          {/* Footer info */}
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400 flex items-center justify-between">
            <span>Engine Status</span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Active
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
