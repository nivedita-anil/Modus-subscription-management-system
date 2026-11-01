import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, TrendingUp, Wallet, Clock, AlertTriangle, FileSpreadsheet, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { money, dateText, todayISO } from "../../lib/format";
import { useBase } from "../../hooks/useBase";
import { Card, ErrorBox, PageHeader, StatusBadge, tableWrap, thead } from "../../components/ui";

const iso = (d) => d.toLocaleDateString("en-CA");
function preset(name) {
  const now = new Date();
  if (name === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayISO(), all: false };
  if (name === "30") return { from: iso(new Date(Date.now() - 29 * 864e5)), to: todayISO(), all: false };
  if (name === "year") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: todayISO(), all: false };
  return { from: "", to: "", all: true };
}
const PRESETS = [["month", "This month"], ["30", "Last 30 days"], ["year", "This year"], ["all", "All time"]];

export default function Dashboard() {
  const base = useBase();
  const [range, setRange] = useState({ ...preset("month"), name: "month" });
  const [planId, setPlanId] = useState("");
  const [plans, setPlans] = useState([]);
  const [data, setData] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { api("/plans?limit=200").then(setPlans).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams();
      if (range.all) p.set("all_time", "true");
      else { if (range.from) p.set("date_from", range.from); if (range.to) p.set("date_to", range.to); }
      if (planId) p.set("plan_id", planId);
      const [summary, od] = await Promise.all([
        api(`/dashboard/summary?${p}`),
        api("/invoices?overdue=true&page_size=8"),
      ]);
      setData(summary);
      setOverdue(od.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range, planId]);
  useEffect(() => { load(); }, [load]);

  const pick = (name) => setRange({ ...preset(name), name });
  const custom = (k) => (e) => setRange({ ...range, [k]: e.target.value, all: false, name: "custom" });

  const maxMonth = data ? Math.max(1, ...data.months.map((m) => Math.max(Number(m.collected), Number(m.invoiced)))) : 1;
  const statusTotal = data ? Math.max(1, data.subscriptions.total) : 1;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Dashboard" subtitle="Subscriptions, revenue, payments and overdue invoices in one place.">
        <select className="input !w-auto" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">All plans</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </PageHeader>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {PRESETS.map(([k, label]) => (
          <button key={k} onClick={() => pick(k)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
              range.name === k ? "bg-brand-600 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        <input type="date" className="input !w-auto !py-1.5" value={range.from} onChange={custom("from")} />
        <span className="text-slate-400">to</span>
        <input type="date" className="input !w-auto !py-1.5" value={range.to} onChange={custom("to")} />
      </div>

      <ErrorBox message={error} />
      {loading && <p className="mt-10 flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}

      {data && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat icon={RefreshCw} label="Active subscriptions" value={data.subscriptions.active}
              hint={`${data.subscriptions.paused} paused · ${data.subscriptions.total} in total`}
              to={`${base}/subscriptions?status=active`} />
            <Stat icon={TrendingUp} label="Monthly recurring revenue" value={money(data.mrr)}
              hint="Active subscriptions, before discounts and tax" />
            <Stat icon={Wallet} label="Revenue collected" value={money(data.revenue_collected)} tone="good"
              hint={`${data.payments_count} payments in this period`} to={`${base}/payments`} />
            <Stat icon={FileSpreadsheet} label="Invoiced" value={money(data.invoiced)}
              hint={`${data.invoices_count} invoices in this period`} to={`${base}/invoices`} />
            <Stat icon={Clock} label="Still owed (outstanding)" value={money(data.outstanding)}
              hint={`${data.outstanding_count} confirmed invoices unpaid`} to={`${base}/invoices?status=confirmed`} />
            <Stat icon={AlertTriangle} label="Overdue" value={money(data.overdue)} tone="bad"
              hint={`${data.overdue_count} invoices past their due date`} to={`${base}/invoices?overdue=1`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Revenue, last 6 months" className="lg:col-span-2">
              <div className="flex h-44 items-end gap-3">
                {data.months.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <div className="w-1/2 max-w-[22px] rounded-t bg-brand-100" title={`Invoiced ${money(m.invoiced)}`}
                        style={{ height: `${(Number(m.invoiced) / maxMonth) * 100}%` }} />
                      <div className="w-1/2 max-w-[22px] rounded-t bg-brand-600" title={`Collected ${money(m.collected)}`}
                        style={{ height: `${(Number(m.collected) / maxMonth) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-500">{m.month.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-brand-100" /> Invoiced</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-brand-600" /> Collected</span>
              </div>
            </Card>

            <Card title="Subscriptions by status">
              <div className="space-y-2.5">
                {Object.entries(data.subscriptions.by_status).map(([s, n]) => (
                  <Link key={s} to={`${base}/subscriptions?status=${s}`} className="block">
                    <div className="flex justify-between text-sm">
                      <span className="capitalize text-slate-600">{s}</span><span className="font-medium">{n}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-slate-100">
                      <div className="h-1.5 rounded bg-brand-500" style={{ width: `${(n / statusTotal) * 100}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
                <Link to={`${base}/subscriptions?due=1`} className="flex justify-between text-slate-600 hover:text-brand-600">
                  <span>Due for billing</span><b>{data.subscriptions.due_for_billing}</b>
                </Link>
                <Link to={`${base}/invoices?status=draft`} className="flex justify-between text-slate-600 hover:text-brand-600">
                  <span>Draft invoices</span><b>{data.draft_invoices}</b>
                </Link>
              </div>
            </Card>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Overdue invoices</h2>
            <Link to={`${base}/invoices?overdue=1`} className="text-sm font-medium text-brand-600">See all</Link>
          </div>
          <div className={tableWrap}>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className={thead}>
                <tr>
                  <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Due</th><th className="px-4 py-3 text-right">Owed</th>
                  <th className="px-4 py-3">Late by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdue.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Nothing overdue. 🎉</td></tr>
                ) : overdue.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium"><Link className="text-brand-600" to={`${base}/invoices/${i.id}`}>{i.number}</Link></td>
                    <td className="px-4 py-3">{i.customer_name}</td>
                    <td className="px-4 py-3">{dateText(i.due_date)}</td>
                    <td className="px-4 py-3 text-right font-medium">{money(i.balance)}</td>
                    <td className="px-4 py-3"><StatusBadge overdue /> <span className="ml-1 text-slate-500">{i.days_overdue}d</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, to, tone }) {
  const color = tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  const body = (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/40">
      <div className="flex items-center justify-between text-sm text-slate-500">
        {label}<Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
