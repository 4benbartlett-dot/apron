/** Re-mounts on every route change: each page settles in like a fresh sheet
 * laid on the desk. (CSS-only; disabled under prefers-reduced-motion.) */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-in">{children}</div>;
}
