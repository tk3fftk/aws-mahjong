import { describe, expect, it } from "vitest";
import type { Tile } from "../types";
import { currentDoraIds } from "./render";

function tile(id: Tile["id"], copy = 0): Tile {
  return { id, copy: copy as Tile["copy"] };
}

describe("currentDoraIds", () => {
  it("maps each revealed indicator to its next tile (the actual dora)", () => {
    // deadWall layout: doraIndicators reads indicators from the dead wall.
    // With a single revealed indicator 1m, the dora is 2m.
    const deadWall = [tile("1m"), tile("2p"), tile("3s"), tile("9m"), tile("7z")];
    const set = currentDoraIds({ deadWall, doraIndicatorCount: 1 });
    expect(set.has("2m")).toBe(true);
    expect(set.size).toBe(1);
  });

  it("includes one dora per revealed indicator", () => {
    const deadWall = [tile("1m"), tile("2p"), tile("3s"), tile("9m"), tile("7z")];
    const set = currentDoraIds({ deadWall, doraIndicatorCount: 2 });
    expect(set.has("2m")).toBe(true); // 1m -> 2m
    expect(set.has("3p")).toBe(true); // 2p -> 3p
    expect(set.size).toBe(2);
  });

  it("wraps terminals/honors (9m -> 1m)", () => {
    const deadWall = [tile("9m"), tile("2p"), tile("3s"), tile("9m"), tile("7z")];
    const set = currentDoraIds({ deadWall, doraIndicatorCount: 1 });
    expect(set.has("1m")).toBe(true);
  });

  it("returns empty set when nothing revealed", () => {
    const deadWall = [tile("1m"), tile("2p"), tile("3s"), tile("9m"), tile("7z")];
    expect(currentDoraIds({ deadWall, doraIndicatorCount: 0 }).size).toBe(0);
  });
});
