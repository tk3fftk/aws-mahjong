// 役満の飜数閾値。これ以上の han は役満扱いとして単一料金 (32000/48000) になる。
export const YAKUMAN_HAN_THRESHOLD = 13;

export interface ScoreInput {
  totalHan: number;
  fu: number;
  isDealer: boolean;
  isTsumo: boolean;
  honba?: number; // 本場数 (連荘で増える)。省略時 0。ツモは各支払者 +100×本場、ロンは放銃者 +300×本場
}

/**
 * 支払い内訳。total は常に各支払者の合計と一致する。
 *   tsumo-dealer: 親ツモ。子3人が fromEachKo ずつ支払う
 *   tsumo-ko:     子ツモ。親が fromDealer、他の子2人が fromEachKo ずつ支払う
 *   ron:          放銃者1人が fromDiscarder を支払う
 */
export type ScorePayments =
  | { kind: "tsumo-dealer"; fromEachKo: number; total: number }
  | { kind: "tsumo-ko"; fromDealer: number; fromEachKo: number; total: number }
  | { kind: "ron"; fromDiscarder: number; total: number };

// 4人麻雀の子の人数 (親ツモの支払者数 / 子ツモの「他の子」は NUM_KO - 1)
const NUM_KO = 3;

// 満貫以上の基本点 (han で固定され fu は見ない)
const BASE_MANGAN = 2000;
const BASE_HANEMAN = 3000;
const BASE_BAIMAN = 4000;
const BASE_SANBAIMAN = 6000;
const BASE_YAKUMAN = 8000;

/**
 * 標準リーチ麻雀式の基本点: base = fu × 2^(2+han)、満貫以上は飜で固定。
 * 公式 rule.html の飜ベース点数表からは4飜以下で意図的に逸脱する (D-014)。
 * fu より先に han≥6 の段階を判定する: 国士無双は fu=0 (符不問) で渡るため。
 */
function basePoints(han: number, fu: number): number {
  if (han >= YAKUMAN_HAN_THRESHOLD) return BASE_YAKUMAN;
  if (han >= 11) return BASE_SANBAIMAN;
  if (han >= 8) return BASE_BAIMAN;
  if (han >= 6) return BASE_HANEMAN;
  return Math.min(fu * 2 ** (2 + han), BASE_MANGAN);
}

/** 各支払いを100点単位に切り上げる */
function ceil100(points: number): number {
  return Math.ceil(points / 100) * 100;
}

export function calcScore(input: ScoreInput): ScorePayments {
  const base = basePoints(input.totalHan, input.fu);
  // 本場ボーナス: 切り上げ後の基本点に加算 (慣例)。ツモは支払者1人あたり 100×本場、ロンは 300×本場。
  const honba = input.honba ?? 0;
  const tsumoBonus = 100 * honba;
  const ronBonus = 300 * honba;
  if (input.isTsumo && input.isDealer) {
    const fromEachKo = ceil100(base * 2) + tsumoBonus;
    return { kind: "tsumo-dealer", fromEachKo, total: fromEachKo * NUM_KO };
  }
  if (input.isTsumo) {
    const fromDealer = ceil100(base * 2) + tsumoBonus;
    const fromEachKo = ceil100(base) + tsumoBonus;
    return {
      kind: "tsumo-ko",
      fromDealer,
      fromEachKo,
      total: fromDealer + fromEachKo * (NUM_KO - 1),
    };
  }
  const fromDiscarder = ceil100(input.isDealer ? base * 6 : base * 4) + ronBonus;
  return { kind: "ron", fromDiscarder, total: fromDiscarder };
}
