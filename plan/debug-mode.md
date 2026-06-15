# Debug Mode 実装プラン

## Context

リーチの動作確認・鳴き(ポン/チー/カン)・点数計算のdebugを行うため、狙った局面をブラウザで簡単に再現できる debug mode を追加する。現状はテストコード内の `riggedDeal()` ヘルパー (game.test.ts:38) でしか局面を仕込めず、ブラウザでの手動確認は `?seed=` でのガチャに頼っている。

決定事項:
- **本番(GitHub Pages)でも常時有効** — URLパラメータ `?debug=...` で起動、ビルド分岐 (`import.meta.env.DEV`) なし
- **debug panel は全部入り** — 待ち牌/フリテン/役プレビュー/CPU手牌公開/裏ドラ/山の次ツモ
- **プリセットシナリオあり** — `?debug=riichi` 等
- **配牌編集UI** — panel内に mpsz テキスト入力フォーム → URLに反映してリロード

## 既存資産 (活用するもの)

- `src/game.ts` — `GameControllerOptions` に `wallFactory?: (rng) => Tile[]` / `rng?: RNG` の注入シームが既にある (変更不要)
- `src/game.test.ts:14-81` — `RiggedDeal` 型 + `riggedDeal()`: mpsz記法で east(14枚)/south/west/north(各13枚)/wallHead/deadWall/wallEnd を指定して仕込み壁136枚を作る。これを共有モジュールへ移動する
- `src/tiles.ts` — `mpszToTiles()` / `tilesToMpsz()` / `sortTiles()` / `ALL_TILE_IDS`
- `src/main.ts:9-11` — 既存の `?seed=` URLパラメータ処理パターン
- `src/winning/furiten.ts` — `winningTiles()` / `isFuriten()` (panel の待ち牌・フリテン表示)
- `src/yaku/judge.ts` — `judgeYaku()` / `canDeclareWin()` (役プレビュー)
- `src/dora.ts` — `uraDoraIndicators()` (裏ドラ覗き見)
- `src/ui/render.ts` の `showToast` (485行付近) — body直下マウントの参照実装 (`#app` 全置換の影響を受けないパターン)

## モジュール構成 (新規)

```
src/debug/
  rigged.ts        # game.test.ts:14-81 から移動: RiggedDeal型, riggedDeal() (export化)
  presets.ts       # DEBUG_PRESETS: Record<string, RiggedDeal>
  params.ts        # parseDebugConfig(search: string): DebugConfig | null (純関数)
  panel.ts         # debugPanelHtml(state): string (純関数) + updateDebugPanel(state, ...) (DOMマウント)
  presets.test.ts
  params.test.ts
  panel.test.ts
```

## 実装ステップ

### 1. `src/debug/rigged.ts` へ抽出 (純リファクタ)

`src/game.test.ts:14-81` の `DEAL_INDICES` / `WALL_START` / `DEAD_WALL_START` / `LIVE_WALL_END` / `RiggedDeal` / `riggedDeal()` をそのまま移動し export。`ALL_SEATS` はローカル定義 (テスト側にも残る)。`riggedGame()` / `playRoundToEnd()` はテスト専用 (rng: () => 0 前提) なので game.test.ts に残し、import 先だけ差し替え。

検証: `npm test` が無変更で green。

### 2. `src/debug/presets.ts` (test first)

`DEBUG_PRESETS: Record<string, RiggedDeal>`。初期セット (game.test.ts の実績リグを流用):

| 名前 | 内容 | 元ネタ |
|---|---|---|
| `riichi` | 1z切りで即リーチ可、数巡後ツモ和了 | RIICHI_RIG (game.test.ts:708 付近) |
| `ron` | south が待ち牌を打ってロン可能 | RON_RIG (game.test.ts:621 付近) |
| `pon` / `kan` | south の捨て牌に合わせてポン/明カン可能 | claims.test.ts のパターン参考に新規 |
| `chi` | 上家(north)の捨て牌でチー可能 | 新規 |
| `bigwin` | 役満/高得点手 (点数計算確認用) | game.test.ts の AWS役リグ流用 |
| `furiten` | テンパイだが自分の捨て牌に待ちがある | 新規 |

テスト: 全プリセットをループし (a) `riggedDeal()` が throw しない (b) 136枚になる (c) 代表プリセットで GameController を起こし意図通りの状態 (`riichiCandidates` 非空等) を assert。

### 3. `src/debug/params.ts` (test first)

```ts
export interface DebugConfig {
  rig: RiggedDeal | null; // null = panelのみ有効、壁は通常ランダム
  presetName: string | null;
}
export function parseDebugConfig(search: string): DebugConfig | null;
```

- `debug` パラメータなし → `null`
- `?debug=1` → `{ rig: null }` (panelのみ)
- `?debug=riichi` → プリセット適用。未知名は throw (main側でtoast表示)
- `?debug=1&east=...&south=...&wallHead=...&deadWall=...&wallEnd=...` → キー名は `RiggedDeal` フィールド名と一致、存在するものだけ拾う
- プリセット + 個別キーは `{ ...preset, ...urlSpec }` でマージ (部分上書き可)
- mpsz の検証はここではしない (riggedDeal が枚数検証で throw するため二重実装しない)
- 既存 `?seed=` と共存 (rig 指定時 seed は CPU打牌乱数にのみ効く)

テストケース: `""` → null / `"?seed=42"` → null / `"?debug=1"` / `"?debug=riichi"` / 未知プリセット throw / 個別キー / プリセット+上書きマージ。

### 4. `src/debug/panel.ts` (HTML純関数は test first)

showToast と同じく **body 直下の独立レイヤー** (`#debug-panel`)。`#app` の innerHTML 全置換の影響を受けない。`<details>`/`<summary>` で開閉 (innerHTML 置換前に `open` 状態を読んで次のHTMLに引き継ぐ)。

表示内容 (すべて既存の純関数で導出):
1. **待ち牌**: 13枚形なら `winningTiles(hand, melds)`。14枚形なら「切る牌 → 待ち」一覧 (riichi.ts と同じ走査、同一IDはキャッシュ)
2. **フリテン**: `isFuriten()` + `permanentFuriten` フラグ
3. **役プレビュー**: テンパイ時、各待ち牌で `canWin()` → `judgeYaku()` してロン時の役+飜を表示。AWS役なしなら「和了不可」を赤表示 (AWS役縛りの確認に直結)。ctx は `{ isTsumo: false, isMenzen: isMenzenHand(melds), seatWind, roundWind, isRiichi }`
4. **CPU手牌公開**: south/west/north を `tilesToMpsz(sortTiles(hand).map(t => t.id))` のテキスト表示
5. **裏ドラ**: `uraDoraIndicators(deadWall, doraIndicatorCount)`
6. **山の次ツモ**: `state.wall` の次に引かれる側から4枚を mpsz 表示 (drawFromWall の取り出し方向を実装時に確認して合わせる)
7. **配牌編集フォーム**: east/south/west/north/wallHead/deadWall/wallEnd の text input + プリセット `<select>` + 「この配牌で開始」ボタン → クエリ文字列を組んで `location.assign()` でリロード (URL が single source of truth、そのまま共有・再現可能)。フォーム入力値と details open 状態は innerHTML 置換で消えないよう、置換前に現在値を退避して引き継ぐ

テスト: riichi プリセットで起こした state の `debugPanelHtml()` 文字列に待ち牌・役名・CPU手牌 mpsz が含まれることを assert。DOM 側 (`updateDebugPanel`) は薄く保ちテスト対象外 (node環境、jsdom 追加しない)。

### 5. `src/main.ts` 配線 (~20行)

```ts
let debugConfig: DebugConfig | null = null;
try {
  debugConfig = parseDebugConfig(location.search);
} catch (e) { /* showToast して通常ゲームにフォールバック */ }

const game = new GameController({
  seed,
  wallFactory: debugConfig?.rig ? () => riggedDeal(debugConfig.rig!) : undefined,
  onChange: ...,
});

function rerender(): void {
  render(root!, game.state, handlers, ui);
  if (debugConfig) updateDebugPanel(game.state, ...);
}
```

注意:
- `riggedDeal` は不正 mpsz / 枚数違い / プール枯渇で throw → `game.startMatch()` も try/catch し、失敗時は showToast + rig を null に落として通常スタート (wallFactory は配牌のたびに呼ばれエラーが再発するため)
- `startNextRound` でも同じ wallFactory が呼ばれ毎局同じ壁になる。debug 用途では再現に都合が良いので仕様としてコメント明記

### 6. `src/ui/styles.css` にパネルスタイル

`#debug-panel`: `position: fixed; right: 0; top: 0;` 半透明黒、monospace 小フォント、`max-height: 100vh; overflow-y: auto`。z-index はトーストより下。`<details>` 閉時はヘッダ1行だけ。

## スコープ外 (意図的に除外)

- 牌クリック式エディタ — mpsz テキスト入力で代替 (ユーザー確認済み)
- panel からの状態直接書き換え (フェーズジャンプ等) — URLリロードで十分
- `import.meta.env.DEV` ゲート — 常時有効 (ユーザー確認済み)。将来隠すなら main.ts の1箇所に条件を足すだけ
- jsdom 導入 — HTML文字列の純関数テストで代替

## 検証

1. `npm test` — 全テスト green (特にステップ1のリファクタで既存テストが不変なこと)
2. `npm run build` — 型チェック含めビルド成功
3. ブラウザ確認は **人間が実施** (CLAUDE.md ルール)。完了時に確認用URL一覧を提示:
   - `?debug=1` (panelのみ・ランダム配牌)
   - `?debug=riichi` / `?debug=ron` / `?debug=pon` / `?debug=chi` / `?debug=kan` / `?debug=bigwin` / `?debug=furiten`
   - `?debug=1&east=555z234m567m234p55s1z` (手牌直接指定)
   - panel の配牌編集フォーム → 開始 → URL反映の動作

## 実装順序 (TDD)

1. rigged.ts 抽出 (既存テストが網) → 2. presets.ts → 3. params.ts → 4. panel.ts → 5. main.ts 配線 → 6. CSS → 7. test/build 確認。各ステップで green を維持。
