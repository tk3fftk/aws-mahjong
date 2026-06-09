import { describe, it, expect } from "vitest";
import { calcScore } from "./score";

describe("calcScore / 子(子家)", () => {
  it("子・1飜・ロン = 1000点", () => {
    expect(calcScore({ totalHan: 1, isDealer: false, isTsumo: false })).toEqual({
      winnerGain: 1000,
      loserPay: 1000,
    });
  });

  it("子・1飜・ツモ = (親 500 + 子 500 で 1000) → 2人麻雀ルールでは相手1人から500のみ", () => {
    expect(calcScore({ totalHan: 1, isDealer: false, isTsumo: true })).toEqual({
      winnerGain: 500,
      loserPay: 500,
    });
  });

  it("子・5飜・ツモ = 親から 4000 を1人徴収", () => {
    // 標準麻雀 ko_tsumo[親分]=4000, ko_tsumo[子分]=2000。2人麻雀では親分のみ徴収
    expect(calcScore({ totalHan: 5, isDealer: false, isTsumo: true })).toEqual({
      winnerGain: 4000,
      loserPay: 4000,
    });
  });
});

describe("calcScore / 親", () => {
  it("親・1飜・ロン = 1500点", () => {
    expect(calcScore({ totalHan: 1, isDealer: true, isTsumo: false })).toEqual({
      winnerGain: 1500,
      loserPay: 1500,
    });
  });

  it("親・1飜・ツモ = CPU から 1000 を1人徴収", () => {
    expect(calcScore({ totalHan: 1, isDealer: true, isTsumo: true })).toEqual({
      winnerGain: 1000,
      loserPay: 1000,
    });
  });

  it("親・5飜・ツモ = 4000を1人徴収", () => {
    expect(calcScore({ totalHan: 5, isDealer: true, isTsumo: true })).toEqual({
      winnerGain: 4000,
      loserPay: 4000,
    });
  });
});

describe("calcScore / 跳満〜役満", () => {
  it("子・6飜(跳満)・ロン = 12000", () => {
    expect(calcScore({ totalHan: 6, isDealer: false, isTsumo: false }).winnerGain).toBe(12000);
  });

  it("子・役満(13飜)・ロン = 32000", () => {
    expect(calcScore({ totalHan: 13, isDealer: false, isTsumo: false }).winnerGain).toBe(32000);
  });

  it("親・役満(13飜)・ロン = 48000", () => {
    expect(calcScore({ totalHan: 13, isDealer: true, isTsumo: false }).winnerGain).toBe(48000);
  });

  it("親・役満・ツモ = 16000を1人徴収 (本来は子3人から各16000の48000)", () => {
    expect(calcScore({ totalHan: 13, isDealer: true, isTsumo: true })).toEqual({
      winnerGain: 16000,
      loserPay: 16000,
    });
  });
});
