import { describe, it, expect } from "vitest";
import { GameController } from "./game";
import { ALL_TILE_IDS, mpszToTiles, sortTiles } from "./tiles";
import type { Copy, Seat, Tile, TileId } from "./types";

const ALL_SEATS: Seat[] = ["east", "south", "west", "north"];
const TOTAL_SCORE = 100000;

function totalScore(game: GameController): number {
  return ALL_SEATS.reduce((sum, s) => sum + game.state.players[s].score, 0);
}

// dealInitialHands の配り順 (4枚×3周 + 1枚ずつ + 親の初ツモ) における各席の取得位置。
// east の最終要素 (52) が親の初ツモで、手牌の末尾に置かれる。
const DEAL_INDICES: Record<Seat, number[]> = {
  east: [0, 1, 2, 3, 16, 17, 18, 19, 32, 33, 34, 35, 48, 52],
  south: [4, 5, 6, 7, 20, 21, 22, 23, 36, 37, 38, 39, 49],
  west: [8, 9, 10, 11, 24, 25, 26, 27, 40, 41, 42, 43, 50],
  north: [12, 13, 14, 15, 28, 29, 30, 31, 44, 45, 46, 47, 51],
};
const WALL_START = 53;

interface RiggedDeal {
  east: string; // 14枚 (末尾 = 親の初ツモ)
  south?: string; // 各13枚
  west?: string;
  north?: string;
  wallHead?: string; // ライブ壁の先頭に並べる牌
}

/** 各席の配牌とライブ壁先頭を指定した仕込み壁 (136枚) を作る。残りはプール順で埋める */
function riggedDeal(spec: RiggedDeal): Tile[] {
  // copy-major 順 (copy0 の34種 → copy1 の34種 → ...)。
  // 未指定席の手牌に同一牌4枚が固まって CPU が暗槓してしまうのを防ぐ
  const pool: Tile[] = [];
  for (let c = 0; c < 4; c++) {
    for (const id of ALL_TILE_IDS) pool.push({ id, copy: c as Copy });
  }
  const take = (id: TileId): Tile => {
    const i = pool.findIndex((t) => t.id === id);
    if (i < 0) throw new Error(`pool exhausted for ${id}`);
    return pool.splice(i, 1)[0]!;
  };
  const wall: (Tile | null)[] = new Array(136).fill(null);
  for (const seat of ALL_SEATS) {
    const mpsz = spec[seat];
    if (!mpsz) continue;
    const ids = mpszToTiles(mpsz);
    if (ids.length !== DEAL_INDICES[seat].length) {
      throw new Error(`${seat} hand must be ${DEAL_INDICES[seat].length} tiles`);
    }
    DEAL_INDICES[seat].forEach((idx, i) => {
      wall[idx] = take(ids[i]!);
    });
  }
  if (spec.wallHead) {
    mpszToTiles(spec.wallHead).forEach((id, i) => {
      wall[WALL_START + i] = take(id);
    });
  }
  for (let i = 0; i < wall.length; i++) {
    if (wall[i] === null) wall[i] = pool.shift()!;
  }
  return wall as Tile[];
}

/** 仕込み壁 + CPUは常に先頭牌を打牌する固定rng のコントローラ */
function riggedGame(spec: RiggedDeal): GameController {
  const game = new GameController({
    wallFactory: () => riggedDeal(spec),
    rng: () => 0,
  });
  game.startMatch();
  return game;
}

/** 1局を終局 (win/draw_game) まで進める。人間は先頭打牌・claim は見送り */
function playRoundToEnd(game: GameController): void {
  for (let safety = 0; safety < 600; safety++) {
    const phase = game.state.phase;
    if (phase === "draw_game" || phase === "win") return;
    if (phase === "claim") {
      game.humanSkipClaim();
    } else {
      game.humanDiscard(0);
    }
  }
  throw new Error("round did not finish");
}

describe("GameController / 4人対戦の基本", () => {
  it("startMatch 後 (東1局)、親(east)=14枚 / 他3家=各13枚 / 山69枚 / 王牌14枚", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();
    const s = game.state;
    expect(s.players.east.hand).toHaveLength(14);
    expect(s.players.south.hand).toHaveLength(13);
    expect(s.players.west.hand).toHaveLength(13);
    expect(s.players.north.hand).toHaveLength(13);
    expect(s.wall).toHaveLength(69);
    expect(s.deadWall).toHaveLength(14);
    expect(s.phase).toBe("discard");
    expect(s.turn).toBe("east");
    expect(s.players.east.isDealer).toBe(true);
    expect(s.players.south.isDealer).toBe(false);
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });

  it("初回配牌: east の最初の13枚は整列済み、14枚目はツモ牌 (lastDrawTile)", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();
    const hand = game.state.players.east.hand;
    const first13 = hand.slice(0, 13);
    expect(first13).toEqual(sortTiles(first13));
    expect(hand[13]).toBe(game.state.lastDrawTile);
  });

  it("humanDiscard で CPU 3人が順に手番を消化し、ターンが east に戻る", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();
    const handBefore = [...game.state.players.east.hand];
    game.humanDiscard(0);
    const s = game.state;
    expect(s.players.east.discards).toHaveLength(1);
    expect(s.players.east.discards[0]).toEqual(handBefore[0]);
    expect(s.players.east.discardedIds).toEqual([handBefore[0]!.id]);
    // south → west → north が自動で1枚ずつ打牌し、east がツモ済みで戻る
    expect(s.turn).toBe("east");
    expect(s.phase).toBe("discard");
    for (const seat of ["south", "west", "north"] as Seat[]) {
      expect(s.players[seat].hand).toHaveLength(13);
      expect(s.players[seat].discards).toHaveLength(1);
    }
    expect(s.players.east.hand).toHaveLength(14);
    // 1巡で山は4枚減る (CPU3人 + east の次ツモ)
    expect(s.wall).toHaveLength(69 - 4);
  });

  it("山が0になると流局 (phase=draw_game)", () => {
    const game = new GameController({ seed: 1 });
    game.startMatch();
    // 人間は常に先頭を打牌し、claim は見送って1局を完走させる
    for (let safety = 0; safety < 600; safety++) {
      const phase = game.state.phase;
      if (phase === "draw_game" || phase === "win") break;
      if (phase === "claim") {
        game.humanSkipClaim();
      } else {
        game.humanDiscard(0);
      }
    }
    expect(["draw_game", "win"]).toContain(game.state.phase);
    if (game.state.phase === "draw_game") {
      expect(game.state.wall).toHaveLength(0);
    }
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });

  it("humanDeclareTsumo: AWS役無しなら無効 (phase は変わらない)", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();
    const result = game.humanDeclareTsumo();
    expect(result.success).toBe(false);
    expect(game.state.phase).toBe("discard");
  });

  it("canTsumo: 和了形のときだけ true になる (UI のボタン活性用)", () => {
    // ランダム配牌 (seed 42) は和了形でない
    const random = new GameController({ seed: 42 });
    random.startMatch();
    expect(random.state.canTsumo).toBe(false);

    // 仕込み壁で kiro 確定の和了形 → true
    const winning = riggedGame({ east: "555z234m567m234p55s" });
    expect(winning.state.canTsumo).toBe(true);

    // 和了形でも AWS役が無ければ false (1z 刻子のみ)
    const noAws = riggedGame({ east: "111z234m567m234p55s" });
    expect(noAws.state.canTsumo).toBe(false);
  });

  it("moveHumanTile: from の牌が to の位置へ移動する (from<to / from>to)", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();

    // from < to
    const before = [...game.state.players.east.hand];
    const moved = before[0]!;
    game.moveHumanTile(0, 5);
    const after = game.state.players.east.hand;
    expect(after).toHaveLength(before.length);
    expect(after[5]).toBe(moved);
    // 元の 1..5 番目が 1つ前へ詰まる
    expect(after.slice(0, 5)).toEqual(before.slice(1, 6));

    // from > to (今の並びから 5 を 1 へ戻す)
    const handB = [...game.state.players.east.hand];
    const movedB = handB[5]!;
    game.moveHumanTile(5, 1);
    expect(game.state.players.east.hand[1]).toBe(movedB);
  });

  it("moveHumanTile: 範囲外・from===to は手牌を変えない", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();
    const before = [...game.state.players.east.hand];

    game.moveHumanTile(0, 99); // 範囲外
    expect(game.state.players.east.hand).toEqual(before);

    game.moveHumanTile(-1, 3); // 範囲外
    expect(game.state.players.east.hand).toEqual(before);

    game.moveHumanTile(3, 3); // no-op
    expect(game.state.players.east.hand).toEqual(before);
  });

  it("moveHumanTile: discard フェーズ以外 (流局後) は無視される", () => {
    const game = new GameController({ seed: 1 });
    game.startMatch();
    let safety = 500;
    while (game.state.phase === "discard" && safety-- > 0) {
      game.humanDiscard(0);
    }
    expect(game.state.phase).not.toBe("discard");
    const before = [...game.state.players.east.hand];
    game.moveHumanTile(0, 3);
    expect(game.state.players.east.hand).toEqual(before);
  });

  it("ツモ後、east の手牌は再ソートされず手動順が維持され、ツモ牌が末尾に追加される", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();

    // 手動で並び替える (0 番目を末尾へ) → 整列が崩れた状態を作る
    game.moveHumanTile(0, 13);
    // ツモ牌(末尾)を捨てると、並び替えた 13枚が残る
    const kept = game.state.players.east.hand.slice(0, 13);
    game.humanDiscard(13);

    // south 自動打牌 → east が再びツモ (14枚)
    expect(game.state.turn).toBe("east");
    const hand = game.state.players.east.hand;
    expect(hand).toHaveLength(14);
    // 残った13枚は順序そのまま (再ソートされていない)
    expect(hand.slice(0, 13)).toEqual(kept);
    // ツモ牌は末尾、かつ lastDrawTile と同一参照
    expect(hand[13]).toBe(game.state.lastDrawTile);
  });
});

describe("GameController / ツモ精算 (仕込み壁)", () => {
  it("親ツモ: 子3人が均等に支払い、合計点は保存される", () => {
    const game = riggedGame({ east: "555z234m567m234p55s" });
    const result = game.humanDeclareTsumo();
    expect(result.success).toBe(true);
    const s = game.state;
    expect(s.phase).toBe("win");
    expect(s.winInfo?.isTsumo).toBe(true);
    expect(s.winInfo?.loserSeat).toBeNull();
    expect(s.winInfo?.yakus.map((y) => y.id)).toContain("kiro");
    const payments = s.winInfo!.payments;
    expect(payments).toHaveLength(4);
    const winnerDelta = payments.find((p) => p.seat === "east")!.delta;
    const koDeltas = payments.filter((p) => p.seat !== "east").map((p) => p.delta);
    expect(new Set(koDeltas).size).toBe(1);
    expect(winnerDelta).toBe(-koDeltas[0]! * 3);
    expect(s.players.east.score).toBe(25000 + winnerDelta);
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });
});

describe("GameController / ロン", () => {
  it("CPU が人間の放銃をロンする (放銃者のみ支払い)", () => {
    const game = riggedGame({
      // east の初ツモ (末尾) が 8m。south は kiro 確定で 5m/8m 待ち
      east: "2m2m5p5p9p9p1s1s4s4s1z1z2z8m",
      south: "555z234m67m234p55s",
    });
    game.humanDiscard(13); // 8m を放銃
    const s = game.state;
    expect(s.phase).toBe("win");
    expect(s.winInfo?.winner).toBe("south");
    expect(s.winInfo?.isTsumo).toBe(false);
    expect(s.winInfo?.loserSeat).toBe("east");
    expect(s.winInfo?.payments).toHaveLength(2);
    expect(s.players.east.score).toBeLessThan(25000);
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });

  it("人間がロン可能な打牌で claim フェーズに停止し、humanClaim(ron) で和了", () => {
    const game = riggedGame({
      east: "555z234m67m234p55s1z", // 末尾 1z が初ツモ (捨て牌用)。5m/8m 待ち
      south: "8m999m1p1p2p2p3p3p4s4s5z", // 先頭 8m を必ず打牌する
    });
    game.humanDiscard(13); // 1z を捨てる → south が 8m を打牌 → claim
    expect(game.state.phase).toBe("claim");
    expect(game.state.claim?.offers.ron).toBe(true);
    expect(game.state.claim?.discarder).toBe("south");
    expect(game.state.claim?.tile.id).toBe("8m");

    const result = game.humanClaim({ kind: "ron" });
    expect(result.success).toBe(true);
    const s = game.state;
    expect(s.phase).toBe("win");
    expect(s.winInfo?.winner).toBe("east");
    expect(s.winInfo?.isTsumo).toBe(false);
    expect(s.winInfo?.loserSeat).toBe("south");
    // 和了牌が手牌に含まれる
    expect(s.winInfo?.hand.filter((t) => t.id === "8m")).toHaveLength(1);
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });

  it("humanSkipClaim でロンを見送るとゲームが続行する", () => {
    const game = riggedGame({
      east: "555z234m67m234p55s1z",
      south: "8m999m1p1p2p2p3p3p4s4s5z",
      west: "1p1p6p6p7p7p8p1s1s2s2s9s7z", // 先頭 1p (east は鳴けない)
      north: "1z1z3s3s5s5s6s6s8s8s9s9s7z", // 先頭 3s (east は鳴けない)
      wallHead: "9p9p9p9p",
    });
    game.humanDiscard(13);
    expect(game.state.phase).toBe("claim");
    game.humanSkipClaim();
    const s = game.state;
    expect(s.phase).toBe("discard");
    expect(s.turn).toBe("east");
    expect(s.winInfo).toBeNull();
    // south の捨て牌はそのまま残る
    expect(s.players.south.discards.map((t) => t.id)).toContain("8m");
  });

  it("フリテン: 自分が待ち牌を捨てた後はロンの選択肢が出ない", () => {
    const game = riggedGame({
      east: "555z234m67m234p55s5m", // 初ツモ 5m (待ち牌) を捨ててフリテンになる
      south: "8m999m1p1p2p2p3p3p4s4s5z",
      west: "1p1p6p6p7p7p8p1s1s2s2s9s7z",
      north: "1z1z3s3s5s5s6s6s8s8s9s9s7z",
      wallHead: "9p9p9p9p",
    });
    game.humanDiscard(13); // 5m 打牌 → フリテン。south が 8m を打つがロン不可
    const s = game.state;
    expect(s.phase).toBe("discard");
    expect(s.turn).toBe("east");
    expect(s.players.east.discardedIds).toContain("5m");
    expect(s.winInfo).toBeNull();
  });
});

describe("GameController / ポン・チー", () => {
  it("人間が CPU の打牌をポンし、ツモ無しで打牌待ちになる", () => {
    const game = riggedGame({
      east: "1m1m2p3p4p2s3s4s9p9p1z1z2z9s", // 1m 対子持ち。初ツモ 9s を捨てる
      south: "1m345m345p678s4z4z4z", // 先頭 1m を必ず打牌
    });
    game.humanDiscard(13); // 9s → south が 1m 打牌 → claim
    expect(game.state.phase).toBe("claim");
    expect(game.state.claim?.offers.pon).toBe(true);
    expect(game.state.claim?.offers.chi).toEqual([]); // east は south の下家ではない

    const result = game.humanClaim({ kind: "pon" });
    expect(result.success).toBe(true);
    const s = game.state;
    expect(s.turn).toBe("east");
    expect(s.phase).toBe("discard");
    expect(s.lastDrawTile).toBeNull();
    const meld = s.players.east.melds[0]!;
    expect(meld.kind).toBe("pon");
    expect(meld.tiles.map((t) => t.id)).toEqual(["1m", "1m", "1m"]);
    expect(meld.calledFrom).toBe("south");
    // 鳴かれた牌は河から消えるが、フリテン履歴には残る
    expect(s.players.south.discards).toHaveLength(0);
    expect(s.players.south.discardedIds).toEqual(["1m"]);
    // 手牌は 13 - 2 = 11枚 (打牌待ちの「1枚多い」状態)
    expect(s.players.east.hand).toHaveLength(11);
    // ポン直後はツモ和了できない (ボタンも非活性)
    expect(s.canTsumo).toBe(false);
    expect(game.humanDeclareTsumo().success).toBe(false);
  });

  it("チーは上家 (北家) の打牌のみ。複数候補から選択できる", () => {
    const game = riggedGame({
      east: "3m4m6m7m9p9p1s1s2z2z3z3z9s8s", // 初ツモ 8s を捨てる
      south: "1p1p2m2m5s5s6s6s7z7z4z4z4z", // 先頭 1p (east は鳴けない)
      west: "2p2p3p3p4p4p1s2s3s4s4s5z5z", // 先頭 2p (east は鳴けない)
      north: "5m8p8p8p9m9m6p6p7p7p9s9s5z", // 先頭 5m → east がチー可能
    });
    game.humanDiscard(13); // 8s → south 1p → west 2p → north 5m → claim
    expect(game.state.phase).toBe("claim");
    const offers = game.state.claim!.offers;
    expect(offers.chi.map((v) => v.tiles.map((t) => t.id).join(","))).toEqual([
      "3m,4m",
      "4m,6m",
      "6m,7m",
    ]);

    const result = game.humanClaim({ kind: "chi", chiIndex: 2 }); // 6m7m を選ぶ
    expect(result.success).toBe(true);
    const s = game.state;
    expect(s.turn).toBe("east");
    const meld = s.players.east.melds[0]!;
    expect(meld.kind).toBe("chi");
    expect(meld.tiles.map((t) => t.id).sort()).toEqual(["5m", "6m", "7m"]);
    expect(meld.calledFrom).toBe("north");
    // 3m4m は手牌に残る
    const handIds = s.players.east.hand.map((t) => t.id);
    expect(handIds).toContain("3m");
    expect(handIds).toContain("4m");
    expect(handIds).not.toContain("6m");
    expect(s.players.north.discards).toHaveLength(0);
    expect(s.players.north.discardedIds).toEqual(["5m"]);
  });
});

describe("GameController / CPU の優先順位", () => {
  it("CPU はツモ和了できるとき暗槓より和了を優先する", () => {
    const game = riggedGame({
      east: "2m2m5p5p9p9p1s1s4s4s1z1z2z2z", // 初ツモ 2z を捨てるだけ (south は使えない)
      south: "1m1m1m2m3m456p555z9s9s", // 4枚目の 1m で和了形 (kiro) かつ暗槓可能
      wallHead: "1m",
    });
    game.humanDiscard(13); // south が 1m をツモ → 暗槓せずツモ和了するべき
    const s = game.state;
    expect(s.phase).toBe("win");
    expect(s.winInfo?.winner).toBe("south");
    expect(s.winInfo?.isTsumo).toBe(true);
    expect(s.players.south.melds).toHaveLength(0); // 暗槓していない
  });
});

describe("GameController / カン", () => {
  it("暗槓: 宣言するとリンシャンツモで山末尾から補充される", () => {
    const game = riggedGame({
      east: "9s9s9s9s2m3m4m6p7p8p2s2s5z6z", // 9s×4 持ち
    });
    expect(game.state.selfKanOptions).toContainEqual({ kind: "ankan", tileId: "9s" });
    const wallBefore = game.state.wall.length; // 69
    const lastWallTile = game.state.wall[wallBefore - 1]!;

    const result = game.humanSelfKan(0);
    expect(result.success).toBe(true);
    const s = game.state;
    const meld = s.players.east.melds[0]!;
    expect(meld.kind).toBe("ankan");
    expect(meld.calledFrom).toBeNull();
    expect(meld.tiles).toHaveLength(4);
    // リンシャンは山末尾から。王牌は14枚のまま
    expect(s.wall).toHaveLength(wallBefore - 1);
    expect(s.deadWall).toHaveLength(14);
    expect(s.players.east.hand.map((t) => `${t.id}:${t.copy}`)).toContain(
      `${lastWallTile.id}:${lastWallTile.copy}`,
    );
    // 手牌 14 - 4 + 1 = 11枚で打牌待ち、リンシャンツモ和了も可能な状態
    expect(s.players.east.hand).toHaveLength(11);
    expect(s.turn).toBe("east");
    expect(s.phase).toBe("discard");
    expect(s.lastDrawTile).not.toBeNull();
  });

  it("明槓: claim から宣言してリンシャンツモする", () => {
    const game = riggedGame({
      east: "1m1m1m2p3p4p2s3s4s9p9p1z2z9s", // 1m×3 持ち。初ツモ 9s を捨てる
      south: "1m345m345p678s4z4z4z", // 先頭 1m を打牌
    });
    game.humanDiscard(13);
    expect(game.state.phase).toBe("claim");
    expect(game.state.claim?.offers.kan).toBe(true);

    const wallBefore = game.state.wall.length; // south がツモ済みなので 68
    const result = game.humanClaim({ kind: "kan" });
    expect(result.success).toBe(true);
    const s = game.state;
    const meld = s.players.east.melds[0]!;
    expect(meld.kind).toBe("minkan");
    expect(meld.tiles.map((t) => t.id)).toEqual(["1m", "1m", "1m", "1m"]);
    expect(meld.calledFrom).toBe("south");
    expect(s.wall).toHaveLength(wallBefore - 1); // リンシャン分
    expect(s.turn).toBe("east");
    expect(s.lastDrawTile).not.toBeNull(); // リンシャンツモ和了可能
    // 手牌 13 - 3 + 1 = 11枚
    expect(s.players.east.hand).toHaveLength(11);
  });

  it("加槓: ポン済みの面子に4枚目を足してリンシャンツモする", () => {
    const game = riggedGame({
      east: "1m1m2p3p4p2s3s4s9p9p1z1z2z9s",
      south: "1m345m345p678s4z4z4z",
      // east のポン後の巡で 4枚目の 1m をツモらせる:
      // 消費順 = south(初巡)→[east ポン・打牌]→south→west→north→east
      wallHead: "9m8p7s6s1m",
    });
    game.humanDiscard(13); // 9s
    game.humanClaim({ kind: "pon" }); // 1m ポン
    game.humanDiscard(0); // ポン後の打牌 → CPU 3人 → east が 1m をツモ
    const s1 = game.state;
    expect(s1.turn).toBe("east");
    expect(s1.lastDrawTile?.id).toBe("1m");
    expect(s1.selfKanOptions).toContainEqual({ kind: "kakan", tileId: "1m" });

    const result = game.humanSelfKan(0);
    expect(result.success).toBe(true);
    const meld = game.state.players.east.melds[0]!;
    expect(meld.kind).toBe("kakan");
    expect(meld.tiles.map((t) => t.id)).toEqual(["1m", "1m", "1m", "1m"]);
    expect(game.state.lastDrawTile).not.toBeNull(); // リンシャン
  });
});

describe("GameController / 局送り (親・家の移り変わり)", () => {
  // 東1で人間 (親) がロン和了できるリグ。pile 0 (次局の親の手) は和了形ではないので、
  // 同じ仕込み壁が再配牌されても東2の CPU 親が即ツモすることはない
  const RON_RIG: RiggedDeal = {
    east: "555z234m67m234p55s1z", // 末尾 1z が初ツモ。5m/8m 待ち (kiro)
    south: "8m999m1p1p2p2p3p3p4s4s5z", // 先頭 8m を打牌 → 人間がロン
  };

  function winRound1(game: GameController): void {
    game.humanDiscard(13); // 1z → south が 8m 打牌 → claim
    expect(game.humanClaim({ kind: "ron" }).success).toBe(true);
    expect(game.state.phase).toBe("win");
  }

  it("和了後の startNextRound で親が south に移り、家が一巡ずれる", () => {
    const game = riggedGame(RON_RIG);
    winRound1(game);
    const eastScoreAfterWin = game.state.players.east.score;
    const southScoreAfterWin = game.state.players.south.score;

    game.startNextRound();
    const s = game.state;
    expect(s.roundIndex).toBe(1); // 東2局
    expect(s.players.south.isDealer).toBe(true);
    expect(s.players.east.isDealer).toBe(false);
    // 風はツモ順で回る: 親 south=東家、west=南家、north=西家、east=北家
    expect(s.players.south.seatWind).toBe("1z");
    expect(s.players.west.seatWind).toBe("2z");
    expect(s.players.north.seatWind).toBe("3z");
    expect(s.players.east.seatWind).toBe("4z");
    // 点数は引き継がれる (連荘なしでも精算結果は保持)
    expect(s.players.east.score).toBe(eastScoreAfterWin);
    expect(s.players.south.score).toBe(southScoreAfterWin);
    expect(totalScore(game)).toBe(TOTAL_SCORE);
    // 親 (CPU) は自動進行し、人間の番か claim で停止している
    expect(["discard", "claim"]).toContain(s.phase);
    if (s.phase === "discard") expect(s.turn).toBe("east");
    // CPU 親も配牌14枚から1枚打牌している
    expect(s.players.south.discards.length).toBeGreaterThanOrEqual(1);
  });

  it("流局でも親は交代する (連荘なし)", () => {
    const game = new GameController({ seed: 1 });
    game.startMatch();
    playRoundToEnd(game);
    game.startNextRound();
    expect(game.state.roundIndex).toBe(1);
    expect(game.state.players.south.isDealer).toBe(true);
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });

  it("東4局終了後の startNextRound で終局 (round_end)、点数は動かない", () => {
    const game = new GameController({ seed: 1 });
    game.startMatch();
    for (let round = 0; round < 4; round++) {
      expect(game.state.roundIndex).toBe(round);
      expect(game.state.players[ALL_SEATS[round]!].isDealer).toBe(true);
      playRoundToEnd(game);
      game.startNextRound();
    }
    expect(game.state.phase).toBe("round_end");
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });

  it("終局から startMatch でやり直すと 25000点×4・東1局に戻る", () => {
    const game = riggedGame(RON_RIG);
    winRound1(game);
    game.startMatch();
    const s = game.state;
    expect(s.roundIndex).toBe(0);
    for (const seat of ALL_SEATS) {
      expect(s.players[seat].score).toBe(25000);
    }
    expect(s.players.east.isDealer).toBe(true);
    expect(s.players.east.seatWind).toBe("1z");
  });

  it("局の途中の startNextRound は no-op", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();
    game.startNextRound();
    expect(game.state.roundIndex).toBe(0);
    expect(game.state.phase).toBe("discard");
  });
});
