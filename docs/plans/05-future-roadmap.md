# 05. 将来のロードマップ

「次のフェーズで作る大きな機能」と「既知の妥協点」を整理する。小さなコメント追加・命名改善などは [todos.md](./todos.md) へ。

---

## 短期 (1-2セッション)

### ロン和了

- 現状: ツモ和了のみ。MVP の単純化のため除外
- 追加内容:
  - `game.ts` の打牌イベント後に、相手手牌 + 打牌牌で `canWin()` を試行
  - 和了可能なら UI に「ロン」ボタンを点滅表示
  - フリテン (自分の捨て牌に和了牌が含まれていたらロン不可) の判定追加
- 影響範囲: `game.ts` (進行制御), `ui/render.ts` (ボタン), 新規モジュール `winning/furiten.ts` (任意)

### 鳴き (ポン・チー・カン)

- 現状: なし
- 追加内容:
  - `Player.melds: Meld[]` を `hand` から分離 (晒した面子を保持)
  - 打牌イベントを broadcast し、相手から `isPonAllowed`/`isChiAllowed` の役で鳴き可否を判定
  - 鳴き宣言時 `isMenzen = false` に遷移し、yaku.json の `hanOpen` を使うように
- 影響範囲: `types.ts` (Player拡張), `game.ts` (鳴きフェーズ追加), `yaku/judge.ts` (isMenzen=false 時のhan選択), `ui/render.ts` (鳴きボタン)

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

### 4人化

- CPU を 3人に拡張 (現状は 1人)
- `calcScore` の支払者数を引数化、点数移動を 1→3 方向に拡張
- `dealInitialHands` は既に4人配牌なので、`Player` の席数だけ増やせばよい (これが D-001 の利点)
- 場風の循環 (東家→南家→西家→北家) と局送りの組合せ

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
| ロン無し | 守備の戦略性が下がる | 短期で追加 |
| 役は yaku.json の sampleMpszList 解釈 | 上流の表現意図と完全一致を保証していない | yaku.json をフォークし `pattern` フィールドを正式追加 |
| CPU は完全ランダム | ほとんど流局になる | シャンテン数計算で AI 強化 (長期) |
| 親ツモ点数は 1人徴収 | 4人麻雀の通常ルールとは異なる | 4人化時に `calcScore` を引数化 |
