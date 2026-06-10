import { describe, it, expect } from "vitest";
import { computeEligibility, resolveClaims, seatDistance } from "./claims";
import { mpszToTiles } from "./tiles";
import type { CpuClaim, MeldLike, Seat, Tile, TileId } from "./types";

const SEAT_ORDER: Seat[] = ["east", "south", "west", "north"];

function toTiles(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

function tile(id: TileId): Tile {
  return { id, copy: 0 };
}

function eligibility(
  handMpsz: string,
  discarded: TileId,
  opts: {
    melds?: MeldLike[];
    discardedIds?: TileId[];
    isShimocha?: boolean;
  } = {},
) {
  return computeEligibility({
    hand: toTiles(handMpsz),
    melds: opts.melds ?? [],
    discardedIds: opts.discardedIds ?? [],
    tile: tile(discarded),
    isShimocha: opts.isShimocha ?? false,
    seatWind: "2z",
    roundWind: "1z",
  });
}

describe("computeEligibility / ポン・カン", () => {
  it("同種2枚でポン可、3枚でカンも可", () => {
    const two = eligibility("55z23m456p789s678m", "5z");
    expect(two.pon).toBe(true);
    expect(two.kan).toBe(false);

    const three = eligibility("555z23m456p789s67m", "5z");
    expect(three.pon).toBe(true);
    expect(three.kan).toBe(true);
  });

  it("同種1枚ではポン不可", () => {
    const offers = eligibility("5z123m456p789s678m", "5z");
    expect(offers.pon).toBe(false);
    expect(offers.kan).toBe(false);
  });
});

describe("computeEligibility / チー", () => {
  it("上家からの数牌のみチー候補が出る", () => {
    const offers = eligibility("34m67m123p456s55z99s", "5m", { isShimocha: true });
    // 5m に対し 34m / 46m(嵌張は 4m6m) / 67m の3候補
    expect(offers.chi.map((v) => v.tiles.map((t) => t.id).join(","))).toEqual([
      "3m,4m",
      "4m,6m",
      "6m,7m",
    ]);
  });

  it("上家でなければチー不可", () => {
    const offers = eligibility("34m67m123p456s55z99s", "5m", { isShimocha: false });
    expect(offers.chi).toEqual([]);
  });

  it("字牌はチー不可", () => {
    const offers = eligibility("44z123m456p789s678m", "4z", { isShimocha: true });
    expect(offers.chi).toEqual([]);
  });

  it("端の数字は範囲外の組を含まない", () => {
    const offers = eligibility("23m123p456s55z6789s", "1m", { isShimocha: true });
    expect(offers.chi.map((v) => v.tiles.map((t) => t.id).join(","))).toEqual([
      "2m,3m",
    ]);
  });
});

describe("computeEligibility / ロン", () => {
  // 5z 単騎待ち + 555z は使えないので、kiro 刻子 + 両面の形で AWS役を確保
  const RON_HAND = "555z234m67m234p55s"; // 5m/8m 待ち、kiro 1飜

  it("AWS役のある和了牌でロン可", () => {
    const offers = eligibility(RON_HAND, "8m");
    expect(offers.ron).toBe(true);
  });

  it("和了形でも AWS役が無ければロン不可", () => {
    // 111z 刻子 (場風のみ・AWS役なし) + 両面
    const offers = eligibility("111z234m67m234p55s", "8m");
    expect(offers.ron).toBe(false);
  });

  it("フリテン (自分の捨て牌に待ち牌) ならロン不可", () => {
    const offers = eligibility(RON_HAND, "8m", { discardedIds: ["5m"] });
    expect(offers.ron).toBe(false);
  });

  it("和了牌でなければロン不可", () => {
    const offers = eligibility(RON_HAND, "9m");
    expect(offers.ron).toBe(false);
  });
});

describe("resolveClaims / 優先度と頭ハネ", () => {
  const ron = (seat: Seat): CpuClaim => ({ seat, kind: "ron" });
  const pon = (seat: Seat): CpuClaim => ({ seat, kind: "pon" });
  const chi = (seat: Seat): CpuClaim => ({ seat, kind: "chi", chiTiles: [tile("1m"), tile("2m")] });

  it("ロン > ポン > チー", () => {
    expect(resolveClaims([chi("south"), pon("west"), ron("north")], "east", SEAT_ORDER)?.kind).toBe("ron");
    expect(resolveClaims([chi("south"), pon("west")], "east", SEAT_ORDER)?.kind).toBe("pon");
  });

  it("ダブロンは頭ハネ: 打牌者からツモ順で近い席が勝つ", () => {
    // east の打牌に south と north がロン → south
    const winner = resolveClaims([ron("north"), ron("south")], "east", SEAT_ORDER);
    expect(winner?.seat).toBe("south");
    // west の打牌なら north が近い
    const winner2 = resolveClaims([ron("north"), ron("south")], "west", SEAT_ORDER);
    expect(winner2?.seat).toBe("north");
  });

  it("クレームなしは null", () => {
    expect(resolveClaims([], "east", SEAT_ORDER)).toBeNull();
  });
});

describe("seatDistance", () => {
  it("打牌者からツモ順の距離を返す", () => {
    expect(seatDistance("east", "south", SEAT_ORDER)).toBe(1);
    expect(seatDistance("east", "north", SEAT_ORDER)).toBe(3);
    expect(seatDistance("north", "east", SEAT_ORDER)).toBe(1);
  });
});
