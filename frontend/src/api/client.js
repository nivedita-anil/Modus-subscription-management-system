import { getToken, logout } from "../lib/auth";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

/** Tiny fetch wrapper. Sends the saved login token automatically. */
export async function api(path, { method = "GET", body, token } = {}) {
  const authToken = token ?? getToken();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Is the backend running on port 8000?");
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // Expired / invalid session on a protected call: send the user back to sign in.
    if (res.status === 401 && authToken && !path.startsWith("/auth/")) {
      logout();
      window.location.href = "/login";
    }
    let message = "Something went wrong. Please try again.";
    if (typeof data?.detail === "string") message = data.detail;
    else if (Array.isArray(data?.detail))
      message = data.detail.map((d) => String(d.msg).replace(/^Value error, /, "")).join(" ");
    throw new Error(message);
  }
  return data;
}
