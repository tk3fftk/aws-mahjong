import type { TileId, Tile, Suit } from "./types";

// 牌の総種類数 (1m..9m, 1p..9p, 1s..9s, 1z..7z)
export const TILE_KIND_COUNT = 34;

// 数牌1 suit あたりの種類数 (1〜9)
export const NUMBERED_TILES_PER_SUIT = 9;

// 字牌の種類数 (東/南/西/北/白/發/中 = 1z..7z)
export const HONOR_TILE_COUNT = 7;

// counts34 配列における suit の開始 index
//   m: 0..8, p: 9..17, s: 18..26, z: 27..33
export const SUIT_INDEX_OFFSET: Record<Suit, number> = {
  m: 0,
  p: NUMBERED_TILES_PER_SUIT,
  s: NUMBERED_TILES_PER_SUIT * 2,
  z: NUMBERED_TILES_PER_SUIT * 3,
};

// 字牌の開始 index (= 数牌3種ぶん埋まった直後)
export const HONOR_START_INDEX = SUIT_INDEX_OFFSET.z;

// 順子の開始牌として使える最大数 (1m2m3m..7m8m9m が成立、8/9始まりは不可)
export const MAX_SEQUENCE_START_NUMBER = 7;

const SUIT_ORDER: Record<Suit, number> = { m: 0, p: 1, s: 2, z: 3 };

/**
 * mpsz記法 (例: "123m4p5s6z") を TileId の配列に展開する。
 * 区切り '-' や空白は無視する。docs/v2.0.1/search.html の parseMpsz と同等。
 */
export function mpszToTiles(mpsz: string): TileId[] {
  const cleaned = mpsz.replace(/[\s-]/g, "");
  const result: TileId[] = [];
  let buffer: string[] = [];
  for (const ch of cleaned) {
    if (ch >= "0" && ch <= "9") {
      buffer.push(ch);
    } else if (ch === "m" || ch === "p" || ch === "s" || ch === "z") {
      for (const digit of buffer) {
        if (digit === "0") {
          // 赤ドラ表現は MVP では未対応、5扱いで取り込む
          result.push(`5${ch}` as TileId);
        } else {
          result.push(`${digit}${ch}` as TileId);
        }
      }
      buffer = [];
    } else {
      throw new Error(`Invalid mpsz character: ${ch}`);
    }
  }
  if (buffer.length > 0) {
    throw new Error(`Dangling digits in mpsz: ${buffer.join("")}`);
  }
  return result;
}

export function tilesToMpsz(tiles: TileId[]): string {
  const buckets: Record<Suit, number[]> = { m: [], p: [], s: [], z: [] };
  for (const t of tiles) {
    const n = Number(t[0]);
    const s = t[1] as Suit;
    buckets[s].push(n);
  }
  const parts: string[] = [];
  for (const s of ["m", "p", "s", "z"] as Suit[]) {
    if (buckets[s].length > 0) {
      buckets[s].sort((a, b) => a - b);
      parts.push(buckets[s].join("") + s);
    }
  }
  return parts.join("");
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => {
    const sa = SUIT_ORDER[a.id[1] as Suit];
    const sb = SUIT_ORDER[b.id[1] as Suit];
    if (sa !== sb) return sa - sb;
    const na = Number(a.id[0]);
    const nb = Number(b.id[0]);
    if (na !== nb) return na - nb;
    return a.copy - b.copy;
  });
}

export function sortTileIds(ids: TileId[]): TileId[] {
  return [...ids].sort((a, b) => {
    const sa = SUIT_ORDER[a[1] as Suit];
    const sb = SUIT_ORDER[b[1] as Suit];
    if (sa !== sb) return sa - sb;
    return Number(a[0]) - Number(b[0]);
  });
}

export function suitOf(id: TileId): Suit {
  return id[1] as Suit;
}

export function numberOf(id: TileId): number {
  return Number(id[0]);
}

export function isHonor(id: TileId): boolean {
  return suitOf(id) === "z";
}

export function isTerminal(id: TileId): boolean {
  if (isHonor(id)) return false;
  const n = numberOf(id);
  return n === 1 || n === 9;
}

export function isYaochu(id: TileId): boolean {
  return isHonor(id) || isTerminal(id);
}

export function isDragon(id: TileId): boolean {
  // 5z=Kiro(白) / 6z=Cost Explorer(發) / 7z=IAM(中)
  return id === "5z" || id === "6z" || id === "7z";
}

export function isWind(id: TileId): boolean {
  return id === "1z" || id === "2z" || id === "3z" || id === "4z";
}

export const ALL_TILE_IDS: TileId[] = (() => {
  const out: TileId[] = [];
  for (const s of ["m", "p", "s"] as const) {
    for (let n = 1; n <= NUMBERED_TILES_PER_SUIT; n++) out.push(`${n}${s}` as TileId);
  }
  for (let n = 1; n <= HONOR_TILE_COUNT; n++) out.push(`${n}z` as TileId);
  return out;
})();

export const AWS_NAMES: Record<TileId, string> = {
  "1m": "Lambda",
  "2m": "EC2",
  "3m": "ECS",
  "4m": "EC2 Auto Scaling",
  "5m": "Batch",
  "6m": "ECR",
  "7m": "Step Functions",
  "8m": "EventBridge",
  "9m": "SQS",
  "1p": "Direct Connect",
  "2p": "API Gateway",
  "3p": "ELB",
  "4p": "CloudFront",
  "5p": "Route 53",
  "6p": "CloudFormation",
  "7p": "CodeCommit",
  "8p": "CodeBuild",
  "9p": "CodeDeploy",
  "1s": "Storage Gateway",
  "2s": "EFS",
  "3s": "S3",
  "4s": "Bedrock AgentCore",
  "5s": "Bedrock",
  "6s": "SageMaker",
  "7s": "Aurora",
  "8s": "DynamoDB",
  "9s": "ElastiCache",
  "1z": "US-EAST (東)",
  "2z": "AF-SOUTH (南)",
  "3z": "EU-WEST (西)",
  "4z": "AP-NORTHEAST (北)",
  "5z": "Kiro (白)",
  "6z": "Cost Explorer (發)",
  "7z": "IAM (中)",
};

export function tileImageUrl(id: TileId): string {
  const base = typeof import.meta !== "undefined" && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL
    ? (import.meta as { env: { BASE_URL: string } }).env.BASE_URL
    : "/";
  return `${base}assets/tiles/${id}.svg`;
}

export function tileIdIndex(id: TileId): number {
  return SUIT_INDEX_OFFSET[suitOf(id)] + (numberOf(id) - 1);
}

export function indexToTileId(idx: number): TileId {
  return ALL_TILE_IDS[idx]!;
}

/** counts34 配列の index i から牌の数字 (数牌1..9 / 字牌1..7) を取り出す */
export function numberFromIndex(i: number): number {
  if (i >= HONOR_START_INDEX) return i - HONOR_START_INDEX + 1;
  return (i % NUMBERED_TILES_PER_SUIT) + 1;
}

/**
 * index i が「順子の開始位置として有効」かを判定する。
 * 成立条件: (a) 数牌である (字牌では順子不可) かつ (b) 開始数字が 1..7
 * (8 や 9 から始まると 3牌目が次の suit に跨いでしまうため)
 */
export function canStartSequenceAt(i: number): boolean {
  return i < HONOR_START_INDEX && numberFromIndex(i) <= MAX_SEQUENCE_START_NUMBER;
}

export function counts34(ids: TileId[]): Int8Array {
  const out = new Int8Array(TILE_KIND_COUNT);
  for (const id of ids) {
    const i = tileIdIndex(id);
    out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}
