import { describe, it, expect } from "vitest";
import { GameController } from "../game";
import { riggedDeal } from "./rigged";
import { DEBUG_PRESETS } from "./presets";
import { debugPanelHtml, rigFormHtml } from "./panel";

function presetGame(name: string): GameController {
  const game = new GameController({
    wallFactory: () => riggedDeal(DEBUG_PRESETS[name]!),
    rng: () => 0,
  });
  game.startMatch();
  return game;
}

describe("debugPanelHtml", () => {
  it("riichi プリセット (14枚形): 1z 切りで 5m/8m 待ちと役プレビューが出る", () => {
    const game = presetGame("riichi");
    const html = debugPanelHtml(game.state);
    // 1z切り → 5m/8m 待ち (牌画像の src で確認)
    expect(html).toContain("1z.svg");
    expect(html).toContain("5m.svg");
    expect(html).toContain("8m.svg");
    // 役プレビュー: kiro (Kiro) が出て和了可能
    expect(html).toContain("Kiro");
    expect(html).toContain("計");
  });

  it("ron プリセット (打牌後の13枚形): 待ちが直接表示される", () => {
    const game = presetGame("ron");
    game.humanDiscard(13); // 1z 打牌 → claim フェーズで停止 (east は13枚)
    expect(game.state.phase).toBe("claim");
    const html = debugPanelHtml(game.state);
    expect(html).toContain("5m.svg");
    expect(html).toContain("8m.svg");
  });

  it("CPU 手牌が mpsz で公開される", () => {
    const game = presetGame("riichi");
    const html = debugPanelHtml(game.state);
    // south: "1m4m7m1p4p7p1s4s7s1z2z3z4z" の整列 mpsz
    expect(html).toContain("147m147p147s1234z");
  });

  it("裏ドラ表示牌と山の次ツモが見える", () => {
    const game = presetGame("riichi");
    const html = debugPanelHtml(game.state);
    // deadWall "3z9m9p9s5z4s" → 裏ドラ表示 (index5) = 4s
    expect(html).toContain("4s.svg");
    // wallHead "7z7z7z8m" → 次ツモに 7z
    expect(html).toContain("7z.svg");
    expect(html).toContain(`残り${game.state.wall.length}枚`);
  });

  it("AWS役のないテンパイは「和了不可」と表示される", () => {
    // 1z(東) 刻子のみ = 標準役はあるが AWS役なし
    const game = new GameController({
      wallFactory: () => riggedDeal({ east: "111z234m567m234p5s9p" }),
      rng: () => 0,
    });
    game.startMatch();
    const html = debugPanelHtml(game.state);
    expect(html).toContain("和了不可");
  });

  it("フリテン: 待ち牌を自分で捨てた13枚形で警告が出る", () => {
    const game = presetGame("furiten");
    game.humanDiscard(13); // 待ち牌 5m を捨てる → フリテン
    const html = debugPanelHtml(game.state);
    expect(html).toContain("フリテン");
  });
});

describe("rigFormHtml", () => {
  it("rig の値が input の初期値に入る", () => {
    const html = rigFormHtml({
      rig: { east: "555z234m567m234p55s", wallHead: "8m" },
      presetName: null,
    });
    expect(html).toContain('value="555z234m567m234p55s"');
    expect(html).toContain('value="8m"');
  });

  it("presetName が select で選択状態になり、全プリセットが選択肢に出る", () => {
    const html = rigFormHtml({ rig: DEBUG_PRESETS.riichi!, presetName: "riichi" });
    expect(html).toContain('value="riichi" selected');
    for (const name of Object.keys(DEBUG_PRESETS)) {
      expect(html).toContain(`value="${name}"`);
    }
  });

  it("config が null でもフォームは空で描画される", () => {
    const html = rigFormHtml(null);
    expect(html).toContain("debug-rig-form");
    expect(html).not.toContain("selected");
  });
});
