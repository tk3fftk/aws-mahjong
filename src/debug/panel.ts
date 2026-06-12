import type { Copy, GameState, Player, Seat, Tile, TileId } from "../types";
import { sortTiles, tilesToMpsz } from "../tiles";
import { winningTiles } from "../winning/furiten";
import { canWin } from "../winning/check";
import { effectiveHandTiles, isMenzenHand } from "../winning/melds";
import { judgeYaku, canDeclareWin, type JudgeContext } from "../yaku/judge";
import { uraDoraIndicators } from "../dora";
import { renderTileById } from "../ui/tile-view";
import { DEBUG_PRESETS } from "./presets";
import type { DebugConfig } from "./params";
import type { RiggedDeal } from "./rigged";

const CPU_SEATS: Seat[] = ["south", "west", "north"];
const SEAT_LABELS: Record<Seat, string> = {
  east: "自分",
  south: "南家",
  west: "西家",
  north: "北家",
};

// 配牌編集フォームのフィールド (RiggedDeal のキーと1対1)
const RIG_FIELDS: Array<{ key: keyof RiggedDeal; label: string; placeholder: string }> = [
  { key: "east", label: "自分", placeholder: "14枚 (末尾=初ツモ)" },
  { key: "south", label: "南家", placeholder: "13枚 / 空欄=ランダム" },
  { key: "west", label: "西家", placeholder: "13枚 / 空欄=ランダム" },
  { key: "north", label: "北家", placeholder: "13枚 / 空欄=ランダム" },
  { key: "wallHead", label: "山先頭", placeholder: "ツモ順に並ぶ" },
  { key: "deadWall", label: "王牌", placeholder: "先頭=ドラ表示, 6枚目=裏ドラ" },
  { key: "wallEnd", label: "山末尾", placeholder: "先頭=リンシャン1枚目" },
];

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function tileImgs(ids: TileId[]): string {
  return ids.map((id) => renderTileById(id, { variant: "discard" })).join("");
}

/** 和了牌1種をロン和了したと仮定したときの役プレビュー (ドラ・一発は含まない) */
function previewWaitYaku(
  concealed: Tile[],
  player: Player,
  ctx: JudgeContext,
  id: TileId,
): string {
  const full: Tile[] = [...concealed, { id, copy: 0 as Copy }];
  const winForm = canWin(full, player.melds);
  if (!winForm) return "";
  const judge = judgeYaku(winForm, effectiveHandTiles(full, player.melds), ctx);
  const names = judge.yakus.map((y) => `${y.name}${y.han}`).join(" ");
  const ok = canDeclareWin(judge.yakus, judge.isYakuman);
  const cls = ok ? "ok" : "ng";
  const suffix = ok ? `計${judge.totalHan}飜` : "和了不可 (AWS役なし)";
  return `<span class="${cls}">${names || "役なし"} → ${suffix}</span>`;
}

/** 13枚形 (打牌後) の待ち一覧。1行 = 待ち牌 + 役プレビュー */
function waitsSection(concealed: Tile[], player: Player, ctx: JudgeContext): string {
  const waits = winningTiles(concealed, player.melds);
  if (waits.length === 0) return `<div class="debug-row">ノーテン</div>`;
  const rows = waits
    .map(
      (id) =>
        `<div class="debug-row">${tileImgs([id])} ${previewWaitYaku(concealed, player, ctx, id)}</div>`,
    )
    .join("");
  return rows;
}

/** 14枚形 (打牌待ち) の「切る牌 → 待ち」一覧。テンパイを保つ打牌のみ。同一IDはまとめる */
function discardToWaitsSection(player: Player, ctx: JudgeContext): string {
  const hand = player.hand;
  const seen = new Set<TileId>();
  const rows: string[] = [];
  for (let i = 0; i < hand.length; i++) {
    const id = hand[i]!.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const rest = hand.filter((_, j) => j !== i);
    const waits = winningTiles(rest, player.melds);
    if (waits.length === 0) continue;
    const previews = waits
      .map((w) => `${tileImgs([w])} ${previewWaitYaku(rest, player, ctx, w)}`)
      .join("<br>");
    rows.push(
      `<div class="debug-row">${tileImgs([id])}切り →<div class="debug-indent">${previews}</div></div>`,
    );
  }
  if (rows.length === 0) return `<div class="debug-row">テンパイなし (どの打牌でもノーテン)</div>`;
  return rows.join("");
}

function furitenLabel(player: Player, concealed: Tile[]): string {
  const waits = player.isRiichi
    ? player.riichiWaits
    : winningTiles(concealed, player.melds);
  const hit = waits.length > 0 && player.discardedIds.some((id) => waits.includes(id));
  const parts: string[] = [];
  if (hit) parts.push(`<span class="ng">フリテン (河に待ち牌あり)</span>`);
  if (player.permanentFuriten) parts.push(`<span class="ng">リーチ後見逃し (ロン不可)</span>`);
  if (parts.length === 0) parts.push("なし");
  return parts.join(" / ");
}

/**
 * debug panel の情報部 (状態に応じて毎回更新される部分) の HTML。
 * 役プレビューはロン仮定 (isTsumo=false)・ドラ/一発を含まない概算。
 */
export function debugPanelHtml(state: GameState): string {
  const me = state.players.east;
  const isWaitingDiscard = me.hand.length % 3 === 2; // 打牌待ち (ツモ後 or 鳴き後)
  const ctx: JudgeContext = {
    isTsumo: false,
    isMenzen: isMenzenHand(me.melds),
    seatWind: me.seatWind,
    roundWind: state.roundWind,
    isRiichi: me.isRiichi,
  };

  const waitsHtml = isWaitingDiscard
    ? discardToWaitsSection(me, ctx)
    : waitsSection(me.hand, me, ctx);
  // フリテン判定は打牌後の13枚形が対象。14枚形では参考値として打牌前の手をそのまま見ない
  const furitenHtml = isWaitingDiscard && !me.isRiichi
    ? "打牌待ち (打牌後に確定)"
    : furitenLabel(me, me.hand);

  const cpuRows = CPU_SEATS.map((seat) => {
    const p = state.players[seat];
    const hand = tilesToMpsz(sortTiles(p.hand).map((t) => t.id));
    const melds = p.melds
      .map((m) => `[${m.kind} ${tilesToMpsz(m.tiles.map((t) => t.id))}]`)
      .join(" ");
    const riichi = p.isRiichi ? " <span class='ok'>リーチ</span>" : "";
    return `<div class="debug-row">${SEAT_LABELS[seat]}: <code>${hand}</code> ${melds}${riichi}</div>`;
  }).join("");

  const ura = uraDoraIndicators(state.deadWall, state.doraIndicatorCount);
  const nextDraws = state.wall.slice(0, 4); // drawFromWall は山先頭 [0] から取る

  return `
    <section><h4>待ち / 役 (ロン仮定・ドラ除く)</h4>${waitsHtml}</section>
    <section><h4>フリテン</h4><div class="debug-row">${furitenHtml}</div></section>
    <section><h4>CPU 手牌</h4>${cpuRows}</section>
    <section><h4>裏ドラ表示牌</h4><div class="debug-row">${tileImgs(ura.map((t) => t.id))}</div></section>
    <section><h4>山 (残り${state.wall.length}枚 / 次ツモ→)</h4><div class="debug-row">${tileImgs(nextDraws.map((t) => t.id))}</div></section>
  `;
}

/** 配牌編集フォーム (panel 生成時に一度だけ描画され、再描画で消えない) */
export function rigFormHtml(config: DebugConfig | null): string {
  const rig = config?.rig ?? {};
  const inputs = RIG_FIELDS.map(({ key, label, placeholder }) => {
    const value = rig[key] ? `value="${escapeAttr(rig[key]!)}"` : "";
    return `<label class="debug-field">${label}
      <input type="text" name="${key}" ${value} placeholder="${placeholder}" spellcheck="false">
    </label>`;
  }).join("");
  const options = Object.keys(DEBUG_PRESETS)
    .map((name) => {
      const selected = config?.presetName === name ? "selected" : "";
      return `<option value="${name}" ${selected}>${name}</option>`;
    })
    .join("");
  return `
    <form id="debug-rig-form">
      <h4>配牌編集 (mpsz 例: 123m45p6s7z)</h4>
      <label class="debug-field">プリセット
        <select name="preset"><option value="">(なし)</option>${options}</select>
      </label>
      ${inputs}
      <button type="submit">この配牌で開始</button>
    </form>
  `;
}

/**
 * debug panel を body 直下にマウント/更新する。
 * #app は再描画のたびに innerHTML 全置換されるため body 直下に置く (showToast と同じ理由)。
 * フォームと開閉状態を保つため、毎回更新するのは情報部 (#debug-info) のみ。
 */
export function updateDebugPanel(state: GameState, config: DebugConfig | null): void {
  let panel = document.getElementById("debug-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "debug-panel";
    panel.innerHTML = `
      <details open>
        <summary>DEBUG</summary>
        <div id="debug-info"></div>
        ${rigFormHtml(config)}
      </details>
    `;
    document.body.appendChild(panel);
    wireRigForm(panel);
  }
  panel.querySelector("#debug-info")!.innerHTML = debugPanelHtml(state);
}

function wireRigForm(panel: HTMLElement): void {
  const form = panel.querySelector<HTMLFormElement>("#debug-rig-form")!;
  const select = form.querySelector<HTMLSelectElement>("select[name=preset]")!;
  // プリセット選択は「フォームへ値を流し込む」だけのヘルパー。提出時は常に入力値が真
  select.addEventListener("change", () => {
    const preset = DEBUG_PRESETS[select.value];
    for (const { key } of RIG_FIELDS) {
      form.querySelector<HTMLInputElement>(`input[name=${key}]`)!.value =
        preset?.[key] ?? "";
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const params = new URLSearchParams({ debug: "1" });
    for (const { key } of RIG_FIELDS) {
      const value = form.querySelector<HTMLInputElement>(`input[name=${key}]`)!.value.trim();
      if (value) params.set(key, value);
    }
    location.assign(`${location.pathname}?${params.toString()}`);
  });
}
