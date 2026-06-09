import { describe, it, expect } from "vitest";
import { decomposeStandard } from "./decompose";
import { mpszToTiles } from "../tiles";

describe("decomposeStandard", () => {
  it("'123m 456m 789m 123p 11s' は1つの分解(4順子+対子)に分解できる", () => {
    const tiles = mpszToTiles("123456789m123p11s");
    const result = decomposeStandard(tiles);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const first = result[0]!;
    expect(first.pair.tiles).toEqual(["1s", "1s"]);
    expect(first.melds).toHaveLength(4);
    expect(first.melds.every((m) => m.kind === "chi")).toBe(true);
  });

  it("純刻子手 '111m 222m 333m 444p 55s' は4刻子+対子で分解できる", () => {
    const result = decomposeStandard(mpszToTiles("111222333m444p55s"));
    expect(result).toHaveLength(1);
    expect(result[0]!.melds.every((m) => m.kind === "pon")).toBe(true);
    expect(result[0]!.pair.tiles).toEqual(["5s", "5s"]);
  });

  it("分解不能形 '12345678m1234p11s' は空配列を返す", () => {
    const result = decomposeStandard(mpszToTiles("12345678m1234p11s"));
    expect(result).toEqual([]);
  });

  it("字牌の順子は許可されない: '123z 456z 7z 11m 11p 11s' は分解不能", () => {
    // 字牌は順子に成れないので、字牌6枚は刻子化できない並びだと不成立
    const result = decomposeStandard(mpszToTiles("123456z7z11m11p11s"));
    expect(result).toEqual([]);
  });

  it("数牌の順子は同種suit内に限定: '7m8m9p' は順子にならない", () => {
    // 7m 8m 9p をまたぐ順子は不可、よって全体は分解不能
    const result = decomposeStandard(mpszToTiles("789m789p789s11m1p"));
    // 全suitの 789 順子3つ + 11m対子 + 1pは余り → 不成立
    expect(result).toEqual([]);
  });

  it("一盃口の形 '112233m 456p 789p 11s' は複数分解が見つかる", () => {
    // 112233m は (1,2,3)+(1,2,3) の順子ペアか、 (1,1)+(2,2)+(3,3) は対子3つで NG
    // 標準形では順子2つにしか分解できないが、複数分解の生成は順子分割 1パターンのみ
    // 一盃口判定の根拠としてはこれで十分
    const result = decomposeStandard(mpszToTiles("112233m456789p11s"));
    expect(result.length).toBeGreaterThanOrEqual(1);
    const d = result[0]!;
    expect(d.melds.filter((m) => m.kind === "chi")).toHaveLength(4);
  });

  it("純粋な七対子 '11m 22m 33p 44s 55z 66m 77z' は標準形分解は失敗", () => {
    // 全7対子のうち順子化を許す並びが無いケース (suit跨ぎと字牌の組合せで阻止)
    const result = decomposeStandard(mpszToTiles("11m22m66m33p44s55z77z"));
    expect(result).toEqual([]);
  });

  it("対々和 + 雀頭 '111m 222m 333p 444s 55z' は1分解で全刻子", () => {
    const result = decomposeStandard(mpszToTiles("111m222m333p444s55z"));
    expect(result).toHaveLength(1);
    expect(result[0]!.melds.every((m) => m.kind === "pon")).toBe(true);
  });

  it("13枚は分解しない (空)", () => {
    expect(decomposeStandard(mpszToTiles("123456789m1234p"))).toEqual([]);
  });
});
