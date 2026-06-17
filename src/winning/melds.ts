import type { Meld, MeldLike, Tile } from "../types";
import { sortTileIds } from "../tiles";

// 分解・役判定上の面子は常に3枚。カンの4枚目はここで落とす。
// yaku.json の sample に「同一牌4枚」を要求するものは存在しないため (2026-06 検証済み)、
// 4枚目を除外しても照合結果は変わらず、「実効手牌=14枚相当」の不変条件を保てる。
// 将来 yaku.json 更新で4枚要求 sample が入った場合はこの射影の見直しが必要。
// 例外: aws-kan は4枚すべて別牌の AWSパターンなので、下位役・混一/清一の判定に全4枚を渡す
// (全て別牌のため counts34 の各要素 ≤4 の不変条件は保たれる)。
const MELD_TILES_FOR_DECOMP = 3;

/** 副露を分解結果用 Meld に射影する。kan 系は3枚の刻子 (pon) として扱う。aws-kan は4枚保持の専用種別 */
export function toDecompMeld(m: MeldLike): Meld {
  const ids = m.tiles.map((t) => t.id);
  if (m.kind === "chi") {
    return { kind: "chi", tiles: sortTileIds(ids) };
  }
  if (m.kind === "aws-kan") {
    return { kind: "aws-kan", tiles: sortTileIds(ids) };
  }
  return { kind: "pon", tiles: ids.slice(0, MELD_TILES_FOR_DECOMP) };
}

/** 役判定 (AWS パターン照合等) に渡す実効手牌: 純手牌 + 各副露分 (aws-kan は4枚、他は3枚) */
export function effectiveHandTiles(concealed: Tile[], melds: MeldLike[]): Tile[] {
  return [
    ...concealed,
    ...melds.flatMap((m) =>
      m.kind === "aws-kan" ? m.tiles : m.tiles.slice(0, MELD_TILES_FOR_DECOMP),
    ),
  ];
}

/** 門前判定: 副露なし、または暗槓/aws-kan のみなら門前 (aws-kan は自分の手牌から晒す宣言なので門前を保つ) */
export function isMenzenHand(melds: MeldLike[]): boolean {
  return melds.every((m) => m.kind === "ankan" || m.kind === "aws-kan");
}
