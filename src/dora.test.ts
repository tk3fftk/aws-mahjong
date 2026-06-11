import { describe, it, expect } from "vitest";
import {
  countDoraHan,
  doraIndicators,
  MAX_DORA_INDICATORS,
  nextTile,
  uraDoraIndicators,
} from "./dora";
import { mpszToTiles } from "./tiles";
import type { Tile, TileId } from "./types";

describe("nextTile (ドラ表示牌 → ドラ)", () => {
  const cases: Array<[TileId, TileId]> = [
    ["1m", "2m"],
    ["8m", "9m"],
    ["9m", "1m"],
    ["9p", "1p"],
    ["9s", "1s"], // 9→1 で suit 内ラップ
    ["4s", "5s"],
    ["1z", "2z"],
    ["2z", "3z"],
    ["3z", "4z"],
    ["4z", "1z"], // 風: 1z→2z→3z→4z→1z
    ["5z", "6z"],
    ["6z", "7z"],
    ["7z", "5z"], // 三元: 5z→6z→7z→5z
  ];
  it.each(cases)("%s の次は %s", (indicator, dora) => {
    expect(nextTile(indicator)).toBe(dora);
  });
});

describe("countDoraHan", () => {
  it("表示牌 4s (ドラ=5s) に対し手中の 5s 2枚で 2飜", () => {
    expect(countDoraHan(mpszToTiles("55s123m"), ["4s"])).toBe(2);
  });
  it("ドラ該当なしは 0", () => {
    expect(countDoraHan(mpszToTiles("123m456p"), ["4s"])).toBe(0);
  });
  it("同一表示牌が2枚めくれていれば二重カウント", () => {
    expect(countDoraHan(mpszToTiles("5s111m"), ["4s", "4s"])).toBe(2);
  });
  it("カン4枚はすべて数える: 表示牌 9m (ドラ=1m) × 1m4枚 = 4飜", () => {
    expect(countDoraHan(mpszToTiles("1111m"), ["9m"])).toBe(4);
  });
  it("複数表示牌の合算: 4s(→5s) + 3z(→4z)、手に 5s×1 + 4z×2 = 3飜", () => {
    expect(countDoraHan(mpszToTiles("5s4z4z"), ["4s", "3z"])).toBe(3);
  });
});

describe("ドラ表示牌スロット (deadWall[0..4]=表, [5..9]=裏, [10..13]=予約)", () => {
  // 王牌14枚: 1m..9m,1p..5p (index と牌が1対1で分かる並び)
  const dw: Tile[] = mpszToTiles("123456789m12345p").map((id) => ({ id, copy: 0 }));

  it("公開1枚: deadWall[0] のみ", () => {
    expect(doraIndicators(dw, 1).map((t) => t.id)).toEqual(["1m"]);
  });
  it("公開3枚: deadWall[0..2]", () => {
    expect(doraIndicators(dw, 3).map((t) => t.id)).toEqual(["1m", "2m", "3m"]);
  });
  it("上限5枚でキャップ", () => {
    expect(MAX_DORA_INDICATORS).toBe(5);
    expect(doraIndicators(dw, 9)).toHaveLength(5);
  });
  it("裏ドラは表と平行スロット (index+5)。リーチ実装が使う予約API", () => {
    expect(uraDoraIndicators(dw, 1).map((t) => t.id)).toEqual(["6m"]);
    expect(uraDoraIndicators(dw, 5).map((t) => t.id)).toEqual(["6m", "7m", "8m", "9m", "1p"]);
  });
  it("空の deadWall (配牌前) では空配列", () => {
    expect(doraIndicators([], 1)).toEqual([]);
  });
});
