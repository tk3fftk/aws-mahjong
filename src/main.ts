import "./ui/styles.css";
import { GameController, type ActionAttempt } from "./game";
import { render, showToast, type RenderHandlers, type UiState } from "./ui/render";
import { parseDebugConfig, type DebugConfig } from "./debug/params";
import { riggedDeal } from "./debug/rigged";
import { updateDebugPanel } from "./debug/panel";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

// ?seed=42 で再現可能な局を立てられる (手動テスト用)。seed=0 も有効値
const rawSeed = new URLSearchParams(location.search).get("seed");
const parsedSeed = rawSeed !== null && rawSeed !== "" ? Number(rawSeed) : NaN;
const seed = Number.isFinite(parsedSeed) ? parsedSeed : Date.now();

// ?debug=1 / ?debug=riichi / ?debug=1&east=... で debug mode (docs/plans 参照)。
// 不正なプリセット名はトーストを出して通常ゲームへフォールバックする
let debugConfig: DebugConfig | null = null;
try {
  debugConfig = parseDebugConfig(location.search);
} catch (e) {
  showToast((e as Error).message, 4000);
}

// 手牌の選択状態などゲーム状態に属さない一時的なUI状態。
const ui: UiState = { selectedHandIndex: null, riichiArmed: false };

function rerender(): void {
  render(root!, game.state, handlers, ui);
  if (debugConfig) updateDebugPanel(game.state, debugConfig);
}

function createGame(): GameController {
  const rig = debugConfig?.rig;
  return new GameController({
    seed,
    // 仕込み壁は局ごとに同じ wallFactory が呼ばれるため、次局以降も同一の配牌になる
    // (debug 用途では局送り後も同じ局面を再現できるのが都合よい)
    wallFactory: rig ? () => riggedDeal(rig) : undefined,
    // 仕込み時は CPU を「常に先頭牌を打牌」に固定して進行を決定的にする (テストの riggedGame と同じ)。
    // ?seed= を明示した場合はそちらを優先し、CPU の打牌を揺らせる
    rng: rig && !Number.isFinite(parsedSeed) ? () => 0 : undefined,
    // 状態が変わったら選択は無効化して再描画 (捨て/並び替え/手番交代など)
    onChange: () => {
      ui.selectedHandIndex = null;
      ui.riichiArmed = false; // 状態が変わったら armed モードは解除する
      rerender();
    },
  });
}

let game = createGame();

function orToast(result: ActionAttempt): void {
  if (!result.success) {
    showToast(result.reason ?? "実行できません");
  }
}

const handlers: RenderHandlers = {
  onTileClick: (index: number) => {
    if (ui.riichiArmed) {
      // armed モード: 牌を1クリックでリーチ宣言打牌 (候補外はトーストで拒否)。
      // onChange が armed 解除 & 再描画を行う。失敗時は armed を残して再描画する。
      const result = game.humanRiichiDiscard(index);
      if (!result.success) {
        showToast(result.reason ?? "リーチできません");
        rerender();
      }
    } else if (ui.selectedHandIndex === index) {
      // 選択済みの牌を再クリック → 捨てる。
      // humanDiscard → onChange が選択リセット & 再描画を行う。リーチ中の違反はトースト。
      orToast(game.humanDiscard(index));
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
  onNextRound: () => game.startNextRound(),
  onNewMatch: () => game.startMatch(),
  onClaimRon: () => orToast(game.humanClaim({ kind: "ron" })),
  onClaimPon: () => orToast(game.humanClaim({ kind: "pon" })),
  onClaimKan: () => orToast(game.humanClaim({ kind: "kan" })),
  onClaimChi: (optionIndex) => orToast(game.humanClaim({ kind: "chi", chiIndex: optionIndex })),
  onClaimPass: () => game.humanSkipClaim(),
  onSelfKan: (optionIndex) => orToast(game.humanSelfKan(optionIndex)),
  onRiichiToggle: () => {
    ui.riichiArmed = !ui.riichiArmed;
    ui.selectedHandIndex = null; // armed 切替時は通常選択をクリア
    rerender();
  },
};

try {
  game.startMatch();
} catch (e) {
  // riggedDeal の検証エラー (枚数違い・mpsz 不正・牌の使いすぎ)。
  // wallFactory は配牌のたびに呼ばれて再発するため、rig を捨てて通常ゲームで開始し直す
  showToast(`配牌の仕込みに失敗: ${(e as Error).message}`, 5000);
  debugConfig = debugConfig && { ...debugConfig, rig: null };
  game = createGame();
  game.startMatch();
}
