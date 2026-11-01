import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Check, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { money, dateText, PERIOD_LABEL } from "../../lib/format";
import { getUser } from "../../lib/auth";
import { useBase } from "../../hooks/useBase";
import { Card, ErrorBox, Notice, StatusBadge, btnDanger, btnPrimary, btnSecondary, tableWrap, thead } from "../../components/ui";

const FLOW = ["draft", "quotation", "confirmed", "active", "closed"];
const MOVE_LABEL = {
  quotation: "Send as quotation", draft: "Back to draft", confirmed: "Confirm",
  active: "Activate", closed: "Close",
};

export default function SubscriptionDetail() {
  const { id } = useParams();
  const base = useBase();
  const navigate = useNavigate();
  const portal = base === "/portal";
  const isAdmin = getUser()?.role === "admin";
  const root = portal ? `/portal/subscriptions/${id}` : `/subscriptions/${id}`;

  const [sub, setSub] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try { setSub(await api(root)); } catch (e) { setError(e.message); }
  }, [root]);
  useEffect(() => { load(); }, [load]);

  async function run(label, path, body) {
    setBusy(label); setError(""); setNotice("");
    try {
      setSub(await api(`${root}/${path}`, { method: "POST", body }));
      setNotice("Done.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  if (!sub) {
    return (
      <div className="mx-auto max-w-5xl">
        <ErrorBox message={error} />
        {!error && <p className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      </div>
    );
  }

  const active = sub.status === "active";
  const canPause = active && !sub.is_paused && (sub.plan_can_pause || isAdmin);
  const canClose = active && (sub.plan_can_close_early || isAdmin);
  const canRenew = (active || sub.status === "closed") && sub.expiry_date && (sub.plan_can_renew || isAdmin);
  const stepIndex = FLOW.indexOf(sub.status);

  return (
    <div className="mx-auto max-w-5xl">
      <Link to={`${base}/subscriptions`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Subscriptions
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{sub.number}</h1>
            <StatusBadge status={sub.status} paused={sub.is_paused} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {sub.customer_name}{sub.customer_company ? ` · ${sub.customer_company}` : ""} · {sub.plan_name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {portal ? (
            sub.status === "quotation" && (
              <button className={btnPrimary} disabled={!!busy} onClick={() => run("accept", "accept")}>
                <Check className="h-4 w-4" /> Accept quotation
              </button>
            )
          ) : (
            <>
              {["draft", "quotation"].includes(sub.status) && (
                <button className={btnSecondary} onClick={() => navigate(`${base}/subscriptions/${id}/edit`)}>
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
              {sub.allowed_transitions.filter((t) => t !== "closed").map((t) => (
                <button key={t} className={t === "draft" ? btnSecondary : btnPrimary} disabled={!!busy}
                  onClick={() => run(t, "transition", { to: t })}>
                  {MOVE_LABEL[t]}
                </button>
              ))}
              {sub.allowed_transitions.includes("closed") && !active && (
                <button className={btnDanger} disabled={!!busy}
                  onClick={() => window.confirm("Close this subscription?") && run("closed", "transition", { to: "closed" })}>
                  Close
                </button>
              )}
            </>
          )}
          {canPause && <button className={btnSecondary} disabled={!!busy} onClick={() => run("pause", "action", { action: "pause" })}>Pause</button>}
          {sub.is_paused && <button className={btnPrimary} disabled={!!busy} onClick={() => run("resume", "action", { action: "resume" })}>Resume</button>}
          {canRenew && <button className={btnSecondary} disabled={!!busy} onClick={() => run("renew", "action", { action: "renew" })}>Renew</button>}
          {canClose && (
            <button className={btnDanger} disabled={!!busy}
              onClick={() => window.confirm("Close this subscription early? Billing stops.") && run("close", "action", { action: "close" })}>
              Close early
            </button>
          )}
        </div>
      </div>

      <ErrorBox message={error} onClose={() => setError("")} />
      <Notice message={notice} onClose={() => setNotice("")} />

      {/* where it stands */}
      <ol className="mt-6 grid grid-cols-5 gap-1 text-center text-xs font-medium">
        {FLOW.map((s, i) => (
          <li key={s} className={`rounded-lg px-1 py-2 capitalize ${
            i < stepIndex ? "bg-brand-100 text-brand-700" : i === stepIndex ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"}`}>
            {s}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="Customer">
          <p className="font-medium text-slate-900">{sub.customer_name}</p>
          <p className="text-sm text-slate-500">{sub.customer_email}</p>
          {sub.customer_company && <p className="text-sm text-slate-500">{sub.customer_company}</p>}
        </Card>
        <Card title="Plan and terms">
          <Row k="Plan" v={sub.plan_name} />
          <Row k="Billed" v={`every ${PERIOD_LABEL[sub.billing_period]}`} />
          <Row k="Payment terms" v={sub.payment_terms} />
          {sub.discount_name && <Row k="Discount" v={sub.discount_name} />}
        </Card>
        <Card title="Dates">
          <Row k="Starts" v={dateText(sub.start_date)} />
          <Row k="Expires" v={dateText(sub.expiry_date)} />
          {sub.status === "quotation" && <Row k="Quote valid until" v={dateText(sub.quotation_valid_until)} />}
          {active && <Row k="Next invoice" v={sub.is_paused ? "Paused" : dateText(sub.next_billing_date)} />}
        </Card>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Lines</h2>
      <div className={tableWrap}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3">Tax</th>
              <th className="px-4 py-3">Discount</th><th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sub.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{l.product_name}</div>
                  {l.variant_label && <div className="text-xs text-slate-400">{l.variant_label}</div>}
                </td>
                <td className="px-4 py-3 text-right">{l.quantity}</td>
                <td className="px-4 py-3 text-right">{money(l.unit_price)}</td>
                <td className="px-4 py-3 text-slate-600">{l.tax_name || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{l.discount_name || "—"}</td>
                <td className="px-4 py-3 text-right font-medium">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 text-sm">
            <Total k="Subtotal" v={money(sub.subtotal)} />
            {Number(sub.discount_total) > 0 && <Total k="Discounts" v={`− ${money(sub.discount_total)}`} />}
            <Total k="Tax" v={money(sub.tax_total)} />
            <Total k={`Total per ${PERIOD_LABEL[sub.billing_period]}`} v={money(sub.total)} bold />
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Shows what the next invoice would be today, discounts that currently apply included.</p>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Invoices</h2>
      <div className={tableWrap}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sub.invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No invoices yet.</td></tr>
            ) : sub.invoices.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium"><Link className="text-brand-600" to={`${base}/invoices/${i.id}`}>{i.number}</Link></td>
                <td className="px-4 py-3 text-slate-600">{dateText(i.period_start)} – {dateText(i.period_end)}</td>
                <td className="px-4 py-3 text-slate-600">{dateText(i.due_date)}</td>
                <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                <td className="px-4 py-3 text-right">{money(i.total)}</td>
                <td className="px-4 py-3 text-right">{money(i.amount_paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 py-0.5 text-sm"><span className="text-slate-500">{k}</span><span className="text-right font-medium text-slate-800">{v}</span></div>
);
const Total = ({ k, v, bold }) => (
  <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-500">{k}</td>
    <td className={`px-4 py-2 text-right ${bold ? "text-base font-bold text-slate-900" : "font-medium"}`}>{v}</td></tr>
);
