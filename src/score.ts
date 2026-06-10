// 役満の飜数閾値。これ以上の han は役満扱いとして単一料金 (32000/48000) になる。
export const YAKUMAN_HAN_THRESHOLD = 13;

export interface ScoreInput {
  totalHan: number;
  isDealer: boolean;
  isTsumo: boolean;
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

export function calcScore(input: ScoreInput): ScorePayments {
  const entry = pickEntry(input.totalHan);
  if (input.isTsumo && input.isDealer) {
    return {
      kind: "tsumo-dealer",
      fromEachKo: entry.oya_tsumo,
      total: entry.oya_tsumo * NUM_KO,
    };
  }
  if (input.isTsumo) {
    const [fromDealer, fromEachKo] = entry.ko_tsumo;
    return {
      kind: "tsumo-ko",
      fromDealer,
      fromEachKo,
      total: fromDealer + fromEachKo * (NUM_KO - 1),
    };
  }
  const fromDiscarder = input.isDealer ? entry.oya_ron : entry.ko_ron;
  return { kind: "ron", fromDiscarder, total: fromDiscarder };
}
