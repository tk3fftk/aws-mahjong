import type { Tile, WinForm, YakuResult, SeatWind } from "../types";
import { isYaochu } from "../tiles";
import { YAKUMAN_HAN_THRESHOLD } from "../score";
import { judgeStandardYakus, type YakuContext } from "./standard";
import { detectAwsYakus } from "./aws-pattern";
import { isAwsYakuId } from "./aws-classification";

export interface JudgeResult {
  yakus: YakuResult[];
  totalHan: number;
  isYakuman: boolean;
}

export interface JudgeContext {
  isTsumo: boolean;
  isMenzen: boolean;
  seatWind: SeatWind;
  roundWind: SeatWind;
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
    return { yakus, totalHan: YAKUMAN_HAN_THRESHOLD, isYakuman: true };
  }

  if (winForm.kind === "seven-pairs") {
    const yakus: YakuResult[] = [
      { id: "chiitoitsu", name: "七対子", han: 2 },
    ];
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
    return finalize(yakus);
  }

  // 標準形: 全分解を試して合計飜が最大の組合せを採用
  let best: YakuResult[] = [];
  let bestHan = -1;
  for (const decomp of winForm.decompositions) {
    const standardCtx: YakuContext = {
      isTsumo: ctx.isTsumo,
      isMenzen: ctx.isMenzen,
      seatWind: ctx.seatWind,
      roundWind: ctx.roundWind,
    };
    const stdYakus = judgeStandardYakus(decomp, standardCtx);
    const awsYakus = detectAwsYakus(tileIds, winForm, { isMenzen: ctx.isMenzen });
    const combined = [...stdYakus, ...awsYakus];
    const han = combined.reduce((sum, y) => sum + y.han, 0);
    if (han > bestHan) {
      bestHan = han;
      best = combined;
    }
  }
  return finalize(best);
}

function finalize(yakus: YakuResult[]): JudgeResult {
  const totalHan = yakus.reduce((sum, y) => sum + y.han, 0);
  const isYakuman = yakus.some((y) => y.han >= YAKUMAN_HAN_THRESHOLD);
  return { yakus, totalHan, isYakuman };
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
