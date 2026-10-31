const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

/** Tiny fetch wrapper. Throws Error with a human-readable message. */
export async function api(path, { method = "GET", body, token } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Is the backend running on port 8000?");
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    if (typeof data?.detail === "string") message = data.detail;
    else if (res.status === 404) message = "This endpoint isn't built yet (coming in the auth step).";
    throw new Error(message);
  }
  return data;
}
