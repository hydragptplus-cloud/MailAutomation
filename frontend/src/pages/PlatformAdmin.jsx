import { NavLink, Outlet } from "react-router-dom";
import { Building2, CreditCard, LayoutDashboard, Megaphone, Settings, ShieldCheck, Tags, Users } from "lucide-react";

const tabs = [
  ["/platform", "Overview", LayoutDashboard, true],
  ["/platform/organizations", "Organizations", Building2],
  ["/platform/users", "Users", Users],
  ["/platform/plans", "Plans", Tags],
  ["/platform/billing", "Billing & Payments", CreditCard],
  ["/platform/broadcasts", "Broadcasts", Megaphone],
  ["/platform/sessions", "Sessions & Security", ShieldCheck],
  ["/platform/settings", "Settings", Settings],
];

export default function PlatformAdmin() {
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-100">Platform administration</h1><p className="text-sm text-slate-400 mt-1">Manage platform operations, billing infrastructure, organizations, and access.</p></div>
    <nav aria-label="Platform sections" className="grid grid-cols-2 sm:flex gap-1 border-b border-slate-800">
      {tabs.map(([to, label, Icon, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `inline-flex items-center justify-center sm:justify-start gap-2 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors ${isActive ? "border-indigo-400 text-indigo-300" : "border-transparent text-slate-500 hover:text-slate-200"}`}><Icon className="w-4 h-4 shrink-0" />{label}</NavLink>)}
    </nav>
    <Outlet />
  </div>;
}
