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
  it("冗長化(AWS一盃口): 3p2m7s × 2 ちょうどを含むと 3飜", () => {
    // 3p×2,2m×2,7s×2 ちょうど (×3 にはならない) を含む真の2コピー手。
    // 234p×2 → 3p×2, 234m×2 → 2m×2, 77s 雀頭 → 7s×2 → repeated-superset(2) 充足、(3)は不成立。
    const yakus = detectFromMpsz("234p234p234m234m77s");
    expect(yakus.find((y) => y.id === "redundancy")?.han).toBe(3);
    expect(yakus.find((y) => y.id === "aws-three-concealed-triples1")).toBeUndefined();
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

describe("detectAwsYakus / 鳴き (isMenzen=false) と hanOpen", () => {
  it("kiro: hanOpen=1 なので鳴いても 1飜", () => {
    const yakus = detectFromMpsz("555z234m567m234p55s", { isMenzen: false });
    expect(yakus.find((y) => y.id === "kiro")?.han).toBe(1);
  });

  it("cicd-pipeline: 鳴くと hanOpen=1 に食い下がる (門前は 2飜)", () => {
    const yakus = detectFromMpsz("789p234m567m234s55z", { isMenzen: false });
    expect(yakus.find((y) => y.id === "cicd-pipeline")?.han).toBe(1);
  });

  it("static-site-hosting: hanOpen=null (門前限定) なので鳴くと不成立", () => {
    const yakus = detectFromMpsz("345p234m567m345s55z", { isMenzen: false });
    expect(yakus.find((y) => y.id === "static-site-hosting")).toBeUndefined();
  });

  it("redundancy: hanOpen=null なので鳴くと不成立", () => {
    const yakus = detectFromMpsz("333p222m777s234p55s", { isMenzen: false });
    expect(yakus.find((y) => y.id === "redundancy")).toBeUndefined();
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

describe("detectAwsYakus / 強制共立の整理 (subsumption)", () => {
  // 上位役のサンプル牌が下位役を完全包含するペアは、上位が立つと下位が必ず自動成立する。
  // 同一構造の二重計上になるため下位役を抑制し、上位役のみ採用する。

  it("CI/CDカン(6789p) が立つと CI/CDパイプライン(789p) は抑制される (門前 3飜のみ)", () => {
    // 678p + 999p で 6789p を含む。789p も不可避に含むが、カンに吸収される。
    const yakus = detectFromMpsz("678p999p234m567m55s");
    expect(yakus.find((y) => y.id === "cicd-pipeline-kan")?.han).toBe(3);
    expect(yakus.find((y) => y.id === "cicd-pipeline")).toBeUndefined();
  });

  it("CI/CDカン: 鳴き手でも パイプラインは抑制され カン(hanOpen=2)のみ", () => {
    const yakus = detectFromMpsz("678p999p234m567m55s", { isMenzen: false });
    expect(yakus.find((y) => y.id === "cicd-pipeline-kan")?.han).toBe(2);
    expect(yakus.find((y) => y.id === "cicd-pipeline")).toBeUndefined();
  });

  it("Webアプリ カン(3p2m7s9s) が立つと Webアプリ・インメモリキャッシュは抑制される", () => {
    // 3p,2m,7s,9s をすべて含む (123p→3p, 123m→2m, 789s→7s,9s)。
    const yakus = detectFromMpsz("123p456p123m789s99m");
    expect(yakus.find((y) => y.id === "web-application-kan")?.han).toBe(3);
    expect(yakus.find((y) => y.id === "web-application")).toBeUndefined();
    expect(yakus.find((y) => y.id === "in-memory-cache")).toBeUndefined();
  });

  it("Blue/Greenデプロイ カン(3p3m6m7s) が立つと Webアプリは抑制される", () => {
    // 3p(123p), 3m(345m), 6m(678m), 7s(678s) を含む。9s は無いので in-memory は無関係。
    const yakus = detectFromMpsz("11p123p345m678m678s");
    expect(yakus.find((y) => y.id === "blue-green-deploy-kan")?.han).toBe(3);
    expect(yakus.find((y) => y.id === "web-application")).toBeUndefined();
  });

  it("冗長化: Webアプリを ×2 に引き上げ (web-application 2飜 + 冗長化 3飜 = 5飜相当)", () => {
    const yakus = detectFromMpsz("234p234p234m234m77s");
    expect(yakus.find((y) => y.id === "redundancy")?.han).toBe(3);
    expect(yakus.find((y) => y.id === "web-application")?.han).toBe(2);
    expect(yakus.find((y) => y.id === "master-replica")).toBeUndefined();
  });

  it("AWS三暗刻: Webアプリ ×3 + 三暗刻 のみ、冗長化・マスターレプリカは抑制 (計6飜相当)", () => {
    // 333p,222m,777s,234p,55s → 3p×4,2m×3,7s×3 = 3コピー相当。
    const yakus = detectFromMpsz("333p222m777s234p55s");
    expect(yakus.find((y) => y.id === "aws-three-concealed-triples1")?.han).toBe(3);
    expect(yakus.find((y) => y.id === "web-application")?.han).toBe(3);
    expect(yakus.find((y) => y.id === "redundancy")).toBeUndefined();
    expect(yakus.find((y) => y.id === "master-replica")).toBeUndefined();
  });

  it("回帰: 単独 CI/CDパイプライン(789p, 6pなし) は 2飜のまま、カンは立たない", () => {
    const yakus = detectFromMpsz("789p234m567m234s55z");
    expect(yakus.find((y) => y.id === "cicd-pipeline")?.han).toBe(2);
    expect(yakus.find((y) => y.id === "cicd-pipeline-kan")).toBeUndefined();
  });

  it("回帰: 単独 Webアプリ (反復・カン無し) は 1飜のまま", () => {
    // 3p(123p),2m(123m),7s(678s) を各1枚。9s 無し→カン/インメモリ無し、×2 無し→冗長化無し。
    const yakus = detectFromMpsz("123p456p123m678s99m");
    expect(yakus.find((y) => y.id === "web-application")?.han).toBe(1);
    expect(yakus.find((y) => y.id === "web-application-kan")).toBeUndefined();
    expect(yakus.find((y) => y.id === "redundancy")).toBeUndefined();
  });
});
