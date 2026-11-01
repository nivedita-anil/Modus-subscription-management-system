import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, Layers, Percent, Receipt, Users, LogOut, FileText,
  RefreshCw, FileSpreadsheet, Wallet, Menu,
} from "lucide-react";
import { api } from "../../api/client";
import { getUser, logout } from "../../lib/auth";
import { Wordmark } from "../Brand";

// One layout for admin and staff. `adminOnly` items are hidden from staff.
const groups = (base) => [
  {
    label: "Workspace",
    items: [
      { to: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
      { to: `${base}/subscriptions`, label: "Subscriptions", icon: RefreshCw },
      { to: `${base}/invoices`, label: "Invoices", icon: FileSpreadsheet, badge: true },
      { to: `${base}/payments`, label: "Payments", icon: Wallet },
    ],
  },
  {
    label: "Catalog",
    items: [
      { to: `${base}/quotation-templates`, label: "Quotation templates", icon: FileText },
      { to: `${base}/products`, label: "Products", icon: Package, adminOnly: true },
      { to: `${base}/plans`, label: "Plans", icon: Layers, adminOnly: true },
      { to: `${base}/discounts`, label: "Discounts", icon: Percent, adminOnly: true },
      { to: `${base}/taxes`, label: "Tax rules", icon: Receipt, adminOnly: true },
    ],
  },
  { label: "Team", adminOnly: true, items: [{ to: `${base}/staff-users`, label: "Staff", icon: Users }] },
];

const initials = (name = "") => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

export default function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = getUser();
  const isAdmin = user?.role === "admin";
  const base = isAdmin ? "/admin" : "/staff";
  const [open, setOpen] = useState(false);
  const [overdue, setOverdue] = useState(0);

  // the pink badge on Invoices: how many are overdue right now
  useEffect(() => {
    api("/invoices?overdue=true&page_size=1").then((d) => setOverdue(d.total)).catch(() => {});
  }, [pathname]);
  useEffect(() => setOpen(false), [pathname]);

  function signOut() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen">
      <aside className={`app-sidebar no-print ${open ? "open" : ""}`}>
        <div className="px-2.5">
          <Wordmark />
        </div>

        <nav className="mt-9 flex-1 space-y-6 overflow-y-auto">
          {groups(base)
            .filter((g) => isAdmin || !g.adminOnly)
            .map((g) => {
              const items = g.items.filter((i) => isAdmin || !i.adminOnly);
              if (!items.length) return null;
              return (
                <div key={g.label}>
                  <span className="sb-label">{g.label}</span>
                  {items.map(({ to, label, icon: Icon, badge }) => (
                    <NavLink key={to} to={to} className={({ isActive }) => `sb-link ${isActive ? "active" : ""}`}>
                      <Icon className="h-4 w-4" />
                      {label}
                      {badge && overdue > 0 && <em title={`${overdue} overdue`}>{overdue > 99 ? "99+" : overdue}</em>}
                    </NavLink>
                  ))}
                </div>
              );
            })}
        </nav>

        <div className="flex items-center gap-2.5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <span className="grid h-8 w-8 flex-none place-items-center rounded-lg font-display text-xs font-bold"
            style={{ background: "linear-gradient(135deg,#8f406d,#51203d)", color: "#f7d8e9" }}>
            {initials(user?.full_name)}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-xs text-slate-800">{user?.full_name}</strong>
            <small className="block text-[11px] capitalize text-slate-400">{user?.role}</small>
          </span>
          <button onClick={signOut} title="Sign out" aria-label="Sign out"
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-800">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
      <div className={`sb-overlay ${open ? "open" : ""}`} onClick={() => setOpen(false)} />

      <div className="app-main flex min-w-0 flex-col">
        <header className="no-print flex h-14 items-center justify-between border-b px-4 md:hidden" style={{ borderColor: "var(--line)" }}>
          <Wordmark />
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-2 text-slate-500 hover:text-slate-800">
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
