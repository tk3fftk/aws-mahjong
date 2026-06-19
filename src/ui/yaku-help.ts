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

const HOWTO_HTML = `
  <div class="help-howto">
    <h3>遊び方</h3>
    <ul>
      <li>東風戦（東1局〜東4局）です。</li>
      <li>手牌の自動ソートは配牌時のみ行われます。以降はドラッグ&ドロップで並べ替えてください。</li>
    </ul>
    <h3>コンセプト・出典</h3>
    <p>
      「AWS麻雀」のコンセプト・出典:
      <a href="https://mu7889yoon.github.io/aws-mahjong/v2.0.1/" target="_blank" rel="noopener noreferrer">mu7889yoon.github.io/aws-mahjong/v2.0.1/</a>
      （version 2.0.1 に準拠）
    </p>
  </div>
`;

export function openHelpModal(): void {
  if (document.querySelector(".yaku-help-overlay")) return;

  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = document.createElement("div");
  overlay.className = "yaku-help-overlay";

  overlay.innerHTML = `
    <div class="yaku-help-content" role="dialog" aria-modal="true" aria-label="ヘルプ">
      <div class="yaku-help-header">
        <div class="yaku-help-tabs" role="tablist">
          <button role="tab" class="yaku-help-tab active" data-tab="yaku"
                  aria-selected="true" aria-controls="help-panel-yaku">AWS役一覧</button>
          <button role="tab" class="yaku-help-tab" data-tab="howto"
                  aria-selected="false" aria-controls="help-panel-howto">遊び方</button>
        </div>
        <button class="yaku-help-close help-btn" aria-label="閉じる">✕</button>
      </div>
      <div id="help-panel-yaku" class="yaku-help-panel" role="tabpanel">
        <div class="yaku-help-list">${ITEMS_HTML}</div>
      </div>
      <div id="help-panel-howto" class="yaku-help-panel" role="tabpanel" hidden>
        ${HOWTO_HTML}
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector<HTMLButtonElement>(".yaku-help-close")!;
  const content = overlay.querySelector<HTMLElement>(".yaku-help-content")!;
  const tabs = overlay.querySelectorAll<HTMLButtonElement>(".yaku-help-tab");
  const panels = overlay.querySelectorAll<HTMLElement>(".yaku-help-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      panels.forEach((p) => {
        p.hidden = true;
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const panel = overlay.querySelector<HTMLElement>(
        `#help-panel-${tab.dataset.tab}`,
      );
      if (panel) {
        panel.hidden = false;
        content.scrollTop = 0;
      }
    });
  });

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
