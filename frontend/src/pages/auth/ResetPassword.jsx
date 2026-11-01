import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import AuthShell from "../../components/AuthShell";
import { api } from "../../api/client";

// Same rules the server enforces: more than 8 characters, upper, lower, special.
function problem(pw) {
  if (pw.length <= 8) return "Password must be more than 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain a special character.";
  return "";
}

export default function ResetPassword() {
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const p = problem(pw);
    if (p) return setError(p);
    if (pw !== again) return setError("The two passwords don't match.");
    setLoading(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password: pw } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Reset link missing" subtitle="Open the link from your email, or ask for a new one.">
        <Link to="/forgot-password" className="btn-primary">Request a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="More than 8 characters, with an uppercase letter, a lowercase letter and a special character.">
      {done ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <CheckCircle2 className="h-6 w-6" />
          <p className="mt-2 font-medium">Password updated</p>
          <Link to="/login" className="mt-3 inline-block font-semibold text-brand-600">Sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>}
          <div>
            <label className="label" htmlFor="pw">New password</label>
            <input id="pw" type="password" required autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pw2">Confirm password</label>
            <input id="pw2" type="password" required autoComplete="new-password" className="input" value={again} onChange={(e) => setAgain(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Update password
          </button>
        </form>
      )}
    </AuthShell>
  );
}
