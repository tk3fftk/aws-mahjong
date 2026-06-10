import "./ui/styles.css";
import { GameController, type ActionAttempt } from "./game";
import { render, showToast, type RenderHandlers, type UiState } from "./ui/render";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

// ?seed=42 で再現可能な局を立てられる (手動テスト用)。seed=0 も有効値
const rawSeed = new URLSearchParams(location.search).get("seed");
const parsedSeed = rawSeed !== null && rawSeed !== "" ? Number(rawSeed) : NaN;
const seed = Number.isFinite(parsedSeed) ? parsedSeed : Date.now();

// 手牌の選択状態などゲーム状態に属さない一時的なUI状態。
const ui: UiState = { selectedHandIndex: null };

function rerender(): void {
  render(root!, game.state, handlers, ui);
}

const game = new GameController({
  seed,
  // 状態が変わったら選択は無効化して再描画 (捨て/並び替え/手番交代など)
  onChange: () => {
    ui.selectedHandIndex = null;
    rerender();
  },
});

function orToast(result: ActionAttempt): void {
  if (!result.success) {
    showToast(result.reason ?? "実行できません");
  }
}

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
  onDeclareTsumo: () => orToast(game.humanDeclareTsumo()),
  onNewRound: () => game.startNewRound(),
  onClaimRon: () => orToast(game.humanClaim({ kind: "ron" })),
  onClaimPon: () => orToast(game.humanClaim({ kind: "pon" })),
  onClaimKan: () => orToast(game.humanClaim({ kind: "kan" })),
  onClaimChi: (optionIndex) => orToast(game.humanClaim({ kind: "chi", chiIndex: optionIndex })),
  onClaimPass: () => game.humanSkipClaim(),
  onSelfKan: (optionIndex) => orToast(game.humanSelfKan(optionIndex)),
};

game.startNewRound();
