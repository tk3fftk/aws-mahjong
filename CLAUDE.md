# CLAUDE.md

Notes for Claude (and future me) working in this repository.

## Read these docs first

Design and implementation policies are organized by theme in [`docs/plans/`](./docs/plans/). Before touching anything, skim the relevant chapters.

- [`docs/plans/README.md`](./docs/plans/README.md) — index and 30-second overview
- Individual docs (01-architecture / 02-aws-yaku-judgment / 03-tdd-policy / 04-design-decisions / 05-future-roadmap / todos) are linked from the README

When code and docs disagree, treat **the code as the source of truth** and update the docs.

## Debug URLs

`?debug=<value>` fixes the initial game state. Works in production (designed for reproducing bug reports).

### Query parameters

| Parameter | Description |
|---|---|
| `?debug=1` | Debug panel + random hand |
| `?debug=<preset>` | Named scenario (see below) |
| `?seed=<number>` | Fix RNG seed for reproducible games |
| `&east=<mpsz>` | East player's 14 tiles (13 starting hand + 14th = first draw) |
| `&south=<mpsz>` | South player's 13 tiles |
| `&west=<mpsz>` | West player's 13 tiles |
| `&north=<mpsz>` | North player's 13 tiles |
| `&wallHead=<mpsz>` | Live wall head (upcoming draws) |
| `&deadWall=<mpsz>` | Dead wall (dora indicators, ura-dora) |

### Named presets (`src/debug/presets.ts`)

`riichi` / `ron` / `pon` / `kan` / `chi` / `bigwin` / `furiten`

### Examples

```
# Iipeiko verification (555z=Kiro AWS yaku, 123m×2=iipeiko, win on first draw)
http://localhost:5173/?debug=1&east=555z123m123m456p5p5p

# Ryanpeikou vs seven-pairs: a 7-pairs-shaped hand is scored as ryanpeikou (high-point rule).
# All souzu → canWin returns seven-pairs internally, but the standard decomposition wins;
# 345s makes rag-agent (AWS yaku) so it can actually win and the modal shows 二盃口 (not 七対子).
http://localhost:5173/?debug=1&east=33445566778899s

# Kokushi yakuman
http://localhost:5173/?debug=bigwin
```

The debug panel's 待ち/役 preview lists yaku even for non-winnable hands (和了不可・AWS役なし) — useful for checking yaku detection without an AWS yaku. See `src/debug/panel.ts:previewWaitYaku`.

Related files: `src/debug/params.ts` / `src/debug/rigged.ts` / `src/debug/presets.ts`

## Working rules

- Prefer `npm` commands over `npx` when an equivalent exists (e.g., `npm test` instead of `npx vitest run`)
- Runtime verification in the browser is done by a human. Claude must not install verification tooling or drive a browser; stop at confirming build/tests and listing the points a human should check
