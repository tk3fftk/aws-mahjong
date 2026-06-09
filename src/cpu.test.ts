import { describe, it, expect } from "vitest";
import { decideCpuAction } from "./cpu";
import { mpszToTiles } from "./tiles";
import type { Tile } from "./types";

function toHand(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

describe("decideCpuAction", () => {
  it("AWS役を含む和了形 (Kiro+他) ならツモ宣言を返す", () => {
    const hand = toHand("555z234m567m234p55s");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z" },
      rng: () => 0,
    });
    expect(action.action).toBe("win");
  });

  it("AWS役を満たさない和了形 (1z刻子のみ) では和了せず打牌する", () => {
    // 1z刻子は AWS役ではないので和了不可、ランダム打牌になる
    const hand = toHand("111z234m567m234p55s");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z" },
      rng: () => 0,
    });
    expect(action.action).toBe("discard");
  });

  it("和了形でない場合は rng に従って 1枚を打牌する", () => {
    const hand = toHand("123m456p789s11z22z33z4z"); // 14枚 で 標準形でも七対子でもない
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z" },
      rng: () => 0,
    });
    if (action.action !== "discard") throw new Error("expected discard");
    expect(action.tileIndex).toBe(0);
  });

  it("rng=0.999 のとき最後尾の牌を選ぶ", () => {
    const hand = toHand("123m456p789s11z22z33z4z");
    const action = decideCpuAction({
      hand,
      ctx: { isTsumo: true, isMenzen: true, seatWind: "2z", roundWind: "1z" },
      rng: () => 0.999,
    });
    if (action.action !== "discard") throw new Error("expected discard");
    expect(action.tileIndex).toBe(hand.length - 1);
  });
});
