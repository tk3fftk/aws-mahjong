import { describe, it, expect } from "vitest";
import { buildWall, dealInitialHands, mulberry32, drawFromWall } from "./wall";

describe("buildWall", () => {
  it("136枚を生成する (34種 × 4)", () => {
    const wall = buildWall(mulberry32(1));
    expect(wall).toHaveLength(136);
  });

  it("seed 同一なら同じ順序で生成される (再現性)", () => {
    const a = buildWall(mulberry32(42));
    const b = buildWall(mulberry32(42));
    expect(a.map((t) => `${t.id}:${t.copy}`)).toEqual(b.map((t) => `${t.id}:${t.copy}`));
  });

  it("seed が異なれば順序も異なる", () => {
    const a = buildWall(mulberry32(1));
    const b = buildWall(mulberry32(2));
    expect(a[0]).not.toEqual(b[0]);
  });
});

describe("dealInitialHands", () => {
  it("親(east)=14枚, 子(south)=13枚, 山残り=84枚", () => {
    const wall = buildWall(mulberry32(7));
    const { east, south, remainingWall } = dealInitialHands(wall);
    expect(east).toHaveLength(14);
    expect(south).toHaveLength(13);
    // 136 - 52 (4人各13枚) - 1 (親の初ツモ) = 83
    expect(remainingWall).toHaveLength(83);
  });
});

describe("drawFromWall", () => {
  it("ツモすると山が1枚減り、ツモ牌が返る", () => {
    const wall = buildWall(mulberry32(0));
    const initial = wall.length;
    const { tile, remainingWall } = drawFromWall(wall);
    expect(tile).toBeTruthy();
    expect(remainingWall).toHaveLength(initial - 1);
  });

  it("山が空ならnull", () => {
    const { tile } = drawFromWall([]);
    expect(tile).toBeNull();
  });
});
