import type { Decomposition, Meld, TileId } from "../types";
import { counts34, indexToTileId, sortTileIds } from "../tiles";

/**
 * 14枚の牌(ソート不問)を4面子1雀頭の標準形に分解する。
 * 成功した分解パターンをすべて返す(平和判定で全順子かを見るために複数解必要)。
 * 分解不能なら空配列。
 */
export function decomposeStandard(tileIds: TileId[]): Decomposition[] {
  if (tileIds.length !== 14) return [];
  const counts = counts34(tileIds);
  const found: Decomposition[] = [];

  for (let pairIdx = 0; pairIdx < 34; pairIdx++) {
    if (counts[pairIdx]! < 2) continue;
    counts[pairIdx]! -= 2;
    const pair: Meld = {
      kind: "pair",
      tiles: [indexToTileId(pairIdx), indexToTileId(pairIdx)],
    };
    const melds: Meld[] = [];
    if (tryDecomposeMelds(counts, 0, melds)) {
      found.push({ melds: melds.map(cloneMeld), pair });
    }
    counts[pairIdx]! += 2;
  }

  return dedupe(found);
}

function tryDecomposeMelds(counts: Int8Array, start: number, melds: Meld[]): boolean {
  let i = start;
  while (i < 34 && counts[i]! === 0) i++;
  if (i >= 34) return melds.length === 4;
  if (melds.length === 4) return false;

  // 刻子
  if (counts[i]! >= 3) {
    counts[i]! -= 3;
    const id = indexToTileId(i);
    melds.push({ kind: "pon", tiles: [id, id, id] });
    if (tryDecomposeMelds(counts, i, melds)) return true;
    melds.pop();
    counts[i]! += 3;
  }

  // 順子(数牌のみ・同種suit内のみ)
  if (i < 27) {
    const n = (i % 9) + 1;
    if (n <= 7 && counts[i + 1]! >= 1 && counts[i + 2]! >= 1) {
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
