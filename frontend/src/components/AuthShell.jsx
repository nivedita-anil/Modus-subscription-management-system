import { Repeat, FileText, BarChart3, ShieldCheck } from "lucide-react";
import { Wordmark } from "./Brand";

const features = [
  { icon: Repeat, text: "Recurring billing on autopilot" },
  { icon: FileText, text: "Invoices created for you, never twice" },
  { icon: BarChart3, text: "Live view of revenue and overdue payments" },
  { icon: ShieldCheck, text: "A secure portal for every customer" },
];

/** Split-screen layout shared by Login, Register and the password reset pages. */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2" style={{ background: "var(--bg)" }}>
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: "radial-gradient(ellipse 80% 55% at 30% 0%, rgba(119,35,83,.5), transparent 70%), #1a0e15", borderRight: "1px solid var(--line)" }}>
        <div className="pointer-events-none absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(119,35,83,.45), transparent 68%)" }} />
        <div className="relative"><Wordmark /></div>

        <div className="relative max-w-md">
          <h2 className="font-display text-5xl font-semibold leading-[0.98]" style={{ letterSpacing: "-0.07em" }}>
            Every subscription, invoice and payment in one place<span style={{ color: "var(--accent)" }}>.</span>
          </h2>
          <ul className="mt-9 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
                <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs" style={{ color: "var(--muted-2)" }}>© {new Date().getFullYear()} Brightloop Software</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden"><Wordmark /></div>
          <h1 className="page-title">{title}<span className="heading-period">.</span></h1>
          <p className="mt-2.5 text-sm" style={{ color: "var(--muted)" }}>{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
