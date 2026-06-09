import { describe, it, expect } from "vitest";
import { detectAwsYakus } from "./aws-pattern";
import { decomposeStandard } from "../winning/decompose";
import { isSevenPairs, sevenPairsTiles } from "../winning/special";
import { mpszToTiles } from "../tiles";
import type { WinForm } from "../types";

function detectFromMpsz(mpsz: string, opts: { isMenzen?: boolean } = {}) {
  const tiles = mpszToTiles(mpsz);
  let winForm: WinForm;
  if (isSevenPairs(tiles)) {
    winForm = { kind: "seven-pairs", pairs: sevenPairsTiles(tiles) };
  } else {
    const decomps = decomposeStandard(tiles);
    if (decomps.length === 0) throw new Error("not decomposable: " + mpsz);
    winForm = { kind: "standard", decompositions: decomps };
  }
  return detectAwsYakus(tiles, winForm, { isMenzen: opts.isMenzen ?? true });
}

describe("detectAwsYakus / completed-meld 分類", () => {
  it("Kiro: 5z刻子で 1飜", () => {
    const yakus = detectFromMpsz("555z234m567m234p55s");
    expect(yakus.find((y) => y.id === "kiro")?.han).toBe(1);
  });

  it("コスト最適化: 6z刻子で 1飜", () => {
    const yakus = detectFromMpsz("666z234m567m234p55s");
    expect(yakus.find((y) => y.id === "cost-explorer")?.han).toBe(1);
  });

  it("最小権限: 7z刻子で 1飜", () => {
    const yakus = detectFromMpsz("777z234m567m234p55s");
    expect(yakus.find((y) => y.id === "iam")?.han).toBe(1);
  });

  it("CI/CDパイプライン: 789p 順子で 2飜", () => {
    const yakus = detectFromMpsz("789p234m567m234s55z");
    expect(yakus.find((y) => y.id === "cicd-pipeline")?.han).toBe(2);
  });

  it("RAGエージェント: 345s 順子で 2飜", () => {
    const yakus = detectFromMpsz("345s234m567m234p55z");
    expect(yakus.find((y) => y.id === "rag-agent")?.han).toBe(2);
  });

  it("マスター・レプリカ: 777s 刻子で 2飜", () => {
    const yakus = detectFromMpsz("777s234m567m234p55z");
    expect(yakus.find((y) => y.id === "master-replica")?.han).toBe(2);
  });
});

describe("detectAwsYakus / tile-superset 分類", () => {
  it("静的サイトホスティング: 4p,5p,3s をすべて含むと 1飜", () => {
    // 4p 5p を含む順子 + 3s を含む順子で構成
    const yakus = detectFromMpsz("345p234m567m345s55z");
    expect(yakus.find((y) => y.id === "static-site-hosting")?.han).toBe(1);
  });

  it("サーバレスAPI: 2p,1m,8s をすべて含むと 1飜", () => {
    const yakus = detectFromMpsz("123p123m789s234m55z");
    expect(yakus.find((y) => y.id === "serverless-api")?.han).toBe(1);
  });

  it("必要な牌が1つでも欠けると不成立", () => {
    // 3s を含まない手 → static-site-hosting 不成立
    const yakus = detectFromMpsz("345p234m567m789m55z");
    expect(yakus.find((y) => y.id === "static-site-hosting")).toBeUndefined();
  });
});

describe("detectAwsYakus / repeated-superset 分類", () => {
  it("冗長化(AWS一盃口): 3p2m7s × 2 を含むと 3飜", () => {
    // 3p,3p,2m,2m,7s,7s をすべて含む → repeated superset 2倍
    // 例: 234m + 234m + 333p + 777s + 55z = 11+ → no
    // 123p + 234m + 123p + 234m + 77s + ... 簡単な例:
    // 333p + 222m + 777s + 234p + 55s = 3+3+3+3+2 = 14, 3p×3, 2m×3, 7s×3 を含む
    // → repeated-superset(2) 充足
    const yakus = detectFromMpsz("333p222m777s234p55s");
    expect(yakus.find((y) => y.id === "redundancy")?.han).toBe(3);
  });

  it("1倍しか含まない場合は不成立", () => {
    // 3p,2m,7s が各1枚しかない (順子に1枚ずつ)
    const yakus = detectFromMpsz("123p234m567s888p55z");
    expect(yakus.find((y) => y.id === "redundancy")).toBeUndefined();
  });
});

describe("detectAwsYakus / seven-pairs 分類", () => {
  it("DRアーキテクチャ: 55p-11z-22z-33p-22m-77s-33s の七対子で 13飜", () => {
    // 七対子: 5p5p 1z1z 2z2z 3p3p 2m2m 7s7s 3s3s
    const yakus = detectFromMpsz("22m33p55p3s3s7s7s1z1z2z2z");
    expect(yakus.find((y) => y.id === "dr-architecture")?.han).toBe(13);
  });

  it("対子が一致しないと不成立", () => {
    const yakus = detectFromMpsz("11m22m66m33p44s55z77z");
    expect(yakus.find((y) => y.id === "dr-architecture")).toBeUndefined();
  });
});

describe("detectAwsYakus / isCombineAllowed", () => {
  it("Kiro と コスト最適化 は AWS固有役同士なので両方加算される", () => {
    // yaku.json の isCombineAllowed=false は「標準麻雀の白/發/中 と複合しない」の意。
    // AWS固有役どうしは複合できる。
    const yakus = detectFromMpsz("555z666z234m567m22p");
    const awsOnly = yakus.filter((y) => ["kiro", "cost-explorer", "iam"].includes(y.id));
    expect(awsOnly.map((y) => y.id).sort()).toEqual(["cost-explorer", "kiro"]);
  });
});
