import type { ClaimKind, ClaimOffers, MeldLike, SeatWind, Tile } from "./types";
import { isDragon } from "./tiles";
import { canWin } from "./winning/check";
import { effectiveHandTiles } from "./winning/melds";
import { judgeYaku, canDeclareWin } from "./yaku/judge";

export interface CpuContext {
  isTsumo: boolean;
  isMenzen: boolean;
  seatWind: SeatWind;
  roundWind: SeatWind;
}

export interface CpuInput {
  hand: Tile[];
  melds?: MeldLike[];
  ctx: CpuContext;
  rng: () => number;
}

export type CpuAction =
  | { action: "win" }
  | { action: "discard"; tileIndex: number };

export function decideCpuAction(input: CpuInput): CpuAction {
  const melds = input.melds ?? [];
  // ツモ直後 (手牌が打牌可能枚数) のみ和了判定。鳴き直後はツモ和了できない
  const win = input.ctx.isTsumo ? canWin(input.hand, melds) : null;
  if (win) {
    const result = judgeYaku(win, effectiveHandTiles(input.hand, melds), input.ctx);
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

export interface ClaimDecisionInput {
  offers: ClaimOffers;
  tile: Tile; // 打たれた牌
}

/**
 * CPU の鳴き判断 (軽いヒューリスティック):
 * - ロンは適格なら必ず宣言
 * - ポンは AWS役牌 (5z/6z/7z = Kiro/Cost Explorer/IAM、鳴いても hanOpen 1飜) のみ
 * - チー・明槓はしない (ランダム打牌の CPU には利得が薄い)
 */
export function decideClaim(input: ClaimDecisionInput): ClaimKind | null {
  if (input.offers.ron) return "ron";
  if (input.offers.pon && isDragon(input.tile.id)) return "pon";
  return null;
}
