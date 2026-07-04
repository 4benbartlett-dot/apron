import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
      <span className="stamp stamp-in text-[24px] text-[var(--tier-second_apron)]">Blocked</span>
      <h1 className="mt-6 text-[22px] font-bold tracking-tight">
        This page exceeds the first apron.
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
        Nothing is filed at this address — the page you&rsquo;re looking for may
        have been renounced, waived, or traded for a heavily protected second.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95">
          Back to the offseason
        </Link>
        <Link href="/guide" className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold hover:border-[var(--text)]">
          How to play
        </Link>
      </div>
      <div className="tabular mt-8 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        404 · 2023 CBA · Art. Four-Oh-Four
      </div>
    </div>
  );
}
