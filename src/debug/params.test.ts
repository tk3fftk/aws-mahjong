import { describe, it, expect } from "vitest";
import { parseDebugConfig } from "./params";
import { DEBUG_PRESETS } from "./presets";

describe("parseDebugConfig", () => {
  it("debug パラメータがなければ null (debug mode 無効)", () => {
    expect(parseDebugConfig("")).toBeNull();
    expect(parseDebugConfig("?seed=42")).toBeNull();
    expect(parseDebugConfig("?debug=")).toBeNull();
  });

  it("?debug=1 / ?debug=true は panel のみ有効 (rig なし)", () => {
    expect(parseDebugConfig("?debug=1")).toEqual({ rig: null, presetName: null });
    expect(parseDebugConfig("?debug=true")).toEqual({ rig: null, presetName: null });
  });

  it("?debug=riichi でプリセットが適用される", () => {
    const config = parseDebugConfig("?debug=riichi");
    expect(config?.presetName).toBe("riichi");
    expect(config?.rig).toEqual(DEBUG_PRESETS.riichi);
  });

  it("未知のプリセット名は throw する", () => {
    expect(() => parseDebugConfig("?debug=nosuch")).toThrow(/不明なプリセット/);
  });

  it("個別キーで RiggedDeal を生指定できる (存在するキーだけ拾う)", () => {
    const config = parseDebugConfig("?debug=1&east=555z234m567m234p55s&wallHead=8m");
    expect(config?.rig).toEqual({ east: "555z234m567m234p55s", wallHead: "8m" });
    expect(config?.presetName).toBeNull();
  });

  it("プリセット + 個別キーは個別キーが優先でマージされる", () => {
    const config = parseDebugConfig("?debug=riichi&deadWall=4s");
    expect(config?.rig).toEqual({ ...DEBUG_PRESETS.riichi, deadWall: "4s" });
    expect(config?.presetName).toBe("riichi");
  });

  it("RiggedDeal 以外のキー (seed 等) は rig に混入しない", () => {
    const config = parseDebugConfig("?debug=1&seed=42&foo=bar");
    expect(config).toEqual({ rig: null, presetName: null });
  });

  it("scoreEast/scoreSouth 等で開始持ち点を上書き指定できる", () => {
    const config = parseDebugConfig("?debug=ron&scoreSouth=500&scoreEast=30000");
    expect(config?.initialScores).toEqual({ south: 500, east: 30000 });
  });

  it("score キーがなければ initialScores は付かない", () => {
    const config = parseDebugConfig("?debug=1");
    expect(config?.initialScores).toBeUndefined();
  });
});
