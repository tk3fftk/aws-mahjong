import { describe, it, expect } from "vitest";
import { calcScore } from "./score";

describe("calcScore / 子のロン", () => {
  it("子・1飜・ロン = 放銃者から 1000", () => {
    expect(calcScore({ totalHan: 1, isDealer: false, isTsumo: false })).toEqual({
      kind: "ron",
      fromDiscarder: 1000,
      total: 1000,
    });
  });

  it("子・6飜(跳満)・ロン = 12000", () => {
    expect(calcScore({ totalHan: 6, isDealer: false, isTsumo: false }).total).toBe(12000);
  });

  it("子・役満(13飜)・ロン = 32000", () => {
    expect(calcScore({ totalHan: 13, isDealer: false, isTsumo: false }).total).toBe(32000);
  });
});

describe("calcScore / 子のツモ", () => {
  it("子・1飜・ツモ = 親 500 + 子 500×2 = 1500", () => {
    expect(calcScore({ totalHan: 1, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 500,
      fromEachKo: 500,
      total: 1500,
    });
  });

  it("子・3飜・ツモ = 親 2000 + 子 1000×2 = 4000", () => {
    expect(calcScore({ totalHan: 3, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 2000,
      fromEachKo: 1000,
      total: 4000,
    });
  });

  it("子・5飜・ツモ = 親 4000 + 子 2000×2 = 8000", () => {
    expect(calcScore({ totalHan: 5, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 4000,
      fromEachKo: 2000,
      total: 8000,
    });
  });
});

describe("calcScore / 親のロン・ツモ", () => {
  it("親・1飜・ロン = 放銃者から 1500", () => {
    expect(calcScore({ totalHan: 1, isDealer: true, isTsumo: false })).toEqual({
      kind: "ron",
      fromDiscarder: 1500,
      total: 1500,
    });
  });

  it("親・1飜・ツモ = 子3人から各 1000 = 3000", () => {
    expect(calcScore({ totalHan: 1, isDealer: true, isTsumo: true })).toEqual({
      kind: "tsumo-dealer",
      fromEachKo: 1000,
      total: 3000,
    });
  });

  it("親・5飜・ツモ = 子3人から各 4000 = 12000", () => {
    expect(calcScore({ totalHan: 5, isDealer: true, isTsumo: true })).toEqual({
      kind: "tsumo-dealer",
      fromEachKo: 4000,
      total: 12000,
    });
  });
});

describe("calcScore / 役満", () => {
  it("親・役満(13飜)・ロン = 48000", () => {
    expect(calcScore({ totalHan: 13, isDealer: true, isTsumo: false }).total).toBe(48000);
  });

  it("親・役満・ツモ = 子3人から各 16000 = 48000", () => {
    expect(calcScore({ totalHan: 13, isDealer: true, isTsumo: true })).toEqual({
      kind: "tsumo-dealer",
      fromEachKo: 16000,
      total: 48000,
    });
  });

  it("子・役満・ツモ = 親 16000 + 子 8000×2 = 32000", () => {
    expect(calcScore({ totalHan: 13, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 16000,
      fromEachKo: 8000,
      total: 32000,
    });
  });
});
