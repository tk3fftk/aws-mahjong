import type { Decomposition, Meld, SeatWind, TileId, YakuResult } from "../types";
import { isDragon, isHonor, isWind, isYaochu, numberOf, suitOf } from "../tiles";
import type { WaitShape } from "../fu";

export interface YakuContext {
  isTsumo: boolean;
  isMenzen: boolean;
  seatWind: SeatWind;
  roundWind: SeatWind;
}

/**
 * 標準形 (4面子1雀頭) の分解1つに対して、標準麻雀の役を判定する。
 * AWS固有役 (5z/6z/7z 刻子 = kiro/cost-explorer/iam) は aws-pattern.ts 側で
 * 判定するため、ここではスキップする (重複付与防止)。
 * waitShape は和了牌の待ち形 (平和の両面待ち条件に使う)。
 * null = 待ち形不問 (和了牌が確定しない適格性チェック専用パス互換)。
 */
export function judgeStandardYakus(
  decomp: Decomposition,
  ctx: YakuContext,
  waitShape: WaitShape | null = null,
): YakuResult[] {
  const out: YakuResult[] = [];
  const tiles = collectAllTiles(decomp);

  // 門前清自摸和
  if (ctx.isMenzen && ctx.isTsumo) {
    out.push({ id: "menzen-tsumo", name: "門前清自摸和", han: 1 });
  }

  // 平和: 4面子すべて順子 + 雀頭が役牌でない (場風/自風/三元牌 以外) + 両面待ち
  if (
    ctx.isMenzen &&
    decomp.melds.every((m) => m.kind === "chi") &&
    !isYakuhaiPair(decomp.pair, ctx) &&
    (waitShape === null || waitShape === "ryanmen")
  ) {
    out.push({ id: "pinfu", name: "平和", han: 1 });
  }

  // 断么九: 全14牌が 2-8 数牌
  if (tiles.every((t) => !isYaochu(t))) {
    out.push({ id: "tanyao", name: "断么九", han: 1 });
  }

  // 風牌 (場風・自風): 1z/2z/3z/4z の刻子で、場風 or 自風と一致する場合
  for (const m of decomp.melds) {
    if (m.kind !== "pon") continue;
    const id = m.tiles[0]!;
    if (!isWind(id)) continue;
    if (id === ctx.roundWind) {
      out.push({ id: "round-wind", name: `場風 (${windName(id)})`, han: 1 });
    }
    if (id === ctx.seatWind) {
      out.push({ id: "seat-wind", name: `自風 (${windName(id)})`, han: 1 });
    }
  }

  // 対々和: 全4面子が刻子
  if (decomp.melds.every((m) => m.kind === "pon")) {
    out.push({ id: "toitoi", name: "対々和", han: 2 });
  }

  // 一盃口: 同一順子が2組 (門前限定・1飜)。chi tiles は低→高順で格納済みのため join で比較可。
  // 2組対が2ペアある場合は二盃口 (未実装) のためスキップ。
  if (ctx.isMenzen) {
    const chiKeys = decomp.melds
      .filter((m) => m.kind === "chi")
      .map((m) => m.tiles.join(","));
    const keyCounts = new Map<string, number>();
    for (const k of chiKeys) keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
    const duplicatePairs = [...keyCounts.values()].filter((c) => c >= 2).length;
    if (duplicatePairs === 1) {
      out.push({ id: "iipeiko", name: "一盃口", han: 1 });
    }
  }

  // 混一色 / 清一色 (排他: 清一色採用時は混一色を付けない)
  const suits = new Set(tiles.map((t) => suitOf(t)));
  const numberSuits = [...suits].filter((s) => s !== "z");
  const hasHonor = suits.has("z");
  if (numberSuits.length === 1) {
    if (!hasHonor) {
      out.push({
        id: "chinitsu",
        name: "清一色",
        han: ctx.isMenzen ? 6 : 5,
      });
    } else {
      out.push({
        id: "honitsu",
        name: "混一色",
        han: ctx.isMenzen ? 3 : 2,
      });
    }
  }

  return out;
}

function collectAllTiles(d: Decomposition): TileId[] {
  return [...d.melds.flatMap((m) => m.tiles), ...d.pair.tiles];
}

function isYakuhaiPair(pair: Meld, ctx: YakuContext): boolean {
  const id = pair.tiles[0]!;
  if (isDragon(id)) return true;
  if (id === ctx.roundWind) return true;
  if (id === ctx.seatWind) return true;
  return false;
}

function windName(id: TileId): string {
  switch (id) {
    case "1z": return "東";
    case "2z": return "南";
    case "3z": return "西";
    case "4z": return "北";
    default: return id;
  }
}

export function isHonorMeld(m: Meld): boolean {
  return isHonor(m.tiles[0]!);
}

export function isTerminalMeld(m: Meld): boolean {
  const id = m.tiles[0]!;
  if (isHonor(id)) return false;
  if (m.kind === "pon") return numberOf(id) === 1 || numberOf(id) === 9;
  // chi: 順子なので 1-3 or 7-9 を含むか
  const nums = m.tiles.map((t) => numberOf(t));
  return nums.includes(1) || nums.includes(9);
}
