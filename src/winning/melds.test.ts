import { describe, it, expect } from "vitest";
import { toDecompMeld, effectiveHandTiles, isMenzenHand } from "./melds";
import { mpszToTiles } from "../tiles";
import type { MeldLike, Tile } from "../types";

function toTiles(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

function meld(kind: MeldLike["kind"], mpsz: string): MeldLike {
  return { kind, tiles: toTiles(mpsz) };
}

describe("toDecompMeld", () => {
  it("チーは kind を維持し、牌をソートして返す", () => {
    const result = toDecompMeld(meld("chi", "534m"));
    expect(result).toEqual({ kind: "chi", tiles: ["3m", "4m", "5m"] });
  });

  it("ポンは pon 3枚のまま", () => {
    expect(toDecompMeld(meld("pon", "555z"))).toEqual({
      kind: "pon",
      tiles: ["5z", "5z", "5z"],
    });
  });

  it.each(["minkan", "ankan", "kakan"] as const)(
    "%s (4枚) は pon 3枚に切り詰める",
    (kind) => {
      expect(toDecompMeld(meld(kind, "1111z"))).toEqual({
        kind: "pon",
        tiles: ["1z", "1z", "1z"],
      });
    },
  );
});

describe("effectiveHandTiles", () => {
  it("純手牌 + 副露3枚ずつで実効14枚になる (kan は3枚に切り詰め)", () => {
    const concealed = toTiles("123m456p77s"); // 8枚
    const melds = [meld("pon", "555z"), meld("minkan", "1111z")];
    const result = effectiveHandTiles(concealed, melds);
    expect(result).toHaveLength(14);
    expect(result.filter((t) => t.id === "1z")).toHaveLength(3);
  });
});

describe("isMenzenHand", () => {
  it("副露なしは門前", () => {
    expect(isMenzenHand([])).toBe(true);
  });

  it("暗槓のみは門前", () => {
    expect(isMenzenHand([meld("ankan", "1111z")])).toBe(true);
  });

  it("暗槓 + ポンは門前ではない", () => {
    expect(isMenzenHand([meld("ankan", "1111z"), meld("pon", "555z")])).toBe(false);
  });

  it("チー1組で門前ではない", () => {
    expect(isMenzenHand([meld("chi", "123m")])).toBe(false);
  });
});
