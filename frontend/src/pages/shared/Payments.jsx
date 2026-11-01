import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "../../api/client";
import { money, dateText } from "../../lib/format";
import { useBase } from "../../hooks/useBase";
import { ErrorBox, PageHeader, Pagination, tableWrap, thead } from "../../components/ui";

const METHODS = [["bank_transfer", "Bank transfer"], ["upi", "UPI"], ["card", "Card"], ["cash", "Cash"], ["cheque", "Cheque"], ["other", "Other"]];
const label = (m) => METHODS.find(([k]) => k === m)?.[1] || m;

export default function Payments() {
  const base = useBase();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get("page") || 1);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState({ items: [], total: 0, page_size: 20, amount_total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ page, page_size: 20 });
      if (q.trim()) p.set("q", q.trim());
      if (method) p.set("method", method);
      if (from) p.set("date_from", from);
      if (to) p.set("date_to", to);
      setData(await api(`/payments?${p}`));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [q, method, from, to, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Payments" subtitle="Money received, with the method, date and invoice it was recorded against. Record new ones from an invoice." />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Invoice, customer, note…" value={q}
            onChange={(e) => { setQ(e.target.value); setSp({}, { replace: true }); }} />
        </div>
        <select className="input !w-auto" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All methods</option>
          {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-slate-500">Payments in this view</p><p className="text-lg font-bold">{data.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-slate-500">Amount received</p><p className="text-lg font-bold text-emerald-600">{money(data.amount_total)}</p>
        </div>
      </div>

      <ErrorBox message={error} />
      <div className={tableWrap}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Method</th><th className="px-4 py-3">Note</th><th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-400">No payments match.</td></tr>
            ) : data.items.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{dateText(p.paid_on)}</td>
                <td className="px-4 py-3 font-medium"><Link className="text-brand-600" to={`${base}/invoices/${p.invoice_id}`}>{p.invoice_number}</Link></td>
                <td className="px-4 py-3">{p.customer_name}</td>
                <td className="px-4 py-3 text-slate-600">{label(p.method)}</td>
                <td className="px-4 py-3 text-slate-400">{p.note || "—"}</td>
                <td className="px-4 py-3 text-right font-medium">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={data.page_size} total={data.total}
        onPage={(n) => setSp({ page: String(n) }, { replace: true })} />
    </div>
  );
}
