import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Archive, ArchiveRestore, X, Loader2, Percent } from "lucide-react";
import { api } from "../../api/client";

const emptyForm = { name: "", rate: "", description: "", is_active: true };
const rateText = (r) => `${Number(r)}%`;

export default function Taxes() {
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | tax object

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      setTaxes(await api(`/taxes?${params}`));
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
      await api(`/taxes/${t.id}`, {
        method: "PUT",
        body: {
          name: t.name,
          rate: Number(t.rate),
          description: t.description,
          is_active: !t.is_active,
        },
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Tax rules<span className="heading-period">.</span></h1>
          <p className="mt-1 text-sm text-slate-500">
            Tax rates that get applied to invoices, such as GST slabs.
          </p>
        </div>
        <button className="btn-primary !w-auto" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New tax rule
        </button>
      </div>

      <div className="relative mt-6 w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search tax rules…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : taxes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center">
                  <Percent className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-600">No tax rules yet</p>
                  <p className="text-slate-400">Add the tax rates your invoices need.</p>
                </td>
              </tr>
            ) : (
              taxes.map((t) => (
                <tr key={t.id} className={`hover:bg-slate-50 ${t.is_active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 font-medium">{rateText(t.rate)}</td>
                  <td className="px-4 py-3 text-slate-500">{t.description || <span className="text-slate-300">—</span>}</td>
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
        <TaxModal
          tax={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function TaxModal({ tax, onClose, onSaved }) {
  const [form, setForm] = useState(
    tax
      ? { name: tax.name, rate: String(Number(tax.rate)), description: tax.description || "", is_active: tax.is_active }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const rate = Number(form.rate);
    if (form.rate === "" || Number.isNaN(rate) || rate < 0 || rate > 100)
      return setError("Rate must be a number between 0 and 100.");

    setSaving(true);
    try {
      await api(tax ? `/taxes/${tax.id}` : "/taxes", {
        method: tax ? "PUT" : "POST",
        body: {
          name: form.name.trim(),
          rate,
          description: form.description.trim() || null,
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
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{tax ? "Edit tax rule" : "New tax rule"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="label">Name</label>
            <input required className="input" placeholder="e.g. GST 18%"
              value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className="label">Rate (%)</label>
            <input required type="number" min="0" max="100" step="0.01" className="input" placeholder="18"
              value={form.rate} onChange={set("rate")} />
          </div>
          <div>
            <label className="label">Description <span className="text-slate-400">(optional)</span></label>
            <input className="input" maxLength={255} value={form.description} onChange={set("description")} />
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
              {tax ? "Save changes" : "Create tax rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
