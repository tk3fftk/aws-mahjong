# 02. AWS役判定の設計

AWS麻雀の独自要素 (役の判定・必須ルール・点数) を、コードのどこでどう実現しているかをまとめる。

---

## AWS役必須ルール

> 公式ルール (`docs/v2.0.1/rule.html`): 和了するには **AWS役を1つ以上** または **役満** が必要。

これをコードでは「**役の検出**」と「**和了宣言ゲート**」の2層に分けて表現している。

| 関数 | 仕事 | 所在 |
|---|---|---|
| `judgeYaku()` | 手にどんな役があるかを集める (1z刻子のような「飜は付くがAWS役ではない」役も列挙) | `src/yaku/judge.ts` |
| `hasAnyAwsYaku()` / `canDeclareWin()` | 集まった役の中に AWS固有役 ID または役満が含まれるかを判定 | `src/yaku/judge.ts` |

責務分離の意義:
- 「**役を見たいだけ**」のユースケース (例: テストで役の数を確認、UI で和了不可手の役を表示) でゲートを強制しない
- ゲームフロー側 (`GameController.tryWin()`) でのみ `canDeclareWin()` を呼んで和了を許可/拒否する

役満特例 (役満は AWS役不要で和了OK) は `hasAnyAwsYaku()` の冒頭で `isYakuman === true` なら即 true を返すことで実現。

---

## 5z/6z/7z 刻子の重複付与防止

5z (Kiro/白), 6z (Cost Explorer/發), 7z (IAM/中) の刻子は、原理的には次の **両方**で1飜が成立しうる:

1. 標準麻雀の「三元牌の役牌」 (`standard.ts` 側)
2. AWS固有役の `kiro` / `cost-explorer` / `iam` (`aws-pattern.ts` 側)

しかし `yaku.json` の description (例: kiro の `通常の役牌・白と合わせて1飜（複合しない）`) より、**合計でも 1飜にすべき**。

実装方針:
- `standard.ts` の役牌判定では **5z/6z/7z をスキップ**し、`1z/2z` (場風・自風) のみカウントする
- `aws-pattern.ts` の `kiro/cost-explorer/iam` で 1飜を加算する
- 結果として、Kiro 刻子のある手は `yakus = [..., kiro(1han), ...]` だけになり、二重加算が起こらない

副作用: 場風・自風 (1z/2z) の刻子は標準側で `round-wind` / `seat-wind` として飜が加算されるが、**AWS役ではない**ので `canDeclareWin()` は通さない。東家・東場の 1z 刻子だけの手は飜2 になっても和了不可。

---

## B-hybrid 4分類

yaku.json の 22役を、サンプル (`sampleMpszList`) の形式で 4 種類に分類している:

| 分類 | サンプル例 | 代表役 | 判定戦略 |
|---|---|---|---|
| `completed-meld` | `"555z"`, `"789p"` | kiro, cicd-pipeline | サンプルの牌を「面子相当の枚数で含む」 |
| `tile-superset` | `"45p3s"`, `"2p1m8s"` | static-site-hosting, serverless-api | サンプル牌を「各1枚以上」含む |
| `repeated-superset` | `"3p2m7s-3p2m7s"` | redundancy (AWS一盃口) | サンプルが N 回反復、合計枚数として含む |
| `seven-pairs` | `"55p-11z-..."` (7組) | dr-architecture | 七対子の対子集合と一致 |

分類マップは `src/yaku/aws-classification.ts` にハードコード。22役を1か所で見渡せる利点と、上流の yaku.json をフォークしない柔軟性を両立。

### 実装の単純化: 全部 count-superset

実は **`seven-pairs` 以外の 3分類は判定アルゴリズムが同じ** (count-wise superset)。`detectAwsYakus()` 内では:

- `seven-pairs` → `matchesSevenPairsSample()`: 七対子の対子7種を sample の対子7種とソート比較
- それ以外 → `matchesCountSuperset()`: 34要素 counts 配列で「手 ≥ サンプル」を要素ごとに確認

これでも振る舞いは正しく出る。分類マップは将来「より厳密な判定 (例: completed-meld は『面子として出現したか』を見る)」に差し替えるための足場として残している。

---

## isCombineAllowed=false の解釈 (重要)

yaku.json の各役には `isCombineAllowed` フラグがあり、ほぼすべての AWS固有役で `false`。これをどう扱うかが、設計上最も悩んだ点。

### プラン当初の解釈 (採用せず)

「`false` の役が出たら、それ以外のすべての AWS固有役を除外し、最高 han の1役のみ採用」

### 実装で採用した解釈

「**標準麻雀の対応役** との非複合のみを意味する」

| AWS役 | description 文 (yaku.json) | 非複合の対象 |
|---|---|---|
| kiro | 通常の役牌・白と合わせて1飜 | 標準の白 (三元牌役牌) |
| cost-explorer | 通常の役牌・發と合わせて1飜 | 標準の發 |
| iam | 通常の役牌・中と合わせて1飜 | 標準の中 |
| redundancy | 通常の一盃口とは複合しない | 標準の一盃口 |
| aws-three-concealed-triples1 | 通常の三暗刻とは複合しない | 標準の三暗刻 |

description が明示しているのは **「標準対応役との非複合」だけ**で、「AWS固有役どうしの非複合」は書かれていない。

### 切替の根拠 (TDDで判明)

`tile-superset` の判定はゆるく、1手で 4-5個の AWS固有役が同時にマッチする (例: 777s を含む手で master-replica + web-application + blue-green-deploy-kan が全部 hit)。strict排他で潰すと、最高 han の1つだけが残り、他のテストが落ちる。

この **strict排他がテストの赤として現れたこと** が、解釈の見直しを促した。詳しくは [03-tdd-policy.md](./03-tdd-policy.md) と [04-design-decisions.md#d-005](./04-design-decisions.md) を参照。

---

## カン系役は「AWSカン宣言」で成立 (declaration gate)

「カン」と名の付く3役は**牌構成では自動成立しない**。プレイヤーが手牌中の4枚パターンを
**AWSカンとして宣言**したときのみ付与する ([D-017](./04-design-decisions.md#d-017-awsカン宣言メカニクス))。

| 役 | サンプル(=宣言に必要な4枚) | 飜 (門前/鳴き) |
|---|---|---|
| CI/CDカン (`cicd-pipeline-kan`) | `6789p` | 3 / 2 |
| Webアプリ カン (`web-application-kan`) | `3p2m7s9s` または `3p3m7s9s` | 3 / 2 |
| Blue/Greenデプロイ カン (`blue-green-deploy-kan`) | `3p3m6m7s` | 3 / 門前限定(null) |

- `aws-pattern.ts:AWS_KAN_YAKU_IDS` がこの3役。`detectAwsYakus` の牌構成照合ループからは**除外**する。
- 代わりに `ctx.declaredAwsKanYakuIds` (宣言された AWSカン副露から導出) に含まれる id だけを付与する。
- `judge.ts` が `ctx.melds` の `kind==="aws-kan"` を `awsKanYakuIdForTiles()` で役 id に変換して渡す。
- 宣言しなければ下位役のみ (例: 6789p を持っていても `cicd-pipeline` 2飜だけ)。

宣言メカニクス本体 (新副露種別 `aws-kan`・嶺上ツモ・カンドラ・メンゼン保持) は
[D-017](./04-design-decisions.md#d-017-awsカン宣言メカニクス) を参照。

---

## 強制共立の整理 (subsumption)

`detectAwsYakus` の照合は「サンプル牌の枚数 ≤ 手牌の枚数」(`matchesCountSuperset`) のブール判定。
このため、ある役のサンプル牌が別の役のサンプル牌を**完全に包含**すると、上位役が成立した瞬間に
下位役も**必ず**自動成立し、両方の飜が加算されてしまう (= 同一構造の二重計上)。
（カン系は宣言で付与されるが、宣言で晒した4枚が `effectiveHandTiles` 経由で下位役を誘発するため、
抑制は引き続き必要。）

| 上位役 (飜) | サンプル | 必ず内包する下位役 | 整理後の扱い |
|---|---|---|---|
| CI/CDカン (3) | `6789p` | CI/CDパイプライン `789p` | 下位を抑制、カンのみ |
| Webアプリ カン (3) | `3p2m7s9s` | Webアプリ `3p2m7s` + インメモリキャッシュ `2m7s9s` | 下位を抑制、カンのみ |
| Blue/Greenカン (3) | `3p3m6m7s` | Webアプリ `3p3m7s` | 下位を抑制、カンのみ |
| 冗長化 (3) | `3p2m7s`×2 | Webアプリ `3p2m7s` | Webアプリを×2(2飜)に引き上げ → 計5飜 |
| AWS三暗刻 (3) | `3p2m7s`×3 | Webアプリ + 冗長化 + マスターレプリカ `777s` | Webアプリ×3(3飜)、冗長化/マスターレプリカ抑制 → 計6飜 |

実装は `aws-pattern.ts:resolveAwsSubsumption()` (detectAwsYakus の return 前に適用):

- **カン系 (拡張役)**: カンは下位役の上位版アーキテクチャ。`AWS_SUBSUMED` マップで下位役を除外し、
  上位役の**代わり**にスコアする (麻雀の 一盃口/二盃口 が複合しないのと同じ)。
- **反復系**: `yaku.json` の意図 (冗長化=Webアプリ×2+一盃口=5飜 / 三暗刻=Webアプリ×3+三暗刻=6飜) に
  合わせ、`WEB_APP_MULTIPLIER` で web-application の飜を copies 倍に引き上げ、最高位段のみ採用
  (三暗刻が立つ手では冗長化・マスターレプリカを抑制)。

連動: 三暗刻の手では冗長化が抑制され `awsYakus` から消えるため、`judge.ts` の標準一盃口/二盃口抑制は
`redundancy || aws-three-concealed-triples1` の両IDで反復系の有無を判定する。

> 強制共立**しない** tile-superset 群 (同サイズで互いに非サブセット) は意図的スタックとして許容
> (D-005 の方針通り)。これらは「重なりうる」だけで「必ず重なる」ではない。

---

## 鳴き手の判定 (isMenzen と hanOpen)

4人化+鳴き対応 (2026-06、[D-009](./04-design-decisions.md#d-009-4人化--鳴きロンの実装方針)) 以降、`isMenzen` は実際に変動する:

- ゲーム層は `winning/melds.ts:isMenzenHand(player.melds)` で門前判定する (**暗槓のみなら門前**、標準ルール通り)
- yaku.json の **`hanOpen=null` は「門前限定」** の意味。`aws-pattern.ts` は `!isMenzen && hanOpen===null` で不成立にする (static-site-hosting 等10役が対象)。`hanOpen` 非 null の役は鳴くと食い下がる (例: cicd-pipeline 2→1飜)
- `isPonAllowed` / `isChiAllowed` は記述的フラグとして実装上は参照しない (D-005 の最小解釈と同じ方針)
- AWS パターン照合 (`matchesCountSuperset`) に渡す手牌は `winning/melds.ts:effectiveHandTiles` の**実効手牌** (純手牌 + 各副露分)。**通常カンは3枚の刻子として射影** (`toDecompMeld`) し、「counts34 の各要素 ≤4」の不変条件を保つ。yaku.json に同一牌4枚を要求する sample が無いことは検証済み。**例外: `aws-kan` 副露は4枚すべて (全て別牌の AWSパターン) を含める**ことで、下位役・混一/清一の判定が全牌を見られるようにする (別牌なので ≤4 は保たれる)

---

## 点数: 4人精算

`src/score.ts:calcScore()` は支払者別の内訳 (`ScorePayments`) を返す:

- **親ツモ** → `{ kind: "tsumo-dealer", fromEachKo }`: 子3人が均等に支払う
- **子ツモ** → `{ kind: "tsumo-ko", fromDealer, fromEachKo }`: 親 + 他の子2人
- **ロン** → `{ kind: "ron", fromDiscarder }`: 放銃者1人
- いずれも `total` = 支払い合計。点数移動の適用と `WinInfo.payments` (UI 表示用の増減一覧) の生成は `game.ts:#applyPayments`

テーブル数値 (`TABLE`) は rule.html の公式点数表そのまま。4人合計 100,000 点の保存則は `game.test.ts` で担保している。
