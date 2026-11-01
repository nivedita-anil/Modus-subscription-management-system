import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import AuthShell from "../../components/AuthShell";
import { api } from "../../api/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      {sent ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <MailCheck className="h-6 w-6" />
          <p className="mt-2 font-medium">Check your inbox</p>
          <p className="mt-1">If {email} is registered, a reset link is on its way. It works for 15 minutes.</p>
          <Link to="/login" className="mt-4 inline-block font-semibold text-brand-600">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" placeholder="you@company.com"
              className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
          </button>
          <p className="text-center text-sm text-slate-500">
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Back to sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
