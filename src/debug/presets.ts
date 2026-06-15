import type { RiggedDeal } from "./rigged";

/**
 * debug mode 用の名前付きシナリオ (?debug=riichi 等で呼び出す)。
 * いずれも CPU が「常に先頭牌を打牌」する前提 (rng: () => 0) で意図通りに進行する。
 * 仕込みは game.test.ts で実績のあるリグを流用している。
 */
export const DEBUG_PRESETS: Record<string, RiggedDeal> = {
  // 1z 切りで即リーチ可 (5m/8m 待ち, kiro)。CPU は 7z をツモ切りし、east の次ツモが和了牌 8m。
  // deadWall: 表示牌1枚目=3z (表ドラ0)、裏ドラ表示=4s → 裏ドラ 5s×2
  riichi: {
    east: "555z234m67m234p55s1z",
    south: "1m4m7m1p4p7p1s4s7s1z2z3z4z",
    west: "2m9m3p6p9p2s5s8s9s1z2z4z6z",
    north: "3m6m9m2p5p8p3s6s9s1z3z4z6z",
    wallHead: "7z7z7z8m",
    deadWall: "3z9m9p9s5z4s",
  },
  // 初ツモ 1z を捨てると south が 8m を打ち、ロン可能 (5m/8m 待ち, kiro)
  ron: {
    east: "555z234m67m234p55s1z",
    south: "8m1p4p7p1s4s7s1z2z3z4z5z6z",
    wallHead: "9m",
  },
  // 初ツモ 9s を捨てると south が 1m を打ち、ポン可能 (1m 対子持ち)
  pon: {
    east: "1m1m2p3p4p2s3s4s9p9p1z1z2z9s",
    south: "1m345m345p678s4z4z4z",
  },
  // 初ツモ 9s を捨てると south が 1m を打ち、明カン可能 (1m×3 持ち)
  kan: {
    east: "1m1m1m2p3p4p2s3s4s9p9p1z2z9s",
    south: "1m345m345p678s4z4z4z",
  },
  // 初ツモ 8s を捨てると上家 (north) が 5m を打ち、チー可能 (3m4m/4m6m/6m7m の3択)
  chi: {
    east: "3m4m6m7m9p9p1s1s2z2z3z3z9s8s",
    south: "1p1p2m2m5s5s6s6s7z7z4z4z4z",
    west: "2p2p3p3p4p4p1s2s3s4s4s5z5z",
    north: "5m8p8p8p9m9m6p6p7p7p9s9s5z",
  },
  // 国士無双 (1m 雀頭) を初手ツモ和了できる役満手 (点数計算の確認用)
  bigwin: {
    east: "1m9m1p9p1s9s1z2z3z4z5z6z7z1m",
  },
  // 初ツモが待ち牌 5m。これを捨てるとフリテンになり、south の 8m をロンできない
  furiten: {
    east: "555z234m67m234p55s5m",
    south: "8m999m1p1p2p2p3p3p4s4s5z",
    west: "1p1p6p6p7p7p8p1s1s2s2s9s7z",
    north: "1z1z3s3s5s5s6s6s8s8s9s9s7z",
    wallHead: "9p9p9p9p",
  },
};
