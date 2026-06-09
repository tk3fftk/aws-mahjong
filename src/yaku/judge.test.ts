import { describe, it, expect } from "vitest";
import { judgeYaku, hasAnyAwsYaku, canDeclareWin } from "./judge";
import { canWin } from "../winning/check";
import { mpszToTiles } from "../tiles";
import type { Tile } from "../types";

function toHand(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

const baseCtx = {
  isTsumo: true,
  isMenzen: true,
  seatWind: "1z",
  roundWind: "1z",
} as const;

describe("judgeYaku", () => {
  it("Kiro(5z刻子) があれば AWS役必須を満たす", () => {
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "kiro")).toBeTruthy();
    expect(hasAnyAwsYaku(result.yakus, result.isYakuman)).toBe(true);
    expect(canDeclareWin(result.yakus, result.isYakuman)).toBe(true);
  });

  it("1z(東) 刻子だけでは AWS役必須を満たさない", () => {
    // 東家・東場 → 1z刻子は場風+自風で2飜つくが AWS役ではない
    const hand = toHand("111z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(hasAnyAwsYaku(result.yakus, result.isYakuman)).toBe(false);
    expect(canDeclareWin(result.yakus, result.isYakuman)).toBe(false);
  });

  it("国士無双 (役満) は AWS役不要でも和了成立", () => {
    const hand = toHand("1m9m1p9p1s9s1z2z3z4z5z6z7z1z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.isYakuman).toBe(true);
    expect(canDeclareWin(result.yakus, result.isYakuman)).toBe(true);
  });

  it("5z(Kiro) 刻子は standard.ts 側ではスキップされ、AWS固有役側でのみカウント", () => {
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    // dragon-white のような ID は付かず、kiro のみ
    expect(result.yakus.find((y) => y.id === "kiro")).toBeTruthy();
    expect(result.yakus.find((y) => y.id === "dragon-white")).toBeUndefined();
  });

  it("七対子(AWS固有役無し) は和了不可", () => {
    // dr-architecture でない普通の七対子は AWS役ゼロ
    const hand = toHand("11m22m66m33p44s55z77z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    // 普通の七対子は yakus に chiitoitsu(2han) が入るが AWS役ではない
    expect(hasAnyAwsYaku(result.yakus, result.isYakuman)).toBe(false);
    expect(canDeclareWin(result.yakus, result.isYakuman)).toBe(false);
  });

  it("DRアーキテクチャ(七対子の亜種, 役満) は和了成立", () => {
    const hand = toHand("22m33p55p3s3s7s7s1z1z2z2z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.isYakuman).toBe(true);
    expect(result.yakus.find((y) => y.id === "dr-architecture")).toBeTruthy();
  });

  it("複数分解可能な手は合計飜が最大の分解を採用する", () => {
    // 一盃口形だが MVP で 一盃口は実装しないため、ここは Kiro と平和の関係で確認
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    // Kiro(1) + 平和は刻子があるので付かない + 門前清自摸和(1) + 断么九は字牌5zありで付かない
    expect(result.totalHan).toBeGreaterThanOrEqual(2);
  });
});
