# 01. アーキテクチャ

「全体の絵」と「依存方向のルール」をまとめる。個別の型・関数定義は転記せず、`src/` を見にいくための見取り図に徹する。

---

## 層構造

```
ui/render ──────────────┐
                        ▼
                  game (Imperative Shell)
                        │
        ┌───────────────┼────────┬─────────┬─────────┐
        ▼               ▼        ▼         ▼         ▼
     winning         yaku/judge  claims    cpu     score
   (decompose,         │         (鳴き/ロン適格性・
    special,           │          優先解決。winning と
    check, melds,      │          yaku/judge に依存)
    furiten)           ├── yaku/standard
                       ├── yaku/aws-pattern ── data/yaku.json
                       └── yaku/aws-classification
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
| `src/main.ts` | エントリ。`GameController` を起動し、状態変化のたびに `render()` を呼ぶ。手牌選択 (`UiState.selectedHandIndex`) などゲーム状態に属さないUI状態もここで管理。`window` の error/unhandledrejection をグローバル捕捉し、想定外例外時は `renderFatal()` でフォールバック描画 (D-016) |
| `src/types.ts` | 全体で共有する型定義のみ。実装ロジックは置かない |
| `src/tiles.ts` | 牌の定義 (TileId / AWS_NAMES) と低レベルヘルパ (`tileIdIndex`, `canStartSequenceAt`, `counts34`) |
| `src/wall.ts` | 山の生成 (`buildWall`) ・4人分の配牌 (`dealInitialHands`) ・ツモ (`drawFromWall`) ・リンシャンツモ (`drawFromWallEnd`) ・王牌分離 (`splitDeadWall`) ・PRNG (`mulberry32`) |
| `src/winning/decompose.ts` | 「meldCount 面子+1雀頭」の標準形分解 (既定4面子=門前14枚)。全分解を列挙する (役判定で最大 han を選ぶため。刻子分解の裏に隠れる平和形を取りこぼさない) |
| `src/winning/special.ts` | 七対子・国士無双の特殊形判定 |
| `src/winning/check.ts` | `canWin(concealed, melds)`: 3形態を統合した入口。副露があれば分解結果にマージして返す (七対子・国士は副露ありで不成立) |
| `src/winning/melds.ts` | 副露の射影ユーティリティ。`toDecompMeld` (kan→3枚刻子, aws-kan→4枚保持)・`effectiveHandTiles` (実効手牌)・`isMenzenHand` (暗槓/aws-kanのみ=門前)。`aws-kan` は AWS役4枚パターン宣言の特殊副露 ([D-017](./04-design-decisions.md#d-017-awsカン宣言メカニクス)) |
| `src/winning/furiten.ts` | 待ち牌列挙 (`winningTiles`、全34種ブルートフォース) と基本フリテン判定 (`isFuriten`) |
| `src/claims.ts` | 打牌に対する鳴き/ロンの適格性 (`computeEligibility`) と複数クレームの優先解決 (`resolveClaims`: ロン>カン=ポン>チー、同位は頭ハネ) |
| `src/yaku/standard.ts` | 標準麻雀の役判定。**5z/6z/7z 刻子はスキップ** (`aws-pattern.ts` 側で扱うため) |
| `src/yaku/aws-pattern.ts` | AWS固有役の判定。`detectAwsYakus()` + 4分類ごとのマッチ関数。`hanOpen=null` は門前限定として鳴き手で不成立 |
| `src/yaku/aws-classification.ts` | 22役 → 4分類 (completed-meld / tile-superset / repeated-superset / seven-pairs) のハードコードマップ |
| `src/yaku/judge.ts` | 標準役 + AWS役の統合。(分解×和了牌配置) の (han, fu) 高点法選択。`hasAnyAwsYaku()` で AWS役必須ルールのゲートを提供 |
| `src/fu.ts` | 符計算。`enumerateWinPlacements` (和了牌を置ける門前面子/雀頭の列挙 = 高点法の候補集合)・`calcFu` (1配置の符)・`SEVEN_PAIRS_FU` (D-014) |
| `src/score.ts` | (han, fu)→点数。標準式 `fu×2^(2+han)` + 満貫キャップ (D-014)。`calcScore` は支払者別内訳 (`ScorePayments`) を返す。`YAKUMAN_HAN_THRESHOLD` をここで export し、judge も import |
| `src/cpu.ts` | CPU の意思決定。`decideCpuAction` (ツモ和了宣言 or ランダム打牌) と `decideClaim` (ロン即取り / AWS役牌のみポン / チーはパス) |
| `src/game.ts` | `GameController`: 状態を持つ唯一のクラス。4人分の配牌・ツモ・打牌・鳴き (claim フェーズ)・カン・和了・流局を反復ループ (`#loop`) で制御 |
| `src/ui/render.ts` | DOM 全置換型レンダラ。`state` から HTML を生成し、event handler を貼る。4席レイアウト・副露・claim ボタン・D&D並び替えの配線 |
| `src/ui/tile-view.ts` | 牌1枚を `<img>` でレンダリングするユーティリティ |
| `src/ui/yaku-help.ts` | 「?」ボタンで開く役一覧オーバーレイ。`document.body` 直下にマウントし、ゲーム描画と分離 |
| `src/data/yaku.json` | 公式 yaku.json のリポ内コピー。`npm run fetch:yaku` で再取得可能 |

---

## 設計の柱

### Imperative Shell / Functional Core

- **Shell (= `GameController`)**: 山・手牌・河・副露・点数を保持し、状態遷移を司る唯一の場所。
- **駆動モデル**: 相互再帰ではなく**反復ループ** (`game.ts:#loop`)。「`phase="discard"` かつ手番が CPU」の間だけ1手ずつ進め、人間の入力待ち / claim 応答待ち / 終局で停止する。公開メソッド (humanDiscard / humanClaim / humanSkipClaim / humanSelfKan 等) が再開の入口。経緯は [D-009](./04-design-decisions.md#d-009-4人化--鳴きロンの実装方針)
- **claim フェーズ**: 打牌ごとに `claims.ts` で他3席の適格性を計算し、人間に選択肢があるときだけ `phase="claim"` で停止して UI 入力を待つ (CPU 分は `cpu.ts:decideClaim` で即決)
- **Core (= それ以外のすべて)**: 入力 → 出力の純関数として書く。テストでは小さなテーブル駆動で振る舞いを固定できる。
- これにより、winning や yaku のテストは状態の組み立て不要で、`mpszToTiles` ヘルパで簡潔に書ける。

### 型の集約 (types.ts)

- すべてのドメイン型 (`Tile`, `Player`, `GameState`, `WinForm`, `Meld`, `CalledMeld`, `ClaimState`, ...) を `src/types.ts` に一本化。
- 実装ファイル (`decompose.ts` 等) からはこれらを import するが、`types.ts` はどのファイルも import しない (依存方向を上位に向ける)。
- **`Meld` と `CalledMeld` は別語彙**: `Meld` (chi|pon|pair) は和了形の「分解結果」、`CalledMeld` (chi|pon|minkan|ankan|kakan) は「卓上に晒した副露」。winning/ 層は出所に依存しないよう `MeldLike` (構造的部分型) で受ける。
- `GameState` の主な拡張 (4人化+鳴き): `deadWall` (王牌14枚)・`claim` (claim フェーズの状態)・`lastDiscard` (直前打牌のハイライト用)・`selfKanOptions` (暗槓/加槓候補)。`Player` には `melds` と `discardedIds` (フリテン用 append-only 履歴)。
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
- `claims.ts`: `CLAIM_PRIORITY` (ロン>カン=ポン>チー)
- `score.ts`: `YAKUMAN_HAN_THRESHOLD` (judge.ts も import)
- `game.ts`: `INITIAL_SCORE`, `LOOP_GUARD`
- `wall.ts`: `TILE_COPIES_PER_KIND`, `NUM_SEATS`, `INITIAL_DEAL_ROUNDS`, `TILES_PER_DEAL_ROUND`, `DEAD_WALL_SIZE`
