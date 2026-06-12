import type { ClaimKind, ClaimOffers, MeldLike, SeatWind, Tile } from "./types";
import { isDragon } from "./tiles";
import { canWin } from "./winning/check";
import { effectiveHandTiles } from "./winning/melds";
import { judgeYaku, canDeclareWin } from "./yaku/judge";
import { riichiDiscardIndices } from "./riichi";

export interface CpuContext {
  isTsumo: boolean;
  isMenzen: boolean;
  seatWind: SeatWind;
  roundWind: SeatWind;
  isRiichi: boolean; // 既にリーチ済みか (手牌が固定されツモ切りのみになる)
}

export interface CpuInput {
  hand: Tile[];
  melds?: MeldLike[];
  ctx: CpuContext;
  // 門前・1000点・ライブ壁≥1・未リーチを controller が判定済みのときだけ true。
  // テンパイを保つ打牌の有無は decideCpuAction 側で判定する
  riichiAllowed?: boolean;
  rng: () => number;
}

export type CpuAction =
  | { action: "win" }
  | { action: "riichi"; tileIndex: number }
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
  // 既にリーチ済みなら手牌は固定 → ツモ切り (末尾 = ツモ牌)
  if (input.ctx.isRiichi) {
    return { action: "discard", tileIndex: input.hand.length - 1 };
  }
  // リーチ可能かつテンパイを保つ打牌があれば最初の候補で宣言 (dumb で十分)
  if (input.riichiAllowed) {
    const candidates = riichiDiscardIndices(input.hand, melds);
    if (candidates.length > 0) {
      return { action: "riichi", tileIndex: candidates[0]! };
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
