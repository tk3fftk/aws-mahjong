import type { Tile, SeatWind } from "./types";
import { canWin } from "./winning/check";
import { judgeYaku, canDeclareWin } from "./yaku/judge";

export interface CpuContext {
  isTsumo: boolean;
  isMenzen: boolean;
  seatWind: SeatWind;
  roundWind: SeatWind;
}

export interface CpuInput {
  hand: Tile[];
  ctx: CpuContext;
  rng: () => number;
}

export type CpuAction =
  | { action: "win" }
  | { action: "discard"; tileIndex: number };

export function decideCpuAction(input: CpuInput): CpuAction {
  const win = canWin(input.hand);
  if (win) {
    const result = judgeYaku(win, input.hand, input.ctx);
    if (canDeclareWin(result.yakus, result.isYakuman)) {
      return { action: "win" };
    }
  }
  const idx = Math.min(
    input.hand.length - 1,
    Math.floor(input.rng() * input.hand.length),
  );
  return { action: "discard", tileIndex: idx };
}
