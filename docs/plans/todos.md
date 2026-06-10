# TODO 集約: 文書執筆中に発見した小さな改善

このファイルは `docs/plans/01-05` を書く過程で「ここはコメント不足」「この命名は曖昧」と気付いた**小さなコード改善候補**を逆向きに集めるログです。

- 大きな機能追加は `05-future-roadmap.md` へ
- ここは「読みやすさ・保守性」の小ネタを蓄積する場所
- 項目が増えてきたら個別のリファクタタスクや別 issue に昇格させる

書式:
```
- [ ] **`<file>:<symbol>`** — <現状の不足> / <推奨アクション> (during: <どの文書を書いていて気付いたか>)
```

---

## 未消化

- [ ] **`src/yaku/standard.ts:judgeStandardYakus` の役牌セクション** — 「5z/6z/7z をスキップしている (= AWS固有役側に一本化)」のクロスリファレンスコメントが欲しい。実装上の重要な約束だが、関数を読み下すと「忘れた」と勘違いされる恐れあり。 (during: 02-aws-yaku-judgment.md)
- [ ] **`src/yaku/aws-pattern.ts:detectAwsYakus` の JSDoc** — 既に「isCombineAllowed=false は標準対応役との非複合の意味」と書かれているが、根拠 (yaku.json description の文面) と「AWS役どうしの加算は意図通り」を 1-2行追記してより堅牢にしたい。 (during: 02-aws-yaku-judgment.md)
- [ ] **`src/wall.ts:mulberry32`** — 「既知の PRNG アルゴリズム名」「ライセンス・出典 (パブリックドメイン)」へのコメントを1行。テストでの seed 固定再現性に依存するので、出典を残しておきたい。 (during: 03-tdd-policy.md)
- [ ] **`src/yaku/standard.ts:judgeStandardYakus` の混一色/清一色** — 「清一色が成立した場合は混一色を付けない」の排他ロジックは現状の if/else 構造に埋め込まれている。テストで保証はされているが、コメント1行で読みやすくなる。 (during: 02-aws-yaku-judgment.md / 03-tdd-policy.md)
