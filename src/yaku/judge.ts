import type { MeldLike, Tile, TileId, WinForm, YakuResult, SeatWind } from "../types";
import { isYaochu } from "../tiles";
import { YAKUMAN_HAN_THRESHOLD } from "../score";
import { SEVEN_PAIRS_FU, calcFu, enumerateWinPlacements } from "../fu";
import { decomposeStandard } from "../winning/decompose";
import { judgeStandardYakus, type YakuContext } from "./standard";
import { detectAwsYakus } from "./aws-pattern";
import { isAwsYakuId } from "./aws-classification";

export interface JudgeResult {
  yakus: YakuResult[];
  totalHan: number;
  isYakuman: boolean;
  fu: number | null; // 七対子=25 / 標準形=計算値 / 国士 (役満・符不問)・winningTileId null 時=null
}

export interface JudgeContext {
  isTsumo: boolean;
  isMenzen: boolean;
  seatWind: SeatWind;
  roundWind: SeatWind;
  isRiichi?: boolean; // 省略時 false
  isIppatsu?: boolean; // 省略時 false。isRiichi=true のときのみ有効
  // null = 適格性チェック専用パス (符を計算しない)。和了可否ゲートは AWS役の有無 +
  // フリテンのみで符非依存のため、和了牌が確定しない呼び出し (CPU の打牌判断等) は null でよい。
  winningTileId: TileId | null;
  melds: MeldLike[]; // 副露 (カンの元 kind を保持)。門前は []
}

/**
 * リーチ・一発は分解非依存なので judge.ts のトップレベルで付与する (七対子・標準形の両方に効く)。
 * 国士無双 = 役満には付けない (点数が変わらず表示も純粋になるため。kokushi 分岐は早期 return で除外)。
 */
function riichiYakus(ctx: JudgeContext): YakuResult[] {
  if (!ctx.isRiichi) return [];
  const out: YakuResult[] = [{ id: "riichi", name: "リーチ", han: 1 }];
  if (ctx.isIppatsu) out.push({ id: "ippatsu", name: "一発", han: 1 });
  return out;
}

export function judgeYaku(
  winForm: WinForm,
  hand: Tile[],
  ctx: JudgeContext,
): JudgeResult {
  const tileIds = hand.map((t) => t.id);

  if (winForm.kind === "thirteen-orphans") {
    const yakus: YakuResult[] = [
      { id: "kokushi", name: "国士無双", han: YAKUMAN_HAN_THRESHOLD },
    ];
    return { yakus, totalHan: YAKUMAN_HAN_THRESHOLD, isYakuman: true, fu: null };
  }

  if (winForm.kind === "seven-pairs") {
    // 二盃口形 (七対子だが標準形にも分解できる手) は、高点法で標準形(二盃口3飜+) が
    // 七対子(2飜) を必ず上回るため標準形として評価する。標準分解できる7対子は構造上
    // 必ず二盃口になる (各牌2枚 → 面子は同一順子のペア)。
    const ryanpeikouDecomps = decomposeStandard(tileIds);
    if (ryanpeikouDecomps.length > 0) {
      return judgeYaku(
        { kind: "standard", decompositions: ryanpeikouDecomps },
        hand,
        ctx,
      );
    }
    const yakus: YakuResult[] = [
      { id: "chiitoitsu", name: "七対子", han: 2 },
    ];
    // 七対子は構造上常に門前 (canWin が副露ありを弾く) なのでツモなら門前清自摸和が複合する
    if (ctx.isMenzen && ctx.isTsumo) {
      yakus.push({ id: "menzen-tsumo", name: "門前清自摸和", han: 1 });
    }
    // tanyao/honitsu/chinitsu も七対子に複合可
    if (tileIds.every((id) => !isYaochu(id))) {
      yakus.push({ id: "tanyao", name: "断么九", han: 1 });
    }
    const suitSet = new Set(tileIds.map((t) => t[1]));
    const numberSuits = [...suitSet].filter((s) => s !== "z");
    const hasHonor = suitSet.has("z");
    if (numberSuits.length === 1) {
      if (!hasHonor) {
        yakus.push({ id: "chinitsu", name: "清一色", han: ctx.isMenzen ? 6 : 5 });
      } else {
        yakus.push({ id: "honitsu", name: "混一色", han: ctx.isMenzen ? 3 : 2 });
      }
    }
    // AWS固有役 (dr-architecture など 七対子型)
    const awsYakus = detectAwsYakus(tileIds, winForm, { isMenzen: ctx.isMenzen });
    yakus.push(...awsYakus);
    yakus.push(...riichiYakus(ctx));
    return finalize(yakus, SEVEN_PAIRS_FU);
  }

  // 標準形: (分解 × 和了牌配置) ごとに (han, fu) を評価し、han 降順 → fu 降順で最良を採用 (高点法)。
  // 辞書式比較で十分な根拠: han 固定なら支払額は fu に単調非減少。han が1つ大きければ base は
  // 2倍になり fu 差 (高々数十符) では逆転しない。満貫キャップ帯での fu タイは支払額同値。
  const standardCtx: YakuContext = {
    isTsumo: ctx.isTsumo,
    isMenzen: ctx.isMenzen,
    seatWind: ctx.seatWind,
    roundWind: ctx.roundWind,
  };
  // AWS固有役は牌の multiset のみで決まり分解非依存 → ループ外で一度だけ判定
  const awsYakus = detectAwsYakus(tileIds, winForm, { isMenzen: ctx.isMenzen });
  // 冗長化(AWS一盃口)が立つ手では標準の一盃口/二盃口を複合させない (yaku.json: redundancy 参照)。
  // redundancy は AWS役なので awsYakus 側にのみ現れ、分解・配置に依存しない。
  const hasRedundancy = awsYakus.some((y) => y.id === "redundancy");
  let best: { yakus: YakuResult[]; han: number; fu: number } = { yakus: [], han: -1, fu: -1 };
  for (const decomp of winForm.decompositions) {
    // 和了牌は常に門前部分にある (ロン牌は concealed に合流済み、ツモ牌は手牌内) ため、
    // winningTileId が非 null なら配置は必ず1つ以上ある。null は適格性パス (配置なし・符なし)
    const placements = ctx.winningTileId
      ? enumerateWinPlacements(decomp, ctx.melds, ctx.winningTileId)
      : [null];
    for (const p of placements) {
      const stdYakus = judgeStandardYakus(decomp, standardCtx, p?.waitShape ?? null);
      const combined = [...stdYakus, ...awsYakus];
      const effective = hasRedundancy
        ? combined.filter((y) => y.id !== "iipeiko" && y.id !== "ryanpeikou")
        : combined;
      const han = effective.reduce((sum, y) => sum + y.han, 0);
      const fu = p
        ? calcFu(decomp, ctx.melds, ctx.winningTileId!, p, {
            ...standardCtx,
            isPinfu: stdYakus.some((y) => y.id === "pinfu"),
          })
        : -1;
      if (han > best.han || (han === best.han && fu > best.fu)) {
        best = { yakus: effective, han, fu };
      }
    }
  }
  // リーチ・一発は分解非依存の定数加算なので best 選択後に付与する (han の argmax を変えない)
  return finalize([...best.yakus, ...riichiYakus(ctx)], best.fu >= 0 ? best.fu : null);
}

function finalize(yakus: YakuResult[], fu: number | null): JudgeResult {
  const totalHan = yakus.reduce((sum, y) => sum + y.han, 0);
  const isYakuman = yakus.some((y) => y.han >= YAKUMAN_HAN_THRESHOLD);
  return { yakus, totalHan, isYakuman, fu };
}

/**
 * 和了時に AWS役必須条件を満たすか:
 * - 役満 (isYakuman=true) は無条件で OK (国士無双・dr-architecture・aws-all-green 等)
 * - そうでない場合、yakus の中に AWS固有役 ID (aws-classification.ts) が1つでもあれば OK
 */
export function hasAnyAwsYaku(yakus: YakuResult[], isYakuman: boolean): boolean {
  if (isYakuman) return true;
  return yakus.some((y) => isAwsYakuId(y.id));
}

export const canDeclareWin = hasAnyAwsYaku;
