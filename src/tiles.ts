import type { TileId, Tile, Suit } from "./types";

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
    for (let n = 1; n <= 9; n++) out.push(`${n}${s}` as TileId);
  }
  for (let n = 1; n <= 7; n++) out.push(`${n}z` as TileId);
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
  // 0..33: 1m=0..9m=8, 1p=9..9p=17, 1s=18..9s=26, 1z=27..7z=33
  const s = suitOf(id);
  const n = numberOf(id);
  if (s === "m") return n - 1;
  if (s === "p") return 9 + n - 1;
  if (s === "s") return 18 + n - 1;
  return 27 + n - 1;
}

export function indexToTileId(idx: number): TileId {
  return ALL_TILE_IDS[idx]!;
}

export function counts34(ids: TileId[]): Int8Array {
  const out = new Int8Array(34);
  for (const id of ids) {
    const i = tileIdIndex(id);
    out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}
