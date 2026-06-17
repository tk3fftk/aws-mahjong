import type { RiggedDeal } from "./rigged";
import type { Seat } from "../types";
import { DEBUG_PRESETS } from "./presets";

export interface DebugConfig {
  /** 仕込み配牌。null なら panel のみ有効で壁は通常ランダム */
  rig: RiggedDeal | null;
  /** 適用したプリセット名 (panel のフォーム初期値用)。生指定のみなら null */
  presetName: string | null;
  /** 開始持ち点の上書き (?scoreEast=... 等)。指定キーがなければ undefined。飛びの再現用 */
  initialScores?: Partial<Record<Seat, number>>;
}

// URL クエリのキー名 → 席。開始持ち点の上書き用 (?scoreSouth=500 で南家を500点開始)
const SCORE_KEYS: Record<string, Seat> = {
  scoreEast: "east",
  scoreSouth: "south",
  scoreWest: "west",
  scoreNorth: "north",
};

// URL クエリのキー名は RiggedDeal のフィールド名と1対1で対応させる
const RIG_KEYS = [
  "east",
  "south",
  "west",
  "north",
  "wallHead",
  "deadWall",
  "wallEnd",
] as const;

// プリセット名ではなく「debug mode を有効にするだけ」を意味する値
const ENABLE_VALUES = new Set(["1", "true"]);

/**
 * location.search から debug mode 設定を組み立てる。
 * - debug パラメータなし → null (debug mode 無効)
 * - ?debug=1 → panel のみ (rig なし)
 * - ?debug=riichi → プリセット適用。未知名は throw (呼び出し側でトースト表示)
 * - ?debug=1&east=...&wallHead=... → RiggedDeal を生指定。プリセットとの併用は個別キーが優先
 * mpsz の妥当性はここでは検証しない (riggedDeal が枚数違い・不正文字で throw する)。
 */
export function parseDebugConfig(search: string): DebugConfig | null {
  const params = new URLSearchParams(search);
  const debug = params.get("debug");
  if (debug === null || debug === "") return null;

  let presetName: string | null = null;
  let rig: RiggedDeal = {};
  if (!ENABLE_VALUES.has(debug)) {
    const preset = DEBUG_PRESETS[debug];
    if (!preset) {
      throw new Error(
        `不明なプリセット: ${debug} (候補: ${Object.keys(DEBUG_PRESETS).join(", ")})`,
      );
    }
    presetName = debug;
    rig = { ...preset };
  }
  for (const key of RIG_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== "") rig[key] = value;
  }
  const hasRig = Object.values(rig).some((v) => v !== undefined);

  // 開始持ち点の上書き (数値として妥当な scoreXxx のみ採用)
  let initialScores: Partial<Record<Seat, number>> | undefined;
  for (const [key, seat] of Object.entries(SCORE_KEYS)) {
    const raw = params.get(key);
    if (raw === null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    (initialScores ??= {})[seat] = n;
  }

  return { rig: hasRig ? rig : null, presetName, initialScores };
}
