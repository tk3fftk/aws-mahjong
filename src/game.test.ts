import { describe, it, expect } from "vitest";
import { GameController } from "./game";
import { ALL_TILE_IDS, mpszToTiles, sortTiles } from "./tiles";
import type { Copy, Seat, Tile, TileId } from "./types";

const ALL_SEATS: Seat[] = ["east", "south", "west", "north"];
const TOTAL_SCORE = 100000;

function totalScore(game: GameController): number {
  return ALL_SEATS.reduce((sum, s) => sum + game.state.players[s].score, 0);
}

// dealInitialHands の配り順 (4枚×3周 + 1枚ずつ + 親の初ツモ) における east の取得位置
const EAST_DEAL_INDICES = [0, 1, 2, 3, 16, 17, 18, 19, 32, 33, 34, 35, 48, 52];

/** east の配牌14枚を指定した仕込み壁 (136枚) を作る。残りはプール順で埋める */
function riggedWall(eastMpsz: string): Tile[] {
  const eastIds = mpszToTiles(eastMpsz);
  if (eastIds.length !== 14) throw new Error("east hand must be 14 tiles");
  const pool: Tile[] = [];
  for (const id of ALL_TILE_IDS) {
    for (let c = 0; c < 4; c++) pool.push({ id, copy: c as Copy });
  }
  const take = (id: TileId): Tile => {
    const i = pool.findIndex((t) => t.id === id);
    if (i < 0) throw new Error(`pool exhausted for ${id}`);
    return pool.splice(i, 1)[0]!;
  };
  const eastTiles = eastIds.map(take);
  const wall: (Tile | null)[] = new Array(136).fill(null);
  EAST_DEAL_INDICES.forEach((idx, i) => {
    wall[idx] = eastTiles[i]!;
  });
  for (let i = 0; i < wall.length; i++) {
    if (wall[i] === null) wall[i] = pool.shift()!;
  }
  return wall as Tile[];
}

describe("GameController / 4人対戦の基本", () => {
  it("startNewRound 後、親(east)=14枚 / 他3家=各13枚 / 山69枚 / 王牌14枚", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();
    const s = game.state;
    expect(s.players.east.hand).toHaveLength(14);
    expect(s.players.south.hand).toHaveLength(13);
    expect(s.players.west.hand).toHaveLength(13);
    expect(s.players.north.hand).toHaveLength(13);
    expect(s.wall).toHaveLength(69);
    expect(s.deadWall).toHaveLength(14);
    expect(s.phase).toBe("discard");
    expect(s.turn).toBe("east");
    expect(s.players.east.isDealer).toBe(true);
    expect(s.players.south.isDealer).toBe(false);
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });

  it("初回配牌: east の最初の13枚は整列済み、14枚目はツモ牌 (lastDrawTile)", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();
    const hand = game.state.players.east.hand;
    const first13 = hand.slice(0, 13);
    expect(first13).toEqual(sortTiles(first13));
    expect(hand[13]).toBe(game.state.lastDrawTile);
  });

  it("humanDiscard で CPU 3人が順に手番を消化し、ターンが east に戻る", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();
    const handBefore = [...game.state.players.east.hand];
    game.humanDiscard(0);
    const s = game.state;
    expect(s.players.east.discards).toHaveLength(1);
    expect(s.players.east.discards[0]).toEqual(handBefore[0]);
    expect(s.players.east.discardedIds).toEqual([handBefore[0]!.id]);
    // south → west → north が自動で1枚ずつ打牌し、east がツモ済みで戻る
    expect(s.turn).toBe("east");
    expect(s.phase).toBe("discard");
    for (const seat of ["south", "west", "north"] as Seat[]) {
      expect(s.players[seat].hand).toHaveLength(13);
      expect(s.players[seat].discards).toHaveLength(1);
    }
    expect(s.players.east.hand).toHaveLength(14);
    // 1巡で山は4枚減る (CPU3人 + east の次ツモ)
    expect(s.wall).toHaveLength(69 - 4);
  });

  it("山が0になると流局 (phase=draw_game)", () => {
    const game = new GameController({ seed: 1 });
    game.startNewRound();
    let safety = 500;
    while (game.state.phase === "discard" && safety-- > 0) {
      game.humanDiscard(0);
    }
    expect(["draw_game", "win"]).toContain(game.state.phase);
    if (game.state.phase === "draw_game") {
      expect(game.state.wall).toHaveLength(0);
    }
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });

  it("humanDeclareTsumo: AWS役無しなら無効 (phase は変わらない)", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();
    const result = game.humanDeclareTsumo();
    expect(result.success).toBe(false);
    expect(game.state.phase).toBe("discard");
  });

  it("moveHumanTile: from の牌が to の位置へ移動する (from<to / from>to)", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();

    // from < to
    const before = [...game.state.players.east.hand];
    const moved = before[0]!;
    game.moveHumanTile(0, 5);
    const after = game.state.players.east.hand;
    expect(after).toHaveLength(before.length);
    expect(after[5]).toBe(moved);
    // 元の 1..5 番目が 1つ前へ詰まる
    expect(after.slice(0, 5)).toEqual(before.slice(1, 6));

    // from > to (今の並びから 5 を 1 へ戻す)
    const handB = [...game.state.players.east.hand];
    const movedB = handB[5]!;
    game.moveHumanTile(5, 1);
    expect(game.state.players.east.hand[1]).toBe(movedB);
  });

  it("moveHumanTile: 範囲外・from===to は手牌を変えない", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();
    const before = [...game.state.players.east.hand];

    game.moveHumanTile(0, 99); // 範囲外
    expect(game.state.players.east.hand).toEqual(before);

    game.moveHumanTile(-1, 3); // 範囲外
    expect(game.state.players.east.hand).toEqual(before);

    game.moveHumanTile(3, 3); // no-op
    expect(game.state.players.east.hand).toEqual(before);
  });

  it("moveHumanTile: discard フェーズ以外 (流局後) は無視される", () => {
    const game = new GameController({ seed: 1 });
    game.startNewRound();
    let safety = 500;
    while (game.state.phase === "discard" && safety-- > 0) {
      game.humanDiscard(0);
    }
    expect(game.state.phase).not.toBe("discard");
    const before = [...game.state.players.east.hand];
    game.moveHumanTile(0, 3);
    expect(game.state.players.east.hand).toEqual(before);
  });

  it("ツモ後、east の手牌は再ソートされず手動順が維持され、ツモ牌が末尾に追加される", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();

    // 手動で並び替える (0 番目を末尾へ) → 整列が崩れた状態を作る
    game.moveHumanTile(0, 13);
    // ツモ牌(末尾)を捨てると、並び替えた 13枚が残る
    const kept = game.state.players.east.hand.slice(0, 13);
    game.humanDiscard(13);

    // south 自動打牌 → east が再びツモ (14枚)
    expect(game.state.turn).toBe("east");
    const hand = game.state.players.east.hand;
    expect(hand).toHaveLength(14);
    // 残った13枚は順序そのまま (再ソートされていない)
    expect(hand.slice(0, 13)).toEqual(kept);
    // ツモ牌は末尾、かつ lastDrawTile と同一参照
    expect(hand[13]).toBe(game.state.lastDrawTile);
  });
});

describe("GameController / ツモ精算 (仕込み壁)", () => {
  it("親ツモ: 子3人が均等に支払い、合計点は保存される", () => {
    const game = new GameController({
      seed: 7,
      wallFactory: () => riggedWall("555z234m567m234p55s"),
    });
    game.startNewRound();
    const result = game.humanDeclareTsumo();
    expect(result.success).toBe(true);
    const s = game.state;
    expect(s.phase).toBe("win");
    expect(s.winInfo?.isTsumo).toBe(true);
    expect(s.winInfo?.loserSeat).toBeNull();
    expect(s.winInfo?.yakus.map((y) => y.id)).toContain("kiro");
    // 支払い: 勝者 + / 子3人 − が均等
    const payments = s.winInfo!.payments;
    expect(payments).toHaveLength(4);
    const winnerDelta = payments.find((p) => p.seat === "east")!.delta;
    const koDeltas = payments.filter((p) => p.seat !== "east").map((p) => p.delta);
    expect(new Set(koDeltas).size).toBe(1);
    expect(winnerDelta).toBe(-koDeltas[0]! * 3);
    expect(s.players.east.score).toBe(25000 + winnerDelta);
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });
});
