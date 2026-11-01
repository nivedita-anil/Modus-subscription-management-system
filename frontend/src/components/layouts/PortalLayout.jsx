import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { getUser, logout } from "../../lib/auth";
import { Wordmark } from "../Brand";

const initials = (name = "") => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

export default function PortalLayout() {
  const navigate = useNavigate();
  const user = getUser();
  const tab = ({ isActive }) =>
    `rounded-lg px-3.5 py-2 text-sm font-medium transition ${
      isActive ? "text-[color:var(--primary)]" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(ellipse 70% 40% at 55% 0%, rgba(119,35,83,.2), transparent 70%), var(--bg)" }}>
      <header className="no-print border-b" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex items-center gap-8">
            <Wordmark />
            <nav className="flex gap-1">
              <NavLink to="/portal/subscriptions" className={tab}>My subscriptions</NavLink>
              <NavLink to="/portal/invoices" className={tab}>My invoices</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-right sm:block">
              <strong className="block text-xs text-slate-800">{user?.full_name}</strong>
              <small className="text-[11px] text-slate-400">{user?.email}</small>
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-lg font-display text-xs font-bold"
              style={{ background: "linear-gradient(135deg,#8f406d,#51203d)", color: "#f7d8e9" }}>
              {initials(user?.full_name)}
            </span>
            <button onClick={() => { logout(); navigate("/login"); }} title="Sign out" aria-label="Sign out"
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-800">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
