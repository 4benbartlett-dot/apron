import { describe, it, expect } from "vitest";
import { parse } from "../../../packages/data/scripts/parse-transactions.mjs";

// Spotrac has laid its transactions page out three ways since July 2026. On
// Nov 21 it became a table, the refresh parsed no rows and stopped, and the
// first draft of a table reader gave "Nov 8, 2026" where the feed holds
// "Nov 08, 2026": every re-pulled row would have been filed a second time.
// Each layout has to give the row the feed already holds, to the character.

const U = "https://www.spotrac.com/x";
const IMG = "https://media.spotrac.com/images/thumb/x.png";

const row = (date: string, type: string, team: string, cell: string) =>
  `| ${date} | ${type} | [![](${IMG})${team}](${U} "${team}") | ![](${IMG})${date.slice(0, -6)} · ${team} · ${type}${cell} |`;

describe("the transactions page, in each layout Spotrac has used", () => {
  it("July 2026: a bare logo, the position inside the player's link", () => {
    const md = `- Jul 28, 2026  \\- Trade![](${IMG})\nTrade [Johni Broome (C)](${U})Traded to LA (LAC) from Philadelphia (PHI) for a 2027 2nd round pick`;
    expect(parse(md)).toEqual([
      { player: "Johni Broome", pos: "C", date: "Jul 28, 2026", type: "Trade", detail: "Traded to LA (LAC) from Philadelphia (PHI) for a 2027 2nd round pick" },
    ]);
  });

  it("late August 2026: the logo is a link", () => {
    const md = `- Aug 30, 2026  \\- Waiver[![MIN](${IMG})](${U})\nWaiver [Enrique Freeman (PF)](${U})Waived by Minnesota Timberwolves (MIN)`;
    expect(parse(md)).toEqual([
      { player: "Enrique Freeman", pos: "PF", date: "Aug 30, 2026", type: "Release", detail: "Waived by Minnesota Timberwolves (MIN)" },
    ]);
  });

  it("Nov 21, 2026: a table, and the row comes out as the feed already holds it", () => {
    const md = [
      "| Date | Type | Team | Transaction |",
      "| --- | --- | --- | --- |",
      row("Nov 18, 2026", "Waiver", "CLE", `[Riley Minix](${U})(SF) waived by [Cleveland Cavaliers](${U})(CLE)`),
      row("Nov 17, 2026", "Signing", "UTA", `[Jonas Aidoo](${U})(C) signed a 2 year Two-Way contract with [Utah Jazz](${U})(UTA)`),
      row("Nov 8, 2026", "Trade", "OKC", `[Nique Clifford](${U})(SF) traded to [Oklahoma City](${U})(OKC) from [Sacramento](${U})(SAC) for a 2028 2nd round pick and a 2030 2nd round pick`),
      row("Nov 8, 2026", "Waiver", "OKC", `[Dalen Terry](${U})(SG) waived by [Oklahoma City Thunder](${U})(OKC)$2,293,651 cap savings`),
      row("Nov 2, 2026", "Option", "NOP", `[AJ Johnson](${U})(SG) new Orleans Pelicans (NOP) declined $5.49 million Team Option for 2027-28`),
      row("Nov 16, 2026", "Fine", "CHI", `[Matas Buzelis](${U})(SF) fined $25,000 for Obscene Gesture against [Minnesota](${U})(MIN) \\- for obscene gesture towards the spectator stands at the conclusion of the CHI-MIN game`),
      "|  |",
    ].join("\n");
    expect(parse(md)).toEqual([
      { player: "Riley Minix", pos: "SF", date: "Nov 18, 2026", type: "Release", detail: "Waived by Cleveland Cavaliers (CLE)" },
      { player: "Jonas Aidoo", pos: "C", date: "Nov 17, 2026", type: "Signing", detail: "Signed a 2 year Two-Way contract with Utah Jazz (UTA)" },
      { player: "Nique Clifford", pos: "SF", date: "Nov 08, 2026", type: "Trade", detail: "Traded to Oklahoma City (OKC) from Sacramento (SAC) for a 2028 2nd round pick and a 2030 2nd round pick" },
      { player: "Dalen Terry", pos: "SG", date: "Nov 08, 2026", type: "Release", detail: "Waived by Oklahoma City Thunder (OKC) ($2,293,651 cap savings)" },
      { player: "AJ Johnson", pos: "SG", date: "Nov 02, 2026", type: "Option", detail: "New Orleans Pelicans (NOP) declined $5.49 million Team Option for 2027-28" },
      { player: "Matas Buzelis", pos: "SF", date: "Nov 16, 2026", type: "Other", detail: "Fined $25,000 for Obscene Gesture against Minnesota (MIN) - for obscene gesture towards the spectator stands at the conclusion of the CHI-MIN game" },
    ]);
  });

  it("a player with no headshot still parses", () => {
    const md = `| Nov 18, 2026 | Signing | [![](${IMG})CLE](${U} "CLE") | Nov 18 · CLE · Signing[Zack Austin](${U})(F) signed a 2 year Two-Way contract with [Cleveland Cavaliers](${U})(CLE) |`;
    expect(parse(md)[0]).toMatchObject({ player: "Zack Austin", pos: "F", detail: "Signed a 2 year Two-Way contract with Cleveland Cavaliers (CLE)" });
  });

  it("refuses a table row it cannot read, and prints it", () => {
    const md = `| Nov 18, 2026 | Signing | CLE | somebody signed something |`;
    expect(() => parse(md)).toThrow(/1 rows and 0 parsed[\s\S]*somebody signed something/);
  });

  it("a page with no rows parses to none, which is what stops the refresh", () => {
    expect(parse("## Glossary\nSeason A league year")).toEqual([]);
  });
});
