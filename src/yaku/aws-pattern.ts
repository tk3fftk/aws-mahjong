import type { TileId, WinForm, YakuResult } from "../types";
import { counts34, mpszToTiles } from "../tiles";
import { AWS_YAKU_KIND, type AwsYakuKind } from "./aws-classification";
import yakuData from "../data/yaku.json";

interface YakuJsonEntry {
  id: string;
  name: string;
  han: number;
  hanOpen: number | null;
  isPonAllowed?: boolean;
  isChiAllowed?: boolean;
  isCombineAllowed?: boolean;
  sampleMpszList?: string[];
  description?: string[] | string;
}

interface YakuJsonShape {
  yakus: YakuJsonEntry[];
}

const YAKU_LIST: YakuJsonEntry[] = (yakuData as YakuJsonShape).yakus;

export interface AwsPatternContext {
  isMenzen: boolean;
}

/**
 * 与えられた和了形に対し、yaku.json の AWS固有役のうち成立するものを返す。
 *
 * `isCombineAllowed=false` は yaku.json の各役 description より「標準麻雀の
 * 対応役 (例: Kiro vs 白, AWS一盃口 vs 標準一盃口) と複合しない」の意味で、
 * AWS固有役どうしは原則として重複加算可。
 * 標準対応との衝突 (kiro/cost-explorer/iam ↔ 白/發/中) は `standard.ts` 側で
 * 5z/6z/7z 刻子の役牌判定をスキップすることで回避済み。
 */
export function detectAwsYakus(
  handTiles: TileId[],
  winForm: WinForm,
  ctx: AwsPatternContext,
): YakuResult[] {
  const handCounts = counts34(handTiles);
  const results: YakuResult[] = [];

  for (const entry of YAKU_LIST) {
    const kind = AWS_YAKU_KIND[entry.id];
    if (!kind) continue;

    if (!matchesAny(entry, kind, handCounts, winForm)) continue;

    const han = ctx.isMenzen ? entry.han : entry.hanOpen ?? entry.han;
    results.push({ id: entry.id, name: entry.name, han });
  }

  return results;
}

function matchesAny(
  entry: YakuJsonEntry,
  kind: AwsYakuKind,
  handCounts: Int8Array,
  winForm: WinForm,
): boolean {
  const samples = entry.sampleMpszList ?? [];
  for (const sample of samples) {
    if (kind === "seven-pairs") {
      if (winForm.kind === "seven-pairs" && matchesSevenPairsSample(winForm.pairs, sample)) {
        return true;
      }
    } else {
      // completed-meld / tile-superset / repeated-superset すべて
      // 「サンプル牌の枚数 ≤ 手牌の枚数」 を 34要素配列で照合する。
      if (matchesCountSuperset(handCounts, sample)) {
        return true;
      }
    }
  }
  return false;
}

function matchesCountSuperset(handCounts: Int8Array, sample: string): boolean {
  const sampleCounts = counts34(mpszToTiles(sample));
  for (let i = 0; i < 34; i++) {
    if (handCounts[i]! < sampleCounts[i]!) return false;
  }
  return true;
}

function matchesSevenPairsSample(handPairs: TileId[], sample: string): boolean {
  if (handPairs.length !== 7) return false;
  const segments = sample.split("-");
  if (segments.length !== 7) return false;
  const sampleFirstTile = segments.map((seg) => {
    const tiles = mpszToTiles(seg);
    return tiles[0];
  });
  if (sampleFirstTile.some((t) => t === undefined)) return false;
  const a = [...handPairs].sort();
  const b = [...(sampleFirstTile as TileId[])].sort();
  return a.every((t, i) => t === b[i]);
}
