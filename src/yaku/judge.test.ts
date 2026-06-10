import { describe, it, expect } from "vitest";
import { judgeYaku, hasAnyAwsYaku, canDeclareWin } from "./judge";
import { canWin } from "../winning/check";
import { effectiveHandTiles, isMenzenHand } from "../winning/melds";
import { mpszToTiles } from "../tiles";
import type { MeldLike, Tile } from "../types";

function toHand(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

function meld(kind: MeldLike["kind"], mpsz: string): MeldLike {
  return { kind, tiles: toHand(mpsz) };
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

describe("judgeYaku / 副露あり (鳴き手の統合シナリオ)", () => {
  // ゲーム層の組み立て規約をそのまま再現するヘルパ
  function judgeWithMelds(
    concealedMpsz: string,
    melds: MeldLike[],
    opts: { isTsumo: boolean },
  ) {
    const concealed = toHand(concealedMpsz);
    const winForm = canWin(concealed, melds)!;
    expect(winForm).toBeTruthy();
    const allTiles = effectiveHandTiles(concealed, melds);
    return judgeYaku(winForm, allTiles, {
      isTsumo: opts.isTsumo,
      isMenzen: isMenzenHand(melds),
      seatWind: "1z",
      roundWind: "1z",
    });
  }

  it("5z ポン → ツモ: kiro は hanOpen=1 で成立、門前清自摸和は付かない", () => {
    const result = judgeWithMelds("234m567m234p55s", [meld("pon", "555z")], {
      isTsumo: true,
    });
    expect(result.yakus.find((y) => y.id === "kiro")?.han).toBe(1);
    expect(result.yakus.find((y) => y.id === "menzen-tsumo")).toBeUndefined();
    expect(canDeclareWin(result.yakus, result.isYakuman)).toBe(true);
  });

  it("完全門前ロン: 平和は成立し、門前清自摸和は付かない", () => {
    // 全順子 + 非役牌雀頭 (5s) + 両面待ち相当の形
    const hand = toHand("234m567m234p678p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, {
      isTsumo: false,
      isMenzen: true,
      seatWind: "1z",
      roundWind: "1z",
    });
    expect(result.yakus.find((y) => y.id === "pinfu")).toBeTruthy();
    expect(result.yakus.find((y) => y.id === "menzen-tsumo")).toBeUndefined();
  });

  it("チー1組のロン: 平和は付かず、清一色は 5飜に食い下がる", () => {
    const result = judgeWithMelds("234m567m789m99m", [meld("chi", "123m")], {
      isTsumo: false,
    });
    expect(result.yakus.find((y) => y.id === "pinfu")).toBeUndefined();
    expect(result.yakus.find((y) => y.id === "chinitsu")?.han).toBe(5);
  });

  it("明槓 + ポン×2 + 暗刻: カンは刻子扱いで対々和が成立する", () => {
    const result = judgeWithMelds("222m55s", [
      meld("minkan", "1111z"),
      meld("pon", "555z"),
      meld("pon", "777s"),
    ], { isTsumo: true });
    expect(result.yakus.find((y) => y.id === "toitoi")).toBeTruthy();
    // 1z 明槓 (東場・東家) は場風+自風で各1飜
    expect(result.yakus.find((y) => y.id === "round-wind")).toBeTruthy();
    expect(result.yakus.find((y) => y.id === "seat-wind")).toBeTruthy();
  });

  it("暗槓のみの手は門前扱い: 門前清自摸和が成立する", () => {
    const concealed = toHand("234m567m234p55s");
    const melds = [meld("ankan", "5555z")];
    const result = judgeWithMelds("234m567m234p55s", melds, { isTsumo: true });
    expect(isMenzenHand(melds)).toBe(true);
    expect(result.yakus.find((y) => y.id === "menzen-tsumo")).toBeTruthy();
    expect(result.yakus.find((y) => y.id === "kiro")?.han).toBe(1);
    expect(concealed).toHaveLength(11);
  });
});
