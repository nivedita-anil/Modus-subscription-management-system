import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ClipboardList } from "lucide-react";
import { api } from "../../api/client";
import { money } from "../../lib/format";
import { STATUSES, fmtDate, useBase } from "../../lib/subscriptions";
import StatusBadge from "../../components/StatusBadge";

const TABS = [{ value: "", label: "All" }, ...STATUSES];

export default function Subscriptions() {
  const base = useBase();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const [list, summary] = await Promise.all([
        api(`/subscriptions?${params}`),
        api("/subscriptions/summary"),
      ]);
      setItems(list);
      setCounts(summary);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subscriptions</h1>
          <p className="mt-1 text-sm text-slate-500">Quotes and subscriptions, and where each one stands.</p>
        </div>
        <button className="btn-primary !w-auto" onClick={() => navigate(`${base}/subscriptions/new`)}>
          <Plus className="h-4 w-4" /> New subscription
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.value} onClick={() => setStatus(t.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                status === t.value ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {t.label}
              <span className={`ml-1.5 text-xs ${status === t.value ? "text-slate-300" : "text-slate-400"}`}>
                {counts[t.value || "all"] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input w-64 pl-9" placeholder="Search number or customer…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center">
                  <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-600">No subscriptions here</p>
                  <p className="text-slate-400">Create one from a quotation template.</p>
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} onClick={() => navigate(`${base}/subscriptions/${s.id}`)}
                  className="cursor-pointer hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-brand-700">{s.number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{s.customer_name}</p>
                    <p className="text-xs text-slate-400">{s.customer_company || s.customer_email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.plan_name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {fmtDate(s.start_date)} → {fmtDate(s.expiry_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{money(s.total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
