import {
  BarChart3,
  Gauge,
  Layers3,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react";

export const FEATURES = [
  {
    icon: ServerCog,
    title: "Multi-SMTP Routing",
    copy: "Organize multiple sending accounts, load-balance dispatches, and monitor connection health seamlessly.",
  },
  {
    icon: Layers3,
    title: "Campaign Workflows",
    copy: "Create, schedule, launch, and audit full broadcast cycles from an unified command interface.",
  },
  {
    icon: Users,
    title: "Recipient Intelligence",
    copy: "Import, tag, filter, and maintain clean audience segments without list decay or pollution.",
  },
  {
    icon: BarChart3,
    title: "Delivery Reporting",
    copy: "Real-time tracking for delivered, bounced, queued, and campaign-level open/click engagement.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant Isolation",
    copy: "Strict operational separation for team members, credentials, audience lists, and logs.",
  },
  {
    icon: Gauge,
    title: "Quota Controls",
    copy: "Granular visibility into daily, weekly, and rolling 30-day capacity before dispatching.",
  },
];

export default function LandingFeatures() {
  return (
    <section id="features" className="border-y border-white/5 bg-slate-950/50 py-24">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-2xl">
          <span className="text-indigo-400 text-xs font-bold uppercase tracking-[0.2em]">
            Built for real operations
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold mt-2 tracking-tight text-white">
            Everything between compose and delivered.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
          {FEATURES.map(({ icon: Icon, title, copy }) => (
            <article
              key={title}
              className="p-7 rounded-2xl border border-white/[0.06] bg-slate-900/40 hover:bg-slate-900/80 hover:border-indigo-500/30 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group shadow-sm"
            >
              <div>
                <span className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 grid place-items-center group-hover:bg-indigo-500/20 group-hover:scale-110 transition-all duration-300">
                  <Icon className="w-6 h-6" />
                </span>
                <h3 className="font-bold text-white text-lg mt-5 tracking-tight">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed mt-2.5">
                  {copy}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
