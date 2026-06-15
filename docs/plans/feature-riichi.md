# リーチ機能 実装計画 (feature-riichi)

> **位置づけ**: 1セッション3機能 (①ドラ → **②リーチ** → ③calcFu) の **2番目**。
> **前提**: ドラ機能 (feature-dora.md) がマージ済みであること。本計画は §0 のインターフェースを前提とする。実物が異なる場合は実物に合わせて読み替えること (src/ が正)。
> **スコープ (ユーザー確認済み)**: フルリーチ = リーチ役(1飜) + 一発(1飜) + 裏ドラ + 手牌ロック(自動ツモ切り) + 供託1000点。**CPU もリーチ宣言する**。
> **進め方**: docs/plans/03-tdd-policy.md の Red → Green → Refactor。純粋層はテーブル駆動、GameController は riggedDeal による決定的シナリオ。UI は自動テストなし (ブラウザ目視、§7)。

---

## 0. ドラ機能 (feature-dora) が提供するインターフェース

実装開始前に以下を `src/dora.ts` / `src/types.ts` で確認する。差異があれば src/ を正として読み替える。

```ts
// src/dora.ts (①で実装済み)
export function nextTile(id: TileId): TileId;
export function countDoraHan(tileIds: TileId[], indicatorIds: TileId[]): number;
export function doraIndicators(deadWall: Tile[], revealedCount: number): Tile[];   // deadWall[0..4]
export function uraDoraIndicators(deadWall: Tile[], revealedCount: number): Tile[]; // deadWall[5..9] ★リーチ用予約API
export const MAX_DORA_INDICATORS = 5;

// GameState (①で追加済み)
doraIndicatorCount: number; // 公開済み表示牌の枚数。表示牌の実体は deadWall から純関数導出

// WinInfo: 構造変更なし。表ドラは yakus 配列の {id:"dora", name:"ドラ", han} 行として
// ゲート通過後に追加され totalHan に算入済み。裏ドラも同じ機構に乗せる:
// {id:"ura-dora", name:"裏ドラ", han} 行を追加する (本計画 §4 #tryWin)
```

`#tryWin` には既に「ゲート通過後・calcScore 前にドラ行を yakus/totalHan へ加算する」ブロックがある。裏ドラはこのブロックに「リーチ者なら `countDoraHan(同じ全牌リスト, uraDoraIndicators(deadWall, doraIndicatorCount))` を加算」を足すだけにする。**牌リストは表ドラ計算と同じもの** (concealed + melds.flatMap — `effectiveHandTiles` はカン4枚目を落とすので使用禁止)。

---

## 1. 設計判断 (実装後 D-013 として 04-design-decisions.md に記録)

> D 番号はドラ機能が D-012 を取った前提。実装時に 04 の最終番号を確認して採番すること。

1. **状態**: `Player.isRiichi` ほか5フィールド追加 (§2)。供託は `GameState.riichiPot` (点数の絶対値、1000の倍数)。和了者が総取り。流局時は次局へ持ち越し (`#deal` が引き継ぐ)。**東4終了時に残った供託は誰にも渡らず消滅** (最終順位は score のみで計算。最簡で十分なため)。不変条件: `Σ score + riichiPot === 100000`。
2. **宣言条件**: 門前 (`isMenzenHand` = 副露なし or 暗槓のみ) / テンパイを保つ打牌が存在 / `score >= 1000` / **ライブ壁 ≥ 1枚** (標準は≥4だが、本プロジェクトはノーテン罰符なし・形式テンパイ概念なしのため最簡の ≥1 を採用。docs に明記) / 未リーチ (再宣言不可)。
3. **宣言フロー (人間)**: `リーチ` ボタン (宣言可能時のみ表示) → 押すと UiState の「armed モード」に入り候補牌がハイライト → 牌を **1クリックで宣言打牌** (`humanRiichiDiscard(index)`)。候補外の牌はトーストで拒否。armed の解除はボタン再押下 or 状態変化 (onChange でリセット)。
4. **リーチ成立タイミング**: 宣言打牌が**ロンされなかった時点**で成立 (1000点支払い・isRiichi=true)。宣言牌がロンされたらリーチ不成立 (支払いなし。標準ルール準拠)。コントローラ私有フィールド `#pendingRiichi: Seat | null` で管理し、`#advanceToNext` (クレームなし) と `#executeClaim` の非ロン分岐 (ポン等された) で成立、ロン分岐で取り消す。
5. **リーチ後ロック**: 以後の手番は**自動ツモ切り** (人間も選択肢なし)。`#loop` が「人間 & isRiichi & !canTsumo」のとき自動で末尾牌 (ツモ牌) を打牌して継続する。`canTsumo` のときだけ停止 (ツモ宣言の機会)。ツモ拒否は「ツモ牌をクリックして捨てる」で可能 (`humanDiscard` はリーチ中ツモ牌のみ受理)。**リーチ後のカン (暗槓含む) は全面禁止** — 待ち変化判定・ドラめくりの複雑さ回避のため。既知の制限として docs に記録。`#refreshHumanTurnHints` で `selfKanOptions` を抑止、`#cpuTurnStep` の暗槓分岐に `!player.isRiichi` を追加。
6. **一発**: リーチ成立時 `isIppatsu = true`。消滅条件: (a) リーチ者自身の次の打牌完了 (`#discard` 冒頭で自席の `isIppatsu = false`)、(b) **任意の副露成立** (`#executeClaim` の非ロン分岐で**全席**の `isIppatsu = false`。宣言牌自体がポンされた場合は成立時から false)。ロンの見逃しでは消えない (ツモ一発は残る。標準準拠)。
7. **リーチフリテン**: `Player.permanentFuriten`。`#afterDiscard` で「リーチ者の待ち (`riichiWaits`、成立時に固定キャッシュ) に打牌が含まれる」とき**即座に**セットする (その打牌を本人がロンするなら局が終わるのでフラグは無害 = eager set で正しい)。`claims.ts:canRon` が `permanentFuriten` で拒否。CPU は `decideClaim` が常にロンするため「見逃し」は起きないが、AWS役ゲートでロンできずに待ち牌が流れたケースは同じ機構で正しくフリテンになる (特別扱い不要)。同巡フリテンは引き続きスコープ外。
8. **役配線**: リーチ (1飜, id `riichi`)・一発 (1飜, id `ippatsu`) は**分解非依存**なので `yaku/standard.ts` ではなく **`yaku/judge.ts` のトップレベル**で付与する (七対子・標準形の両方に効く。国士無双 = 役満には付けない: 点数が変わらず表示も純粋になるため)。`JudgeContext` に `isRiichi?: boolean; isIppatsu?: boolean` を**オプショナル**で追加 (既存テスト約190件の改修を避ける)。一発は `isRiichi && isIppatsu` のときのみ。**ダブル立直はスキップ** (ロードマップの役満特例注記どおり将来課題)。
   **AWS役ゲートとの関係 (重要)**: リーチ・一発は標準役なので `canDeclareWin` (AWS役必須ゲート) を**満たさない**。リーチのみの手は和了できない — これはゲート仕様として正しい。明示的にテストする (§6 Step 2, Step 7)。
9. **裏ドラ**: リーチ者の和了時のみ `countDoraHan(全牌, uraDoraIndicators(deadWall, doraIndicatorCount))` を計算し、`yakus` に `{id:"ura-dora", name:"裏ドラ", han}` 行 (han>0 のとき) として追加・totalHan に加算。役ではないのでゲートに影響しない (ゲート通過後に加算)。`WinInfo.uraIndicators` (公開した裏表示牌、非リーチ和了は null) を追加し winPanel で公開する。
10. **CPU リーチ**: `decideCpuAction` を拡張。`riichiAllowed` (門前・点数・壁・未リーチを controller 側で判定済み) のとき `riichiDiscardIndices` の**最初の候補**で宣言 (dumb で良い)。リーチ中 CPU は末尾 (ツモ牌) を打牌。
11. **クレーム適格性**: リーチ者は**ロン以外のクレーム不可**。`computeEligibility` に `isRiichi` を渡し pon/kan/chi を抑止 (これがないと CPU リーチ者が 5z をポンしてしまうバグになる — 見落とし注意)。
12. **河の横向き表示**: `Player.riichiDiscardIndex` (discards 配列の添字)。成立時に記録。宣言牌自体がポンされた場合は「次の打牌」の位置を指す (標準ルールの「次の牌を横にする」と一致)。

---

## 2. 型変更 (src/types.ts)

```ts
export interface Player {
  // ... 既存フィールド ...
  isRiichi: boolean;                 // リーチ成立済みか
  isIppatsu: boolean;                // 一発の権利が残っているか (isRiichi=true のときのみ意味を持つ)
  riichiWaits: TileId[];             // リーチ成立時に固定した待ち牌 (未リーチは空配列)
  permanentFuriten: boolean;         // リーチ後に待ち牌を見逃した (以後ロン不可、ツモは可)
  riichiDiscardIndex: number | null; // 河の横向き表示位置 (discards の添字)。未リーチは null
}

export interface GameState {
  // ... 既存フィールド (doraIndicatorCount 含む) ...
  riichiPot: number;          // 場の供託 (リーチ棒合計、点)。流局で次局へ持ち越し
  riichiCandidates: number[]; // 人間が今リーチ宣言できる打牌 index (不可なら空)。UI のボタン活性 + 牌ハイライト用
}

export interface WinInfo {
  // ... 既存フィールド ...
  // 裏ドラの飜は yakus の {id:"ura-dora"} 行として totalHan に算入済み
  uraIndicators: TileId[] | null; // 公開した裏ドラ表示牌 (非リーチ和了は null)
  riichiPotWon: number;           // 獲得した供託 (payments とは別枠。payments の合計は引き続き 0)
}
```

`makePlayer` (game.ts) に新フィールドの初期値 (`false` / `[]` / `null`) を追加。`#deal` は Player を作り直すので局またぎで自動リセットされる。**`riichiPot` だけは `#deal` で前状態から引き継ぐ**こと (`createInitialState` は 0、`startMatch` は `#deal(0)` の前に明示的に 0 リセット)。

その他のコンテキスト型:

```ts
// yaku/judge.ts
export interface JudgeContext {
  isTsumo: boolean; isMenzen: boolean; seatWind: SeatWind; roundWind: SeatWind;
  isRiichi?: boolean;   // 省略時 false
  isIppatsu?: boolean;  // 省略時 false。isRiichi=true のときのみ有効
}
// yaku/standard.ts の YakuContext は変更不要 (リーチ系は judge.ts レベルで付与)

// claims.ts
export interface EligibilityInput {
  // ... 既存 ...
  isRiichi?: boolean;          // true なら ron 以外を抑止
  permanentFuriten?: boolean;  // true なら ron も不可
}

// cpu.ts
export interface CpuContext { /* 既存4つ */ isRiichi: boolean; }
export interface CpuInput {
  // ... 既存 ...
  riichiAllowed?: boolean; // 門前・1000点・壁≥1・未リーチを controller が判定済みのときだけ true
}
export type CpuAction =
  | { action: "win" }
  | { action: "riichi"; tileIndex: number }  // 新規
  | { action: "discard"; tileIndex: number };
```

公開 API 変更: `humanDiscard(index): void` → **`ActionAttempt` を返す** (リーチ中の非ツモ牌拒否をトーストで出すため。既存テストは戻り値を見ていないので互換)。新 API: `humanRiichiDiscard(index): ActionAttempt`。

---

## 3. 新規モジュール src/riichi.ts (純粋層)

```ts
import type { MeldLike, Tile } from "./types";
import { winningTiles } from "./winning/furiten";

/**
 * リーチ宣言時に捨てられる牌の index を列挙する。
 * hand は打牌待ち (13 - 3*melds + 1 枚)。各 index を除いた残りが
 * winningTiles > 0 (テンパイ) なら候補。同一 tileId は結果をキャッシュして二重計算しない。
 */
export function riichiDiscardIndices(hand: Tile[], melds: MeldLike[]): number[];
```

実装メモ: 14候補 × `winningTiles` (各 <1ms) ≈ 十数 ms。`#refreshHumanTurnHints` では前提条件 (門前・未リーチ・ツモ直後・点数・壁) を先に弾いてから呼ぶので体感影響なし。同一 id の重複牌は `Map<TileId, boolean>` でキャッシュ。

---

## 4. game.ts の変更点 (フック別)

- **`#pendingRiichi: Seat | null`** (private フィールド、GameState には置かない): `humanRiichiDiscard` / CPU リーチ打牌の直前にセット。`#deal` で null リセット。
- **`#commitRiichi(seat, withIppatsu: boolean)`** (新 private): `score -= 1000`、`riichiPot += 1000`、`isRiichi = true`、`isIppatsu = withIppatsu`、`riichiWaits = winningTiles(hand, melds)`、`riichiDiscardIndex` 記録 (§1-12: `#advanceToNext` 経由なら `discards.length - 1`、ポン等で河から消えた後なら `discards.length`)、`#pendingRiichi = null`。
- **`#advanceToNext(from)`**: 冒頭で `#pendingRiichi` があれば `#commitRiichi(seat, true)` (壁0チェックの**前**。最終打牌リーチが流局しても棒は出る)。
- **`#executeClaim`**: `kind === "ron"` なら `#pendingRiichi = null` (不成立) してから `#tryWin`。非ロンなら (a) `#pendingRiichi` があれば `#commitRiichi(seat, false)`、(b) **全席** `isIppatsu = false`。
- **`#discard`**: 冒頭で `if (player.isIppatsu) player.isIppatsu = false;` (自分の次打牌で一発窓が閉じる。宣言打牌時は未成立なので影響なし)。
- **`#afterDiscard`**: ① `computeEligibility` に `isRiichi: p.isRiichi, permanentFuriten: p.permanentFuriten` を渡す。② リーチフリテン: `for (各他席 p) if (p.isRiichi && p.riichiWaits.includes(tile.id)) p.permanentFuriten = true;` (eager set、§1-7)。
- **`#cpuTurnStep`**: `decideCpuAction` の ctx に `isRiichi` を、入力に `riichiAllowed` (条件は §1-2) を追加。`action === "riichi"` なら `#pendingRiichi = seat` してから `#discard(seat, tileIndex)`。リーチ中は暗槓分岐をスキップし、win 不可なら**末尾 index を強制打牌** (decideCpuAction も末尾を返すが、game.ts 側を正とする)。
- **`#loop`**: 人間停止条件を変更:
  ```ts
  const p = s.players[s.turn];
  if (p.isHuman) {
    if (!p.isRiichi || s.canTsumo) return; // 通常 or ツモ宣言機会あり → 停止
    this.#discard("east", p.hand.length - 1); // リーチ中は自動ツモ切り (ツモ牌は末尾)
    continue;
  }
  ```
  D-009 の不変条件「公開メソッド復帰後 phase==='discard' ⇒ turn==='east'」は維持される。
- **`humanRiichiDiscard(index)`**: phase/turn ガード → `lastDrawTile !== null` → §1-2 の条件 → `state.riichiCandidates.includes(index)` → `#pendingRiichi = "east"` → `#discard` → `#loop` → `#emit`。失敗は `{success:false, reason}`。
- **`humanDiscard`**: リーチ中は `hand[index] !== lastDrawTile` なら `{success:false, reason:"リーチ中はツモ切りのみ"}` (参照等価、D-010 と同じ規約)。
- **`#refreshHumanTurnHints`**: `selfKanOptions` を `!east.isRiichi` で抑止。`riichiCandidates` を計算 (前提条件パス時のみ `riichiDiscardIndices`、それ以外 `[]`)。
- **`#canTsumoNow` / `#tryWin` / `claims.ts:canRon`**: judgeYaku の ctx に `isRiichi: player.isRiichi, isIppatsu: player.isIppatsu` を渡す。
- **`#tryWin`**: ゲート通過後の既存ドラ加算ブロックを拡張 — リーチ者なら `uraDoraIndicators(deadWall, doraIndicatorCount)` で裏ドラ飜を計算し `{id:"ura-dora", name:"裏ドラ", han}` 行を追加 (役満時はドラ同様スキップ)・totalHan 加算。精算後 `winner.score += riichiPot; winInfo.riichiPotWon = riichiPot; state.riichiPot = 0;` (payments には含めない)。`uraIndicators` は `player.isRiichi ? uraDoraIndicators(...).map(t=>t.id) : null`。
- **`#deal`**: 新 state 構築時に `riichiPot: this.#state.riichiPot` を引き継ぐ。`riichiCandidates: []`。`startMatch` は `#deal(0)` 前に pot を 0 に。

---

## 5. ファイル別変更一覧

| ファイル | 変更 |
|---|---|
| `src/types.ts` | Player +5 / GameState +2 / WinInfo +2 (§2) |
| `src/riichi.ts` **新規** | `riichiDiscardIndices` (§3) |
| `src/riichi.test.ts` **新規** | テーブル駆動 (§6 Step 1) |
| `src/yaku/judge.ts` | JudgeContext 拡張、judgeYaku で riichi/ippatsu 付与 (七対子・標準形のみ) |
| `src/yaku/judge.test.ts` | §6 Step 2 のケース追加 |
| `src/claims.ts` | EligibilityInput 拡張、リーチ中 pon/kan/chi 抑止、canRon の permanentFuriten 拒否 |
| `src/claims.test.ts` | §6 Step 3 のケース追加 |
| `src/cpu.ts` | CpuContext/CpuInput/CpuAction 拡張、リーチ判断 + リーチ中ツモ切り |
| `src/cpu.test.ts` | §6 Step 8 のケース追加 |
| `src/game.ts` | §4 の全フック |
| `src/game.test.ts` | §6 Step 4-9 + 既存の `totalScore === TOTAL_SCORE` 断言を `totalScore + state.riichiPot === TOTAL_SCORE` に更新 (CPU リーチで供託が出るため。L106/156/269/288/311/542/557/570 付近) |
| `src/ui/render.ts` | §7 |
| `src/ui/styles.css` | §7 |
| `src/main.ts` | §7 |
| `docs/plans/04-design-decisions.md` | D-013 追加 |
| `docs/plans/05-future-roadmap.md` | リーチを実装済みに、残課題記載 |
| `docs/plans/README.md` | 30秒オーバービュー更新 |

---

## 6. TDD ステップ (この順で Red → Green → Refactor)

### Step 1: riichi.ts — `riichiDiscardIndices` (純粋層)
Red (src/riichi.test.ts):
- `"555z234m67m234p55s" + "1z"` (14枚) → `[13]` (1z 切りのみテンパイ維持、待ち 5m/8m)
- ノーテン手 (バラバラ14枚) → `[]`
- 複数候補手 (例: `"234m234p234s55z66s7s"` 系で2箇所以上) → 全 index 列挙
- 七対子テンパイ: `"1m1m2p2p3s3s5z5z6z6z7z7z9s" + "4m"` → 4m切り (9s単騎) と 9s切り (4m単騎) の両 index
- 同一牌が複数あるとき全 index が出る (dedupe キャッシュの三角測量)

Green: ベタ書き → 一般実装 (winningTiles 再利用 + id キャッシュ)。

### Step 2: yaku/judge.ts — リーチ・一発の役付与
Red (judge.test.ts 追加):
- 標準形 + `{isRiichi:true}` → yakus に `{id:"riichi", han:1}`、totalHan +1
- `{isRiichi:true, isIppatsu:true}` → riichi + ippatsu で +2
- `{isIppatsu:true}` のみ (isRiichi なし) → ippatsu **付かない**
- 七対子 + isRiichi → 付く / 国士無双 + isRiichi → 付かない (役満)
- ctx 省略 (既存呼び出し) → 従来どおり (オプショナルの後方互換)
- **AWSゲート**: `canDeclareWin([riichi, ippatsu, menzen-tsumo], false) === false`

### Step 3: claims.ts — リーチ者の適格性
Red (claims.test.ts 追加):
- `isRiichi: true` → ron は可・pon/kan/chi は手牌が揃っていても false
- `permanentFuriten: true` → 和了形でも ron false
- 両フラグ省略 → 従来どおり

### Step 4: game.ts — 宣言・供託・成立 (統合)
Red (game.test.ts、riggedDeal 使用):

```ts
// リグA: 人間リーチ → 一周後にツモ
const RIICHI_RIG = {
  east: "555z234m67m234p55s1z", // 末尾1z=初ツモ。1z切りリーチで 5m/8m 待ち (kiro)
  south: "...", west: "...", north: "...", // 5m/8m を初手で打たない・テンパイしない捨て駒手 (既存テストの west/north を流用)
  wallHead: "9p9p9p8m", // south/west/north のツモ3枚 + east の次ツモ = 8m (和了牌)
};
```
- `state.riichiCandidates` が `[13]` / 非候補 index で `humanRiichiDiscard(0)` → `success:false`
- `humanRiichiDiscard(13)` 成功後 (ループは east の canTsumo 停止まで自動進行): `east.isRiichi === true`、`score === 24000`、`riichiPot === 1000`、`riichiDiscardIndex === 0`、`totalScore + pot === 100000`
- 再宣言不可・非門前 (ポン後) 不可は candidates が空になることで検証
- `moveHumanTile` 等の既存ガードに影響がないこと (既存テストが緑のまま)

### Step 5: ロック & 自動ツモ切り & カン禁止
リグA 続き:
- リーチ後、`humanDiscard` を呼ばなくても east の discards が増えている (自動ツモ切りが走った)
- canTsumo 停止時に `humanDiscard(0)` (非ツモ牌) → `success:false`、ツモ牌 index → 成功 (ツモ拒否 → 以後 8m がフリテン履歴に入る)
- `selfKanOptions` がリーチ中は常に `[]` (east 手牌に4枚揃いを仕込んだ変種リグ)

### Step 6: 一発ライフサイクル + リーチ+一発+門前ツモの飜合計
- **一発ツモ**: リグA で停止後 `humanDeclareTsumo()` → yakus に `riichi`/`ippatsu`/`menzen-tsumo`/`kiro`。裏ドラは `countDoraHan(手牌全部, uraDoraIndicators(state.deadWall, state.doraIndicatorCount).map(t=>t.id))` で期待値をテスト内計算し、han>0 なら `{id:"ura-dora"}` 行と一致 / `uraIndicators` 非null / `riichiPotWon === 1000` / `state.riichiPot === 0` / 精算後 `totalScore === 100000`
- **一発ロン**: east `"555z234m67m22p9p9p" + "6z"` (6z切りリーチ、2p/9p シャンポン、kiro)。south 先頭打牌が 2p になるリグ → claim 停止 → `humanClaim({kind:"ron"})` → ippatsu **あり**
- **副露で消滅**: 同上だが south に `"6z6z" + 2p3p4p5p6p7p8p9p1s2s3s` → south が宣言牌 6z をポン (decideClaim は dragon ポン) → リーチは成立 (`isRiichi`, pot 1000) するが `isIppatsu === false`、`riichiDiscardIndex === east.discards.length` (次の打牌が横向き位置)。ポン後 south が 2p を打牌 → east ロン → ippatsu **なし**
- **窓の自然消滅**: リグA でツモせず1巡流す → 以後のロンに ippatsu が付かない

### Step 7: 宣言牌ロンでリーチ不成立 + AWSゲート
- east `"555z234m67m234p55s8m"` (8m 切りリーチが候補に入る)、south `"666z234m67m234p55s"` (5m/8m 待ち cost-explorer) → `humanRiichiDiscard(8mのindex)` → south が即ロン → `phase === "win"`, winner south, `east.isRiichi === false`, `riichiPot === 0`, east の減点はロン精算のみ
- **ゲートテスト**: east を AWS役なしテンパイ (例 `"123m456m789m22p77s9s"` 系) でリーチ → wallHead で和了牌を east にツモらせる → `canTsumo === false` のまま自動ツモ切りされ和了しない (discards に和了牌が積まれる)。「リーチのみでは和了できない」の統合確認

### Step 8: CPU リーチ + リーチフリテン
- cpu.test.ts: `riichiAllowed + テンパイ` → `{action:"riichi", tileIndex}` / `riichiAllowed: false` → discard / `ctx.isRiichi` → 末尾 index / AWS和了可能なら riichi より `win` 優先
- game.test.ts: south に `"555z234m67m234p55s"` を仕込み east が捨て駒打牌 → 1巡後 `south.isRiichi === true`、`south.score === 24000`、`riichiPot === 1000`、`south.riichiDiscardIndex === 0`、以後 south の手牌構成が変わらない (ツモ切り)
- **リーチフリテン**: east リーチ (kiro 5m/8m 待ち)、south が 8m を打牌 → claim → `humanSkipClaim()` → `east.permanentFuriten === true` → 後続で再び 8m/5m が打たれても `phase` が `"claim"` にならない (south を `"8m8m9m9m9m8p8p9p9p8s8s9s9s"` 型にして2回 8m を打たせる)。CPU の見逃しは発生しない旨をテストコメントに記載

### Step 9: 供託の持ち越しと残置
- east リーチ → `playRoundToEnd` で流局 → `riichiPot === 1000` && `totalScore === 99000` → `startNextRound()` → `riichiPot >= 1000` のまま (リグ再配牌で CPU 親が追いリーチし得るため ≥ で断言) && 不変条件維持
- 東4まで完走して `round_end` 時に pot が残っていても順位は score のみ (既存の終局テストを不変条件版に更新)

各 Step とも Green 後に Refactor (重複除去、`#commitRiichi` への集約など) してから次へ。

---

## 7. UI 変更 (テスト対象外、目視確認)

**render.ts**
- `RenderHandlers` に `onRiichiToggle: () => void` を追加 (打牌は onTileClick 経由)。`UiState` に `riichiArmed: boolean` 追加。
- `actionsHtml`: ツモボタンの隣に `<button data-action="riichi" class="riichi${armed ? " armed" : ""}">リーチ</button>` — `state.riichiCandidates.length > 0` のときのみ表示。
- `handArea`: `ui.riichiArmed` のとき候補 index の牌に `extraClass: "riichi-ok"`、非候補に `"riichi-ng"` (薄表示)。
- `riverHtml`: `player.riichiDiscardIndex` の牌に `extraClass: "riichi-tile"` (`index < discards.length` ガード)。
- `centerSquare`: score chip 内に `${player.isRiichi ? '<span class="riichi-stick">リーチ</span>' : ""}`。center-info に `${state.riichiPot > 0 ? `<div class="pot">供託 ${state.riichiPot}</div>` : ""}`。
- `winPanel`: `info.uraIndicators` 非null なら裏ドラ表示牌タイルの行を表示 (裏ドラ飜は yakus の "裏ドラ" 行として自動表示される)。`info.riichiPotWon > 0` なら payments リストに `供託 +${riichiPotWon}` 行。
- `attachHandlers`: `on('button[data-action="riichi"]', () => handlers.onRiichiToggle())`。

**styles.css**
```css
/* 横向きリーチ牌: 回転はレイアウトボックスを変えないので、はみ出す分を margin で確保。
   .river-row は flex なので row 高は他の牌が維持する */
.tile.discard.riichi-tile {
  transform: rotate(-90deg);
  margin-inline: calc((var(--tile-discard-h) - var(--tile-discard-w)) / 2);
}
.riichi-stick { /* 赤点付き 1000点棒風の小バッジ */ }
.center-info .pot { /* 供託表示 */ }
.tile.hand.riichi-ng { opacity: 0.35; pointer-events: none; }
.tile.hand.riichi-ok { /* 枠ハイライト */ }
button.riichi.armed { /* 押下中表示 */ }
```
(変数名 `--tile-discard-w/h` は styles.css L16-17 で確認済み。zone の回転 transform とは別要素なので合成問題なし)

**main.ts**
- `ui.riichiArmed = false` 初期化、`onChange` でリセット (selectedHandIndex と同様)。
- `onRiichiToggle`: `ui.riichiArmed = !ui.riichiArmed; rerender();`
- `onTileClick`: `ui.riichiArmed` なら `orToast(game.humanRiichiDiscard(index))`、それ以外は従来の2クリック動作。`humanDiscard` も `orToast` でラップ (リーチ中ツモ切り違反のトースト)。

**手動ブラウザチェックリスト** (`npm run dev`、人間が実施。Claude はブラウザツールを入れないこと):
1. テンパイ可能なツモ時のみ「リーチ」ボタンが出る (例 `?seed=` 数種で確認)
2. ボタン押下で候補牌ハイライト・非候補が薄くなる/クリック不可。再押下で解除
3. 宣言後: 点数チップ −1000、中央に「供託 1000」、河の宣言牌が横向き、チップに「リーチ」バッジ
4. リーチ後は手番が自動で流れる (ツモ可能時のみ停止し、ツモボタン or ツモ牌クリックで選択)
5. リーチ中に他家の打牌へのロン窓は従来どおり開く。パス後は同じ待ちでロン窓が出ない
6. 和了モーダル: リーチ/一発が役リストに出る・裏ドラ表示牌と「裏ドラ N飜」行・「供託 +1000」行・点数整合
7. CPU リーチ: CPU の河に横向き牌・バッジ・供託表示。CPU がポン/チーしなくなる
8. 流局 → 次局で供託が残る。東4終了の順位表が正常
9. 横向き牌で river-row の高さ崩れ・3段目オーバーフローの表示崩れがないこと (top/left/right の回転ゾーンも)

---

## 8. ドキュメント更新

- **05-future-roadmap.md**: 「リーチ」を ✅実装済みに。残課題を明記: ダブル立直 (役満特例に含まれない点の注記を維持) / リーチ後のカン (全面禁止中) / 同巡フリテン / 終局時の残置供託 (消滅仕様)。
- **04-design-decisions.md**: **D-013「リーチの実装方針」** を追加 (番号はドラ機能の採番後に確認)。What: §1 の 1-12。Why: 自動ツモ切り採用理由 (ロック手で人間入力は無意味、#loop の停止条件1行で済む)、宣言牌ロン不成立の pending 方式、eager フリテンの正当性。Consequences: カン禁止・ダブリーなし・供託残置・`humanDiscard` が ActionAttempt を返すようになった点。
- **docs/plans/README.md**: 30秒オーバービューの1行目に「リーチ (一発・裏ドラ・供託) あり」を追記、テスト数更新。

---

## 9. 検証

1. `npm test` — 全テスト緑 (既存 190+ + 新規 ≈35)。特に既存 seed 系テストは CPU リーチで rng 消費順が変わり得るため、壊れたら「仕様変更による赤」として §5 の不変条件 (`totalScore + riichiPot === 100000`) へ書き直す (03-tdd-policy の「してはいけないこと」参照: 安易に消さない)
2. `npm run build` — 型エラーなし
3. §7 の手動チェックリストをユーザーに依頼
