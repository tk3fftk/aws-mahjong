# ドラ表示牌 実装計画 (feature-dora)

> **実装順序**: 本機能は同一ブランチ・同一セッションで実装する3機能の **1番目** (①ドラ → ②リーチ → ③calcFu)。
> ②リーチが裏ドラを必要とするため、本計画では**裏ドラ表示牌のスロットとアクセサを先行予約**する (実装は②で行う)。
> 進め方は [03-tdd-policy.md](./03-tdd-policy.md) の Red → Green → Refactor に従う。

---

## 0. 前提 (調査済みの事実 — 実装前に再確認すること)

| 事実 | 根拠 |
|---|---|
| 公式ルールは「ドラ」を **1飜の項目として明記** (`<li>ドラ</li>` が1飜リストにある)。ただし表示牌の枚数・カンドラ・裏ドラ・王牌の仕組みは**一切記述なし** | `docs/v2.0.1/rule.html` (1飜リスト)。`王牌/カンドラ/裏ドラ` は grep ヒット 0件 |
| ドラの「次の牌」マッピングに AWS 固有の変則は無い | `docs/v2.0.1/rule.html` / `yaku.html` にドラ写りの記述なし → **標準リーチ麻雀の慣例に従う** |
| `GameState.deadWall` は 14枚あるが**完全未使用** ("ドラ未実装の将来予約") | `src/types.ts:76`, `src/game.ts:120` (`splitDeadWall`) |
| リンシャンツモは**ライブ壁の末尾** (`drawFromWallEnd`)。王牌14枚は固定のまま。既存テストが `deadWall.toHaveLength(14)` を槓後にも assert している | `src/game.ts:471-486`, `src/game.test.ts:431-457`, D-009 項6 |
| 流局判定は `wall.length === 0` (`game.ts:425`)。壁が空のときカンは宣言不可 (`game.ts:252,301,346`) → **カンドラ公開時に壁は必ず残っている** | `src/game.ts` |
| AWS役必須ゲートは `canDeclareWin(yakus, isYakuman)` = 「役満 or AWS役IDが1つ以上」 | `src/yaku/judge.ts:92-97` |
| **罠**: `effectiveHandTiles()` はカンの4枚目を**落とす** (3枚に射影、D-009 項5)。ドラ枚数カウントには使えない → カンを4枚で数えるには `melds.flatMap(m => m.tiles)` を使う | `src/winning/melds.ts:19-25` |
| `riggedDeal` の壁 index: 配牌+親初ツモ = 0..52、ライブ壁 = 53..121 (`WALL_START=53`)、**王牌 = 122..135** (53+69)。リンシャンは index 121 から逆順 | `src/game.test.ts:14-66`, `src/wall.ts:85-87` |
| UI はテスト無し。ブラウザ確認は人間が行う (Claude はブラウザツールを入れない) | `CLAUDE.md`, 03-tdd-policy |
| ルートに `README.md` は**存在しない**。"30秒オーバービュー" は `docs/plans/README.md` | リポ構成 |

---

## 1. 設計判断 (→ 完了後に D-012 として記録)

### 1-1. 王牌14枚のインデックスレイアウト

`deadWall[0]` = ライブ壁側の先頭 (`splitDeadWall` の slice 先頭) として:

```
deadWall[0..4]   表ドラ表示牌スロット (公開は doraIndicatorCount 枚まで)
deadWall[5..9]   裏ドラ表示牌スロット (★リーチ機能用の予約。今回は公開も使用もしない)
deadWall[10..13] リンシャン予約 (未使用。リンシャンは引き続きライブ壁末尾から)
```

表ドラ i 枚目と裏ドラ i 枚目は `i` と `i+5` でペア (標準麻雀の上下段に対応)。

### 1-2. リンシャンは現状維持 (ライブ壁末尾) — 選択肢 (a)

- **採用**: 王牌は純粋に表示牌置き場とし、リンシャンは `drawFromWallEnd` のまま (D-009 項6 と整合)。
- **トレードオフ**: 厳密ルールでは嶺上牌は王牌から取り海底が前倒しされるが、本実装では「カン1回ごとにライブ壁ツモ可能数が1減る」効果は既に同じ。差異は「王牌の物理的どこから取るか」だけで、ゲーム結果に影響しない。既存テスト (`deadWall` 14枚固定 assert) も壊さない。**既知の逸脱として D-012 に明記**する。
- 不採用案 (b): リンシャンを `deadWall[10..13]` から取る — 正確だが `#drawRinshan`・流局条件・既存テスト3件の書き換えが必要で、見返りゼロ。

### 1-3. カンドラ公開タイミング

**「カン成立と同時に即公開」**(リンシャンツモの前) に統一する。厳密ルール (明槓は打牌後めくり) との差異は D-012 に注記。暗槓/加槓/明槓すべて同じ1箇所のヘルパ `#revealKanDora()` で処理でき、リンシャンツモ和了時に新ドラが乗る点も標準的な挙動 (暗槓即めくり) と一致する。

### 1-4. ドラと AWS役必須ゲート・役満・数え

- ドラは**役ではない**: `canDeclareWin` 判定は `judgeYaku` の結果のみで行い、**その後に**ドラ飜を加算する。`isAwsYakuId("dora")` は false なので二重ガードも効く。
- **役満時はドラを加算しない** (`judged.isYakuman === true` ならスキップ)。
- 非役満でもドラ込みで `totalHan >= 13` になれば `calcScore` のテーブル選択上、役満支払い (数え役満相当) になる — 仕様として許容し D-012 に注記。
- 流局 (`draw_game`) ではドラ計算は一切不要 (和了時のみ `#tryWin` 内で計算)。

### 1-5. 状態の持ち方 (Imperative Shell / Functional Core)

GameController が持つ可変状態は **`doraIndicatorCount: number` の1つだけ**。表示牌の実体は `deadWall` から純関数 (`src/dora.ts`) で導出する (単一情報源)。裏ドラも `uraDoraIndicators(deadWall, count)` という純関数で公開し、リーチ実装はこれを呼ぶだけでよい。

---

## 2. 型変更 (src/types.ts)

```ts
export interface GameState {
  wall: Tile[]; // ライブ壁 (配牌後 69枚)。0 で流局
  // 王牌14枚。[0..4]=表ドラ表示牌, [5..9]=裏ドラ表示牌(リーチ用予約・未公開),
  // [10..13]=リンシャン予約(未使用。リンシャンはライブ壁末尾から: D-009/D-012)
  deadWall: Tile[];
  // 公開済みドラ表示牌の枚数 (1..5)。配牌時に1、カン成立ごとに+1 (上限5)
  doraIndicatorCount: number;
  // ... 以下既存フィールド変更なし
}
```

**`WinInfo` は構造変更なし**。ドラは `yakus` 配列に `{ id: "dora", name: "ドラ", han: N }` の1行として追加し、`totalHan` に含めて格納する。これにより:
- 和了画面の役リスト (`winPanel` の `<li>name/han</li>`) に自動で「ドラ N飜」が出る
- リーチ実装時も裏ドラを `{ id: "ura-dora", ... }` 行として同じ機構に乗せられる

---

## 3. 新規・変更ファイル一覧

| ファイル | 区分 | 内容 |
|---|---|---|
| `src/dora.ts` | **新規** | 純関数: `nextTile` / `countDoraHan` / `doraIndicators` / `uraDoraIndicators` / `MAX_DORA_INDICATORS` |
| `src/dora.test.ts` | **新規** | 上記のテーブル駆動テスト |
| `src/types.ts` | 変更 | `GameState.doraIndicatorCount` 追加 + `deadWall` コメント更新 |
| `src/game.ts` | 変更 | `#deal`/`createInitialState` で初期化、`#revealKanDora()`、`#tryWin` でドラ加算 |
| `src/game.test.ts` | 変更 | `riggedDeal` に `deadWall`/`wallEnd` 仕込み追加 + 統合テスト6件 |
| `src/ui/render.ts` | 変更 | `centerSquare` にドラ表示行を追加 |
| `src/ui/styles.css` | 変更 | `.dora-row` のスタイル |
| `src/wall.ts` | 変更 | `DEAD_WALL_SIZE` のコメント更新のみ (ロジック変更なし) |
| `docs/plans/05-future-roadmap.md` / `04-design-decisions.md` / `README.md` | 変更 | §8 参照 |

依存方向: `dora.ts` は `tiles.ts`/`types.ts` のみ import (01-architecture の依存ルール準拠)。`game.ts` と `ui/render.ts` が `dora.ts` を import する。

---

## 4. TDD ステップ (Red → Green → Refactor)

作業前に `npm test` でベースライン緑 (現状 190件) を確認すること。

### Step 1: `nextTile` (src/dora.test.ts → src/dora.ts)

**Red** — 最初は1ケースだけ書き、ベタ書きで通してから三角測量で追加する (03-tdd-policy):

```ts
import { describe, it, expect } from "vitest";
import { nextTile } from "./dora";
import type { TileId } from "./types";

describe("nextTile (ドラ表示牌 → ドラ)", () => {
  const cases: Array<[TileId, TileId]> = [
    ["1m", "2m"], ["8m", "9m"],
    ["9m", "1m"], ["9p", "1p"], ["9s", "1s"], // 9→1 で suit 内ラップ
    ["4s", "5s"],
    ["1z", "2z"], ["2z", "3z"], ["3z", "4z"], ["4z", "1z"], // 風: 1z→2z→3z→4z→1z
    ["5z", "6z"], ["6z", "7z"], ["7z", "5z"],               // 三元: 5z→6z→7z→5z
  ];
  it.each(cases)("%s の次は %s", (indicator, dora) => {
    expect(nextTile(indicator)).toBe(dora);
  });
});
```

**Green** — `src/dora.ts` に実装。`tiles.ts` の `suitOf` / `numberOf` / `isWind` / `isDragon` を使う:

```ts
export function nextTile(id: TileId): TileId {
  if (isWind(id)) return `${(numberOf(id) % 4) + 1}z` as TileId;      // 1z..4z 循環
  if (isDragon(id)) return `${((numberOf(id) - 5 + 1) % 3) + 5}z` as TileId; // 5z..7z 循環
  return `${(numberOf(id) % 9) + 1}${suitOf(id)}` as TileId;          // 数牌 9→1
}
```

### Step 2: `countDoraHan`

**Red**:

```ts
import { countDoraHan } from "./dora";
import { mpszToTiles } from "./tiles";

describe("countDoraHan", () => {
  it("表示牌 4s (ドラ=5s) に対し手中の 5s 2枚で 2飜", () => {
    expect(countDoraHan(mpszToTiles("55s123m"), ["4s"])).toBe(2);
  });
  it("ドラ該当なしは 0", () => {
    expect(countDoraHan(mpszToTiles("123m456p"), ["4s"])).toBe(0);
  });
  it("同一表示牌が2枚めくれていれば二重カウント", () => {
    expect(countDoraHan(mpszToTiles("5s111m"), ["4s", "4s"])).toBe(2);
  });
  it("カン4枚はすべて数える: 表示牌 9m (ドラ=1m) × 1m4枚 = 4飜", () => {
    expect(countDoraHan(mpszToTiles("1111m"), ["9m"])).toBe(4);
  });
  it("複数表示牌の合算: 4s(→5s) + 3z(→4z)、手に 5s×1 + 4z×2 = 3飜", () => {
    expect(countDoraHan(mpszToTiles("5s4z4z"), ["4s", "3z"])).toBe(3);
  });
});
```

**Green**:

```ts
/** 牌ID列に含まれるドラの総数 (=飜)。indicators は「表示牌」(ドラはその次の牌) */
export function countDoraHan(tileIds: TileId[], indicatorIds: TileId[]): number {
  let han = 0;
  for (const ind of indicatorIds) {
    const dora = nextTile(ind);
    for (const id of tileIds) if (id === dora) han++;
  }
  return han;
}
```

### Step 3: `doraIndicators` / `uraDoraIndicators` / `MAX_DORA_INDICATORS`

**Red**:

```ts
import { doraIndicators, uraDoraIndicators, MAX_DORA_INDICATORS } from "./dora";
import type { Tile } from "./types";

// 王牌14枚: 1m..9m,1p..5p (index と牌が1対1で分かる並び)
const dw: Tile[] = mpszToTiles("123456789m12345p").map((id) => ({ id, copy: 0 }));

describe("ドラ表示牌スロット (deadWall[0..4]=表, [5..9]=裏, [10..13]=予約)", () => {
  it("公開1枚: deadWall[0] のみ", () => {
    expect(doraIndicators(dw, 1).map((t) => t.id)).toEqual(["1m"]);
  });
  it("公開3枚: deadWall[0..2]", () => {
    expect(doraIndicators(dw, 3).map((t) => t.id)).toEqual(["1m", "2m", "3m"]);
  });
  it("上限5枚でキャップ", () => {
    expect(MAX_DORA_INDICATORS).toBe(5);
    expect(doraIndicators(dw, 9)).toHaveLength(5);
  });
  it("裏ドラは表と平行スロット (index+5)。リーチ実装が使う予約API", () => {
    expect(uraDoraIndicators(dw, 1).map((t) => t.id)).toEqual(["6m"]);
    expect(uraDoraIndicators(dw, 5).map((t) => t.id)).toEqual(["6m", "7m", "8m", "9m", "1p"]);
  });
  it("空の deadWall (配牌前) では空配列", () => {
    expect(doraIndicators([], 1)).toEqual([]);
  });
});
```

**Green**:

```ts
// 王牌レイアウト: [0..4]=表ドラ表示, [5..9]=裏ドラ表示(リーチ用), [10..13]=リンシャン予約(未使用)
export const MAX_DORA_INDICATORS = 5; // 初期1 + カン4回
const URA_OFFSET = 5;

export function doraIndicators(deadWall: Tile[], revealedCount: number): Tile[] {
  return deadWall.slice(0, Math.min(revealedCount, MAX_DORA_INDICATORS));
}
/** 裏ドラ表示牌 (★リーチ機能用の予約API。現状は未公開・未使用) */
export function uraDoraIndicators(deadWall: Tile[], revealedCount: number): Tile[] {
  const n = Math.min(revealedCount, MAX_DORA_INDICATORS);
  return deadWall.slice(URA_OFFSET, URA_OFFSET + n);
}
```

**Refactor**: dora.ts 全体にレイアウト図のコメントを付け、types.ts の `deadWall` コメントと一致させる。

### Step 4: `GameState.doraIndicatorCount` の初期化 (game.test.ts → game.ts)

**Red** — `game.test.ts` の「startMatch 後」describe に追記:

```ts
it("配牌時にドラ表示牌が1枚公開されている", () => {
  const game = new GameController({ seed: 42 });
  game.startMatch();
  expect(game.state.doraIndicatorCount).toBe(1);
});
```

(この時点で `types.ts` にフィールドを足さないと TS が通らない → 型追加もこのステップで行う)

**Green**:
- `src/types.ts`: §2 の通り `doraIndicatorCount: number` 追加
- `src/game.ts` `#deal` (L139 付近) の state リテラルに `doraIndicatorCount: 1,` を追加
- `createInitialState()` (L664 付近) にも `doraIndicatorCount: 1,` を追加 (deadWall 空なので導出は [])

局送りのリセットは `#deal` が state オブジェクトを丸ごと再構築するため**構造的に保証**される (後の Step 6 の局送りシナリオでも暗黙に検証される)。

### Step 5: カンドラ即公開 (game.test.ts → game.ts)

**Red** — 既存のカン3テスト (`game.test.ts:431-507`) と同じリグを流用して3件追加:

```ts
it("暗槓: 宣言と同時にカンドラが1枚増える", () => {
  const game = riggedGame({ east: "9s9s9s9s2m3m4m6p7p8p2s2s5z6z" });
  expect(game.state.doraIndicatorCount).toBe(1);
  expect(game.humanSelfKan(0).success).toBe(true);
  expect(game.state.doraIndicatorCount).toBe(2);
});

it("明槓: claim からのカンでもカンドラが増える", () => {
  const game = riggedGame({
    east: "1m1m1m2p3p4p2s3s4s9p9p1z2z9s",
    south: "1m345m345p678s4z4z4z",
  });
  game.humanDiscard(13);
  game.humanClaim({ kind: "kan" });
  expect(game.state.doraIndicatorCount).toBe(2);
});

it("加槓でもカンドラが増える", () => {
  const game = riggedGame({
    east: "1m1m2p3p4p2s3s4s9p9p1z1z2z9s",
    south: "1m345m345p678s4z4z4z",
    wallHead: "9m8p7s6s1m",
  });
  game.humanDiscard(13);
  game.humanClaim({ kind: "pon" });
  game.humanDiscard(0);
  expect(game.state.selfKanOptions).toContainEqual({ kind: "kakan", tileId: "1m" });
  game.humanSelfKan(0);
  expect(game.state.doraIndicatorCount).toBe(2);
});
```

**Green** — `src/game.ts`:

```ts
import { doraIndicators, countDoraHan, MAX_DORA_INDICATORS } from "./dora";

// カン成立時に即カンドラを1枚公開する (明槓の「打牌後めくり」は簡略化: D-012)
#revealKanDora(): void {
  this.#state.doraIndicatorCount = Math.min(
    this.#state.doraIndicatorCount + 1,
    MAX_DORA_INDICATORS,
  );
}
```

呼び出し2箇所 (どちらも `#drawRinshan` の直前):
- `#executeClaim` の kan 分岐 (L411 付近): `this.#revealKanDora();` を `this.#drawRinshan(claim.seat);` の前に
- `#performSelfKan` 末尾 (L467 付近): `this.#revealKanDora();` を `this.#drawRinshan(seat);` の前に

### Step 6: 和了時のドラ加算 (riggedDeal 拡張 → #tryWin)

**6a. テストシーム拡張 (Red の前準備)** — `game.test.ts` の `riggedDeal` に王牌とライブ壁末尾の仕込みを追加:

```ts
interface RiggedDeal {
  east: string;
  south?: string;
  west?: string;
  north?: string;
  wallHead?: string;
  deadWall?: string; // 王牌の先頭から並べる (先頭 = ドラ表示牌1枚目)。最大14枚
  wallEnd?: string;  // ライブ壁の末尾から並べる (先頭 = 最初のリンシャン牌)
}

// 53(配牌+初ツモ) + 69(ライブ壁) = index 122..135 が王牌、121 がリンシャン1枚目
const DEAD_WALL_START = 122;
const LIVE_WALL_END = 121;

// riggedDeal 内、wallHead 処理の後に:
if (spec.deadWall) {
  mpszToTiles(spec.deadWall).forEach((id, i) => {
    wall[DEAD_WALL_START + i] = take(id);
  });
}
if (spec.wallEnd) {
  mpszToTiles(spec.wallEnd).forEach((id, i) => {
    wall[LIVE_WALL_END - i] = take(id);
  });
}
```

**6b. Red** — 統合テスト (新 describe `"GameController / ドラ"`):

```ts
it("ツモ和了でドラが totalHan に加算され、役リストに「ドラ」行が入る", () => {
  // 手牌に 5s×2、表示牌 4s → ドラ=5s で 2飜
  const withDora = riggedGame({ east: "555z234m567m234p55s", deadWall: "4s" });
  expect(withDora.humanDeclareTsumo().success).toBe(true);
  const info = withDora.state.winInfo!;
  expect(info.yakus).toContainEqual({ id: "dora", name: "ドラ", han: 2 });
  expect(info.totalHan).toBe(info.yakus.reduce((s, y) => s + y.han, 0));

  // 三角測量: 表示牌 1z (ドラ=2z、手に無し) だと dora 行なし・2飜少ない
  const noDora = riggedGame({ east: "555z234m567m234p55s", deadWall: "1z" });
  noDora.humanDeclareTsumo();
  const base = noDora.state.winInfo!;
  expect(base.yakus.some((y) => y.id === "dora")).toBe(false);
  expect(info.totalHan).toBe(base.totalHan + 2);
});

it("ドラだけでは和了できない (AWS役必須ゲートに数えない)", () => {
  // 既存の noAws リグ (game.test.ts:178) + ドラが2枚乗る表示牌
  const game = riggedGame({ east: "111z234m567m234p55s", deadWall: "4s" });
  const result = game.humanDeclareTsumo();
  expect(result.success).toBe(false);
  expect(result.reason).toBe("AWS役がありません");
});

it("役満にはドラを加算しない", () => {
  // 国士無双 (1m 雀頭)。表示牌 9m → ドラ=1m×2 だが加算されない
  const game = riggedGame({
    east: "1m9m1p9p1s9s1z2z3z4z5z6z7z1m",
    deadWall: "9m",
  });
  expect(game.humanDeclareTsumo().success).toBe(true);
  const info = game.state.winInfo!;
  expect(info.isYakuman).toBe(true);
  expect(info.yakus.some((y) => y.id === "dora")).toBe(false);
  expect(info.totalHan).toBe(13);
});

it("ドラ牌の暗槓は4枚分カウントされ、カンドラも乗る", () => {
  // east: 9s×4 を暗槓 → リンシャン 2z で 555z+234m+222z+44p+暗槓9s が完成
  // 表示牌1枚目 8s → ドラ=9s×4。カンドラ表示 5m → ドラ=6m×0
  const game = riggedGame({
    east: "9s9s9s9s555z234m44p2z2z",
    deadWall: "8s5m",
    wallEnd: "2z",
  });
  expect(game.humanSelfKan(0).success).toBe(true); // 暗槓 → リンシャン 2z
  expect(game.state.doraIndicatorCount).toBe(2);
  expect(game.humanDeclareTsumo().success).toBe(true);
  const doraRow = game.state.winInfo!.yakus.find((y) => y.id === "dora");
  expect(doraRow?.han).toBe(4); // effectiveHandTiles の3枚射影に引きずられないこと
});
```

注意 (リグ設計の検算):
- `"555z234m567m234p55s"` = 14枚 (既存リグ流用)。`deadWall` の牌は pool から `take` されるため、手牌と合わせて同種5枚を要求しないこと。
- 国士リグの末尾 `1m` が親の初ツモ。`9m` は手牌1枚 + 王牌1枚 = 2枚で pool (4枚) 内に収まる。
- 暗槓リグ: カン後の手牌 = `555z234m44p2z2z` + リンシャン `2z` = 11枚 = 刻子555z + 順子234m + 刻子222z + 雀頭44p、暗槓は3枚刻子に射影され標準形成立。AWS役 = kiro (555z) でゲート通過。

**6c. Green** — `src/game.ts` `#tryWin` (L534 付近) を変更。**ゲート判定の後・calcScore の前**にドラを挿入:

```ts
const judged = judgeYaku(winForm, effectiveHandTiles(concealed, player.melds), { ... });
if (!canDeclareWin(judged.yakus, judged.isYakuman)) {
  return { success: false, reason: "AWS役がありません" };
}
// ドラは役ではない: ゲート通過後に飜だけ加算する。役満には乗せない。
// effectiveHandTiles はカン4枚目を落とす (D-009 項5) ため、ここでは副露の全牌を使う
let yakus = judged.yakus;
let totalHan = judged.totalHan;
if (!judged.isYakuman) {
  const indicators = doraIndicators(this.#state.deadWall, this.#state.doraIndicatorCount);
  const allTileIds = [...concealed, ...player.melds.flatMap((m) => m.tiles)].map((t) => t.id);
  const doraHan = countDoraHan(allTileIds, indicators.map((t) => t.id));
  if (doraHan > 0) {
    yakus = [...yakus, { id: "dora", name: "ドラ", han: doraHan }];
    totalHan += doraHan;
  }
}
const payments = calcScore({ totalHan, isDealer: player.isDealer, isTsumo: opts.isTsumo });
// ... winInfo には judged.* ではなく yakus / totalHan を格納する
```

`#canTsumoNow` (L503) と `cpu.ts` は**変更不要** (ドラは和了可否に影響しない)。

**Refactor**: `#tryWin` のドラ加算ブロックが長ければ `#withDora(judged, concealed, melds): { yakus, totalHan }` 程度の private メソッドに抽出。全テスト (`npm test`) 緑を確認。

### Step 7: UI (自動テスト無し — 03-tdd-policy の方針通り)

**`src/ui/render.ts`** — `centerSquare()` (L131-153) の `.center-info` 内、`.wall` の直後にドラ行を追加:

```ts
import { doraIndicators, MAX_DORA_INDICATORS } from "../dora";

// centerSquare 内:
const revealed = doraIndicators(state.deadWall, state.doraIndicatorCount);
const doraTiles = [
  ...revealed.map((t) => renderTileById(t.id, { variant: "discard" })),
  ...Array.from(
    { length: Math.max(0, MAX_DORA_INDICATORS - revealed.length) },
    () => `<div class="tile back"></div>`,
  ),
].join("");
// テンプレートの .center-info 内:
//   <div class="dora-row" title="ドラ表示牌">${doraTiles}</div>
```

方針: **5スロット固定表示・未公開は裏向き** (実卓と同じ見た目で、カンでめくれる演出が分かりやすい)。

**`src/ui/styles.css`** — 「中央スクエア」セクション (`.center-info .wall` の後ろ) に追加:

```css
/* ドラ表示牌: 5スロット固定。未公開は裏向き。中央スクエアの font-size に追従して縮む */
.center-info .dora-row {
  display: flex;
  gap: 2px;
  justify-content: center;
  margin-top: 4px;
}
.center-info .dora-row .tile {
  width: calc(var(--tile-discard-w) * 0.62);
  height: calc(var(--tile-discard-h) * 0.62);
}
```

(中央セルは 3x3 grid の `c` 領域。5枚で横幅が溢れる場合は係数を 0.5 程度まで下げる。)

**人間によるブラウザ確認チェックリスト** (`npm run dev` — Claude はここで止まり、以下を提示):

1. 配牌直後、中央スクエアに表示牌1枚 (表) + 裏4枚が出る。表示牌の hover tooltip に AWS サービス名が出る
2. 暗槓/明槓/加槓のたびに左から順に1枚ずつめくれる (山カウント減少と同時)
3. ドラを含む手で和了 → 和了モーダルの役リストに「ドラ N飜」行が出て、合計飜・点数に反映されている
4. ドラ無しで和了 → 「ドラ」行が出ない
5. 役満和了 → 「ドラ」行が出ない
6. 次の局へ進むと表示牌が1枚に戻り、牌が変わっている
7. ウィンドウを縮めても5スロットが中央スクエアから溢れない (もし溢れたら CSS 係数調整)
8. 流局・終局フローに変化がない

### Step 8: ドキュメント更新

1. **`docs/plans/05-future-roadmap.md`**: 「### ドラ表示牌」を `### ~~ドラ表示牌~~ ✅ 実装済み (2026-06)` に変更し、「残: 裏ドラ (リーチ実装で公開。スロットとアクセサ `uraDoraIndicators` は予約済み)」を記載。中期セクションのリーチ項の「一発・裏ドラの実装」に「裏ドラ表示スロットは D-012 で予約済み」と追記。
2. **`docs/plans/04-design-decisions.md`**: D-011 の後に **D-012** を追加。内容: §1 の判断 (王牌レイアウト 5+5+4 / リンシャンはライブ壁のまま=既知の逸脱 / カン成立時即めくり / ドラは役でなくゲート後加算・役満非加算・数え役満許容 / 状態は `doraIndicatorCount` のみで表示牌は純関数導出 / 裏ドラはリーチ用予約)。D-009 項6 の本文末尾に「→ ドラ実装後の扱いは D-012」と相互参照を追記。
3. **`docs/plans/README.md`**: 30秒オーバービューの1行目に「ドラ (カンドラ対応)」を追記し、テスト件数「190件」を実測値に更新 (本実装で +20件前後)。
4. `src/wall.ts:76` の `DEAD_WALL_SIZE` コメント「ドラ表示は未実装だが〜」を「[0..4]=表ドラ表示, [5..9]=裏ドラ予約, [10..13]=リンシャン予約 (src/dora.ts)」に更新。

### Step 9: 検証

```
npm test        # 全テスト緑 (ベースライン190 + 新規 ~20件)
npm run build   # tsc + vite build が通ること
```

ブラウザ確認は人間に依頼 (Step 7 のチェックリストを提示して終了)。**ブラウザ検証ツールのインストールは禁止** (CLAUDE.md)。

---

## 5. リスクと注意点

- **最重要の罠**: ドラ枚数カウントに `effectiveHandTiles()` を使わないこと (カン4枚目が落ちる)。Step 6b の暗槓4枚テストがこの退行を検知する。
- `riggedDeal` の `deadWall`/`wallEnd` 仕込みは pool からの `take` なので、手牌仕込みと合計で同種4枚を超えると `pool exhausted` で即失敗する (安全側)。
- 既存テストへの影響: `winInfo.yakus` を厳密一致 (`toEqual`) で見ているテストがあればドラ行混入で壊れ得るが、既存リグは `deadWall` 未指定 → 王牌は pool 充填 (copy-major 順) で表示牌が決まる。万一既存テストが赤くなったら「ドラが偶然乗った」ケースなので、表示牌を無害な牌にする `deadWall: "1z"` 等を該当リグに足して決定化する (仕様の問い直しサインとして扱う)。
- `phase: "deal"` の初期状態では `deadWall=[]` のため `doraIndicators` は `[]` を返し、UI は裏5枚表示になる (一瞬なので問題なし)。
