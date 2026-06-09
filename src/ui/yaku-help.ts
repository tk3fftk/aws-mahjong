import { mpszToTiles } from "../tiles";
import type { TileId } from "../types";
import { renderTileById } from "./tile-view";
import { AWS_YAKU_KIND, type AwsYakuKind } from "../yaku/aws-classification";
import { YAKU_LIST, type YakuJsonEntry } from "../yaku/aws-pattern";
import { YAKUMAN_HAN_THRESHOLD } from "../score";

const KIND_LABEL: Record<AwsYakuKind, string> = {
  "completed-meld": "面子で構成",
  "tile-superset": "以下を含む",
  "seven-pairs": "七対子型",
  "repeated-superset": "同形を繰り返す",
};

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c]!);
}

function formatHan(entry: YakuJsonEntry): string {
  if (entry.han >= YAKUMAN_HAN_THRESHOLD) return "役満";
  if (entry.hanOpen === null) return `${entry.han}翻 (門前のみ)`;
  if (entry.hanOpen === entry.han) return `${entry.han}翻`;
  return `${entry.han}翻 / 副露${entry.hanOpen}翻`;
}

function renderSamplePattern(mpsz: string): string {
  const groups = mpsz.split("-").filter((g) => g.length > 0);
  const groupsHtml = groups
    .map((group) => {
      let tiles: TileId[];
      try {
        tiles = mpszToTiles(group);
      } catch (e) {
        console.warn(`yaku-help: failed to parse mpsz "${group}"`, e);
        return "";
      }
      const tilesHtml = tiles
        .map((id) => renderTileById(id, { variant: "discard" }))
        .join("");
      return `<span class="yaku-help-group">${tilesHtml}</span>`;
    })
    .join("");
  return `<div class="yaku-help-sample">${groupsHtml}</div>`;
}

function renderYakuItem(entry: YakuJsonEntry): string {
  const kind = AWS_YAKU_KIND[entry.id];
  const kindHtml = kind
    ? `<div class="yaku-help-kind">${esc(KIND_LABEL[kind])}</div>`
    : "";
  const samplesHtml = (entry.sampleMpszList ?? []).map(renderSamplePattern).join("");
  return `
    <div class="yaku-help-item">
      <div class="yaku-help-item-title">
        <span class="yaku-help-name">${esc(entry.name)}</span>
        <span class="yaku-help-han">${esc(formatHan(entry))}</span>
      </div>
      ${kindHtml}
      ${samplesHtml}
    </div>
  `;
}

const ITEMS_HTML = YAKU_LIST.map(renderYakuItem).join("");

export function openYakuHelp(): void {
  if (document.querySelector(".yaku-help-overlay")) return;

  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = document.createElement("div");
  overlay.className = "yaku-help-overlay";

  overlay.innerHTML = `
    <div class="yaku-help-content" role="dialog" aria-modal="true" aria-labelledby="yaku-help-title">
      <div class="yaku-help-header">
        <h2 id="yaku-help-title">AWS役一覧</h2>
        <button class="yaku-help-close help-btn" aria-label="閉じる">✕</button>
      </div>
      <div class="yaku-help-list">${ITEMS_HTML}</div>
    </div>
  `;

  const closeBtn = overlay.querySelector<HTMLButtonElement>(".yaku-help-close")!;

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };

  const close = (): void => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    previousFocus?.focus();
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
  closeBtn.focus();
}
