import type { TileId } from "../types";
import { counts34, indexToTileId, isYaochu } from "../tiles";

const YAOCHU_INDICES: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < 34; i++) {
    if (isYaochu(indexToTileId(i))) out.push(i);
  }
  return out;
})();

/**
 * 七対子: 14枚で 7種類の対子 (同種4枚は不成立とする伝統ルール)。
 */
export function isSevenPairs(tileIds: TileId[]): boolean {
  if (tileIds.length !== 14) return false;
  const counts = counts34(tileIds);
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    const c = counts[i]!;
    if (c === 0) continue;
    if (c !== 2) return false;
    pairs++;
  }
  return pairs === 7;
}

/**
 * 七対子成立時の対子列を返す (七対子判定後に役判定で使う)。
 */
export function sevenPairsTiles(tileIds: TileId[]): TileId[] {
  const counts = counts34(tileIds);
  const out: TileId[] = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i]! > 0) out.push(indexToTileId(i));
  }
  return out;
}

/**
 * 国士無双: 13種の老頭牌をすべて含み、いずれか1種が2枚 (合計14枚)。
 */
export function isThirteenOrphans(tileIds: TileId[]): boolean {
  if (tileIds.length !== 14) return false;
  const counts = counts34(tileIds);
  for (let i = 0; i < 34; i++) {
    const id = indexToTileId(i);
    if (!isYaochu(id) && counts[i]! > 0) return false;
  }
  let hasPair = false;
  for (const idx of YAOCHU_INDICES) {
    const c = counts[idx]!;
    if (c === 0) return false;
    if (c === 2) {
      if (hasPair) return false;
      hasPair = true;
    } else if (c !== 1) {
      return false;
    }
  }
  return hasPair;
}
