import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Zap, CheckCheck, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { money, dateText } from "../../lib/format";
import { useBase } from "../../hooks/useBase";
import { ErrorBox, Notice, PageHeader, Pagination, StatusBadge, btnPrimary, btnSecondary, tableWrap, thead } from "../../components/ui";

const STATUSES = ["draft", "confirmed", "paid", "cancelled"];

export default function Invoices() {
  const base = useBase();
  const portal = base === "/portal";
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "";
  const overdue = sp.get("overdue") === "1";
  const page = Number(sp.get("page") || 1);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState({ items: [], total: 0, page_size: 20, sum_total: 0, sum_balance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const setParam = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n, { replace: true });
  };

  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ page, page_size: 20 });
      if (status) p.set("status", status);
      if (!portal) {
        if (q.trim()) p.set("q", q.trim());
        if (overdue) p.set("overdue", "true");
        if (from) p.set("date_from", from);
        if (to) p.set("date_to", to);
      }
      setData(await api(`${portal ? "/portal" : ""}/invoices?${p}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, status, overdue, from, to, page, portal]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function generate() {
    setBusy("generate"); setError(""); setNotice("");
    try {
      const r = await api("/invoices/generate", { method: "POST", body: {} });
      setNotice(
        r.created
          ? `Created ${r.created} draft invoice${r.created === 1 ? "" : "s"} for ${r.subscriptions} subscription${r.subscriptions === 1 ? "" : "s"}.`
          : "Nothing is due. Every period that should be billed already has an invoice."
      );
      if (r.errors?.length) setError(r.errors.join(" "));
      load();
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  async function confirmAll() {
    if (!window.confirm("Confirm every draft invoice?")) return;
    setBusy("confirm"); setError(""); setNotice("");
    try {
      const r = await api("/invoices/bulk-confirm", { method: "POST", body: {} });
      setNotice(`Confirmed ${r.confirmed} invoice${r.confirmed === 1 ? "" : "s"}.`);
      load();
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={portal ? "My invoices" : "Invoices"}
        subtitle={portal ? "What you've been billed and what is still due." : "Created from subscriptions on billing day, then confirmed, sent and paid."}>
        {!portal && (
          <>
            <button className={btnSecondary} disabled={!!busy} onClick={confirmAll}>
              {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} Confirm all drafts
            </button>
            <button className={btnPrimary} disabled={!!busy} onClick={generate}>
              {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Generate due invoices
            </button>
          </>
        )}
      </PageHeader>

      <Notice message={notice} onClose={() => setNotice("")} />
      <ErrorBox message={error} onClose={() => setError("")} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!portal && (
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Invoice, customer, subscription…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        <select className="input !w-auto" value={status} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">All statuses</option>
          {(portal ? ["confirmed", "paid"] : STATUSES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {!portal && (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={overdue} onChange={(e) => setParam("overdue", e.target.checked ? "1" : "")}
                className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Overdue only
            </label>
            <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} title="Issued from" />
            <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} title="Issued to" />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Mini k="Invoices" v={data.total} />
        <Mini k="Billed in this view" v={money(data.sum_total)} />
        <Mini k="Still owed in this view" v={money(data.sum_balance)} tone={Number(data.sum_balance) > 0 ? "bad" : ""} />
      </div>

      <div className={tableWrap}>
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-4 py-3">Invoice</th>{!portal && <th className="px-4 py-3">Customer</th>}
              <th className="px-4 py-3">Issued</th><th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-14 text-center text-slate-400">No invoices match.</td></tr>
            ) : data.items.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link className="text-brand-600" to={`${base}/invoices/${i.id}`}>{i.number}</Link>
                  <div className="text-xs font-normal text-slate-400">{i.subscription_number}</div>
                </td>
                {!portal && (
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{i.customer_name}</div>
                    {i.customer_company && <div className="text-xs text-slate-400">{i.customer_company}</div>}
                  </td>
                )}
                <td className="px-4 py-3 text-slate-600">{dateText(i.issue_date)}</td>
                <td className="px-4 py-3 text-slate-600">{dateText(i.due_date)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={i.status} overdue={i.is_overdue} />
                  {i.is_overdue && <span className="ml-1.5 text-xs text-red-600">{i.days_overdue}d</span>}
                </td>
                <td className="px-4 py-3 text-right">{money(i.total)}</td>
                <td className={`px-4 py-3 text-right font-medium ${i.is_overdue ? "text-red-600" : ""}`}>
                  {i.status === "cancelled" ? "—" : money(i.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={data.page_size} total={data.total} onPage={(n) => setParam("page", String(n))} />
    </div>
  );
}

const Mini = ({ k, v, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <p className="text-xs text-slate-500">{k}</p>
    <p className={`text-lg font-bold ${tone === "bad" ? "text-red-600" : "text-slate-900"}`}>{v}</p>
  </div>
);
