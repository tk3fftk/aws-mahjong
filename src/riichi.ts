import type { MeldLike, Tile, TileId } from "./types";
import { winningTiles } from "./winning/furiten";

/**
 * リーチ宣言時に捨てられる牌の index を列挙する。
 * hand は打牌待ち (13 - 3*melds.length + 1 枚)。各 index を除いた残りが
 * winningTiles > 0 (テンパイ) なら候補。同一 tileId は結果をキャッシュして二重計算しない
 * (14候補 × winningTiles だが、重複牌は判定が同じなので Map で使い回す)。
 */
export function riichiDiscardIndices(hand: Tile[], melds: MeldLike[] = []): number[] {
  const cache = new Map<TileId, boolean>();
  const out: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    const id = hand[i]!.id;
    let keepsTenpai = cache.get(id);
    if (keepsTenpai === undefined) {
      const rest = hand.filter((_, j) => j !== i);
      keepsTenpai = winningTiles(rest, melds).length > 0;
      cache.set(id, keepsTenpai);
    }
    if (keepsTenpai) out.push(i);
  }
  return out;
}
