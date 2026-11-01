import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Archive, ArchiveRestore, X, Loader2, Layers } from "lucide-react";
import { api } from "../../api/client";
import { money } from "../../lib/format";

const PERIODS = [
  { value: "daily", label: "Daily", unit: "day" },
  { value: "weekly", label: "Weekly", unit: "week" },
  { value: "monthly", label: "Monthly", unit: "month" },
  { value: "yearly", label: "Yearly", unit: "year" },
];
const periodOf = (v) => PERIODS.find((p) => p.value === v) ?? PERIODS[2];

const OPTIONS = [
  { key: "auto_close", label: "Auto-close when it ends", hint: "Subscriptions close by themselves at the end date." },
  { key: "can_close_early", label: "Can be closed early", hint: "Staff may close a subscription before it ends." },
  { key: "can_pause", label: "Can be paused", hint: "Staff may pause and resume a subscription." },
  { key: "can_renew", label: "Can be renewed", hint: "Subscriptions can be renewed for another term." },
];

const emptyForm = {
  name: "", price: "", billing_period: "monthly", min_quantity: "1",
  available_from: "", available_to: "",
  auto_close: false, can_close_early: false, can_pause: false, can_renew: false,
  is_active: true,
};

const fmtDate = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function availability(p) {
  if (p.available_from && p.available_to) return `${fmtDate(p.available_from)} → ${fmtDate(p.available_to)}`;
  if (p.available_from) return `From ${fmtDate(p.available_from)}`;
  if (p.available_to) return `Until ${fmtDate(p.available_to)}`;
  return "Always available";
}

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | plan object

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (period) params.set("billing_period", period);
      setPlans(await api(`/plans?${params}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, period]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleArchive(p) {
    try {
      const { id, created_at, ...rest } = p;
      await api(`/plans/${id}`, {
        method: "PUT",
        body: { ...rest, price: Number(p.price), is_active: !p.is_active },
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
          <h1 className="page-title">Plans<span className="heading-period">.</span></h1>
          <p className="mt-1 text-sm text-slate-500">
            What a subscription costs, how often it bills, and what customers can do with it.
          </p>
        </div>
        <button className="btn-primary !w-auto" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New plan
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input w-64 pl-9" placeholder="Search plans…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input !w-44" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">All billing periods</option>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
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
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3 text-right">Min qty</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Options</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : plans.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <Layers className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-600">No plans yet</p>
                  <p className="text-slate-400">Create your first plan to start selling subscriptions.</p>
                </td>
              </tr>
            ) : (
              plans.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.is_active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-medium">{money(p.price)}</span>
                    <span className="text-slate-400"> / {periodOf(p.billing_period).unit}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{p.min_quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{availability(p)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {OPTIONS.filter((o) => p[o.key]).map((o) => (
                        <span key={o.key} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {o.label.replace(" when it ends", "").replace("Can be ", "")}
                        </span>
                      ))}
                      {!OPTIONS.some((o) => p[o.key]) && <span className="text-slate-300">—</span>}
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
        <PlanModal
          plan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function PlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState(
    plan
      ? {
          name: plan.name,
          price: String(Number(plan.price)),
          billing_period: plan.billing_period,
          min_quantity: String(plan.min_quantity),
          available_from: plan.available_from || "",
          available_to: plan.available_to || "",
          auto_close: plan.auto_close,
          can_close_early: plan.can_close_early,
          can_pause: plan.can_pause,
          can_renew: plan.can_renew,
          is_active: plan.is_active,
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggle = (k) => (e) => setForm({ ...form, [k]: e.target.checked });

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const price = Number(form.price);
    const minQty = Number(form.min_quantity);
    if (Number.isNaN(price) || price < 0) return setError("Enter a valid price.");
    if (!Number.isInteger(minQty) || minQty < 1) return setError("Minimum quantity must be a whole number, 1 or more.");
    if (form.available_from && form.available_to && form.available_to < form.available_from)
      return setError("'Available to' can't be before 'Available from'.");

    setSaving(true);
    try {
      await api(plan ? `/plans/${plan.id}` : "/plans", {
        method: plan ? "PUT" : "POST",
        body: {
          name: form.name.trim(),
          price,
          billing_period: form.billing_period,
          min_quantity: minQty,
          available_from: form.available_from || null,
          available_to: form.available_to || null,
          auto_close: form.auto_close,
          can_close_early: form.can_close_early,
          can_pause: form.can_pause,
          can_renew: form.can_renew,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{plan ? "Edit plan" : "New plan"}</h2>
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
              <label className="label">Plan name</label>
              <input required className="input" placeholder="e.g. Business Monthly"
                value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label">Price</label>
              <input required type="number" min="0" step="0.01" className="input" placeholder="0.00"
                value={form.price} onChange={set("price")} />
            </div>
            <div>
              <label className="label">Billing period</label>
              <select className="input" value={form.billing_period} onChange={set("billing_period")}>
                {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Minimum quantity</label>
              <input required type="number" min="1" step="1" className="input"
                value={form.min_quantity} onChange={set("min_quantity")} />
            </div>
            <div />
            <div>
              <label className="label">Available from <span className="text-slate-400">(optional)</span></label>
              <input type="date" className="input" value={form.available_from} onChange={set("available_from")} />
            </div>
            <div>
              <label className="label">Available to <span className="text-slate-400">(optional)</span></label>
              <input type="date" className="input" value={form.available_to} onChange={set("available_to")} />
            </div>
          </div>

          <div>
            <p className="label">What can happen to subscriptions on this plan?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPTIONS.map((o) => (
                <label key={o.key}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                  <input type="checkbox" checked={form[o.key]} onChange={toggle(o.key)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{o.label}</span>
                    <span className="block text-xs text-slate-400">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_active} onChange={toggle("is_active")}
              className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Active (can be used for new subscriptions)
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="btn-primary !w-auto" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {plan ? "Save changes" : "Create plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
