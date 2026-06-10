import type { Tile, TileId, Copy } from "./types";
import { ALL_TILE_IDS } from "./tiles";

// 同種牌が何枚あるか (麻雀標準: 各種4枚 = 4コピー)
const TILE_COPIES_PER_KIND = 4;
// 標準麻雀の席数 (2人対戦でも 4人配牌を流用するため4)
const NUM_SEATS = 4;
// 配牌の4-4-4 = 3周
const INITIAL_DEAL_ROUNDS = 3;
// 1周あたり各家に配る枚数
const TILES_PER_DEAL_ROUND = 4;

export type RNG = () => number;

/**
 * Mulberry32 PRNG. seed 値を変えると別の系列が得られ、テストでは固定 seed
 * で再現性を確保する。
 */
export function mulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 34種 × 4枚 = 136枚の山を Fisher-Yates でシャッフルして返す。
 */
export function buildWall(rng: RNG): Tile[] {
  const tiles: Tile[] = [];
  for (const id of ALL_TILE_IDS) {
    for (let c = 0; c < TILE_COPIES_PER_KIND; c++) {
      tiles.push({ id, copy: c as Copy });
    }
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = tiles[i]!;
    tiles[i] = tiles[j]!;
    tiles[j] = tmp;
  }
  return tiles;
}

export interface DealtHands {
  east: Tile[];
  south: Tile[];
  west: Tile[];
  north: Tile[];
  remainingWall: Tile[];
}

/**
 * 4人配牌を山先頭から実施し、east=14枚 (親・初ツモ込み)、他3家=各13枚を返す。
 * 残り山は親の初ツモ済みの状態 (=83枚)。王牌の分離は splitDeadWall で行う。
 */
export function dealInitialHands(wall: Tile[]): DealtHands {
  const work = [...wall];
  const seats: [Tile[], Tile[], Tile[], Tile[]] = [[], [], [], []]; // east, south, west, north
  // 4-4-4: 各家に TILES_PER_DEAL_ROUND 枚ずつを INITIAL_DEAL_ROUNDS 周配る
  for (let round = 0; round < INITIAL_DEAL_ROUNDS; round++) {
    for (let s = 0; s < NUM_SEATS; s++) {
      for (let k = 0; k < TILES_PER_DEAL_ROUND; k++) seats[s]!.push(work.shift()!);
    }
  }
  // 最後の1巡: 各家に1枚ずつ
  for (let s = 0; s < NUM_SEATS; s++) seats[s]!.push(work.shift()!);
  // 親の初ツモ (14枚目)
  seats[0]!.push(work.shift()!);

  return {
    east: seats[0]!,
    south: seats[1]!,
    west: seats[2]!,
    north: seats[3]!,
    remainingWall: work,
  };
}

// 王牌 (デッドウォール) の枚数。ドラ表示は未実装だが将来の予約として標準の14枚を確保する
export const DEAD_WALL_SIZE = 14;

export interface WallSplit {
  liveWall: Tile[];
  deadWall: Tile[];
}

/** 配牌後の山の末尾 DEAD_WALL_SIZE 枚を王牌として分離する */
export function splitDeadWall(wall: Tile[]): WallSplit {
  const cut = Math.max(0, wall.length - DEAD_WALL_SIZE);
  return { liveWall: wall.slice(0, cut), deadWall: wall.slice(cut) };
}

export interface DrawResult {
  tile: Tile | null;
  remainingWall: Tile[];
}

export function drawFromWall(wall: Tile[]): DrawResult {
  if (wall.length === 0) return { tile: null, remainingWall: wall };
  const [tile, ...rest] = wall;
  return { tile: tile!, remainingWall: rest };
}

/** 山の末尾から1枚ツモる (カン後のリンシャンツモ用) */
export function drawFromWallEnd(wall: Tile[]): DrawResult {
  if (wall.length === 0) return { tile: null, remainingWall: wall };
  return { tile: wall[wall.length - 1]!, remainingWall: wall.slice(0, -1) };
}
