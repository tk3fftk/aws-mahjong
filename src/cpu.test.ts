import { describe, it, expect } from "vitest";
import { decideCpuAction, decideClaim } from "./cpu";
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
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false },
      rng: () => 0,
    });
    expect(action.action).toBe("win");
  });

  it("AWS役を満たさない和了形 (1z刻子のみ) では和了せず打牌する", () => {
    // 1z刻子は AWS役ではないので和了不可、ランダム打牌になる
    const hand = toHand("111z234m567m234p55s");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false },
      rng: () => 0,
    });
    expect(action.action).toBe("discard");
  });

  it("和了形でない場合は rng に従って 1枚を打牌する", () => {
    const hand = toHand("123m456p789s11z22z33z4z"); // 14枚 で 標準形でも七対子でもない
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false },
      rng: () => 0,
    });
    if (action.action !== "discard") throw new Error("expected discard");
    expect(action.tileIndex).toBe(0);
  });

  it("rng=0.999 のとき最後尾の牌を選ぶ", () => {
    const hand = toHand("123m456p789s11z22z33z4z");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false },
      rng: () => 0.999,
    });
    if (action.action !== "discard") throw new Error("expected discard");
    expect(action.tileIndex).toBe(hand.length - 1);
  });

  it("鳴き直後 (isTsumo=false) は和了形でもツモ宣言しない", () => {
    const hand = toHand("555z234m567m234p55s");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: false, isMenzen: false, seatWind: "2z", roundWind: "1z", isRiichi: false },
      rng: () => 0,
    });
    expect(action.action).toBe("discard");
  });
});

describe("decideCpuAction / リーチ", () => {
  const ctx = (over: { isRiichi?: boolean } = {}) =>
    ({ isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z", isRiichi: false, ...over }) as const;

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
