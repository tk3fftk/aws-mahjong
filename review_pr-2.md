# コードレビュー結果

## サマリー
PR #2 は AWS麻雀（クライアントサイド静的ブラウザゲーム、GitHub Pages 配信）に符計算・ドラ・リーチ・CPU性格などを追加する大規模変更（9408行/55ファイル）。即時に悪用可能なセキュリティ脆弱性はなく、バンドルも19KB gzip と軽量で設計の節度は良好。一方で **CPU思考のホットパス（`keepsAwsWinPath`）の計算量** と **未catch例外による盤面フリーズ** が複数観点から重なって浮上した。総指摘12件（Critical 3 / Warning 6 / Info 3）、うちコンセンサス（2人以上一致）5件、全員一致1件。

## 指摘事項

### 🔴 Critical（対応必須）

1. ✅ **対応済み** 🔥 ⚠️ [src/cpu.ts:237-253] `keepsAwsWinPath` が打牌・鳴き判断のたびに多重ループ（`riichiDiscardIndices`(≤14, 各が内部で winningTiles34×canWin) × `winningTiles`(34) × `canWin`+`judgeYaku`）を**同期実行**。`decideClaim` の gate から kan/pon/chi 候補ごと×最大3席で走り、最深部の `judgeYaku` が1鳴き判定あたり数百〜千回呼ばれる見積もり。低スペック端末で1手ごとに体感フリーズ＝可用性劣化の恐れ。— 💰🔧⚡ 3人一致（評価が分かれた指摘）
   - 💰 大阪: Warning（現状 attacker/balanced のみ到達、計測して問題なければ放置可）
   - 🔧 SRE: Warning → **Critical に格上げ**（Red Coder の定量見積もりを受け、計測待ちでなく先行着手すべき水準。UIスレッドブロック＝可用性影響）
   - ⚡ Red Coder: Critical（数百〜千回/打牌の同期 judgeYaku）
   - [ファシリテーターの整理]: 3人が同一ホットパスを独立に指摘。重要度判断は分かれるが「最悪ケース（同一打牌で全席×全鳴き種が同時にゲート通過）の計測」と対処の優先度は一致。
   - 改善案: ①順序として**まず計算量削減**（`winningTiles`/`canWin` を tileId/手牌キーでメモ化＋鳴き候補が役牌でない場合の早期枝刈り）→ ②それでも閾値超なら `requestIdleCallback`/非同期分割。非同期化を先に入れると「固まらないが遅い」＋レースの温床になるだけ、と Red Coder が明示。

2. ✅ **対応済み** 🤝 [src/yaku/aws-pattern.ts:84] `matchesCountSuperset` が呼ばれるたびに `counts34(mpszToTiles(sample))` を再計算。sample文字列（全22役×~30 sample）は不変なのに regex replace＋文字走査＋Int8Array確保を毎回やり直す。`judgeYaku` が Critical #1 の最深ループ内にあるため増幅する。— ⚡💰 コンセンサス
   - 改善案: モジュールロード時に sample→`Int8Array` を1度だけ事前計算しテーブル化（`Map<string, Int8Array>`）。挙動完全不変・テスト不要の純粋前計算で、4人の指摘中「最もやらない理由がない」（大阪）。knob の有無に関係なく無条件で実施推奨（Red Coder）。

3. ✅ **対応済み** [src/game.ts:345 / src/main.ts:63-100, 102-111] ハンドラ層（`onTileClick` 等）で起きる想定外例外がどこにも catch されず、盤面が無反応で固まり復旧はリロードのみ。`#loop` の `throw new Error("game loop did not settle")` や `judgeYaku`/`canWin` のバグ起因例外が伝播する。さらに起動時 catch（main.ts:102-111）も二次フリーズの穴：`startMatch()` 失敗時の再試行が再 throw すると catch の外で白画面のまま固まる。— 指摘元: 🔧 運用
   - 改善案: `window.addEventListener("error"/"unhandledrejection")` でグローバル捕捉＋「不具合発生・リロード」トースト＋`seed` 表示。ハンドラ層と再試行 `startMatch()` を try/catch で包み、最終失敗時は `root` に最低限のフォールバック DOM（seed＋リロード案内）を描画。

### 🟡 Warning（要検討）

1. 🤝 ⚠️ [src/debug/panel.ts:142,204 / 152-153] debug パネルが CPU 全員の手牌・裏ドラ・次ツモを開示。debug コードは `import.meta.env.DEV` ガードもツリーシェイク除外もなく**本番バンドルに常時同梱**され、唯一のゲートが `?debug=1` という推測可能な URL パラメータ。成果物は GitHub Pages 公開URLへ直行。— 🔧🛡️💰（評価が分かれた指摘）
   - 🔧 SRE: Info（本番ビルド混入なら将来対人時のチート経路、現状ローカル専用なら問題なし）
   - 🛡️ Red Team: **Warning に格上げ**（秘密でも認証でもない単一パラメータで隠し機能が全開放＝hidden-parameter/forced-browsing の構図。対人化した瞬間ゼロ工数で全相手情報が見えるバックドア化）
   - 💰 大阪: **Warning 相当**（debug 一式が本番バンドルに同梱され配信バイト・パース時間を恒常的に払う死蔵コード。DEV ガードでツリーシェイクすれば本番バンドル縮小＋チート経路も同時に閉じる、ワンライン1箇所）
   - [ファシリテーターの整理]: 観点は3者3様（運用/攻撃面/コスト）だが、対処は `import.meta.env.DEV` ガード1本に収束。
   - 改善案: debug パネル初期化を `if (import.meta.env.DEV)` で囲み本番ビルドから除外。対人機能を入れるなら「他者手牌をクライアントに送らない」サーバ権威を前提に方針明文化。

2. 🤝 [src/ui/render.ts:89-108] `render()` が毎手 `root.innerHTML` 全置換＋`attachHandlers` で全要素にリスナ再付与し、かつエスケープ層が一切ない。**エラー耐性・再付与コスト・XSS の3観点が集中する単一障害点**（SRE）。現状の流入値は制約付きドメイン（tile id `[1-9][mpsz]`/enum/数値）で XSS 悪用不可だが、将来 free-form テキスト（プレイヤー名等）を足すと即 XSS 化。— ⚡🛡️🔧 コンセンサス
   - 改善案: `textContent` ベース構築＋ルート1個へのイベント委譲（`data-action` で dispatch）への移行で、(1) 毎フレームの `querySelectorAll().forEach(addEventListener)` 消失、(2) HTML文字列連結の縮小で XSS 面も縮小 ——「XSS対策とイベント委譲を1本のリファクタに統合」（Red Coder）。HTML文脈の動的値は `escapeHtml` を通す方針を明文化。現状規模では実害小のため優先度は Warning 据え置き。

3. ✅ **対応済み** [src/main.ts:14 / src/wall.ts:19] `seed = Date.now()` だが例外時に seed がどこにも出力されず、ユーザー報告から不具合局面を再現できない。起動時 catch のトーストにも seed が含まれない。— 指摘元: 🔧 運用
   - 改善案: createGame/startMatch 前後で `console.info("seed", seed)` を必ず1回出し、全エラートースト（main.ts:22, 59, 107）に `seed=${seed}` を付与。

4. 🤝 [.github/workflows なし] CI 不在。テスト344件があるのにマージ前自動実行ゲートがなく、デグレが GitHub Pages（公開ページ）へ直行する。— 🔧💰 コンセンサス
   - 改善案: push/PR で `npm run build`（tsc＋vite）＋`npm test` を回す GitHub Actions を1本追加。パブリックリポジトリなら Actions 無料・数十秒で完結し「ほぼ無料で人的手戻りコストを削る」典型的に得な投資（大阪）。デプロイも Actions 化すればビルド成果物の手動コミットというトイルを排除。

5. ✅ **対応済み** (Critical #1 と一体) [src/winning/furiten.ts:13-24 / src/riichi.ts:10-24] `winningTiles` が34種を毎回フルブルートフォース、`riichiDiscardIndices` は同一 tileId のみキャッシュ。単発 <1ms でも Critical #1 の入れ子経由で積算する。コメントの「打牌ごと×3席で十分速い」は入れ子を想定していない。— 指摘元: ⚡ パフォーマンス
   - 改善案: `winningTiles` に手牌キーベースのメモを検討。Critical #1 のメモ化対応と一体で実施。要計測で優先度判断。

6. [src/debug/panel.ts:32-34] `escapeAttr` が `>` を変換しない。`value="..."`（二重引用符属性）専用なら現状問題ないが、関数名が汎用エスケープを示唆し誤用を招く。— 指摘元: 🛡️ セキュリティ
   - 改善案: `escapeAttrValue` へ改名 or `>` も変換して汎用化。

### 🔵 Info（参考）

1. [src/cpu.ts:275-300, src/game.ts:472] `decideClaim`/`decideCpuAction` の「後方互換（hand未指定で自己ゲート省略）」分岐。呼び出し元は本番/legacy(debug rig)/テストのみで外部公開 API がなく、畳む相手のいない後方互換。さらに `seatWind/roundWind` のデフォルト `"1z"` フォールバックは、誤った風で `keepsAwsWinPath` を評価しうる隠れバグの温床。— 指摘元: 💰 コスト
   - 改善案: legacy(debug rig) を畳むときに `hand`/`seatWind`/`roundWind` を必須化し分岐ごと削除。今すぐ不要。

2. [src/tiles.ts:48-50 / src/debug/rigged.ts:55-66] `mpszToTiles` が `${digit}${ch}` を whitelist 検証せず `TileId` にキャスト。debug 機能が公開ビルドに同梱され誰でも `?debug=1` で有効化できる以上、`?east=`/`?wallHead=` 等は厳密には信頼境界内入力でない。現状 mpsz 値はメタ文字を含まず XSS 不成立、影響は壊れURL/undefined どまり。— 指摘元: 🛡️ セキュリティ
   - 改善案: `ALL_TILE_IDS` 照合を追加し、本番では debug 入力経路ごと DEV ガードで遮断。

3. [src/game.ts:352-361] `#opponentRiichiContext` の現物積集合が Set スプレッド連鎖。リーチ者最大3・捨て牌十数枚で影響なし。記録のみ。— 指摘元: ⚡ パフォーマンス

## アクションアイテム

1. [x] Critical #2: `aws-pattern.ts` の sample を**モジュールロード時に Int8Array 事前計算**（無条件・即・挙動不変、最もコスパが高い最初の一手） — ✅ 対応済み: `SAMPLE_COUNTS`／七対子テーブルをモジュールロード時に前計算（`src/yaku/aws-pattern.ts`）
2. [x] Critical #1 + Warning #5: `keepsAwsWinPath` の**3重重複（`riichiDiscardIndices`×`winningTiles` 2パス + `canWin` 2倍呼び出し）を1パスに集約** — ✅ 対応済み: `winningForms`（`WinForm` も返す）を追加し `winningTiles` をラッパ化（`src/winning/furiten.ts`）、`keepsAwsWinPath` が打牌候補を tileId dedup しつつ `winningForms` を1回だけ回し `form` を `judgeYaku` に再利用（`src/cpu.ts`）。挙動不変・既存テスト緑＋新規4件。非同期分割は指定順序どおり未着手（計測で閾値超なら別途）
3. [x] Critical #3 + Warning #3: **グローバルエラーハンドラ**＋再試行 startMatch の try/catch ＋フォールバック DOM＋seed 再現性 — ✅ 対応済み: `window` の error/unhandledrejection をグローバル捕捉 (ハンドラ層の同期例外も伝播するため per-handler ラップは不要)、`renderFatal()` で `#app` を固定 (実行時=「AZ障害」/起動失敗=「リージョン障害」)、`console.info(seed)`＋全エラートーストに `(seed=...)` 付与 (`src/main.ts`/`src/ui/render.ts`/`styles.css`、D-016)。AZ障害パターンは人間ブラウザ確認済み
4. [ ] Warning #1: debug パネルを `import.meta.env.DEV` ガードで本番ビルドから除外（チート経路・死蔵コードを同時に解消）
5. [ ] Warning #4: `npm run build`＋`npm test` を回す GitHub Actions を1本追加
6. [x] Warning #3: `seed` を console＋全エラートーストに出力（再現性確保） — ✅ 対応済み (Critical #3 と一体)
7. [ ] Warning #2: `render()` を textContent＋イベント委譲へ（XSS対策と再付与コスト削減を1本のリファクタに統合）
8. [ ] Warning #6: `escapeAttr` を改名 or `>` 対応

## クロスレビューの成果

### 補強された指摘
- [src/yaku/aws-pattern.ts:84] 元指摘（⚡）→ 💰 から「純粋前計算で挙動不変・テスト不要、やらない理由がない」と最優先着手を後押し。
- [.github/workflows なし] 元指摘（🔧）→ 💰 から「パブリックリポは Actions 無料、人的手戻り（最も高い）コストを削る」とコスト面で追認。
- [src/debug/panel.ts:142] 元指摘（🔧 Info）→ 🛡️ が「本番バンドル常時同梱＋推測可能パラメータ」を実証し攻撃面 Warning に格上げ、💰 も死蔵コスト面で Warning 相当に。
- [src/ui/render.ts:89-108] ⚡（再付与コスト）と 🛡️（XSS）が「同一リファクタで一石二鳥」と収束、🔧 が「単一障害点」と運用面を追加。

### 修正された見解
- [src/cpu.ts:237-253 / game.ts:368,477] 🔧 SRE: Warning → **Critical 相当に格上げ**（理由: Red Coder の数百〜千回/打牌の定量見積もりを受け、計測待ちでなくメモ化・前計算を先行着手すべき水準と判断）。
- [src/debug/panel.ts:142] 🛡️ Red Team: Info → **Warning に格上げ**（理由: 公開URL常時同梱＋単一パラメータ開放という攻撃面の構図が成立）。
- 取り下げられた指摘: なし。

### 新規気づき
- [src/main.ts:102-111] 🔧 SRE: 起動時 catch の再試行 startMatch が再 throw すると白画面フリーズ → Critical #3 に統合。
- [src/cpu.ts:275-300] 💰 大阪: 後方互換分岐の `seatWind/roundWind` デフォルト `"1z"` が誤評価の温床 → Info #1 に統合。
- [src/debug/rigged.ts] 🛡️ Red Team: 攻撃者が配牌・山を仕込んで CPU 思考ループの最悪計算量を能動的に膨らませられる（自端末に閉じ DoS にはならず Info） → Critical #1 の入力起点増幅として記録。

## 観点別レビュー詳細

<details>
<summary>💰 コスト観点（大阪）</summary>

クラウド課金・外部API・DB なしのため FinOps 観点はゼロ。コストは「ブラウザCPU/電池」「再描画チャーン」「YAGNI・保守」に絞った結果、**重大なコスト問題なし**。褒めるべき点が3つ: (1) `#emit`/full-`innerHTML` 再描画は CPU 自動進行ループ内ではなく公開アクション単位で1回だけ（無駄なDOM再構築なし）、(2) 最ホットな `#refreshHumanTurnHints` は `turn==="east"` の短絡評価で CPU 手番では重い計算に入らない（ガードの置き方が的確）、(3) `riichiDiscardIndices` の tileId キャッシュ・`decomposeStandard` の Int8Array とベース計算節約が効いている。バンドル19KB gzip と軽量。
個別指摘 → Critical #2、Warning #1・#4、Info #1 参照。

</details>

<details>
<summary>🔧 運用観点（スタッフSRE）</summary>

サーバ・インフラを持たない完全クライアントサイドゲームのため、観点は「ブラウザ内での落ちにくさ・再現性・公開パイプライン自動化」に集約。状態機械は `#loop` の反復化（相互再帰排除）と `LOOP_GUARD` で暴走を抑える設計が良い。最大の穴は最後の砦の `throw` が UI 層で握られておらず、唯一の本番障害モード（盤面フリーズ）の受け皿がない点。次点が build/test/deploy が手動トイルのままで自動ゲートがない点。
個別指摘 → Critical #1・#3、Warning #1・#3・#4 参照。

</details>

<details>
<summary>⚡ パフォーマンス観点（Red Coder）</summary>

ホットパスは `decideClaim`→`keepsAwsWinPath` の入れ子と、その最深部で毎回再パースされる `detectAwsYakus` の2点に集中。両者は乗算で効くため、aws-pattern の sample 前計算（Critical #2）を入れるだけで最深ループの定数項が大きく下がり最もコスパが高い。アクション順序の提案: ①aws-pattern.ts 前計算（無条件・即）、②cpu.ts メモ化＋枝刈り＋最悪ケース計測、③render.ts は XSS対策とイベント委譲を1本のリファクタに統合。なお `pickIsolatedDiscard`・`decomposeStandard`・`riichi.ts` の tileId キャッシュは計算量設計が妥当。問題は「単発は速い関数を入れ子で大量に呼ぶ」点に尽きる。具体ms値はコールカウンタを仕込んで1局あたり総コール数を計測することを推奨。
個別指摘 → Critical #1・#2、Warning #2・#5、Info #3 参照。

</details>

<details>
<summary>🛡️ セキュリティ観点（Red Team）</summary>

攻撃面は「URLクエリ（seed/debug/mpsz）」と「debug パネルのフォーム入力」の2つのみ。いずれも `Number()` 数値化または mpsz 文法（`[0-9mpsz\s-]` のみ許容、それ以外 throw）に閉じ、信頼できない自由文字列が DOM/コマンド/ファイルI/O に到達する経路はない。`parseDebugConfig` の例外メッセージは `showToast`（textContent）で安全、debug フォーム→`location.assign` も `URLSearchParams` でエンコードされ open redirect/インジェクションにならない。**即時リスクなし**。唯一の構造的懸念は render.ts が入力ドメイン制約に全面依存しエスケープ層を持たない点（機能追加時の XSS 退行）。クロスレビューで「debug 機能が公開ビルドに常時同梱され `?debug=1` で全開放される」点を攻撃面 Warning に引き上げた。
個別指摘 → Warning #1・#2・#6、Info #2 参照。

</details>
