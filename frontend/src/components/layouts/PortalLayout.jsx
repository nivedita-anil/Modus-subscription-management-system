import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Repeat, LogOut } from "lucide-react";
import { getUser, logout } from "../../lib/auth";

export default function PortalLayout() {
  const navigate = useNavigate();
  const user = getUser();
  const link = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Repeat className="h-4 w-4" />
              </div>
              <span className="text-lg font-bold text-slate-900">Brightloop</span>
            </div>
            <nav className="flex gap-1">
              <NavLink to="/portal/subscriptions" className={link}>My subscriptions</NavLink>
              <NavLink to="/portal/invoices" className={link}>My invoices</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user?.full_name}</span>
            <button onClick={() => { logout(); navigate("/login"); }}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
