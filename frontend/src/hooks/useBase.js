import { getUser } from "../lib/auth";

/** Where the signed-in user's screens live: /admin, /staff or /portal. */
export function useBase() {
  const role = getUser()?.role;
  return role === "admin" ? "/admin" : role === "staff" ? "/staff" : "/portal";
}
