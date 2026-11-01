import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { dateText } from "../../lib/format";
import { ErrorBox, Modal, Notice, PageHeader, btnPrimary, btnSecondary, tableWrap, thead } from "../../components/ui";

export default function StaffUsers() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setStaff(await api("/users?role=staff&limit=200")); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Staff" subtitle="Internal team members handle customers day to day. Only an admin can add them.">
        <button className={btnPrimary} onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add staff member</button>
      </PageHeader>
      <Notice message={notice} onClose={() => setNotice("")} />
      <ErrorBox message={error} />
      <div className={tableWrap}>
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className={thead}>
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Added</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : staff.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-14 text-center text-slate-400">No staff yet. Add the first one.</td></tr>
            ) : staff.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{s.full_name}</td>
                <td className="px-4 py-3 text-slate-600">{s.email}</td>
                <td className="px-4 py-3 text-slate-600">{dateText(String(s.created_at).slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <AddStaff onClose={() => setAdding(false)}
        onSaved={(name) => { setAdding(false); setNotice(`${name} can now sign in as staff.`); load(); }} />}
    </div>
  );
}

function AddStaff({ onClose, onSaved }) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(""); setSaving(true);
    try {
      await api("/auth/staff", { method: "POST", body: { ...form, full_name: form.full_name.trim(), email: form.email.trim() } });
      onSaved(form.full_name.trim());
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return (
    <Modal title="Add staff member" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox message={error} />
        <div><label className="label">Full name</label><input required className="input" value={form.full_name} onChange={set("full_name")} /></div>
        <div><label className="label">Email</label><input required type="email" className="input" value={form.email} onChange={set("email")} /></div>
        <div>
          <label className="label">Temporary password</label>
          <input required type="password" className="input" value={form.password} onChange={set("password")} />
          <p className="mt-1 text-xs text-slate-400">More than 8 characters, with an uppercase letter, a lowercase letter and a special character.</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add staff member
          </button>
        </div>
      </form>
    </Modal>
  );
}
