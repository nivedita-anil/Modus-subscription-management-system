import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Check, Circle } from "lucide-react";
import AuthShell from "../../components/AuthShell";
import { api } from "../../api/client";

// Rules from the problem statement: more than 8 chars, upper, lower, special.
const rules = [
  { label: "More than 8 characters", test: (p) => p.length > 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    company: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const passwordOk = rules.every((r) => r.test(form.password));
  const matches = form.password === form.confirm;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!passwordOk) return setError("Please meet all the password requirements.");
    if (!matches) return setError("Passwords don't match.");

    setLoading(true);
    try {
      const { confirm, ...payload } = form;
      await api("/auth/register", { method: "POST", body: payload });
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Get started with Brightloop in a minute.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="full_name">Full name</label>
            <input id="full_name" required className="input" placeholder="Jane Doe"
              value={form.full_name} onChange={set("full_name")} />
          </div>
          <div>
            <label className="label" htmlFor="company">Company <span className="text-slate-400">(optional)</span></label>
            <input id="company" className="input" placeholder="Acme Inc."
              value={form.company} onChange={set("company")} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input"
            placeholder="you@company.com" value={form.email} onChange={set("email")} />
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPw ? "text" : "password"}
              required
              autoComplete="new-password"
              className="input pr-11"
              placeholder="Create a strong password"
              value={form.password}
              onChange={set("password")}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400 hover:text-slate-600"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {rules.map((r) => {
              const ok = r.test(form.password);
              return (
                <li key={r.label}
                  className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-600" : "text-slate-400"}`}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                  {r.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type={showPw ? "text" : "password"}
            required
            autoComplete="new-password"
            className="input"
            placeholder="Re-enter your password"
            value={form.confirm}
            onChange={set("confirm")}
          />
          {form.confirm && !matches && (
            <p className="mt-1.5 text-xs text-red-600">Passwords don't match.</p>
          )}
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>

        <p className="text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
