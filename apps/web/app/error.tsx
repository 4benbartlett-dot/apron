"use client";

import { useEffect } from "react";

// The saved offseason lives under this key (lib/store.ts). A board that throws
// on load is almost always replaying something saved, so the way out is to
// clear it — without making the visitor find their browser's storage settings.
const STORAGE_KEY = "apron_gm_moves_v1";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const startFresh = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked — the reload below still drops ?gm= */
    }
    window.location.assign(window.location.pathname);
  };

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
      <span className="stamp stamp-in text-[24px] text-[var(--tier-second_apron)]">Voided</span>
      <h1 className="mt-6 text-[22px] font-bold tracking-tight">The league office rejected this page.</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
        Something on the sheet didn&rsquo;t add up while it loaded. Try again; if it keeps happening, start a fresh
        offseason — that clears the moves saved in this browser and any shared link you opened.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={startFresh}
          className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold hover:border-[var(--text)]"
        >
          Start a fresh offseason
        </button>
      </div>
      {error.digest && (
        <div className="tabular mt-8 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">ref {error.digest}</div>
      )}
    </div>
  );
}
