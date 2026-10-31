import { Navigate } from "react-router-dom";
import { getToken, getUser, homePathFor } from "../lib/auth";

/** Only lets signed-in users with one of `roles` through. */
export default function RequireRole({ roles, children }) {
  const user = getUser();
  if (!getToken() || !user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return children;
}
