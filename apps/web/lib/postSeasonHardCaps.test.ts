import { describe, it, expect } from "vitest";
import { SEASON_2025_26, postSeasonWindow } from "@apron/cba-engine";
import { TRANSACTIONS } from "@apron/data";
import { C, feedStateOf, TEAM_IDS } from "@/lib/league";
import { feedIso } from "@/lib/feedDate";

// Art. VII §2(e)(2)(ii)(B): a restriction-table row E–J trade made between the
// day after the last day of the 2025-26 Regular Season (Apr 12, 2026) and June
// 30, 2026 hard-caps the team at that apron through the end of 2026-27. The
// feed state's 2026-27 hard caps were audited at the July moves, which missed
// June. Portland's Jun 29 Morant trade surfaced on Oct 14, 2026 from an outside
// fact-check. This is the audit of every other trade in that window, pinned:
// a trade row the feed adds to the window fails the first test until someone
// audits it here.

type Cap = { team: string; row: "E" | "F" | "H" | "I"; level: "first_apron" | "second_apron" };
interface Deal {
  /** `${iso} ${player} ${from}>${to}` for each feed row of the deal. */
  rows: string[];
  finding: string;
  caps: Cap[];
}

const DRAFT_RIGHTS = "Draft rights only: no player contract moves, so no traded-player exception is used and no salary is aggregated.";

const AUDIT: Deal[] = [
  {
    rows: ["2026-06-23 Tarris Reed Jr. DEN>SAS", "2026-06-24 Trevon Brazile SAS>DEN"],
    finding: `${DRAFT_RIGHTS} Seconds move too; no cash.`,
    caps: [],
  },
  {
    rows: ["2026-06-23 Karim Lopez DET>MEM", "2026-06-23 Ebuka Okorie MEM>DET"],
    finding: `${DRAFT_RIGHTS} Seconds move too; no cash.`,
    caps: [],
  },
  {
    rows: ["2026-06-23 Ebuka Okorie OKC>MEM", "2026-06-23 Bennett Stirtz MEM>OKC"],
    finding: `${DRAFT_RIGHTS} Seconds move too; no cash.`,
    caps: [],
  },
  {
    rows: [
      "2026-06-24 Tyler Nickel PHX>NYK",
      "2026-06-24 Chinemelu Elonu LAL>NYK",
      "2026-06-24 Louis Labeyrie LAL>NYK",
      "2026-06-24 Cameron Carr NYK>LAL",
      "2026-06-24 Melvin Ajinca DAL>NYK",
      "2026-06-24 Koa Peat DAL>PHX",
      "2026-06-24 Sergio de Larrea LAL>DAL",
    ],
    finding:
      `${DRAFT_RIGHTS} The Lakers and Phoenix each sent cash considerations to New York: row I for both. New York and Dallas paid none.`,
    caps: [
      { team: "LAL", row: "I", level: "second_apron" },
      { team: "PHX", row: "I", level: "second_apron" },
    ],
  },
  {
    rows: ["2026-06-24 Meleek Thomas SAC>CLE", "2026-06-24 Alex Karaban CLE>SAC"],
    finding: `${DRAFT_RIGHTS} A second moves too; no cash.`,
    caps: [],
  },
  {
    rows: ["2026-06-24 Nick Martinelli HOU>LAC"],
    finding: `${DRAFT_RIGHTS} The Clippers bought him for cash: row I. Houston received the cash.`,
    caps: [{ team: "LAC", row: "I", level: "second_apron" }],
  },
  {
    rows: ["2026-06-24 Ugonna Onyenso NYK>DET"],
    finding: `${DRAFT_RIGHTS} Detroit bought him for cash: row I. New York received the cash.`,
    caps: [{ team: "DET", row: "I", level: "second_apron" }],
  },
  {
    rows: [
      "2026-06-24 Malique Lewis WAS>MIL",
      "2026-06-24 Izaiyah Nelson WAS>ORL",
      "2026-06-24 Felix Okpara ORL>WAS",
    ],
    finding: `${DRAFT_RIGHTS} Milwaukee sent cash to Orlando: row I. Orlando received it; Washington neither paid nor received.`,
    caps: [{ team: "MIL", row: "I", level: "second_apron" }],
  },
  {
    rows: ["2026-06-24 Narcisse N'Goy ATL>LAC", "2026-06-24 Henri Veesaar LAC>ATL"],
    finding: `${DRAFT_RIGHTS} Atlanta sent N'Goy WITH cash for Veesaar: row I. The Clippers received it.`,
    caps: [{ team: "ATL", row: "I", level: "second_apron" }],
  },
  {
    rows: ["2026-06-24 Otega Oweh MIA>OKC", "2026-06-24 Ryan Conwell OKC>MIA"],
    finding: `${DRAFT_RIGHTS} Miami sent Oweh WITH cash for Conwell: row I. Oklahoma City received it.`,
    caps: [{ team: "MIA", row: "I", level: "second_apron" }],
  },
  {
    rows: ["2026-06-24 Vsevolod Ishchenko CHI>LAL"],
    finding: `${DRAFT_RIGHTS} The Lakers bought him for cash: row I again. Chicago received it.`,
    caps: [{ team: "LAL", row: "I", level: "second_apron" }],
  },
  {
    rows: [
      "2026-06-24 Mojave King HOU>NYK",
      "2026-06-24 Ugonna Onyenso HOU>NYK",
      "2026-06-24 Jack Kayil HOU>NYK",
      "2026-06-24 Nick Martinelli NYK>HOU",
      "2026-06-24 Bruce Thornton NYK>HOU",
    ],
    finding: `${DRAFT_RIGHTS} A second moves too; no cash.`,
    caps: [],
  },
  {
    rows: ["2026-06-24 Kam Jones IND>CHI", "2026-06-25 Braden Smith CHI>IND"],
    finding:
      "Indiana sent Kam Jones with swaps AND cash for Braden Smith's draft rights: row I for Indiana. Chicago took Jones's $1,272,870 (the 2025-26 rookie minimum) and the cash; whether it used the Minimum Player Salary Exception (§6(i)) or a traded-player exception, Chicago is already first-apron capped for 2026-27 (Hield, row E), so no answer changes its line.",
    caps: [{ team: "IND", row: "I", level: "second_apron" }],
  },
  {
    rows: ["2026-06-25 Naz Reid MIN>CHA"],
    finding:
      "The agreement, logged on the day it was reported. As described ($23M Reid for Ball and Green) it can't match, and the deal completed Jul 10 as a four-team trade (Randle and Jefferson to Brooklyn, Claxton to Chicago), which the feed carries on that date: a 2026-27 transaction, outside the window.",
    caps: [],
  },
  {
    rows: ["2026-06-29 Ja Morant MEM>POR", "2026-06-29 Jerami Grant POR>MEM", "2026-06-29 Kris Murray POR>MEM"],
    finding:
      "Portland took Morant's $39,446,090 for Grant and Murray's $35,132,001, past the 100% + $250K a standard exception allows: the expanded exception, row E (and two salaries aggregated, row H). Memphis took back less and aggregated nothing.",
    caps: [
      { team: "POR", row: "E", level: "first_apron" },
      { team: "POR", row: "H", level: "second_apron" },
    ],
  },
  {
    rows: ["2026-06-30 Alpha Kaba ATL>SAC", "2026-06-30 Devin Carter SAC>ATL"],
    finding:
      "Atlanta took Devin Carter's $4,923,720 for Kaba's draft rights and sent no salary. How it absorbed him isn't in our data. Every route is either cap-free (room, an exception that arose in the window) or rows F/E at the first apron, and Atlanta is already first-apron capped for 2026-27 (Landale NT-MLE), so no answer changes its line. Sacramento sent salary out and took none in.",
    caps: [],
  },
];

const key = (iso: string, player: string, detail: string) => {
  const m = detail.match(/Traded to .*?\((\w{3})\) from .*?\((\w{3})\)/);
  return `${iso} ${player} ${m?.[2] ?? "?"}>${m?.[1] ?? "?"}`;
};

const windowTrades = TRANSACTIONS.filter(
  (t) => t.type === "Trade" && postSeasonWindow(feedIso(t.date), SEASON_2025_26),
).map((t) => key(feedIso(t.date), t.player, t.detail));

const LINE = { first_apron: C.firstApron, second_apron: C.secondApron } as const;

describe("2026-27 hard caps from trades after the 2025-26 Regular Season (§2(e)(2)(ii))", () => {
  it("the audit covers every trade the feed has in the Apr 13 – Jun 30, 2026 window, and nothing else", () => {
    const audited = AUDIT.flatMap((d) => d.rows);
    expect([...windowTrades].sort()).toEqual([...audited].sort());
  });

  it("every team a window trade engaged in rows E–J is capped at or below that apron for 2026-27", () => {
    for (const deal of AUDIT) {
      for (const cap of deal.caps) {
        expect(feedStateOf(cap.team).hardCap, `${cap.team} row ${cap.row}: ${deal.finding}`).toBeLessThanOrEqual(
          LINE[cap.level],
        );
      }
    }
  });

  it("Portland is first-apron capped by the Morant trade", () => {
    const por = feedStateOf("POR");
    expect(por.hardCap).toBe(C.firstApron);
    expect(por.hardCapSource).toMatch(/Morant/);
  });

  it("the teams with no 2026-27 hard cap engaged no row E–J in the window", () => {
    const uncapped = TEAM_IDS.filter((t) => !Number.isFinite(feedStateOf(t).hardCap));
    // Brooklyn, Denver, New York, Oklahoma City, Orlando, Toronto (Oct 14, 2026).
    expect(uncapped.length).toBeGreaterThan(0);
    const engaged = new Set(AUDIT.flatMap((d) => d.caps.map((c) => c.team)));
    expect(uncapped.filter((t) => engaged.has(t))).toEqual([]);
  });
});
