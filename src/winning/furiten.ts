import type { MeldLike, Tile, TileId } from "../types";
import { ALL_TILE_IDS, tileIdIndex, counts34 } from "../tiles";
import { canWin } from "./check";

// 同種牌の上限。手牌+副露で4枚使い切っている牌は5枚目が存在しないので待ちから除外する。
// このガードが無いと counts が5になり「刻子+雀頭」の偽分解が成立してしまう。
const MAX_COPIES = 4;

/**
 * テンパイ牌 (待ち) の列挙。concealed は打牌直後の純手牌 (13 - 3*melds.length 枚)。
 * 全34種を canWin で試すブルートフォース (1呼び出し <1ms、打牌ごと×3席なので十分速い)。
 */
export function winningTiles(concealed: Tile[], melds: MeldLike[] = []): TileId[] {
  const held = counts34([
    ...concealed.map((t) => t.id),
    ...melds.flatMap((m) => m.tiles.map((t) => t.id)),
  ]);
  const out: TileId[] = [];
  for (const id of ALL_TILE_IDS) {
    if (held[tileIdIndex(id)]! >= MAX_COPIES) continue;
    if (canWin([...concealed, { id, copy: 0 }], melds)) out.push(id);
  }
  return out;
}

/**
 * 基本フリテン: 自分の捨て牌 (鳴かれた牌を含む全打牌履歴) に待ち牌が
 * 1枚でも含まれていればロン不可。同巡フリテン・リーチフリテンは未対応。
 */
export function isFuriten(
  concealed: Tile[],
  melds: MeldLike[],
  discardedIds: TileId[],
): boolean {
  const waits = new Set(winningTiles(concealed, melds));
  if (waits.size === 0) return false; // ノーテンにフリテン概念はない
  return discardedIds.some((id) => waits.has(id));
}
