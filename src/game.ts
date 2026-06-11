import type {
  ClaimKind,
  ClaimOffers,
  CpuClaim,
  GameState,
  Player,
  Seat,
  SeatWind,
  SelfKanOption,
  Tile,
  TileId,
} from "./types";
import { sortTiles } from "./tiles";
import {
  buildWall,
  dealInitialHands,
  drawFromWall,
  drawFromWallEnd,
  mulberry32,
  splitDeadWall,
  type RNG,
} from "./wall";
import { canWin } from "./winning/check";
import { effectiveHandTiles, isMenzenHand } from "./winning/melds";
import { judgeYaku, canDeclareWin } from "./yaku/judge";
import { decideCpuAction, decideClaim } from "./cpu";
import { CLAIM_PRIORITY, computeEligibility, resolveClaims, seatDistance } from "./claims";
import { calcScore, type ScorePayments } from "./score";
import { countDoraHan, doraIndicators, MAX_DORA_INDICATORS } from "./dora";

// 各プレイヤーの初期持ち点 (麻雀標準)
const INITIAL_SCORE = 25000;

// 反復ループの安全弁。1局は最大でも 70巡 × 数アクションで収まる
const LOOP_GUARD = 1000;

// ポン/明槓で手牌から出す枚数
const TILES_FROM_HAND_FOR_PON = 2;
const TILES_FROM_HAND_FOR_KAN = 3;
const KAN_SET_SIZE = 4;

export interface GameControllerOptions {
  seed?: number;
  onChange?: (state: GameState) => void;
  /** テスト用シーム: 仕込み壁を注入する。省略時は buildWall */
  wallFactory?: (rng: RNG) => Tile[];
  /** テスト用シーム: CPU打牌選択の乱数を差し替える。省略時は seed 由来 */
  rng?: RNG;
}

export interface ActionAttempt {
  success: boolean;
  reason?: string;
}

// 後方互換のための別名 (humanDeclareTsumo の戻り値として使ってきた名前)
export type TsumoAttempt = ActionAttempt;

const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];

// 東風戦の局数 (東1〜東4)。局 N の親は SEAT_ORDER[N]
const ROUNDS_PER_MATCH = 4;

// 親からのツモ順オフセット → 自風 (親=東家)
const WINDS: SeatWind[] = ["1z", "2z", "3z", "4z"];

function windFor(dealer: Seat, seat: Seat): SeatWind {
  return WINDS[seatDistance(dealer, seat, SEAT_ORDER)]!;
}

function nextSeat(seat: Seat): Seat {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 1) % SEAT_ORDER.length]!;
}

export class GameController {
  #state: GameState;
  #rng: RNG;
  #onChange: (state: GameState) => void;
  #wallFactory: (rng: RNG) => Tile[];

  constructor(opts: GameControllerOptions = {}) {
    this.#rng = opts.rng ?? mulberry32(opts.seed ?? Date.now());
    this.#onChange = opts.onChange ?? (() => {});
    this.#wallFactory = opts.wallFactory ?? buildWall;
    this.#state = createInitialState();
  }

  get state(): GameState {
    return this.#state;
  }

  /** 半荘 (東風戦) を最初から始める。持ち点を 25000 にリセットして東1局を配牌 */
  startMatch(): void {
    for (const seat of SEAT_ORDER) {
      this.#state.players[seat].score = INITIAL_SCORE;
    }
    this.#deal(0);
  }

  /**
   * 次の局へ進む (win / draw_game からのみ有効)。
   * AWS麻雀は「親の連荘なし」なので、親の和了・流局を問わず常に親が交代する。
   * 東4局終了後は phase="round_end" (終局) になり、点数は動かない。
   */
  startNextRound(): void {
    if (this.#state.phase !== "win" && this.#state.phase !== "draw_game") return;
    if (this.#state.roundIndex >= ROUNDS_PER_MATCH - 1) {
      this.#state.phase = "round_end";
      this.#emit();
      return;
    }
    this.#deal(this.#state.roundIndex + 1);
  }

  /**
   * 局 roundIndex の配牌。親 = SEAT_ORDER[roundIndex] で、piles[0] (14枚) が親に渡り、
   * 自風はツモ順で 1z→4z と回る。親が CPU の場合は #loop で人間の手番まで自動進行する。
   */
  #deal(roundIndex: number): void {
    const dealt = dealInitialHands(this.#wallFactory(this.#rng));
    const { liveWall, deadWall } = splitDeadWall(dealt.remainingWall);
    const dealer = SEAT_ORDER[roundIndex % SEAT_ORDER.length]!;
    const dealerIdx = SEAT_ORDER.indexOf(dealer);
    // ソートで配列はコピーされるが Tile の同一性は保たれるため、先に初ツモ参照を確保する
    const initialDraw = dealt.piles[0][dealt.piles[0].length - 1] ?? null;

    const prev = this.#state.players;
    const players = {} as Record<Seat, Player>;
    dealt.piles.forEach((pile, offset) => {
      const seat = SEAT_ORDER[(dealerIdx + offset) % SEAT_ORDER.length]!;
      const isDealer = offset === 0;
      // 親の手は「整列済み13枚 + 初ツモ(末尾)」。人間の並びは以後手動維持 (D-010)
      const hand =
        isDealer && initialDraw
          ? [...sortTiles(pile.slice(0, -1)), initialDraw]
          : sortTiles(pile);
      players[seat] = makePlayer(seat, hand, prev[seat].score, WINDS[offset]!, isDealer);
    });

    this.#state = {
      wall: liveWall,
      deadWall,
      doraIndicatorCount: 1, // 配牌時に表ドラ表示牌1枚を公開
      players,
      turn: dealer,
      roundWind: "1z",
      roundIndex,
      phase: "discard",
      lastDrawTile: initialDraw,
      lastDiscard: null,
      claim: null,
      selfKanOptions: [],
      canTsumo: false,
      winInfo: null,
    };
    this.#refreshHumanTurnHints();
    this.#loop();
    this.#emit();
  }

  // ---- 公開 API: 人間の操作 ----

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

  humanDeclareTsumo(): ActionAttempt {
    if (this.#state.phase !== "discard" || this.#state.turn !== "east") {
      return { success: false, reason: "ターンが違います" };
    }
    if (this.#state.lastDrawTile === null) {
      return { success: false, reason: "ツモ牌がありません" };
    }
    const result = this.#tryWin("east", { isTsumo: true });
    if (result.success) this.#emit();
    return result;
  }

  /** claim フェーズでの宣言。chi は offers.chi の index で指定する */
  humanClaim(choice: { kind: ClaimKind; chiIndex?: number }): ActionAttempt {
    const claim = this.#state.claim;
    if (this.#state.phase !== "claim" || !claim) {
      return { success: false, reason: "鳴きフェーズではありません" };
    }
    const offers = claim.offers;
    let humanClaim: CpuClaim;
    if (choice.kind === "ron") {
      if (!offers.ron) return { success: false, reason: "ロンできません" };
      humanClaim = { seat: "east", kind: "ron" };
    } else if (choice.kind === "kan") {
      if (!offers.kan) return { success: false, reason: "カンできません" };
      humanClaim = { seat: "east", kind: "kan" };
    } else if (choice.kind === "pon") {
      if (!offers.pon) return { success: false, reason: "ポンできません" };
      humanClaim = { seat: "east", kind: "pon" };
    } else {
      const variant = offers.chi[choice.chiIndex ?? 0];
      if (!variant) return { success: false, reason: "チーできません" };
      humanClaim = { seat: "east", kind: "chi", chiTiles: variant.tiles };
    }
    // CPU の確定クレームと優先解決 (ロン>カン=ポン>チー、同位は頭ハネ)
    const winner = resolveClaims(
      claim.cpuClaim ? [humanClaim, claim.cpuClaim] : [humanClaim],
      claim.discarder,
      SEAT_ORDER,
    )!;
    this.#state.claim = null;
    this.#state.phase = "discard";
    this.#executeClaim(winner, claim.discarder, claim.tile);
    this.#loop();
    this.#emit();
    return { success: true };
  }

  /** claim フェーズを見送る。CPU のクレームが残っていればそれを実行 */
  humanSkipClaim(): void {
    const claim = this.#state.claim;
    if (this.#state.phase !== "claim" || !claim) return;
    this.#state.claim = null;
    this.#state.phase = "discard";
    if (claim.cpuClaim) {
      this.#executeClaim(claim.cpuClaim, claim.discarder, claim.tile);
    } else {
      this.#advanceToNext(claim.discarder);
    }
    this.#loop();
    this.#emit();
  }

  /** 自分の手番中の暗槓/加槓。index は state.selfKanOptions の添字 */
  humanSelfKan(index: number): ActionAttempt {
    if (this.#state.phase !== "discard" || this.#state.turn !== "east") {
      return { success: false, reason: "ターンが違います" };
    }
    const opt = this.#state.selfKanOptions[index];
    if (!opt) return { success: false, reason: "カンできる牌がありません" };
    if (this.#state.wall.length === 0) {
      return { success: false, reason: "山が残っていません" };
    }
    this.#performSelfKan("east", opt);
    this.#loop();
    this.#emit();
    return { success: true };
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

  /** CPU の1手番: ツモ和了 / 暗槓 / 打牌のいずれか1アクション (この優先順) */
  #cpuTurnStep(): void {
    const seat = this.#state.turn;
    const player = this.#state.players[seat];
    const drewThisTurn = this.#state.lastDrawTile !== null;
    const action = decideCpuAction({
      hand: player.hand,
      melds: player.melds,
      ctx: {
        isTsumo: drewThisTurn,
        isMenzen: isMenzenHand(player.melds),
        seatWind: this.#state.players[seat].seatWind,
        roundWind: this.#state.roundWind,
      },
      rng: this.#rng,
    });
    if (action.action === "win" && drewThisTurn) {
      const result = this.#tryWin(seat, { isTsumo: true });
      if (result.success) return;
      // canDeclareWin は CPU 側でも確認しているため通常は到達しない
    }
    if (drewThisTurn) {
      // 暗槓: 和了できないときだけ宣言 (リンシャン後に同席の手番が続く)
      const ankan = this.#computeSelfKanOptions(player).find((o) => o.kind === "ankan");
      if (ankan && this.#state.wall.length > 0) {
        this.#performSelfKan(seat, ankan);
        return;
      }
    }
    const idx = action.action === "discard" ? action.tileIndex : 0;
    this.#discard(seat, idx);
  }

  /** 手牌 index の牌を河に出し、打牌後のクレーム解決へ */
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
    this.#refreshHumanTurnHints();
    this.#afterDiscard(seat, tile);
  }

  /**
   * 打牌後のクレーム解決 (状態遷移の核心):
   * 1. 他3席の適格性を純関数で計算し、CPU 分は decideClaim で即決
   * 2. 人間に選択肢があり CPU に先取りされないなら phase="claim" で停止
   * 3. CPU のクレームがあれば実行、なければ次手番へ
   */
  #afterDiscard(discarder: Seat, tile: Tile): void {
    const offersBySeat = new Map<Seat, ClaimOffers>();
    for (const seat of SEAT_ORDER) {
      if (seat === discarder) continue;
      const p = this.#state.players[seat];
      const offers = computeEligibility({
        hand: p.hand,
        melds: p.melds,
        discardedIds: p.discardedIds,
        tile,
        isShimocha: nextSeat(discarder) === seat,
        seatWind: this.#state.players[seat].seatWind,
        roundWind: this.#state.roundWind,
      });
      // リンシャン牌が無いカンは宣言不可 (セルフカン側のガードと揃える)
      if (this.#state.wall.length === 0) offers.kan = false;
      offersBySeat.set(seat, offers);
    }
    const cpuClaims: CpuClaim[] = [];
    for (const [seat, offers] of offersBySeat) {
      if (this.#state.players[seat].isHuman) continue;
      const kind = decideClaim({ offers, tile });
      if (kind) cpuClaims.push({ seat, kind });
    }
    const cpuBest = resolveClaims(cpuClaims, discarder, SEAT_ORDER);

    const humanOffers = offersBySeat.get("east");
    const humanHasChoice =
      humanOffers !== undefined &&
      (humanOffers.ron || humanOffers.pon || humanOffers.kan || humanOffers.chi.length > 0);
    if (humanHasChoice && !humanIsPreempted(humanOffers, cpuBest, discarder)) {
      this.#state.phase = "claim";
      this.#state.claim = { discarder, tile, offers: humanOffers, cpuClaim: cpuBest };
      return;
    }
    if (cpuBest) {
      this.#executeClaim(cpuBest, discarder, tile);
      return;
    }
    this.#advanceToNext(discarder);
  }

  /** クレームの実行: ロン和了 or 副露を作って手番ジャンプ */
  #executeClaim(claim: CpuClaim, discarder: Seat, tile: Tile): void {
    if (claim.kind === "ron") {
      this.#tryWin(claim.seat, { isTsumo: false, winTile: tile, discarder });
      return;
    }
    const player = this.#state.players[claim.seat];
    // 河から取り除く (フリテン履歴 discardedIds には残る)
    this.#state.players[discarder].discards.pop();

    if (claim.kind === "chi") {
      const pair = claim.chiTiles!;
      player.hand = removeTiles(player.hand, pair);
      player.melds.push({
        kind: "chi",
        tiles: [...pair, tile],
        calledFrom: discarder,
        calledTile: tile,
      });
    } else {
      const need = claim.kind === "pon" ? TILES_FROM_HAND_FOR_PON : TILES_FROM_HAND_FOR_KAN;
      const taken: Tile[] = [];
      player.hand = player.hand.filter((t) => {
        if (t.id === tile.id && taken.length < need) {
          taken.push(t);
          return false;
        }
        return true;
      });
      player.melds.push({
        kind: claim.kind === "pon" ? "pon" : "minkan",
        tiles: [...taken, tile],
        calledFrom: discarder,
        calledTile: tile,
      });
    }

    this.#state.turn = claim.seat;
    if (claim.kind === "kan") {
      this.#revealKanDora();
      this.#drawRinshan(claim.seat);
      return;
    }
    // ポン/チー後はツモ無しで打牌待ち (lastDrawTile=null がツモ和了不可のゲート)
    this.#state.lastDrawTile = null;
    this.#state.phase = "discard";
    this.#refreshHumanTurnHints();
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
    this.#refreshHumanTurnHints();
  }

  // ---- 内部: カン ----

  /** 暗槓/加槓の実行 + リンシャンツモ */
  #performSelfKan(seat: Seat, opt: SelfKanOption): void {
    const player = this.#state.players[seat];
    if (opt.kind === "ankan") {
      const tiles = player.hand.filter((t) => t.id === opt.tileId);
      player.hand = player.hand.filter((t) => t.id !== opt.tileId);
      player.melds.push({ kind: "ankan", tiles, calledFrom: null, calledTile: null });
    } else {
      const meldIdx = player.melds.findIndex(
        (m) => m.kind === "pon" && m.tiles[0]!.id === opt.tileId,
      );
      const pon = player.melds[meldIdx]!;
      const addedIdx = player.hand.findIndex((t) => t.id === opt.tileId);
      const added = player.hand[addedIdx]!;
      player.hand = player.hand.filter((_, i) => i !== addedIdx);
      // 槍槓 (加槓へのロン) は未対応 (docs/plans 参照)
      player.melds[meldIdx] = {
        kind: "kakan",
        tiles: [...pon.tiles, added],
        calledFrom: pon.calledFrom,
        calledTile: pon.calledTile,
      };
    }
    this.#revealKanDora();
    this.#drawRinshan(seat);
  }

  /** カン成立時に即カンドラを1枚公開する (明槓の「打牌後めくり」は簡略化: D-012) */
  #revealKanDora(): void {
    this.#state.doraIndicatorCount = Math.min(
      this.#state.doraIndicatorCount + 1,
      MAX_DORA_INDICATORS,
    );
  }

  /** リンシャンツモ: ライブ壁の末尾から補充 (王牌14枚は固定のまま) */
  #drawRinshan(seat: Seat): void {
    if (this.#state.wall.length === 0) {
      this.#state.phase = "draw_game";
      return;
    }
    const drawn = drawFromWallEnd(this.#state.wall);
    this.#state.wall = drawn.remainingWall;
    const player = this.#state.players[seat];
    // 人間の手動並びはリンシャンツモでも維持する
    player.hand = player.isHuman
      ? [...player.hand, drawn.tile!]
      : [...sortTiles(player.hand), drawn.tile!];
    this.#state.lastDrawTile = drawn.tile; // リンシャンツモ和了可能
    this.#state.phase = "discard";
    this.#refreshHumanTurnHints();
  }

  /**
   * 人間の手番情報 (暗槓/加槓候補・ツモ和了可否) を更新する。
   * 人間のツモ番でなければ両方クリアする。状態遷移のたびに呼ぶ。
   */
  #refreshHumanTurnHints(): void {
    const east = this.#state.players.east;
    const isHumanDrawTurn =
      this.#state.turn === "east" && this.#state.lastDrawTile !== null;
    this.#state.selfKanOptions = isHumanDrawTurn
      ? this.#computeSelfKanOptions(east)
      : [];
    this.#state.canTsumo = isHumanDrawTurn && this.#canTsumoNow(east);
  }

  /** ツモ和了が宣言可能か (UI のボタン活性用)。判定規約は #tryWin と同一 */
  #canTsumoNow(player: Player): boolean {
    const winForm = canWin(player.hand, player.melds);
    if (!winForm) return false;
    const judged = judgeYaku(winForm, effectiveHandTiles(player.hand, player.melds), {
      isTsumo: true,
      isMenzen: isMenzenHand(player.melds),
      seatWind: player.seatWind,
      roundWind: this.#state.roundWind,
    });
    return canDeclareWin(judged.yakus, judged.isYakuman);
  }

  /** ツモ済みの手番中に宣言できる暗槓/加槓の候補 */
  #computeSelfKanOptions(player: Player): SelfKanOption[] {
    if (this.#state.lastDrawTile === null) return [];
    const options: SelfKanOption[] = [];
    const counts = new Map<TileId, number>();
    for (const t of player.hand) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    for (const [tileId, count] of counts) {
      if (count === KAN_SET_SIZE) options.push({ kind: "ankan", tileId });
    }
    for (const meld of player.melds) {
      if (meld.kind === "pon" && counts.has(meld.tiles[0]!.id)) {
        options.push({ kind: "kakan", tileId: meld.tiles[0]!.id });
      }
    }
    return options;
  }

  // ---- 内部: 和了 ----

  #tryWin(
    seat: Seat,
    opts: { isTsumo: true } | { isTsumo: false; winTile: Tile; discarder: Seat },
  ): ActionAttempt {
    const player = this.#state.players[seat];
    const concealed = opts.isTsumo ? player.hand : [...player.hand, opts.winTile];
    const winForm = canWin(concealed, player.melds);
    if (!winForm) return { success: false, reason: "和了形ではありません" };
    const judged = judgeYaku(winForm, effectiveHandTiles(concealed, player.melds), {
      isTsumo: opts.isTsumo,
      isMenzen: isMenzenHand(player.melds),
      seatWind: this.#state.players[seat].seatWind,
      roundWind: this.#state.roundWind,
    });
    if (!canDeclareWin(judged.yakus, judged.isYakuman)) {
      return { success: false, reason: "AWS役がありません" };
    }
    // ドラは役ではない: AWS役ゲート通過後に飜だけ加算する。役満には乗せない (D-012)。
    // effectiveHandTiles はカン4枚目を落とす (D-009 項5) ため、ここでは副露の全牌を使う。
    let yakus = judged.yakus;
    let totalHan = judged.totalHan;
    if (!judged.isYakuman) {
      const indicators = doraIndicators(this.#state.deadWall, this.#state.doraIndicatorCount);
      const allTileIds = [...concealed, ...player.melds.flatMap((m) => m.tiles)].map((t) => t.id);
      const doraHan = countDoraHan(
        allTileIds,
        indicators.map((t) => t.id),
      );
      if (doraHan > 0) {
        yakus = [...yakus, { id: "dora", name: "ドラ", han: doraHan }];
        totalHan += doraHan;
      }
    }
    const payments = calcScore({
      totalHan,
      isDealer: player.isDealer,
      isTsumo: opts.isTsumo,
    });
    const discarder = opts.isTsumo ? null : opts.discarder;
    const deltas = this.#applyPayments(seat, discarder, payments);
    this.#state.winInfo = {
      winner: seat,
      isTsumo: opts.isTsumo,
      loserSeat: discarder,
      hand: [...concealed],
      melds: [...player.melds],
      yakus,
      totalHan,
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

/**
 * 人間にクレーム窓を開かず CPU のクレームを即実行してよいか:
 * - CPU の優先度が人間の最高位より高い (例: CPU ロン vs 人間ポン)
 * - ダブロンで CPU が頭ハネ順で先
 */
function humanIsPreempted(
  offers: ClaimOffers,
  cpuBest: CpuClaim | null,
  discarder: Seat,
): boolean {
  if (!cpuBest) return false;
  const humanPriority =
    offers.ron ? CLAIM_PRIORITY.ron
    : offers.pon || offers.kan ? CLAIM_PRIORITY.pon
    : offers.chi.length > 0 ? CLAIM_PRIORITY.chi
    : 0;
  const cpuPriority = CLAIM_PRIORITY[cpuBest.kind];
  if (cpuPriority > humanPriority) return true;
  if (cpuBest.kind === "ron" && offers.ron) {
    return (
      seatDistance(discarder, cpuBest.seat, SEAT_ORDER) <
      seatDistance(discarder, "east", SEAT_ORDER)
    );
  }
  return false;
}

/** id+copy の一致で手牌から指定の牌を取り除く */
function removeTiles(hand: Tile[], toRemove: readonly Tile[]): Tile[] {
  const out = [...hand];
  for (const target of toRemove) {
    const i = out.findIndex((t) => t.id === target.id && t.copy === target.copy);
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

function makePlayer(
  seat: Seat,
  hand: Tile[],
  score: number,
  seatWind: SeatWind,
  isDealer: boolean,
): Player {
  return {
    seat,
    seatWind,
    hand,
    melds: [],
    discards: [],
    discardedIds: [],
    isHuman: seat === "east",
    isDealer,
    score,
  };
}

function createInitialState(): GameState {
  return {
    wall: [],
    deadWall: [],
    doraIndicatorCount: 1, // deadWall 空なので doraIndicators は [] を返す (配牌前の一瞬)
    players: {
      east: makePlayer("east", [], INITIAL_SCORE, windFor("east", "east"), true),
      south: makePlayer("south", [], INITIAL_SCORE, windFor("east", "south"), false),
      west: makePlayer("west", [], INITIAL_SCORE, windFor("east", "west"), false),
      north: makePlayer("north", [], INITIAL_SCORE, windFor("east", "north"), false),
    },
    turn: "east",
    roundWind: "1z",
    roundIndex: 0,
    phase: "deal",
    lastDrawTile: null,
    lastDiscard: null,
    claim: null,
    selfKanOptions: [],
    canTsumo: false,
    winInfo: null,
  };
}

