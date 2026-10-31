import { useCallback, useEffect, useState } from "react";
import {
  Plus, Search, Pencil, Archive, ArchiveRestore, X, Loader2, Package, Trash2,
} from "lucide-react";
import { api } from "../../api/client";
import { money } from "../../lib/format";

const TYPES = [
  { value: "software", label: "Software" },
  { value: "add_on", label: "Add-on" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
];
const typeLabel = (v) => TYPES.find((t) => t.value === v)?.label ?? v;

const emptyForm = {
  name: "", product_type: "software", sales_price: "", cost_price: "",
  notes: "", is_active: true, variants: [],
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | product object

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (type) params.set("product_type", type);
      setProducts(await api(`/products?${params}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, type]);

  // re-fetch when filters change (small delay while typing)
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleArchive(p) {
    try {
      await api(`/products/${p.id}`, {
        method: "PUT",
        body: {
          name: p.name, product_type: p.product_type,
          sales_price: Number(p.sales_price), cost_price: Number(p.cost_price),
          notes: p.notes, is_active: !p.is_active,
          variants: p.variants.map((v) => ({ ...v, extra_price: Number(v.extra_price) })),
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Products</h1>
          <p className="mt-1 text-sm text-slate-500">
            What Brightloop sells, with prices and variants.
          </p>
        </div>
        <button className="btn-primary !w-auto" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New product
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input w-64 pl-9" placeholder="Search products…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input !w-44" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Sales price</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3">Variants</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <Package className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-600">No products yet</p>
                  <p className="text-slate-400">Create your first product to get started.</p>
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.is_active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    {p.notes && <p className="max-w-xs truncate text-xs text-slate-400">{p.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                      {typeLabel(p.product_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{money(p.sales_price)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{money(p.cost_price)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {p.variants.length === 0 && <span className="text-slate-300">—</span>}
                      {p.variants.map((v) => (
                        <span key={v.id}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {v.attribute}: {v.value}
                          {Number(v.extra_price) > 0 && ` (+${money(v.extra_price)})`}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button title="Edit" onClick={() => setEditing(p)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button title={p.is_active ? "Archive" : "Restore"} onClick={() => toggleArchive(p)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        {p.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
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
        <ProductModal
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ProductModal({ product, onClose, onSaved }) {
  const [form, setForm] = useState(
    product
      ? {
          name: product.name,
          product_type: product.product_type,
          sales_price: String(Number(product.sales_price)),
          cost_price: String(Number(product.cost_price)),
          notes: product.notes || "",
          is_active: product.is_active,
          variants: product.variants.map((v) => ({ ...v, extra_price: String(Number(v.extra_price)) })),
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setVariant = (i, k, v) =>
    setForm({ ...form, variants: form.variants.map((row, j) => (j === i ? { ...row, [k]: v } : row)) });
  const addVariant = () =>
    setForm({ ...form, variants: [...form.variants, { attribute: "", value: "", extra_price: "0" }] });
  const removeVariant = (i) =>
    setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) });

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const sales = Number(form.sales_price);
    const cost = Number(form.cost_price || 0);
    if (Number.isNaN(sales) || sales < 0) return setError("Enter a valid sales price.");
    if (Number.isNaN(cost) || cost < 0) return setError("Enter a valid cost price.");

    const payload = {
      name: form.name.trim(),
      product_type: form.product_type,
      sales_price: sales,
      cost_price: cost,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
      variants: form.variants
        .filter((v) => v.attribute.trim() && v.value.trim())
        .map((v) => ({
          id: v.id ?? null,
          attribute: v.attribute.trim(),
          value: v.value.trim(),
          extra_price: Number(v.extra_price || 0),
        })),
    };

    setSaving(true);
    try {
      await api(product ? `/products/${product.id}` : "/products", {
        method: product ? "PUT" : "POST",
        body: payload,
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
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {product ? "Edit product" : "New product"}
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
            <div>
              <label className="label">Product name</label>
              <input required className="input" placeholder="e.g. Brightloop CRM"
                value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label">Product type</label>
              <select className="input" value={form.product_type} onChange={set("product_type")}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sales price</label>
              <input required type="number" min="0" step="0.01" className="input" placeholder="0.00"
                value={form.sales_price} onChange={set("sales_price")} />
            </div>
            <div>
              <label className="label">Cost price</label>
              <input type="number" min="0" step="0.01" className="input" placeholder="0.00"
                value={form.cost_price} onChange={set("cost_price")} />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea rows={2} className="input" placeholder="Internal notes (optional)"
              value={form.notes} onChange={set("notes")} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label !mb-0">Variants</label>
              <button type="button" onClick={addVariant}
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                <Plus className="h-4 w-4" /> Add variant
              </button>
            </div>
            <p className="mb-3 mt-1 text-xs text-slate-400">
              Example: attribute <b>Brand</b>, value <b>Odoo</b>, extra price <b>560</b> adds 560 to the base price.
            </p>

            {form.variants.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-sm text-slate-400">
                No variants. This product has a single price.
              </p>
            ) : (
              <div className="space-y-2">
                {form.variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_110px_auto] items-center gap-2">
                    <input className="input" placeholder="Attribute (Brand)"
                      value={v.attribute} onChange={(e) => setVariant(i, "attribute", e.target.value)} />
                    <input className="input" placeholder="Value (Odoo)"
                      value={v.value} onChange={(e) => setVariant(i, "value", e.target.value)} />
                    <input type="number" min="0" step="0.01" className="input" placeholder="+ price"
                      value={v.extra_price} onChange={(e) => setVariant(i, "extra_price", e.target.value)} />
                    <button type="button" onClick={() => removeVariant(i)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Active (available for new subscriptions)
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="btn-primary !w-auto" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {product ? "Save changes" : "Create product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
