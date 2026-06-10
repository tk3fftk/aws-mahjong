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

### 局送り (東2-4)

- 現状: 東1局のみ
- 追加内容:
  - `GameController.startNextRound()` で `roundIndex` を進め、親交代 (東2は south が親)
  - 東4 (北家親) 終了で終局
  - AWS麻雀の「親の連荘なし」ルールに従い、親があがっても次局で交代
- 影響範囲: `game.ts`, `ui/render.ts` (局表示)

---

## 中期 (1-2週)

### リーチ

- `Player.isRiichi: boolean` 追加、リーチ宣言時 1000点棒を場に出すUI
- 一発・裏ドラの実装
- 役満特例の対象に「ダブル立直」(2飜役) が含まれていない点に注意
- 影響: `Player`, `game.ts`, `yaku/standard.ts`, `ui/`

### ドラ表示牌

- デッドウォール (王牌14枚) を `wall.ts` で分離
- 表示牌スロットを `ui/render.ts` に追加
- ドラ計算: 表示牌の次の牌が1飜分のドラ。複数ドラ対応
- 影響: `wall.ts`, `yaku/judge.ts`, `ui/`

### 符30固定 → calcFu

- 現状: 30符固定 (rule.html の点数表が han ベースなので)
- 追加内容: `score.ts:calcFu()` を実装。雀頭・面子・待ち形から符を計算
- 影響: `score.ts` (新規関数), 点数テーブルの han→{han, fu} 拡張

---

## 長期 (要設計)

### ~~4人化~~ ✅ 実装済み (2026-06)

- CPU 3人 (南・西・北)、`calcScore` の per-payer 内訳化、4人精算を実装。設計は [D-009](./04-design-decisions.md#d-009-4人化--鳴きロンの実装方針)
- 残: 場風の循環と局送りの組合せ (親は east 固定のまま)

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
| 符30固定 | 雀頭・待ち形による符変動が反映されない | `calcFu` 実装 (中期) |
| 役は yaku.json の sampleMpszList 解釈 | 上流の表現意図と完全一致を保証していない | yaku.json をフォークし `pattern` フィールドを正式追加 |
| CPU の打牌は完全ランダム | ほとんど流局になる | シャンテン数計算で AI 強化 (長期) |
| 槍槓・同巡フリテン・ダブロン無し | 厳密な競技ルールと差異 | 必要になったら claim 解決に追加 |
| 親が east 固定 | 局送り・親交代が無い | 局送り実装時に対応 |
| `aws-all-green` の一部 sample が 6s×5 要求 | その sample 経由では永遠に不成立 (他 sample では成立可) | 上流 yaku.json の修正提案 or フォーク |
