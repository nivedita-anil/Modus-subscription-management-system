export const getToken = () => localStorage.getItem("access_token");

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export function logout() {
  ["access_token", "refresh_token", "user"].forEach((k) => localStorage.removeItem(k));
}

export function homePathFor(role) {
  if (role === "admin") return "/admin";
  if (role === "staff") return "/staff";
  return "/portal";
}
