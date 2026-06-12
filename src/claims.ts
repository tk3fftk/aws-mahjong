import type {
  ChiVariant,
  ClaimKind,
  ClaimOffers,
  CpuClaim,
  MeldLike,
  Seat,
  SeatWind,
  Tile,
  TileId,
} from "./types";
import { numberOf, suitOf } from "./tiles";
import { canWin } from "./winning/check";
import { isFuriten } from "./winning/furiten";
import { effectiveHandTiles, isMenzenHand } from "./winning/melds";
import { canDeclareWin, judgeYaku } from "./yaku/judge";

// ポンは手牌に同種2枚、カン (明槓) は3枚必要
const PON_TILES_IN_HAND = 2;
const KAN_TILES_IN_HAND = 3;

export interface EligibilityInput {
  hand: Tile[]; // 打牌待ちでない純手牌 (13 - 3*melds.length 枚)
  melds: MeldLike[];
  discardedIds: TileId[];
  tile: Tile; // 打たれた牌
  isShimocha: boolean; // 自分が打牌者の下家か (チーは上家からのみ)
  seatWind: SeatWind;
  roundWind: SeatWind;
  isRiichi?: boolean; // true ならロン以外 (ポン/カン/チー) を抑止
  permanentFuriten?: boolean; // true ならロンも不可 (リーチ後の見逃しフリテン)
}

/** 1人のプレイヤーが打牌に対して宣言できるクレームを列挙する */
export function computeEligibility(input: EligibilityInput): ClaimOffers {
  const sameCount = input.hand.filter((t) => t.id === input.tile.id).length;
  // リーチ者は手牌が固定されるため、ロン以外のクレーム (ポン/カン/チー) はできない
  const canMeld = !input.isRiichi;
  return {
    ron: canRon(input),
    pon: canMeld && sameCount >= PON_TILES_IN_HAND,
    kan: canMeld && sameCount >= KAN_TILES_IN_HAND,
    chi: canMeld && input.isShimocha ? chiVariants(input.hand, input.tile) : [],
  };
}

/**
 * ロン可否: 和了形 + AWS役必須 (canDeclareWin) + フリテンでないこと。
 * 和了牌は打牌なので isTsumo=false で判定する。
 * permanentFuriten (リーチ後の見逃しフリテン) のときは以後ロン不可。
 * 符はゲートに一切関与しない (canDeclareWin + フリテンのみで符非依存)。
 */
function canRon(input: EligibilityInput): boolean {
  if (input.permanentFuriten) return false;
  const concealed = [...input.hand, input.tile];
  const winForm = canWin(concealed, input.melds);
  if (!winForm) return false;
  const judged = judgeYaku(winForm, effectiveHandTiles(concealed, input.melds), {
    isTsumo: false,
    isMenzen: isMenzenHand(input.melds),
    seatWind: input.seatWind,
    roundWind: input.roundWind,
    isRiichi: input.isRiichi,
    winningTileId: input.tile.id,
    melds: input.melds,
  });
  if (!canDeclareWin(judged.yakus, judged.isYakuman)) return false;
  return !isFuriten(input.hand, input.melds, input.discardedIds);
}

/** チー候補の列挙: 打牌を含む順子を作れる手牌2枚の組 (低い側の組から順) */
function chiVariants(hand: Tile[], tile: Tile): ChiVariant[] {
  const suit = suitOf(tile.id);
  if (suit === "z") return [];
  const n = numberOf(tile.id);
  const pick = (num: number): Tile | undefined =>
    hand.find((t) => t.id === (`${num}${suit}` as TileId));
  const variants: ChiVariant[] = [];
  for (const [a, b] of [
    [n - 2, n - 1],
    [n - 1, n + 1],
    [n + 1, n + 2],
  ] as const) {
    if (a < 1 || b > 9) continue;
    const ta = pick(a);
    const tb = pick(b);
    if (ta && tb) variants.push({ tiles: [ta, tb] });
  }
  return variants;
}

export const CLAIM_PRIORITY: Record<ClaimKind, number> = {
  ron: 3,
  kan: 2,
  pon: 2,
  chi: 1,
};

/** 打牌者から反時計回り (ツモ順) の距離。頭ハネの判定に使う */
export function seatDistance(from: Seat, to: Seat, seatOrder: Seat[]): number {
  const fi = seatOrder.indexOf(from);
  const ti = seatOrder.indexOf(to);
  return (ti - fi + seatOrder.length) % seatOrder.length;
}

/**
 * 複数クレームの優先解決。優先度 (ロン > カン=ポン > チー) が同じ場合は
 * 頭ハネ: 打牌者からツモ順で近い席を採用する。
 * ポン同士の同時は牌の枚数上発生しないが、tie-break は一般則で書いておく。
 */
export function resolveClaims(
  claims: CpuClaim[],
  discarder: Seat,
  seatOrder: Seat[],
): CpuClaim | null {
  let best: CpuClaim | null = null;
  for (const claim of claims) {
    if (!best) {
      best = claim;
      continue;
    }
    const pb = CLAIM_PRIORITY[best.kind];
    const pc = CLAIM_PRIORITY[claim.kind];
    if (pc > pb) {
      best = claim;
    } else if (
      pc === pb &&
      seatDistance(discarder, claim.seat, seatOrder) <
        seatDistance(discarder, best.seat, seatOrder)
    ) {
      best = claim;
    }
  }
  return best;
}
