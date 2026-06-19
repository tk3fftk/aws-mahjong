import { describe, it, expect } from "vitest";
import { calcScore } from "./score";

describe("calcScore / 子のロン", () => {
  it("子・1飜30符・ロン = 放銃者から 1000", () => {
    expect(calcScore({ totalHan: 1, fu: 30, isDealer: false, isTsumo: false })).toEqual({
      kind: "ron",
      fromDiscarder: 1000,
      total: 1000,
    });
  });

  it("子・1飜40符・ロン = 1300 (1280 の100点切り上げ)", () => {
    expect(calcScore({ totalHan: 1, fu: 40, isDealer: false, isTsumo: false }).total).toBe(1300);
  });

  it("子・2飜25符・ロン = 1600 (七対子相当)", () => {
    expect(calcScore({ totalHan: 2, fu: 25, isDealer: false, isTsumo: false }).total).toBe(1600);
  });

  it("子・4飜40符・ロン = 8000 (base 2560 → cap 2000 = 満貫)", () => {
    expect(calcScore({ totalHan: 4, fu: 40, isDealer: false, isTsumo: false }).total).toBe(8000);
  });

  it("子・3飜70符・ロン = 8000 (base 2240 → cap)", () => {
    expect(calcScore({ totalHan: 3, fu: 70, isDealer: false, isTsumo: false }).total).toBe(8000);
  });

  it("子・6飜(跳満)・ロン = 12000", () => {
    expect(calcScore({ totalHan: 6, fu: 30, isDealer: false, isTsumo: false }).total).toBe(12000);
  });

  it("子・役満(13飜)・ロン = 32000", () => {
    expect(calcScore({ totalHan: 13, fu: 30, isDealer: false, isTsumo: false }).total).toBe(32000);
  });
});

describe("calcScore / 子のツモ", () => {
  it("子・1飜30符・ツモ = 親 500 + 子 300×2 = 1100", () => {
    expect(calcScore({ totalHan: 1, fu: 30, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 500,
      fromEachKo: 300,
      total: 1100,
    });
  });

  it("子・2飜20符・ツモ = 親 700 + 子 400×2 = 1500 (平和ツモ相当)", () => {
    expect(calcScore({ totalHan: 2, fu: 20, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 700,
      fromEachKo: 400,
      total: 1500,
    });
  });

  it("子・3飜20符・ツモ = 親 1300 + 子 700×2 = 2700", () => {
    expect(calcScore({ totalHan: 3, fu: 20, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 1300,
      fromEachKo: 700,
      total: 2700,
    });
  });

  it("子・3飜30符・ツモ = 親 2000 + 子 1000×2 = 4000", () => {
    expect(calcScore({ totalHan: 3, fu: 30, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 2000,
      fromEachKo: 1000,
      total: 4000,
    });
  });

  it("子・5飜(満貫)・ツモ = 親 4000 + 子 2000×2 = 8000", () => {
    expect(calcScore({ totalHan: 5, fu: 30, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 4000,
      fromEachKo: 2000,
      total: 8000,
    });
  });
});

describe("calcScore / 親のロン・ツモ", () => {
  it("親・1飜30符・ロン = 放銃者から 1500", () => {
    expect(calcScore({ totalHan: 1, fu: 30, isDealer: true, isTsumo: false })).toEqual({
      kind: "ron",
      fromDiscarder: 1500,
      total: 1500,
    });
  });

  it("親・2飜30符・ロン = 2900 (2880 の100点切り上げ)", () => {
    expect(calcScore({ totalHan: 2, fu: 30, isDealer: true, isTsumo: false }).total).toBe(2900);
  });

  it("親・4飜30符・ロン = 11600", () => {
    expect(calcScore({ totalHan: 4, fu: 30, isDealer: true, isTsumo: false }).total).toBe(11600);
  });

  it("親・1飜30符・ツモ = 子3人から各 500 = 1500", () => {
    expect(calcScore({ totalHan: 1, fu: 30, isDealer: true, isTsumo: true })).toEqual({
      kind: "tsumo-dealer",
      fromEachKo: 500,
      total: 1500,
    });
  });

  it("親・5飜(満貫)・ツモ = 子3人から各 4000 = 12000", () => {
    expect(calcScore({ totalHan: 5, fu: 30, isDealer: true, isTsumo: true })).toEqual({
      kind: "tsumo-dealer",
      fromEachKo: 4000,
      total: 12000,
    });
  });
});

describe("calcScore / 満貫以上の段階境界 (fu 非依存)", () => {
  it("子・5飜30符・ロン = 8000 (満貫: base 3840 → cap 2000)", () => {
    expect(calcScore({ totalHan: 5, fu: 30, isDealer: false, isTsumo: false }).total).toBe(8000);
  });

  it("子・7飜・ロン = 12000 (跳満)", () => {
    expect(calcScore({ totalHan: 7, fu: 30, isDealer: false, isTsumo: false }).total).toBe(12000);
  });

  it("子・8飜・ロン = 16000 (倍満)", () => {
    expect(calcScore({ totalHan: 8, fu: 30, isDealer: false, isTsumo: false }).total).toBe(16000);
  });

  it("子・10飜・ロン = 16000 (倍満)", () => {
    expect(calcScore({ totalHan: 10, fu: 30, isDealer: false, isTsumo: false }).total).toBe(16000);
  });

  it("子・11飜・ロン = 24000 (三倍満)", () => {
    expect(calcScore({ totalHan: 11, fu: 30, isDealer: false, isTsumo: false }).total).toBe(24000);
  });

  it("子・12飜・ロン = 24000 (三倍満)", () => {
    expect(calcScore({ totalHan: 12, fu: 30, isDealer: false, isTsumo: false }).total).toBe(24000);
  });

  it("子・13飜0符・ロン = 32000 (役満は fu を見ない: 国士の fu=0 を安全に)", () => {
    expect(calcScore({ totalHan: 13, fu: 0, isDealer: false, isTsumo: false }).total).toBe(32000);
  });
});

describe("calcScore / 本場 (honba)", () => {
  it("子・1飜30符・ロン・1本場 = 1000 + 300 = 1300", () => {
    expect(
      calcScore({ totalHan: 1, fu: 30, isDealer: false, isTsumo: false, honba: 1 }),
    ).toEqual({ kind: "ron", fromDiscarder: 1300, total: 1300 });
  });

  it("子・1飜30符・ロン・2本場 = 1000 + 600 = 1600", () => {
    expect(
      calcScore({ totalHan: 1, fu: 30, isDealer: false, isTsumo: false, honba: 2 }).total,
    ).toBe(1600);
  });

  it("親・1飜30符・ロン・1本場 = 1500 + 300 = 1800", () => {
    expect(
      calcScore({ totalHan: 1, fu: 30, isDealer: true, isTsumo: false, honba: 1 }).total,
    ).toBe(1800);
  });

  it("子・1飜30符・ツモ・1本場 = 親 600 + 子 400×2 = 1400 (各 +100)", () => {
    expect(
      calcScore({ totalHan: 1, fu: 30, isDealer: false, isTsumo: true, honba: 1 }),
    ).toEqual({ kind: "tsumo-ko", fromDealer: 600, fromEachKo: 400, total: 1400 });
  });

  it("親・1飜30符・ツモ・1本場 = 子3人から各 600 = 1800 (各 +100)", () => {
    expect(
      calcScore({ totalHan: 1, fu: 30, isDealer: true, isTsumo: true, honba: 1 }),
    ).toEqual({ kind: "tsumo-dealer", fromEachKo: 600, total: 1800 });
  });

  it("honba 省略時は 0 本場と同じ (回帰)", () => {
    expect(calcScore({ totalHan: 1, fu: 30, isDealer: false, isTsumo: false })).toEqual(
      calcScore({ totalHan: 1, fu: 30, isDealer: false, isTsumo: false, honba: 0 }),
    );
  });
});

describe("calcScore / 役満", () => {
  it("親・役満(13飜)・ロン = 48000", () => {
    expect(calcScore({ totalHan: 13, fu: 30, isDealer: true, isTsumo: false }).total).toBe(48000);
  });

  it("親・役満・ツモ = 子3人から各 16000 = 48000", () => {
    expect(calcScore({ totalHan: 13, fu: 30, isDealer: true, isTsumo: true })).toEqual({
      kind: "tsumo-dealer",
      fromEachKo: 16000,
      total: 48000,
    });
  });

  it("子・役満・ツモ = 親 16000 + 子 8000×2 = 32000", () => {
    expect(calcScore({ totalHan: 13, fu: 30, isDealer: false, isTsumo: true })).toEqual({
      kind: "tsumo-ko",
      fromDealer: 16000,
      fromEachKo: 8000,
      total: 32000,
    });
  });
});
