import type { TileId, WinForm, YakuResult } from "../types";
import { TILE_KIND_COUNT, counts34, mpszToTiles } from "../tiles";
import { AWS_YAKU_KIND, type AwsYakuKind } from "./aws-classification";
import yakuData from "../data/yaku.json";

export interface YakuJsonEntry {
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

export const YAKU_LIST: YakuJsonEntry[] = (yakuData as YakuJsonShape).yakus;

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

    // hanOpen=null は「門前限定」の意味 (yaku.json の規約)。鳴き手では不成立
    if (!ctx.isMenzen && entry.hanOpen === null) continue;
    const han = ctx.isMenzen ? entry.han : entry.hanOpen!;
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

// sample 文字列は yaku.json 由来で不変 (~25個)。mpszToTiles + counts34 の再パースを毎回やると
// detectAwsYakus がホットパス (CPU 鳴き判断) の最深ループで増幅するため、モジュールロード時に1度だけ前計算する。
const SAMPLE_COUNTS = new Map<string, Int8Array>();
// 七対子サンプル "AA-BB-CC-..." → ソート済み first-tile 列。matchesSevenPairsSample の再パース回避。
const SEVEN_PAIRS_SAMPLE = new Map<string, TileId[] | null>();

function sampleCountsOf(sample: string): Int8Array {
  let counts = SAMPLE_COUNTS.get(sample);
  if (counts === undefined) {
    counts = counts34(mpszToTiles(sample));
    SAMPLE_COUNTS.set(sample, counts);
  }
  return counts;
}

function matchesCountSuperset(handCounts: Int8Array, sample: string): boolean {
  const sampleCounts = sampleCountsOf(sample);
  for (let i = 0; i < TILE_KIND_COUNT; i++) {
    if (handCounts[i]! < sampleCounts[i]!) return false;
  }
  return true;
}

// 七対子: サンプル形式 "AA-BB-CC-..." と手の対子集合が一致するか
const SEVEN_PAIRS_COUNT = 7;

// sample をソート済み first-tile 列に変換 (不正形式は null)。前計算テーブルに乗せる。
function sevenPairsSampleTiles(sample: string): TileId[] | null {
  let tiles = SEVEN_PAIRS_SAMPLE.get(sample);
  if (tiles === undefined) {
    const segments = sample.split("-");
    if (segments.length !== SEVEN_PAIRS_COUNT) {
      tiles = null;
    } else {
      const firstTiles = segments.map((seg) => mpszToTiles(seg)[0]);
      tiles = firstTiles.some((t) => t === undefined)
        ? null
        : [...(firstTiles as TileId[])].sort();
    }
    SEVEN_PAIRS_SAMPLE.set(sample, tiles);
  }
  return tiles;
}

function matchesSevenPairsSample(handPairs: TileId[], sample: string): boolean {
  if (handPairs.length !== SEVEN_PAIRS_COUNT) return false;
  const b = sevenPairsSampleTiles(sample);
  if (b === null) return false;
  const a = [...handPairs].sort();
  return a.every((t, i) => t === b[i]);
}

// モジュールロード時に全 sample を前計算 (役牌 kind ごとに seven-pairs / count-superset を振り分け)。
for (const entry of YAKU_LIST) {
  const kind = AWS_YAKU_KIND[entry.id];
  if (!kind) continue;
  for (const sample of entry.sampleMpszList ?? []) {
    if (kind === "seven-pairs") sevenPairsSampleTiles(sample);
    else sampleCountsOf(sample);
  }
}
