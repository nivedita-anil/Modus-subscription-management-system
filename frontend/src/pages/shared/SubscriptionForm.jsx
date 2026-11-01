import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { money, todayISO } from "../../lib/format";
import { useBase } from "../../hooks/useBase";
import { Card, ErrorBox, btnPrimary, btnSecondary } from "../../components/ui";

const TERMS = ["Immediate", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60"];
let seq = 0;
const blank = () => ({ key: ++seq, product_id: "", variant_id: "", quantity: "1", unit_price: "", tax_id: "", discount_id: "" });
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function SubscriptionForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const base = useBase();
  const navigate = useNavigate();

  const [opt, setOpt] = useState({ plans: [], products: [], taxes: [], discounts: [], templates: [] });
  const [form, setForm] = useState({
    customer_id: "", template_id: "", plan_id: "", start_date: todayISO(), expiry_date: "",
    payment_terms: "Net 15", discount_id: "", notes: "",
  });
  const [lines, setLines] = useState([blank()]);
  const [customer, setCustomer] = useState(null); // {id, full_name, ...}
  const [custQ, setCustQ] = useState("");
  const [custResults, setCustResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [plans, products, taxes, discounts, templates] = await Promise.all([
          api("/plans?limit=200"), api("/products?limit=200"), api("/taxes?limit=200"),
          api("/discounts?limit=200"), api("/quotation-templates?limit=200&active=true"),
        ]);
        setOpt({ plans, products, taxes, discounts, templates });
        if (editing) {
          const s = await api(`/subscriptions/${id}`);
          setCustomer({ id: s.customer_id, full_name: s.customer_name, email: s.customer_email, company: s.customer_company });
          setForm({
            customer_id: s.customer_id, template_id: s.template_id || "", plan_id: s.plan_id,
            start_date: s.start_date, expiry_date: s.expiry_date || "", payment_terms: s.payment_terms,
            discount_id: s.discount_id || "", notes: s.notes || "",
          });
          setLines(s.lines.map((l) => ({
            key: ++seq, product_id: l.product_id, variant_id: l.variant_id || "", quantity: String(l.quantity),
            unit_price: String(Number(l.unit_price)), tax_id: l.tax_id || "", discount_id: l.discount_id || "",
          })));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, editing]);

  // customer search
  useEffect(() => {
    if (!custQ.trim()) { setCustResults([]); return; }
    const t = setTimeout(() => {
      api(`/users?role=customer&limit=8&q=${encodeURIComponent(custQ.trim())}`).then(setCustResults).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [custQ]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const byId = (list, v) => list.find((x) => String(x.id) === String(v));

  function applyTemplate(tid) {
    const t = byId(opt.templates, tid);
    setForm((f) => ({ ...f, template_id: tid, ...(t ? { plan_id: t.plan_id } : {}) }));
    if (t) {
      setLines(t.lines.map((l) => ({
        key: ++seq, product_id: l.product_id, variant_id: l.variant_id || "", quantity: String(l.quantity),
        unit_price: String(Number(l.unit_price)), tax_id: l.tax_id || "", discount_id: l.discount_id || "",
      })));
    }
  }

  function patchLine(key, patch) {
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      const next = { ...l, ...patch };
      // choosing a product or variant fills the price from the catalog
      if ("product_id" in patch || "variant_id" in patch) {
        const p = byId(opt.products, next.product_id);
        if ("product_id" in patch) next.variant_id = "";
        const v = p?.variants.find((x) => String(x.id) === String(next.variant_id));
        if (p) next.unit_price = String(Number(p.sales_price) + (v ? Number(v.extra_price) : 0));
      }
      return next;
    }));
  }

  // On-screen estimate only. The saved subscription is priced by the server.
  const est = useMemo(() => {
    let subtotal = 0, disc = 0, tax = 0, nets = [];
    const rows = lines.map((l) => {
      const qty = Number(l.quantity) || 0, gross = r2(qty * (Number(l.unit_price) || 0));
      const d = byId(opt.discounts, l.discount_id);
      let ld = 0;
      if (d && qty >= d.min_quantity && gross >= Number(d.min_purchase))
        ld = d.discount_type === "percentage" ? r2((gross * Number(d.value)) / 100) : Math.min(Number(d.value), gross);
      return { gross, ld, tax: byId(opt.taxes, l.tax_id) };
    });
    const sd = byId(opt.discounts, form.discount_id);
    const totalGross = rows.reduce((s, r) => s + r.gross, 0);
    const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    const totalNet = rows.reduce((s, r) => s + r.gross - r.ld, 0);
    let subAmt = 0;
    if (sd && totalNet > 0 && totalQty >= sd.min_quantity && totalGross >= Number(sd.min_purchase))
      subAmt = sd.discount_type === "percentage" ? r2((totalNet * Number(sd.value)) / 100) : Math.min(Number(sd.value), totalNet);
    rows.forEach((r) => {
      const net = r.gross - r.ld;
      const share = totalNet > 0 ? (subAmt * net) / totalNet : 0;
      subtotal += r.gross; disc += r.ld + share;
      tax += r.tax ? r2(((net - share) * Number(r.tax.rate)) / 100) : 0;
    });
    return { subtotal, disc: r2(disc), tax: r2(tax), total: r2(subtotal - disc + tax) };
  }, [lines, form.discount_id, opt]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.customer_id) return setError("Pick a customer.");
    if (!form.plan_id) return setError("Pick a plan.");
    const body = {
      customer_id: Number(form.customer_id),
      plan_id: Number(form.plan_id),
      template_id: form.template_id ? Number(form.template_id) : null,
      discount_id: form.discount_id ? Number(form.discount_id) : null,
      start_date: form.start_date,
      expiry_date: form.expiry_date || null,
      payment_terms: form.payment_terms,
      notes: form.notes.trim() || null,
      lines: lines.filter((l) => l.product_id).map((l) => ({
        product_id: Number(l.product_id),
        variant_id: l.variant_id ? Number(l.variant_id) : null,
        quantity: Number(l.quantity) || 1,
        unit_price: l.unit_price === "" ? null : Number(l.unit_price),
        tax_id: l.tax_id ? Number(l.tax_id) : null,
        discount_id: l.discount_id ? Number(l.discount_id) : null,
      })),
    };
    if (!body.lines.length) return setError("Add at least one product line.");
    setSaving(true);
    try {
      const saved = await api(editing ? `/subscriptions/${id}` : "/subscriptions", { method: editing ? "PUT" : "POST", body });
      navigate(`${base}/subscriptions/${saved.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-5xl">
      <Link to={editing ? `${base}/subscriptions/${id}` : `${base}/subscriptions`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        {editing ? "Edit subscription" : "New subscription"}
      </h1>
      <ErrorBox message={error} onClose={() => setError("")} />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Customer and plan">
          <label className="label">Customer</label>
          {customer ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm">
              <span><b>{customer.full_name}</b> <span className="text-slate-400">{customer.company || customer.email}</span></span>
              <button type="button" className="text-brand-600" onClick={() => { setCustomer(null); setForm({ ...form, customer_id: "" }); }}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <input className="input" placeholder="Search customers by name, email or company…" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
              {custResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {custResults.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="w-full px-3.5 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => { setCustomer(c); setForm({ ...form, customer_id: c.id }); setCustQ(""); setCustResults([]); }}>
                        <b>{c.full_name}</b> <span className="text-slate-400">{c.company || c.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <label className="label mt-4">Start from a quotation template <span className="text-slate-400">(optional)</span></label>
          <select className="input" value={form.template_id} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">None, build it myself</option>
            {opt.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <label className="label mt-4">Plan</label>
          <select required className="input" value={form.plan_id} onChange={set("plan_id")}>
            <option value="">Choose a plan…</option>
            {opt.plans.filter((p) => p.is_active || String(p.id) === String(form.plan_id)).map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.billing_period})</option>
            ))}
          </select>
        </Card>

        <Card title="Dates and terms">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date</label>
              <input required type="date" className="input" value={form.start_date} onChange={set("start_date")} />
            </div>
            <div>
              <label className="label">Expiry date</label>
              <input type="date" className="input" value={form.expiry_date} min={form.start_date} onChange={set("expiry_date")} />
            </div>
          </div>
          <label className="label mt-4">Payment terms</label>
          <select className="input" value={form.payment_terms} onChange={set("payment_terms")}>
            {TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <label className="label mt-4">Discount on the whole subscription <span className="text-slate-400">(optional)</span></label>
          <select className="input" value={form.discount_id} onChange={set("discount_id")}>
            <option value="">None</option>
            {opt.discounts.filter((d) => d.is_active || String(d.id) === String(form.discount_id)).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <label className="label mt-4">Notes <span className="text-slate-400">(optional)</span></label>
          <input className="input" maxLength={2000} value={form.notes} onChange={set("notes")} />
        </Card>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Lines</h2>
      <div className="mt-3 space-y-3">
        {lines.map((l) => {
          const p = byId(opt.products, l.product_id);
          return (
            <div key={l.key} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-12">
              <div className="md:col-span-4">
                <label className="label">Product</label>
                <select className="input" value={l.product_id} onChange={(e) => patchLine(l.key, { product_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {opt.products.filter((x) => x.is_active || String(x.id) === String(l.product_id)).map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
                {p?.variants.length > 0 && (
                  <select className="input mt-2" value={l.variant_id} onChange={(e) => patchLine(l.key, { variant_id: e.target.value })}>
                    <option value="">No variant</option>
                    {p.variants.map((v) => (
                      <option key={v.id} value={v.id}>{v.attribute}: {v.value}{Number(v.extra_price) ? ` (+${v.extra_price})` : ""}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="md:col-span-1">
                <label className="label">Qty</label>
                <input type="number" min="1" className="input" value={l.quantity} onChange={(e) => patchLine(l.key, { quantity: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Unit price</label>
                <input type="number" min="0" step="0.01" className="input" value={l.unit_price} onChange={(e) => patchLine(l.key, { unit_price: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Tax</label>
                <select className="input" value={l.tax_id} onChange={(e) => patchLine(l.key, { tax_id: e.target.value })}>
                  <option value="">No tax</option>
                  {opt.taxes.filter((t) => t.is_active || String(t.id) === String(l.tax_id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label">Discount</label>
                <select className="input" value={l.discount_id} onChange={(e) => patchLine(l.key, { discount_id: e.target.value })}>
                  <option value="">None</option>
                  {opt.discounts.filter((d) => d.is_active || String(d.id) === String(l.discount_id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex items-end md:col-span-1">
                <button type="button" title="Remove line" disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                  className="rounded-lg p-2.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className={btnSecondary + " mt-3"} onClick={() => setLines([...lines, blank()])}>
        <Plus className="h-4 w-4" /> Add line
      </button>

      <div className="mt-6 ml-auto w-full max-w-xs space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(est.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Discounts</span><span>− {money(est.disc)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{money(est.tax)}</span></div>
        <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><span>Estimated total</span><span>{money(est.total)}</span></div>
        <p className="pt-1 text-xs text-slate-400">The saved subscription is priced by the server and may differ if a discount has expired.</p>
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
        <Link to={`${base}/subscriptions`} className={btnSecondary}>Cancel</Link>
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Save changes" : "Create subscription"}
        </button>
      </div>
    </form>
  );
}
