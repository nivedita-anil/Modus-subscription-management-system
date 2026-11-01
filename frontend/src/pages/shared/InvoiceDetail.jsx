import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Printer, Send, Ban, Wallet, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { money, dateText, todayISO } from "../../lib/format";
import { useBase } from "../../hooks/useBase";
import { ErrorBox, Modal, Notice, StatusBadge, btnDanger, btnPrimary, btnSecondary } from "../../components/ui";

const METHODS = [["bank_transfer", "Bank transfer"], ["upi", "UPI"], ["card", "Card"], ["cash", "Cash"], ["cheque", "Cheque"], ["other", "Other"]];
const methodLabel = (m) => METHODS.find(([k]) => k === m)?.[1] || m;

export default function InvoiceDetail() {
  const { id } = useParams();
  const base = useBase();
  const portal = base === "/portal";
  const root = portal ? `/portal/invoices/${id}` : `/invoices/${id}`;
  const [inv, setInv] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try { setInv(await api(root)); } catch (e) { setError(e.message); }
  }, [root]);
  useEffect(() => { load(); }, [load]);

  async function act(name, msg) {
    setBusy(name); setError(""); setNotice("");
    try {
      setInv(await api(`${root}/${name}`, { method: "POST" }));
      setNotice(msg);
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  if (!inv) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorBox message={error} />
        {!error && <p className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      </div>
    );
  }
  const open = inv.status === "confirmed";

  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`${base}/invoices`} className="no-print inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Invoices
      </Link>

      <div className="no-print mt-3 flex flex-wrap items-center justify-end gap-2">
        {!portal && inv.status === "draft" && (
          <button className={btnPrimary} disabled={!!busy} onClick={() => act("confirm", "Invoice confirmed.")}>
            <Check className="h-4 w-4" /> Confirm
          </button>
        )}
        {!portal && open && (
          <button className={btnPrimary} disabled={!!busy} onClick={() => setPaying(true)}>
            <Wallet className="h-4 w-4" /> Record payment
          </button>
        )}
        {!portal && inv.status !== "cancelled" && (
          <button className={btnSecondary} disabled={!!busy} onClick={() => act("send", `Invoice sent to ${inv.customer_email}.`)}>
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {inv.sent_at ? "Send again" : "Send"}
          </button>
        )}
        <button className={btnSecondary} onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>
        {!portal && ["draft", "confirmed"].includes(inv.status) && Number(inv.amount_paid) === 0 && (
          <button className={btnDanger} disabled={!!busy}
            onClick={() => window.confirm("Cancel this invoice?") && act("cancel", "Invoice cancelled.")}>
            <Ban className="h-4 w-4" /> Cancel
          </button>
        )}
      </div>

      <div className="no-print"><ErrorBox message={error} onClose={() => setError("")} /><Notice message={notice} onClose={() => setNotice("")} /></div>

      <div className="print-sheet mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-600">Brightloop Software</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Invoice {inv.number}</h1>
            <p className="mt-1 text-sm text-slate-500">Subscription {inv.subscription_number}</p>
          </div>
          <div className="text-right">
            <StatusBadge status={inv.status} overdue={inv.is_overdue} />
            {inv.is_overdue && <p className="mt-1 text-xs text-red-600">{inv.days_overdue} days overdue</p>}
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Billed to</p>
            <p className="mt-1 font-medium text-slate-900">{inv.customer_name}</p>
            {inv.customer_company && <p className="text-sm text-slate-600">{inv.customer_company}</p>}
            <p className="text-sm text-slate-500">{inv.customer_email}</p>
          </div>
          <div className="space-y-1 text-sm sm:text-right">
            <p><span className="text-slate-500">Issued:</span> {dateText(inv.issue_date)}</p>
            <p><span className="text-slate-500">Due:</span> <b>{dateText(inv.due_date)}</b> {inv.payment_terms && <span className="text-slate-400">({inv.payment_terms})</span>}</p>
            <p><span className="text-slate-500">Period:</span> {dateText(inv.period_start)} – {dateText(inv.period_end)}</p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Description</th><th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Discount</th>
                <th className="px-3 py-2 text-right">Tax</th><th className="py-2 pl-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-3 pr-3 font-medium text-slate-900">{l.description}</td>
                  <td className="px-3 py-3 text-right">{l.quantity}</td>
                  <td className="px-3 py-3 text-right">{money(l.unit_price)}</td>
                  <td className="px-3 py-3 text-right">{Number(l.discount_amount) ? `− ${money(l.discount_amount)}` : "—"}</td>
                  <td className="px-3 py-3 text-right">{l.tax_name ? `${l.tax_name} · ${money(l.tax_amount)}` : "—"}</td>
                  <td className="py-3 pl-3 text-right font-medium">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <Line k="Subtotal" v={money(inv.subtotal)} />
          {Number(inv.discount_total) > 0 && <Line k={`Discounts${inv.discount_note ? ` (${inv.discount_note})` : ""}`} v={`− ${money(inv.discount_total)}`} />}
          <Line k="Tax" v={money(inv.tax_total)} />
          <div className="border-t border-slate-200 pt-2"><Line k="Total" v={money(inv.total)} bold /></div>
          <Line k="Paid" v={money(inv.amount_paid)} />
          <Line k="Balance due" v={money(inv.balance)} bold tone={Number(inv.balance) > 0 && inv.status !== "cancelled" ? "text-red-600" : ""} />
        </div>

        {inv.payments.length > 0 && (
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payments received</p>
            <table className="mt-2 w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {inv.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 text-slate-600">{dateText(p.paid_on)}</td>
                    <td className="py-2">{methodLabel(p.method)}</td>
                    <td className="py-2 text-slate-400">{p.note}</td>
                    <td className="py-2 text-right font-medium">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {paying && <PaymentModal inv={inv} onClose={() => setPaying(false)}
        onSaved={() => { setPaying(false); setNotice("Payment recorded."); load(); }} />}
    </div>
  );
}

const Line = ({ k, v, bold, tone = "" }) => (
  <div className={`flex justify-between gap-4 ${bold ? "text-base font-bold" : ""} ${tone}`}>
    <span className={bold ? "" : "text-slate-500"}>{k}</span><span>{v}</span>
  </div>
);

function PaymentModal({ inv, onClose, onSaved }) {
  const [form, setForm] = useState({ method: "bank_transfer", amount: String(Number(inv.balance)), paid_on: todayISO(), note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    const amount = Number(form.amount);
    if (!(amount > 0)) return setError("Enter an amount above zero.");
    if (amount > Number(inv.balance)) return setError(`That is more than the ${money(inv.balance)} still owed.`);
    setSaving(true);
    try {
      await api("/payments", { method: "POST", body: {
        invoice_id: inv.id, method: form.method, amount, paid_on: form.paid_on, note: form.note.trim() || null } });
      onSaved();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Record payment for ${inv.number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox message={error} />
        <p className="text-sm text-slate-500">Balance due: <b className="text-slate-900">{money(inv.balance)}</b></p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Method</label>
            <select className="input" value={form.method} onChange={set("method")}>
              {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date received</label>
            <input type="date" required className="input" value={form.paid_on} max={todayISO()} onChange={set("paid_on")} />
          </div>
        </div>
        <div>
          <label className="label">Amount</label>
          <input type="number" required min="0.01" step="0.01" className="input" value={form.amount} onChange={set("amount")} />
        </div>
        <div>
          <label className="label">Note <span className="text-slate-400">(optional)</span></label>
          <input className="input" maxLength={500} placeholder="Reference number, who paid…" value={form.note} onChange={set("note")} />
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Record payment
          </button>
        </div>
      </form>
    </Modal>
  );
}
