import { describe, it, expect } from "vitest";
import { SEVEN_PAIRS_FU, calcFu, enumerateWinPlacements, type FuContext } from "./fu";
import { mpszToTiles } from "./tiles";
import type { Decomposition, Meld, MeldLike } from "./types";

function meld(kind: Meld["kind"], mpsz: string): Meld {
  return { kind, tiles: mpszToTiles(mpsz) };
}

function called(kind: MeldLike["kind"], mpsz: string): MeldLike {
  return { kind, tiles: mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const })) };
}

function decomp(melds: Meld[], pairMpsz: string): Decomposition {
  return { melds, pair: meld("pair", pairMpsz) };
}

describe("enumerateWinPlacements / 単騎・シャンポン", () => {
  it("雀頭の牌 = 和了牌 → tanki (meldIndex: null)", () => {
    const d = decomp(
      [meld("chi", "123m"), meld("chi", "456p"), meld("chi", "567s"), meld("pon", "222p")],
      "99m",
    );
    expect(enumerateWinPlacements(d, [], "9m")).toEqual([
      { waitShape: "tanki", meldIndex: null },
    ]);
  });

  it("門前刻子の牌 = 和了牌 → shanpon", () => {
    const d = decomp(
      [meld("pon", "222m"), meld("chi", "345p"), meld("chi", "567p"), meld("chi", "678s")],
      "99s",
    );
    expect(enumerateWinPlacements(d, [], "2m")).toEqual([
      { waitShape: "shanpon", meldIndex: 0 },
    ]);
  });
});

describe("enumerateWinPlacements / 順子の待ち形分類", () => {
  it("chi 678s の 8s 和了 (残り 67) → ryanmen", () => {
    const d = decomp(
      [meld("chi", "678s"), meld("chi", "123m"), meld("chi", "456p"), meld("pon", "111z")],
      "55p",
    );
    expect(enumerateWinPlacements(d, [], "8s")).toEqual([
      { waitShape: "ryanmen", meldIndex: 0 },
    ]);
  });

  it("chi 234m の 4m 和了 (残り 23) → ryanmen", () => {
    const d = decomp(
      [meld("chi", "234m"), meld("chi", "456p"), meld("chi", "567s"), meld("pon", "111z")],
      "55p",
    );
    expect(enumerateWinPlacements(d, [], "4m")).toEqual([
      { waitShape: "ryanmen", meldIndex: 0 },
    ]);
  });

  it("chi 567p の 6p 和了 (真ん中) → kanchan", () => {
    const d = decomp(
      [meld("chi", "567p"), meld("chi", "123m"), meld("chi", "456s"), meld("pon", "111z")],
      "99m",
    );
    expect(enumerateWinPlacements(d, [], "6p")).toEqual([
      { waitShape: "kanchan", meldIndex: 0 },
    ]);
  });

  it("chi 123m の 2m 和了 (13持ち) → kanchan (辺張ではない)", () => {
    const d = decomp(
      [meld("chi", "123m"), meld("chi", "456p"), meld("chi", "567s"), meld("pon", "111z")],
      "99m",
    );
    expect(enumerateWinPlacements(d, [], "2m")).toEqual([
      { waitShape: "kanchan", meldIndex: 0 },
    ]);
  });

  it("chi 123m の 3m 和了 (12持ち) → penchan", () => {
    const d = decomp(
      [meld("chi", "123m"), meld("chi", "456p"), meld("chi", "567s"), meld("pon", "111z")],
      "99m",
    );
    expect(enumerateWinPlacements(d, [], "3m")).toEqual([
      { waitShape: "penchan", meldIndex: 0 },
    ]);
  });

  it("chi 789s の 7s 和了 (89持ち) → penchan", () => {
    const d = decomp(
      [meld("chi", "789s"), meld("chi", "123m"), meld("chi", "456p"), meld("pon", "111z")],
      "99m",
    );
    expect(enumerateWinPlacements(d, [], "7s")).toEqual([
      { waitShape: "penchan", meldIndex: 0 },
    ]);
  });
});

describe("enumerateWinPlacements / 複数配置と副露除外", () => {
  it("123m と 345m の両方に置ける 3m 和了 → penchan と ryanmen の2件", () => {
    const d = decomp(
      [meld("chi", "123m"), meld("chi", "345m"), meld("chi", "456p"), meld("pon", "111z")],
      "99m",
    );
    expect(enumerateWinPlacements(d, [], "3m")).toEqual([
      { waitShape: "penchan", meldIndex: 0 },
      { waitShape: "ryanmen", meldIndex: 1 },
    ]);
  });

  it("副露チー 234m には和了牌 3m を置けない (雀頭のみ候補)", () => {
    const d = decomp(
      [meld("chi", "234m"), meld("chi", "567p"), meld("pon", "888s"), meld("chi", "678m")],
      "33m",
    );
    expect(enumerateWinPlacements(d, [called("chi", "234m")], "3m")).toEqual([
      { waitShape: "tanki", meldIndex: null },
    ]);
  });

  it("同一チー2組 (副露1+門前1): 副露ぶんは除外され門前側だけに置ける", () => {
    const d = decomp(
      [meld("chi", "234m"), meld("chi", "234m"), meld("chi", "567p"), meld("pon", "888s")],
      "99s",
    );
    const placements = enumerateWinPlacements(d, [called("chi", "234m")], "3m");
    expect(placements).toHaveLength(1);
    expect(placements[0]!.waitShape).toBe("kanchan");
  });

  it("副露ポン (projected) の牌では shanpon にならない", () => {
    const d = decomp(
      [meld("pon", "222m"), meld("chi", "345p"), meld("chi", "567p"), meld("chi", "678s")],
      "22m",
    );
    // 222m は minkan 由来 (decomp 上は pon 3枚に射影済み)
    expect(enumerateWinPlacements(d, [called("minkan", "2222m")], "2m")).toEqual([
      { waitShape: "tanki", meldIndex: null },
    ]);
  });
});

// ---- calcFu ----

function ctx(over: Partial<FuContext> = {}): FuContext {
  return {
    isTsumo: false,
    isMenzen: true,
    isPinfu: false,
    seatWind: "2z",
    roundWind: "1z",
    ...over,
  };
}

// 平和形: 全順子 + 非役牌雀頭 88p + 両面 8s 和了
const pinfuDecomp = decomp(
  [meld("chi", "234m"), meld("chi", "567m"), meld("chi", "345p"), meld("chi", "678s")],
  "88p",
);
const pinfuPlacement = { waitShape: "ryanmen", meldIndex: 3 } as const;

describe("calcFu / 平和形と食い平和形", () => {
  it("平和ツモ = 20符 (ツモ符+2 が isPinfu で抑制される)", () => {
    const fu = calcFu(pinfuDecomp, [], "8s", pinfuPlacement, ctx({ isTsumo: true, isPinfu: true }));
    expect(fu).toBe(20);
  });

  it("平和ロン = 30符 (20 + 門前ロン10)", () => {
    const fu = calcFu(pinfuDecomp, [], "8s", pinfuPlacement, ctx({ isPinfu: true }));
    expect(fu).toBe(30);
  });

  it("食い平和形ロン = 30符 (特例: 20符ちょうど → 30)", () => {
    const fu = calcFu(pinfuDecomp, [called("chi", "234m")], "8s", pinfuPlacement, ctx({ isMenzen: false }));
    expect(fu).toBe(30);
  });

  it("食い平和形ツモ = 30符 (20+2=22 の自然な切り上げ)", () => {
    const fu = calcFu(pinfuDecomp, [called("chi", "234m")], "8s", pinfuPlacement, ctx({ isMenzen: false, isTsumo: true }));
    expect(fu).toBe(30);
  });
});

describe("calcFu / 単騎・暗刻・暗槓", () => {
  // 111m(暗刻) + 99m 単騎
  const tankiDecomp = decomp(
    [meld("pon", "111m"), meld("chi", "234p"), meld("chi", "567s"), meld("chi", "678s")],
    "99m",
  );
  const tanki = { waitShape: "tanki", meldIndex: null } as const;

  it("単騎 + 么九暗刻の門前ロン = 40符 (20+10+8+2)", () => {
    expect(calcFu(tankiDecomp, [], "9m", tanki, ctx())).toBe(40);
  });

  it("単騎 + 么九暗刻のツモ = 40符 (20+2+8+2 = 32 切り上げ)", () => {
    expect(calcFu(tankiDecomp, [], "9m", tanki, ctx({ isTsumo: true }))).toBe(40);
  });

  it("么九暗槓 (1z) + 嵌張の門前ロン = 70符 (20+10+32+2 = 64 切り上げ)", () => {
    // 暗槓のみは門前。decomp 上は pon 1z×3 に射影済み
    const d = decomp(
      [meld("pon", "111z"), meld("chi", "234m"), meld("chi", "567p"), meld("chi", "345s")],
      "88s",
    );
    const fu = calcFu(d, [called("ankan", "1111z")], "4s", { waitShape: "kanchan", meldIndex: 3 }, ctx());
    expect(fu).toBe(70);
  });
});

describe("calcFu / シャンポン (ロン=明刻, ツモ=暗刻)", () => {
  const d = decomp(
    [meld("pon", "222m"), meld("chi", "345p"), meld("chi", "567p"), meld("chi", "678s")],
    "99s",
  );
  const shanpon = { waitShape: "shanpon", meldIndex: 0 } as const;

  it("シャンポンの門前ロン = 40符 (222m は明刻扱い: 20+10+2 = 32 切り上げ)", () => {
    expect(calcFu(d, [], "2m", shanpon, ctx())).toBe(40);
  });

  it("シャンポンのツモ = 30符 (222m は暗刻: 20+2+4 = 26 切り上げ)", () => {
    expect(calcFu(d, [], "2m", shanpon, ctx({ isTsumo: true }))).toBe(30);
  });
});

describe("calcFu / 雀頭符と副露カン", () => {
  it("役牌雀頭 (5z = Kiro) は +2 (20+10+2 = 32 → 40)", () => {
    const d = decomp(
      [meld("chi", "234m"), meld("chi", "567m"), meld("chi", "345p"), meld("chi", "678s")],
      "55z",
    );
    expect(calcFu(d, [], "8s", pinfuPlacement, ctx())).toBe(40);
  });

  it("連風雀頭 (自風=場風=1z) は +2 止まり (+4 なら 32→40 になるが 30 のまま)", () => {
    // 20 + ツモ2 + 555p暗刻4 + 嵌張2 + 雀頭2 = 30
    const d = decomp(
      [meld("pon", "555p"), meld("chi", "345s"), meld("chi", "234m"), meld("chi", "678m")],
      "11z",
    );
    const fu = calcFu(d, [], "4s", { waitShape: "kanchan", meldIndex: 1 }, ctx({
      isTsumo: true,
      seatWind: "1z",
      roundWind: "1z",
    }));
    expect(fu).toBe(30);
  });

  it("么九明槓 (9s) = +16 (20+16 = 36 → 40。明刻なら 24→30 になるので区別できる)", () => {
    const d = decomp(
      [meld("pon", "999s"), meld("chi", "234m"), meld("chi", "567m"), meld("chi", "345p")],
      "88p",
    );
    const fu = calcFu(d, [called("minkan", "9999s")], "4m", { waitShape: "ryanmen", meldIndex: 1 }, ctx({ isMenzen: false }));
    expect(fu).toBe(40);
  });

  it("加槓は明槓扱い = +16", () => {
    const d = decomp(
      [meld("pon", "999s"), meld("chi", "234m"), meld("chi", "567m"), meld("chi", "345p")],
      "88p",
    );
    const fu = calcFu(d, [called("kakan", "9999s")], "4m", { waitShape: "ryanmen", meldIndex: 1 }, ctx({ isMenzen: false }));
    expect(fu).toBe(40);
  });

  it("副露ポンは明刻 = 中張+2 (20+2+2(嵌張) = 24 → 30)", () => {
    const d = decomp(
      [meld("pon", "555s"), meld("chi", "234m"), meld("chi", "567m"), meld("chi", "345p")],
      "88p",
    );
    const fu = calcFu(d, [called("pon", "555s")], "4p", { waitShape: "kanchan", meldIndex: 3 }, ctx({ isMenzen: false }));
    expect(fu).toBe(30);
  });
});

describe("SEVEN_PAIRS_FU", () => {
  it("七対子は固定 25符", () => {
    expect(SEVEN_PAIRS_FU).toBe(25);
  });
});
