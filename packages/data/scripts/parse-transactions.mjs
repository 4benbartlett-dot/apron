// Read Spotrac's transactions page (as Firecrawl's markdown) into rows:
// { player, pos, date, type, detail }. Kept apart from the scraper so a saved
// page can be re-read without a pull. Three page layouts are accepted; each
// was noticed the same way, by a pull that parsed nothing and refused to write.

export function classify(detail) {
  if (/Traded/i.test(detail)) return "Trade";
  if (/Re-Signed/i.test(detail)) return "Re-sign";
  if (/Agreed|Signed/i.test(detail)) return "Signing";
  if (/Extension|Extended/i.test(detail)) return "Extension";
  if (/Waived|Released/i.test(detail)) return "Release";
  if (/Qualifying/i.test(detail)) return "Qualifying Offer";
  if (/Option/i.test(detail)) return "Option";
  if (/Renounced/i.test(detail)) return "Renounce";
  return "Other";
}

// Each row spans two markdown lines:
//   - Jul 28, 2026  \- Trade![](…/nba_lac1.png)
//   Trade [Johni Broome (C)](…/johni-broome)Traded to LA (LAC) from Philadelphia (PHI) …
// Since late Aug 2026 the logo is a LINKED image with alt text:
//   - Aug 30, 2026  \- Waiver[![MIN](…/nba_min_2026.png)](…/team/109/overview)
// Both shapes are accepted; a pull that matched neither parsed 0 rows and
// (correctly) refused to write, which is how the change was noticed.
const ROW =
  /^-\s*([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})\s*\\?-\s*[A-Za-z ]+?\[?!\[[^\]]*\]\([^)]*\)(?:\]\([^)]*\))?\s*\n\s*[A-Za-z ]+?\s*\[([^\]]+?)\s*\(([^)]*)\)\]\([^)]*\)(.*)$/gm;

/** Tidy a row's prose into the form the feed has always stored. */
function tidy(detailRaw) {
  const detail = detailRaw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // unwrap links
    .replace(/\\([[\]-])/g, "$1") // unescape \[ \] \-
    // The table layout links the team name and leaves its code outside the
    // link: "Utah Jazz(UTA)". The feed has always had "Utah Jazz (UTA)".
    .replace(/(\S)\((?=[A-Z]{2,4}\))/g, "$1 (")
    .replace(/\s+/g, " ")
    .trim()
    // A waiver's saving used to come in brackets: "(OKC) ($2,293,651 cap
    // savings)". The table drops them and the space.
    .replace(/\)\s*(\$[\d,]+ cap savings)$/, ") ($1)");
  // And it lowercases the first word: "signed a Two-Way contract", "utah Jazz
  // (UTA) exercised". Everything downstream reads "Signed", "Waived", "Traded".
  return detail.charAt(0).toUpperCase() + detail.slice(1);
}

// Since Nov 21, 2026 the page is a table, one row per transaction:
//   | Nov 18, 2026 | Signing | [![](…/nba_cle1.png)CLE](…/team/97/overview "CLE") |
//   ![](…/101234.webp)Nov 18 · CLE · Signing[Zack Austin](…)(F) signed a 2 year
//   Two-Way contract with [Cleveland Cavaliers](…)(CLE) |
// The fourth cell is an optional headshot, a "date · team · type" label, the
// player's link, his position in brackets after it, then the prose.
const TABLE_ROW =
  /^\|\s*([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})\s*\|[^|\n]*\|[^|\n]*\|\s*(?:!\[[^\]]*\]\([^)]*\))?[^[|\n]*\[([^\]]+)\]\([^)]*\)\s*\(([^)]*)\)([^|\n]*)\|\s*$/gm;
/** Every table line that opens with a date: what TABLE_ROW ought to match. */
const TABLE_LINE = /^\|\s*[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}\s*\|.*$/gm;

export function parse(md) {
  const txns = [];
  const push = (date, name, pos, detailRaw) => {
    const detail = tidy(detailRaw);
    // The table prints "Nov 8, 2026"; the feed has always had "Nov 08, 2026",
    // and a row is matched to the one already held by its date as written.
    const day = date.trim().replace(/^([A-Z][a-z]{2})\s+(\d),/, "$1 0$2,").replace(/\s+/g, " ");
    txns.push({ player: name.trim(), pos: pos.trim(), date: day, type: classify(detail), detail });
  };
  for (const m of md.matchAll(ROW)) push(m[1], m[2], m[3], m[4]);
  const tableLines = md.match(TABLE_LINE) ?? [];
  let fromTable = 0;
  for (const m of md.matchAll(TABLE_ROW)) {
    push(m[1], m[2], m[3], m[4]);
    fromTable++;
  }
  // A table row that didn't parse is a transaction silently dropped. Refuse.
  if (fromTable !== tableLines.length) {
    const parsed = new Set([...md.matchAll(TABLE_ROW)].map((m) => m[0]));
    const missed = tableLines.filter((l) => !parsed.has(l));
    throw new Error(
      `Spotrac's transactions table has ${tableLines.length} rows and ${fromTable} parsed. Unread:\n` +
        missed.map((l) => "  " + l.replace(/https?:\/\/[^) ]*/g, "…").slice(0, 300)).join("\n"),
    );
  }
  return txns;
}
