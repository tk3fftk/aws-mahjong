import type { Tile, TileId, Copy } from "./types";
import { ALL_TILE_IDS } from "./tiles";

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
    for (let c = 0; c < 4; c++) {
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
  remainingWall: Tile[];
}

/**
 * 4人配牌を山先頭から実施し、east=14枚 (親)、south=13枚 (子) を返す。
 * 西家・北家分の計26枚は捨てる (空席扱い)。残り山は標準麻雀と同じ感覚で
 * 親の初ツモ済みの状態 (=山残り83枚) になる。
 */
export function dealInitialHands(wall: Tile[]): DealtHands {
  const work = [...wall];
  const seats: [Tile[], Tile[], Tile[], Tile[]] = [[], [], [], []]; // east, south, west, north
  // 4-4-4: 各家に4枚ずつを3周配る
  for (let round = 0; round < 3; round++) {
    for (let s = 0; s < 4; s++) {
      for (let k = 0; k < 4; k++) seats[s]!.push(work.shift()!);
    }
  }
  // 最後の1巡: 各家に1枚ずつ
  for (let s = 0; s < 4; s++) seats[s]!.push(work.shift()!);
  // 親の初ツモ (14枚目)
  seats[0]!.push(work.shift()!);

  return { east: seats[0]!, south: seats[1]!, remainingWall: work };
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
