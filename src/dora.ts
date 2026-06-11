import type { Tile, TileId } from "./types";
import { isDragon, isWind, numberOf, suitOf } from "./tiles";

// 王牌14枚のインデックスレイアウト (deadWall[0] = ライブ壁側の先頭):
//   [0..4]  表ドラ表示牌スロット (公開は doraIndicatorCount 枚まで)
//   [5..9]  裏ドラ表示牌スロット (★リーチ機能用の予約。今回は公開も使用もしない)
//   [10..13] リンシャン予約 (未使用。リンシャンは引き続きライブ壁末尾から: D-009/D-012)
// 表ドラ i 枚目と裏ドラ i 枚目は index i と i+5 でペア (標準麻雀の上下段)。
export const MAX_DORA_INDICATORS = 5; // 初期1 + カン4回
const URA_OFFSET = 5;

/**
 * ドラ表示牌の「次の牌」(=ドラ) を返す。標準リーチ麻雀の慣例:
 * - 数牌: 1→2→…→9→1 (suit 内で循環)
 * - 風牌: 1z→2z→3z→4z→1z (東南西北で循環)
 * - 三元牌: 5z→6z→7z→5z (白發中で循環)
 */
export function nextTile(id: TileId): TileId {
  if (isWind(id)) return `${(numberOf(id) % 4) + 1}z` as TileId; // 1z..4z 循環
  if (isDragon(id)) return `${((numberOf(id) - 5 + 1) % 3) + 5}z` as TileId; // 5z..7z 循環
  return `${(numberOf(id) % 9) + 1}${suitOf(id)}` as TileId; // 数牌 9→1
}

/** 牌ID列に含まれるドラの総数 (=飜)。indicatorIds は「表示牌」(ドラはその次の牌) */
export function countDoraHan(tileIds: TileId[], indicatorIds: TileId[]): number {
  let han = 0;
  for (const ind of indicatorIds) {
    const dora = nextTile(ind);
    for (const id of tileIds) if (id === dora) han++;
  }
  return han;
}

/** 公開済みの表ドラ表示牌 (deadWall[0..revealedCount-1]、上限 MAX_DORA_INDICATORS) */
export function doraIndicators(deadWall: Tile[], revealedCount: number): Tile[] {
  return deadWall.slice(0, Math.min(revealedCount, MAX_DORA_INDICATORS));
}

/** 裏ドラ表示牌 (★リーチ機能用の予約API。現状は未公開・未使用) */
export function uraDoraIndicators(deadWall: Tile[], revealedCount: number): Tile[] {
  const n = Math.min(revealedCount, MAX_DORA_INDICATORS);
  return deadWall.slice(URA_OFFSET, URA_OFFSET + n);
}
