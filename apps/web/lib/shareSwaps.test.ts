import { describe, it, expect } from "vitest";
import {
  encodeTradeParam,
  decodeTradeParam,
  swapShareLabel,
  type DecodedSwap,
} from "@/lib/trade-share";

// Pick swaps must survive the share token so the top-of-page card, the PNG
// export, the shared link, and the X unfurl all tell the same story.

const swap: DecodedSwap = { year: 2028, round: 1, favoredTo: "OKC", otherTeam: "WAS" };

describe("share token — pick swaps", () => {
  it("round-trips swaps through encode/decode", () => {
    const token = encodeTradeParam(["OKC", "WAS"], [], [], [swap]);
    const d = decodeTradeParam(token);
    expect(d).not.toBeNull();
    expect(d!.swaps).toEqual([swap]);
  });

  it("keeps working for swap-only trades (no players, no picks)", () => {
    const token = encodeTradeParam(["OKC", "WAS"], [], [], [swap]);
    const d = decodeTradeParam(token);
    expect(d!.players).toHaveLength(0);
    expect(d!.picks).toHaveLength(0);
    expect(d!.swaps).toHaveLength(1);
  });

  it("stays backward-compatible: tokens minted without swaps decode to []", () => {
    const token = encodeTradeParam(["OKC", "WAS"], []);
    expect(decodeTradeParam(token)!.swaps).toEqual([]);
  });

  it("drops a swap whose teams aren't both on the board", () => {
    const token = encodeTradeParam(["OKC", "WAS"], [], [], [swap]);
    // Re-encode the payload with a team that isn't in the swap's board.
    const d = decodeTradeParam(token);
    expect(d!.swaps).toHaveLength(1);
    // A swap referencing an off-board team is filtered on decode.
    const bad = encodeTradeParam(["OKC", "WAS"], [], [], [{ ...swap, otherTeam: "LAL" }]);
    expect(decodeTradeParam(bad)!.swaps).toHaveLength(0);
  });

  it("labels a swap from each team's side with the right counterparty", () => {
    expect(swapShareLabel(swap, "OKC")).toBe("’28 1st swap w/ WAS");
    expect(swapShareLabel(swap, "WAS")).toBe("’28 1st swap w/ OKC");
    expect(swapShareLabel({ ...swap, round: 2 }, "OKC")).toBe("’28 2nd swap w/ WAS");
  });
});
