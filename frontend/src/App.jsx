import { Routes, Route, Navigate, Link } from "react-router-dom";
import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";

// Temporary landing page after login. Replaced by role-based dashboards later.
function Home() {
  const signedIn = !!localStorage.getItem("access_token");
  if (!signedIn) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">You're signed in 🎉</h1>
      <p className="text-slate-500">Dashboards arrive in the next steps.</p>
      <button
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        onClick={() => { localStorage.removeItem("access_token"); location.href = "/login"; }}
      >
        Sign out
      </button>
    </div>
  );
}

function Placeholder({ text }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p className="text-slate-600">{text}</p>
      <Link to="/login" className="font-medium text-brand-600">Back to sign in</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<Placeholder text="Password reset page coming soon." />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
