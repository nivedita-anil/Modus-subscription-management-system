import { Repeat, FileText, BarChart3, ShieldCheck } from "lucide-react";

const features = [
  { icon: Repeat, text: "Recurring billing on autopilot" },
  { icon: FileText, text: "Invoices created for you, never twice" },
  { icon: BarChart3, text: "Live view of revenue and overdue payments" },
  { icon: ShieldCheck, text: "Secure portal for every customer" },
];

/** Split-screen layout shared by Login / Register. */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30">
            <Repeat className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">Brightloop</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">
            Run every subscription, invoice and payment in one place.
          </h2>
          <ul className="mt-8 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-brand-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-brand-100/80">
          © {new Date().getFullYear()} Brightloop Software
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Repeat className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">Brightloop</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>

          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
