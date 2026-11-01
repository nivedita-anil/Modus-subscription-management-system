import { useCallback, useEffect, useState } from "react";
import {
  Plus, Search, Pencil, Archive, ArchiveRestore, X, Loader2, FileText, Trash2,
} from "lucide-react";
import { api } from "../../api/client";
import { money } from "../../lib/format";

const PERIOD = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

let seq = 0;
const nextKey = () => ++seq;
const blankLine = () => ({
  key: nextKey(), product_id: "", variant_id: "", quantity: "1",
  unit_price: "", tax_id: "", discount_id: "",
});

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Same maths as the server (discount off the gross, tax on what's left). Preview only:
// the saved numbers come back from the API.
function priceLine(line, discount, tax) {
  const gross = r2((Number(line.quantity) || 0) * (Number(line.unit_price) || 0));
  let disc = 0;
  if (discount) {
    disc = discount.discount_type === "percentage"
      ? r2((gross * Number(discount.value)) / 100)
      : Math.min(r2(Number(discount.value)), gross);
  }
  const net = gross - disc;
  const taxAmt = tax ? r2((net * Number(tax.rate)) / 100) : 0;
  return { gross, disc, taxAmt, total: r2(net + taxAmt) };
}

export default function QuotationTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | template object
  const [options, setOptions] = useState({ plans: [], products: [], taxes: [], discounts: [] });

  // Everything the form needs to pick from. Archived items are kept in the list so that
  // a template which already uses one still shows it.
  useEffect(() => {
    Promise.all([
      api("/plans?limit=200"),
      api("/products?limit=200"),
      api("/taxes?limit=200"),
      api("/discounts?limit=200"),
    ])
      .then(([plans, products, taxes, discounts]) => setOptions({ plans, products, taxes, discounts }))
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      setTemplates(await api(`/quotation-templates?${params}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleArchive(t) {
    try {
      await api(`/quotation-templates/${t.id}`, {
        method: "PUT",
        body: {
          name: t.name,
          plan_id: t.plan_id,
          validity_days: t.validity_days,
          notes: t.notes,
          is_active: !t.is_active,
          lines: t.lines.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id,
            quantity: l.quantity,
            unit_price: Number(l.unit_price),
            tax_id: l.tax_id,
            discount_id: l.discount_id,
          })),
        },
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Quotation templates<span className="heading-period">.</span></h1>
          <p className="mt-1 text-sm text-slate-500">
            Ready-made quotes: a plan plus the products, taxes and discounts that usually go with it.
          </p>
        </div>
        <button className="btn-primary !w-auto" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      <div className="relative mt-6 w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search templates…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Valid for</th>
              <th className="px-4 py-3 text-right">Lines</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-600">No quotation templates yet</p>
                  <p className="text-slate-400">Create one so staff can start a quotation in a click.</p>
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className={`hover:bg-slate-50 ${t.is_active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {t.plan_name}
                    <span className="text-slate-400"> · {t.billing_period}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{t.validity_days} days</td>
                  <td className="px-4 py-3 text-right">{t.lines.length}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    {money(t.total)}
                    <span className="font-normal text-slate-400"> / {PERIOD[t.billing_period] ?? "cycle"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      t.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {t.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button title="Edit" onClick={() => setEditing(t)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button title={t.is_active ? "Archive" : "Restore"} onClick={() => toggleArchive(t)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        {t.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <TemplateModal
          template={editing === "new" ? null : editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// Active items, plus the one already chosen (it may have been archived since).
const pickable = (items, selectedId) =>
  items.filter((i) => i.is_active || String(i.id) === String(selectedId));

function TemplateModal({ template, options, onClose, onSaved }) {
  const { plans, products, taxes, discounts } = options;

  const [form, setForm] = useState(() =>
    template
      ? {
          name: template.name,
          plan_id: String(template.plan_id),
          validity_days: String(template.validity_days),
          notes: template.notes || "",
          is_active: template.is_active,
          lines: template.lines.map((l) => ({
            key: nextKey(),
            product_id: String(l.product_id),
            variant_id: l.variant_id ? String(l.variant_id) : "",
            quantity: String(l.quantity),
            unit_price: String(Number(l.unit_price)),
            tax_id: l.tax_id ? String(l.tax_id) : "",
            discount_id: l.discount_id ? String(l.discount_id) : "",
          })),
        }
      : { name: "", plan_id: "", validity_days: "30", notes: "", is_active: true, lines: [blankLine()] }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setLine = (i, patch) =>
    setForm({ ...form, lines: form.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const addLine = () => setForm({ ...form, lines: [...form.lines, blankLine()] });
  const removeLine = (i) => setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });

  const productOf = (id) => products.find((p) => String(p.id) === String(id));

  function onProduct(i, id) {
    const p = productOf(id);
    setLine(i, { product_id: id, variant_id: "", unit_price: p ? String(Number(p.sales_price)) : "" });
  }

  function onVariant(i, id) {
    const p = productOf(form.lines[i].product_id);
    const v = p?.variants.find((x) => String(x.id) === String(id));
    const price = p ? Number(p.sales_price) + (v ? Number(v.extra_price) : 0) : "";
    setLine(i, { variant_id: id, unit_price: price === "" ? "" : String(r2(price)) });
  }

  // live preview
  const sums = form.lines.reduce(
    (acc, l) => {
      const d = discounts.find((x) => String(x.id) === l.discount_id);
      const t = taxes.find((x) => String(x.id) === l.tax_id);
      const p = priceLine(l, d, t);
      return {
        gross: acc.gross + p.gross, disc: acc.disc + p.disc,
        tax: acc.tax + p.taxAmt, total: acc.total + p.total,
      };
    },
    { gross: 0, disc: 0, tax: 0, total: 0 }
  );

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    const days = Number(form.validity_days);
    if (!form.plan_id) return setError("Pick a plan.");
    if (!Number.isInteger(days) || days < 1) return setError("Validity must be a whole number of days, 1 or more.");
    if (form.lines.length === 0) return setError("Add at least one line.");

    const lines = [];
    for (let i = 0; i < form.lines.length; i++) {
      const l = form.lines[i];
      const n = i + 1;
      const qty = Number(l.quantity);
      const price = l.unit_price === "" ? null : Number(l.unit_price);
      if (!l.product_id) return setError(`Line ${n}: pick a product.`);
      if (!Number.isInteger(qty) || qty < 1) return setError(`Line ${n}: quantity must be a whole number, 1 or more.`);
      if (price !== null && (Number.isNaN(price) || price < 0)) return setError(`Line ${n}: enter a valid price.`);
      lines.push({
        product_id: Number(l.product_id),
        variant_id: l.variant_id ? Number(l.variant_id) : null,
        quantity: qty,
        unit_price: price,
        tax_id: l.tax_id ? Number(l.tax_id) : null,
        discount_id: l.discount_id ? Number(l.discount_id) : null,
      });
    }

    setSaving(true);
    try {
      await api(template ? `/quotation-templates/${template.id}` : "/quotation-templates", {
        method: template ? "PUT" : "POST",
        body: {
          name: form.name.trim(),
          plan_id: Number(form.plan_id),
          validity_days: days,
          notes: form.notes.trim() || null,
          is_active: form.is_active,
          lines,
        },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {template ? "Edit quotation template" : "New quotation template"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Template name</label>
              <input required className="input" placeholder="e.g. Starter pack"
                value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label">Plan</label>
              <select className="input" value={form.plan_id} onChange={set("plan_id")}>
                <option value="">Select a plan…</option>
                {pickable(plans, form.plan_id).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.billing_period})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Quotation valid for (days)</label>
              <input required type="number" min="1" step="1" className="input"
                value={form.validity_days} onChange={set("validity_days")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Terms and notes <span className="text-slate-400">(optional)</span></label>
              <textarea rows={2} maxLength={2000} className="input"
                value={form.notes} onChange={set("notes")} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="label !mb-0">Lines</p>
              <button type="button" onClick={addLine}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                <Plus className="h-4 w-4" /> Add line
              </button>
            </div>

            <div className="mt-2 space-y-3">
              {form.lines.map((l, i) => {
                const product = productOf(l.product_id);
                const variants = product?.variants ?? [];
                const d = discounts.find((x) => String(x.id) === l.discount_id);
                const t = taxes.find((x) => String(x.id) === l.tax_id);
                const p = priceLine(l, d, t);
                return (
                  <div key={l.key} className="rounded-xl border border-slate-200 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label">Product</label>
                        <select className="input" value={l.product_id} onChange={(e) => onProduct(i, e.target.value)}>
                          <option value="">Select a product…</option>
                          {pickable(products, l.product_id).map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Variant</label>
                        <select className="input" value={l.variant_id} disabled={variants.length === 0}
                          onChange={(e) => onVariant(i, e.target.value)}>
                          <option value="">{variants.length === 0 ? "No variants" : "No variant"}</option>
                          {variants.map((v) => (
                            <option key={v.id} value={v.id}>{v.attribute}: {v.value}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className="label">Quantity</label>
                        <input type="number" min="1" step="1" className="input"
                          value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Unit price</label>
                        <input type="number" min="0" step="0.01" className="input"
                          value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Tax</label>
                        <select className="input" value={l.tax_id} onChange={(e) => setLine(i, { tax_id: e.target.value })}>
                          <option value="">No tax</option>
                          {pickable(taxes, l.tax_id).map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Discount</label>
                        <select className="input" value={l.discount_id}
                          onChange={(e) => setLine(i, { discount_id: e.target.value })}>
                          <option value="">No discount</option>
                          {pickable(discounts, l.discount_id).map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <button type="button" onClick={() => removeLine(i)} disabled={form.lines.length === 1}
                        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                      <span className="text-sm text-slate-500">
                        Line total <span className="font-semibold text-slate-900">{money(p.total)}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{money(sums.gross)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Discounts</span><span>− {money(sums.disc)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Tax</span><span>{money(sums.tax)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
              <span>Total</span><span>{money(sums.total)}</span>
            </div>
            <p className="pt-1 text-xs text-slate-400">Final amounts are calculated when you save.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Active (staff can start quotations from it)
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="btn-primary !w-auto" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {template ? "Save changes" : "Create template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
