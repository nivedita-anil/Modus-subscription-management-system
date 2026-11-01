export function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

export function Wordmark({ className = "" }) {
  return (
    <span className={`wordmark ${className}`}>
      <Mark />
      <span>modus</span>
    </span>
  );
}
