// 役満の飜数閾値。これ以上の han は役満扱いとして単一料金 (32000/48000) になる。
export const YAKUMAN_HAN_THRESHOLD = 13;

export interface ScoreInput {
  totalHan: number;
  isDealer: boolean;
  isTsumo: boolean;
}

export interface ScoreOutput {
  winnerGain: number;
  loserPay: number;
}

interface Entry {
  han: number;
  /** 子(ロン): 子が放銃者から得る点 */
  ko_ron: number;
  /** 子(ツモ): [親からの分, 子からの分] */
  ko_tsumo: [number, number];
  /** 親(ロン) */
  oya_ron: number;
  /** 親(ツモ): 子1人あたりの分 */
  oya_tsumo: number;
}

// ko_tsumo は [親からの分, 子からの分] の順 (標準麻雀の慣例に従う)
const TABLE: Entry[] = [
  { han: 1,  ko_ron: 1000,  ko_tsumo: [500, 500],    oya_ron: 1500,  oya_tsumo: 1000 },
  { han: 2,  ko_ron: 2000,  ko_tsumo: [1000, 1000],  oya_ron: 3000,  oya_tsumo: 1500 },
  { han: 3,  ko_ron: 3000,  ko_tsumo: [2000, 1000],  oya_ron: 5000,  oya_tsumo: 2000 },
  { han: 4,  ko_ron: 5000,  ko_tsumo: [3000, 1500],  oya_ron: 8000,  oya_tsumo: 3000 },
  { han: 5,  ko_ron: 8000,  ko_tsumo: [4000, 2000],  oya_ron: 12000, oya_tsumo: 4000 },
  { han: 6,  ko_ron: 12000, ko_tsumo: [6000, 3000],  oya_ron: 18000, oya_tsumo: 6000 },
  { han: 8,  ko_ron: 16000, ko_tsumo: [8000, 4000],  oya_ron: 24000, oya_tsumo: 8000 },
  { han: 11, ko_ron: 24000, ko_tsumo: [12000, 6000], oya_ron: 36000, oya_tsumo: 12000 },
  { han: YAKUMAN_HAN_THRESHOLD, ko_ron: 32000, ko_tsumo: [16000, 8000], oya_ron: 48000, oya_tsumo: 16000 },
];

function pickEntry(han: number): Entry {
  let chosen = TABLE[0]!;
  for (const e of TABLE) {
    if (han >= e.han) chosen = e;
  }
  return chosen;
}

/**
 * 2人麻雀化:
 *   親ツモ → CPU(子)1人から oya_tsumo × 1 のみ徴収
 *   子ツモ → 親 1人から ko_tsumo[0] のみ徴収 (子分は欠席として無視)
 *   ロン   → 通常通り放銃者1人から徴収
 */
export function calcScore(input: ScoreInput): ScoreOutput {
  const entry = pickEntry(input.totalHan);
  let amount: number;
  if (input.isDealer && input.isTsumo) {
    amount = entry.oya_tsumo;
  } else if (input.isDealer && !input.isTsumo) {
    amount = entry.oya_ron;
  } else if (!input.isDealer && input.isTsumo) {
    amount = entry.ko_tsumo[0];
  } else {
    amount = entry.ko_ron;
  }
  return { winnerGain: amount, loserPay: amount };
}
