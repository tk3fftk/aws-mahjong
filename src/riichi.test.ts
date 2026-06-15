import { describe, it, expect } from "vitest";
import { riichiDiscardIndices } from "./riichi";
import { mpszToTiles } from "./tiles";
import type { MeldLike, Tile } from "./types";

function toTiles(mpsz: string): Tile[] {
  return mpszToTiles(mpsz).map((id) => ({ id, copy: 0 as const }));
}

function meld(kind: MeldLike["kind"], mpsz: string): MeldLike {
  return { kind, tiles: toTiles(mpsz) };
}

describe("riichiDiscardIndices", () => {
  it("単一候補: 浮き牌切りのみテンパイ維持", () => {
    // 555z 234m 67m 234p 55s + 1z(index13)。1z を切ると 5m/8m 待ちのテンパイ
    const hand = toTiles("555z234m67m234p55s1z");
    expect(riichiDiscardIndices(hand, [])).toEqual([13]);
  });

  it("ノーテン手は空配列", () => {
    // どの1枚を切ってもテンパイにならないバラバラ14枚
    const hand = toTiles("1m4m7m1p4p7p1s4s7s1z2z3z4z5z");
    expect(riichiDiscardIndices(hand, [])).toEqual([]);
  });

  it("七対子テンパイ: 両単騎の index が出る", () => {
    // 1m1m 2p2p 3s3s 5z5z 6z6z 7z7z + 9s(index12) + 4m(index13)
    // 4m を切ると 9s 単騎、9s を切ると 4m 単騎 (どちらも七対子テンパイ)
    const hand = toTiles("1m1m2p2p3s3s5z5z6z6z7z7z9s4m");
    expect(riichiDiscardIndices(hand, []).sort((a, b) => a - b)).toEqual([12, 13]);
  });

  it("同一牌が複数あるとき該当する全 index が出る (dedupe キャッシュの三角測量)", () => {
    // 234m 234p 234s 55z + 6s7s + 6s(index13)。
    // 6s を切れば 55z 雀頭で 6s7s が... ではなく、ここは「同一牌で同じ判定結果」を確認する。
    // 11m 11m... のような重複牌切りで同じ winningTiles 結果になる手を使う。
    // 99m99m + 234m234p234s55z(完成形) は 13枚なので、末尾に 9m を足して 99m9m を作る。
    const hand = toTiles("234m234p234s55z999m");
    // 234m 234p 234s 55z 999m = 3+3+3+2+3 = 14枚。
    // 999m のどれか1枚を切ると 99m + 55z の二雀頭... ではなくテンパイにならない。
    // 55z のどれか1枚を切ると 234m234p234s 999m + 5z 単騎テンパイ。
    const result = riichiDiscardIndices(hand, []);
    // 5z は index 9,10。両方が候補 (同一牌 dedupe しても両 index 列挙)。
    expect(result).toContain(9);
    expect(result).toContain(10);
  });

  it("副露込み: ポン1組 + 純手牌で候補を返す", () => {
    // pon 111z + 23m 456s 789s 55z + 1m(index10) → 1m を切ると... の形を検証
    // 23m 456s 789s 55z(完成は 1m/4m 待ち) で 11枚 + pon 3枚相当。
    // 末尾に浮き 1z を足して 12枚にし、1z 切りでテンパイ維持を確認。
    const hand = toTiles("23m456s789s55z1z");
    // 23m 456s 789s 55z 1z = 2+3+3+2+1 = 11枚, pon 1組で計14枚相当の打牌前
    const result = riichiDiscardIndices(hand, [meld("pon", "111z")]);
    expect(result).toContain(10); // 末尾 1z を切ると 1m/4m 待ち
  });
});
