import { X, ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_STYLE = {
  draft: "bg-slate-100 text-slate-600",
  quotation: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-200 text-slate-600",
  paid: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
  overdue: "bg-red-50 text-red-700",
  paused: "bg-orange-50 text-orange-700",
};

export function StatusBadge({ status, overdue, paused }) {
  const key = overdue ? "overdue" : paused ? "paused" : status;
  const text = overdue ? "Overdue" : paused ? "Paused" : status;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[key] || STATUS_STYLE.draft}`}>
      {text}
    </span>
  );
}

export function ErrorBox({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      <span>{message}</span>
      {onClose && <button onClick={onClose}><X className="h-4 w-4" /></button>}
    </div>
  );
}

export function Notice({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
      <span>{message}</span>
      {onClose && <button onClick={onClose}><X className="h-4 w-4" /></button>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 no-print">{children}</div>
    </div>
  );
}

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";
export const btnPrimary = "btn-primary !w-auto";

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between px-1 pt-3 text-sm text-slate-500 no-print">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-2">
        <button className={btnSecondary + " !px-2.5 !py-1.5"} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>Page {page} of {pages}</span>
        <button className={btnSecondary + " !px-2.5 !py-1.5"} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 no-print">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export const tableWrap = "mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm";
export const thead = "border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500";

export function Card({ title, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>}
      {children}
    </div>
  );
}
