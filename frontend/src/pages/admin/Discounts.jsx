import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Archive, ArchiveRestore, X, Loader2, Tag } from "lucide-react";
import { api } from "../../api/client";
import { money } from "../../lib/format";

const emptyForm = {
  name: "", discount_type: "percentage", value: "", min_purchase: "0", min_quantity: "1",
  start_date: "", end_date: "", usage_limit: "", is_active: true,
};

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const valueText = (d) => (d.discount_type === "percentage" ? `${Number(d.value)}% off` : `${money(d.value)} off`);

function validity(d) {
  if (d.start_date && d.end_date) return `${fmtDate(d.start_date)} → ${fmtDate(d.end_date)}`;
  if (d.start_date) return `From ${fmtDate(d.start_date)}`;
  if (d.end_date) return `Until ${fmtDate(d.end_date)}`;
  return "No time limit";
}

function conditions(d) {
  const parts = [];
  if (Number(d.min_purchase) > 0) parts.push(`min ${money(d.min_purchase)}`);
  if (d.min_quantity > 1) parts.push(`min qty ${d.min_quantity}`);
  return parts.length ? parts.join(", ") : "None";
}

function statusOf(d) {
  if (!d.is_active) return { label: "Archived", cls: "bg-slate-100 text-slate-500" };
  if (d.end_date && d.end_date < today()) return { label: "Expired", cls: "bg-amber-50 text-amber-700" };
  if (d.usage_limit != null && d.used_count >= d.usage_limit)
    return { label: "Used up", cls: "bg-amber-50 text-amber-700" };
  if (d.start_date && d.start_date > today()) return { label: "Scheduled", cls: "bg-sky-50 text-sky-700" };
  return { label: "Active", cls: "bg-emerald-50 text-emerald-700" };
}

export default function Discounts() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | discount object

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      setItems(await api(`/discounts?${params}`));
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

  async function toggleArchive(d) {
    try {
      const { id, created_at, used_count, ...rest } = d;
      await api(`/discounts/${id}`, {
        method: "PUT",
        body: {
          ...rest,
          value: Number(d.value),
          min_purchase: Number(d.min_purchase),
          is_active: !d.is_active,
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
          <h1 className="page-title">Discounts<span className="heading-period">.</span></h1>
          <p className="mt-1 text-sm text-slate-500">
            Percentage or fixed-amount discounts, with conditions, dates and usage limits.
          </p>
        </div>
        <button className="btn-primary !w-auto" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New discount
        </button>
      </div>

      <div className="relative mt-6 w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search discounts…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Conditions</th>
              <th className="px-4 py-3">Valid</th>
              <th className="px-4 py-3 text-right">Used</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <Tag className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-600">No discounts yet</p>
                  <p className="text-slate-400">Create a discount to offer on subscriptions.</p>
                </td>
              </tr>
            ) : (
              items.map((d) => {
                const st = statusOf(d);
                return (
                  <tr key={d.id} className={`hover:bg-slate-50 ${d.is_active ? "" : "opacity-60"}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{valueText(d)}</td>
                    <td className="px-4 py-3 text-slate-600">{conditions(d)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{validity(d)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {d.used_count}
                      <span className="text-slate-400"> / {d.usage_limit ?? "∞"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button title="Edit" onClick={() => setEditing(d)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button title={d.is_active ? "Archive" : "Restore"} onClick={() => toggleArchive(d)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          {d.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <DiscountModal
          discount={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function DiscountModal({ discount, onClose, onSaved }) {
  const [form, setForm] = useState(
    discount
      ? {
          name: discount.name,
          discount_type: discount.discount_type,
          value: String(Number(discount.value)),
          min_purchase: String(Number(discount.min_purchase)),
          min_quantity: String(discount.min_quantity),
          start_date: discount.start_date || "",
          end_date: discount.end_date || "",
          usage_limit: discount.usage_limit == null ? "" : String(discount.usage_limit),
          is_active: discount.is_active,
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const value = Number(form.value);
    const minPurchase = Number(form.min_purchase || 0);
    const minQty = Number(form.min_quantity);
    const limit = form.usage_limit === "" ? null : Number(form.usage_limit);

    if (Number.isNaN(value) || value <= 0) return setError("Discount value must be greater than 0.");
    if (form.discount_type === "percentage" && value > 100) return setError("A percentage discount can't be more than 100.");
    if (Number.isNaN(minPurchase) || minPurchase < 0) return setError("Minimum purchase can't be negative.");
    if (!Number.isInteger(minQty) || minQty < 1) return setError("Minimum quantity must be a whole number, 1 or more.");
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return setError("Usage limit must be a whole number, 1 or more, or left empty.");
    if (form.start_date && form.end_date && form.end_date < form.start_date)
      return setError("'End date' can't be before 'Start date'.");

    setSaving(true);
    try {
      await api(discount ? `/discounts/${discount.id}` : "/discounts", {
        method: discount ? "PUT" : "POST",
        body: {
          name: form.name.trim(),
          discount_type: form.discount_type,
          value,
          min_purchase: minPurchase,
          min_quantity: minQty,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          usage_limit: limit,
          is_active: form.is_active,
        },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isPct = form.discount_type === "percentage";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{discount ? "Edit discount" : "New discount"}</h2>
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
              <label className="label">Discount name</label>
              <input required className="input" placeholder="e.g. Launch offer"
                value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.discount_type} onChange={set("discount_type")}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div>
              <label className="label">{isPct ? "Percentage (%)" : "Amount"}</label>
              <input required type="number" min="0.01" step="0.01" max={isPct ? "100" : undefined}
                className="input" value={form.value} onChange={set("value")} />
            </div>
            <div>
              <label className="label">Minimum purchase</label>
              <input type="number" min="0" step="0.01" className="input"
                value={form.min_purchase} onChange={set("min_purchase")} />
            </div>
            <div>
              <label className="label">Minimum quantity</label>
              <input type="number" min="1" step="1" className="input"
                value={form.min_quantity} onChange={set("min_quantity")} />
            </div>
            <div>
              <label className="label">Start date <span className="text-slate-400">(optional)</span></label>
              <input type="date" className="input" value={form.start_date} onChange={set("start_date")} />
            </div>
            <div>
              <label className="label">End date <span className="text-slate-400">(optional)</span></label>
              <input type="date" className="input" value={form.end_date} onChange={set("end_date")} />
            </div>
            <div>
              <label className="label">Usage limit <span className="text-slate-400">(empty = unlimited)</span></label>
              <input type="number" min="1" step="1" className="input"
                value={form.usage_limit} onChange={set("usage_limit")} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Active
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="btn-primary !w-auto" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {discount ? "Save changes" : "Create discount"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
