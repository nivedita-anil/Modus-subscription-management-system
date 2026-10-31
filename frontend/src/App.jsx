import { Routes, Route, Navigate, Link } from "react-router-dom";
import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import RequireRole from "./components/RequireRole.jsx";
import AdminLayout from "./components/layouts/AdminLayout.jsx";
import Products from "./pages/admin/Products.jsx";
import Plans from "./pages/admin/Plans.jsx";
import QuotationTemplates from "./pages/admin/QuotationTemplates.jsx";
import Discounts from "./pages/admin/Discounts.jsx";
import Taxes from "./pages/admin/Taxes.jsx";
import { getToken, getUser, homePathFor, logout } from "./lib/auth";

// "/" sends each signed-in user to their own area.
function Home() {
  const user = getUser();
  if (!getToken() || !user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user.role)} replace />;
}

// Temporary pages for areas we haven't built yet.
function ComingSoon({ title }) {
  const user = getUser();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-slate-500">Signed in as {user?.email}. This area arrives in a later step.</p>
      <button
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        onClick={() => { logout(); location.href = "/login"; }}
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

      <Route path="/admin" element={<RequireRole roles={["admin"]}><AdminLayout /></RequireRole>}>
        <Route index element={<Navigate to="products" replace />} />
        <Route path="products" element={<Products />} />
        <Route path="plans" element={<Plans />} />
        <Route path="quotation-templates" element={<QuotationTemplates />} />
        <Route path="discounts" element={<Discounts />} />
        <Route path="taxes" element={<Taxes />} />
        <Route path="*" element={<Navigate to="products" replace />} />
      </Route>

      <Route path="/staff/*" element={
        <RequireRole roles={["staff", "admin"]}><ComingSoon title="Staff area" /></RequireRole>} />
      <Route path="/portal/*" element={
        <RequireRole roles={["customer"]}><ComingSoon title="Customer portal" /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
