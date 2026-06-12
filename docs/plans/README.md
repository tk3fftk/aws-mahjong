# docs/plans/ — 設計・実装方針

このディレクトリは **「なぜ今のコードはこうなっているか」** を保存するための内部ドキュメント集。コードを読めば分かる「**何が書いてあるか**」ではなく、コミットメッセージや会話ログに埋もれがちな「**why**」と「**注意点**」を中心に整理してある。

## 30秒オーバービュー

- 4人対戦 (人間 vs CPU×3)・ツモ/ロン両対応・鳴き (ポン/チー/カン) あり・ドラ (カンドラ対応)・リーチ (一発・裏ドラ・供託・自動ツモ切り)・符計算 (待ち形・高点法、点数は標準式 `fu×2^(2+han)`)・東風戦 (東1-4) 完走、親と家は局ごとに回る
- CPU の打牌はランダム、鳴きは軽いヒューリスティック (ロン即取り / AWS役牌ポン / 4枚揃いで暗槓 / テンパイで自動リーチ)
- 手牌はドラッグで自由並び替え・2クリック捨て牌 (役判定は counts ベースで順序非依存)
- Vite + TypeScript + 素のDOM (React 不使用)
- TDD で 344件のテストが緑 (2026-06 時点)
- AWS麻雀ならではの独自要素 (Kiro/Cost Explorer/IAM の役牌、22個の AWS固有役、AWS役必須ルール) を反映
- 牌画像SVG・役データ (yaku.json) はリポ同梱でオフライン動作

## 設計の3本柱

1. **Imperative Shell / Functional Core**: 状態を持つのは `GameController` (`src/game.ts`) のみ。`winning/`, `yaku/`, `score`, `cpu`, `tiles`, `wall` はすべて純関数で組み立てる。テストが小さく書ける副次効果が大きい
2. **TDDで仕様を駆動**: テストの赤は実装バグだけでなく**仕様の問い直しサイン**でもある (例: `isCombineAllowed` の解釈見直し)
3. **co-location**: 定数・型は使う側に近い場所に置く。`constants.ts` のような god-module は作らない

## 各文書

- **[01-architecture.md](./01-architecture.md)** — 全体の絵 / モジュール責務 / 依存方向ルール / WinForm の Discriminated Union
- **[02-aws-yaku-judgment.md](./02-aws-yaku-judgment.md)** — AWS役必須ゲート / 5z刻子の重複防止 / B-hybrid 4分類 / isCombineAllowed の解釈
- **[03-tdd-policy.md](./03-tdd-policy.md)** — Red-Green-Refactor / 三角測量 / 「赤」を仕様の問い直しに使う実例
- **[04-design-decisions.md](./04-design-decisions.md)** — 主要な設計判断 (D-001 〜 D-014) の ADR-lite
- **[05-future-roadmap.md](./05-future-roadmap.md)** — 鳴き / リーチ / ドラ / 4人化 等の拡張ポイントと既知の妥協点
- **[todos.md](./todos.md)** — 本ドキュメント執筆中に発見した「コードに追加すべきコメント・小リファクタ」候補

### 実装計画書 (①②③ すべて実装済み。確定版は D-012 / D-013 / D-014 参照)

- **[feature-dora.md](./feature-dora.md)** — ① ドラ表示牌 (カンドラ / 王牌レイアウト / 裏ドラスロット予約)
- **[feature-riichi.md](./feature-riichi.md)** — ② リーチ (一発 / 裏ドラ / 自動ツモ切り / 供託 / CPUリーチ)
- **[feature-calc-fu.md](./feature-calc-fu.md)** — ③ 符計算 (calcFu / 待ち形列挙 / 高点法 / 標準点数式への移行)

## コード上の一次情報 (常にこれが正)

- 型定義: `src/types.ts`
- 役データ: `src/data/yaku.json` (上流: https://mu7889yoon.github.io/aws-mahjong/assets/v2.0.1/yaku.json)
- 公式ルール: `docs/v2.0.1/rule.html` (Hugo 出力)
- 公式牌一覧: `docs/v2.0.1/tile.html`
- 公式役一覧: `docs/v2.0.1/yaku.html`

ドキュメントと src/ が矛盾した場合は **src/ を正**として、本ドキュメントを修正する。

## ドキュメントの保守ルール

- 内容を更新する際は、`src/` の実物を確認してから書く (誤情報の防止)
- 大きなコードブロックは置かない (path:symbol 参照に留める)
- `todos.md` の項目を消化した際は、そのチェックを入れて該当コミットへのリンクを残す
