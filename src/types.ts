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
