import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";
import RequireRole from "./components/RequireRole.jsx";
import AdminLayout from "./components/layouts/AdminLayout.jsx";
import Products from "./pages/admin/Products.jsx";
import Plans from "./pages/admin/Plans.jsx";
import QuotationTemplates from "./pages/admin/QuotationTemplates.jsx";
import Discounts from "./pages/admin/Discounts.jsx";
import Taxes from "./pages/admin/Taxes.jsx";
import StaffUsers from "./pages/admin/StaffUsers.jsx";
import PortalLayout from "./components/layouts/PortalLayout.jsx";
import Dashboard from "./pages/shared/Dashboard.jsx";
import Subscriptions from "./pages/shared/Subscriptions.jsx";
import SubscriptionDetail from "./pages/shared/SubscriptionDetail.jsx";
import SubscriptionForm from "./pages/shared/SubscriptionForm.jsx";
import Invoices from "./pages/shared/Invoices.jsx";
import InvoiceDetail from "./pages/shared/InvoiceDetail.jsx";
import Payments from "./pages/shared/Payments.jsx";
import MySubscriptions from "./pages/portal/MySubscriptions.jsx";
import { getToken, getUser, homePathFor } from "./lib/auth";

// "/" sends each signed-in user to their own area.
function Home() {
  const user = getUser();
  if (!getToken() || !user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user.role)} replace />;
}

// Screens that admin and staff both use (rendered under /admin and under /staff).
const sharedScreens = [
  ["dashboard", <Dashboard />],
  ["subscriptions", <Subscriptions />],
  ["subscriptions/new", <SubscriptionForm />],
  ["subscriptions/:id", <SubscriptionDetail />],
  ["subscriptions/:id/edit", <SubscriptionForm />],
  ["invoices", <Invoices />],
  ["invoices/:id", <InvoiceDetail />],
  ["payments", <Payments />],
  ["quotation-templates", <QuotationTemplates />],
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/admin" element={<RequireRole roles={["admin"]}><AdminLayout /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        {sharedScreens.map(([path, el]) => <Route key={path} path={path} element={el} />)}
        <Route path="products" element={<Products />} />
        <Route path="plans" element={<Plans />} />
        <Route path="discounts" element={<Discounts />} />
        <Route path="taxes" element={<Taxes />} />
        <Route path="staff-users" element={<StaffUsers />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>

      <Route path="/staff" element={<RequireRole roles={["staff"]}><AdminLayout /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        {sharedScreens.map(([path, el]) => <Route key={path} path={path} element={el} />)}
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>

      <Route path="/portal" element={<RequireRole roles={["customer"]}><PortalLayout /></RequireRole>}>
        <Route index element={<Navigate to="subscriptions" replace />} />
        <Route path="subscriptions" element={<MySubscriptions />} />
        <Route path="subscriptions/:id" element={<SubscriptionDetail />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="*" element={<Navigate to="subscriptions" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
