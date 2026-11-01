import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { api } from "../../api/client";
import { money, dateText, PERIOD_LABEL } from "../../lib/format";
import { useBase } from "../../hooks/useBase";
import { ErrorBox, PageHeader, Pagination, StatusBadge, btnPrimary, tableWrap, thead } from "../../components/ui";

const STATUSES = ["draft", "quotation", "confirmed", "active", "closed"];

export default function Subscriptions() {
  const base = useBase();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState("");
  const status = sp.get("status") || "";
  const due = sp.get("due") === "1";
  const page = Number(sp.get("page") || 1);
  const [data, setData] = useState({ items: [], total: 0, page_size: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      if (q.trim()) p.set("q", q.trim());
      if (status) p.set("status", status);
      if (due) p.set("due", "true");
      setData(await api(`/subscriptions?${p}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, status, due, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Subscriptions" subtitle="Every subscription and where it stands in its lifecycle.">
        <Link to={`${base}/subscriptions/new`} className={btnPrimary}><Plus className="h-4 w-4" /> New subscription</Link>
      </PageHeader>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Number, customer, company…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input !w-auto" value={status} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={due} onChange={(e) => setParam("due", e.target.checked ? "1" : "")}
            className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Due for billing
        </label>
      </div>

      <ErrorBox message={error} />

      <div className={tableWrap}>
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-4 py-3">Number</th><th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Start</th><th className="px-4 py-3">Next billing</th>
              <th className="px-4 py-3 text-right">Per period</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-14 text-center text-slate-400">No subscriptions match.</td></tr>
            ) : data.items.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link className="text-brand-600" to={`${base}/subscriptions/${s.id}`}>{s.number}</Link>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{s.customer_name}</div>
                  {s.customer_company && <div className="text-xs text-slate-400">{s.customer_company}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{s.plan_name}</td>
                <td className="px-4 py-3"><StatusBadge status={s.status} paused={s.is_paused} /></td>
                <td className="px-4 py-3 text-slate-600">{dateText(s.start_date)}</td>
                <td className="px-4 py-3 text-slate-600">{s.status === "active" ? dateText(s.next_billing_date) : "—"}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {money(s.amount)} <span className="text-xs font-normal text-slate-400">/ {PERIOD_LABEL[s.billing_period]}</span>
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
