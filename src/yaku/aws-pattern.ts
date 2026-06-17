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
  // 宣言された AWSカン副露に対応する役 ID。これらは牌構成ではなく宣言の有無で付与する。
  declaredAwsKanYakuIds?: string[];
}

// AWSカン宣言で初めて成立する「カン」系役。牌構成からは自動検出しない (宣言ゲート化)。
export const AWS_KAN_YAKU_IDS: ReadonlySet<string> = new Set([
  "cicd-pipeline-kan",
  "web-application-kan",
  "blue-green-deploy-kan",
]);

const YAKU_BY_ID = new Map(YAKU_LIST.map((e) => [e.id, e]));

/**
 * 与えられた和了形に対し、yaku.json の AWS固有役のうち成立するものを返す。
 *
 * `isCombineAllowed=false` は yaku.json の各役 description より「標準麻雀の
 * 対応役 (例: Kiro vs 白, AWS一盃口 vs 標準一盃口) と複合しない」の意味で、
 * AWS固有役どうしは原則として重複加算可。
 * 標準対応との衝突 (kiro/cost-explorer/iam ↔ 白/發/中) は `standard.ts` 側で
 * 5z/6z/7z 刻子の役牌判定をスキップすることで回避済み。
 *
 * カン系役 (AWS_KAN_YAKU_IDS) は牌構成からは検出せず、ctx.declaredAwsKanYakuIds
 * (宣言された AWSカン) に含まれるものだけを付与する。
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
    // カン系役は宣言ベース。牌構成照合からは除外する
    if (AWS_KAN_YAKU_IDS.has(entry.id)) continue;

    if (!matchesAny(entry, kind, handCounts, winForm)) continue;

    // hanOpen=null は「門前限定」の意味 (yaku.json の規約)。鳴き手では不成立
    if (!ctx.isMenzen && entry.hanOpen === null) continue;
    const han = ctx.isMenzen ? entry.han : entry.hanOpen!;
    results.push({ id: entry.id, name: entry.name, han });
  }

  // 宣言された AWSカン役を付与 (重複排除)。menzen/hanOpen を尊重する
  for (const id of new Set(ctx.declaredAwsKanYakuIds ?? [])) {
    const entry = YAKU_BY_ID.get(id);
    if (!entry || !AWS_KAN_YAKU_IDS.has(id)) continue;
    if (!ctx.isMenzen && entry.hanOpen === null) continue;
    const han = ctx.isMenzen ? entry.han : entry.hanOpen!;
    results.push({ id: entry.id, name: entry.name, han });
  }

  return resolveAwsSubsumption(results);
}

/**
 * AWSカン副露の4枚が、どのカン系役 (AWS_KAN_YAKU_IDS) のサンプルに一致するかを返す。
 * variant を含めて照合 (例: web-application-kan は 3p2m7s9s / 3p3m7s9s)。不一致は null。
 */
export function awsKanYakuIdForTiles(tiles: TileId[]): string | null {
  const counts = counts34(tiles);
  for (const id of AWS_KAN_YAKU_IDS) {
    const entry = YAKU_BY_ID.get(id);
    if (!entry) continue;
    for (const sample of entry.sampleMpszList ?? []) {
      if (matchesCountSuperset(counts, sample)) return id;
    }
  }
  return null;
}

/** 手牌にカン系役の全構成牌がそろっている候補を列挙する (AWSカン宣言の選択肢用)。 */
export function detectAwsKanCandidates(
  handTiles: TileId[],
): Array<{ yakuId: string; tileIds: TileId[] }> {
  const counts = counts34(handTiles);
  const out: Array<{ yakuId: string; tileIds: TileId[] }> = [];
  for (const id of AWS_KAN_YAKU_IDS) {
    const entry = YAKU_BY_ID.get(id);
    if (!entry) continue;
    for (const sample of entry.sampleMpszList ?? []) {
      if (matchesCountSuperset(counts, sample)) {
        out.push({ yakuId: id, tileIds: mpszToTiles(sample) });
        break; // 同一役は最初に一致した variant のみ
      }
    }
  }
  return out;
}

/**
 * 上位役のサンプル牌が下位役のサンプル牌を完全包含するペアでは、上位役が成立すると
 * 下位役が牌構成上「必ず」自動成立する (例: CI/CDカン 6789p は必ず CI/CDパイプライン 789p を含む)。
 * 両方を加算すると同一構造の二重計上になるため、下位役を抑制し上位役のみ採用する
 * (麻雀の 一盃口/二盃口 が複合しないのと同じ)。
 */
const AWS_SUBSUMED: Record<string, readonly string[]> = {
  // 拡張役 (カン) は下位役の上位版アーキテクチャ。下位役の「代わり」にスコアする
  "cicd-pipeline-kan": ["cicd-pipeline"],
  "web-application-kan": ["web-application", "in-memory-cache"],
  "blue-green-deploy-kan": ["web-application"],
  // 反復役の最高位段は、低位段 (冗長化) と素材役 (マスターレプリカ=777s) を内包する
  "aws-three-concealed-triples1": ["redundancy", "master-replica"],
};

/**
 * 反復役は Webアプリ(3p2m7s) を copies 回作っている。yaku.json の意図
 * (冗長化=Webアプリ×2+一盃口=5飜 / 三暗刻=Webアプリ×3+三暗刻=6飜) に合わせ、
 * 内包される web-application の飜を copies 倍に引き上げる。
 */
const WEB_APP_MULTIPLIER: Record<string, number> = {
  redundancy: 2,
  "aws-three-concealed-triples1": 3,
};

export function resolveAwsSubsumption(results: YakuResult[]): YakuResult[] {
  const present = new Set(results.map((r) => r.id));

  const suppressed = new Set<string>();
  for (const id of present) {
    for (const sub of AWS_SUBSUMED[id] ?? []) suppressed.add(sub);
  }

  // 反復役の最高位段に応じて web-application の飜倍率を決める (×3 が ×2 を上書き)
  let webMult = 1;
  for (const id of present) webMult = Math.max(webMult, WEB_APP_MULTIPLIER[id] ?? 1);

  return results
    .filter((r) => !suppressed.has(r.id))
    .map((r) =>
      r.id === "web-application" && webMult > 1 ? { ...r, han: r.han * webMult } : r,
    );
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
