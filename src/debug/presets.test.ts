import { describe, it, expect } from "vitest";
import { GameController } from "../game";
import { riggedDeal, type RiggedDeal } from "./rigged";
import { DEBUG_PRESETS } from "./presets";

/** プリセットを debug mode と同じ条件 (仕込み壁 + CPU 先頭打牌固定) で起こす */
function presetGame(spec: RiggedDeal): GameController {
  const game = new GameController({
    wallFactory: () => riggedDeal(spec),
    rng: () => 0,
  });
  game.startMatch();
  return game;
}

describe("DEBUG_PRESETS / 全プリセットの健全性", () => {
  for (const [name, spec] of Object.entries(DEBUG_PRESETS)) {
    it(`${name}: riggedDeal が 136枚の壁を作れる`, () => {
      const wall = riggedDeal(spec);
      expect(wall).toHaveLength(136);
    });

    it(`${name}: startMatch で局が立つ (east 14枚)`, () => {
      const game = presetGame(spec);
      expect(game.state.players.east.hand).toHaveLength(14);
      expect(game.state.phase).toBe("discard");
    });
  }
});

describe("DEBUG_PRESETS / 各シナリオの意図", () => {
  it("riichi: 初手でリーチ候補 (1z 切り) がある", () => {
    const game = presetGame(DEBUG_PRESETS.riichi!);
    expect(game.state.riichiCandidates).toEqual([13]);
  });

  it("ron: 初ツモ (1z) を捨てると south の 8m でロン窓が開く", () => {
    const game = presetGame(DEBUG_PRESETS.ron!);
    game.humanDiscard(13);
    expect(game.state.phase).toBe("claim");
    expect(game.state.claim?.offers.ron).toBe(true);
    expect(game.state.claim?.tile.id).toBe("8m");
  });

  it("pon: 初ツモ (9s) を捨てると south の 1m でポン可能", () => {
    const game = presetGame(DEBUG_PRESETS.pon!);
    game.humanDiscard(13);
    expect(game.state.phase).toBe("claim");
    expect(game.state.claim?.offers.pon).toBe(true);
  });

  it("kan: 初ツモ (9s) を捨てると south の 1m で明カン可能", () => {
    const game = presetGame(DEBUG_PRESETS.kan!);
    game.humanDiscard(13);
    expect(game.state.phase).toBe("claim");
    expect(game.state.claim?.offers.kan).toBe(true);
  });

  it("chi: 初ツモ (8s) を捨てると上家 (north) の 5m で3択チー可能", () => {
    const game = presetGame(DEBUG_PRESETS.chi!);
    game.humanDiscard(13);
    expect(game.state.phase).toBe("claim");
    expect(game.state.claim?.offers.chi).toHaveLength(3);
    expect(game.state.claim?.discarder).toBe("north");
  });

  it("bigwin: 初手でツモ和了 (役満) が可能", () => {
    const game = presetGame(DEBUG_PRESETS.bigwin!);
    expect(game.state.canTsumo).toBe(true);
    expect(game.humanDeclareTsumo().success).toBe(true);
    expect(game.state.winInfo?.isYakuman).toBe(true);
  });

  it("furiten: 初ツモ (待ち牌 5m) を捨てると south の 8m をロンできない", () => {
    const game = presetGame(DEBUG_PRESETS.furiten!);
    game.humanDiscard(13); // 5m 打牌 → フリテン。south の 8m でロン窓が開かない
    expect(game.state.phase).toBe("discard");
    expect(game.state.turn).toBe("east");
    expect(game.state.winInfo).toBeNull();
  });
});
