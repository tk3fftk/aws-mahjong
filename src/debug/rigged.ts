import type { Copy, Seat, Tile, TileId } from "../types";
import { ALL_TILE_IDS, mpszToTiles } from "../tiles";

const ALL_SEATS: Seat[] = ["east", "south", "west", "north"];

// dealInitialHands の配り順 (4枚×3周 + 1枚ずつ + 親の初ツモ) における各席の取得位置。
// east の最終要素 (52) が親の初ツモで、手牌の末尾に置かれる。
const DEAL_INDICES: Record<Seat, number[]> = {
  east: [0, 1, 2, 3, 16, 17, 18, 19, 32, 33, 34, 35, 48, 52],
  south: [4, 5, 6, 7, 20, 21, 22, 23, 36, 37, 38, 39, 49],
  west: [8, 9, 10, 11, 24, 25, 26, 27, 40, 41, 42, 43, 50],
  north: [12, 13, 14, 15, 28, 29, 30, 31, 44, 45, 46, 47, 51],
};
const WALL_START = 53;
// 53(配牌+初ツモ) + 69(ライブ壁) = index 122..135 が王牌、121 がリンシャン1枚目
const DEAD_WALL_START = 122;
const LIVE_WALL_END = 121;

export interface RiggedDeal {
  east?: string; // 14枚 (末尾 = 親の初ツモ)。省略時はプール順
  south?: string; // 各13枚
  west?: string;
  north?: string;
  wallHead?: string; // ライブ壁の先頭に並べる牌
  deadWall?: string; // 王牌の先頭から並べる (先頭 = ドラ表示牌1枚目)。最大14枚
  wallEnd?: string; // ライブ壁の末尾から並べる (先頭 = 最初のリンシャン牌)
}

/** 各席の配牌とライブ壁先頭を指定した仕込み壁 (136枚) を作る。残りはプール順で埋める */
export function riggedDeal(spec: RiggedDeal): Tile[] {
  // copy-major 順 (copy0 の34種 → copy1 の34種 → ...)。
  // 未指定席の手牌に同一牌4枚が固まって CPU が暗槓してしまうのを防ぐ
  const pool: Tile[] = [];
  for (let c = 0; c < 4; c++) {
    for (const id of ALL_TILE_IDS) pool.push({ id, copy: c as Copy });
  }
  const take = (id: TileId): Tile => {
    const i = pool.findIndex((t) => t.id === id);
    if (i < 0) throw new Error(`pool exhausted for ${id}`);
    return pool.splice(i, 1)[0]!;
  };
  const wall: (Tile | null)[] = new Array(136).fill(null);
  for (const seat of ALL_SEATS) {
    const mpsz = spec[seat];
    if (!mpsz) continue;
    const ids = mpszToTiles(mpsz);
    if (ids.length !== DEAL_INDICES[seat].length) {
      throw new Error(`${seat} hand must be ${DEAL_INDICES[seat].length} tiles`);
    }
    DEAL_INDICES[seat].forEach((idx, i) => {
      wall[idx] = take(ids[i]!);
    });
  }
  if (spec.wallHead) {
    mpszToTiles(spec.wallHead).forEach((id, i) => {
      wall[WALL_START + i] = take(id);
    });
  }
  if (spec.deadWall) {
    mpszToTiles(spec.deadWall).forEach((id, i) => {
      wall[DEAD_WALL_START + i] = take(id);
    });
  }
  if (spec.wallEnd) {
    mpszToTiles(spec.wallEnd).forEach((id, i) => {
      wall[LIVE_WALL_END - i] = take(id);
    });
  }
  for (let i = 0; i < wall.length; i++) {
    if (wall[i] === null) wall[i] = pool.shift()!;
  }
  return wall as Tile[];
}
