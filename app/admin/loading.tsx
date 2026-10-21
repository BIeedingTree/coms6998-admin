export default function Loading() {
  return <div role="status" aria-label="Loading admin data"><div className="skeleton skeleton-title"/><div className="stats-grid">{[1, 2, 3, 4].map(item => <div key={item} className="skeleton skeleton-stat"/>)}</div><div className="skeleton skeleton-panel"/><span className="sr-only">Loading your workspace…</span></div>;
}
