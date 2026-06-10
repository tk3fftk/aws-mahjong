import type {
  GameState,
  Player,
  Seat,
  SeatWind,
  Tile,
  WinInfo,
} from "./types";
import { sortTiles } from "./tiles";
import { buildWall, dealInitialHands, drawFromWall, mulberry32 } from "./wall";
import { canWin } from "./winning/check";
import { judgeYaku, canDeclareWin } from "./yaku/judge";
import { decideCpuAction } from "./cpu";
import { calcScore } from "./score";

// 各プレイヤーの初期持ち点 (麻雀標準)
const INITIAL_SCORE = 25000;

export interface GameControllerOptions {
  seed?: number;
  onChange?: (state: GameState) => void;
}

export interface TsumoAttempt {
  success: boolean;
  reason?: string;
}

const SEAT_ORDER: Seat[] = ["east", "south"];

const SEAT_WIND: Record<Seat, SeatWind> = {
  east: "1z",
  south: "2z",
};

export class GameController {
  #state: GameState;
  #rng: () => number;
  #onChange: (state: GameState) => void;

  constructor(opts: GameControllerOptions = {}) {
    this.#rng = mulberry32(opts.seed ?? Date.now());
    this.#onChange = opts.onChange ?? (() => {});
    this.#state = createInitialState();
  }

  get state(): GameState {
    return this.#state;
  }

  startNewRound(): void {
    const wall = buildWall(this.#rng);
    const dealt = dealInitialHands(wall);
    const eastInitialDraw = dealt.east[dealt.east.length - 1] ?? null;
    const eastSortedRest = sortTiles(dealt.east.slice(0, -1));
    const eastHand = eastInitialDraw ? [...eastSortedRest, eastInitialDraw] : eastSortedRest;
    this.#state = {
      wall: dealt.remainingWall,
      players: {
        east: makePlayer("east", true, eastHand, this.#state.players.east.score),
        south: makePlayer("south", false, sortTiles(dealt.south), this.#state.players.south.score),
      },
      turn: "east",
      roundWind: "1z",
      roundIndex: 0,
      phase: "discard",
      lastDrawTile: eastInitialDraw,
      winInfo: null,
    };
    this.#emit();
  }

  humanDiscard(index: number): void {
    if (this.#state.phase !== "discard" || this.#state.turn !== "east") return;
    const east = this.#state.players.east;
    if (index < 0 || index >= east.hand.length) return;
    const tile = east.hand[index]!;
    east.hand = east.hand.filter((_, i) => i !== index);
    east.discards.push(tile);
    this.#state.lastDrawTile = null;
    this.#advanceTurn();
    this.#emit();
  }

  // 人間プレイヤーが手牌を手動で並び替える (from の牌を to の位置へ移動)。
  // AWS役判定は順序非依存なので、これは純粋に視覚的な整理機能。
  moveHumanTile(from: number, to: number): void {
    if (this.#state.phase !== "discard" || this.#state.turn !== "east") return;
    const hand = this.#state.players.east.hand;
    if (from < 0 || from >= hand.length || to < 0 || to >= hand.length) return;
    if (from === to) return;
    const [moved] = hand.splice(from, 1);
    hand.splice(to, 0, moved!);
    this.#emit();
  }

  humanDeclareTsumo(): TsumoAttempt {
    if (this.#state.phase !== "discard" || this.#state.turn !== "east") {
      return { success: false, reason: "ターンが違います" };
    }
    return this.#tryWin("east");
  }

  #tryWin(seat: Seat): TsumoAttempt {
    const player = this.#state.players[seat];
    const winForm = canWin(player.hand);
    if (!winForm) return { success: false, reason: "和了形ではありません" };
    const ctx = {
      isTsumo: true,
      isMenzen: true,
      seatWind: SEAT_WIND[seat],
      roundWind: this.#state.roundWind,
    };
    const judged = judgeYaku(winForm, player.hand, ctx);
    if (!canDeclareWin(judged.yakus, judged.isYakuman)) {
      return { success: false, reason: "AWS役がありません" };
    }
    const isDealer = seat === "east";
    const score = calcScore({
      totalHan: judged.totalHan,
      isDealer,
      isTsumo: true,
    });
    const loser: Seat = seat === "east" ? "south" : "east";
    this.#state.players[seat].score += score.winnerGain;
    this.#state.players[loser].score -= score.loserPay;
    const info: WinInfo = {
      winner: seat,
      isTsumo: true,
      hand: [...player.hand],
      yakus: judged.yakus,
      totalHan: judged.totalHan,
      isYakuman: judged.isYakuman,
      score: score.winnerGain,
    };
    this.#state.winInfo = info;
    this.#state.phase = "win";
    this.#emit();
    return { success: true };
  }

  #advanceTurn(): void {
    // 次プレイヤーへ
    const nextSeat: Seat = this.#state.turn === "east" ? "south" : "east";
    this.#state.turn = nextSeat;
    // 山が空なら流局
    if (this.#state.wall.length === 0) {
      this.#state.phase = "draw_game";
      return;
    }
    const drawn = drawFromWall(this.#state.wall);
    this.#state.wall = drawn.remainingWall;
    if (!drawn.tile) {
      this.#state.phase = "draw_game";
      return;
    }
    const player = this.#state.players[nextSeat];
    // 人間(east)はツモ後に再ソートせず手動の並びを維持し、ツモ牌を末尾に追加する。
    // (自動整列は初回配牌のみ。startNewRound 参照)
    player.hand =
      nextSeat === "east"
        ? [...player.hand, drawn.tile]
        : [...sortTiles(player.hand), drawn.tile];
    this.#state.lastDrawTile = drawn.tile;
    this.#state.phase = "discard";

    if (nextSeat === "south") {
      this.#runCpuTurn();
    }
  }

  #runCpuTurn(): void {
    const player = this.#state.players.south;
    const action = decideCpuAction({
      hand: player.hand,
      ctx: {
        isTsumo: true,
        isMenzen: true,
        seatWind: SEAT_WIND.south,
        roundWind: this.#state.roundWind,
      },
      rng: this.#rng,
    });
    if (action.action === "win") {
      this.#tryWin("south");
      return;
    }
    const idx = action.tileIndex;
    const tile = player.hand[idx]!;
    player.hand = player.hand.filter((_, i) => i !== idx);
    player.discards.push(tile);
    this.#state.lastDrawTile = null;
    this.#advanceTurn();
  }

  #emit(): void {
    this.#onChange(this.#state);
  }
}

function makePlayer(seat: Seat, isDealer: boolean, hand: Tile[], score: number): Player {
  return {
    seat,
    seatWind: SEAT_WIND[seat],
    hand,
    discards: [],
    isHuman: seat === "east",
    isDealer,
    score,
  };
}

function createInitialState(): GameState {
  return {
    wall: [],
    players: {
      east: makePlayer("east", true, [], INITIAL_SCORE),
      south: makePlayer("south", false, [], INITIAL_SCORE),
    },
    turn: "east",
    roundWind: "1z",
    roundIndex: 0,
    phase: "deal",
    lastDrawTile: null,
    winInfo: null,
  };
}

export const _SEAT_ORDER = SEAT_ORDER;
