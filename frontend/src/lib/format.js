// Change the currency here once and it updates everywhere.
const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export const money = (n) => fmt.format(Number(n) || 0);

// "2026-10-31" -> "31 Oct 2026". The input is a plain date, so no timezone shifting.
export const dateText = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

// today as YYYY-MM-DD in the user's own timezone (what <input type="date"> expects)
export const todayISO = () => new Date().toLocaleDateString("en-CA");

export const PERIOD_LABEL = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
