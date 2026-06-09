import { describe, it, expect } from "vitest";
import { canWin } from "./check";
import { mpszToTiles } from "../tiles";
import type { Tile } from "../types";

function toHand(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
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
