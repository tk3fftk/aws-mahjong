import type { CalledMeldKind, Decomposition, Meld, MeldLike, SeatWind, TileId } from "./types";
import { isDragon, isYaochu, numberOf, sortTileIds } from "./tiles";
import { toDecompMeld } from "./winning/melds";

// 七対子は固定符 (10符切り上げの対象外)
export const SEVEN_PAIRS_FU = 25;

export type WaitShape = "ryanmen" | "kanchan" | "penchan" | "tanki" | "shanpon";

export interface WinPlacement {
  waitShape: WaitShape;
  meldIndex: number | null; // 和了牌の入る decomp.melds の index。null = 雀頭 (単騎)
}

function meldKey(m: Meld): string {
  return `${m.kind}:${sortTileIds(m.tiles).join(",")}`;
}

/**
 * decomp.melds の各面子に副露由来の元 CalledMeldKind を対応付ける (門前面子は null)。
 * canWin は副露を toDecompMeld で射影して分解末尾にマージするが、ここでは順序に
 * 依存せず正規キー (kind + ソート済み牌) の multiset 減算で照合する。
 * 曖昧性は無害: 同一チー2組 (副露1+門前1) はどちらを副露扱いにしても符0で同形。
 * ポン/カンと同牌の門前暗刻は牌4枚制約で共存不可能 (3+3=6枚 / 3+4=7枚)。
 */
function partitionMelds(
  decomp: Decomposition,
  calledMelds: MeldLike[],
): Array<CalledMeldKind | null> {
  const remaining = new Map<string, CalledMeldKind[]>();
  for (const cm of calledMelds) {
    const key = meldKey(toDecompMeld(cm));
    const kinds = remaining.get(key) ?? [];
    kinds.push(cm.kind);
    remaining.set(key, kinds);
  }
  return decomp.melds.map((m) => {
    const kinds = remaining.get(meldKey(m));
    return kinds && kinds.length > 0 ? kinds.shift()! : null;
  });
}

/**
 * 和了牌を置ける「門前部分の面子/雀頭」をすべて列挙する (高点法の候補集合)。
 * 和了牌は常に門前部分にある (ロン牌は concealed に合流済み、ツモ牌は手牌内) ため、
 * 副露由来の面子は候補から除外する。同一牌が複数箇所に置ける場合は全配置を返し、
 * (han, fu) の最大化は呼び出し側 (judge.ts) が行う。
 * 両面/嵌張/辺張は「形だけ」で分類する (2方向に待つかどうかは符に無関係):
 * 例 13持ち2和了は嵌張 (123 の真ん中)、89持ち7和了・12持ち3和了のみ辺張。
 */
export function enumerateWinPlacements(
  decomp: Decomposition,
  calledMelds: MeldLike[],
  winningTileId: TileId,
): WinPlacement[] {
  const calledKinds = partitionMelds(decomp, calledMelds);
  const out: WinPlacement[] = [];
  decomp.melds.forEach((m, i) => {
    if (calledKinds[i] !== null) return;
    if (!m.tiles.includes(winningTileId)) return;
    if (m.kind === "pon") {
      out.push({ waitShape: "shanpon", meldIndex: i });
      return;
    }
    // 順子は昇順 [n, n+1, n+2] (decomposeStandard / toDecompMeld が保証)
    const n = numberOf(m.tiles[0]!);
    const w = numberOf(winningTileId);
    let waitShape: WaitShape;
    if (w === n + 1) {
      waitShape = "kanchan";
    } else if (w === n) {
      waitShape = n === 7 ? "penchan" : "ryanmen"; // 残り 89 のみ辺張
    } else {
      waitShape = n === 1 ? "penchan" : "ryanmen"; // 残り 12 のみ辺張
    }
    out.push({ waitShape, meldIndex: i });
  });
  if (decomp.pair.tiles[0] === winningTileId) {
    out.push({ waitShape: "tanki", meldIndex: null });
  }
  return out;
}

export interface FuContext {
  isTsumo: boolean;
  isMenzen: boolean;
  isPinfu: boolean; // この (分解, 配置) で平和が成立しているか (ツモ符+2 の抑制に使う)
  seatWind: SeatWind;
  roundWind: SeatWind;
}

// 符の基本値と加点 (標準リーチ麻雀)
const FU_BASE = 20;
const FU_MENZEN_RON = 10;
const FU_TSUMO = 2;
const FU_BAD_WAIT = 2; // 嵌張 / 辺張 / 単騎
const FU_YAKUHAI_PAIR = 2; // 三元牌・自風・場風。連風でも +2 止まり (判断3: 現代主流の +2 派を採用)
const FU_MINKO = 2; // 明刻 (中張)。么九は2倍、暗刻でさらに2倍、カンで4倍
const FU_OPEN_PINFU_RON = 30; // 食い平和形ロンの特例 (20符ちょうど → 30)

/** 雀頭が役牌 (三元牌 / 自風 / 場風) なら +2。連風 (自風=場風) でも +2 のまま */
function pairFu(pair: Meld, ctx: FuContext): number {
  const id = pair.tiles[0]!;
  if (isDragon(id) || id === ctx.seatWind || id === ctx.roundWind) {
    return FU_YAKUHAI_PAIR;
  }
  return 0;
}

/**
 * 刻子/槓子1つの符。中張明刻 2 を基準に、么九で×2・暗で×2・カンで×4。
 *   明刻 2/4, 暗刻 4/8, 明槓・加槓 8/16, 暗槓 16/32 (中張/么九)
 * isConcealedRon = 門前刻子に和了牌が入るロン (シャンポンのロン) → 明刻扱い。
 */
function tripletFu(
  meld: Meld,
  calledKind: CalledMeldKind | null,
  isConcealedRon: boolean,
): number {
  let fu = FU_MINKO;
  if (isYaochu(meld.tiles[0]!)) fu *= 2;
  const isConcealed = (calledKind === null && !isConcealedRon) || calledKind === "ankan";
  if (isConcealed) fu *= 2;
  if (calledKind === "minkan" || calledKind === "kakan" || calledKind === "ankan") fu *= 4;
  return fu;
}

/**
 * 1つの (分解, 和了牌配置) の符。10符単位切り上げ済みの値を返す。
 * 七対子はここを通さず SEVEN_PAIRS_FU、国士無双 (役満) は符不問 (judge.ts 参照)。
 * 平和ロン 20+10=30 / 平和ツモ 20 は専用分岐なしで自然に出る (isPinfu はツモ符抑制のみ)。
 */
export function calcFu(
  decomp: Decomposition,
  calledMelds: MeldLike[],
  winningTileId: TileId,
  placement: WinPlacement,
  ctx: FuContext,
): number {
  const calledKinds = partitionMelds(decomp, calledMelds);
  let fu = FU_BASE;
  if (ctx.isMenzen && !ctx.isTsumo) fu += FU_MENZEN_RON;
  if (ctx.isTsumo && !ctx.isPinfu) fu += FU_TSUMO;
  if (
    placement.waitShape === "kanchan" ||
    placement.waitShape === "penchan" ||
    placement.waitShape === "tanki"
  ) {
    fu += FU_BAD_WAIT;
  }
  fu += pairFu(decomp.pair, ctx);
  decomp.melds.forEach((m, i) => {
    if (m.kind !== "pon") return; // 順子は 0符
    const isConcealedRon = placement.meldIndex === i && !ctx.isTsumo;
    fu += tripletFu(m, calledKinds[i] ?? null, isConcealedRon);
  });
  // 食い平和形ロン: 加符が一切なく 20符ちょうどになる手は 30符に引き上げる。
  // 門前は対象外 (平和ツモの 20符を保つ)。食い平和形ツモは 20+2=22 → 30 と自然に切り上がる
  if (!ctx.isMenzen && !ctx.isTsumo && fu === FU_BASE) return FU_OPEN_PINFU_RON;
  return Math.ceil(fu / 10) * 10;
}
