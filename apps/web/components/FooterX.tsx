const HANDLE = "overtheapron";
const PROFILE = `https://x.com/${HANDLE}`;

/**
 * The site's X presence in the footer — a static follow card, deliberately.
 *
 * This started as an embedded timeline and isn't one any more. X's widget is a
 * third-party script on every page of the site, it's blocked constantly
 * (extensions, DNT, enterprise networks, and X's own refusals), and when it
 * fails it leaves a tall empty rectangle where a timeline should be. A card
 * that always renders correctly beats a timeline that usually doesn't: no
 * script, no network request, no layout shift, nothing to degrade.
 */
export function FooterX() {
  return (
    <div className="w-full shrink-0 md:w-[300px]">
      <p className="label mb-2">Follow along</p>
      <a
        href={PROFILE}
        target="_blank"
        rel="noopener noreferrer"
        className="panel group flex items-center gap-3 p-3.5 transition-colors hover:bg-[var(--bg)]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--text)] text-[var(--panel)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-[var(--text)]">@{HANDLE}</span>
          <span className="block text-[12px] leading-snug">
            Rule verdicts and cap-sheet oddities.
          </span>
        </span>
        <span className="ml-auto shrink-0 self-center text-[var(--accent-ink)] transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </a>
    </div>
  );
}
