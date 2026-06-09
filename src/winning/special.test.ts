import { describe, it, expect } from "vitest";
import { isSevenPairs, isThirteenOrphans } from "./special";
import { mpszToTiles } from "../tiles";

describe("isSevenPairs", () => {
  it("7種の対子で構成された手は七対子成立", () => {
    expect(isSevenPairs(mpszToTiles("11m22m66m33p44s55z77z"))).toBe(true);
  });

  it("同じ牌が4枚あると七対子は不成立 (伝統ルール)", () => {
    // 1m×4 + 2m×2 + 3m×2 + 4m×2 + 5m×2 + 6m×2 = 14枚だが対子7種ではない
    expect(isSevenPairs(mpszToTiles("1111m2233445566m"))).toBe(false);
  });

  it("13枚は不成立", () => {
    expect(isSevenPairs(mpszToTiles("11m22m66m33p44s55z7z"))).toBe(false);
  });

  it("対子6個+順子1つでは不成立", () => {
    expect(isSevenPairs(mpszToTiles("11m22m33m44m55m66m789p"))).toBe(false);
  });
});

describe("isThirteenOrphans", () => {
  it("13種の老頭牌+いずれか1種が2枚 で国士無双成立", () => {
    expect(isThirteenOrphans(mpszToTiles("1m9m1p9p1s9s1z2z3z4z5z6z7z1m"))).toBe(true);
  });

  it("13種が揃っているが対子がないと不成立", () => {
    // 14枚必要だが対子が無いのでこれは13枚 → 13枚=和了不成立
    expect(isThirteenOrphans(mpszToTiles("1m9m1p9p1s9s1z2z3z4z5z6z7z"))).toBe(false);
  });

  it("中張牌が含まれていると不成立", () => {
    expect(isThirteenOrphans(mpszToTiles("1m9m1p9p1s9s1z2z3z4z5z6z7z5m"))).toBe(false);
  });
});
