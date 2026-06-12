# aws-mahjong

AWS麻雀 — 牌が AWS サービス、役に AWS固有役 (22役) がある4人対戦麻雀 (人間 vs CPU×3)。
Vite + TypeScript + 素のDOM。設計・実装方針は [`docs/plans/`](./docs/plans/) を参照。

## 開発コマンド

```sh
npm run dev    # 開発サーバ
npm test       # vitest
npm run build  # tsc -noEmit + vite build (出力: docs/app)
```

## URL パラメータ

| パラメータ | 例 | 説明 |
|---|---|---|
| `seed` | `?seed=42` | 山のシャッフルと CPU の打牌を固定し、同じ局を再現する |
| `debug` | `?debug=1` | debug mode を有効にする (下記) |

## Debug mode

`?debug=...` で画面右上に debug panel が出る。表示内容: 自分の待ち牌と役プレビュー (ロン仮定・ドラ除く。AWS役がなく和了不可の待ちは赤表示)、フリテン状態、CPU 3家の手牌 (mpsz)、裏ドラ表示牌、山の残り枚数と次ツモ4枚、配牌編集フォーム。

### 有効化の形式

| URL | 動作 |
|---|---|
| `?debug=1` | panel のみ。配牌は通常ランダム |
| `?debug=<プリセット名>` | 下表の仕込み配牌で開始 |
| `?debug=1&east=...&wallHead=...` | mpsz 記法で配牌を直接指定 (キー: `east` / `south` / `west` / `north` / `wallHead` / `deadWall` / `wallEnd`) |
| `?debug=<プリセット名>&deadWall=4s` | プリセット + 個別キー上書き |

`east` は14枚 (末尾=親の初ツモ)、他3家は各13枚。`wallHead` はツモ順、`deadWall` は先頭がドラ表示牌1枚目・6枚目が裏ドラ表示牌1枚目、`wallEnd` は先頭がリンシャン1枚目。省略箇所は固定順で埋まる。仕込み時は CPU が「常に先頭牌を打牌」する決定的な進行になる (`?seed=` を併用するとランダムに戻る)。

### プリセット一覧

| 名前 | シナリオ |
|---|---|
| `riichi` | 初ツモの 1z 切りで即リーチ可 (5m/8m 待ち, Kiro)。数巡後に 8m をツモり一発+裏ドラ和了できる |
| `ron` | 初ツモ (1z) を捨てると south が 8m を打ち、ロン可能 |
| `pon` | 初ツモ (9s) を捨てると south が 1m を打ち、ポン可能 |
| `kan` | 初ツモ (9s) を捨てると south が 1m を打ち、明カン可能 (リンシャン・カンドラ確認用) |
| `chi` | 初ツモ (8s) を捨てると上家 (north) が 5m を打ち、3択チー可能 (3m4m / 4m6m / 6m7m) |
| `bigwin` | 初手で国士無双をツモ和了できる (役満の点数計算確認用) |
| `furiten` | 初ツモが待ち牌の 5m。捨てるとフリテンになり、south の 8m をロンできない |

プリセットの定義は [`src/debug/presets.ts`](./src/debug/presets.ts)。panel の配牌編集フォームからプリセットを選んで mpsz を微調整 →「この配牌で開始」で URL に反映される (URL がそのまま再現・共有可能)。

### mpsz 記法

`数字の並び + スーツ文字` の連結。`m`=萬子, `p`=筒子, `s`=索子, `z`=字牌 (1z東 2z南 3z西 4z北 5z白 6z發 7z中)。例: `555z234m67m234p55s1z`
