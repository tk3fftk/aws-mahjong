export type AwsYakuKind =
  | "completed-meld"
  | "tile-superset"
  | "seven-pairs"
  | "repeated-superset";

/**
 * yaku.json の 22 役を、サンプル形式に応じた判定戦略に分類する。
 * (一次情報: assets/v2.0.1/yaku.json の sampleMpszList より分類)
 */
export const AWS_YAKU_KIND: Record<string, AwsYakuKind> = {
  kiro: "completed-meld",
  "cost-explorer": "completed-meld",
  iam: "completed-meld",
  "cicd-pipeline": "completed-meld",
  "rag-agent": "completed-meld",
  "master-replica": "completed-meld",
  "cicd-pipeline-kan": "completed-meld",
  "static-site-hosting": "tile-superset",
  "serverless-api": "tile-superset",
  "event-driven-architecture": "tile-superset",
  "web-application": "tile-superset",
  "in-memory-cache": "tile-superset",
  batch: "tile-superset",
  migration: "tile-superset",
  "job-observer": "tile-superset",
  "web-application-kan": "tile-superset",
  "blue-green-deploy-kan": "tile-superset",
  serverlesspresso: "tile-superset",
  redundancy: "repeated-superset",
  "aws-three-concealed-triples1": "repeated-superset",
  "dr-architecture": "seven-pairs",
  "aws-all-green": "completed-meld",
};

export function isAwsYakuId(id: string): boolean {
  return id in AWS_YAKU_KIND;
}
