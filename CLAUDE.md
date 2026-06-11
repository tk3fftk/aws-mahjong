# CLAUDE.md

Notes for Claude (and future me) working in this repository.

## Read these docs first

Design and implementation policies are organized by theme in [`docs/plans/`](./docs/plans/). Before touching anything, skim the relevant chapters.

- [`docs/plans/README.md`](./docs/plans/README.md) — index and 30-second overview
- Individual docs (01-architecture / 02-aws-yaku-judgment / 03-tdd-policy / 04-design-decisions / 05-future-roadmap / todos) are linked from the README

When code and docs disagree, treat **the code as the source of truth** and update the docs.

## Working rules

- Prefer `npm` commands over `npx` when an equivalent exists (e.g., `npm test` instead of `npx vitest run`)
- Runtime verification in the browser is done by a human. Claude must not install verification tooling or drive a browser; stop at confirming build/tests and listing the points a human should check
