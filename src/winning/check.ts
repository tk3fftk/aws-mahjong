import type { MeldLike, Tile, WinForm } from "../types";
import { MELDS_PER_HAND, decomposeStandard } from "./decompose";
import { toDecompMeld } from "./melds";
import { isSevenPairs, isThirteenOrphans, sevenPairsTiles } from "./special";

/**
 * 和了形判定。concealed は純手牌+和了牌 (= 14 - 3*melds.length 枚)。
 * 七対子・国士無双は副露 (暗槓含む) が1つでもあれば構造的に不成立。
 * 副露がある場合、各分解には toDecompMeld した晒し面子をマージして返すため、
 * 後段の judgeYaku は門前手と同じ形で消費できる。
 */
export function canWin(concealed: Tile[], melds: MeldLike[] = []): WinForm | null {
  const ids = concealed.map((t) => t.id);
  if (melds.length === 0) {
    if (isThirteenOrphans(ids)) {
      return { kind: "thirteen-orphans" };
    }
    if (isSevenPairs(ids)) {
      return { kind: "seven-pairs", pairs: sevenPairsTiles(ids) };
    }
  }
  const concealedMeldCount = MELDS_PER_HAND - melds.length;
  if (concealedMeldCount < 0) return null;
  const decompositions = decomposeStandard(ids, concealedMeldCount);
  if (decompositions.length === 0) return null;
  if (melds.length === 0) {
    return { kind: "standard", decompositions };
  }
  const exposed = melds.map(toDecompMeld);
  return {
    kind: "standard",
    decompositions: decompositions.map((d) => ({
      melds: [...d.melds, ...exposed],
      pair: d.pair,
    })),
  };
}
