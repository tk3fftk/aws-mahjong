import { describe, it, expect } from "vitest";
import { GameController } from "./game";

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
});
