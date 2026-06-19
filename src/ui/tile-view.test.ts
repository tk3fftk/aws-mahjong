import { describe, expect, it } from "vitest";
import { renderTile, renderTileById } from "./tile-view";

describe("renderTile suit color class", () => {
  it("adds suit-m for man tiles", () => {
    expect(renderTileById("1m")).toContain("suit-m");
  });
  it("adds suit-p for pin tiles", () => {
    expect(renderTileById("3p")).toContain("suit-p");
  });
  it("adds suit-s for sou tiles", () => {
    expect(renderTileById("9s")).toContain("suit-s");
  });
  it("adds suit-z for honor tiles", () => {
    expect(renderTileById("5z")).toContain("suit-z");
  });
  it("renderTile (hand variant) also carries suit class", () => {
    expect(renderTile({ id: "2p", copy: 0 }, { variant: "hand" })).toContain("suit-p");
  });
  it("back tiles do NOT carry a suit class (hidden)", () => {
    const html = renderTile({ id: "1m", copy: 0 }, { variant: "back" });
    expect(html).not.toContain("suit-m");
    expect(html).not.toContain("suit-");
  });
});

describe("renderTile dora marker", () => {
  it("adds is-dora when dora:true", () => {
    expect(renderTileById("1m", { dora: true })).toContain("is-dora");
  });
  it("omits is-dora by default", () => {
    expect(renderTileById("1m")).not.toContain("is-dora");
  });
});
