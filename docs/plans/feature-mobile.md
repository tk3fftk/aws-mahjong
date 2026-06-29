# Plan: Mobile-Friendly Design & Touch Drag Fix

## Context

The game is currently desktop-oriented. Two main problems on mobile:
1. **Drag-and-drop for tile reordering is broken** — HTML5 DnD API does not fire events on touch devices. Discarding (2-click/tap) works, but rearranging tiles does not.
2. **Layout is not optimized for mobile** — tiles are small, action buttons lack adequate touch targets, and the existing `@media (max-width: 720px)` breakpoint is minimal.

Goal: make the game comfortable to play on phones (375px portrait) without breaking the desktop experience.

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

### c. Expand 720px mobile breakpoint (replace lines 891-920)
- Smaller tile sizes: `--tile-w: clamp(24px, 6.5vw, 36px)`, `--tile-h: clamp(34px, 9.1vw, 50px)`
- Reduced gaps and padding
- Table: `--table-size: min(calc(100dvh - header - hand - 16px), 98vw)` (maximize)
- Compact header (`h1` font-size 0.95rem)
- Action buttons: `min-height: 44px` for touch targets
- Hand bar: flex column, hand-row centered

### d. Narrow phone breakpoint (new, 400px)
- Even smaller tiles: `--tile-w: clamp(20px, 5.8vw, 28px)`
- Reduce draw-separated margin to 6px
- Hide `.chip-name` on score chips (show only wind + score)
- Smaller button padding

**Tile fit calculation**: At 375px, 14 tiles at ~24px + 2px gaps = ~368px. Fits within 375px - 8px padding = 367px. At 360px with 400px breakpoint: 14 tiles at ~21px + 1px gaps = ~307px. Fits comfortably.

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
