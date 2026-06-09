import { describe, it, expect } from "vitest";
import { judgeStandardYakus, type YakuContext } from "./standard";
import { decomposeStandard } from "../winning/decompose";
import { mpszToTiles } from "../tiles";

function ctx(over: Partial<YakuContext> = {}): YakuContext {
  return {
    isTsumo: true,
    isMenzen: true,
    seatWind: "1z",
    roundWind: "1z",
    ...over,
  };
}

function judgeFirstDecomp(mpsz: string, c: YakuContext) {
  const tiles = mpszToTiles(mpsz);
  const decomps = decomposeStandard(tiles);
  if (decomps.length === 0) throw new Error("not decomposable: " + mpsz);
  // 標準役判定は最初の分解で確認 (実運用では judge.ts が全分解を試す)
  return judgeStandardYakus(decomps[0]!, c);
}

describe("judgeStandardYakus / 平和(pinfu)", () => {
  it("4順子 + 役牌でない雀頭 + 門前 で成立 (1飜)", () => {
    const yakus = judgeFirstDecomp("123456789m123p55s", ctx());
    expect(yakus.find((y) => y.id === "pinfu")?.han).toBe(1);
  });

  it("雀頭が場風(1z)だと不成立", () => {
    const yakus = judgeFirstDecomp("123456789m234p11z", ctx({ roundWind: "1z" }));
    expect(yakus.find((y) => y.id === "pinfu")).toBeUndefined();
  });

  it("鳴いていると(門前でない)不成立", () => {
    const yakus = judgeFirstDecomp("123456789m123p55s", ctx({ isMenzen: false }));
    expect(yakus.find((y) => y.id === "pinfu")).toBeUndefined();
  });

  it("刻子を含むと不成立", () => {
    const yakus = judgeFirstDecomp("111m234m789m123p55s", ctx());
    expect(yakus.find((y) => y.id === "pinfu")).toBeUndefined();
  });
});

describe("judgeStandardYakus / 断么九(tanyao)", () => {
  it("全て 2-8 の数牌で成立 (1飜)", () => {
    const yakus = judgeFirstDecomp("234m567m234p567p55s", ctx());
    expect(yakus.find((y) => y.id === "tanyao")?.han).toBe(1);
  });

  it("1m を含むと不成立", () => {
    const yakus = judgeFirstDecomp("123m567m234p567p55s", ctx());
    expect(yakus.find((y) => y.id === "tanyao")).toBeUndefined();
  });

  it("字牌を含むと不成立", () => {
    const yakus = judgeFirstDecomp("234m567m234p222s55z", ctx());
    expect(yakus.find((y) => y.id === "tanyao")).toBeUndefined();
  });
});

describe("judgeStandardYakus / 風牌(wind)", () => {
  it("自風(2z=南家)の刻子で「自風南」1飜", () => {
    const yakus = judgeFirstDecomp("222z234m567m234p55s", ctx({ seatWind: "2z", roundWind: "1z" }));
    expect(yakus.find((y) => y.id === "seat-wind")?.han).toBe(1);
  });

  it("東場で東家の場合、1z刻子は場風+自風で2飜分", () => {
    const yakus = judgeFirstDecomp("111z234m567m234p55s", ctx({ seatWind: "1z", roundWind: "1z" }));
    // 場風と自風が同じ場合、伝統麻雀では 2 役 (どちらも1飜ずつ計上)
    const han = yakus.filter((y) => y.id === "round-wind" || y.id === "seat-wind").reduce((s, y) => s + y.han, 0);
    expect(han).toBe(2);
  });

  it("4z(北)刻子は東場の南家には役にならない", () => {
    const yakus = judgeFirstDecomp("444z234m567m234p55s", ctx({ seatWind: "2z", roundWind: "1z" }));
    expect(yakus.find((y) => y.id === "round-wind" || y.id === "seat-wind")).toBeUndefined();
  });
});

describe("judgeStandardYakus / 対々和(toitoi)", () => {
  it("4面子すべて刻子で 2飜", () => {
    const yakus = judgeFirstDecomp("111m222m333p444s55z", ctx());
    expect(yakus.find((y) => y.id === "toitoi")?.han).toBe(2);
  });

  it("順子があると不成立", () => {
    const yakus = judgeFirstDecomp("123m222m333p444s55z", ctx());
    expect(yakus.find((y) => y.id === "toitoi")).toBeUndefined();
  });
});

describe("judgeStandardYakus / 混一色・清一色", () => {
  it("数牌1種+字牌 で混一色 3飜(門前)", () => {
    const yakus = judgeFirstDecomp("123456789m111z22z", ctx());
    expect(yakus.find((y) => y.id === "honitsu")?.han).toBe(3);
    expect(yakus.find((y) => y.id === "chinitsu")).toBeUndefined();
  });

  it("数牌1種のみ で清一色 6飜(門前) かつ 混一色は付かない", () => {
    const yakus = judgeFirstDecomp("123456789m11122m", ctx());
    expect(yakus.find((y) => y.id === "chinitsu")?.han).toBe(6);
    expect(yakus.find((y) => y.id === "honitsu")).toBeUndefined();
  });

  it("鳴き時は混一色 2飜・清一色 5飜", () => {
    const honitsu = judgeFirstDecomp("123456789m111z22z", ctx({ isMenzen: false }));
    expect(honitsu.find((y) => y.id === "honitsu")?.han).toBe(2);
    const chin = judgeFirstDecomp("123456789m11122m", ctx({ isMenzen: false }));
    expect(chin.find((y) => y.id === "chinitsu")?.han).toBe(5);
  });
});

describe("judgeStandardYakus / 門前清自摸和", () => {
  it("ツモ + 門前 で 1飜", () => {
    const yakus = judgeFirstDecomp("123456789m123p55s", ctx({ isTsumo: true, isMenzen: true }));
    expect(yakus.find((y) => y.id === "menzen-tsumo")?.han).toBe(1);
  });

  it("鳴き手のツモは付かない", () => {
    const yakus = judgeFirstDecomp("123456789m123p55s", ctx({ isTsumo: true, isMenzen: false }));
    expect(yakus.find((y) => y.id === "menzen-tsumo")).toBeUndefined();
  });
});

describe("judgeStandardYakus / 5z/6z/7z は標準側ではスキップ (AWS固有役側で判定)", () => {
  it("5z刻子があっても standard.ts は 'dragon-white' 等を返さない (重複付与防止)", () => {
    const yakus = judgeFirstDecomp("555z234m567m234p55s", ctx());
    expect(yakus.find((y) => y.id.startsWith("dragon-"))).toBeUndefined();
  });
});
