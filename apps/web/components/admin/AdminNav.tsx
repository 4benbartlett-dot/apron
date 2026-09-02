"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/desk", label: "Desk" },
  { href: "/admin/ledger", label: "Ledger" },
  { href: "/admin/files", label: "Files" },
  { href: "/admin/review", label: "Review & commit" },
] as const;

/** The admin's own tabs, in the header nav's idiom. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0.5 whitespace-nowrap text-[13px]">
      {TABS.map((t) => {
        const active = "exact" in t && t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`nav-link rounded-md px-2.5 py-1 ${active ? "nav-active font-semibold text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
