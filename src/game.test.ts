import { describe, it, expect } from "vitest";
import { GameController } from "./game";
import { sortTiles } from "./tiles";

describe("GameController", () => {
  it("startNewRound 後、親(east)=14枚 / 子(south)=13枚 / phase=discard / turn=east", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();
    const s = game.state;
    expect(s.players.east.hand).toHaveLength(14);
    expect(s.players.south.hand).toHaveLength(13);
    expect(s.phase).toBe("discard");
    expect(s.turn).toBe("east");
    expect(s.wall).toHaveLength(83);
    expect(s.players.east.isDealer).toBe(true);
  });

  it("初回配牌: east の最初の13枚は整列済み、14枚目はツモ牌 (lastDrawTile)", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();
    const hand = game.state.players.east.hand;
    const first13 = hand.slice(0, 13);
    expect(first13).toEqual(sortTiles(first13));
    expect(hand[13]).toBe(game.state.lastDrawTile);
  });

  it("humanDiscard で打牌が河に移動し、south が自動でツモ→打牌してターンが east に戻る", () => {
    const game = new GameController({ seed: 42 });
    game.startNewRound();
    const handBefore = [...game.state.players.east.hand];
    game.humanDiscard(0);
    // 打牌された牌は east.discards 末尾、east.hand は 1枚減
    expect(game.state.players.east.discards).toHaveLength(1);
    expect(game.state.players.east.discards[0]).toEqual(handBefore[0]);
    // south が自動でツモ → ランダム打牌 → ターンは再び east、east はツモ済みで 14枚
    expect(game.state.turn).toBe("east");
    expect(game.state.phase).toBe("discard");
    expect(game.state.players.south.hand).toHaveLength(13);
    expect(game.state.players.south.discards).toHaveLength(1);
    expect(game.state.players.east.hand).toHaveLength(14);
  });

  it("山が0になると流局 (phase=draw_game)", () => {
    const game = new GameController({ seed: 1 });
    game.startNewRound();
    // 上限を持ったループで完走させる
    let safety = 500;
    while (game.state.phase === "discard" && safety-- > 0) {
      // 人間は適当に index 0 を打牌
      game.humanDiscard(0);
    }
    expect(["draw_game", "win"]).toContain(game.state.phase);
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
