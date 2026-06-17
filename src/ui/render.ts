import type { CalledMeld, GameState, Player, Seat, WinInfo } from "../types";
import { renderTile, renderTileById } from "./tile-view";
import { openYakuHelp } from "./yaku-help";
import { doraIndicators, MAX_DORA_INDICATORS } from "../dora";
import { YAKU_LIST } from "../yaku/aws-pattern";

export interface RenderHandlers {
  // 手牌クリック: 1回目で選択、選択済み牌の再クリックで捨てる (main.ts 側で判定)
  onTileClick: (index: number) => void;
  // ドラッグ&ドロップでの手牌並び替え
  onReorder: (from: number, to: number) => void;
  onDeclareTsumo: () => void;
  onNextRound: () => void;
  onNewMatch: () => void;
  onClaimRon: () => void;
  onClaimPon: () => void;
  onClaimKan: () => void;
  onClaimChi: (optionIndex: number) => void;
  onClaimPass: () => void;
  onSelfKan: (optionIndex: number) => void;
  // リーチボタンのトグル (armed モードの ON/OFF)。打牌自体は onTileClick 経由
  onRiichiToggle: () => void;
}

// 手牌の選択状態など、ゲーム状態には属さない一時的なUI状態。
export interface UiState {
  selectedHandIndex: number | null;
  // リーチ宣言の「armed」モード: ON のとき候補牌を1クリックで宣言打牌する
  riichiArmed: boolean;
}

// 卓の配置: 自分 (east) が下辺固定。ターン順は east→south→west→north なので、
// 右=下家 (south)、上=対面 (west)、左=上家 (north)。
// 「左の河からチーできる」直感は旧レイアウトから引き継ぐ。
const OPPONENT_ZONES: { pos: "top" | "left" | "right"; seat: Seat }[] = [
  { pos: "top", seat: "west" },
  { pos: "left", seat: "north" },
  { pos: "right", seat: "south" },
];

const ALL_SEATS: Seat[] = ["east", "south", "west", "north"];

// 中央スクエア内の点数チップの配置 (物理席に対応)
const CHIP_POS: Record<Seat, string> = {
  east: "bottom",
  south: "right",
  west: "top",
  north: "left",
};

const ROUND_WIND_NAME: Record<string, string> = {
  "1z": "東",
  "2z": "南",
  "3z": "西",
  "4z": "北",
};

// 家 (自風) は局送りで回るため、ラベルは player.seatWind から動的に作る
function seatName(player: Player): string {
  return `${player.isHuman ? "あなた" : "CPU"} (${ROUND_WIND_NAME[player.seatWind]}家)`;
}

const MELD_LABEL: Record<CalledMeld["kind"], string> = {
  chi: "チー",
  pon: "ポン",
  minkan: "カン",
  ankan: "暗カン",
  kakan: "加カン",
  "aws-kan": "AWSカン",
};

// AWSカン宣言ボタン用: 役 ID → 表示名
const AWS_KAN_NAME = new Map(YAKU_LIST.map((e) => [e.id, e.name]));

// 手番ハイライト: 打牌待ちのプレイヤーだけ光らせる
function isActiveSeat(state: GameState, seat: Seat): boolean {
  return state.turn === seat && state.phase === "discard";
}

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
    : state.phase === "round_end" ? "終局"
    : state.turn === "east" ? "あなたの番"
    : `${seatName(state.players[state.turn])}の番`;

  root.innerHTML = `
    <header class="app-header">
      <h1>AWS Mahjong</h1>
      <span class="phase-chip">${phaseLabel}</span>
      <button data-action="show-yaku-help" class="help-btn" aria-label="役一覧を表示">?</button>
    </header>

    <div class="table">
      ${OPPONENT_ZONES.map(({ pos, seat }) => opponentZone(state, seat, pos)).join("")}
      ${centerSquare(state)}
      <div class="zone zone-bottom${isActiveSeat(state, "east") ? " active" : ""}" data-seat="east">
        <div class="zone-inner">
          ${riverHtml(state, state.players.east)}
        </div>
      </div>
    </div>

    ${handArea(state, ui)}
    ${modalHtml(state)}
  `;

  attachHandlers(root, handlers);
}

let dragSrcIndex: number | null = null;

function opponentZone(state: GameState, seat: Seat, pos: "top" | "left" | "right"): string {
  const player = state.players[seat];
  const active = isActiveSeat(state, seat) ? " active" : "";
  const backs = player.hand
    .map(() => renderTile({ id: "1m", copy: 0 }, { variant: "back", extraClass: "compact" }))
    .join("");
  // .zone-inner はローカル座標 (自分が下辺のつもり) で組む。
  // ローカル上=回転後に中央側 → 河、ローカル下=卓の外縁側 → 裏牌+副露。
  return `
    <div class="zone zone-${pos}${active}" data-seat="${seat}">
      <div class="zone-inner">
        ${riverHtml(state, player)}
        <div class="opp-meta">
          <div class="hand-backs">${backs}</div>
          ${meldsRow(player)}
        </div>
      </div>
    </div>
  `;
}

function centerSquare(state: GameState): string {
  const chips = ALL_SEATS.map((seat) => {
    const player = state.players[seat];
    const active = isActiveSeat(state, seat) ? " active" : "";
    return `
      <div class="score-chip chip-${CHIP_POS[seat]}${active}">
        <span class="chip-name">${player.isHuman ? "あなた" : "CPU"}</span>
        <b>${ROUND_WIND_NAME[player.seatWind]}</b>
        <span class="chip-score">${player.score}</span>
        ${player.isDealer ? '<span class="dealer">親</span>' : ""}
        ${player.isRiichi ? '<span class="riichi-stick">リーチ</span>' : ""}
      </div>
    `;
  }).join("");
  // ドラ表示牌: 5スロット固定。未公開は裏向き (カンでめくれる演出が分かりやすい)
  const revealed = doraIndicators(state.deadWall, state.doraIndicatorCount);
  const doraTiles = [
    ...revealed.map((t) => renderTileById(t.id, { variant: "discard" })),
    ...Array.from({ length: Math.max(0, MAX_DORA_INDICATORS - revealed.length) }, () =>
      renderTile({ id: "1m", copy: 0 }, { variant: "back" }),
    ),
  ].join("");
  return `
    <div class="center">
      <div class="center-info">
        <div class="round">${ROUND_WIND_NAME[state.roundWind]}${state.roundIndex + 1}局</div>
        <div class="wall">山 ${state.wall.length}</div>
        ${state.riichiPot > 0 ? `<div class="pot">供託 ${state.riichiPot}</div>` : ""}
        <div class="dora-row" title="ドラ表示牌">${doraTiles}</div>
      </div>
      ${chips}
    </div>
  `;
}

function handArea(state: GameState, ui: UiState): string {
  const east = state.players.east;
  const isMyTurn = state.turn === "east" && state.phase === "discard";
  const armed = ui.riichiArmed && state.riichiCandidates.length > 0;
  // ツモ牌は手動並び替えで位置が変わりうるので、位置ではなく参照等価で判定する。
  // (game.ts は同一 Tile オブジェクトを hand と lastDrawTile の両方に格納している)
  const handHtml = east.hand
    .map((t, i) => {
      const isDrawn = t === state.lastDrawTile;
      // ツモ牌の左マージン(分離表示)は、実際に末尾にあるときだけ付ける。
      const isSeparated = isDrawn && i === east.hand.length - 1;
      // armed モードでは宣言可能な牌だけを強調し、それ以外は薄くしてクリック不可にする
      const riichiClass = armed
        ? state.riichiCandidates.includes(i)
          ? "riichi-ok"
          : "riichi-ng"
        : undefined;
      return renderTile(t, {
        variant: "hand",
        clickable: isMyTurn,
        draggable: isMyTurn,
        index: i,
        highlight: isDrawn,
        selected: i === ui.selectedHandIndex,
        extraClass: [isSeparated ? "draw-separated" : "", riichiClass ?? ""]
          .filter(Boolean)
          .join(" ") || undefined,
      });
    })
    .join("");
  return `
    <div class="hand-area">
      ${actionsHtml(state, ui)}
      <div class="hand-bar">
        <div class="hand-row">${handHtml}</div>
        ${meldsRow(east, "human-melds")}
      </div>
    </div>
  `;
}

function meldsRow(player: Player, extraClass = ""): string {
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
  return `<div class="melds${extraClass ? ` ${extraClass}` : ""}">${melds}</div>`;
}

function riverHtml(state: GameState, player: Player): string {
  const last = state.lastDiscard;
  const tiles = player.discards.map((t, i) => {
    const isLast =
      last !== null &&
      last.seat === player.seat &&
      i === player.discards.length - 1 &&
      t.id === last.tile.id &&
      t.copy === last.tile.copy;
    // リーチ宣言牌は横向き表示 (discards に残っている範囲のみ。鳴かれて消えた場合は次の打牌位置)
    const isRiichiTile = player.riichiDiscardIndex === i && i < player.discards.length;
    const classes = [isLast ? "last-discard" : "", isRiichiTile ? "riichi-tile" : ""]
      .filter(Boolean)
      .join(" ");
    return renderTile(t, { variant: "discard", extraClass: classes });
  });
  // 6枚×2段 + 3段目は無制限に横へ伸びる (河は18枚を超えうる)
  const rows = [tiles.slice(0, 6), tiles.slice(6, 12), tiles.slice(12)];
  const rowsHtml = rows
    .filter((row) => row.length > 0)
    .map((row, r) => `<div class="river-row${r === 2 ? " row-overflow" : ""}">${row.join("")}</div>`)
    .join("");
  return `<div class="river">${rowsHtml}</div>`;
}

function actionsHtml(state: GameState, ui: UiState): string {
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
        <span class="claim-label">${seatName(state.players[claim.discarder])} の ${renderTileById(claim.tile.id, { variant: "discard", extraClass: "claimed" })} に:</span>
        ${claim.offers.ron ? '<button data-action="claim-ron" class="ron">ロン</button>' : ""}
        ${claim.offers.kan ? '<button data-action="claim-kan">カン</button>' : ""}
        ${claim.offers.pon ? '<button data-action="claim-pon">ポン</button>' : ""}
        ${chiButtons}
        <button data-action="claim-pass" class="secondary">パス</button>
      </div>
    `;
  }
  const isMyTurn = state.turn === "east" && state.phase === "discard";
  // 和了形 + AWS役必須を満たすときだけ押せる (GameController が計算済み)
  const canTsumo = isMyTurn && state.canTsumo;
  const selfKanButtons = isMyTurn
    ? state.selfKanOptions
        .map((opt, i) => {
          if (opt.kind === "aws-kan") {
            const name = AWS_KAN_NAME.get(opt.yakuId) ?? "AWSカン";
            const tiles = opt.tileIds
              .map((id) => renderTileById(id, { variant: "discard" }))
              .join("");
            return `
            <button data-action="self-kan" data-kan="${i}">
              AWSカン: ${name}
              ${tiles}
            </button>`;
          }
          return `
            <button data-action="self-kan" data-kan="${i}">
              ${opt.kind === "ankan" ? "暗カン" : "加カン"}
              ${renderTileById(opt.tileId, { variant: "discard" })}
            </button>`;
        })
        .join("")
    : "";
  // リーチボタン: 宣言可能な打牌があるときだけ表示。armed 中は押下状態を示す
  const riichiButton =
    isMyTurn && state.riichiCandidates.length > 0
      ? `<button data-action="riichi" class="riichi${ui.riichiArmed ? " armed" : ""}">リーチ</button>`
      : "";
  return `
    <div class="actions">
      <button data-action="tsumo" ${canTsumo ? "" : "disabled"}>ツモ和了</button>
      ${riichiButton}
      ${selfKanButtons}
    </div>
  `;
}

// 和了/流局/終局はインラインではなくモーダルで盤面の上に重ねる。
// state 駆動なので root 内に描画する (attachHandlers がそのまま効く)。
// 「次の局へ」ボタンは attachHandlers の querySelector (先頭1件) が拾うため、
// モーダル内の1個だけに置くこと。
function modalHtml(state: GameState): string {
  if (state.phase === "win" && state.winInfo) {
    return modalWrap(winPanel(state, state.winInfo) + nextRoundButton(state));
  }
  if (state.phase === "draw_game") {
    return modalWrap(
      `<h2>流局</h2><p>山が尽きました。誰も和了できませんでした。</p>` + nextRoundButton(state),
    );
  }
  if (state.phase === "round_end") {
    return modalWrap(roundEndPanel(state));
  }
  return "";
}

function modalWrap(content: string): string {
  return `<div class="modal-overlay"><div class="modal">${content}</div></div>`;
}

function nextRoundButton(state: GameState): string {
  return `
    <div class="actions">
      <button data-action="new-round">${state.roundIndex >= 3 ? "結果発表へ" : "次の局へ"}</button>
    </div>
  `;
}

function winPanel(state: GameState, info: WinInfo): string {
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
        `<li><span>${seatName(state.players[p.seat])}</span><span>${p.delta > 0 ? "+" : ""}${p.delta}</span></li>`,
    )
    .join("");
  const winnerLabel = info.winner === "east" ? "あなた" : seatName(state.players[info.winner]);
  const loser =
    info.loserSeat !== null
      ? `<p class="loser-label">放銃: ${seatName(state.players[info.loserSeat])}</p>`
      : "";
  // 裏ドラ表示牌 (リーチ和了のみ非 null)。裏ドラ飜は yakus の「裏ドラ」行として既に表示される
  const uraRow =
    info.uraIndicators !== null
      ? `<div class="row ura-row" title="裏ドラ表示牌">
          <span class="ura-label">裏ドラ</span>
          ${info.uraIndicators.map((id) => renderTileById(id, { variant: "discard" })).join("")}
        </div>`
      : "";
  // 供託 (リーチ棒) の獲得は payments とは別枠で表示する
  const potRow =
    info.riichiPotWon > 0
      ? `<li class="pot-won"><span>供託</span><span>+${info.riichiPotWon}</span></li>`
      : "";
  return `
    <h2>${winnerLabel} の${info.isTsumo ? "ツモ" : "ロン"}和了!</h2>
    ${loser}
    <div class="row">${tiles}</div>
    ${meldTiles ? `<div class="melds">${meldTiles}</div>` : ""}
    ${uraRow}
    <ul class="yaku-list">${yakuItems}</ul>
    <div class="row" style="justify-content: space-between;">
      <span>合計 ${info.isYakuman ? "" : `${info.fu}符 `}${info.totalHan}飜${info.isYakuman ? " (役満)" : ""}</span>
      <span>${info.score} 点</span>
    </div>
    <ul class="yaku-list payments">${paymentRows}${potRow}</ul>
  `;
}

/** 終局 (東4終了後) の最終順位表 */
function roundEndPanel(state: GameState): string {
  const standings = ALL_SEATS
    .map((seat) => state.players[seat])
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : ALL_SEATS.indexOf(a.seat) - ALL_SEATS.indexOf(b.seat),
    );
  const rows = standings
    .map(
      (player, i) => `
        <li class="${player.isHuman ? "me" : ""}">
          <span>${i + 1}位 ${seatName(player)}</span>
          <span>${player.score} 点</span>
        </li>`,
    )
    .join("");
  return `
    <h2>終局 — 最終結果</h2>
    <ul class="yaku-list standings">${rows}</ul>
    <div class="actions">
      <button data-action="new-match">もう一度遊ぶ</button>
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
  on('button[data-action="new-round"]', () => handlers.onNextRound());
  on('button[data-action="new-match"]', () => handlers.onNewMatch());
  on('button[data-action="show-yaku-help"]', () => openYakuHelp());
  on('button[data-action="claim-ron"]', () => handlers.onClaimRon());
  on('button[data-action="claim-kan"]', () => handlers.onClaimKan());
  on('button[data-action="claim-pon"]', () => handlers.onClaimPon());
  on('button[data-action="claim-pass"]', () => handlers.onClaimPass());
  on('button[data-action="riichi"]', () => handlers.onRiichiToggle());
  root.querySelectorAll<HTMLElement>('button[data-action="claim-chi"]').forEach((el) => {
    el.addEventListener("click", () => handlers.onClaimChi(Number(el.dataset.chi)));
  });
  root.querySelectorAll<HTMLElement>('button[data-action="self-kan"]').forEach((el) => {
    el.addEventListener("click", () => handlers.onSelfKan(Number(el.dataset.kan)));
  });
}

export function renderFatal(root: HTMLElement, headline: string, seed: number): void {
  // 想定外例外の最後の砦。innerHTML を使わず textContent で安全に組み立てる。
  // root を差し替えて壊れた盤面の操作続行を防ぎ、リロードでの復旧を案内する。
  root.replaceChildren();
  const box = document.createElement("div");
  box.className = "fatal";

  const title = document.createElement("h2");
  title.className = "fatal-title";
  title.textContent = `🚨 ${headline}`;

  const hint = document.createElement("p");
  hint.className = "fatal-hint";
  hint.textContent = "ページをリロードすると復旧します。";

  const seedLine = document.createElement("p");
  seedLine.className = "fatal-seed";
  seedLine.textContent = `seed=${seed}`;

  const reload = document.createElement("button");
  reload.className = "fatal-reload";
  reload.textContent = "リロード";
  reload.addEventListener("click", () => location.reload());

  box.append(title, hint, seedLine, reload);
  root.appendChild(box);
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
