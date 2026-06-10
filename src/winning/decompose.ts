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
export const MELDS_PER_HAND = 4;
// 刻子は同種3枚
const PON_SIZE = 3;
// 雀頭は同種2枚
const PAIR_SIZE = 2;

/**
 * meldCount*3+2 枚の牌(ソート不問)を「meldCount 面子 + 1雀頭」の標準形に分解する。
 * 既定は門前14枚 (4面子1雀頭)。副露がある場合は残り面子数を指定する。
 * 成功した分解パターンをすべて返す(平和判定で全順子かを見るために複数解必要)。
 * 分解不能・枚数不一致なら空配列。
 */
export function decomposeStandard(
  tileIds: TileId[],
  meldCount: number = MELDS_PER_HAND,
): Decomposition[] {
  if (tileIds.length !== meldCount * PON_SIZE + PAIR_SIZE) return [];
  const counts = counts34(tileIds);
  const found: Decomposition[] = [];

  for (let pairIdx = 0; pairIdx < TILE_KIND_COUNT; pairIdx++) {
    if (counts[pairIdx]! < PAIR_SIZE) continue;
    counts[pairIdx]! -= PAIR_SIZE;
    const pair: Meld = {
      kind: "pair",
      tiles: [indexToTileId(pairIdx), indexToTileId(pairIdx)],
    };
    // 全分解を列挙する (最初の1つで打ち切ると、刻子優先の探索順により
    // 全順子分解 = 平和形が隠れて飜を取りこぼす)
    collectMeldDecomps(counts, 0, [], meldCount, (melds) => {
      found.push({ melds: melds.map(cloneMeld), pair });
    });
    counts[pairIdx]! += PAIR_SIZE;
  }

  return dedupe(found);
}

function collectMeldDecomps(
  counts: Int8Array,
  start: number,
  melds: Meld[],
  meldCount: number,
  onFound: (melds: Meld[]) => void,
): void {
  let i = start;
  while (i < TILE_KIND_COUNT && counts[i]! === 0) i++;
  if (i >= TILE_KIND_COUNT) {
    if (melds.length === meldCount) onFound(melds);
    return;
  }
  if (melds.length === meldCount) return;

  // 刻子
  if (counts[i]! >= PON_SIZE) {
    counts[i]! -= PON_SIZE;
    const id = indexToTileId(i);
    melds.push({ kind: "pon", tiles: [id, id, id] });
    collectMeldDecomps(counts, i, melds, meldCount, onFound);
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
    collectMeldDecomps(counts, i, melds, meldCount, onFound);
    melds.pop();
    counts[i]!++;
    counts[i + 1]!++;
    counts[i + 2]!++;
  }
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
