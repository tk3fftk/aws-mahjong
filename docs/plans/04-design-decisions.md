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
