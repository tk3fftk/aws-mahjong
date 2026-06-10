import type { GameState, Tile, WinInfo, Seat } from "../types";
import { AWS_NAMES } from "../tiles";
import { renderTile, renderTileById } from "./tile-view";
import { openYakuHelp } from "./yaku-help";

export interface RenderHandlers {
  // 手牌クリック: 1回目で選択、選択済み牌の再クリックで捨てる (main.ts 側で判定)
  onTileClick: (index: number) => void;
  // ドラッグ&ドロップでの手牌並び替え
  onReorder: (from: number, to: number) => void;
  onDeclareTsumo: () => void;
  onNewRound: () => void;
}

// 手牌の選択状態など、ゲーム状態には属さない一時的なUI状態。
export interface UiState {
  selectedHandIndex: number | null;
}

const SEAT_NAME: Record<Seat, string> = {
  east: "あなた (東家)",
  south: "CPU (南家)",
};

const ROUND_WIND_NAME: Record<string, string> = {
  "1z": "東",
  "2z": "南",
  "3z": "西",
  "4z": "北",
};

export function render(
  root: HTMLElement,
  state: GameState,
  handlers: RenderHandlers,
  ui: UiState,
): void {
  const turnLabel = state.turn === "east" ? "あなたの番" : "CPUの番";
  const phaseLabel =
    state.phase === "win"
      ? "和了!"
      : state.phase === "draw_game"
        ? "流局"
        : turnLabel;

  root.innerHTML = `
    <header class="app-header">
      <h1>AWS Mahjong (二人対戦MVP)</h1>
      <button data-action="show-yaku-help" class="help-btn" aria-label="役一覧を表示">?</button>
    </header>
    <div class="panel">
      <div class="status">
        <span>場風: ${ROUND_WIND_NAME[state.roundWind]}</span>
        <span>${phaseLabel}</span>
        <span>山残り: ${state.wall.length}</span>
      </div>
    </div>

    ${cpuPanel(state)}

    ${state.phase === "win" && state.winInfo ? winPanel(state.winInfo) : ""}
    ${state.phase === "draw_game" ? `<div class="panel"><h2>流局</h2><p>山が尽きました。誰も和了できませんでした。</p></div>` : ""}

    ${humanPanel(state, ui)}

    <div class="panel">
      <div class="row" style="justify-content: space-between;">
        <span>あなた: ${state.players.east.score} 点</span>
        <span>CPU: ${state.players.south.score} 点</span>
      </div>
    </div>
  `;

  attachHandlers(root, state, handlers);
}

let dragSrcIndex: number | null = null;

function cpuPanel(state: GameState): string {
  const cpu = state.players.south;
  const backs = cpu.hand
    .map(() => renderTile({ id: "1m", copy: 0 }, { variant: "back" }))
    .join("");
  const discards = cpu.discards.map((t) => renderTile(t, { variant: "discard" })).join("");
  return `
    <div class="panel">
      <div class="label">${SEAT_NAME.south} ・ 手牌 ${cpu.hand.length} 枚</div>
      <div class="row">${backs}</div>
      <div class="label" style="margin-top: 8px;">捨て牌</div>
      <div class="row">${discards || "<span style=\"opacity:0.5\">なし</span>"}</div>
    </div>
  `;
}

function humanPanel(state: GameState, ui: UiState): string {
  const east = state.players.east;
  const isMyTurn = state.turn === "east" && state.phase === "discard";
  // ツモ牌は手動並び替えで位置が変わりうるので、位置ではなく参照等価で判定する。
  // (game.ts は同一 Tile オブジェクトを hand と lastDrawTile の両方に格納している)
  const handHtml = east.hand
    .map((t, i) => {
      const isDrawn = t === state.lastDrawTile;
      // ツモ牌の左マージン(分離表示)は、実際に末尾にあるときだけ付ける。
      const isSeparated = isDrawn && i === east.hand.length - 1;
      return renderTile(t, {
        variant: "hand",
        clickable: isMyTurn,
        draggable: isMyTurn,
        index: i,
        highlight: isDrawn,
        selected: i === ui.selectedHandIndex,
        extraClass: isSeparated ? "draw-separated" : undefined,
      });
    })
    .join("");
  const discards = east.discards.map((t) => renderTile(t, { variant: "discard" })).join("");
  return `
    <div class="panel">
      <div class="label">${SEAT_NAME.east} ・ 手牌 ${east.hand.length} 枚</div>
      <div class="row">${handHtml}</div>
      <div class="label" style="margin-top: 8px;">捨て牌</div>
      <div class="row">${discards || "<span style=\"opacity:0.5\">なし</span>"}</div>
      <div class="actions">
        <button data-action="tsumo" ${isMyTurn ? "" : "disabled"}>ツモ和了</button>
        ${state.phase === "win" || state.phase === "draw_game" ? '<button data-action="new-round" class="secondary">次の局へ</button>' : ""}
      </div>
    </div>
  `;
}

function winPanel(info: WinInfo): string {
  const yakuItems = info.yakus
    .map((y) => `<li><span>${y.name}</span><span>${y.han}飜</span></li>`)
    .join("");
  const tiles = info.hand.map((t) => renderTileById(t.id, { variant: "hand" })).join("");
  const winner = info.winner === "east" ? "あなた" : "CPU";
  return `
    <div class="panel win-banner">
      <h2>${winner} のツモ和了!</h2>
      <div class="row">${tiles}</div>
      <ul class="yaku-list">${yakuItems}</ul>
      <div class="row" style="justify-content: space-between;">
        <span>合計 ${info.totalHan} 飜${info.isYakuman ? " (役満)" : ""}</span>
        <span>${info.score} 点</span>
      </div>
    </div>
  `;
}

function attachHandlers(root: HTMLElement, state: GameState, handlers: RenderHandlers): void {
  root.querySelectorAll<HTMLElement>(".tile.hand.clickable").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.index);
      if (!Number.isNaN(idx)) handlers.onTileClick(idx);
    });
  });

  // ドラッグ&ドロップによる手牌並び替え
  root.querySelectorAll<HTMLElement>(".tile.hand.draggable").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      const idx = Number(el.dataset.index);
      if (Number.isNaN(idx)) return;
      dragSrcIndex = idx;
      e.dataTransfer?.setData("text/plain", String(idx));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      dragSrcIndex = null;
      el.classList.remove("dragging");
    });
    el.addEventListener("dragover", (e) => {
      // preventDefault しないと drop が発火しない
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = (e.target as HTMLElement).closest<HTMLElement>(".tile[data-index]");
      if (!target) return;
      const to = Number(target.dataset.index);
      const from = dragSrcIndex ?? Number(e.dataTransfer?.getData("text/plain"));
      if (Number.isNaN(from) || Number.isNaN(to)) return;
      handlers.onReorder(from, to);
    });
  });
  root.querySelector<HTMLButtonElement>('button[data-action="tsumo"]')?.addEventListener("click", () => {
    handlers.onDeclareTsumo();
  });
  root.querySelector<HTMLButtonElement>('button[data-action="new-round"]')?.addEventListener("click", () => {
    handlers.onNewRound();
  });
  root.querySelector<HTMLButtonElement>('button[data-action="show-yaku-help"]')?.addEventListener("click", () => {
    openYakuHelp();
  });
}

export function showToast(root: HTMLElement, message: string, durationMs = 2000): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}
