import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Trash2, X } from "lucide-react";
import { api } from "../../api/client";
import { money } from "../../lib/format";
import { TERMS, PERIOD_UNIT, oneYearFrom, todayISO, useBase } from "../../lib/subscriptions";

const blankLine = () => ({ product_id: "", variant_id: "", quantity: "1", unit_price: "", tax_id: "", discount_id: "" });

const toApi = (l) => ({
  product_id: Number(l.product_id),
  variant_id: l.variant_id ? Number(l.variant_id) : null,
  quantity: Number(l.quantity),
  unit_price: Number(l.unit_price),
  tax_id: l.tax_id ? Number(l.tax_id) : null,
  discount_id: l.discount_id ? Number(l.discount_id) : null,
});

const lineReady = (l) =>
  l.product_id && Number(l.quantity) >= 1 && l.unit_price !== "" && !Number.isNaN(Number(l.unit_price));

const fromApiLine = (l) => ({
  product_id: String(l.product_id),
  variant_id: l.variant_id ? String(l.variant_id) : "",
  quantity: String(l.quantity),
  unit_price: String(Number(l.unit_price)),
  tax_id: l.tax_id ? String(l.tax_id) : "",
  discount_id: l.discount_id ? String(l.discount_id) : "",
});

export default function SubscriptionForm() {
  const { id } = useParams();
  const editing = !!id;
  const base = useBase();
  const navigate = useNavigate();

  const [opts, setOpts] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({
    template_id: "", plan_id: "", start_date: todayISO(), expiry_date: oneYearFrom(todayISO()),
    payment_terms: "net_15", notes: "",
  });
  const [lines, setLines] = useState([blankLine()]);
  const [priced, setPriced] = useState({ rows: {}, totals: null });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState("");

  useEffect(() => {
    api("/subscriptions/options").then(setOpts).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!editing) return;
    api(`/subscriptions/${id}`)
      .then((s) => {
        if (s.status !== "draft" && s.status !== "quotation") setLocked("Only draft or quotation subscriptions can be edited.");
        setCustomer({ id: s.customer_id, full_name: s.customer_name, email: s.customer_email, company: s.customer_company });
        setForm({
          template_id: s.template_id ? String(s.template_id) : "",
          plan_id: String(s.plan_id), start_date: s.start_date, expiry_date: s.expiry_date,
          payment_terms: s.payment_terms, notes: s.notes || "",
        });
        setLines(s.lines.map(fromApiLine));
      })
      .catch((e) => setError(e.message));
  }, [editing, id]);

  // live totals from the server, so the editor and the saved subscription always agree
  useEffect(() => {
    const idx = lines.map((l, i) => (lineReady(l) ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) { setPriced({ rows: {}, totals: null }); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      api("/subscriptions/price", {
        method: "POST",
        body: { lines: idx.map((i) => toApi(lines[i])), subscription_id: editing ? Number(id) : null },
      })
        .then((r) => {
          if (cancelled) return;
          const rows = {};
          idx.forEach((li, k) => { rows[li] = r.lines[k]; });
          setPriced({ rows, totals: r });
        })
        .catch(() => {});
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [lines, editing, id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const productOf = (pid) => opts?.products.find((p) => String(p.id) === String(pid));

  function pickProduct(i, pid) {
    const p = productOf(pid);
    setLine(i, { product_id: pid, variant_id: "", unit_price: p ? String(Number(p.sales_price)) : "" });
  }
  function pickVariant(i, vid) {
    const p = productOf(lines[i].product_id);
    const v = p?.variants.find((x) => String(x.id) === vid);
    setLine(i, { variant_id: vid, unit_price: p ? String(Number(p.sales_price) + (v ? Number(v.extra_price) : 0)) : lines[i].unit_price });
  }

  async function pickTemplate(tid) {
    setForm((f) => ({ ...f, template_id: tid }));
    if (!tid) return;
    try {
      const t = await api(`/subscriptions/from-template/${tid}`);
      setForm((f) => ({ ...f, template_id: tid, plan_id: String(t.plan_id) }));
      setLines(t.lines.length ? t.lines.map(fromApiLine) : [blankLine()]);
    } catch (e) {
      setError(e.message);
    }
  }

  function changeStart(e) {
    const start = e.target.value;
    setForm((f) => ({ ...f, start_date: start, expiry_date: start ? oneYearFrom(start) : f.expiry_date }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!customer) return setError("Pick a customer.");
    if (!form.plan_id) return setError("Pick a plan.");
    if (!lines.every(lineReady)) return setError("Complete every line (product, quantity and price), or remove empty ones.");
    if (form.expiry_date < form.start_date) return setError("Expiry date can't be before the start date.");

    setSaving(true);
    try {
      const saved = await api(editing ? `/subscriptions/${id}` : "/subscriptions", {
        method: editing ? "PUT" : "POST",
        body: {
          customer_id: customer.id,
          plan_id: Number(form.plan_id),
          template_id: form.template_id ? Number(form.template_id) : null,
          start_date: form.start_date,
          expiry_date: form.expiry_date,
          payment_terms: form.payment_terms,
          notes: form.notes.trim() || null,
          lines: lines.map(toApi),
        },
      });
      navigate(`${base}/subscriptions/${saved.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const plan = opts?.plans.find((p) => String(p.id) === form.plan_id);

  return (
    <div className="mx-auto max-w-5xl">
      <Link to={editing ? `${base}/subscriptions/${id}` : `${base}/subscriptions`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        {editing ? "Edit subscription" : "New subscription"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">Start from a template, or build it line by line.</p>

      {(error || locked) && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{locked || error}</div>
      )}

      {!opts ? (
        <p className="mt-8 text-slate-400">Loading…</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Customer</label>
                <CustomerPicker value={customer} onChange={setCustomer} />
              </div>
              <div>
                <label className="label">Quotation template <span className="text-slate-400">(optional)</span></label>
                <select className="input" value={form.template_id} onChange={(e) => pickTemplate(e.target.value)}>
                  <option value="">Start from scratch</option>
                  {opts.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Plan</label>
                <select required className="input" value={form.plan_id} onChange={set("plan_id")}>
                  <option value="">Select a plan…</option>
                  {opts.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(p.price)} / {PERIOD_UNIT[p.billing_period]}
                    </option>
                  ))}
                </select>
                {plan && <p className="mt-1 text-xs text-slate-400">Minimum total quantity: {plan.min_quantity}</p>}
              </div>
              <div>
                <label className="label">Start date</label>
                <input required type="date" className="input" value={form.start_date} onChange={changeStart} />
              </div>
              <div>
                <label className="label">Expiry date</label>
                <input required type="date" className="input" value={form.expiry_date} onChange={set("expiry_date")} />
              </div>
              <div>
                <label className="label">Payment terms</label>
                <select className="input" value={form.payment_terms} onChange={set("payment_terms")}>
                  {TERMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Notes <span className="text-slate-400">(optional)</span></label>
                <input className="input" value={form.notes} onChange={set("notes")} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Lines</h2>
              <button type="button" onClick={() => setLines([...lines, blankLine()])}
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                <Plus className="h-4 w-4" /> Add line
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {lines.map((l, i) => {
                const p = productOf(l.product_id);
                const row = priced.rows[i];
                return (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="grid gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <label className="label !text-xs">Product</label>
                        <select className="input" value={l.product_id} onChange={(e) => pickProduct(i, e.target.value)}>
                          <option value="">Select…</option>
                          {opts.products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-4">
                        <label className="label !text-xs">Variant</label>
                        <select className="input" disabled={!p || p.variants.length === 0} value={l.variant_id}
                          onChange={(e) => pickVariant(i, e.target.value)}>
                          <option value="">{p && p.variants.length ? "Base product" : "—"}</option>
                          {p?.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.attribute}: {v.value}{Number(v.extra_price) > 0 ? ` (+${money(v.extra_price)})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-1">
                        <label className="label !text-xs">Qty</label>
                        <input type="number" min="1" step="1" className="input" value={l.quantity}
                          onChange={(e) => setLine(i, { quantity: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label !text-xs">Unit price</label>
                        <input type="number" min="0" step="0.01" className="input" value={l.unit_price}
                          onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                      </div>
                      <div className="sm:col-span-5">
                        <label className="label !text-xs">Tax</label>
                        <select className="input" value={l.tax_id} onChange={(e) => setLine(i, { tax_id: e.target.value })}>
                          <option value="">No tax</option>
                          {opts.taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-5">
                        <label className="label !text-xs">Discount</label>
                        <select className="input" value={l.discount_id} onChange={(e) => setLine(i, { discount_id: e.target.value })}>
                          <option value="">No discount</option>
                          {opts.discounts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div className="flex items-end justify-between sm:col-span-2">
                        <div>
                          <p className="text-xs text-slate-400">Amount</p>
                          <p className="font-semibold text-slate-900">{row ? money(row.total) : "—"}</p>
                        </div>
                        {lines.length > 1 && (
                          <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove line">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {row && l.discount_id && !row.discount_applied && (
                      <p className="mt-2 text-xs text-amber-600">
                        This discount doesn't apply to this line right now (minimums, dates or usage limit).
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {priced.totals && (
              <div className="ml-auto mt-5 w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(priced.totals.subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Discounts</span><span>−{money(priced.totals.discount_total)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(priced.totals.tax_total)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                  <span>Total</span><span>{money(priced.totals.total)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Link to={editing ? `${base}/subscriptions/${id}` : `${base}/subscriptions`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </Link>
            <button type="submit" className="btn-primary !w-auto" disabled={saving || !!locked}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create subscription"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api(`/subscriptions/customers?q=${encodeURIComponent(q)}`).then(setResults).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5">
        <div>
          <p className="text-sm font-medium text-slate-900">{value.full_name}</p>
          <p className="text-xs text-slate-500">{value.company ? `${value.company} · ` : ""}{value.email}</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-slate-400 hover:bg-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className="input" placeholder="Search customers by name, email or company…" value={q}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)} />
      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.length === 0 && <p className="px-3.5 py-3 text-sm text-slate-400">No customers found.</p>}
          {results.map((c) => (
            <button type="button" key={c.id} onMouseDown={() => { onChange(c); setQ(""); }}
              className="block w-full px-3.5 py-2.5 text-left hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-900">{c.full_name}</p>
              <p className="text-xs text-slate-500">{c.company ? `${c.company} · ` : ""}{c.email}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
