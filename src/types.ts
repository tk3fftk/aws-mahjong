export type Suit = "m" | "p" | "s" | "z";

export type NumberTileId =
  | `1${"m" | "p" | "s"}`
  | `2${"m" | "p" | "s"}`
  | `3${"m" | "p" | "s"}`
  | `4${"m" | "p" | "s"}`
  | `5${"m" | "p" | "s"}`
  | `6${"m" | "p" | "s"}`
  | `7${"m" | "p" | "s"}`
  | `8${"m" | "p" | "s"}`
  | `9${"m" | "p" | "s"}`;
export type HonorTileId = "1z" | "2z" | "3z" | "4z" | "5z" | "6z" | "7z";
export type TileId = NumberTileId | HonorTileId;

export type Copy = 0 | 1 | 2 | 3;
export interface Tile {
  id: TileId;
  copy: Copy;
}

export type SeatWind = "1z" | "2z" | "3z" | "4z";
export type Seat = "east" | "south";

export interface Player {
  seat: Seat;
  seatWind: SeatWind;
  hand: Tile[];
  discards: Tile[];
  isHuman: boolean;
  isDealer: boolean;
  score: number;
}

export type Phase =
  | "deal"
  | "discard"
  | "draw"
  | "win"
  | "draw_game"
  | "round_end";

export interface GameState {
  wall: Tile[];
  players: Record<Seat, Player>;
  turn: Seat;
  roundWind: SeatWind;
  roundIndex: number;
  phase: Phase;
  lastDrawTile: Tile | null;
  winInfo: WinInfo | null;
}

export type MeldKind = "chi" | "pon" | "pair";
export interface Meld {
  kind: MeldKind;
  tiles: TileId[];
}

// 卓上に晒した副露。分解結果の Meld (chi|pon|pair) とは語彙が違うため別型にする。
export type CalledMeldKind = "chi" | "pon" | "minkan" | "ankan" | "kakan";
export interface CalledMeld {
  kind: CalledMeldKind;
  tiles: Tile[]; // chi/pon=3枚, kan系=4枚 (鳴いた牌を含む)
  calledFrom: Seat | null; // 打牌者。ankan は null (kakan は元ポンの相手)
  calledTile: Tile | null; // 鳴いた牌 (UI ハイライト用)。ankan は null
}

// winning/ 層は副露の出所に依存しないよう構造的部分型で受ける
export type MeldLike = Pick<CalledMeld, "kind" | "tiles">;

// チーで手牌から出す2枚の候補 (例: 5m 鳴きに 3m4m / 4m6m / 6m7m)
export interface ChiVariant {
  tiles: [Tile, Tile];
}

export interface Decomposition {
  melds: Meld[];
  pair: Meld;
}

export type WinForm =
  | { kind: "standard"; decompositions: Decomposition[] }
  | { kind: "seven-pairs"; pairs: TileId[] }
  | { kind: "thirteen-orphans" };

export interface YakuResult {
  id: string;
  name: string;
  han: number;
}

export interface WinInfo {
  winner: Seat;
  isTsumo: boolean;
  hand: Tile[];
  yakus: YakuResult[];
  totalHan: number;
  isYakuman: boolean;
  score: number;
}
