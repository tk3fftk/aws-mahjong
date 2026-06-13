import { describe, it, expect } from "vitest";
import { PERSONALITIES, decideCpuAction, decideClaim, pickGenbutsuDiscard, pickIsolatedDiscard } from "./cpu";
import { mpszToTiles } from "./tiles";
import type { ChiVariant, ClaimOffers, Tile } from "./types";

function toHand(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

function offers(partial: Partial<ClaimOffers> = {}): ClaimOffers {
  return { ron: false, kan: false, pon: false, chi: [], ...partial };
}

describe("decideCpuAction", () => {
  it("AWS役を含む和了形 (Kiro+他) ならツモ宣言を返す", () => {
    const hand = toHand("555z234m567m234p55s");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false, winningTileId: null },
      rng: () => 0,
    });
    expect(action.action).toBe("win");
  });

  it("AWS役を満たさない和了形 (1z刻子のみ) では和了せず打牌する", () => {
    // 1z刻子は AWS役ではないので和了不可、ランダム打牌になる
    const hand = toHand("111z234m567m234p55s");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false, winningTileId: null },
      rng: () => 0,
    });
    expect(action.action).toBe("discard");
  });

  it("和了形でない場合は最も孤立した牌 (孤立字牌 4z) を切る (balanced 既定)", () => {
    // 123m/456p/789s 連結・11z/22z/33z 対子・4z だけ孤立 → 4z (末尾) を切る
    const hand = toHand("123m456p789s11z22z33z4z");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false, winningTileId: null },
      rng: () => 0,
    });
    if (action.action !== "discard") throw new Error("expected discard");
    expect(action.tileIndex).toBe(hand.findIndex((t) => t.id === "4z"));
  });

  it("孤立牌が一意なら rng に依らず同じ牌を切る", () => {
    const hand = toHand("123m456p789s11z22z33z4z");
    const expected = hand.findIndex((t) => t.id === "4z");
    for (const rng of [() => 0, () => 0.999] as const) {
      const action = decideCpuAction({
        hand,
        ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false, winningTileId: null },
        rng,
      });
      if (action.action !== "discard") throw new Error("expected discard");
      expect(action.tileIndex).toBe(expected);
    }
  });

  it("鳴き直後 (isTsumo=false) は和了形でもツモ宣言しない", () => {
    const hand = toHand("555z234m567m234p55s");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: false, isMenzen: false, seatWind: "2z", roundWind: "1z", isRiichi: false, winningTileId: null },
      rng: () => 0,
    });
    expect(action.action).toBe("discard");
  });
});

describe("decideCpuAction / リーチ", () => {
  const ctx = (over: { isRiichi?: boolean } = {}) =>
    ({ isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false, winningTileId: null, ...over }) as const;

  it("riichiAllowed かつテンパイなら {action:'riichi'} を返す (最初の候補)", () => {
    // 555z234m67m234p55s + 1z(末尾)。1z 切り (index13) のみテンパイ維持
    const hand = toHand("555z234m67m234p55s1z");
    const action = decideCpuAction({ hand, ctx: ctx(), riichiAllowed: true, rng: () => 0 });
    expect(action).toEqual({ action: "riichi", tileIndex: 13 });
  });

  it("riichiAllowed が false なら通常打牌", () => {
    const hand = toHand("555z234m67m234p55s1z");
    const action = decideCpuAction({ hand, ctx: ctx(), riichiAllowed: false, rng: () => 0 });
    expect(action.action).toBe("discard");
  });

  it("riichiAllowed でもノーテンなら通常打牌 (テンパイを保つ打牌が無い)", () => {
    const hand = toHand("1m4m7m1p4p7p1s4s7s1z2z3z4z5z"); // バラバラ14枚
    const action = decideCpuAction({ hand, ctx: ctx(), riichiAllowed: true, rng: () => 0 });
    expect(action.action).toBe("discard");
  });

  it("randomDiscard=true なら旧来のランダム打牌 (rng index) に従う (debug/legacy 用)", () => {
    const hand = toHand("123m456p789s11z22z33z4z");
    const lo = decideCpuAction({ hand, ctx: ctx(), randomDiscard: true, rng: () => 0 });
    const hi = decideCpuAction({ hand, ctx: ctx(), randomDiscard: true, rng: () => 0.999 });
    expect(lo).toEqual({ action: "discard", tileIndex: 0 });
    expect(hi).toEqual({ action: "discard", tileIndex: hand.length - 1 });
  });

  it("既にリーチ済み (ctx.isRiichi) なら末尾 (ツモ牌) をツモ切り", () => {
    const hand = toHand("555z234m67m234p55s1z");
    const action = decideCpuAction({ hand, ctx: ctx({ isRiichi: true }), rng: () => 0 });
    expect(action).toEqual({ action: "discard", tileIndex: hand.length - 1 });
  });

  it("AWS和了可能なら riichi より win を優先する", () => {
    const hand = toHand("555z234m567m234p55s"); // kiro 確定の和了形
    const action = decideCpuAction({ hand, ctx: ctx(), riichiAllowed: true, rng: () => 0 });
    expect(action.action).toBe("win");
  });
});

describe("decideCpuAction / 性格別の守備", () => {
  const baseCtx = (over: { anyOpponentRiichi?: boolean; safeTileIds?: Tile["id"][]; isRiichi?: boolean } = {}) =>
    ({
      isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z",
      isRiichi: false, winningTileId: null, ...over,
    }) as const;

  it("Well-Architected(守備): 相手リーチ時は手中の現物を切って降りる", () => {
    const hand = toHand("123m456p789s1z9m22s4z"); // 1z が現物
    const action = decideCpuAction({
      hand,
      ctx: baseCtx({ anyOpponentRiichi: true, safeTileIds: ["1z", "9m"] }),
      personality: PERSONALITIES.defender,
      rng: () => 0,
    });
    expect(action).toEqual({ action: "discard", tileIndex: hand.findIndex((t) => t.id === "1z") });
  });

  it("Well-Architected(守備): 現物が手に無ければ最も孤立した牌で代替する", () => {
    const hand = toHand("234m567p234s567s2m4z"); // 現物集合に一致なし
    const action = decideCpuAction({
      hand,
      ctx: baseCtx({ anyOpponentRiichi: true, safeTileIds: ["1p"] }),
      personality: PERSONALITIES.defender,
      rng: () => 0,
    });
    expect(action).toEqual({ action: "discard", tileIndex: pickIsolatedDiscard(hand, () => 0) });
  });

  it("Well-Architected(守備): テンパイでも相手リーチ中はリーチせず降りる", () => {
    const hand = toHand("555z234m67m234p55s1z"); // 1z切りでテンパイ・1z は現物
    const action = decideCpuAction({
      hand,
      ctx: baseCtx({ anyOpponentRiichi: true, safeTileIds: ["1z"] }),
      personality: PERSONALITIES.defender,
      riichiAllowed: true,
      rng: () => 0,
    });
    expect(action.action).toBe("discard"); // riichi ではない
  });

  it("Well-Architected(守備): 相手リーチが無ければ通常通りリーチする", () => {
    const hand = toHand("555z234m67m234p55s1z");
    const action = decideCpuAction({
      hand,
      ctx: baseCtx({ anyOpponentRiichi: false }),
      personality: PERSONALITIES.defender,
      riichiAllowed: true,
      rng: () => 0,
    });
    expect(action).toEqual({ action: "riichi", tileIndex: 13 });
  });

  it("Lambda(攻撃): 相手リーチでも降りず孤立牌を切り続ける (現物を無視)", () => {
    const hand = toHand("234m9m567p1p789s55s3z"); // 現物 2m は連結牌・孤立牌は別にある
    const action = decideCpuAction({
      hand,
      ctx: baseCtx({ anyOpponentRiichi: true, safeTileIds: ["2m"] }),
      personality: PERSONALITIES.attacker,
      rng: () => 0,
    });
    expect(action).toEqual({ action: "discard", tileIndex: pickIsolatedDiscard(hand, () => 0) });
    expect(action).not.toEqual({ action: "discard", tileIndex: hand.findIndex((t) => t.id === "2m") });
  });

  it("Auto Scaling(均衡): 非テンパイ + 相手リーチなら現物に降りる", () => {
    const hand = toHand("234m9m567p1p789s55s3z"); // ノーテン・1p が現物
    const action = decideCpuAction({
      hand,
      ctx: baseCtx({ anyOpponentRiichi: true, safeTileIds: ["1p"] }),
      personality: PERSONALITIES.balanced,
      rng: () => 0,
    });
    expect(action).toEqual({ action: "discard", tileIndex: hand.findIndex((t) => t.id === "1p") });
  });

  it("Auto Scaling(均衡): テンパイなら相手リーチ中でも押してリーチする", () => {
    const hand = toHand("555z234m67m234p55s1z");
    const action = decideCpuAction({
      hand,
      ctx: baseCtx({ anyOpponentRiichi: true, safeTileIds: ["1z"] }),
      personality: PERSONALITIES.balanced,
      riichiAllowed: true,
      rng: () => 0,
    });
    expect(action).toEqual({ action: "riichi", tileIndex: 13 });
  });
});

describe("pickIsolatedDiscard", () => {
  it("連結牌の中の孤立字牌 (5z単独) を切る", () => {
    // 123m / 456p / 789s は連結、11z は対子、5z だけ孤立
    const hand = toHand("123m456p789s11z5z");
    expect(pickIsolatedDiscard(hand, () => 0)).toBe(hand.findIndex((t) => t.id === "5z"));
  });

  it("孤立牌が同点ならツモ番乱数でタイブレーク (rng=0→先頭側 / rng=0.999→末尾側)", () => {
    // 234m / 567p / 234s は連結、1z と 4z が孤立字牌で同点
    const hand = toHand("234m567p234s1z4z");
    const lo = hand.findIndex((t) => t.id === "1z");
    const hi = hand.findIndex((t) => t.id === "4z");
    expect(pickIsolatedDiscard(hand, () => 0)).toBe(lo);
    expect(pickIsolatedDiscard(hand, () => 0.999)).toBe(hi);
  });

  it("孤立牌が中張牌と么九牌なら么九牌を優先して切る", () => {
    // 1m (孤立么九) と 5p (孤立中張) が候補。么九を切る
    const hand = toHand("1m5p234s567s99m");
    expect(pickIsolatedDiscard(hand, () => 0)).toBe(hand.findIndex((t) => t.id === "1m"));
  });

  it("対子・刻子は割らず、余剰の孤立牌を切る", () => {
    // 111m (刻子) 99p (対子) はキープ、孤立した 3s を切る
    const hand = toHand("111m99p3s456m789m");
    expect(pickIsolatedDiscard(hand, () => 0)).toBe(hand.findIndex((t) => t.id === "3s"));
  });
});

describe("pickGenbutsuDiscard", () => {
  it("安全牌が手にあれば最初に一致する index を返す", () => {
    const hand = toHand("123m456p789s1z9m"); // 1z と 9m が安全集合に含まれる
    expect(pickGenbutsuDiscard(hand, ["1z", "9m"])).toBe(hand.findIndex((t) => t.id === "1z"));
  });

  it("安全牌が手に無ければ null", () => {
    const hand = toHand("123m456p789s2m3m");
    expect(pickGenbutsuDiscard(hand, ["1z", "9p"])).toBeNull();
  });

  it("安全集合が空なら null", () => {
    const hand = toHand("123m456p789s2m3m");
    expect(pickGenbutsuDiscard(hand, [])).toBeNull();
  });
});

describe("decideClaim", () => {
  const tile = (id: Tile["id"]): Tile => ({ id, copy: 0 });

  it("ロン可能なら必ずロン", () => {
    expect(decideClaim({ offers: offers({ ron: true, pon: true }), tile: tile("5m") })).toBe("ron");
  });

  it("AWS役牌 (5z/6z/7z) はポンする", () => {
    expect(decideClaim({ offers: offers({ pon: true }), tile: tile("5z") })).toBe("pon");
    expect(decideClaim({ offers: offers({ pon: true }), tile: tile("7z") })).toBe("pon");
  });

  it("数牌や風牌はポンを見送る", () => {
    expect(decideClaim({ offers: offers({ pon: true }), tile: tile("5m") })).toBeNull();
    expect(decideClaim({ offers: offers({ pon: true }), tile: tile("1z") })).toBeNull();
  });

  it("チーは常にパス", () => {
    const chi: ChiVariant[] = [{ tiles: [tile("3m"), tile("4m")] }];
    expect(decideClaim({ offers: offers({ chi }), tile: tile("5m") })).toBeNull();
  });
});

describe("decideClaim / 性格別の鳴き", () => {
  const tile = (id: Tile["id"]): Tile => ({ id, copy: 0 });
  const winds = { seatWind: "2z", roundWind: "1z" } as const;

  it("全性格: ロン可能なら必ずロン", () => {
    for (const p of [PERSONALITIES.attacker, PERSONALITIES.defender, PERSONALITIES.balanced]) {
      expect(decideClaim({ offers: offers({ ron: true, pon: true }), tile: tile("5z"), personality: p })).toBe("ron");
    }
  });

  it("Lambda(攻撃): AWS役 (789p=CI/CDパイプライン) が残るチーは鳴く", () => {
    // 7p8p チーで 789p 副露 → cicd-pipeline 確定。1z 切りでテンパイ
    const hand = toHand("234m567m34s55s1z7p8p");
    const chi: ChiVariant[] = [{ tiles: [tile("7p"), tile("8p")] }];
    expect(
      decideClaim({ offers: offers({ chi }), tile: tile("9p"), personality: PERSONALITIES.attacker, hand, melds: [], ...winds }),
    ).toBe("chi");
  });

  it("Lambda(攻撃): AWS役が残らないチーは見送る (死に手を防ぐ自己ゲート)", () => {
    // 2p3p チーで 123p 副露 → AWS役なし。萬子+筒子のみで散らばり AWS役パターンも作れない
    const hand = toHand("123455678m2367p");
    const chi: ChiVariant[] = [{ tiles: [tile("2p"), tile("3p")] }];
    expect(
      decideClaim({ offers: offers({ chi }), tile: tile("1p"), personality: PERSONALITIES.attacker, hand, melds: [], ...winds }),
    ).toBeNull();
  });

  it("Lambda(攻撃): AWS役牌のポン・カンは鳴く (カン優先)", () => {
    const ponHand = toHand("77z234m567m234p55s");
    expect(
      decideClaim({ offers: offers({ pon: true }), tile: tile("7z"), personality: PERSONALITIES.attacker, hand: ponHand, melds: [], ...winds }),
    ).toBe("pon");
    const kanHand = toHand("777z234m567m234p5s");
    expect(
      decideClaim({ offers: offers({ pon: true, kan: true }), tile: tile("7z"), personality: PERSONALITIES.attacker, hand: kanHand, melds: [], ...winds }),
    ).toBe("kan");
  });

  it("Lambda(攻撃): AWS役が残らない非役牌ポンは見送る", () => {
    const hand = toHand("1m22m99m456p789s23s"); // 2m ポンしても AWS役に届かない
    expect(
      decideClaim({ offers: offers({ pon: true }), tile: tile("2m"), personality: PERSONALITIES.attacker, hand, melds: [], ...winds }),
    ).toBeNull();
  });

  it("Well-Architected(守備): AWS役牌でもポンせず一切鳴かない", () => {
    const hand = toHand("77z234m567m234p55s");
    expect(
      decideClaim({ offers: offers({ pon: true }), tile: tile("7z"), personality: PERSONALITIES.defender, hand, melds: [], ...winds }),
    ).toBeNull();
  });

  it("Auto Scaling(均衡): AWS役牌はポン / 数牌・チーは見送る (現状踏襲)", () => {
    const hand = toHand("77z234m567m234p55s");
    expect(
      decideClaim({ offers: offers({ pon: true }), tile: tile("7z"), personality: PERSONALITIES.balanced, hand, melds: [], ...winds }),
    ).toBe("pon");
    expect(
      decideClaim({ offers: offers({ pon: true }), tile: tile("5m"), personality: PERSONALITIES.balanced, hand, melds: [], ...winds }),
    ).toBeNull();
    const chi: ChiVariant[] = [{ tiles: [tile("7p"), tile("8p")] }];
    expect(
      decideClaim({ offers: offers({ chi }), tile: tile("9p"), personality: PERSONALITIES.balanced, hand, melds: [], ...winds }),
    ).toBeNull();
  });
});
