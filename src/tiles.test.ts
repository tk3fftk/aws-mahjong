import { describe, it, expect } from "vitest";
import {
  mpszToTiles,
  tilesToMpsz,
  sortTileIds,
  isYaochu,
  isDragon,
  isWind,
  counts34,
  ALL_TILE_IDS,
  AWS_NAMES,
} from "./tiles";

describe("mpszToTiles", () => {
  it("単一suit '123m' は 1m,2m,3m を順に返す", () => {
    expect(mpszToTiles("123m")).toEqual(["1m", "2m", "3m"]);
  });

  it("字牌のみ '7z' は 7z を1枚返す", () => {
    expect(mpszToTiles("7z")).toEqual(["7z"]);
  });

  it("複数suit '1m2p3s' は m→p→s の順に並ぶ", () => {
    expect(mpszToTiles("1m2p3s")).toEqual(["1m", "2p", "3s"]);
  });

  it("ハイフン区切り '123m-456p' は無視して結合される", () => {
    expect(mpszToTiles("123m-456p")).toEqual(["1m", "2m", "3m", "4p", "5p", "6p"]);
  });

  it("空文字は空配列", () => {
    expect(mpszToTiles("")).toEqual([]);
  });
});

describe("tilesToMpsz", () => {
  it("単一suit は数字+suit の形にまとまる", () => {
    expect(tilesToMpsz(["1m", "2m", "3m"])).toBe("123m");
  });

  it("複数suit は m→p→s→z の順で連結される", () => {
    expect(tilesToMpsz(["3s", "1m", "7z", "2p"])).toBe("1m2p3s7z");
  });

  it("空配列は空文字", () => {
    expect(tilesToMpsz([])).toBe("");
  });
});

describe("sortTileIds", () => {
  it("シャッフルされた牌列を suit順 + 数字順に並べる", () => {
    expect(sortTileIds(["7z", "2p", "1m", "9s", "3p", "1z"])).toEqual([
      "1m", "2p", "3p", "9s", "1z", "7z",
    ]);
  });
});

describe("isYaochu", () => {
  it("数牌の1/9 と 字牌は yaochu", () => {
    expect(isYaochu("1m")).toBe(true);
    expect(isYaochu("9s")).toBe(true);
    expect(isYaochu("1z")).toBe(true);
    expect(isYaochu("7z")).toBe(true);
  });

  it("数牌の2-8 は yaochu でない", () => {
    expect(isYaochu("2m")).toBe(false);
    expect(isYaochu("5p")).toBe(false);
    expect(isYaochu("8s")).toBe(false);
  });
});

describe("isDragon", () => {
  it("5z(Kiro), 6z(Cost Explorer), 7z(IAM) は三元牌", () => {
    expect(isDragon("5z")).toBe(true);
    expect(isDragon("6z")).toBe(true);
    expect(isDragon("7z")).toBe(true);
  });

  it("風牌・数牌は三元牌ではない", () => {
    expect(isDragon("1z")).toBe(false);
    expect(isDragon("4z")).toBe(false);
    expect(isDragon("5m")).toBe(false);
  });
});

describe("isWind", () => {
  it("1z〜4z は風牌", () => {
    expect(isWind("1z")).toBe(true);
    expect(isWind("4z")).toBe(true);
  });

  it("三元牌・数牌は風牌ではない", () => {
    expect(isWind("5z")).toBe(false);
    expect(isWind("9m")).toBe(false);
  });
});

describe("counts34", () => {
  it("'111m' は index 0 に 3 を持つ34要素配列", () => {
    const c = counts34(["1m", "1m", "1m"]);
    expect(c.length).toBe(34);
    expect(c[0]).toBe(3);
    expect(c[1]).toBe(0);
  });

  it("'5p7z' は index 13 と 33 にそれぞれ1", () => {
    const c = counts34(["5p", "7z"]);
    expect(c[13]).toBe(1); // 1p=9, 5p=13
    expect(c[33]).toBe(1); // 1z=27, 7z=33
  });
});

describe("ALL_TILE_IDS / AWS_NAMES", () => {
  it("ALL_TILE_IDS は34種 = 27数牌 + 7字牌", () => {
    expect(ALL_TILE_IDS).toHaveLength(34);
  });

  it("AWS_NAMES に34牌すべての日本語名/AWSサービス名が入っている", () => {
    for (const id of ALL_TILE_IDS) {
      expect(AWS_NAMES[id]).toBeTruthy();
    }
  });

  it("白=Kiro, 發=Cost Explorer, 中=IAM", () => {
    expect(AWS_NAMES["5z"]).toBe("Kiro (白)");
    expect(AWS_NAMES["6z"]).toBe("Cost Explorer (發)");
    expect(AWS_NAMES["7z"]).toBe("IAM (中)");
  });
});
