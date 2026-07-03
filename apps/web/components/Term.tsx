"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type TermKey } from "@/lib/glossary";

/** Wraps any chip/badge/label so clicking it opens a plain-English infobox
 * for the CBA term. Renders a span (not a button) so it can live inside
 * clickable rows without nesting violations; stops propagation so opening
 * an explainer never triggers the row underneath. */
export function Term({
  k,
  children,
  className,
  extra,
  underline,
}: {
  k: TermKey;
  children: React.ReactNode;
  className?: string;
  /** Case-specific detail appended after the general explanation. */
  extra?: string;
  /** Dotted underline for plain-text labels (badges/chips skip it). */
  underline?: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const g = GLOSSARY[k];

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos]);

  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const W = Math.min(330, window.innerWidth - 16);
    const x = Math.min(Math.max(8, r.left), window.innerWidth - W - 8);
    const up = r.bottom > window.innerHeight - 240;
    setPos({ x, y: up ? window.innerHeight - r.top + 8 : r.bottom + 8, up });
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(e)}
        className={`${className ?? ""} cursor-help${underline ? " term-underline" : ""}`}
        title={`What is “${g.title}”?`}
      >
        {children}
      </span>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setPos(null)} />
          <div
            className="infobox fixed z-[71]"
            style={{
              left: pos.x,
              width: "min(330px, calc(100vw - 16px))",
              ...(pos.up ? { bottom: pos.y } : { top: pos.y }),
            }}
            role="dialog"
            aria-label={g.title}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="label !text-[10px] !text-[var(--accent-ink)]">{g.title}</span>
              <button
                onClick={() => setPos(null)}
                aria-label="Close"
                className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>
            <p className="text-[12.5px] leading-relaxed">{g.body}</p>
            {extra && (
              <p className="mt-1.5 border-t border-[var(--border)] pt-1.5 text-[12px] leading-snug text-[var(--muted)]">
                This case: {extra}
              </p>
            )}
            {g.cite && (
              <div className="tabular mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                {g.cite}
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
