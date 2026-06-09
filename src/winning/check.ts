import type { Tile, WinForm } from "../types";
import { decomposeStandard } from "./decompose";
import { isSevenPairs, isThirteenOrphans, sevenPairsTiles } from "./special";

export function canWin(hand: Tile[]): WinForm | null {
  const ids = hand.map((t) => t.id);
  if (isThirteenOrphans(ids)) {
    return { kind: "thirteen-orphans" };
  }
  if (isSevenPairs(ids)) {
    return { kind: "seven-pairs", pairs: sevenPairsTiles(ids) };
  }
  const decompositions = decomposeStandard(ids);
  if (decompositions.length > 0) {
    return { kind: "standard", decompositions };
  }
  return null;
}
