"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark, BrandWordmark } from "@/components/BrandMark";

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
      <BrandMark size={27} animate className="shrink-0" />
      <BrandWordmark className="text-[14.5px]" />
    </Link>
  );
}
