import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, Layers, Percent, Receipt, Users, LogOut, Repeat, FileText,
  RefreshCw, FileSpreadsheet, Wallet,
} from "lucide-react";
import { getUser, logout } from "../../lib/auth";

// One layout for admin and staff. `adminOnly` items are hidden from staff.
const items = (base) => [
  { to: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
  { to: `${base}/subscriptions`, label: "Subscriptions", icon: RefreshCw },
  { to: `${base}/invoices`, label: "Invoices", icon: FileSpreadsheet },
  { to: `${base}/payments`, label: "Payments", icon: Wallet },
  { to: `${base}/quotation-templates`, label: "Quotation templates", icon: FileText },
  { to: `${base}/products`, label: "Products", icon: Package, adminOnly: true },
  { to: `${base}/plans`, label: "Plans", icon: Layers, adminOnly: true },
  { to: `${base}/discounts`, label: "Discounts", icon: Percent, adminOnly: true },
  { to: `${base}/taxes`, label: "Tax rules", icon: Receipt, adminOnly: true },
  { to: `${base}/staff-users`, label: "Staff", icon: Users, adminOnly: true },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getUser();
  const isAdmin = user?.role === "admin";
  const nav = items(isAdmin ? "/admin" : "/staff").filter((i) => isAdmin || !i.adminOnly);

  function signOut() {
    logout();
    navigate("/login");
  }

  const link = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive ? "bg-brand-600 text-white" : "hover:bg-slate-800 hover:text-white"
    }`;

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-slate-900 text-slate-300 md:flex">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Repeat className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold text-white">Brightloop</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={link}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <p className="truncate text-sm font-medium text-white">{user?.full_name}</p>
          <p className="truncate text-xs capitalize text-slate-400">{user?.role} · {user?.email}</p>
          <button onClick={signOut} className="mt-3 flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print border-b border-slate-200 bg-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-bold">Brightloop</span>
            <button onClick={signOut} className="text-sm text-slate-500">Sign out</button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {nav.map(({ to, label }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                    isActive ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
