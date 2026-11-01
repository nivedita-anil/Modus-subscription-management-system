import { X, ChevronLeft, ChevronRight } from "lucide-react";

const PILL = {
  draft: "pill-neutral", closed: "pill-neutral", quotation: "pill-warning", confirmed: "pill-lavender",
  active: "pill-success", paid: "pill-success", cancelled: "pill-danger", overdue: "pill-danger",
  paused: "pill-warning",
};

export function StatusBadge({ status, overdue, paused }) {
  const key = overdue ? "overdue" : paused ? "paused" : status;
  return <span className={`pill ${PILL[key] || "pill-neutral"}`}>{overdue ? "Overdue" : paused ? "Paused" : status}</span>;
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

export function PageHeader({ title, subtitle, eyebrow, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow"><span className="eyebrow-dot" /> {eyebrow}</p>}
        <h1 className="page-title">{title}<span className="heading-period">.</span></h1>
        {subtitle && <p className="mt-3 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 no-print">{children}</div>
    </div>
  );
}

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold shadow-none transition disabled:cursor-not-allowed disabled:opacity-60 border-[rgba(215,162,192,.2)] bg-[rgba(215,162,192,.08)] text-[color:var(--primary)] hover:border-[rgba(215,162,192,.42)] hover:bg-[rgba(215,162,192,.13)]";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold shadow-none transition disabled:cursor-not-allowed disabled:opacity-60 border-[rgba(242,160,168,.3)] bg-transparent text-[color:var(--coral)] hover:bg-[rgba(242,160,168,.1)]";
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
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>
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

export const tableWrap = "panel mt-4 overflow-x-auto";
export const thead = "border-b border-slate-200 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400";

export function Card({ title, children, className = "" }) {
  return (
    <div className={`panel p-5 ${className}`}>
      {title && <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>}
      {children}
    </div>
  );
}
