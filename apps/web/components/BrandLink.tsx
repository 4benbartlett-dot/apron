"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header wordmark. From anywhere it goes home; on home it reopens the
 * team picker (dispatches "ota:pick-team", handled by the sim). */
export function BrandLink() {
  const pathname = usePathname();
  return (
    <Link
      href="/"
      title="Switch team"
      className="flex shrink-0 items-center gap-2"
      onClick={(e) => {
        if (pathname === "/") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("ota:pick-team"));
          window.scrollTo({ top: 0 });
        }
      }}
    >
      <svg width="26" height="26" viewBox="0 0 64 64" className="shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" fill="var(--text)" />
        <line x1="11" y1="41" x2="53" y2="41" stroke="var(--accent)" strokeWidth="4.5" strokeDasharray="7.5 6" strokeLinecap="round" />
        <path className="logo-arc" d="M13 54 C 20 25, 37 14, 50 22" fill="none" stroke="var(--bg)" strokeWidth="5" strokeLinecap="round" />
        <circle className="logo-ball" cx="50.5" cy="21.5" r="6.5" fill="var(--bg)" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">Over the Apron</span>
    </Link>
  );
}
