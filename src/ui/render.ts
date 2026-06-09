import type { GameState, Tile, WinInfo, Seat } from "../types";
import { AWS_NAMES } from "../tiles";
import { renderTile, renderTileById } from "./tile-view";

export interface RenderHandlers {
  onDiscard: (index: number) => void;
  onDeclareTsumo: () => void;
  onNewRound: () => void;
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

export function render(root: HTMLElement, state: GameState, handlers: RenderHandlers): void {
  const turnLabel = state.turn === "east" ? "あなたの番" : "CPUの番";
  const phaseLabel =
    state.phase === "win"
      ? "和了!"
      : state.phase === "draw_game"
        ? "流局"
        : turnLabel;

  root.innerHTML = `
    <h1>AWS Mahjong (二人対戦MVP)</h1>
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

    ${humanPanel(state)}

    <div class="panel">
      <div class="row" style="justify-content: space-between;">
        <span>あなた: ${state.players.east.score} 点</span>
        <span>CPU: ${state.players.south.score} 点</span>
      </div>
    </div>
  `;

  attachHandlers(root, state, handlers);
}

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

function humanPanel(state: GameState): string {
  const east = state.players.east;
  const isMyTurn = state.turn === "east" && state.phase === "discard";
  const lastDraw = state.lastDrawTile;
  // 最新ツモ牌は手牌末尾。視覚的に分離するため、末尾とそれ以外を分けて描画。
  const handHtml = east.hand
    .map((t, i) => {
      const isLast = lastDraw && t.id === lastDraw.id && i === east.hand.length - 1;
      return renderTile(t, {
        variant: "hand",
        clickable: isMyTurn,
        index: i,
        highlight: !!isLast,
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
      if (!Number.isNaN(idx)) handlers.onDiscard(idx);
    });
  });
  root.querySelector<HTMLButtonElement>('button[data-action="tsumo"]')?.addEventListener("click", () => {
    handlers.onDeclareTsumo();
  });
  root.querySelector<HTMLButtonElement>('button[data-action="new-round"]')?.addEventListener("click", () => {
    handlers.onNewRound();
  });
}

export function showToast(root: HTMLElement, message: string, durationMs = 2000): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}
