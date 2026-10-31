import { useLocation } from "react-router-dom";

export const STATUSES = [
  { value: "draft", label: "Draft", cls: "bg-slate-100 text-slate-600" },
  { value: "quotation", label: "Quotation", cls: "bg-sky-50 text-sky-700" },
  { value: "confirmed", label: "Confirmed", cls: "bg-violet-50 text-violet-700" },
  { value: "active", label: "Active", cls: "bg-emerald-50 text-emerald-700" },
  { value: "closed", label: "Closed", cls: "bg-amber-50 text-amber-700" },
];
export const statusOf = (v) => STATUSES.find((s) => s.value === v) ?? STATUSES[0];

export const TERMS = [
  { value: "immediate", label: "Immediate payment" },
  { value: "net_15", label: "Net 15 days" },
  { value: "net_30", label: "Net 30 days" },
  { value: "net_60", label: "Net 60 days" },
];
export const termsLabel = (v) => TERMS.find((t) => t.value === v)?.label ?? v;

export const PERIOD_UNIT = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

export const fmtDate = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayISO = () => isoOf(new Date());

export function oneYearFrom(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return isoOf(d);
}

/** "/admin" or "/staff": the same pages work inside either layout. */
export function useBase() {
  const { pathname } = useLocation();
  return pathname.startsWith("/admin") ? "/admin" : "/staff";
}
