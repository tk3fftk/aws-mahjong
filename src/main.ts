import "./ui/styles.css";
import { GameController } from "./game";
import { render, showToast, type RenderHandlers, type UiState } from "./ui/render";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

// 手牌の選択状態などゲーム状態に属さない一時的なUI状態。
const ui: UiState = { selectedHandIndex: null };

function rerender(): void {
  render(root!, game.state, handlers, ui);
}

const game = new GameController({
  seed: Date.now(),
  // 状態が変わったら選択は無効化して再描画 (捨て/並び替え/手番交代など)
  onChange: () => {
    ui.selectedHandIndex = null;
    rerender();
  },
});

const handlers: RenderHandlers = {
  onTileClick: (index: number) => {
    if (ui.selectedHandIndex === index) {
      // 選択済みの牌を再クリック → 捨てる。
      // humanDiscard → onChange が選択リセット & 再描画を行うので、ここでは何もしない。
      game.humanDiscard(index);
    } else {
      // 1回目のクリック → 選択してハイライト。
      ui.selectedHandIndex = index;
      rerender();
    }
  },
  onReorder: (from: number, to: number) => {
    game.moveHumanTile(from, to);
  },
  onDeclareTsumo: () => {
    const result = game.humanDeclareTsumo();
    if (!result.success) {
      showToast(root, result.reason ?? "和了できません");
    }
  },
  onNewRound: () => {
    game.startNewRound();
  },
};

game.startNewRound();
