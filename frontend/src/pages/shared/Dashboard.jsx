import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, TrendingUp, Wallet, Clock, AlertTriangle, FileSpreadsheet, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { money, dateText, todayISO } from "../../lib/format";
import { getUser } from "../../lib/auth";
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

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default function Dashboard() {
  const base = useBase();
  const firstName = (getUser()?.full_name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
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
      <PageHeader title={`${greeting()}, ${firstName}`} eyebrow={today} subtitle="Here's where subscriptions, revenue and payments stand.">
        <select className="input !w-auto" aria-label="Filter by plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">All plans</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </PageHeader>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {PRESETS.map(([k, label]) => (
          <button key={k} onClick={() => pick(k)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
              range.name === k ? "bg-[var(--accent-soft)] text-[color:var(--primary)] ring-1 ring-[rgba(220,69,154,.4)]" : "border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800"}`}>
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
            <Stat icon={RefreshCw} label="Active subscriptions" tone2="lavender" value={data.subscriptions.active}
              hint={`${data.subscriptions.paused} paused · ${data.subscriptions.total} in total`}
              to={`${base}/subscriptions?status=active`} />
            <Stat icon={TrendingUp} label="Monthly recurring revenue" tone2="rose" value={money(data.mrr)}
              hint="Active subscriptions, before discounts and tax" />
            <Stat icon={Wallet} label="Revenue collected" tone2="green" value={money(data.revenue_collected)} tone="good"
              hint={`${data.payments_count} payments in this period`} to={`${base}/payments`} />
            <Stat icon={FileSpreadsheet} label="Invoiced" tone2="lavender" value={money(data.invoiced)}
              hint={`${data.invoices_count} invoices in this period`} to={`${base}/invoices`} />
            <Stat icon={Clock} label="Still owed (outstanding)" tone2="orange" value={money(data.outstanding)}
              hint={`${data.outstanding_count} confirmed invoices unpaid`} to={`${base}/invoices?status=confirmed`} />
            <Stat icon={AlertTriangle} label="Overdue" tone2="rose" value={money(data.overdue)} tone="bad"
              hint={`${data.overdue_count} invoices past their due date`} to={`${base}/invoices?overdue=1`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Revenue, last 6 months" className="lg:col-span-2">
              <div className="flex h-44 items-end gap-3">
                {data.months.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <div className="w-1/2 max-w-[22px] rounded-t bg-[rgba(183,169,232,.35)]" title={`Invoiced ${money(m.invoiced)}`}
                        style={{ height: `${(Number(m.invoiced) / maxMonth) * 100}%` }} />
                      <div className="w-1/2 max-w-[22px] rounded-t bg-[var(--accent)]" title={`Collected ${money(m.collected)}`}
                        style={{ height: `${(Number(m.collected) / maxMonth) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-500">{m.month.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-[rgba(183,169,232,.35)]" /> Invoiced</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-[var(--accent)]" /> Collected</span>
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
                      <div className="h-1.5 rounded bg-[var(--accent)]" style={{ width: `${(n / statusTotal) * 100}%` }} />
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

          <div className="mt-10 flex items-end justify-between">
            <div><p className="eyebrow"><span className="eyebrow-dot" /> Needs chasing</p><h2 className="text-xl font-semibold text-slate-900">Overdue invoices</h2></div>
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

function Stat({ icon: Icon, label, value, hint, to, tone, tone2 = "rose" }) {
  const color = tone === "bad" ? "var(--coral)" : "var(--text)";
  const body = (
    <div className="panel h-full p-[18px] transition hover:border-[rgba(215,162,192,.28)]">
      <span className={`metric-icon tone-${tone2}`}><Icon className="h-4 w-4" /></span>
      <p className="mt-4 text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-display text-[26px] font-semibold" style={{ letterSpacing: "-0.06em", color }}>{value}</p>
      <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
