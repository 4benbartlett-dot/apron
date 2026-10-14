"use client";

// Last resort: the root layout itself threw, so none of the site's CSS or
// fonts are guaranteed. Plain inline styles, the paper palette, one way out.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const startFresh = () => {
    try {
      window.localStorage.removeItem("apron_gm_moves_v1");
    } catch {
      /* storage blocked */
    }
    window.location.assign("/");
  };
  const btn = { padding: "8px 16px", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: "pointer" } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f4f1e9", color: "#211d13", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Over the Apron hit a snag.</h1>
          <p style={{ maxWidth: 420, color: "#746c57", fontSize: 14, lineHeight: 1.5 }}>
            The page couldn&rsquo;t load. Try again, or start a fresh offseason to clear what this browser saved.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={reset} style={{ ...btn, background: "#b4501e", color: "#fff", border: "none" }}>
              Try again
            </button>
            <button type="button" onClick={startFresh} style={{ ...btn, background: "transparent", color: "#211d13", border: "1px solid #ddd6c3" }}>
              Start fresh
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
