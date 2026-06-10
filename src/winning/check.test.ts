import { describe, it, expect } from "vitest";
import { canWin } from "./check";
import { mpszToTiles } from "../tiles";
import type { MeldLike, Tile } from "../types";

function toHand(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

function meld(kind: MeldLike["kind"], mpsz: string): MeldLike {
  return { kind, tiles: toHand(mpsz) };
}

describe("canWin", () => {
  it("標準形を検出する", () => {
    const result = canWin(toHand("123456789m123p11s"));
    expect(result?.kind).toBe("standard");
  });

  it("七対子を検出する", () => {
    const result = canWin(toHand("11m22m66m33p44s55z77z"));
    expect(result?.kind).toBe("seven-pairs");
  });

  it("国士無双を検出する", () => {
    const result = canWin(toHand("1m9m1p9p1s9s1z2z3z4z5z6z7z1z"));
    expect(result?.kind).toBe("thirteen-orphans");
  });

  it("和了不成立は null", () => {
    expect(canWin(toHand("12345678m1234p11s"))).toBeNull();
  });
});

describe("canWin / 副露あり", () => {
  it("ポン1副露 + 純手牌11枚で和了形になる", () => {
    const result = canWin(toHand("123m456p777s88s"), [meld("pon", "555z")]);
    expect(result?.kind).toBe("standard");
    if (result?.kind !== "standard") throw new Error("unreachable");
    const d = result.decompositions[0]!;
    expect(d.melds).toHaveLength(4);
    expect(d.melds).toContainEqual({ kind: "pon", tiles: ["5z", "5z", "5z"] });
  });

  it("明槓は pon 3枚として分解に現れる", () => {
    const result = canWin(toHand("123m456p777s88s"), [meld("minkan", "1111z")]);
    expect(result?.kind).toBe("standard");
    if (result?.kind !== "standard") throw new Error("unreachable");
    expect(result.decompositions[0]!.melds).toContainEqual({
      kind: "pon",
      tiles: ["1z", "1z", "1z"],
    });
  });

  it("チー2副露 + 純手牌8枚で和了形になる", () => {
    const result = canWin(toHand("777s888s11m"), [
      meld("chi", "123m"),
      meld("chi", "456p"),
    ]);
    expect(result?.kind).toBe("standard");
  });

  it("副露があると七対子は不成立 (null)", () => {
    // 11m22m33p44s55z + pon があっても七対子扱いしない
    const result = canWin(toHand("11m22m33p44s5z"), [meld("pon", "777z")]);
    expect(result).toBeNull();
  });

  it("暗槓があっても国士無双は不成立 (null)", () => {
    const result = canWin(toHand("1m9m1p9p1s9s1z2z3z4z"), [meld("ankan", "5555z")]);
    expect(result).toBeNull();
  });

  it("枚数不整合 (14枚 + 副露1) は null", () => {
    expect(canWin(toHand("123456789m123p11s"), [meld("pon", "555z")])).toBeNull();
  });
});
