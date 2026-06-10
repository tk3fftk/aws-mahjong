# 01. アーキテクチャ

「全体の絵」と「依存方向のルール」をまとめる。個別の型・関数定義は転記せず、`src/` を見にいくための見取り図に徹する。

---

## 層構造

```
ui/render ──────────────┐
                        ▼
                  game (Imperative Shell)
                        │
        ┌───────────────┼──────────────────┐
        ▼               ▼                  ▼
     winning         yaku/judge           cpu
   (decompose,         │
    special,           ├── yaku/standard
    check)             ├── yaku/aws-pattern ── data/yaku.json
                       └── yaku/aws-classification
                        │
                        ▼
                      score
                        │
                        ▼
                      tiles ──────── wall
                      (型・牌名・index変換・順子判定)
                        │
                        ▼
                     types.ts (全体で共有する型のみ)
```

矢印は **import の方向** (上→下)。逆向き import は循環依存になるので禁止。

---

## モジュール責務

| ファイル | 一行責務 |
|---|---|
| `src/main.ts` | エントリ。`GameController` を起動し、状態変化のたびに `render()` を呼ぶ |
| `src/types.ts` | 全体で共有する型定義のみ。実装ロジックは置かない |
| `src/tiles.ts` | 牌の定義 (TileId / AWS_NAMES) と低レベルヘルパ (`tileIdIndex`, `canStartSequenceAt`, `counts34`) |
| `src/wall.ts` | 山の生成 (`buildWall`) ・配牌 (`dealInitialHands`) ・ツモ (`drawFromWall`) ・PRNG (`mulberry32`) |
| `src/winning/decompose.ts` | 4面子1雀頭の標準形分解。複数解を返す (役判定で最大 han を選ぶため) |
| `src/winning/special.ts` | 七対子・国士無双の特殊形判定 |
| `src/winning/check.ts` | `canWin()`: 3形態 (standard / seven-pairs / thirteen-orphans) を統合した入口 |
| `src/yaku/standard.ts` | 標準麻雀の役判定。**5z/6z/7z 刻子はスキップ** (`aws-pattern.ts` 側で扱うため) |
| `src/yaku/aws-pattern.ts` | AWS固有役の判定。`detectAwsYakus()` + 4分類ごとのマッチ関数 |
| `src/yaku/aws-classification.ts` | 22役 → 4分類 (completed-meld / tile-superset / repeated-superset / seven-pairs) のハードコードマップ |
| `src/yaku/judge.ts` | 標準役 + AWS役の統合。`hasAnyAwsYaku()` で AWS役必須ルールのゲートを提供 |
| `src/score.ts` | 飜→点数テーブル。`YAKUMAN_HAN_THRESHOLD` をここで export し、judge も import |
| `src/cpu.ts` | CPU の意思決定。和了可能なら宣言、不可ならランダム1枚打牌 |
| `src/game.ts` | `GameController`: 状態を持つ唯一のクラス。配牌・ツモ・打牌・和了・流局を制御 |
| `src/ui/render.ts` | DOM 全置換型レンダラ。`state` から HTML を生成し、event handler を貼る |
| `src/ui/tile-view.ts` | 牌1枚を `<img>` でレンダリングするユーティリティ |
| `src/ui/yaku-help.ts` | 「?」ボタンで開く役一覧オーバーレイ。`document.body` 直下にマウントし、ゲーム描画と分離 |
| `src/data/yaku.json` | 公式 yaku.json のリポ内コピー。`npm run fetch:yaku` で再取得可能 |

---

## 設計の柱

### Imperative Shell / Functional Core

- **Shell (= `GameController`)**: 山・手牌・河・点数を保持し、状態遷移を司る唯一の場所。
- **Core (= それ以外のすべて)**: 入力 → 出力の純関数として書く。テストでは小さなテーブル駆動で振る舞いを固定できる。
- これにより、winning や yaku のテストは状態の組み立て不要で、`mpszToTiles` ヘルパで簡潔に書ける。

### 型の集約 (types.ts)

- すべてのドメイン型 (`Tile`, `Player`, `GameState`, `WinForm`, `Meld`, ...) を `src/types.ts` に一本化。
- 実装ファイル (`decompose.ts` 等) からはこれらを import するが、`types.ts` はどのファイルも import しない (依存方向を上位に向ける)。
- 副次効果: 型変更時のインパクトが見やすい / IDE のジャンプが安定。

### WinForm の Discriminated Union

- `WinForm = { kind: "standard"; ... } | { kind: "seven-pairs"; ... } | { kind: "thirteen-orphans" }`
- 3バリアントが必要なのは **七対子と国士無双が「4面子1雀頭」の構造に収まらない** から。同じ型に詰めると意味のないフィールドが発生する。
- `judge.ts` は `winForm.kind` で分岐し、各形態に固有の処理を行う (国士無双なら即 13翻、七対子なら断么九・混一色などの複合をチェック、標準形なら全分解を試して最大 han を採用)。

---

## UI: yaku-help.ts の独立性

役一覧オーバーレイ (コミット `ac35c91`) は **ゲーム本体の再描画から完全に切り離して**ある:

- `document.body` 直下に `<div class="yaku-help-overlay">` を append (`#app` の中ではない)。`render()` が `#app.innerHTML = ...` で全置換しても消えない。
- 役一覧 HTML は **モジュール初期化時に 1回だけ生成** (定数 `ITEMS_HTML`)。yaku.json の名前は HTML エスケープして XSS を防ぐ。
- `aws-pattern.ts` から `YAKU_LIST` と `YakuJsonEntry` 型を export し、UI 側で再利用 (二重定義を避けるため)。

参考: `src/ui/yaku-help.ts:openYakuHelp` がエントリポイント。`render.ts` の `?` ボタン (`data-action="show-yaku-help"`) のクリックでここを呼ぶ。

---

## 補足: 主要な定数の所在 (co-location)

定数は**使う側のモジュールに同梱**している。詳細な根拠は [04-design-decisions.md](./04-design-decisions.md#d-006) を参照。

- `tiles.ts`: `TILE_KIND_COUNT`, `NUMBERED_TILES_PER_SUIT`, `HONOR_TILE_COUNT`, `SUIT_INDEX_OFFSET`, `HONOR_START_INDEX`, `MAX_SEQUENCE_START_NUMBER`
- `winning/decompose.ts`: `HAND_SIZE_WIN`, `MELDS_PER_HAND`, `PON_SIZE`, `PAIR_SIZE`
- `winning/special.ts`: `SEVEN_PAIRS_COUNT`, `PAIR_SIZE`
- `score.ts`: `YAKUMAN_HAN_THRESHOLD` (judge.ts も import)
- `game.ts`: `INITIAL_SCORE`
- `wall.ts`: `TILE_COPIES_PER_KIND`, `NUM_SEATS`, `INITIAL_DEAL_ROUNDS`, `TILES_PER_DEAL_ROUND`
