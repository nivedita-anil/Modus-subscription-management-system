import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, Layers, Percent, Receipt, Users, LogOut, Repeat,
} from "lucide-react";
import { getUser, logout } from "../../lib/auth";

// `soon: true` items are placeholders until we build them.
const nav = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, soon: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/plans", label: "Plans", icon: Layers },
  { to: "/admin/discounts", label: "Discounts", icon: Percent, soon: true },
  { to: "/admin/taxes", label: "Tax rules", icon: Receipt, soon: true },
  { to: "/admin/staff", label: "Staff", icon: Users, soon: true },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getUser();

  function signOut() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 text-slate-300 md:flex">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Repeat className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold text-white">Brightloop</span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map(({ to, label, icon: Icon, soon }) =>
            soon ? (
              <div key={to}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500">
                <Icon className="h-4 w-4" />
                {label}
                <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  Soon
                </span>
              </div>
            ) : (
              <NavLink key={to} to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? "bg-brand-600 text-white" : "hover:bg-slate-800 hover:text-white"
                  }`
                }>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            )
          )}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <p className="truncate text-sm font-medium text-white">{user?.full_name}</p>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
          <button onClick={signOut}
            className="mt-3 flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <span className="font-bold">Brightloop</span>
          <button onClick={signOut} className="text-sm text-slate-500">Sign out</button>
        </header>
        <main className="flex-1 p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
