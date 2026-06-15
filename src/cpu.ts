import type { ClaimKind, ClaimOffers, MeldLike, SeatWind, Tile, TileId } from "./types";
import { counts34, isDragon, isHonor, isYaochu, numberOf, tileIdIndex } from "./tiles";
import { canWin } from "./winning/check";
import { winningForms } from "./winning/furiten";
import { effectiveHandTiles, isMenzenHand } from "./winning/melds";
import { judgeYaku, canDeclareWin } from "./yaku/judge";
import { riichiDiscardIndices } from "./riichi";

/**
 * CPU の性格。意思決定の分岐を散らさず、6つの knob で表現する。
 * 3人の CPU は共通の打牌ベースライン (pickIsolatedDiscard) を持ち、
 * 鳴き / 守備 / リーチ の軸でこの knob により差が出る。
 */
export type PersonalityId = "attacker" | "defender" | "balanced";

export interface CpuPersonality {
  id: PersonalityId;
  name: string; // 表示名 (AWSキャラ風ペルソナ。UIには出さず内部識別用)
  foldToGenbutsu: boolean; // 相手リーチ時に現物 (安全牌) でベタオリするか
  foldOnlyWhenNotTenpai: boolean; // 降りるのは自分が非テンパイのときだけか (均衡型)
  allowPon: boolean; // そもそもポンするか (守備型は false で門前維持)
  ponDragonOnly: boolean; // allowPon 時、ポンを AWS役牌 (5z/6z/7z) に限定するか
  allowChi: boolean; // チーするか
  allowKanOnDragon: boolean; // 役牌の明カンを許すか
  suppressRiichiVsOpponentRiichi: boolean; // 相手リーチ中は自分のリーチを抑止するか
}

export const PERSONALITIES: Record<PersonalityId, CpuPersonality> = {
  // Lambda: 即応・高速。和了へ押し続け、鳴きも積極 (ただし keepsAwsWinPath で自己ゲート)
  attacker: {
    id: "attacker",
    name: "Lambda",
    foldToGenbutsu: false,
    foldOnlyWhenNotTenpai: false,
    allowPon: true,
    ponDragonOnly: false,
    allowChi: true,
    allowKanOnDragon: true,
    suppressRiichiVsOpponentRiichi: false,
  },
  // Well-Architected: 信頼性・安全第一。門前維持で一切鳴かず、相手リーチで即ベタオリ
  defender: {
    id: "defender",
    name: "Well-Architected",
    foldToGenbutsu: true,
    foldOnlyWhenNotTenpai: false,
    allowPon: false,
    ponDragonOnly: true,
    allowChi: false,
    allowKanOnDragon: false,
    suppressRiichiVsOpponentRiichi: true,
  },
  // Auto Scaling: 状況に応じて伸縮。テンパイなら押し、非テンパイなら降りる中間型 (現状の鳴き踏襲)
  balanced: {
    id: "balanced",
    name: "Auto Scaling",
    foldToGenbutsu: true,
    foldOnlyWhenNotTenpai: true,
    allowPon: true,
    ponDragonOnly: true,
    allowChi: false,
    allowKanOnDragon: false,
    suppressRiichiVsOpponentRiichi: false,
  },
};

export interface CpuContext {
  isTsumo: boolean;
  isMenzen: boolean;
  seatWind: SeatWind;
  roundWind: SeatWind;
  isRiichi: boolean; // 既にリーチ済みか (手牌が固定されツモ切りのみになる)
  winningTileId: TileId | null; // ツモ牌 (打牌判断時は null。judgeYaku は isTsumo 時のみ消費)
  // 守備用 (controller が算出して渡す。省略時は「相手リーチなし」扱い):
  anyOpponentRiichi?: boolean; // リーチ済みの他家がいるか
  safeTileIds?: TileId[]; // 全リーチ者に対する現物 (積集合 = 100%安全)
}

export interface CpuInput {
  hand: Tile[];
  melds?: MeldLike[];
  ctx: CpuContext;
  // 門前・1000点・ライブ壁≥1・未リーチを controller が判定済みのときだけ true。
  // テンパイを保つ打牌の有無は decideCpuAction 側で判定する
  riichiAllowed?: boolean;
  rng: () => number;
  personality?: CpuPersonality; // 省略時は balanced (バックコンパチ)
  // true なら通常打牌を旧来のランダム (rng index) にする。debug/テストの決定的進行用。
  // 省略時は pickIsolatedDiscard (孤立牌優先)
  randomDiscard?: boolean;
}

export type CpuAction =
  | { action: "win" }
  | { action: "riichi"; tileIndex: number }
  | { action: "discard"; tileIndex: number };

const YAOCHU_DISCARD_BIAS = 1; // 么九牌は同程度に孤立した中張牌より先に切る

/**
 * 向聴計算を使わず「最も孤立した牌」の手牌 index を返す (純ランダムより常に良いベースライン)。
 * 各牌の支持度 = 同種の余剰コピー + (数牌なら ±2 近傍の枚数) を数え、支持度が低い (= 孤立した)
 * ほど切り対象。么九牌には小さなバイアスを足し、同程度の孤立なら么九を優先して切る。
 * 同点はツモ番乱数 rng でタイブレーク (rng=0 で先頭側、決定性を保つ)。
 */
export function pickIsolatedDiscard(hand: Tile[], rng: () => number): number {
  const counts = counts34(hand.map((t) => t.id));
  let bestScore = -Infinity;
  const ties: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    const id = hand[i]!.id;
    const idx = tileIdIndex(id);
    let support = counts[idx]! - 1; // 同種の余剰コピー (対子/刻子はここで支持される)
    if (!isHonor(id)) {
      const n = numberOf(id);
      const suitBase = idx - (n - 1); // この suit の「1」の counts34 index
      for (const d of [-2, -1, 1, 2]) {
        const nn = n + d;
        if (nn >= 1 && nn <= 9) support += counts[suitBase + (nn - 1)]!;
      }
    }
    // 切りやすさ: 支持度が低いほど高得点。支持度差が么九バイアスを上回るよう支持度を2倍する
    let score = -support * 2;
    if (isYaochu(id)) score += YAOCHU_DISCARD_BIAS;
    if (score > bestScore) {
      bestScore = score;
      ties.length = 0;
      ties.push(i);
    } else if (score === bestScore) {
      ties.push(i);
    }
  }
  const pick = Math.min(ties.length - 1, Math.floor(rng() * ties.length));
  return ties[pick]!;
}

/**
 * 現物 (安全牌) 集合に含まれる手牌の最初の index を返す。1枚も無ければ null。
 * rng 不要で完全に決定的 (ベタオリの最も確実なアンカー)。
 */
export function pickGenbutsuDiscard(hand: Tile[], safe: TileId[]): number | null {
  const safeSet = new Set(safe);
  const idx = hand.findIndex((t) => safeSet.has(t.id));
  return idx === -1 ? null : idx;
}

export function decideCpuAction(input: CpuInput): CpuAction {
  const melds = input.melds ?? [];
  // ツモ直後 (手牌が打牌可能枚数) のみ和了判定。鳴き直後はツモ和了できない
  const win = input.ctx.isTsumo ? canWin(input.hand, melds) : null;
  if (win) {
    // melds は CpuInput.melds を使い回す (ctx に重複させて乖離するのを防ぐ)
    const result = judgeYaku(win, effectiveHandTiles(input.hand, melds), {
      ...input.ctx,
      melds,
    });
    if (canDeclareWin(result.yakus, result.isYakuman)) {
      return { action: "win" };
    }
  }
  // 既にリーチ済みなら手牌は固定 → ツモ切り (末尾 = ツモ牌)
  if (input.ctx.isRiichi) {
    return { action: "discard", tileIndex: input.hand.length - 1 };
  }
  const personality = input.personality ?? PERSONALITIES.balanced;
  const anyOpponentRiichi = input.ctx.anyOpponentRiichi ?? false;
  // 守備ゲート (リーチより先に判定 = 降り派が攻めを上書きする):
  // 相手リーチ中、降り性格なら現物に降りる。均衡型は自分が非テンパイのときだけ降りる
  if (personality.foldToGenbutsu && anyOpponentRiichi) {
    const shouldFold =
      !personality.foldOnlyWhenNotTenpai || riichiDiscardIndices(input.hand, melds).length === 0;
    if (shouldFold) {
      const safe = pickGenbutsuDiscard(input.hand, input.ctx.safeTileIds ?? []);
      // 現物が無ければ最も孤立した牌で代替 (么九バイアスで相対的にマシ・100%安全ではない)
      return { action: "discard", tileIndex: safe ?? pickIsolatedDiscard(input.hand, input.rng) };
    }
  }
  // リーチ可能かつテンパイを保つ打牌があれば最初の候補で宣言 (dumb で十分)。
  // 守備型は相手リーチ中はリーチを抑止する
  if (input.riichiAllowed && !(personality.suppressRiichiVsOpponentRiichi && anyOpponentRiichi)) {
    const candidates = riichiDiscardIndices(input.hand, melds);
    if (candidates.length > 0) {
      return { action: "riichi", tileIndex: candidates[0]! };
    }
  }
  const idx = input.randomDiscard
    ? Math.min(input.hand.length - 1, Math.floor(input.rng() * input.hand.length))
    : pickIsolatedDiscard(input.hand, input.rng);
  return { action: "discard", tileIndex: idx };
}

export interface ClaimDecisionInput {
  offers: ClaimOffers;
  tile: Tile; // 打たれた牌
  personality?: CpuPersonality; // 省略時は balanced
  // keepsAwsWinPath (鳴き後も AWS役で和了できるかの自己ゲート) に必要。省略時は門前手扱い
  hand?: Tile[];
  melds?: MeldLike[];
  seatWind?: SeatWind;
  roundWind?: SeatWind;
}

/**
 * 鳴いた後も AWS役で和了できる道が残るか (鳴き過ぎて和了不能になる「死に手」を防ぐ自己ゲート)。
 * - 役牌 (5z/6z/7z) のポン・カンは hanOpen≥1 の AWS役が確定するので常に true
 * - それ以外 (チー / 非役牌ポン) は、鳴いた後にある牌を切るとテンパイになり、
 *   その待ちのいずれかが AWS役 (canDeclareWin) を満たすときだけ true
 */
function keepsAwsWinPath(
  hand: Tile[],
  melds: MeldLike[],
  kind: "pon" | "chi" | "kan",
  tile: Tile,
  chiTiles: [Tile, Tile] | undefined,
  seatWind: SeatWind,
  roundWind: SeatWind,
): boolean {
  if (isDragon(tile.id) && (kind === "pon" || kind === "kan")) return true;

  // 鳴き後の純手牌 (打牌待ち) と副露を組み立てる
  let concealed: Tile[];
  let newMeld: MeldLike;
  if (kind === "chi") {
    if (!chiTiles) return false;
    concealed = removeByIds(hand, [chiTiles[0].id, chiTiles[1].id]);
    newMeld = { kind: "chi", tiles: [chiTiles[0], chiTiles[1], tile] };
  } else if (kind === "pon") {
    concealed = removeByIds(hand, [tile.id, tile.id]);
    newMeld = { kind: "pon", tiles: [tile, tile, tile] };
  } else {
    concealed = removeByIds(hand, [tile.id, tile.id, tile.id]);
    newMeld = { kind: "minkan", tiles: [tile, tile, tile, tile] };
  }
  const newMelds = [...melds, newMeld];

  // 鳴き後は「テンパイより1枚多い」形。各打牌候補でテンパイになり、待ちに AWS役があるか。
  // 打牌候補ごとに winningForms を1回だけ回し、和了形 (form) をそのまま judgeYaku に渡すことで、
  // テンパイ判定 (旧 riichiDiscardIndices) と待ち列挙と役判定前の canWin を1パスに畳む。
  // 同一 tileId の打牌は結果が同じなので skip (旧 riichiDiscardIndices の TileId キャッシュ相当)。
  const isMenzen = isMenzenHand(newMelds);
  const seenDiscard = new Set<TileId>();
  for (let di = 0; di < concealed.length; di++) {
    const discardId = concealed[di]!.id;
    if (seenDiscard.has(discardId)) continue;
    seenDiscard.add(discardId);
    const ready = concealed.filter((_, j) => j !== di);
    for (const { id: w, form } of winningForms(ready, newMelds)) {
      const full = [...ready, { id: w, copy: 0 as const }];
      const judged = judgeYaku(form, effectiveHandTiles(full, newMelds), {
        isTsumo: false,
        isMenzen,
        seatWind,
        roundWind,
        winningTileId: w,
        melds: newMelds,
      });
      if (canDeclareWin(judged.yakus, judged.isYakuman)) return true;
    }
  }
  return false;
}

/** ids の各 id を1枚ずつ tiles から取り除く */
function removeByIds(tiles: Tile[], ids: TileId[]): Tile[] {
  const remaining = [...ids];
  const out: Tile[] = [];
  for (const t of tiles) {
    const k = remaining.indexOf(t.id);
    if (k !== -1) remaining.splice(k, 1);
    else out.push(t);
  }
  return out;
}

/**
 * CPU の鳴き判断 (性格 knob ベース):
 * - ロンは適格なら必ず宣言
 * - カン (役牌の明槓) → ポン → チー の順に、knob が許し かつ keepsAwsWinPath を満たす最初を採用
 * - hand 未指定 (旧シグネチャ) のときは自己ゲートを省略 (balanced の役牌ポンは常に安全)
 */
export function decideClaim(input: ClaimDecisionInput): ClaimKind | null {
  const p = input.personality ?? PERSONALITIES.balanced;
  if (input.offers.ron) return "ron";
  const gate = (kind: "pon" | "chi" | "kan", chiTiles?: [Tile, Tile]): boolean => {
    if (!input.hand) return true; // 後方互換: 自己ゲート省略
    return keepsAwsWinPath(
      input.hand,
      input.melds ?? [],
      kind,
      input.tile,
      chiTiles,
      input.seatWind ?? "1z",
      input.roundWind ?? "1z",
    );
  };
  if (input.offers.kan && p.allowKanOnDragon && isDragon(input.tile.id) && gate("kan")) {
    return "kan";
  }
  if (input.offers.pon && p.allowPon && (!p.ponDragonOnly || isDragon(input.tile.id)) && gate("pon")) {
    return "pon";
  }
  if (input.offers.chi.length > 0 && p.allowChi && gate("chi", input.offers.chi[0]!.tiles)) {
    return "chi";
  }
  return null;
}
