import { describe, it, expect } from "vitest";
import { winningTiles, isFuriten } from "./furiten";
import { mpszToTiles } from "../tiles";
import type { MeldLike, Tile, TileId } from "../types";

function toTiles(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

function meld(kind: MeldLike["kind"], mpsz: string): MeldLike {
  return { kind, tiles: toTiles(mpsz) };
}

describe("winningTiles", () => {
  it("単騎待ち: 待ちは1種のみ", () => {
    // 4面子完成 + 5s 単騎
    const waits = winningTiles(toTiles("123m456m789m123p5s"));
    expect(waits).toEqual(["5s"]);
  });

  it("両面待ち: 2種", () => {
    // 23m 両面 (1m/4m)。他の面子は字牌刻子と別suitで多面化を防ぐ
    const waits = winningTiles(toTiles("23m111z456s789s55z"));
    expect(waits.sort()).toEqual(["1m", "4m"]);
  });

  it("シャンポン待ち: 2種", () => {
    const waits = winningTiles(toTiles("11m55z456s789s123p"));
    expect(waits.sort()).toEqual(["1m", "5z"]);
  });

  it("副露込みの待ち: ポン1組 + 純手牌10枚", () => {
    const waits = winningTiles(toTiles("23m456s789s55z"), [meld("pon", "111z")]);
    expect(waits.sort()).toEqual(["1m", "4m"]);
  });

  it("ノーテンは空配列", () => {
    const waits = winningTiles(toTiles("1m3m5m7m9m1p3p5p7p9p1s3s5s"));
    expect(waits).toEqual([]);
  });

  it("自分が4枚使い切っている牌は待ちに含まれない (5枚目ガード)", () => {
    // 1m を暗刻+雀頭側で4枚使う形を作ると、1m は物理的に和了牌たり得ない
    // 111m + 1m を含む 14枚目候補 → ガードがないと偽の待ちになる
    const concealed = toTiles("1111m345m678m99p"); // 11枚 + pon 1組で 13枚相当?
    // ↑ 1m×4 + 345m + 678m + 99p = 11枚, melds 1組で計13枚相当の打牌後形
    const waits = winningTiles(concealed, [meld("pon", "555z")]);
    expect(waits).not.toContain("1m");
  });
});

describe("isFuriten", () => {
  it("捨て牌に待ち牌が含まれているとフリテン", () => {
    const concealed = toTiles("23m456m789m123p55s"); // 1m/4m 待ち
    expect(isFuriten(concealed, [], ["9p", "1m"] as TileId[])).toBe(true);
  });

  it("捨て牌に待ち牌がなければフリテンではない", () => {
    const concealed = toTiles("23m456m789m123p55s");
    expect(isFuriten(concealed, [], ["9p", "5z"] as TileId[])).toBe(false);
  });

  it("ノーテンはフリテンではない", () => {
    const concealed = toTiles("1m3m5m7m9m1p3p5p7p9p1s3s5s");
    expect(isFuriten(concealed, [], ["1m"] as TileId[])).toBe(false);
  });

  it("副露込みの待ちでもフリテン判定できる", () => {
    const concealed = toTiles("23m456m789m55s"); // pon込みで 1m/4m 待ち
    expect(isFuriten(concealed, [meld("pon", "555z")], ["4m"] as TileId[])).toBe(true);
  });
});
