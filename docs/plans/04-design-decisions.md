# 04. 設計判断ログ (ADR-lite)

主要な設計選択を「**何を決めたか / なぜそうしたか / その結果どうなったか**」の3点で記録する。各 ID は安定しているので、他文書からは `[D-005](./04-design-decisions.md#d-005-iscombineallowedfalse-は標準対応役との非複合のみ)` のように参照可能。

---

## D-001: 二人麻雀化は4人配牌のまま西/北を捨てる

- **What**: `dealInitialHands()` は標準麻雀の手順 (4-4-4-1) で 4人分配り、西家・北家分はそのまま破棄する
- **Why**: 標準麻雀のターン感覚 (山残量、配牌枚数、ツモ・打牌の流れ) をそのまま使え、進行コードを単純化できる。「2人だけに配る」と山残量が極端に多くなりプレイ感が変わる
- **Consequences**:
  - 山残り 83枚 (= 136 − 52 [4人配牌] − 1 [親初ツモ])
  - 将来 4人化への移行コストが低い。`Player` を 2席から 4席に増やすだけで済む
  - 配牌を 2人分だけにする案は採用していない

---

## D-002: MVP は ツモ和了のみ・鳴き/リーチ/ドラ無し

- **What**: 初期実装ではツモ和了だけを実装。ロン、鳴き(ポン・チー・カン)、リーチ、ドラ、フリテンは対象外
- **Why**: フィードバックループを締め、「まず動くもの」を最短で作る。麻雀ゲームの完全実装は膨大なので、必須のコア (山・配牌・ツモ・打牌・役判定・点数・和了) に絞る
- **Consequences**:
  - 拡張ポイントは [05-future-roadmap.md](./05-future-roadmap.md) に整理
  - ロンを後付けする場合、`game.ts` の打牌イベントに「相手の `canWin` チェック → 和了ボタン表示」を追加。フリテン判定も必要に
  - 鳴き対応には `Player.melds` の `hand` からの分離、yaku.json の `isPonAllowed`/`isChiAllowed` と `hanOpen` の参照が必要

---

## D-003: yaku.json はリポ内コピー (リモート fetch しない)

- **What**: 公式の `yaku.json` を `src/data/yaku.json` に同梱。実行時にネットワーク取得しない
- **Why**: オフライン動作 + ビルド時バンドル (tsconfig の `resolveJsonModule: true`) + 確定的なテスト。リモート fetch にすると `fetch` モックなどテストが面倒になる
- **Consequences**:
  - 上流更新時は `npm run fetch:yaku` で再取得 → 差分を確認してコミット
  - JSON のスキーマ変更があれば `aws-pattern.ts:YakuJsonEntry` の型を合わせる必要

---

## D-004: 牌SVG はローカル同梱 + sed で視認性調整

- **What**: 34枚の牌SVG を `public/assets/tiles/` に同梱。`scripts/fetch-tiles.sh` 内で `sed` を使い、font-size 8→14, 色 #666666→#1f2937, text-anchor末尾に `font-weight="bold"` を一括書き換え
- **Why**: オフライン動作 + 公式リポジトリの SVG が小さく薄かったため (コミット `dccea16` で実施)
- **Consequences**:
  - upstream 差分を見たい / sed を外したい場合は、`scripts/fetch-tiles.sh` の sed セクションをコメントアウトして再取得
  - 上流 SVG が変わった場合、sed の置換パターンが当たらなくなる可能性 (font-size="8" 等の固定文字列に依存)

---

## D-005: `isCombineAllowed=false` は標準対応役との非複合のみ

- **What**: yaku.json の `isCombineAllowed: false` を「**標準麻雀の対応役** との非複合」と解釈する。AWS固有役どうしは加算可
- **Why**: yaku.json の description が明示しているのは「通常の役牌・白と...」等、標準対応役との関係のみ。AWS固有役どうしの非複合は書かれていない。strict排他で実装すると、`tile-superset` の偽陽性と相まって正当な役 (`master-replica` 等) が常に他役に上書きされて死ぬ
- **Consequences**:
  - AWS役同士は重ねて加算される (例: Kiro + Cost Explorer 同時成立で 2飜)
  - `tile-superset` の偽陽性が飜の過大評価につながる可能性。将来 `tile-superset` を厳密化すれば収まる
  - 詳細経緯は [02-aws-yaku-judgment.md](./02-aws-yaku-judgment.md#iscombineallowedfalse-の解釈-重要) 参照

---

## D-006: マジックナンバーは co-location で定数化

- **What**: 単一の `constants.ts` god-module を作らず、定数は使う側のモジュールに同梱
- **Why**: 「`constants.ts` から import」より「**手元のモジュール内で定義 + 必要なら export**」のほうが、定数の意味と使用箇所の距離が近く、後から読み手が辿りやすい
- **Consequences**:
  - 複数モジュールで使う定数 (`TILE_KIND_COUNT`, `YAKUMAN_HAN_THRESHOLD` 等) は「最も自然な親モジュール」から export し、他モジュールが import する
  - 単一モジュール内のローカル定数 (`MELDS_PER_HAND` 等) は export しない
  - `tiles.ts` には牌・index関連、`winning/decompose.ts` には分解関連、`score.ts` には点数関連、と分散
  - リファクタコミット: `58bf342 refactor: マジックナンバーを名前付き定数に置換`

---

## D-007: `docs/app/` を git untrack

- **What**: vite build の出力先 `docs/app/` を `.gitignore` に追加し、tracked から外す (コミット `c8c99bd`)
- **Why**: ビルド派生物 (毎ビルドでハッシュ付き名前が変わる JS/CSS) は履歴を汚す。CI で build → deploy する想定に切替
- **Consequences**:
  - 手元ビルドは tracked から外れる
  - GitHub Pages にデプロイする際は CI 側で `npm run build` を走らせて成果物を別ブランチ (例: gh-pages) に push する流れに移行が必要 (CI は未設定、`05-future-roadmap.md` 参照)

---

## D-008: 役一覧オーバーレイは `yaku-help.ts` に隔離

- **What**: 「?」ボタンで開く AWS役一覧 UI を `src/ui/yaku-help.ts` に分離 (コミット `ac35c91`)
- **Why**:
  - `render()` は `#app.innerHTML = ...` で全置換するので、UI 要素を `#app` 内に置くと再描画で消える。`document.body` 直下にマウントすることでこの問題を回避
  - 役一覧 HTML は yaku.json の文字列を含むため HTML エスケープが必須 (XSS対策)。これを 1ファイルに閉じ込めるとレビューしやすい
- **Consequences**:
  - `aws-pattern.ts` から `YAKU_LIST` と `YakuJsonEntry` 型を export 化 (UI 側からの再利用)
  - 役一覧 HTML はモジュール初期化時に 1回生成 (`ITEMS_HTML` 定数)。再生成しない
  - アクセシビリティ: `role="dialog"`, `aria-modal`, ESC キーで閉じる, 前フォーカス復帰

---

## D-009: 4人化 + 鳴き/ロンの実装方針

- **What**: 4人対戦・鳴き (ポン/チー/カン)・ロン・基本フリテンを実装 (2026-06)。主な設計選択:
  1. **反復ループ**: `game.ts` の相互再帰 (`#advanceTurn` ⇄ `#runCpuTurn`) を `#loop()` ドライバに全面置換。「`phase=discard` かつ turn が CPU」の間だけ1手進め、人間入力/claim/終局で停止する。CPU 3連続手番でもスタックが深くならず、claim 割り込みが書ける
  2. **claim フェーズ**: 打牌ごとに `claims.ts:computeEligibility` で他3席の適格性を計算。CPU は `cpu.ts:decideClaim` で即決し、人間に選択肢があり CPU に先取りされない場合のみ `phase="claim"` で停止
  3. **優先度と頭ハネ**: ロン > カン=ポン > チー。複数ロンは頭ハネ (打牌者からツモ順で近い1人のみ)。ダブロンは無い
  4. **`hanOpen=null` は門前限定**: yaku.json の規約。`aws-pattern.ts` は `!isMenzen && hanOpen===null` で不成立にする (従来の `hanOpen ?? han` フォールバックは鳴き導入でバグ化するため修正)。`isPonAllowed`/`isChiAllowed` は記述的フラグとして実装上は参照しない (D-005 の最小解釈と同じ方針)
  5. **カンは判定上3枚扱い**: `winning/melds.ts:toDecompMeld` が kan を pon(3枚) に射影し「実効手牌=14枚相当」の不変条件を維持。yaku.json に同一牌4枚を要求する sample が無いことを検証済み (例外: `aws-all-green` の 6s×5 要求 sample は既存の到達不能サンプル)
  6. **王牌**: 配牌後の山の末尾14枚を `deadWall` として固定予約 (ドラ未実装)。リンシャンツモはライブ壁の末尾 (`drawFromWallEnd`) から取り、カン1回ごとにツモ可能数が1減る
  7. **フリテン履歴**: `Player.discardedIds` (append-only)。鳴かれた牌は河 (`discards`) から消えるが履歴には残る
- **Why**: 公式ルール (rule.html) が「ポン・チー・カンあり」「ロン・ツモ両方」を定めるため。設計詳細の why は各項に併記
- **Consequences**:
  - **スコープ外**: 槍槓 (加槓へのロン)、同巡フリテン、ダブロン、局送り/親交代、リーチ、ドラ、ノーテン罰符 → [05-future-roadmap.md](./05-future-roadmap.md)
  - CPU の鳴きは軽いヒューリスティック (ロン即取り / AWS役牌のみポン / チーしない / 4枚揃いで暗槓)
  - テスト用シームとして `GameControllerOptions.wallFactory` (仕込み壁) と `rng` (CPU打牌固定) を追加
