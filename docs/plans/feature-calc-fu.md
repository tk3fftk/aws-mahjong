# 符計算 (calcFu) 実装計画 (feature-calc-fu)

> **位置づけ**: 1セッション3機能 (①ドラ → ②リーチ → **③符計算**) の **3番目**。①②はマージ済みとして書く: `WinInfo.totalHan` にはドラ/裏ドラ飜 (yakus の {id:"dora"}/{id:"ura-dora"} 行) が合算済み、`riichi`/`ippatsu` 役が存在する。ドラ・リーチ由来の飜は**全分解に一様に加算される**ため、本機能の「分解×待ち形の最大値選択」には影響しない (符はドラと無関係)。
>
> **必読**: 着手前に `docs/v2.0.1/rule.html` の「点数計算」節、`docs/plans/03-tdd-policy.md`、`docs/plans/04-design-decisions.md` (D-006 co-location / D-009)、`docs/plans/05-future-roadmap.md` L42-46 を読むこと。①②で `score.ts` / `judge.ts` / `WinInfo` 周辺が本計画の行番号からずれている可能性があるため、**各ステップ着手時に必ず実物を再確認**する。

---

## 0. 背景と決定すべき設計判断

### 0-1. 現状

- `src/score.ts` の `TABLE` (現 L37-47) は公式 `rule.html` の点数表そのもので、**飜ベース (符の概念なし、実質30符固定とも一致しない独自簡易表)**。例: 3飜子ロン3000 / 4飜子ロン5000。
- `docs/plans/05-future-roadmap.md` L42-46 が「`calcFu()` を実装。雀頭・面子・待ち形から符を計算」「点数テーブルの han→{han, fu} 拡張」を明示。既知の妥協点の表にも「符30固定」の行がある。

### 0-2. 【判断1】点数式: 標準リーチ麻雀式を採用 (公式表からの意図的逸脱 → D-014)

**採用**: 標準式 `base = fu × 2^(2+han)`、満貫以上は飜で固定:

| 条件 | base |
|---|---|
| base > 2000 (han ≤ 5) | 2000 (満貫) |
| han 6-7 | 3000 (跳満) |
| han 8-10 | 4000 (倍満) |
| han 11-12 | 6000 (三倍満) |
| han ≥ 13 (`YAKUMAN_HAN_THRESHOLD`) | 8000 (役満) |

支払い (各支払いを100点単位に**切り上げ** `ceil100`):
- 子ロン: `ceil100(base×4)` / 親ロン: `ceil100(base×6)`
- 子ツモ: 親 `ceil100(base×2)` + 子各 `ceil100(base×1)` / 親ツモ: 各 `ceil100(base×2)`

**検証済み: 満貫以上の全段階で現行 TABLE と完全一致する** (満貫 8000/12000、跳満 12000/18000、倍満 16000/24000、三倍満 24000/36000、役満 32000/48000、ツモ内訳も一致。なお rule.html の役満親ツモ「18000」は 48000 と矛盾する公式表の誤記で、現行コードは既に 16000 を採用済み — D-014 に併記する)。**乖離は4飜以下のみ** (§3 の表参照)。

**棄却した代替案**: 「TABLE を維持し符は表示のみ」— ロードマップの意図 (`han→{han,fu}` 拡張) に反し、符を計算するのに点数へ反映しない中途半端な状態になる。符が点数を動かさないなら計算する価値がほぼ無い。→ **公式表からの逸脱を D-014 として記録し、人間がブラウザで最終確認する** (CLAUDE.md の「ブラウザ検証は人間」の運用に従う)。

### 0-3. 【判断2】平和の待ち形条件を修正する (スコープに含める)

現在の `standard.ts` L26-28 の平和は「全順子+雀頭が役牌でない」のみで**両面待ち条件が無い**(簡易実装)。符導入後にこれを放置すると「嵌張待ち平和」という矛盾 (平和なのに待ち符+2) が生じる。待ち形列挙の仕組みが本機能で入るため、**平和に「両面待ち (= 和了牌が順子の両面位置)」条件を追加**する。03-tdd-policy の「仕様の問い直し」に当たる変更としてテストを書き直す。

### 0-4. 【判断3】連風牌の雀頭は +2 (4 ではなく)

雀頭符: 三元牌 (`isDragon`: 5z/6z/7z = Kiro/Cost Explorer/IAM) +2、自風 +2、場風 +2 — ただし**連風 (自風=場風、東1の親の 1z 等) でも +2 止まり**とする。+4 派ルールもあるが、現代の主流 (+2) を採用し、選択であることをコード内コメントと D-014 に記録。

### 0-5. 【判断4】配置場所: 新規 `src/fu.ts` (score.ts 同梱ではなく)

ロードマップは「`score.ts:calcFu()`」と書くが、**新規 `src/fu.ts` を推奨**:
- `calcFu` は `Decomposition` / `MeldLike` / `TileId` と `tiles.ts` のヘルパ (`isYaochu` 等) に依存する。`score.ts` は現在依存ゼロの葉モジュールで、純粋な「(han,fu)→点数」変換として保つ方が依存方向が綺麗 (`fu.ts` は winning/ 層と score 消費者の間に座る)
- D-006 (co-location) 的にも「符テーブル定数は fu.ts、点数式定数は score.ts」と分かれる
- `claims.ts` / `cpu.ts` と同じトップレベル平置きでディレクトリ構成とも整合
- ロードマップの記述は更新時に「fu.ts に分離した」と注記する

---

## 1. 型変更 (確定スニペット)

### `src/types.ts`

```ts
export interface WinInfo {
  // ... 既存フィールド ...
  totalHan: number;
  fu: number; // 符。役満 (isYakuman) では意味を持たず UI も非表示 (国士は 0)
  isYakuman: boolean;
  // ...
}
```

### `src/score.ts`

```ts
export interface ScoreInput {
  totalHan: number;
  fu: number;       // ← 追加
  isDealer: boolean;
  isTsumo: boolean;
}
```

`TABLE` / `Entry` / `pickEntry` は**全削除**し、`basePoints(han, fu)` + `ceil100` に置換。`ScorePayments` の判別共用体・`NUM_KO`・`YAKUMAN_HAN_THRESHOLD` は不変 (game.ts の `#applyPayments` は無修正で動く)。`basePoints` は **fu を見る前に han≥6 の段階を判定**する (国士の fu=0 を安全にする)。

### `src/fu.ts` (新規)

```ts
import type { Decomposition, MeldLike, SeatWind, TileId } from "./types";

export type WaitShape = "ryanmen" | "kanchan" | "penchan" | "tanki" | "shanpon";

export interface WinPlacement {
  waitShape: WaitShape;
  meldIndex: number | null; // 和了牌の入る decomp.melds の index。null = 雀頭 (単騎)
}

export const SEVEN_PAIRS_FU = 25;

/** 和了牌を置ける「門前部分の面子/雀頭」をすべて列挙する (高点法の候補集合) */
export function enumerateWinPlacements(
  decomp: Decomposition,
  calledMelds: MeldLike[],   // 元の kind (minkan/ankan/kakan) を保持した副露
  winningTileId: TileId,
): WinPlacement[];

export interface FuContext {
  isTsumo: boolean;
  isMenzen: boolean;
  isPinfu: boolean; // この (分解, 配置) で平和が成立しているか (ツモ符+2 の抑制に使う)
  seatWind: SeatWind;
  roundWind: SeatWind;
}

/** 1つの (分解, 和了牌配置) の符。10符単位切り上げ済みの値を返す */
export function calcFu(
  decomp: Decomposition,
  calledMelds: MeldLike[],
  winningTileId: TileId,
  placement: WinPlacement,
  ctx: FuContext,
): number;
```

### `src/yaku/judge.ts`

```ts
export interface JudgeContext {
  isTsumo: boolean;
  isMenzen: boolean;
  seatWind: SeatWind;
  roundWind: SeatWind;
  isRiichi?: boolean;           // ②で追加済み
  isIppatsu?: boolean;          // ②で追加済み
  winningTileId: TileId | null; // null = 適格性チェック専用パス (符を計算しない)
  melds: MeldLike[];            // 副露 (kan の元 kind を保持)
}

export interface JudgeResult {
  yakus: YakuResult[];
  totalHan: number;
  isYakuman: boolean;
  fu: number | null; // 七対子=25 / 標準形=計算値 / 国士・winningTileId null 時=null
}
```

`winningTileId: null` を許す理由: `cpu.ts` 経由のコンテキストは打牌判断時 (`isTsumo=false`) にツモ牌が無く、`canRon`/`canTsumoNow` は符を必要としない (和了可否ゲートは AWS 役の有無 + フリテンのみで符非依存 — §6 参照)。和了確定パス (`#tryWin`) だけが必ず牌を渡す。**「全呼び出しで必須」案は棄却** (game.ts L285 付近の CPU ctx 構築で嘘の牌を捏造することになるため)。

### `src/yaku/standard.ts`

```ts
export function judgeStandardYakus(
  decomp: Decomposition,
  ctx: YakuContext,
  waitShape: WaitShape | null = null, // null = 待ち形不問 (適格性パス互換)
): YakuResult[];
```

平和条件 (L26-28) に `(waitShape === null || waitShape === "ryanmen")` を追加。

---

## 2. アルゴリズム詳細

### 2-1. 門前部分と副露の分離 (multiset 減算)

`check.ts:canWin` は副露を `toDecompMeld` で射影して分解末尾にマージ済みのため、`Decomposition` 単体では「どれが副露か」「カンの元 kind」が分からない。`fu.ts` 内部ヘルパ `partitionMelds(decomp, calledMelds)`:

1. `calledMelds.map(toDecompMeld)` の正規キー (`kind + ソート済み tiles`) でカウントマップを作る
2. `decomp.melds` を走査し、キーが残っていれば「副露由来」として消費、残りが「門前面子」
3. 副露由来面子には元の `CalledMeldKind` を対応付けて返す

曖昧性の検討 (実装コメントに残す):
- **同一チー2組 (副露1+門前1)**: どちらを副露扱いにしても符0で同形 → 無害
- **ポン/カンと同牌の門前暗刻**: 牌4枚制約で不可能 (3+3=6枚 / 3+4=7枚)
- 順序依存 (`canWin` が副露を末尾に置く) には**依存しない**実装にする (将来の並び変更に頑健)

### 2-2. 和了牌配置の列挙 (`enumerateWinPlacements`)

和了牌は常に門前部分にある (ロン牌は `concealed` に合流済み、ツモ牌は手牌内)。**門前面子と雀頭のみ**を走査:

- **雀頭** の牌 = 和了牌 → `tanki` (+2)
- **門前刻子 (pon)** の牌 = 和了牌 → `shanpon` (待ち符 0。ただしロン時はその刻子が**明刻**扱いになる — §2-3)
- **門前順子 (chi)** `[n, n+1, n+2]` (decompose は昇順生成):
  - 和了牌 = `n+1` → `kanchan` (+2)。例: `5p7p` 持ちで `6p` 和了 → 567p の真ん中。**`1m3m` 持ちで `2m` 和了も嵌張** (123m の真ん中であり辺張ではない)
  - 和了牌 = `n` → 残り `n+1, n+2`。`n === 7` (= 残り 89) なら `penchan` (+2)、それ以外は `ryanmen` (0)。例: `8s9s` 持ち `7s` 和了 = 辺張 / `2m3m` 持ち `1m` 和了 = 両面
  - 和了牌 = `n+2` → 残り `n, n+1`。`n === 1` (= 残り 12) なら `penchan` (+2)、それ以外は `ryanmen` (0)。例: `1m2m` 持ち `3m` 和了 = 辺張 / `2m3m` 持ち `4m` 和了 = 両面
  - 両面が「2方向に待つ」ことは符に無関係 — **形だけ**を見る。`234m` を 4m で和了 → 残り 23 → 両面 0符
- 同一牌が複数箇所に置ける場合は**全配置を返す** (高点法は呼び出し側で max)

### 2-3. `calcFu` の符内訳

```
基礎             20
門前ロン        +10  (isMenzen && !isTsumo)
ツモ            +2   (isTsumo && !isPinfu)   ← 平和ツモは 20符
待ち            +2   (kanchan / penchan / tanki) / 0 (ryanmen / shanpon)
雀頭            +2   (三元牌 isDragon / 自風 / 場風。連風も +2 — 判断3)
面子 (中張/么九 は isYaochu で判定):
                明刻 2/4   暗刻 4/8   明槓・加槓 8/16   暗槓 16/32
  - 門前 pon: 通常は暗刻。ただし placement がその面子 && ロン → 明刻 (シャンポンのロン)
  - 副露: 元 kind で chi=0 / pon=明刻 / minkan・kakan=明槓 / ankan=暗槓
  - chi (門前・副露とも): 0
切り上げ: 10符単位 (例 32→40)
特例: 門前でなく && ロン && 合計がちょうど 20 → 30 (食い平和形。
      食い平和形ツモは 20+2=22→30 で自然に 30 になる)
```

七対子は `calcFu` を通さず定数 `SEVEN_PAIRS_FU = 25` (切り上げなし)。国士無双は役満のため符不問 (`fu: null`)。平和ロンは 20+10=30、平和ツモは 20 で公式定義と一致する (専用分岐は「ツモ符抑制」のみ)。

### 2-4. 高点法と judge.ts の選択ループ統合 (リファクタ手順)

現在の `judge.ts` L60-78 は「分解ごとに最大**飜**」のみ。これを「**(分解 × 配置) ごとに (han, fu) を評価し、han 降順 → fu 降順で最良**」に拡張する:

```ts
// 標準形 (擬似コード)
const awsYakus = detectAwsYakus(tileIds, winForm, { isMenzen: ctx.isMenzen }); // 分解非依存 → ループ外へ移動
let best = { yakus: [], han: -1, fu: -1 };
for (const decomp of winForm.decompositions) {
  const placements = ctx.winningTileId
    ? enumerateWinPlacements(decomp, ctx.melds, ctx.winningTileId)
    : [null];                                  // 適格性パス: 配置なしで従来通り
  for (const p of placements) {
    const stdYakus = judgeStandardYakus(decomp, standardCtx, p?.waitShape ?? null);
    const combined = [...stdYakus, ...awsYakus];
    const han = combined.reduce((s, y) => s + y.han, 0);
    const fu = p
      ? calcFu(decomp, ctx.melds, ctx.winningTileId!, p, {
          ...standardCtx, isPinfu: stdYakus.some((y) => y.id === "pinfu"),
        })
      : -1;
    if (han > best.han || (han === best.han && fu > best.fu)) best = { yakus: combined, han, fu };
  }
}
```

**(han, fu) 辞書式比較で十分な根拠** (コメントに残す): han 固定なら支払額は fu に単調非減少。han が1つ大きければ base は2倍になり fu 差 (高々数十符) で逆転しない。満貫キャップ帯での fu タイは支払額同値なのでどちらを選んでも正しい。配置が必ず1つ以上ある不変条件 (和了牌は門前部分に必ず存在) もコメント化。

七対子分岐は `return finalize(yakus, SEVEN_PAIRS_FU)`、国士は `finalize(yakus, null)`。`finalize(yakus, fu)` に符を通す形に変更。

### 2-5. 呼び出し側の配線

| 呼び出し元 | `winningTileId` | `melds` |
|---|---|---|
| `game.ts #tryWin` (現 L542) | ツモ: `this.#state.lastDrawTile!.id` / ロン: `opts.winTile.id` | `player.melds` |
| `game.ts #canTsumoNow` (現 L506) | `this.#state.lastDrawTile!.id` (isHumanDrawTurn ガード済み) | `player.melds` |
| `game.ts #runCpuTurn` の cpu ctx (現 L285 付近) | `this.#state.lastDrawTile?.id ?? null` | `player.melds` |
| `claims.ts canRon` (現 L51) | `input.tile.id` | `input.melds` |

`#tryWin` は `calcScore({ totalHan, fu: judged.fu ?? 0, ... })` とし、`winInfo.fu = judged.fu ?? 0` を格納 (null は国士のみ。`basePoints` が han≥13 を符より先に判定するので安全)。**監査**: CPU ツモが嶺上ツモ直後でも `lastDrawTile` が設定されることを `#drawRinshan` 実装で確認する。

---

## 3. 新点数式の before/after 比較表 (D-014 に転記)

30符の場合 (5飜以上は**全段階で不変**):

| ケース | 旧 (公式表) | 新 (標準式) | 変化 |
|---|---|---|---|
| 1飜 子ロン | 1000 | 1000 | — |
| 1飜 子ツモ | 500/500 (計1500) | **300/500 (計1100)** | ✗ |
| 1飜 親ロン | 1500 | 1500 | — |
| 1飜 親ツモ | 1000オール | **500オール** | ✗ |
| 2飜 子ロン | 2000 | 2000 | — |
| 2飜 子ツモ | 1000/1000 (計3000) | **500/1000 (計2000)** | ✗ |
| 2飜 親ロン | 3000 | **2900** | ✗ |
| 2飜 親ツモ | 1500オール | **1000オール** | ✗ |
| 3飜 子ロン | 3000 | **3900** | ✗ |
| 3飜 子ツモ | 1000/2000 (計4000) | 1000/2000 (計4000) | — |
| 3飜 親ロン | 5000 | **5800** | ✗ |
| 3飜 親ツモ | 2000オール | 2000オール | — |
| 4飜 子ロン | 5000 | **7700** | ✗ |
| 4飜 子ツモ | 1500/3000 (計6000) | **2000/3900 (計7900)** | ✗ |
| 4飜 親ロン | 8000 | **11600** | ✗ |
| 4飜 親ツモ | 3000オール | **3900オール** | ✗ |

加えて新規に符依存の変動が生まれる (平和ツモ20符、七対子25符、40符以上の手など)。4飜40符以上は cap で満貫に到達 (例 4飜40符子ロン = 8000)。

**`score.test.ts` で期待値が変わる既存テスト (明示的に書き換える2件)**:
- L23 「子・1飜・ツモ = 親500+子500×2」→ `fu:30` で **300/500 計1100**
- L60 「親・1飜・ツモ = 子3人から各1000」→ `fu:30` で **500オール 計1500**

他の既存7ケースは `fu: 30` を足すだけで期待値不変 (上表の通り)。

---

## 4. TDD 実装手順 (Red → Green → Refactor)

各フェーズで `npm test` を回し、フェーズ完了ごとにコミット。ベタ書き Green → 三角測量で一般化、を守る。

### Phase 0: ベースライン
`npm test` 全緑を確認。①②マージ後の `score.ts` / `judge.ts` / `WinInfo` / `game.test.ts` の現物を読み、本計画の行番号・前提 (`totalHan` にドラ込み等) を補正する。

### Phase 1: `score.ts` — (han, fu) 式へ置換

1. **Red**: `score.test.ts` に `fu` 付きケースを追加 (既存ケースには `fu: 30` を付与、上記2件は新期待値に書き換え):
   - `{han:2, fu:20, 子ツモ}` → **400/700 (計1500)** (平和ツモ相当)
   - `{han:3, fu:20, 子ツモ}` → 700/1300 (計2700)
   - `{han:2, fu:25, 子ロン}` → 1600 (七対子相当)
   - `{han:1, fu:40, 子ロン}` → 1300 (切り上げ検証: 1280→1300)
   - `{han:4, fu:40, 子ロン}` → 8000 (base 2560 → cap 2000 = 満貫)
   - `{han:3, fu:70, 子ロン}` → 8000 (base 2240 → cap)
   - `{han:4, fu:30, 親ロン}` → 11600 / `{han:2, fu:30, 親ロン}` → 2900 (100点単位の端数)
   - 段階境界: `{han:5}`→満貫 8000/12000、6→12000、8→16000、11→24000、`{han:13, fu:0}`→32000 (fu 無視の確認)
2. **Green**: `basePoints` + `ceil100` 実装、`TABLE`/`pickEntry` 削除。
3. **暫定配線**: `game.ts` の `calcScore` 呼び出しに `fu: 30` を仮で渡しコンパイルを通す (`// TODO Phase 5 で実符に置換`)。`game.test.ts` は相対 assert 中心 (totalScore 保存・winnerDelta=支払い合計) なので緑のはず — ①②で厳密金額 assert が増えていたらここで監査・追従。

### Phase 2: `src/fu.ts` 新規 (`fu.test.ts` テーブル駆動 20-30ケース)

**2a. `enumerateWinPlacements`** — Red→Green を小刻みに:
- 単騎: pair=99m, win 9m → `[{tanki, meldIndex:null}]`
- 両面: chi 678s, win 8s → ryanmen / chi 234m, win 4m → ryanmen (残り23)
- 嵌張: chi 567p, win 6p → kanchan / **chi 123m, win 2m → kanchan** (13持ち2和了)
- 辺張: chi 123m, win 3m → penchan (12持ち) / chi 789s, win 7s → penchan (89持ち)
- シャンポン: 門前 pon 222m, win 2m → shanpon
- 複数配置: melds `[123m][345m]...`, win 3m → penchan と ryanmen の2件
- 副露除外: called chi 234m があるとき win 3m はその面子に置けない

**2b. `calcFu`** — 期待符 (すべて手計算検証済み):

| # | ケース | 内訳 | 符 |
|---|---|---|---|
| 1 | 平和ツモ: `234m 567m 345p 678s 88p` ツモ 8s (両面) | 20 (ツモ+2なし) | **20** |
| 2 | 同ロン | 20+10 | **30** |
| 3 | 単騎+么九暗刻: `111m 234p 567s 678s 99m` ロン 9m 門前 | 20+10+8+2 | **40** |
| 4 | 同ツモ | 20+2+8+2 = 32 | **40** |
| 5 | 么九暗槓: melds=[ankan 1z], `234m 567p 345s 88s` ロン 4s (嵌張・暗槓のみ=門前) | 20+10+32+2 = 64 | **70** |
| 6 | シャンポンロン=明刻: `222m 345p 567p 678s 99s` ロン 2m 門前 | 20+10+2 = 32 | **40** |
| 7 | 同ツモ=暗刻 | 20+2+4 = 26 | **30** |
| 8 | 食い平和形ロン: melds=[chi 234m], `567m 345p 678s 88p` ロン 8s | 20 → 特例 | **30** |
| 9 | 同ツモ (22→30 の切り上げ検証) | 20+2 = 22 | **30** |
| 10 | 役牌雀頭: 雀頭 5z (Kiro) | +2 が乗る | — |
| 11 | 連風雀頭: seat=round=1z, 雀頭 1z | +2 (4でない) | — |
| 12 | 明槓么九: melds=[minkan 9s] → +16 / 加槓 kakan → 明槓扱い +16 | | — |

`SEVEN_PAIRS_FU === 25` の定数テストも追加。

### Phase 3: `standard.ts` — 平和の両面待ち条件

1. **Red** (`standard.test.ts`): 全順子+非役牌雀頭でも `waitShape: "kanchan"` なら平和なし / `"ryanmen"` なら平和あり / `null` (省略) なら従来通り成立 (適格性パス互換)。
2. **Green**: 第3引数追加と条件1行。既存平和テストは第3引数なし (null) で緑のまま。

### Phase 4: `judge.ts` — (han, fu) 最大選択

1. **Red** (`judge.test.ts`): `baseCtx` に `winningTileId: null, melds: []` を追加 (既存12箇所は null で挙動不変のまま緑)。新規:
   - kiro 手 `555z234m567m234p55s` ツモ・`winningTileId:"5s"` → `result.fu === 40` (20+暗刻5z么九8+単騎2+ツモ2=32→40)
   - 七対子手 → `fu === 25` / 国士 → `fu === null`
   - **配置の高点法**: `1m2m3m3m4m5m 666p 777s 8s8s` ツモ 3m → fu **40** (辺張+2 採用: 20+2+4+4+2=32→40。両面解釈は 30)
   - **暗刻優先の高点法**: `111m123m 555p 678s 99s` ロン 1m 門前 → fu **50** (1m を順子側に置き 111m を暗刻 8 で残す: 20+10+8+4=42→50。明刻解釈は 40)
   - **(han, fu) 順序**: `111222333m 456m 77m` ツモ 4m → 平和+門前ツモの順子分解 (han 2, fu 20) が暗刻分解 (han 1, fu 40) に**飜優先で**勝つ → `yakus` に pinfu、`fu === 20`
2. **Green**: §2-4 のループ実装、`detectAwsYakus` のループ外移動、`finalize` の fu 対応。

### Phase 5: `game.ts` / `claims.ts` / `cpu.ts` 配線 + `WinInfo.fu`

1. **Red** (`game.test.ts`): 仕込み壁 `east: "555z234m567m234p55s"` の親ツモ (既存テスト) に追加 assert: `winInfo.fu === 40`、`koDeltas` が `calcScore({totalHan: winInfo.totalHan, fu: 40, isDealer: true, isTsumo: true})` と一致 (AWS 役の偽陽性で totalHan が揺れるため han は固定値にしない)。
2. **Green**: §2-5 の4箇所配線、`fu: 30` 仮値撤去、`WinInfo.fu` 格納。
3. **監査**: `game.test.ts` / `claims.test.ts` / `cpu.test.ts` 全緑確認。①②で追加されたリーチ/ドラの統合テストに厳密金額があれば新式で再計算して更新 (コミットメッセージに旧→新を記録)。**ロン適格性への影響なし**を確認: `canRon` のゲートは `canDeclareWin` (AWS役有無) + フリテンのみで、符はゲートに一切関与しない (このことを canRon の doc コメントに1行追記)。

### Phase 6: UI (`src/ui/render.ts` winPanel、自動テストなし — 03-tdd-policy 通り)

現 L344 を変更:

```ts
<span>合計 ${info.isYakuman ? "" : `${info.fu}符 `}${info.totalHan}飜${info.isYakuman ? " (役満)" : ""}</span>
```

### Phase 7: ドキュメント + 最終検証 (§5, §6)

---

## 5. ドキュメント更新

1. **`docs/plans/04-design-decisions.md` — D-014 追加** (①②が D-012/D-013 を取っている前提。番号が違えば繰り上げ):
   - **What**: 符計算 (`fu.ts:calcFu`) + 標準式 `fu×2^(2+han)` への移行。公式 rule.html の飜表から**4飜以下で意図的に逸脱** (§3 の before/after 表を転記)。連風雀頭+2 / 食い平和30符 / 平和に両面待ち条件追加 / 国士は fu=null
   - **Why**: ロードマップの明示要求。飜表と符は構造的に両立しない。満貫以上は完全一致するため逸脱は低翻域に限定される。rule.html 役満親ツモ 18000 の誤記も併記
   - **Consequences**: 低翻域の点数が変わる (人間がブラウザ確認済みであることを追記)、`TABLE` 削除、適格性パス (`winningTileId: null`) では平和が待ち形不問になる軽微な飜数不整合 (ゲートに影響なし)
2. **`docs/plans/05-future-roadmap.md`**: 「符30固定 → calcFu」を ✅ 実装済みに (「score.ts ではなく fu.ts に分離 (D-006)」と注記)。既知の妥協点の表から「符30固定」行を削除し、代わりに「低翻域の点数が公式 rule.html 表と乖離 (D-014)」を追加。
3. **`docs/plans/README.md`**: 30秒オーバービューに符計算を追記、テスト数を更新 (03-tdd-policy.md の「190テスト」も更新)。
4. **`docs/plans/todos.md`**: 残課題があれば追記 (例: 適格性パスの平和待ち形不問)。

---

## 6. 検証

1. `npm test` — 全緑 (新規 ~35-40 ケース込み)
2. `npm run build` — 型エラーなし
3. **人間によるブラウザ確認チェックリスト** (`npm run dev`、Claude はリスト提示まで — CLAUDE.md 規約):
   - [ ] 和了パネルに「40符 N飜」形式で表示される (kiro 暗刻ツモ等)
   - [ ] 平和形ツモで「20符」、七対子 (dr-architecture) で「25符」
   - [ ] 国士無双で符が**非表示** (「N飜 (役満)」のみ)
   - [ ] 親1飜30符ツモが 500オール (計1500) になる — **D-014 逸脱の最重要確認ポイント**
   - [ ] 4飜30符子ロンが 7700 になる
   - [ ] 支払い内訳合計と獲得点が一致、局をまたいで合計 100000 点保存
   - [ ] リーチ棒・ドラ表示 (①②の機能) と符表示が共存して崩れない
   - [ ] 点数表逸脱 (§3) を人間が了承する
