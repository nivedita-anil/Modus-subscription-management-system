import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Repeat } from "lucide-react";
import { api } from "../../api/client";
import { money, dateText, PERIOD_LABEL } from "../../lib/format";
import { ErrorBox, PageHeader, StatusBadge } from "../../components/ui";

export default function MySubscriptions() {
  const [subs, setSubs] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/portal/subscriptions").then(setSubs).catch((e) => setError(e.message)); }, []);

  return (
    <div>
      <PageHeader title="My subscriptions" subtitle="Everything you subscribe to. Open one to manage it." />
      <ErrorBox message={error} />
      {subs === null && !error && <p className="mt-8 text-slate-400">Loading…</p>}
      {subs?.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <Repeat className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 font-medium text-slate-600">No subscriptions yet</p>
          <p className="text-sm text-slate-400">When Brightloop sets one up for you, it will show here.</p>
        </div>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {subs?.map((s) => (
          <Link key={s.id} to={`/portal/subscriptions/${s.id}`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-900">{s.plan_name}</p>
                <p className="text-xs text-slate-400">{s.number}</p>
              </div>
              <StatusBadge status={s.status} paused={s.is_paused} />
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-900">
              {money(s.total)} <span className="text-sm font-normal text-slate-400">/ {PERIOD_LABEL[s.billing_period]}</span>
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {s.status === "active" && !s.is_paused && s.next_billing_date
                ? `Next invoice ${dateText(s.next_billing_date)}`
                : s.status === "quotation" ? "Waiting for your acceptance"
                : `Started ${dateText(s.start_date)}`}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
