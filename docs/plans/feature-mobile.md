# Plan: Mobile-Friendly Design & Touch Drag Fix

## Context

The game is currently desktop-oriented. Two main problems on mobile:
1. **Drag-and-drop for tile reordering is broken** — HTML5 DnD API does not fire events on touch devices. Discarding (2-click/tap) works, but rearranging tiles does not.
2. **Layout is not optimized for mobile** — tiles are small, action buttons lack adequate touch targets, and the existing `@media (max-width: 720px)` breakpoint is minimal.

Goal: make the game comfortable to play on phones in **landscape orientation** without breaking the desktop experience. Portrait breakpoints (720px / 400px) are kept as fallback but landscape is the primary mobile target.

---

## 1. Touch Drag Implementation (`src/ui/render.ts`)

**Approach**: Add `touchstart` / `touchmove` / `touchend` / `touchcancel` handlers alongside the existing HTML5 DnD listeners. The two systems are mutually exclusive at runtime (mouse vs touch), so they coexist safely.

**Key design decisions**:
- **Movement threshold (10px)** before activating drag mode — distinguishes a tap (which should select/discard) from a drag (reorder).
- **Ghost element** follows the finger: clone of tile's outerHTML, appended to `document.body` (survives `innerHTML` replacement of `#app`), styled with `position: fixed; z-index: 50`.
- **Drop target detection**: `document.elementFromPoint(touchX, touchY)` to find the tile under the finger (touch events don't retarget like mouse events).
- **Click suppression (Decision Q2=B)**: `touchmove` 内で 10px 閾値を超えた時点で `e.preventDefault()` を呼ぶ。閾値を超えるまでは何もしないので、タップは自然に動作する。ドラッグに移行した場合のみクリックを抑制する。iOS Safari で閾値超過時に既にクリックがキューされるリスクは既知の制約として許容する。
- **render() 中の DOM 置換との共存 (Decision Q1=B)**: `onReorder` → `onChange` → `render()` が同期的に `touchend` 内で発火しても、JS はシングルスレッドなのでイベント完了後に描画される。ゴーストは `document.body` 上で生き残り、クリーンアップは冪等にする（ghost が既に消えていても安全）。新しいフラグや render ブロックは不要。
- **Multi-touch guard**: Only track `touches[0]`, ignore if drag already active.
- **touchcancel handling**: Same cleanup as "drag released on empty space" — remove ghost, restore source tile, no reorder.

**Module-level state** (near existing `dragSrcIndex`):
- `touchDragSrcIndex`, `touchDragStartX/Y`, `touchDragActive`, `touchDragGhost`, `touchDragOverEl`

**Attach to**: each `.tile.hand.draggable` element, inside `attachHandlers()` after the existing DnD block.

---

## 2. CSS Changes (`src/ui/styles.css`)

### a. Touch drag styles (new block)
- `.touch-drag-ghost` — fixed position, z-index 50, pointer-events none, opacity 0.85, scale 1.15, drop-shadow
- `.tile.drag-over` — dashed outline indicator for drop target
- `.tile.hand.draggable` — `touch-action: none` to prevent browser gesture interference

### b. Disable hover effects on touch devices (new)
```css
@media (pointer: coarse) {
  .hand-row .tile.hand.clickable:hover { /* reset to no transform */ }
}
```

### c. Expand 720px mobile breakpoint (already implemented)
- Smaller tile sizes: `--tile-w: clamp(24px, 6.5vw, 36px)`, `--tile-h: clamp(34px, 9.1vw, 50px)`
- Reduced gaps and padding
- Table: `--table-size: min(calc(100dvh - header - hand - 16px), 98vw)` (maximize)
- Compact header (`h1` font-size 0.95rem)
- Action buttons: `min-height: 44px` for touch targets
- Hand bar: flex column, hand-row centered

### d. Narrow phone breakpoint (already implemented, 400px)
- Even smaller tiles: `--tile-w: clamp(20px, 5.8vw, 28px)`
- Reduce draw-separated margin to 6px
- Hide `.chip-name` on score chips (show only wind + score)
- Smaller button padding

**Tile fit calculation (portrait fallback)**: At 375px, 14 tiles at ~24px + 2px gaps = ~368px. Fits within 375px - 8px padding = 367px. At 360px with 400px breakpoint: 14 tiles at ~21px + 1px gaps = ~307px. Fits comfortably.

---

## 3. Files to Modify

| File | Changes |
|---|---|
| `src/ui/styles.css` | Ghost styles, drag-over indicator, `touch-action`, `@media (pointer: coarse)`, expanded 720px breakpoint, new 400px breakpoint |
| `src/ui/render.ts` | Touch event handlers in `attachHandlers()`, ghost element creation/cleanup, module-level touch drag state |

No changes needed in `main.ts`, `tile-view.ts`, or `index.html`.

---

## 4. Implementation Order

1. CSS changes (low risk, immediate visual improvement)
2. Touch drag handlers in render.ts
3. Run `npm test` to verify no regressions
4. List manual verification points for human testing

---

## 5. Verification

**Automated**: `npm test` — existing tests must pass unchanged.

**Human verification checklist** (per CLAUDE.md — runtime browser verification is done by human):

Desktop:
- [ ] Mouse click to select/discard tiles works
- [ ] Mouse drag-and-drop reorder works
- [ ] Hover enlarge effect works
- [ ] All action buttons work (tsumo, riichi, claim, pass)
- [ ] Modals display correctly

Mobile (Chrome DevTools + real device):
- [ ] Tap to select/discard tiles works
- [ ] Touch drag reorder: press and drag a tile, ghost follows finger
- [ ] Releasing over a tile triggers reorder
- [ ] Releasing over empty space cancels (no unintended action)
- [ ] All tiles visible in hand without overflow
- [ ] Action buttons large enough to tap (44px+ height)
- [ ] Table fills available viewport
- [ ] Modals readable and buttons tappable
- [ ] Landscape orientation works
- [ ] Test on real iOS Safari (touch behavior differs from Chrome emulation)
- [ ] `?debug=riichi` — riichi armed mode works with tap

---

## 6. Landscape-First Layout (Phone) — 雀魂-Style

### 6.1 Problem

Current vertical stack (header 44px + table + hand area 110-150px) leaves only ~220px for the table in phone landscape. Unplayable.

Target devices (landscape):

| Device | Width | Height |
|---|---|---|
| Small Android | 640 | 360 |
| iPhone SE | 667 | 375 |
| iPhone 14 | 844 | 390 |
| Pixel 7 | 851 | 393 |

### 6.2 Media Query

```css
@media (max-height: 500px) and (min-aspect-ratio: 1/1) { ... }
```

Placed **after** the 720px and 400px breakpoints so it overrides portrait-mobile rules when both match. Tablets (iPad mini landscape height = 768px) and desktops are excluded by `max-height: 500px`.

### 6.3 Layout Strategy

Reference: 雀魂 (Mahjong Soul) mobile landscape layout.

```
[phase-chip]        [?]   ← header: position:fixed overlay, transparent bg, h1 hidden
[                       ]
[    table (maximized)  ]
[                       ]
[ツモ][リーチ][カン]       ← actions: position:absolute above hand-area (floating)
[ hand tiles (horizontal row)  | melds ]  ← bottom bar ~54px
```

Key decisions:
- **Header → fixed overlay**: Removed from flow → no height deduction for table
- **Actions → absolute positioning**: Float above hand-area → button appearance doesn't resize table
- **Hand-area → flow-based bottom bar**: `--hand-area-h: 54px` used in table size calc
- **Hand tiles → horizontal single row** at bottom (matches 雀魂 feel)
- **CSS-only**: No DOM structure changes in `render.ts`

### 6.4 CSS Custom Properties (landscape override)

```css
@media (max-height: 500px) and (min-aspect-ratio: 1/1) {
  :root {
    --header-h: 0px;          /* header is fixed overlay, not in flow */
    --hand-area-h: 54px;      /* compact bottom bar for tiles */
    --tile-w: clamp(28px, 5.5dvw, 44px);
    --tile-h: clamp(39px, 7.7dvw, 50px);
    --tile-gap: 2px;
  }
}
```

Tile sizing uses `dvw` (width is the large axis in landscape):
- 640px width: `5.5dvw` = 35.2px → tile width 35px, height 49px
- 667px width: `5.5dvw` = 36.7px → tile width 37px, height 50px (clamped)
- 851px width: `5.5dvw` = 46.8px → clamped to 44px

**Tile fit check** (14 tiles + 13 gaps × 2px + 6px draw margin):
- 640px: 14×35 + 13×2 + 6 = **522px** ✓ (~110px remaining for melds)
- 667px: 14×37 + 13×2 + 6 = **550px** ✓ (~110px remaining)
- 851px: 14×44 + 13×2 + 6 = **648px** ✓ (~195px remaining)

### 6.5 Table Sizing

```css
.table {
  --table-size: min(calc(100dvh - var(--hand-area-h) - 4px), calc(100dvw - 4px));
}
```

| Device (landscape) | Calculation | Table size |
|---|---|---|
| Small Android (640×360) | min(302, 636) | **302px** |
| iPhone SE (667×375) | min(317, 663) | **317px** |
| iPhone 14 (844×390) | min(332, 840) | **332px** |
| Pixel 7 (851×393) | min(335, 847) | **335px** |

vs. current portrait ~220px → **+80-115px improvement**.

### 6.6 Header (fixed overlay)

```css
.app-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 28px;
  z-index: 12;
  background: transparent;
  pointer-events: none;
}
.app-header > * { pointer-events: auto; }
.app-header h1 { display: none; }
.phase-chip {
  font-size: 0.75rem;
  padding: 2px 8px;
  background: rgba(35, 47, 62, 0.85);
  border-radius: 4px;
}
.help-btn {
  width: 26px; height: 26px;
  font-size: 0.85rem;
  background: rgba(35, 47, 62, 0.85);
}
```

Header overlays the table transparently. Only phase chip and help button are visible with a subtle backdrop. `pointer-events: none` on parent ensures table interaction isn't blocked.

### 6.7 Hand Area (bottom bar)

```css
body { overflow: hidden; }  /* prevent scroll — everything fits in viewport */

#app {
  max-width: none;
  padding: 2px 4px 0;
  padding-left: env(safe-area-inset-left, 4px);   /* notch avoidance */
  padding-right: env(safe-area-inset-right, 4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100dvh;
}

.hand-area {
  position: relative;       /* anchor for absolute-positioned .actions */
  width: 100%;
  margin: auto 0 0;        /* push to bottom */
  padding: 2px 4px;
  padding-bottom: env(safe-area-inset-bottom, 2px);
  background: linear-gradient(transparent, rgba(22, 30, 45, 0.95) 8px);
}

.hand-bar {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: center;
  gap: 8px;
}

.hand-row {
  grid-column: unset;
  display: flex;
  flex-wrap: nowrap;        /* force single horizontal row */
  gap: var(--tile-gap);
}

.human-melds {
  grid-column: unset;
  justify-self: unset;
}

.tile.draw-separated {
  margin-left: 8px;         /* slightly larger gap for drawn tile visibility */
}
```

### 6.8 Action Buttons (floating above hand)

```css
.actions {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 4px;
  min-height: 0;            /* override portrait min-height */
  background: rgba(22, 30, 45, 0.9);
  border-radius: 8px;
  padding: 4px 8px;
  z-index: 11;
}

.actions:empty { display: none; }

.actions button {
  min-height: 44px;         /* touch target */
  padding: 6px 10px;
  font-size: 0.85rem;
}
```

Actions float above the hand tiles. When no actions are available, the div is empty and hidden. Table size is unaffected by button presence.

### 6.9 Modals

```css
.modal {
  max-height: 90dvh;
  width: min(560px, 92vw);
  padding: 12px;
}

.modal h2 { font-size: 1rem; margin-bottom: 4px; }

.yaku-help-content {
  height: min(90dvh, 720px);
  width: min(720px, 92vw);
}

.yaku-help-header { padding: 8px 12px; }
.yaku-help-tab { font-size: 0.8rem; padding: 4px 8px; }
```

### 6.10 Toast and Debug Panel

```css
.toast {
  bottom: 60px;             /* above hand-area */
  font-size: 0.85rem;
  padding: 6px 12px;
}

#debug-panel {
  width: 260px;
  font-size: 10px;
}
```

### 6.11 Score Chips (table center)

```css
.score-chip .chip-name { display: none; }  /* show only wind + score to save space */
```

### 6.12 Files to Modify

| File | Changes |
|---|---|
| `src/ui/styles.css` | Add `@media (max-height: 500px) and (min-aspect-ratio: 1/1)` block (Sections 6.4–6.11). Place after existing 400px breakpoint. |

**No changes needed**: `render.ts` (DOM unchanged), `index.html`, `main.ts`.

### 6.13 Implementation Order

1. Add landscape media query block to `styles.css`
2. `npm test` — CSS-only change, all tests pass
3. Human verification (Section 6.14)

### 6.14 Landscape Verification Checklist

Landscape phone (Chrome DevTools device toolbar + real device):
- [ ] iPhone SE landscape (667×375): table ~317px, tiles visible in bottom bar
- [ ] Small Android landscape (640×360): table ~302px, all tiles fit
- [ ] Hand tiles 14枚が横一列で表示（overflow なし）
- [ ] ツモ牌の draw-separated マージンが機能
- [ ] アクションボタンが手牌の上にフロート表示
- [ ] 鳴き選択（ロン/ポン/チー/パス）ボタンがタップ可能（44px+）
- [ ] ヘッダー: phase chip + help button のみ表示（h1 非表示）
- [ ] モーダルがスクロール可能で読める
- [ ] タッチドラッグによる牌の並び替えが動作
- [ ] 副露（鳴き面子）が手牌の右に表示
- [ ] `?debug=riichi` でリーチ宣言モードが動作
- [ ] iOS Safari 実機で動作確認（ノッチ対応の safe-area-inset）

Regression:
- [ ] Portrait mobile (375px / 360px) に影響なし
- [ ] Desktop (1200px+) に影響なし
- [ ] マウスドラッグ、ホバー効果が正常

### 6.15 Edge Cases

1. **Foldable phones (Galaxy Fold outer)**: Height ~280px. Hand tiles may need scrolling — `overflow-y: auto` on `.hand-area` handles this.
2. **Multiple chi options**: Chi buttons with inline tile previews stack via `flex-wrap` in the floating actions area.
3. **4 called melds**: Hand shrinks (2 tiles in hand-row), melds grow. The flex-row hand-bar wraps naturally.
4. **Orientation change during play**: CSS media queries respond instantly. No JS state management needed.
5. **iOS Safari notch (Dynamic Island)**: Side notch avoided by `env(safe-area-inset-left/right)` padding on `#app`.
