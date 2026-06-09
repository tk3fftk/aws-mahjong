import type { Decomposition, Meld, TileId } from "../types";
import {
  TILE_KIND_COUNT,
  canStartSequenceAt,
  counts34,
  indexToTileId,
  sortTileIds,
} from "../tiles";

// 標準形 (4面子1雀頭) の和了牌枚数
export const HAND_SIZE_WIN = 14;
// 標準形の面子数
const MELDS_PER_HAND = 4;
// 刻子は同種3枚
const PON_SIZE = 3;
// 雀頭は同種2枚
const PAIR_SIZE = 2;

/**
 * 14枚の牌(ソート不問)を4面子1雀頭の標準形に分解する。
 * 成功した分解パターンをすべて返す(平和判定で全順子かを見るために複数解必要)。
 * 分解不能なら空配列。
 */
export function decomposeStandard(tileIds: TileId[]): Decomposition[] {
  if (tileIds.length !== HAND_SIZE_WIN) return [];
  const counts = counts34(tileIds);
  const found: Decomposition[] = [];

  for (let pairIdx = 0; pairIdx < TILE_KIND_COUNT; pairIdx++) {
    if (counts[pairIdx]! < PAIR_SIZE) continue;
    counts[pairIdx]! -= PAIR_SIZE;
    const pair: Meld = {
      kind: "pair",
      tiles: [indexToTileId(pairIdx), indexToTileId(pairIdx)],
    };
    const melds: Meld[] = [];
    if (tryDecomposeMelds(counts, 0, melds)) {
      found.push({ melds: melds.map(cloneMeld), pair });
    }
    counts[pairIdx]! += PAIR_SIZE;
  }

  return dedupe(found);
}

function tryDecomposeMelds(counts: Int8Array, start: number, melds: Meld[]): boolean {
  let i = start;
  while (i < TILE_KIND_COUNT && counts[i]! === 0) i++;
  if (i >= TILE_KIND_COUNT) return melds.length === MELDS_PER_HAND;
  if (melds.length === MELDS_PER_HAND) return false;

  // 刻子
  if (counts[i]! >= PON_SIZE) {
    counts[i]! -= PON_SIZE;
    const id = indexToTileId(i);
    melds.push({ kind: "pon", tiles: [id, id, id] });
    if (tryDecomposeMelds(counts, i, melds)) return true;
    melds.pop();
    counts[i]! += PON_SIZE;
  }

  // 順子 (数牌のみ・同種suit内のみ)。canStartSequenceAt が両条件を集約。
  if (canStartSequenceAt(i) && counts[i + 1]! >= 1 && counts[i + 2]! >= 1) {
    counts[i]!--;
    counts[i + 1]!--;
    counts[i + 2]!--;
    melds.push({
      kind: "chi",
      tiles: [indexToTileId(i), indexToTileId(i + 1), indexToTileId(i + 2)],
    });
    if (tryDecomposeMelds(counts, i, melds)) return true;
    melds.pop();
    counts[i]!++;
    counts[i + 1]!++;
    counts[i + 2]!++;
  }

  return false;
}

function cloneMeld(m: Meld): Meld {
  return { kind: m.kind, tiles: [...m.tiles] };
}

function dedupe(items: Decomposition[]): Decomposition[] {
  const seen = new Set<string>();
  const out: Decomposition[] = [];
  for (const d of items) {
    const key = canonicalKey(d);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

function canonicalKey(d: Decomposition): string {
  const meldKeys = d.melds
    .map((m) => `${m.kind}:${sortTileIds(m.tiles).join(",")}`)
    .sort();
  const pairKey = `pair:${d.pair.tiles[0]}`;
  return `${pairKey}|${meldKeys.join("|")}`;
}
