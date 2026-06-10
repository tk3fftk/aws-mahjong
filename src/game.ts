import type {
  GameState,
  Player,
  Seat,
  SeatWind,
  Tile,
  WinInfo,
} from "./types";
import { sortTiles } from "./tiles";
import {
  buildWall,
  dealInitialHands,
  drawFromWall,
  mulberry32,
  splitDeadWall,
  type RNG,
} from "./wall";
import { canWin } from "./winning/check";
import { effectiveHandTiles, isMenzenHand } from "./winning/melds";
import { judgeYaku, canDeclareWin } from "./yaku/judge";
import { decideCpuAction } from "./cpu";
import { calcScore, type ScorePayments } from "./score";

// 各プレイヤーの初期持ち点 (麻雀標準)
const INITIAL_SCORE = 25000;

// 反復ループの安全弁。1局は最大でも 70巡 × 数アクションで収まる
const LOOP_GUARD = 1000;

export interface GameControllerOptions {
  seed?: number;
  onChange?: (state: GameState) => void;
  /** テスト用シーム: 仕込み壁を注入する。省略時は buildWall */
  wallFactory?: (rng: RNG) => Tile[];
}

export interface TsumoAttempt {
  success: boolean;
  reason?: string;
}

const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];

const SEAT_WIND: Record<Seat, SeatWind> = {
  east: "1z",
  south: "2z",
  west: "3z",
  north: "4z",
};

function nextSeat(seat: Seat): Seat {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 1) % SEAT_ORDER.length]!;
}

export class GameController {
  #state: GameState;
  #rng: RNG;
  #onChange: (state: GameState) => void;
  #wallFactory: (rng: RNG) => Tile[];

  constructor(opts: GameControllerOptions = {}) {
    this.#rng = mulberry32(opts.seed ?? Date.now());
    this.#onChange = opts.onChange ?? (() => {});
    this.#wallFactory = opts.wallFactory ?? buildWall;
    this.#state = createInitialState();
  }

  get state(): GameState {
    return this.#state;
  }

  startNewRound(): void {
    const dealt = dealInitialHands(this.#wallFactory(this.#rng));
    const { liveWall, deadWall } = splitDeadWall(dealt.remainingWall);
    const eastInitialDraw = dealt.east[dealt.east.length - 1] ?? null;
    const eastSortedRest = sortTiles(dealt.east.slice(0, -1));
    const eastHand = eastInitialDraw ? [...eastSortedRest, eastInitialDraw] : eastSortedRest;
    const prev = this.#state.players;
    this.#state = {
      wall: liveWall,
      deadWall,
      players: {
        east: makePlayer("east", eastHand, prev.east.score),
        south: makePlayer("south", sortTiles(dealt.south), prev.south.score),
        west: makePlayer("west", sortTiles(dealt.west), prev.west.score),
        north: makePlayer("north", sortTiles(dealt.north), prev.north.score),
      },
      turn: "east",
      roundWind: "1z",
      roundIndex: 0,
      phase: "discard",
      lastDrawTile: eastInitialDraw,
      lastDiscard: null,
      claim: null,
      selfKanOptions: [],
      winInfo: null,
    };
    this.#emit();
  }

  humanDiscard(index: number): void {
    if (this.#state.phase !== "discard" || this.#state.turn !== "east") return;
    const east = this.#state.players.east;
    if (index < 0 || index >= east.hand.length) return;
    this.#discard("east", index);
    this.#loop();
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
    if (this.#state.lastDrawTile === null) {
      return { success: false, reason: "ツモ牌がありません" };
    }
    const result = this.#tryTsumo("east");
    if (result.success) this.#emit();
    return result;
  }

  // ---- 内部: ターン駆動 ----

  /**
   * 状態機械のドライバ。「phase=discard かつ turn が CPU」の間だけ1手ずつ進め、
   * 人間の入力待ち / claim 応答待ち / 終局で停止する。再帰しない。
   */
  #loop(): void {
    for (let guard = 0; guard < LOOP_GUARD; guard++) {
      const s = this.#state;
      if (s.phase !== "discard") return;
      if (s.players[s.turn].isHuman) return;
      this.#cpuTurnStep();
    }
    throw new Error("game loop did not settle");
  }

  /** CPU の1手番: ツモ和了宣言 or 打牌 */
  #cpuTurnStep(): void {
    const seat = this.#state.turn;
    const player = this.#state.players[seat];
    const action = decideCpuAction({
      hand: player.hand,
      ctx: {
        isTsumo: this.#state.lastDrawTile !== null,
        isMenzen: isMenzenHand(player.melds),
        seatWind: SEAT_WIND[seat],
        roundWind: this.#state.roundWind,
      },
      rng: this.#rng,
    });
    if (action.action === "win" && this.#state.lastDrawTile !== null) {
      const result = this.#tryTsumo(seat);
      if (result.success) return;
      // canDeclareWin を CPU 側でも確認しているため通常は到達しない
    }
    const idx = action.action === "discard" ? action.tileIndex : 0;
    this.#discard(seat, idx);
  }

  /** 手牌 index の牌を河に出し、打牌後処理へ */
  #discard(seat: Seat, index: number): void {
    const player = this.#state.players[seat];
    const tile = player.hand[index]!;
    // 人間の手動並びは打牌でも崩さない (ソートは CPU のみ)
    const rest = player.hand.filter((_, i) => i !== index);
    player.hand = player.isHuman ? rest : sortTiles(rest);
    player.discards.push(tile);
    player.discardedIds.push(tile.id);
    this.#state.lastDrawTile = null;
    this.#state.lastDiscard = { seat, tile };
    this.#state.selfKanOptions = [];
    this.#afterDiscard(seat);
  }

  /** 打牌後の処理。クレーム解決は後続ステップで配線し、現状は次手番へ進むのみ */
  #afterDiscard(discarder: Seat): void {
    this.#advanceToNext(discarder);
  }

  /** 次の席へ手番を移し、山からツモる。山が尽きていれば流局 */
  #advanceToNext(from: Seat): void {
    const seat = nextSeat(from);
    this.#state.turn = seat;
    if (this.#state.wall.length === 0) {
      this.#state.phase = "draw_game";
      return;
    }
    const drawn = drawFromWall(this.#state.wall);
    this.#state.wall = drawn.remainingWall;
    const player = this.#state.players[seat];
    // 人間(east)はツモ後に再ソートせず手動の並びを維持し、ツモ牌を末尾に追加する。
    // (自動整列は初回配牌のみ。startNewRound 参照)
    player.hand = player.isHuman
      ? [...player.hand, drawn.tile!]
      : [...sortTiles(player.hand), drawn.tile!];
    this.#state.lastDrawTile = drawn.tile;
    this.#state.phase = "discard";
  }

  // ---- 内部: 和了 ----

  #tryTsumo(seat: Seat): TsumoAttempt {
    const player = this.#state.players[seat];
    const winForm = canWin(player.hand, player.melds);
    if (!winForm) return { success: false, reason: "和了形ではありません" };
    const allTiles = effectiveHandTiles(player.hand, player.melds);
    const judged = judgeYaku(winForm, allTiles, {
      isTsumo: true,
      isMenzen: isMenzenHand(player.melds),
      seatWind: SEAT_WIND[seat],
      roundWind: this.#state.roundWind,
    });
    if (!canDeclareWin(judged.yakus, judged.isYakuman)) {
      return { success: false, reason: "AWS役がありません" };
    }
    const payments = calcScore({
      totalHan: judged.totalHan,
      isDealer: player.isDealer,
      isTsumo: true,
    });
    const deltas = this.#applyPayments(seat, null, payments);
    this.#state.winInfo = {
      winner: seat,
      isTsumo: true,
      loserSeat: null,
      hand: [...player.hand],
      melds: [...player.melds],
      yakus: judged.yakus,
      totalHan: judged.totalHan,
      isYakuman: judged.isYakuman,
      score: payments.total,
      payments: deltas,
    };
    this.#state.phase = "win";
    this.#state.claim = null;
    return { success: true };
  }

  /** 点数移動を適用し、増減一覧 (勝者+ / 支払者−) を返す */
  #applyPayments(
    winner: Seat,
    discarder: Seat | null,
    payments: ScorePayments,
  ): Array<{ seat: Seat; delta: number }> {
    const deltas: Array<{ seat: Seat; delta: number }> = [
      { seat: winner, delta: payments.total },
    ];
    if (payments.kind === "ron") {
      deltas.push({ seat: discarder!, delta: -payments.fromDiscarder });
    } else {
      for (const seat of SEAT_ORDER) {
        if (seat === winner) continue;
        const pay =
          payments.kind === "tsumo-dealer" ? payments.fromEachKo
          : this.#state.players[seat].isDealer ? payments.fromDealer
          : payments.fromEachKo;
        deltas.push({ seat, delta: -pay });
      }
    }
    for (const { seat, delta } of deltas) {
      this.#state.players[seat].score += delta;
    }
    return deltas;
  }

  #emit(): void {
    this.#onChange(this.#state);
  }
}

function makePlayer(seat: Seat, hand: Tile[], score: number): Player {
  return {
    seat,
    seatWind: SEAT_WIND[seat],
    hand,
    melds: [],
    discards: [],
    discardedIds: [],
    isHuman: seat === "east",
    isDealer: seat === "east",
    score,
  };
}

function createInitialState(): GameState {
  return {
    wall: [],
    deadWall: [],
    players: {
      east: makePlayer("east", [], INITIAL_SCORE),
      south: makePlayer("south", [], INITIAL_SCORE),
      west: makePlayer("west", [], INITIAL_SCORE),
      north: makePlayer("north", [], INITIAL_SCORE),
    },
    turn: "east",
    roundWind: "1z",
    roundIndex: 0,
    phase: "deal",
    lastDrawTile: null,
    lastDiscard: null,
    claim: null,
    selfKanOptions: [],
    winInfo: null,
  };
}

export const _SEAT_ORDER = SEAT_ORDER;
