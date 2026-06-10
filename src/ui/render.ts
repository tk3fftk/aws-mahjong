import type { CalledMeld, GameState, Player, Seat, WinInfo } from "../types";
import { renderTile, renderTileById } from "./tile-view";
import { openYakuHelp } from "./yaku-help";

export interface RenderHandlers {
  // 手牌クリック: 1回目で選択、選択済み牌の再クリックで捨てる (main.ts 側で判定)
  onTileClick: (index: number) => void;
  // ドラッグ&ドロップでの手牌並び替え
  onReorder: (from: number, to: number) => void;
  onDeclareTsumo: () => void;
  onNewRound: () => void;
  onClaimRon: () => void;
  onClaimPon: () => void;
  onClaimKan: () => void;
  onClaimChi: (optionIndex: number) => void;
  onClaimPass: () => void;
  onSelfKan: (optionIndex: number) => void;
}

// 手牌の選択状態など、ゲーム状態には属さない一時的なUI状態。
export interface UiState {
  selectedHandIndex: number | null;
}

const SEAT_NAME: Record<Seat, string> = {
  east: "あなた (東家)",
  south: "CPU (南家)",
  west: "CPU (西家)",
  north: "CPU (北家)",
};

// 上段の CPU 並び。左=北家 (上家) なので「左のパネルからチーできる」直感に合う
const CPU_GRID_ORDER: Seat[] = ["north", "west", "south"];

const ALL_SEATS: Seat[] = ["east", "south", "west", "north"];

const ROUND_WIND_NAME: Record<string, string> = {
  "1z": "東",
  "2z": "南",
  "3z": "西",
  "4z": "北",
};

const MELD_LABEL: Record<CalledMeld["kind"], string> = {
  chi: "チー",
  pon: "ポン",
  minkan: "カン",
  ankan: "暗カン",
  kakan: "加カン",
};

export function render(
  root: HTMLElement,
  state: GameState,
  handlers: RenderHandlers,
  ui: UiState,
): void {
  const phaseLabel =
    state.phase === "win" ? "和了!"
    : state.phase === "draw_game" ? "流局"
    : state.phase === "claim" ? "鳴き選択中"
    : state.turn === "east" ? "あなたの番"
    : `${SEAT_NAME[state.turn]}の番`;

  root.innerHTML = `
    <header class="app-header">
      <h1>AWS Mahjong</h1>
      <button data-action="show-yaku-help" class="help-btn" aria-label="役一覧を表示">?</button>
    </header>
    <div class="panel">
      <div class="status">
        <span>場風: ${ROUND_WIND_NAME[state.roundWind]}</span>
        <span>${phaseLabel}</span>
        <span>山残り: ${state.wall.length}</span>
      </div>
    </div>

    <div class="cpu-grid">
      ${CPU_GRID_ORDER.map((seat) => cpuPanel(state, seat)).join("")}
    </div>

    ${state.phase === "win" && state.winInfo ? winPanel(state.winInfo) : ""}
    ${state.phase === "draw_game" ? `<div class="panel"><h2>流局</h2><p>山が尽きました。誰も和了できませんでした。</p></div>` : ""}

    ${humanPanel(state, ui)}

    <div class="panel scores">
      ${ALL_SEATS.map((seat) => scoreCell(state, seat)).join("")}
    </div>
  `;

  attachHandlers(root, handlers);
}

let dragSrcIndex: number | null = null;

function cpuPanel(state: GameState, seat: Seat): string {
  const player = state.players[seat];
  const active = state.turn === seat && state.phase === "discard" ? " active" : "";
  const backs = player.hand
    .map(() => renderTile({ id: "1m", copy: 0 }, { variant: "back", extraClass: "compact" }))
    .join("");
  return `
    <section class="panel seat-panel${active}" data-seat="${seat}">
      <div class="label">${SEAT_NAME[seat]} ・ ${player.hand.length}枚</div>
      <div class="row">${backs}</div>
      ${meldsRow(player)}
      <div class="label" style="margin-top: 8px;">捨て牌</div>
      ${riverHtml(state, player)}
    </section>
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
  return `
    <section class="panel seat-panel human${isMyTurn ? " active" : ""}" data-seat="east">
      <div class="label">${SEAT_NAME.east} ・ 手牌 ${east.hand.length} 枚</div>
      <div class="row">${handHtml}</div>
      ${meldsRow(east)}
      <div class="label" style="margin-top: 8px;">捨て牌</div>
      ${riverHtml(state, east)}
      ${actionsHtml(state)}
    </section>
  `;
}

function meldsRow(player: Player): string {
  if (player.melds.length === 0) return "";
  const melds = player.melds
    .map((meld) => {
      const tiles = meld.tiles
        .map((t, i) => {
          // 暗槓は両端を裏向きに
          if (meld.kind === "ankan" && (i === 0 || i === meld.tiles.length - 1)) {
            return renderTile(t, { variant: "back", extraClass: "compact" });
          }
          const isClaimed =
            meld.calledTile !== null &&
            t.id === meld.calledTile.id &&
            t.copy === meld.calledTile.copy;
          return renderTile(t, { variant: "discard", extraClass: isClaimed ? "claimed" : "" });
        })
        .join("");
      return `
        <span class="meld" data-kind="${meld.kind}">
          <span class="meld-label">${MELD_LABEL[meld.kind]}</span>
          ${tiles}
        </span>
      `;
    })
    .join("");
  return `<div class="melds">${melds}</div>`;
}

function riverHtml(state: GameState, player: Player): string {
  if (player.discards.length === 0) {
    return `<div class="river"><span style="opacity:0.5">なし</span></div>`;
  }
  const last = state.lastDiscard;
  const tiles = player.discards
    .map((t, i) => {
      const isLast =
        last !== null &&
        last.seat === player.seat &&
        i === player.discards.length - 1 &&
        t.id === last.tile.id &&
        t.copy === last.tile.copy;
      return renderTile(t, { variant: "discard", extraClass: isLast ? "last-discard" : "" });
    })
    .join("");
  return `<div class="river">${tiles}</div>`;
}

function actionsHtml(state: GameState): string {
  if (state.phase === "claim" && state.claim) {
    const claim = state.claim;
    const chiButtons = claim.offers.chi
      .map(
        (variant, i) => `
          <button class="chi-option" data-action="claim-chi" data-chi="${i}" title="チー">
            <span class="chi-label">チー</span>
            ${variant.tiles.map((t) => renderTileById(t.id, { variant: "discard" })).join("")}
            ${renderTileById(claim.tile.id, { variant: "discard", extraClass: "claimed" })}
          </button>`,
      )
      .join("");
    return `
      <div class="actions claim-actions">
        <span class="claim-label">${SEAT_NAME[claim.discarder]} の ${renderTileById(claim.tile.id, { variant: "discard", extraClass: "claimed" })} に:</span>
        ${claim.offers.ron ? '<button data-action="claim-ron" class="ron">ロン</button>' : ""}
        ${claim.offers.kan ? '<button data-action="claim-kan">カン</button>' : ""}
        ${claim.offers.pon ? '<button data-action="claim-pon">ポン</button>' : ""}
        ${chiButtons}
        <button data-action="claim-pass" class="secondary">パス</button>
      </div>
    `;
  }
  const isMyTurn = state.turn === "east" && state.phase === "discard";
  const canTsumo = isMyTurn && state.lastDrawTile !== null;
  const selfKanButtons = isMyTurn
    ? state.selfKanOptions
        .map(
          (opt, i) => `
            <button data-action="self-kan" data-kan="${i}">
              ${opt.kind === "ankan" ? "暗カン" : "加カン"}
              ${renderTileById(opt.tileId, { variant: "discard" })}
            </button>`,
        )
        .join("")
    : "";
  return `
    <div class="actions">
      <button data-action="tsumo" ${canTsumo ? "" : "disabled"}>ツモ和了</button>
      ${selfKanButtons}
      ${state.phase === "win" || state.phase === "draw_game" ? '<button data-action="new-round" class="secondary">次の局へ</button>' : ""}
    </div>
  `;
}

function winPanel(info: WinInfo): string {
  const yakuItems = info.yakus
    .map((y) => `<li><span>${y.name}</span><span>${y.han}飜</span></li>`)
    .join("");
  const tiles = info.hand.map((t) => renderTileById(t.id, { variant: "hand" })).join("");
  const meldTiles = info.melds
    .map(
      (meld) => `
        <span class="meld" data-kind="${meld.kind}">
          <span class="meld-label">${MELD_LABEL[meld.kind]}</span>
          ${meld.tiles.map((t) => renderTileById(t.id, { variant: "discard" })).join("")}
        </span>`,
    )
    .join("");
  const paymentRows = info.payments
    .map(
      (p) =>
        `<li><span>${SEAT_NAME[p.seat]}</span><span>${p.delta > 0 ? "+" : ""}${p.delta}</span></li>`,
    )
    .join("");
  const winnerLabel = info.winner === "east" ? "あなた" : SEAT_NAME[info.winner];
  const loser =
    info.loserSeat !== null ? `<p class="loser-label">放銃: ${SEAT_NAME[info.loserSeat]}</p>` : "";
  return `
    <div class="panel win-banner">
      <h2>${winnerLabel} の${info.isTsumo ? "ツモ" : "ロン"}和了!</h2>
      ${loser}
      <div class="row">${tiles}</div>
      ${meldTiles ? `<div class="melds">${meldTiles}</div>` : ""}
      <ul class="yaku-list">${yakuItems}</ul>
      <div class="row" style="justify-content: space-between;">
        <span>合計 ${info.totalHan} 飜${info.isYakuman ? " (役満)" : ""}</span>
        <span>${info.score} 点</span>
      </div>
      <ul class="yaku-list payments">${paymentRows}</ul>
    </div>
  `;
}

function scoreCell(state: GameState, seat: Seat): string {
  const player = state.players[seat];
  return `
    <div class="score-cell">
      <div class="label">${SEAT_NAME[seat]}${player.isDealer ? " ・親" : ""}</div>
      <div>${player.score} 点</div>
    </div>
  `;
}

function attachHandlers(root: HTMLElement, handlers: RenderHandlers): void {
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
  const on = (selector: string, fn: () => void) => {
    root.querySelector<HTMLButtonElement>(selector)?.addEventListener("click", fn);
  };
  on('button[data-action="tsumo"]', () => handlers.onDeclareTsumo());
  on('button[data-action="new-round"]', () => handlers.onNewRound());
  on('button[data-action="show-yaku-help"]', () => openYakuHelp());
  on('button[data-action="claim-ron"]', () => handlers.onClaimRon());
  on('button[data-action="claim-kan"]', () => handlers.onClaimKan());
  on('button[data-action="claim-pon"]', () => handlers.onClaimPon());
  on('button[data-action="claim-pass"]', () => handlers.onClaimPass());
  root.querySelectorAll<HTMLElement>('button[data-action="claim-chi"]').forEach((el) => {
    el.addEventListener("click", () => handlers.onClaimChi(Number(el.dataset.chi)));
  });
  root.querySelectorAll<HTMLElement>('button[data-action="self-kan"]').forEach((el) => {
    el.addEventListener("click", () => handlers.onSelfKan(Number(el.dataset.kan)));
  });
}

export function showToast(message: string, durationMs = 2000): void {
  // #app は再描画のたびに innerHTML 全置換されるため、body 直下にマウントして
  // トーストが表示中に消えないようにする (yaku-help のオーバーレイと同じ理由)
  document.querySelectorAll(".toast").forEach((el) => el.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}
