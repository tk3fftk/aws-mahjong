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

### 現在の代償

- AWS役が重ねて加算されるので、`tile-superset` の偽陽性は飜の過大評価を生む可能性がある
- 将来 `tile-superset` を厳密化 (例えば「完成した面子の中に出現」要求) すれば、偽陽性は減り、複合が自然になる

---

## 点数: 2人麻雀化

`src/score.ts:calcScore()` は 4人麻雀の点数表をベースに、2人麻雀向けに「1人分のみ徴収」している:

- **親ツモ和了** → `oya_tsumo × 1` を CPU から徴収 (本来は子3人 × `oya_tsumo` = 合計3倍)
- **子ツモ和了** → `ko_tsumo[0]` (親分) を 1人から徴収 (本来は親 + 子2人 = 親分 + 子分×2)
- **ロン**は 1人徴収なので元のまま (MVP ではロン未実装)

将来 4人化する際は `calcScore` のシグネチャに「支払者数」を引数化することで拡張する想定。詳細は [05-future-roadmap.md](./05-future-roadmap.md)。
