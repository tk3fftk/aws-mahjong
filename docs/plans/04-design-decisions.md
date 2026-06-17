# 04. 設計判断ログ (ADR-lite)

主要な設計選択を「**何を決めたか / なぜそうしたか / その結果どうなったか**」の3点で記録する。各 ID は安定しているので、他文書からは `[D-005](./04-design-decisions.md#d-005-iscombineallowedfalse-は標準対応役との非複合のみ)` のように参照可能。

---

## D-001: 二人麻雀化は4人配牌のまま西/北を捨てる

> **→ 2026-06 に [D-009](#d-009-4人化--鳴きロンの実装方針) で4人化が実現し、西/北の破棄は廃止 (歴史的記録として保持)。「4人配牌のまま」にしておいた判断が移行コストを下げた**

- **What**: `dealInitialHands()` は標準麻雀の手順 (4-4-4-1) で 4人分配り、西家・北家分はそのまま破棄する
- **Why**: 標準麻雀のターン感覚 (山残量、配牌枚数、ツモ・打牌の流れ) をそのまま使え、進行コードを単純化できる。「2人だけに配る」と山残量が極端に多くなりプレイ感が変わる
- **Consequences**:
  - 山残り 83枚 (= 136 − 52 [4人配牌] − 1 [親初ツモ])
  - 将来 4人化への移行コストが低い。`Player` を 2席から 4席に増やすだけで済む
  - 配牌を 2人分だけにする案は採用していない

---

## D-002: MVP は ツモ和了のみ・鳴き/リーチ/ドラ無し

> **→ 2026-06 に [D-009](#d-009-4人化--鳴きロンの実装方針) でロン・鳴き・基本フリテンを実装済み (歴史的記録として保持)。リーチ・ドラは引き続き未実装 ([05-future-roadmap.md](./05-future-roadmap.md))**

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
  6. **王牌**: 配牌後の山の末尾14枚を `deadWall` として固定予約 (ドラ未実装)。リンシャンツモはライブ壁の末尾 (`drawFromWallEnd`) から取り、カン1回ごとにツモ可能数が1減る → ドラ実装後の王牌レイアウトとリンシャンの扱いは [D-012](#d-012-ドラ表示牌-カンドラ-王牌レイアウト)
  7. **フリテン履歴**: `Player.discardedIds` (append-only)。鳴かれた牌は河 (`discards`) から消えるが履歴には残る
- **Why**: 公式ルール (rule.html) が「ポン・チー・カンあり」「ロン・ツモ両方」を定めるため。設計詳細の why は各項に併記
- **Consequences**:
  - **スコープ外**: 槍槓 (加槓へのロン)、同巡フリテン、ダブロン、局送り/親交代、リーチ、ドラ、ノーテン罰符 → [05-future-roadmap.md](./05-future-roadmap.md)
  - CPU の鳴きは軽いヒューリスティック (ロン即取り / AWS役牌のみポン / チーしない / 4枚揃いで暗槓)
  - テスト用シームとして `GameControllerOptions.wallFactory` (仕込み壁) と `rng` (CPU打牌固定) を追加

---

## D-010: 手牌の自由並び替えと2クリック捨て牌 (UI状態の分離)

- **What**: 人間の手牌を自由に並び替えられるようにした (PR #1, コミット `3c225ff`)。設計上のポイント:
  - `game.ts:moveHumanTile(from, to)` — 手牌の並びはゲーム状態の一部として GameController が持つ
  - 人間の手牌は**配牌時のみ整列**し、以後 (打牌・ツモ・リンシャンツモ) は再ソートせず手動の並びを維持。ツモ牌は末尾に追加
  - 牌の選択状態 (`UiState.selectedHandIndex`) は**ゲーム状態から分離**して `main.ts` が保持。1クリックで選択、選択済み牌の再クリックで捨てる
  - ツモ牌ハイライトは位置でなく**参照等価** (`tile === state.lastDrawTile`) で判定 (並び替えで位置が変わるため)
- **Why**: AWS役はバラバラな牌の組み合わせで成立するため、視覚的な整理手段が必要。役判定は `counts34` ベースで順序非依存なので、並び替えても和了結果は変わらない (純粋なUX機能)
- **Consequences**:
  - 4人化 (D-009) とのマージで、`game.ts` の `#discard` / `#advanceToNext` / `#drawRinshan` の3箇所に `player.isHuman` 分岐 (人間だけソートしない) が必要になった
  - ドラッグ&ドロップは HTML5 DnD で `render.ts:attachHandlers` に配線。`UiState` は再描画のたびに `render()` へ引数で渡す

---

## D-011: 局送りは「物理席固定・親と風が回る」

- **What**: 東風戦 (東1〜東4) の局送りを実装 (2026-06)。設計の要点:
  - `Seat` (east/south/west/north) は**物理席**のまま固定。人間は常に "east" で画面下。局 N の親は `SEAT_ORDER[N]` (東2=south、東3=west、東4=north)
  - **自風が回る**: 親=1z(東家)、以降ツモ順に 2z/3z/4z (`game.ts:windFor`)。東2では人間は北家になる。役判定は固定マップではなく `players[seat].seatWind` を参照
  - **親の連荘なし** (公式ルール): 和了・流局を問わず `startNextRound()` で常に親交代。東4終了後は `phase="round_end"` (終局・最終順位表示) で点数は動かない。`startMatch()` で 25000点×4・東1に戻る
  - `wall.ts:DealtHands` は席名フィールドを廃止し **位置ベース (`piles[0]`=親14枚)** に変更。親が回ると "east" という名前が嘘になるため
  - 親が CPU の局は `#deal` 内で `#loop()` を回し、人間の手番/claim/終局まで自動進行してから1回だけ emit する (「公開メソッド復帰後 `phase="discard"` ⇒ `turn="east"`」の不変条件を維持)
- **Why**: 物理席を固定すると UI レイアウト (人間=下、上家=左) と人間ガード (`turn !== "east"` 等) が全局で不変になり、回るのは「風と親フラグ」というデータだけで済む。席そのものを回す案は UI とガードの全面書き換えになるため不採用
- **Consequences**:
  - UI の家ラベルは `render.ts:seatName(player)` で `player.seatWind` から動的生成 (「あなた (北家)」等)
  - 仕込み壁テスト (`riggedDeal`) は「東1 (east=親)」前提。局を跨ぐテストは同じ壁が**次局の親**に再配牌されることに注意 (和了形を pile 0 に置くと次局の CPU 親が即ツモする)
  - 場風は東 (1z) 固定。南入 (半荘) は未実装

---

## D-012: ドラ表示牌 (カンドラ / 王牌レイアウト)

- **What**: ドラ表示牌・カンドラを実装 (2026-06)。設計の要点:
  - **王牌14枚のレイアウト** (`deadWall[0]` = `splitDeadWall` のスライス先頭 = ライブ壁側): `[0..4]`=表ドラ表示牌、`[5..9]`=裏ドラ表示牌 (★リーチ機能用の予約。今回は公開も使用もしない)、`[10..13]`=リンシャン予約 (未使用)。表ドラ i 枚目と裏ドラ i 枚目は index `i` と `i+5` でペア
  - **リンシャンはライブ壁末尾のまま** (`drawFromWallEnd`、D-009 項6 を踏襲) = **既知の逸脱**。厳密ルールでは嶺上牌は王牌から取るが、「カン1回ごとにライブ壁ツモ可能数が1減る」効果は同じでゲーム結果に影響しない。王牌は純粋に表示牌置き場とし、既存テスト (`deadWall` 14枚固定) も壊さない
  - **カンドラは「カン成立と同時に即公開」** (リンシャンツモの前)。暗槓/加槓/明槓すべて `game.ts:#revealKanDora()` の1箇所で処理。厳密ルール (明槓は打牌後めくり) との差異は許容
  - **ドラは役ではない**: AWS役必須ゲート (`canDeclareWin`) は `judgeYaku` の結果のみで判定し、**通過後に**ドラ飜を加算する。`{ id: "dora", name: "ドラ", han: N }` を `yakus` 配列に1行追加し `totalHan` に含める (和了画面の役リストに自動表示)
  - **役満にはドラを加算しない** (`judged.isYakuman === true` ならスキップ)。非役満でドラ込み `totalHan >= 13` になれば数え役満相当の支払いになる点は仕様として許容
  - **状態は `doraIndicatorCount: number` の1つだけ**。表示牌の実体は `deadWall` から純関数 (`src/dora.ts`) で導出する単一情報源。裏ドラも `uraDoraIndicators(deadWall, count)` で公開済み (リーチ実装はこれを呼ぶだけ)
  - **罠**: ドラ枚数カウントに `effectiveHandTiles()` を使わない (カンの4枚目を3枚に射影するため、D-009 項5)。`#tryWin` では `[...concealed, ...melds.flatMap(m => m.tiles)]` で副露の全牌を数える
- **Why**: 公式ルール (rule.html) は「ドラ」を1飜項目として明記するが、表示牌枚数・カンドラ・裏ドラ・王牌の仕組みは記述なし → 標準リーチ麻雀の慣例に従う。①ドラ→②リーチ→③calcFu の実装順で、②が裏ドラを使うためスロットとアクセサを先行予約した
- **Consequences**:
  - 新規 `src/dora.ts` は `tiles.ts`/`types.ts` のみ依存 (01-architecture の依存ルール準拠)。`game.ts`・`ui/render.ts` が import
  - UI は5スロット固定表示・未公開は裏向き (`render.ts:centerSquare`)。`ui/styles.css` の `.center-info .dora-row`
  - **スコープ外 (残)**: 裏ドラの公開 (リーチで実装。スロット予約済み)、赤ドラ、リンシャンを王牌から取る厳密実装

---

## D-013: リーチ (一発 / 裏ドラ / 自動ツモ切り / 供託 / CPUリーチ)

- **What**: リーチを実装 (2026-06)。設計の要点 (実装計画 `feature-riichi.md` の確定版):
  - **役の配線**: リーチ (1飜, id `riichi`)・一発 (1飜, id `ippatsu`) は分解非依存なので `yaku/judge.ts` のトップレベルで付与 (七対子・標準形の両方に効く。国士無双=役満には付けない)。`JudgeContext` に `isRiichi?`/`isIppatsu?` を**オプショナル**追加し既存約190テストを温存。一発は `isRiichi && isIppatsu` のときのみ
  - **AWS役ゲートとの関係**: リーチ・一発は標準役なので `canDeclareWin` (AWS役必須ゲート) を**満たさない**。リーチのみの手は和了不可 — これは仕様 (`game.test.ts` の AWS役ゲートテストで固定)
  - **裏ドラ**: リーチ和了者のみ `countDoraHan(全牌, uraDoraIndicators(deadWall, doraIndicatorCount))` を計算し `{id:"ura-dora"}` 行として totalHan へ加算 (ゲート通過後・役満時スキップ、D-012 のドラ加算と同じブロック)。**牌リストは表ドラと同じ `[...concealed, ...melds.flatMap]`** (`effectiveHandTiles` 不使用)。`WinInfo.uraIndicators` は非リーチ和了で null
  - **供託**: `GameState.riichiPot` (点)。リーチ成立で −1000 / pot +1000、和了者が総取り (`WinInfo.riichiPotWon`、payments とは別枠で payments 合計は 0 のまま)。流局時は `#deal` が次局へ持ち越し。不変条件 **`Σ score + riichiPot === 100000`**
  - **リーチ成立タイミング**: 宣言打牌がロンされなかった時点で成立。controller 私有 `#pendingRiichi: Seat | null` で管理し、`#advanceToNext` (クレームなし=一発あり) / `#executeClaim` 非ロン分岐 (ポン等=一発なし) で `#commitRiichi`、ロン分岐で取り消し (棒も出ない)
  - **リーチ後ロック**: 以後は自動ツモ切り。`#loop` が「人間 & isRiichi & !canTsumo」のとき末尾 (ツモ牌) を自動打牌。`canTsumo` のときだけ停止 (ツモ宣言の機会)。CPU も `ctx.isRiichi` で末尾ツモ切り。**リーチ後のカンは全面禁止** (`#refreshHumanTurnHints` で `selfKanOptions` 抑止、`#cpuTurnStep` で暗槓スキップ)
  - **一発の消滅**: (a) リーチ者自身の次打牌完了 (`#discard` 冒頭で自席 `isIppatsu=false`)、(b) 任意の副露成立 (`#executeClaim` 非ロン分岐で全席 `isIppatsu=false`)。ロン見逃しでは消えない
  - **リーチフリテン**: `Player.permanentFuriten`。`#afterDiscard` で「リーチ者の待ち (`riichiWaits`、成立時に固定) に打牌が含まれる」とき eager set。**適格性判定の後にセットする**ことで「初回の待ち牌は本人がロン可能、見送れば以後ロン不可」を満たす。`claims.ts:canRon` が `permanentFuriten` で拒否
  - **クレーム適格性**: リーチ者はロン以外のクレーム不可 (`computeEligibility` に `isRiichi` を渡し pon/kan/chi を抑止 — これがないと CPU リーチ者が役牌をポンしてしまう)
  - **CPU リーチ**: `decideCpuAction` が `riichiAllowed` (門前・1000点・ライブ壁≥1・未リーチを controller が判定) かつテンパイ維持打牌があれば最初の候補で宣言 (dumb)。win は riichi より優先
  - **宣言条件 (最簡)**: 門前 / テンパイを保つ打牌が存在 / `score >= 1000` / **ライブ壁 ≥ 1** (標準は≥4だが本プロジェクトはノーテン罰符・形式テンパイ概念なしのため ≥1) / 未リーチ
  - **横向き表示**: `Player.riichiDiscardIndex` (discards の添字)。`#advanceToNext` 経由なら `discards.length - 1`、ポン等で河から消えた後なら `discards.length` (次打牌位置)
- **Why**:
  - **自動ツモ切り採用**: リーチ後は手牌が固定され人間の打牌入力は無意味。`#loop` の停止条件1行 (`!isRiichi || canTsumo`) で人間・CPU 共通に扱え、D-009 の不変条件「公開メソッド復帰後 `phase==='discard'` ⇒ `turn==='east'`」も維持できる
  - **宣言牌ロンの pending 方式**: リーチ棒は「打牌が通った」後に出る (標準ルール)。打牌時点では未確定なので `#pendingRiichi` に退避し、クレーム解決の分岐で成立/取消を確定する
  - **eager フリテン**: リーチ者は待ちを変えられないので、待ち牌が場に出た瞬間に「ロンするか永久フリテンか」が決まる。適格性判定の後にフラグを立てれば、初回ロンは可能・見送り後は不可、という標準挙動を最小コードで実現できる (CPU は `decideClaim` が常にロンするため見逃しは起きないが、AWS役ゲートでロンできず待ち牌が流れたケースも同じ機構で正しくフリテンになる)
- **Consequences**:
  - `humanDiscard` が `void` → `ActionAttempt` 返却に変更 (リーチ中の非ツモ牌打牌をトーストで拒否するため。既存テストは戻り値を見ていないので互換)。新 API `humanRiichiDiscard(index): ActionAttempt`
  - **既知の制限 (残課題)**: ダブル立直なし / リーチ後のカン全面禁止 (待ち変化・ドラめくりの複雑さ回避) / 同巡フリテンはスコープ外 / 東4終了時に残った供託は誰にも渡らず消滅 (最終順位は score のみ)
  - CPU リーチで供託が出るため、局を跨ぐ既存テストの `Σ score === 100000` 断言は `Σ score + riichiPot === 100000` に更新 (`game.test.ts` の局送りテスト)
  - 新規 `src/riichi.ts` (`riichiDiscardIndices`)。UI は `render.ts` (リーチボタン・armed ハイライト・横向き牌・供託/裏ドラ表示) と `main.ts` (`riichiArmed` トグル)、`ui/styles.css` の `.riichi-*`

---

## D-014: 符計算 (calcFu / 標準点数式への移行)

- **What**: 符計算を実装 (2026-06)。実装計画 `feature-calc-fu.md` の確定版:
  - **新規 `src/fu.ts`** (ロードマップの「`score.ts:calcFu()`」から分離): `enumerateWinPlacements` (和了牌を置ける門前面子/雀頭の全列挙)・`calcFu` (1配置の符)・`SEVEN_PAIRS_FU=25`。`score.ts` は依存ゼロの葉モジュール (`(han,fu)→点数`) のまま保つ (D-006 co-location: 符テーブル定数は fu.ts、点数式定数は score.ts)
  - **点数式**: `TABLE` (公式 rule.html の飜ベース表) を削除し、標準リーチ麻雀式 `base = fu × 2^(2+han)` + 満貫キャップ (han≤5 で base>2000 → 2000、6-7 → 3000、8-10 → 4000、11-12 → 6000、≥13 → 8000) + 各支払い100点切り上げに置換。**公式表から4飜以下で意図的に逸脱する** (下表)。満貫以上は全段階で旧表と完全一致 (なお rule.html の役満親ツモ「18000」は 48000 と矛盾する公式表の誤記で、旧コードも 16000オールを採用済み)
  - **符の規約**: 基礎20 / 門前ロン+10 / ツモ+2 (平和は抑制) / 嵌張・辺張・単騎+2 / 役牌雀頭+2 (**連風も+2 止まり** — +4 派もあるが現代主流の +2 を採用) / 刻子 明刻2-4・暗刻4-8・明槓加槓8-16・暗槓16-32 (中張/么九) / 食い平和形ロンは20符ちょうど→30の特例 / 10符単位切り上げ。七対子は固定25符、国士無双は役満のため符不問 (`JudgeResult.fu = null`、`WinInfo.fu` には 0 を格納し UI 非表示)
  - **高点法**: `judge.ts` が (分解 × 和了牌配置) ごとに (han, fu) を評価し **han 降順 → fu 降順**の辞書式で最良を採用。han 固定なら支払額は fu に単調非減少、han+1 で base 2倍なので fu 差で逆転しない
  - **平和の両面待ち条件**: `judgeStandardYakus` に第3引数 `waitShape` を追加し、平和は `ryanmen` (または null=待ち形不問) のみ成立。嵌張待ち平和 (平和なのに待ち符+2) の矛盾を解消
  - **適格性パス**: `JudgeContext.winningTileId: TileId | null` を追加。null は「和了可否ゲートのみで符を計算しない」パス (CPU の打牌判断・debug panel プレビュー)。和了確定パス (`#tryWin`)・`#canTsumoNow`・`canRon` は必ず牌を渡す。ゲート (`canDeclareWin` + フリテン) は符非依存
- **Why**: ロードマップの明示要求 (`han→{han,fu}` 拡張)。飜ベース表と符は構造的に両立しない — 「符は表示のみ」案は符が点数を動かさず計算する価値がほぼ無いため棄却。満貫以上は完全一致するため逸脱は低翻域に限定される
- **点数の before/after (30符)**: 5飜以上は全段階で不変。変化するのは:

  | ケース | 旧 (公式表) | 新 (標準式) |
  |---|---|---|
  | 1飜 子ツモ | 500/500 (計1500) | **300/500 (計1100)** |
  | 1飜 親ツモ | 1000オール | **500オール** |
  | 2飜 子ツモ | 1000/1000 (計3000) | **500/1000 (計2000)** |
  | 2飜 親ロン | 3000 | **2900** |
  | 2飜 親ツモ | 1500オール | **1000オール** |
  | 3飜 子ロン | 3000 | **3900** |
  | 3飜 親ロン | 5000 | **5800** |
  | 4飜 子ロン | 5000 | **7700** |
  | 4飜 子ツモ | 1500/3000 (計6000) | **2000/3900 (計7900)** |
  | 4飜 親ロン | 8000 | **11600** |
  | 4飜 親ツモ | 3000オール | **3900オール** |

  (1飜 子ロン1000・親ロン1500、2飜 子ロン2000、3飜 子ツモ・親ツモは不変)。加えて符依存の変動が新たに生まれる (平和ツモ20符、七対子25符、4飜40符以上は満貫到達など)
- **Consequences**:
  - 低翻域の点数が公式 rule.html の表と乖離する (2026-06 人間がブラウザで確認・了承済み: 親1飜30符ツモ500オール・4飜30符子ロン7700・平和ツモ20符・七対子25符・役満の符非表示)
  - `ScoreInput.fu` が必須に。`WinInfo.fu` 追加、和了パネルは「N符 M飜」表示 (役満は符非表示)
  - 適格性パス (`winningTileId: null`) では平和が待ち形不問になる軽微な飜数不整合があるが、ゲートは AWS役の有無のみ見るため和了可否に影響しない
  - `cpu.test.ts`/`judge.test.ts` 等の ctx リテラルに `winningTileId`/`melds` が必要になった (既存挙動は null/[] で不変)

## D-015: CPU の三者三様の性格付け

- **What**: 全 CPU が同一ロジックだった `cpu.ts` を、席ごとに異なる性格で打つよう拡張 (2026-06)。設計の要点:
  - **性格は純データ record の knob**: `CpuPersonality` (`foldToGenbutsu` / `foldOnlyWhenNotTenpai` / `allowPon` / `ponDragonOnly` / `allowChi` / `allowKanOnDragon` / `suppressRiichiVsOpponentRiichi`) を `PERSONALITIES: Record<PersonalityId, CpuPersonality>` で定義。`decideCpuAction`/`decideClaim` は単一の純分岐関数のまま knob を読むだけで、分岐コードを席ごとに散らさない
  - **席割り** (`game.ts:CPU_PERSONALITY`): south=`attacker`(Lambda) / west=`defender`(Well-Architected) / north=`balanced`(Auto Scaling)。3者の差は**鳴き・守備・リーチ**の軸に出る (打牌ベースラインは共通)
    - attacker: 押し続ける / 勝てる鳴き (`keepsAwsWinPath` ゲート通過) は積極 / 即リーチ / 降りない
    - defender: 一切鳴かず門前維持 / 相手リーチで現物ベタオリ / 相手リーチ中は自分のリーチを抑止
    - balanced: 役牌ポンのみ (現状踏襲) / 非テンパイ時だけ降りる / テンパイなら押す
  - **`pickIsolatedDiscard`** (3者共通ベースライン): 向聴計算が無いため、`counts34` で各牌の ±2 近傍＋余剰コピーの「支持度」を測り最も孤立した牌を切る (么九バイアス + rng タイブレーク)。純ランダムより常に良い。守備の `pickGenbutsuDiscard` (現物優先・rng不要) と対。
  - **`keepsAwsWinPath` 自己ゲート**: 鳴き過ぎて AWS役ゲート (D-009 項5) を満たせず和了不能になる「死に手」を防ぐ。役牌ポン/カンは hanOpen≥1 で常に許可、それ以外 (チー/非役牌ポン) は鳴き後テンパイの待ちのいずれかが `canDeclareWin` を満たすときだけ許可。AWS役は散らばり単牌の組合せ (例 `3p2m7s9s`=web-application-kan) も一致するため、これで実際に和了できる鳴きだけを選ぶ
  - **現物 (`safeTileIds`)**: `game.ts:#opponentRiichiContext` がリーチ済み他家全員の `discardedIds` の**積集合** (=どのリーチにも 100%安全) を算出して `CpuContext` に渡す。複数リーチで空になり得る場合は守備側が孤立牌で代替
- **Why**: 3人の打ち筋に個性がなく対局の手応えに乏しかった。三者三様の打ち筋で対局を面白くする (ユーザー要望)。差別化は観測しやすい鳴き/守備/リーチに置き、向聴・危険牌評価という未実装の重い計算は避けた
- **Consequences**:
  - **debug 仕込み (`?debug=...`) と決定的テストは `legacyCpu` で旧来の単一ロジック (balanced 鳴き + ランダム打牌 + 守備なし) に固定**。`pickIsolatedDiscard` と性格鳴きで「CPUは常に先頭牌を打牌」前提のプリセット・統合テストが崩れるのを避け、シナリオを再現可能に保つ。`main.ts` は rig 有り (`?debug=ron` 等) で `legacyCpu:true`、通常プレイ・パネルのみ (`?debug=1`) で性格 ON。`game.test.ts:riggedGame(spec, legacyCpu=true)` 既定
  - `CpuInput`/`CpuContext`/`ClaimDecisionInput` を additive 拡張 (`personality?`/`randomDiscard?`/`anyOpponentRiichi?`/`safeTileIds?`/`hand?`/`melds?`/`seatWind?`/`roundWind?`)。省略時は balanced・自己ゲート省略で旧挙動と不変
  - 守備の「現物が無い」フォールバックは最も孤立した么九牌で代替 = **100%安全ではない** (字牌の単騎/シャンポンに刺さり得る)。危険牌モデルが無い以上の最善
  - 性格ロジックは `cpu.test.ts` で網羅、`game.ts` 配線は `game.test.ts` の性格モード統合2件で検証

## D-016: グローバルエラー捕捉とフォールバックDOM (盤面フリーズの受け皿)

- **What**: 想定外例外で盤面が無反応に固まる唯一の本番障害モードに受け皿を用意 (2026-06、PR #2 レビュー Critical #3 対応)。設計の要点:
  - **グローバル捕捉1本**: `main.ts` で `window` の `error`/`unhandledrejection` を購読し `reportFatal()` へ集約。打牌などハンドラ層 (`onTileClick` 等) の同期例外も**未捕捉なら window の error イベントに伝播する**ため、per-handler の try/catch を散らさずグローバル1本でカバーする
  - **フォールバックで盤面固定**: `reportFatal` は `render.ts:renderFatal()` で `#app` を差し替え (`showToast` 同様 `createElement`+`textContent`、innerHTML 不使用)、見出し+`seed`+リロードボタンを描画。`fatalShown` フラグで多重描画と、`rerender()` 先頭ガードで onChange 由来の盤面復活を防ぎ、壊れた状態の操作続行を断つ
  - **障害文言は実際の障害パターンで2分**: 実行時例外 (ハンドラ/async) =「AZ障害が発生しました」、起動失敗 (配牌仕込み失敗 → rig を捨てた通常ゲームでの再試行 `startMatch()` も失敗) =「リージョン障害が発生しました」。後者は `main.ts:102-` の再試行を try/catch で包んで初めて捕捉でき、これが無いと catch 外で `#app` 空=白画面に固まる二次フリーズだった
  - **seed 再現性** (同レビュー Warning #3): `seed = Date.now()` のため不具合局面が再現できなかった。起動時に `console.info(seed)` を必ず1回出し、全エラートースト (debug parse 失敗 / `orToast` / 配牌仕込み失敗 / リーチ拒否) に `(seed=...)` を付与。URL `?seed=<値>` で当該局を再現できる
- **Why**: 完全クライアントサイドのため最後の砦の `throw` (`#loop` の "game loop did not settle" 等) が UI 層で握られず、復旧はリロードのみ・手段の提示もなかった。盤面フリーズと白画面に最低限の受け皿と再現性を与える
- **Consequences**:
  - ロジック無改修 (`game.ts`/`cpu.ts`/`winning/*` 不変) のため既存テストは緑のまま。本変更は DOM/起動レベルで vitest の `node` 環境 (jsdom なし) では自動テスト対象外 → CLAUDE.md どおり人間がブラウザ確認
  - 動作確認は DevTools コンソールから例外注入で行う: `window.dispatchEvent(new ErrorEvent("error", { error: new Error("test") }))` / `Promise.reject(new Error("test"))` → フォールバック描画。**AZ障害パターンは 2026-06 人間がブラウザで確認済み**。リージョン障害は起動不能時のみで通常踏まないが描画経路は同じ `renderFatal`
  - `#app` 不在 (`main.ts:9` の throw) と `parseDebugConfig` の既存 try/catch は対象外 (前者は復旧不能、後者は専用 catch 済み)

## D-017: AWSカン宣言メカニクス

- **What**: 「カン」と名の付く3役 (`cicd-pipeline-kan`=6789p / `web-application-kan`=3p2m7s9s / `blue-green-deploy-kan`=3p3m6m7s) を、牌構成の自動成立から**プレイヤーの宣言で成立**へ変更 (2026-06、ユーザー要望)。新副露種別 `aws-kan` を導入:
  - **宣言フロー**: 自分の手番 (ツモ直後) に手牌へ4枚パターンがそろうと `#computeSelfKanOptions` が `{kind:"aws-kan", yakuId, tileIds}` を提示。`#performSelfKan` が該当4枚を抜いて `aws-kan` 副露として晒し、通常カン同様 **カンドラ1枚公開 (`#revealKanDora`) + 嶺上ツモ (`#drawRinshan`)** を行う。打牌からの鳴きカン (daiminkan 相当)・槍槓は未対応 (スコープ外)
  - **算術**: `aws-kan` は1面子枠を占有 (`check.ts: concealedMeldCount = 4 - melds.length`)。残り手牌は通常通り分解されるので `decompose.ts` の `14=4×3+2` は無改修。本物の槓 (4枚→1面子+補充) と同じ収支
  - **多色OK**: チー/ポン形を要求しない独立種別なので `3p2m7s9s` など3色パターンも晒せる (既存メルド型に押し込まないのが鍵)
  - **メンゼン保持**: 暗槓同様、自分の手牌から晒す宣言なので `isMenzenHand` で門前扱い (門前3飜 / 他で鳴いていれば hanOpen=2、blue-green は門前限定)
  - **役の付与**: `detectAwsYakus` は `AWS_KAN_YAKU_IDS` を牌構成照合から除外し、`ctx.declaredAwsKanYakuIds` (= `judge.ts` が `aws-kan` 副露を `awsKanYakuIdForTiles` で変換) のみ付与。宣言で晒した4枚は `effectiveHandTiles` 経由で下位役 (789p 等) を誘発するため `resolveAwsSubsumption` で抑制 (D 既存の subsumption と整合)
  - **符**: `aws-kan` は刻子でないため `fu.ts:calcFu` の `pon` 限定ループで自然に **0符寄与**。`partitionMelds`/`enumerateWinPlacements` は非 null 種別として和了牌配置から除外。fu.ts/standard.ts はロジック無改修 (型のみ追従)
- **Why**: 「カン」役が何の操作もなく牌構成だけで付くのは名前と挙動が乖離していた。`hanOpen=2` は食い下がりであって鳴き必須の意ではない (cicd は順子=チー可) と判明したが、ユーザーが「カンらしく宣言を要求する」遊びを選択。原作 (rule.html/yaku.json は最終手検出) からは**意図的に乖離するハウスルール拡張**
- **Consequences**:
  - CPU は v1 では AWSカンを宣言しない (`#computeSelfKanOptions` の結果から CPU 経路は `kind==="ankan"` のみ拾う)。CPU が誤って手を壊すのを避ける最小実装。将来「宣言後もテンパイを保つ場合のみ」等のヒューリスティックで有効化余地
  - 宣言しないと下位役のみ (6789p を持っていても `cicd-pipeline` 2飜だけ)。debug URL の旧 6789p 例は base のみ成立に
  - 検証: `aws-pattern.test.ts` (宣言ゲート/補助関数)・`judge.test.ts` (宣言→役+符)・`game.test.ts` (宣言フロー: 牌除去/カンドラ+1/嶺上ツモ)。UI 表示と実機操作は CLAUDE.md どおり人間がブラウザ確認
