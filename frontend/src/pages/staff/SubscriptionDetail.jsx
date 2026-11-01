import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Pencil, Receipt, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import { money } from "../../lib/format";
import { STATUSES, PERIOD_UNIT, fmtDate, termsLabel, todayISO, useBase } from "../../lib/subscriptions";
import StatusBadge from "../../components/StatusBadge";
import InvoiceBadge from "../../components/InvoiceBadge";

const ACTIONS = {
  draft: [
    { to: "quotation", label: "Send quotation", primary: true },
    { to: "closed", label: "Cancel", danger: true, confirm: "Cancel this draft?" },
  ],
  quotation: [
    { to: "confirmed", label: "Confirm", primary: true },
    { to: "draft", label: "Back to draft" },
    { to: "closed", label: "Cancel", danger: true, confirm: "Cancel this quotation?" },
  ],
  confirmed: [
    { to: "active", label: "Activate", primary: true },
    { to: "closed", label: "Cancel", danger: true, confirm: "Cancel this confirmed subscription?" },
  ],
  active: [{ to: "closed", label: "Close subscription", danger: true, confirm: "Close this active subscription?" }],
  closed: [],
};

export default function SubscriptionDetail() {
  const { id } = useParams();
  const base = useBase();
  const navigate = useNavigate();
  const [sub, setSub] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [billing, setBilling] = useState(false);

  const load = useCallback(async () => {
    try {
      setSub(await api(`/subscriptions/${id}`));
      setInvoices(await api(`/invoices?subscription_id=${id}`));
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function move(action) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setError("");
    setBusy(action.to);
    try {
      setSub(await api(`/subscriptions/${id}/status`, { method: "POST", body: { status: action.to } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this draft permanently?")) return;
    try {
      await api(`/subscriptions/${id}`, { method: "DELETE" });
      navigate(`${base}/subscriptions`);
    } catch (e) {
      setError(e.message);
    }
  }

  async function generateInvoice() {
    setError("");
    setBilling(true);
    try {
      const inv = await api("/invoices/generate", { method: "POST", body: { subscription_id: Number(id) } });
      navigate(`${base}/invoices/${inv.id}`);
    } catch (e) {
      setError(e.message);
      setBilling(false);
    }
  }

  if (!sub) {
    return (
      <div className="mx-auto max-w-5xl">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>
        ) : (
          <p className="text-slate-400">Loading…</p>
        )}
      </div>
    );
  }

  const current = STATUSES.findIndex((s) => s.value === sub.status);
  const editable = sub.status === "draft" || sub.status === "quotation";

  return (
    <div className="mx-auto max-w-5xl">
      <Link to={`${base}/subscriptions`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> All subscriptions
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{sub.number}</h1>
            <StatusBadge status={sub.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {sub.customer_name}{sub.customer_company ? ` · ${sub.customer_company}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Link to={`${base}/subscriptions/${sub.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )}
          {ACTIONS[sub.status].map((a) => (
            <button key={a.to + a.label} onClick={() => move(a)} disabled={!!busy}
              className={
                a.primary
                  ? "btn-primary !w-auto"
                  : `inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium disabled:opacity-60 ${
                      a.danger ? "border-red-200 bg-white text-red-600 hover:bg-red-50" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`
              }>
              {busy === a.to && <Loader2 className="h-4 w-4 animate-spin" />}
              {a.label}
            </button>
          ))}
          {sub.status === "draft" && (
            <button onClick={remove} title="Delete draft"
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <ol className="mt-6 flex items-center">
        {STATUSES.map((s, i) => (
          <li key={s.value} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i < current ? "bg-emerald-500 text-white" : i === current ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                {i < current ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-sm ${i === current ? "font-semibold text-slate-900" : "text-slate-500"}`}>{s.label}</span>
            </div>
            {i < STATUSES.length - 1 && <div className={`mx-3 h-px flex-1 ${i < current ? "bg-emerald-300" : "bg-slate-200"}`} />}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Plan", `${sub.plan_name} (${sub.billing_period})`],
          ["Start date", fmtDate(sub.start_date)],
          ["Expiry date", fmtDate(sub.expiry_date)],
          ["Payment terms", termsLabel(sub.payment_terms)],
          ["Customer email", sub.customer_email],
          ["Quote valid until", fmtDate(sub.quote_valid_until)],
          ["Next billing", fmtDate(sub.next_billing_date)],
          ["Billing cycle", `Every ${PERIOD_UNIT[sub.billing_period] ?? sub.billing_period}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-400">{k}</p>
            <p className="mt-1 break-words text-sm font-medium text-slate-800">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">Tax</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sub.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{l.product_name}</p>
                  {l.variant_label && <p className="text-xs text-slate-400">{l.variant_label}</p>}
                </td>
                <td className="px-4 py-3 text-right">{l.quantity}</td>
                <td className="px-4 py-3 text-right">{money(l.unit_price)}</td>
                <td className="px-4 py-3 text-right">
                  {Number(l.discount_amount) > 0 ? (
                    <>
                      <span className="text-emerald-600">−{money(l.discount_amount)}</span>
                      <p className="text-xs text-slate-400">{l.discount_name}</p>
                    </>
                  ) : (
                    <span className="text-slate-300">{l.discount_name ? "not applicable" : "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {l.tax_name ? (
                    <>
                      {money(l.tax_amount)}
                      <p className="text-xs text-slate-400">{l.tax_name}</p>
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto w-full max-w-xs space-y-1.5 border-t border-slate-100 px-4 py-4 text-sm">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(sub.subtotal)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Discounts</span><span>−{money(sub.discount_total)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(sub.tax_total)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
            <span>Total</span><span>{money(sub.total)}</span>
          </div>
        </div>
      </div>

      {(sub.status === "active" || invoices.length > 0) && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">Invoices</p>
              {sub.status === "active" && (
                <p className="text-xs text-slate-400">
                  {sub.next_billing_date
                    ? `Next billing period starts ${fmtDate(sub.next_billing_date)}`
                    : "No more billing periods"}
                </p>
              )}
            </div>
            {sub.status === "active" && sub.next_billing_date && sub.next_billing_date <= todayISO() && (
              <button className="btn-primary !w-auto" onClick={generateInvoice} disabled={billing}>
                {billing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                Generate invoice
              </button>
            )}
          </div>
          {invoices.length > 0 && (
            <table className="w-full border-t border-slate-100 text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {invoices.map((i) => (
                  <tr key={i.id} onClick={() => navigate(`${base}/invoices/${i.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-brand-700">{i.number}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtDate(i.period_start)} → {fmtDate(i.period_end)}</td>
                    <td className="px-4 py-2.5 text-right">{money(i.total)}</td>
                    <td className="px-4 py-2.5 text-right"><InvoiceBadge invoice={i} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {sub.notes && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{sub.notes}</p>
        </div>
      )}
    </div>
  );
}
