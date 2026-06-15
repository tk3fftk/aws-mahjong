# 05. 将来のロードマップ

「次のフェーズで作る大きな機能」と「既知の妥協点」を整理する。小さなコメント追加・命名改善などは [todos.md](./todos.md) へ。

---

## 短期 (1-2セッション)

### ~~ロン和了~~ ✅ 実装済み (2026-06)

- claim フェーズ + 基本フリテン (`winning/furiten.ts`) として実装。設計は [D-009](./04-design-decisions.md#d-009-4人化--鳴きロンの実装方針)
- 残: 同巡フリテン、槍槓 (加槓へのロン)、ダブロン (現状は頭ハネ)

### ~~鳴き (ポン・チー・カン)~~ ✅ 実装済み (2026-06)

- `Player.melds: CalledMeld[]`、claim フェーズ、`hanOpen` 食い下がり、王牌+リンシャンとして実装。設計は [D-009](./04-design-decisions.md#d-009-4人化--鳴きロンの実装方針)
- 残: CPU の鳴き判断の高度化 (現状はロン即取り / AWS役牌ポン / チーしない)

### ~~局送り (東2-4)~~ ✅ 実装済み (2026-06)

- `startNextRound()` で親交代 (連荘なし)・自風の回転・東4終了で終局 (`round_end` + 最終順位)。設計は [D-011](./04-design-decisions.md#d-011-局送りは物理席固定親と風が回る)
- 残: 南入 (半荘戦)、ノーテン罰符

---

## 中期 (1-2週)

### ~~リーチ~~ ✅ 実装済み (2026-06)

- リーチ役 (1飜)・一発 (1飜)・裏ドラ・手牌ロック (自動ツモ切り)・供託1000点・CPU リーチを実装。純粋層は `src/riichi.ts` (`riichiDiscardIndices`)、状態は `Player.isRiichi`/`isIppatsu`/`riichiWaits`/`permanentFuriten`/`riichiDiscardIndex` と `GameState.riichiPot`/`riichiCandidates`。設計判断は [D-013](./04-design-decisions.md#d-013-リーチ-一発--裏ドラ--自動ツモ切り--供託--cpuリーチ)
- リーチ・一発は標準役なので AWS役必須ゲートを満たさない (リーチのみでは和了不可) — 仕様としてテストで固定
- **残課題**:
  - **ダブル立直** (配牌リーチ): 未実装。役満特例の対象に「ダブル立直」(2飜役) が含まれていない点も保留 (将来の役満特例見直しと同時に)
  - **リーチ後のカン**: 暗槓含め全面禁止 (待ち変化判定・ドラめくりの複雑さ回避)。将来、送りカン禁止判定を入れて解禁し得る
  - **同巡フリテン**: スコープ外 (永久フリテン `permanentFuriten` のみ実装)
  - **終局時の残置供託**: 東4終了時に場に残った供託は誰にも渡らず消滅 (最終順位は score のみ。最簡で十分)

### ~~ドラ表示牌~~ ✅ 実装済み (2026-06)

- `src/dora.ts` (純関数 `nextTile`/`countDoraHan`/`doraIndicators`)、`GameState.doraIndicatorCount`、カンドラ即公開、和了時のドラ加算 (ゲート後・役満非加算)、UI のドラ行 (5スロット固定・未公開は裏向き) を実装。設計判断は [D-012](./04-design-decisions.md#d-012-ドラ表示牌-カンドラ-王牌レイアウト)
- 裏ドラはリーチ実装 ([D-013](./04-design-decisions.md#d-013-リーチ-一発--裏ドラ--自動ツモ切り--供託--cpuリーチ)) で公開済み (スロット `deadWall[5..9]` / アクセサ `uraDoraIndicators`)

### ~~符30固定 → calcFu~~ ✅ 実装済み (2026-06)

- `calcFu` は `score.ts` ではなく**新規 `src/fu.ts` に分離** (score.ts を依存ゼロの葉モジュールに保つ。D-006)。`enumerateWinPlacements` (待ち形列挙) + `calcFu` + 七対子固定25符
- 点数は han ベースの `TABLE` を廃止し標準式 `fu × 2^(2+han)` + 満貫キャップへ移行。**公式 rule.html の表から4飜以下で意図的に逸脱** (比較表と理由は [D-014](./04-design-decisions.md#d-014-符計算-calcfu--標準点数式への移行))
- 高点法は `judge.ts` の (分解×配置) ループで (han, fu) 辞書式最大。平和に両面待ち条件を追加

---

## 長期 (要設計)

### ~~4人化~~ ✅ 実装済み (2026-06)

- CPU 3人 (南・西・北)、`calcScore` の per-payer 内訳化、4人精算を実装。設計は [D-009](./04-design-decisions.md#d-009-4人化--鳴きロンの実装方針)
- 親交代・自風の回転は局送り ([D-011](./04-design-decisions.md#d-011-局送りは物理席固定親と風が回る)) で実装済み

### CPU AI 強化

- 現状: 完全ランダム打牌 (和了可能なら宣言する程度)
- 追加内容:
  - シャンテン数計算 (テンパイまで何牌)
  - AWS役を狙う優先順位付き打牌 (例: 6z 暗刻が見えたら cost-explorer を狙う)
  - 危険牌の回避 (相手のリーチ後)
- 影響: `cpu.ts` 全面書き換え

### tile-superset 判定の精密化

- 現状: 「サンプル牌が手にすべて含まれているか」のゆるい判定 → 1手で 4-5役が同時マッチする偽陽性
- 追加内容: 「完成した面子の中に出現する」など、より厳密な条件
- 影響: `yaku/aws-pattern.ts:matchesCountSuperset` の分岐 / 個別判定関数化
- 関連: [04-design-decisions.md#d-005](./04-design-decisions.md#d-005-iscombineallowedfalse-は標準対応役との非複合のみ)

### GitHub Actions CI

- 現状: CI なし。手動で `npm test && npm run build` を回す
- 追加内容:
  - PR トリガで `npm test`
  - main へのマージで build → `docs/app/` 内容を gh-pages ブランチへ push
- 関連: [04-design-decisions.md#d-007](./04-design-decisions.md#d-007-docsapp-を-git-untrack)

---

## 既知の妥協点

| 妥協 | 影響 | 対応案 |
|---|---|---|
| `tile-superset` の偽陽性 | 1手で AWS固有役が複数ヒットし、飜が過大になる可能性 | 個別判定関数化 (長期) |
| 低翻域 (4飜以下) の点数が公式 rule.html 表と乖離 | 標準式 `fu×2^(2+han)` 採用の意図的逸脱 ([D-014](./04-design-decisions.md#d-014-符計算-calcfu--標準点数式への移行)) | 仕様として承認済み (戻すなら fu を表示専用に格下げ) |
| 役は yaku.json の sampleMpszList 解釈 | 上流の表現意図と完全一致を保証していない | yaku.json をフォークし `pattern` フィールドを正式追加 |
| CPU の打牌は完全ランダム | ほとんど流局になる | シャンテン数計算で AI 強化 (長期) |
| 槍槓・同巡フリテン・ダブロン無し | 厳密な競技ルールと差異 | 必要になったら claim 解決に追加 |
| `aws-all-green` の一部 sample が 6s×5 要求 | その sample 経由では永遠に不成立 (他 sample では成立可) | 上流 yaku.json の修正提案 or フォーク |
