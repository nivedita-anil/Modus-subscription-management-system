// Change the currency here once and it updates everywhere.
const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export const money = (n) => fmt.format(Number(n) || 0);
