"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Offseason" },
  { href: "/guide", label: "How to play" },
  { href: "/glossary", label: "Glossary" },
  { href: "/league", label: "League" },
  { href: "/transactions", label: "Transactions" },
  { href: "/draft", label: "Draft picks" },
  { href: "/deadlines", label: "Deadlines" },
] as const;

/** Header nav with a real active state: the accent rule sits fully drawn
 * under the current page and sketches in on hover elsewhere. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[13.5px]">
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`nav-link rounded-md px-2.5 py-1 ${
              active
                ? "nav-active font-semibold text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
