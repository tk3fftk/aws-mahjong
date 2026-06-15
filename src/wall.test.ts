import { describe, it, expect } from "vitest";
import {
  buildWall,
  dealInitialHands,
  mulberry32,
  drawFromWall,
  drawFromWallEnd,
  splitDeadWall,
  DEAD_WALL_SIZE,
} from "./wall";

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
  it("親=14枚, 他3家=各13枚, 山残り=83枚", () => {
    const wall = buildWall(mulberry32(7));
    const { piles, remainingWall } = dealInitialHands(wall);
    expect(piles[0]).toHaveLength(14);
    expect(piles[1]).toHaveLength(13);
    expect(piles[2]).toHaveLength(13);
    expect(piles[3]).toHaveLength(13);
    // 136 - 52 (4人各13枚) - 1 (親の初ツモ) = 83
    expect(remainingWall).toHaveLength(83);
  });

  it("配牌 + 山 = 136枚で重複なし", () => {
    const wall = buildWall(mulberry32(11));
    const { piles, remainingWall } = dealInitialHands(wall);
    const all = [...piles.flat(), ...remainingWall];
    expect(all).toHaveLength(136);
    expect(new Set(all.map((t) => `${t.id}:${t.copy}`)).size).toBe(136);
  });
});

describe("splitDeadWall", () => {
  it("末尾14枚を王牌として分離し、順序を保つ", () => {
    const wall = buildWall(mulberry32(3));
    const { remainingWall } = dealInitialHands(wall);
    const { liveWall, deadWall } = splitDeadWall(remainingWall);
    expect(deadWall).toHaveLength(DEAD_WALL_SIZE);
    expect(liveWall).toHaveLength(83 - DEAD_WALL_SIZE); // 69
    expect([...liveWall, ...deadWall]).toEqual(remainingWall);
  });
});

describe("drawFromWallEnd", () => {
  it("末尾から1枚ツモる (リンシャン用)", () => {
    const wall = buildWall(mulberry32(5));
    const last = wall[wall.length - 1];
    const { tile, remainingWall } = drawFromWallEnd(wall);
    expect(tile).toEqual(last);
    expect(remainingWall).toHaveLength(wall.length - 1);
    expect(remainingWall[0]).toEqual(wall[0]);
  });

  it("山が空ならnull", () => {
    const { tile } = drawFromWallEnd([]);
    expect(tile).toBeNull();
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
