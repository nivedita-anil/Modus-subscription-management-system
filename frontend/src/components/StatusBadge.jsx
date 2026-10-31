import { statusOf } from "../lib/subscriptions";

export default function StatusBadge({ status }) {
  const s = statusOf(status);
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
