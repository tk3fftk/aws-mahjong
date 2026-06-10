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
export type Seat = "east" | "south" | "west" | "north";

export interface Player {
  seat: Seat;
  seatWind: SeatWind;
  hand: Tile[]; // 純手牌のみ。打牌待ちは 13 - 3*melds.length + 1 枚
  melds: CalledMeld[];
  discards: Tile[]; // 河の表示用。鳴かれた牌は取り除かれ副露側へ移る
  discardedIds: TileId[]; // フリテン用の全打牌履歴 (鳴かれても消えない)
  isHuman: boolean;
  isDealer: boolean;
  score: number;
}

export type Phase =
  | "deal"
  | "discard"
  | "claim" // 人間にクレーム (ロン/ポン/カン/チー) の選択肢があり応答待ち
  | "win"
  | "draw_game"
  | "round_end";

export type ClaimKind = "ron" | "kan" | "pon" | "chi";

// 人間 (east) に提示するクレーム選択肢
export interface ClaimOffers {
  ron: boolean;
  kan: boolean; // 明槓
  pon: boolean;
  chi: ChiVariant[]; // 上家からの打牌のみ非空になり得る
}

export interface CpuClaim {
  seat: Seat;
  kind: ClaimKind;
  chiTiles?: [Tile, Tile];
}

export interface ClaimState {
  discarder: Seat;
  tile: Tile; // 打たれた牌
  offers: ClaimOffers;
  cpuClaim: CpuClaim | null; // 人間がパスしたら実行する CPU 側最優先クレーム
}

// 自分の手番中に宣言できるカン
export interface SelfKanOption {
  kind: "ankan" | "kakan";
  tileId: TileId;
}

export interface GameState {
  wall: Tile[]; // ライブ壁 (配牌後 69枚)。0 で流局
  deadWall: Tile[]; // 王牌14枚 (ドラ未実装の将来予約。参照されない)
  players: Record<Seat, Player>;
  turn: Seat;
  roundWind: SeatWind;
  roundIndex: number;
  phase: Phase;
  lastDrawTile: Tile | null; // ツモ直後のみ非 null。鳴き後の打牌待ちでは null
  lastDiscard: { seat: Seat; tile: Tile } | null; // 直前打牌のハイライト用
  claim: ClaimState | null; // phase==="claim" のときのみ非 null
  selfKanOptions: SelfKanOption[]; // 人間の手番中の暗槓/加槓候補
  canTsumo: boolean; // 人間がツモ和了宣言できるか (UI のボタン活性用)
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
  loserSeat: Seat | null; // ロン時の放銃者。ツモは null
  hand: Tile[]; // 純手牌 + 和了牌
  melds: CalledMeld[];
  yakus: YakuResult[];
  totalHan: number;
  isYakuman: boolean;
  score: number; // 勝者の獲得合計
  payments: Array<{ seat: Seat; delta: number }>; // 勝者 +、支払者 −
}
