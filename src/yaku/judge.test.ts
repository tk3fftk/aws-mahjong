import { describe, it, expect } from "vitest";
import { judgeYaku, hasAnyAwsYaku, canDeclareWin, type JudgeContext } from "./judge";
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

const baseCtx: JudgeContext = {
  isTsumo: true,
  isMenzen: true,
  seatWind: "1z",
  roundWind: "1z",
  winningTileId: null,
  melds: [],
};

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

  it("七対子のツモは門前清自摸和が複合する (七対子は常に門前)", () => {
    const hand = toHand("11m22m66m33p44s55z77z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx); // isTsumo: true
    expect(result.yakus.find((y) => y.id === "menzen-tsumo")?.han).toBe(1);
    expect(result.totalHan).toBe(3); // 七対子2 + 門前清自摸和1
    const ron = judgeYaku(winForm, hand, { ...baseCtx, isTsumo: false });
    expect(ron.yakus.find((y) => y.id === "menzen-tsumo")).toBeUndefined();
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
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    // Kiro(1) + 門前清自摸和(1) + 断么九は字牌5zありで付かない
    expect(result.totalHan).toBeGreaterThanOrEqual(2);
  });
});

describe("judgeYaku / 一盃口", () => {
  it("同一順子2組で一盃口が成立 (1飜, 門前)", () => {
    // 555z(kiro) + 123m×2 + 456p + 55p
    const hand = toHand("555z123m123m456p55p");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "iipeiko")).toEqual({
      id: "iipeiko",
      name: "一盃口",
      han: 1,
    });
  });

  it("一盃口は門前限定: isMenzen=false では付かない", () => {
    // 同じ手を副露ありとして扱う
    const hand = toHand("555z123m123m456p55p");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, isMenzen: false });
    expect(result.yakus.find((y) => y.id === "iipeiko")).toBeUndefined();
  });

  it("異なる順子しかなければ一盃口は付かない", () => {
    // 555z + 123m + 456m + 789m + 55p (全順子だが全て異なる)
    const hand = toHand("555z123m456m789m55p");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "iipeiko")).toBeUndefined();
  });
});

describe("judgeYaku / 二盃口", () => {
  it("標準形の純二盃口 (七対子にならない形) で 3飜・一盃口は付かない", () => {
    // 123m123m + 234m234m (2m/3m が4枚なので七対子にはならない) + 55p
    const hand = toHand("112222333344m55p");
    const winForm = canWin(hand)!;
    expect(winForm.kind).toBe("standard");
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "ryanpeikou")).toEqual({
      id: "ryanpeikou",
      name: "二盃口",
      han: 3,
    });
    expect(result.yakus.find((y) => y.id === "iipeiko")).toBeUndefined();
  });

  it("七対子形の二盃口は高点法で二盃口(3飜)として採点される", () => {
    // 234m234m + 234p234p + 99s: 七対子形でもあるが二盃口が優先
    const hand = toHand("223344m223344p99s");
    const winForm = canWin(hand)!;
    expect(winForm.kind).toBe("seven-pairs");
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "ryanpeikou")).toBeTruthy();
    expect(result.yakus.find((y) => y.id === "chiitoitsu")).toBeUndefined();
  });

  it("二盃口は門前限定: isMenzen=false では付かない", () => {
    const hand = toHand("112222333344m55p");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, isMenzen: false });
    expect(result.yakus.find((y) => y.id === "ryanpeikou")).toBeUndefined();
  });

  it("純粋な七対子 (二盃口形でない) は従来どおり七対子として採点される", () => {
    const hand = toHand("11m22m66m33p44s55z77z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "chiitoitsu")).toBeTruthy();
    expect(result.yakus.find((y) => y.id === "ryanpeikou")).toBeUndefined();
  });
});

describe("judgeYaku / AWSカン宣言ゲート", () => {
  it("宣言なし: 6789p を含む手は CI/CDカンが付かず CI/CDパイプライン(2飜)のみ", () => {
    const hand = toHand("678p999p234m567m55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "cicd-pipeline-kan")).toBeUndefined();
    expect(result.yakus.find((y) => y.id === "cicd-pipeline")?.han).toBe(2);
  });

  it("AWSカン宣言: CI/CDカン手は3飜成立し CI/CDパイプラインを抑制", () => {
    // concealed 11枚 (3面子+雀頭) + AWSカン副露 6789p (1面子枠)
    const concealed = toHand("234m567m234s55z");
    const melds: MeldLike[] = [meld("aws-kan", "6789p")];
    const winForm = canWin(concealed, melds)!;
    expect(winForm).toBeTruthy();
    const result = judgeYaku(winForm, effectiveHandTiles(concealed, melds), {
      isTsumo: true,
      isMenzen: isMenzenHand(melds),
      seatWind: "1z",
      roundWind: "1z",
      winningTileId: null,
      melds,
    });
    expect(result.yakus.find((y) => y.id === "cicd-pipeline-kan")?.han).toBe(3);
    expect(result.yakus.find((y) => y.id === "cicd-pipeline")).toBeUndefined();
  });

  it("AWSカン手の符計算: aws-kan は刻子ではないので符0寄与、fu は算出される", () => {
    const concealed = toHand("234m567m234s55z");
    const melds: MeldLike[] = [meld("aws-kan", "6789p")];
    const winForm = canWin(concealed, melds)!;
    const result = judgeYaku(winForm, effectiveHandTiles(concealed, melds), {
      isTsumo: true,
      isMenzen: isMenzenHand(melds),
      seatWind: "1z",
      roundWind: "1z",
      winningTileId: "2m", // 234m に含まれる和了牌 → 符計算経路を通す
      melds,
    });
    expect(result.yakus.find((y) => y.id === "cicd-pipeline-kan")?.han).toBe(3);
    expect(typeof result.fu).toBe("number");
    expect(result.fu).toBeGreaterThan(0);
  });

  it("AWSカンは暗槓同様メンゼンを保つ (門前清自摸和が複合)", () => {
    const concealed = toHand("234m567m234s55z");
    const melds: MeldLike[] = [meld("aws-kan", "6789p")];
    const winForm = canWin(concealed, melds)!;
    const result = judgeYaku(winForm, effectiveHandTiles(concealed, melds), {
      isTsumo: true,
      isMenzen: isMenzenHand(melds),
      seatWind: "1z",
      roundWind: "1z",
      winningTileId: null,
      melds,
    });
    expect(result.yakus.find((y) => y.id === "menzen-tsumo")).toBeTruthy();
  });
});

describe("judgeYaku / AWS役 強制共立の整理 (反復系)", () => {
  it("冗長化手: Webアプリ×2(2飜)+冗長化(3飜)、標準の二盃口は抑制される", () => {
    // 234p234p234m234m77s は標準形では二盃口でもあるが、AWS一盃口(冗長化)と複合させない。
    const hand = toHand("234p234p234m234m77s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "redundancy")?.han).toBe(3);
    expect(result.yakus.find((y) => y.id === "web-application")?.han).toBe(2);
    expect(result.yakus.find((y) => y.id === "ryanpeikou")).toBeUndefined();
    expect(result.yakus.find((y) => y.id === "iipeiko")).toBeUndefined();
    expect(result.yakus.find((y) => y.id === "master-replica")).toBeUndefined();
  });

  it("AWS三暗刻手: Webアプリ×3(3飜)+三暗刻(3飜)、冗長化・マスターレプリカは抑制", () => {
    const hand = toHand("333p222m777s234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "aws-three-concealed-triples1")?.han).toBe(3);
    expect(result.yakus.find((y) => y.id === "web-application")?.han).toBe(3);
    expect(result.yakus.find((y) => y.id === "redundancy")).toBeUndefined();
    expect(result.yakus.find((y) => y.id === "master-replica")).toBeUndefined();
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
      winningTileId: null,
      melds,
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
      winningTileId: null,
      melds: [],
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

describe("judgeYaku / リーチ・一発 (judge.ts トップレベル付与)", () => {
  it("標準形 + isRiichi → yakus に riichi(1飜)、totalHan +1", () => {
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const base = judgeYaku(winForm, hand, baseCtx);
    const result = judgeYaku(winForm, hand, { ...baseCtx, isRiichi: true });
    expect(result.yakus.find((y) => y.id === "riichi")).toEqual({
      id: "riichi",
      name: "リーチ",
      han: 1,
    });
    expect(result.totalHan).toBe(base.totalHan + 1);
  });

  it("isRiichi + isIppatsu → riichi + ippatsu で +2", () => {
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const base = judgeYaku(winForm, hand, baseCtx);
    const result = judgeYaku(winForm, hand, {
      ...baseCtx,
      isRiichi: true,
      isIppatsu: true,
    });
    expect(result.yakus.find((y) => y.id === "riichi")?.han).toBe(1);
    expect(result.yakus.find((y) => y.id === "ippatsu")?.han).toBe(1);
    expect(result.totalHan).toBe(base.totalHan + 2);
  });

  it("isIppatsu のみ (isRiichi なし) → 一発は付かない", () => {
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, isIppatsu: true });
    expect(result.yakus.find((y) => y.id === "ippatsu")).toBeUndefined();
    expect(result.yakus.find((y) => y.id === "riichi")).toBeUndefined();
  });

  it("七対子 + isRiichi → riichi が付く", () => {
    const hand = toHand("11m22m66m33p44s55z77z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, isRiichi: true });
    expect(result.yakus.find((y) => y.id === "chiitoitsu")).toBeTruthy();
    expect(result.yakus.find((y) => y.id === "riichi")).toBeTruthy();
  });

  it("国士無双 (役満) + isRiichi → riichi は付かない", () => {
    const hand = toHand("1m9m1p9p1s9s1z2z3z4z5z6z7z1z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, isRiichi: true });
    expect(result.isYakuman).toBe(true);
    expect(result.yakus.find((y) => y.id === "riichi")).toBeUndefined();
  });

  it("ctx 省略 (既存呼び出し) → 従来どおり riichi/ippatsu は付かない", () => {
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.yakus.find((y) => y.id === "riichi")).toBeUndefined();
    expect(result.yakus.find((y) => y.id === "ippatsu")).toBeUndefined();
  });

  it("AWS役ゲート: リーチ・一発・門前清自摸和だけでは和了不可 (標準役のみ)", () => {
    const yakus = [
      { id: "riichi", name: "リーチ", han: 1 },
      { id: "ippatsu", name: "一発", han: 1 },
      { id: "menzen-tsumo", name: "門前清自摸和", han: 1 },
    ];
    expect(canDeclareWin(yakus, false)).toBe(false);
  });
});

describe("judgeYaku / 符 (fu)", () => {
  it("kiro 単騎ツモ → fu 40 (20 + 5z暗刻8 + 単騎2 + ツモ2 = 32 切り上げ)", () => {
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, winningTileId: "5s" });
    expect(result.fu).toBe(40);
  });

  it("七対子 → fu 25", () => {
    const hand = toHand("11m22m66m33p44s55z77z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, winningTileId: "4s" });
    expect(result.fu).toBe(25);
  });

  it("国士無双 (役満) → fu null (符不問)", () => {
    const hand = toHand("1m9m1p9p1s9s1z2z3z4z5z6z7z1z");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, winningTileId: "1z" });
    expect(result.fu).toBeNull();
  });

  it("適格性パス (winningTileId: null) → fu null (符を計算しない)", () => {
    const hand = toHand("555z234m567m234p55s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, baseCtx);
    expect(result.fu).toBeNull();
  });

  it("配置の高点法: 123m/345m 両方に置ける 3m ツモは辺張+2 を採用 → fu 40", () => {
    // 20 + 辺張2 + 666p暗刻4 + 777s暗刻4 + ツモ2 = 32 → 40 (両面解釈は 30)
    const hand = toHand("123m345m666p777s88s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, winningTileId: "3m" });
    expect(result.fu).toBe(40);
  });

  it("暗刻優先の高点法: ロン牌 1m を順子側に置き 111m を暗刻で残す → fu 50", () => {
    // 20 + 門前ロン10 + 111m暗刻8 + 555p暗刻4 = 42 → 50 (シャンポン=明刻解釈は 40)
    const hand = toHand("1m1m1m1m2m3m555p678s99s");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, {
      ...baseCtx,
      isTsumo: false,
      winningTileId: "1m",
    });
    expect(result.fu).toBe(50);
  });

  it("(han, fu) 順序: 平和つき順子分解が暗刻分解 (fu 40) に飜優先で勝つ → fu 20", () => {
    // 111222333m456m77m の 4m ツモ。清一色は両分解に付くため差は 平和+両面 の有無:
    // 順子分解 (123m×3) = ツモ1+平和1+清一6 = 8飜 20符 > 暗刻分解 = 7飜 40符
    const hand = toHand("111222333m456m77m");
    const winForm = canWin(hand)!;
    const result = judgeYaku(winForm, hand, { ...baseCtx, winningTileId: "4m" });
    expect(result.yakus.find((y) => y.id === "pinfu")).toBeTruthy();
    expect(result.fu).toBe(20);
  });
});
