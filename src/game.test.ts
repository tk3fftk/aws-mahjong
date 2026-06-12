import { describe, it, expect } from "vitest";
import { GameController } from "./game";
import { mpszToTiles, sortTiles } from "./tiles";
import { countDoraHan, uraDoraIndicators } from "./dora";
import { riggedDeal, type RiggedDeal } from "./debug/rigged";
import type { Seat } from "./types";

const ALL_SEATS: Seat[] = ["east", "south", "west", "north"];
const TOTAL_SCORE = 100000;

function totalScore(game: GameController): number {
  return ALL_SEATS.reduce((sum, s) => sum + game.state.players[s].score, 0);
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

  it("配牌時にドラ表示牌が1枚公開されている", () => {
    const game = new GameController({ seed: 42 });
    game.startMatch();
    expect(game.state.doraIndicatorCount).toBe(1);
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
      // south は深いシャンテンの捨て駒手 (CPU リーチを誘発しない)。9m をツモり先頭 8m を打牌
      south: "8m1p4p7p1s4s7s1z2z3z4z5z6z",
      wallHead: "9m",
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

  it("暗槓: 宣言と同時にカンドラが1枚増える", () => {
    const game = riggedGame({ east: "9s9s9s9s2m3m4m6p7p8p2s2s5z6z" });
    expect(game.state.doraIndicatorCount).toBe(1);
    expect(game.humanSelfKan(0).success).toBe(true);
    expect(game.state.doraIndicatorCount).toBe(2);
  });

  it("明槓: claim からのカンでもカンドラが増える", () => {
    const game = riggedGame({
      east: "1m1m1m2p3p4p2s3s4s9p9p1z2z9s",
      south: "1m345m345p678s4z4z4z",
    });
    game.humanDiscard(13);
    game.humanClaim({ kind: "kan" });
    expect(game.state.doraIndicatorCount).toBe(2);
  });

  it("加槓でもカンドラが増える", () => {
    const game = riggedGame({
      east: "1m1m2p3p4p2s3s4s9p9p1z1z2z9s",
      south: "1m345m345p678s4z4z4z",
      wallHead: "9m8p7s6s1m",
    });
    game.humanDiscard(13);
    game.humanClaim({ kind: "pon" });
    game.humanDiscard(0);
    expect(game.state.selfKanOptions).toContainEqual({ kind: "kakan", tileId: "1m" });
    game.humanSelfKan(0);
    expect(game.state.doraIndicatorCount).toBe(2);
  });
});

describe("GameController / ドラ", () => {
  it("ツモ和了でドラが totalHan に加算され、役リストに「ドラ」行が入る", () => {
    // 手牌に 5s×2、表示牌 4s → ドラ=5s で 2飜
    const withDora = riggedGame({ east: "555z234m567m234p55s", deadWall: "4s" });
    expect(withDora.humanDeclareTsumo().success).toBe(true);
    const info = withDora.state.winInfo!;
    expect(info.yakus).toContainEqual({ id: "dora", name: "ドラ", han: 2 });
    expect(info.totalHan).toBe(info.yakus.reduce((s, y) => s + y.han, 0));

    // 三角測量: 表示牌 1z (ドラ=2z、手に無し) だと dora 行なし・2飜少ない
    const noDora = riggedGame({ east: "555z234m567m234p55s", deadWall: "1z" });
    noDora.humanDeclareTsumo();
    const base = noDora.state.winInfo!;
    expect(base.yakus.some((y) => y.id === "dora")).toBe(false);
    expect(info.totalHan).toBe(base.totalHan + 2);
  });

  it("ドラだけでは和了できない (AWS役必須ゲートに数えない)", () => {
    // AWS役なし (1z 刻子のみ) + ドラが2枚乗る表示牌
    const game = riggedGame({ east: "111z234m567m234p55s", deadWall: "4s" });
    const result = game.humanDeclareTsumo();
    expect(result.success).toBe(false);
    expect(result.reason).toBe("AWS役がありません");
  });

  it("役満にはドラを加算しない", () => {
    // 国士無双 (1m 雀頭)。表示牌 9m → ドラ=1m×2 だが加算されない
    const game = riggedGame({
      east: "1m9m1p9p1s9s1z2z3z4z5z6z7z1m",
      deadWall: "9m",
    });
    expect(game.humanDeclareTsumo().success).toBe(true);
    const info = game.state.winInfo!;
    expect(info.isYakuman).toBe(true);
    expect(info.yakus.some((y) => y.id === "dora")).toBe(false);
    expect(info.totalHan).toBe(13);
  });

  it("ドラ牌の暗槓は4枚分カウントされ、カンドラも乗る", () => {
    // east: 9s×4 を暗槓 → リンシャン 2z で 555z+234m+222z+44p+暗槓9s が完成
    // 表示牌1枚目 8s → ドラ=9s×4。カンドラ表示 5m → ドラ=6m×0
    const game = riggedGame({
      east: "9s9s9s9s555z234m44p2z2z",
      deadWall: "8s5m",
      wallEnd: "2z",
    });
    expect(game.humanSelfKan(0).success).toBe(true); // 暗槓 → リンシャン 2z
    expect(game.state.doraIndicatorCount).toBe(2);
    expect(game.humanDeclareTsumo().success).toBe(true);
    const doraRow = game.state.winInfo!.yakus.find((y) => y.id === "dora");
    expect(doraRow?.han).toBe(4); // effectiveHandTiles の3枚射影に引きずられないこと
  });
});

describe("GameController / 局送り (親・家の移り変わり)", () => {
  // 東1で人間 (親) がロン和了できるリグ。pile 0 (次局の親の手) は和了形ではないので、
  // 同じ仕込み壁が再配牌されても東2の CPU 親が即ツモすることはない
  const RON_RIG: RiggedDeal = {
    east: "555z234m67m234p55s1z", // 末尾 1z が初ツモ。5m/8m 待ち (kiro)
    // south は深いシャンテンの捨て駒手 (CPU リーチを誘発しない)。9m をツモり先頭 8m を打牌
    south: "8m1p4p7p1s4s7s1z2z3z4z5z6z",
    wallHead: "9m",
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
    // 点数は引き継がれる (連荘なしでも精算結果は保持)。east は東2の自動進行中に放銃していない
    // (loop は CPU の手番のみ消化するため) ので和了後の値のまま。south は CPU リーチ→和了し得るので不問。
    expect(s.players.east.score).toBe(eastScoreAfterWin);
    // 供託 (CPU リーチ棒) を含めた不変条件: Σ score + riichiPot === 100000 (D-013)。
    // CPU 親 (south) がリーチして即和了し東2が即決することもあるが、不変条件は常に保たれる。
    expect(totalScore(game) + s.riichiPot).toBe(TOTAL_SCORE);
    // east は東2でまだ着手していない (自動進行は人間の手番 or 終局/和了で停止)
    expect(s.players.east.discards).toHaveLength(0);
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

describe("GameController / リーチ (人間)", () => {
  // east: 1z 切りリーチで 5m/8m 待ち (kiro)。CPU 3家は散らばった深いシャンテンの捨て駒手
  // (リーチを誘発せず、5m/8m を打たない)。wallHead で CPU は 7z をツモ、east は 8m を和了。
  // deadWall: 表示牌1枚目(index0)=3z→ドラ4z(手に無し=表ドラ0)、裏(index5)=4s→裏ドラ5s×2。
  const RIICHI_RIG: RiggedDeal = {
    east: "555z234m67m234p55s1z",
    south: "1m4m7m1p4p7p1s4s7s1z2z3z4z",
    west: "2m9m3p6p9p2s5s8s9s1z2z4z6z",
    north: "3m6m9m2p5p8p3s6s9s1z3z4z6z",
    wallHead: "7z7z7z8m",
    deadWall: "3z9m9p9s5z4s",
  };

  it("ツモ直後にリーチ候補が算出される (1z 切りのみテンパイ維持)", () => {
    const game = riggedGame(RIICHI_RIG);
    expect(game.state.riichiCandidates).toEqual([13]);
  });

  it("非候補 index への humanRiichiDiscard は失敗する", () => {
    const game = riggedGame(RIICHI_RIG);
    const result = game.humanRiichiDiscard(0);
    expect(result.success).toBe(false);
    expect(game.state.players.east.isRiichi).toBe(false);
  });

  it("humanRiichiDiscard(13) 成立: −1000・供託1000・横向き位置・不変条件", () => {
    const game = riggedGame(RIICHI_RIG);
    const result = game.humanRiichiDiscard(13);
    expect(result.success).toBe(true);
    const s = game.state;
    // ループは east の canTsumo (8m ツモ) 停止まで自動進行する
    expect(s.players.east.isRiichi).toBe(true);
    expect(s.players.east.score).toBe(24000);
    expect(s.riichiPot).toBe(1000);
    expect(s.players.east.riichiDiscardIndex).toBe(0); // 河の先頭 (1z) が横向き
    expect(totalScore(game) + s.riichiPot).toBe(TOTAL_SCORE);
    expect(s.turn).toBe("east");
    expect(s.canTsumo).toBe(true);
  });

  it("リーチ成立後は再宣言不可 (riichiCandidates が空)", () => {
    const game = riggedGame(RIICHI_RIG);
    game.humanRiichiDiscard(13);
    expect(game.state.players.east.isRiichi).toBe(true);
    expect(game.state.riichiCandidates).toEqual([]);
  });

  it("非門前 (ポン後) はリーチ宣言できない (candidates が空)", () => {
    // east は 1m 対子。south の 1m をポンすると非門前 → riichiCandidates は空
    const game = riggedGame({
      east: "1m1m2p3p4p2s3s4s9p9p1z1z2z9s",
      south: "1m345m345p678s4z4z4z",
    });
    game.humanDiscard(13); // 9s → south 1m → claim
    expect(game.humanClaim({ kind: "pon" }).success).toBe(true);
    expect(game.state.riichiCandidates).toEqual([]);
  });

  it("リーチ後はロック (自動ツモ切り) され、selfKanOptions は常に空", () => {
    // east に 9s×4 を仕込み、リーチ後もカン候補が出ないことを確認するためのリグ。
    // 1z 切りで 5m/8m 待ちを保つ形に 9s×4 はないので、別途カン抑止だけ確認する。
    const game = riggedGame(RIICHI_RIG);
    game.humanRiichiDiscard(13);
    // canTsumo 停止中だが、リーチ中は暗槓候補を出さない
    expect(game.state.selfKanOptions).toEqual([]);
    // ツモ牌 (末尾 8m) 以外の打牌は拒否、ツモ牌の打牌は受理 (ツモ拒否)
    const east = game.state.players.east;
    const tsumoIdx = east.hand.length - 1;
    expect(game.humanDiscard(0).success).toBe(false);
    const discardsBefore = east.discards.length;
    expect(game.humanDiscard(tsumoIdx).success).toBe(true);
    // ツモ拒否で 8m を捨てた → 以後 8m はフリテン履歴に入る
    expect(game.state.players.east.discardedIds).toContain("8m");
    expect(game.state.players.east.discards.length).toBe(discardsBefore + 1);
  });

  it("一発ツモ: riichi/ippatsu/menzen-tsumo/kiro + 裏ドラ + 供託獲得", () => {
    const game = riggedGame(RIICHI_RIG);
    game.humanRiichiDiscard(13);
    expect(game.state.canTsumo).toBe(true);
    const result = game.humanDeclareTsumo();
    expect(result.success).toBe(true);
    const info = game.state.winInfo!;
    const ids = info.yakus.map((y) => y.id);
    expect(ids).toContain("riichi");
    expect(ids).toContain("ippatsu");
    expect(ids).toContain("menzen-tsumo");
    expect(ids).toContain("kiro");
    // 裏ドラ: テスト内で期待値を計算 (表ドラと同じ全牌リスト)
    const allIds = [
      ...info.hand,
      ...info.melds.flatMap((m) => m.tiles),
    ].map((t) => t.id);
    const uraInd = uraDoraIndicators(game.state.deadWall, game.state.doraIndicatorCount);
    const expectedUra = countDoraHan(allIds, uraInd.map((t) => t.id));
    expect(expectedUra).toBeGreaterThan(0); // リグ上 裏ドラ 5s×2 を保証
    expect(info.yakus.find((y) => y.id === "ura-dora")?.han).toBe(expectedUra);
    expect(info.uraIndicators).not.toBeNull();
    expect(info.riichiPotWon).toBe(1000);
    expect(game.state.riichiPot).toBe(0);
    expect(totalScore(game)).toBe(TOTAL_SCORE); // 供託回収後は完全保存
    expect(info.totalHan).toBe(info.yakus.reduce((sum, y) => sum + y.han, 0));
  });
});

describe("GameController / リーチ (一発の消滅・宣言牌ロン)", () => {
  it("宣言牌が即ロンされたらリーチ不成立 (供託0・isRiichi=false)", () => {
    // east は 8m 切りでもテンパイを保つ形。south は 5m/8m 待ち (kiro) で 8m を即ロン。
    const game = riggedGame({
      east: "555z234m67m234p55s8m", // 末尾 8m が初ツモ。8m 切りリーチが候補
      south: "666z234m67m234p55s", // 5m/8m 待ち (Cost Explorer 刻子)
    });
    // 8m の index を特定 (末尾)
    const idx = game.state.players.east.hand.length - 1;
    expect(game.state.riichiCandidates).toContain(idx);
    const result = game.humanRiichiDiscard(idx); // 8m 宣言打牌 → south 即ロン
    expect(result.success).toBe(true);
    const s = game.state;
    expect(s.phase).toBe("win");
    expect(s.winInfo?.winner).toBe("south");
    expect(s.players.east.isRiichi).toBe(false); // リーチ不成立
    expect(s.riichiPot).toBe(0); // 棒は出ない
    expect(totalScore(game)).toBe(TOTAL_SCORE);
  });
});

describe("GameController / リーチ (AWS役ゲート)", () => {
  it("リーチのみでは和了できない: 和了牌をツモっても canTsumo=false で自動ツモ切り", () => {
    // east は AWS役のないテンパイ: 1z(東)刻子 + 順子で 5s 単騎待ち。
    // 1z は東場・東家で場風+自風 (標準2飜) だが AWS役ではないため、和了牌をツモっても和了不可。
    const game = riggedGame({
      east: "111z234m567m234p5s9p", // 末尾 9p が初ツモ。9p 切りで 5s 単騎テンパイ
      wallHead: "9m9m9m5s", // CPU は 9m をツモ、east の次ツモ = 5s (和了牌だが AWS役なし)
    });
    const idx = game.state.players.east.hand.length - 1; // 9p
    expect(game.state.riichiCandidates).toContain(idx);
    game.humanRiichiDiscard(idx); // 9p 宣言打牌 → 5s 単騎リーチ
    const s = game.state;
    // リーチ後、和了牌 5s をツモっても canTsumo は false (AWS役ゲート) → 自動ツモ切りで和了しない
    expect(s.phase).not.toBe("win");
    expect(s.players.east.isRiichi).toBe(true);
    // 和了牌 5s が河に積まれている (ツモ和了せず切った)
    expect(s.players.east.discardedIds).toContain("5s");
  });
});

describe("GameController / CPU リーチ", () => {
  it("CPU (south) がテンパイで自動リーチする: −1000・供託1000・横向き・以後ツモ切り", () => {
    // south に 5m/8m 待ち (kiro) テンパイを仕込む。east は安全牌を打牌。south は 9p をツモり宣言。
    const game = riggedGame({
      east: "1p4p7p1s4s7s9s2z3z4z5z6z7z9m", // 親14枚。先頭(1p)は安全 (south は 5m/8m 待ち)
      south: "555z234m67m234p55s", // 5m/8m 待ち (Kiro)
      west: "1m4m7m1p4p7p1s4s7s2z3z4z6z", // 散らばった捨て駒手 (リーチ誘発しない)
      north: "2m9m3p6p9p2s5s8s9s2z4z6z7z",
      wallHead: "9p9p9p", // south は 9p をツモ → 和了牌でないのでリーチ宣言
    });
    game.humanDiscard(0); // east 安全打牌 → south がリーチ宣言 → west/north → east に戻る
    const s = game.state;
    expect(s.players.south.isRiichi).toBe(true);
    expect(s.players.south.score).toBe(24000);
    expect(s.riichiPot).toBe(1000);
    expect(s.players.south.riichiDiscardIndex).toBe(0); // 初打牌が横向き
    expect(totalScore(game) + s.riichiPot).toBe(TOTAL_SCORE);
    // south の手牌構成 (純手牌の id 集合) はリーチ後ツモ切りで変わらない
    const handIds = s.players.south.hand.map((t) => t.id).sort();
    expect(handIds).toEqual(mpszToTiles("555z234m67m234p55s").sort());
  });

  it("リーチフリテン: 待ち牌の見逃しで permanentFuriten、以後同じ牌でロン窓が開かない", () => {
    // east リーチ (Kiro 5m/8m 待ち)。south は深いシャンテンで 8m を連続ツモ切り。
    const game = riggedGame({
      east: "555z234m67m234p55s1z", // 1z 切りリーチで 5m/8m 待ち (kiro)
      south: "8m8m1p4p7p3p1s4s7s9s2z4z6z", // 先頭 8m を打牌 (8m×2、深いシャンテン)
      wallHead: "9m9p9s9m9p", // south=9m→8m打, west=9p, north=9s, east=9m(非和了牌), south=9p→8m打
    });
    game.humanRiichiDiscard(13); // east リーチ宣言 → south が 8m 打牌 → east ロン窓
    let s = game.state;
    expect(s.phase).toBe("claim");
    expect(s.claim?.tile.id).toBe("8m");
    // 初回の待ち牌は本人がロン可能 (適格性は furiten セット前で判定)
    expect(s.claim?.offers.ron).toBe(true);
    // ただし eager set により、この時点で既にフリテンが立っている
    expect(s.players.east.permanentFuriten).toBe(true);

    game.humanSkipClaim(); // ロンを見送る
    s = game.state;
    expect(s.players.east.permanentFuriten).toBe(true);
    // 見送り後はループが進み、south が再度 8m を打っても permanentFuriten でロン窓が開かない
    expect(s.phase).not.toBe("claim");
    // south は 8m を2回河に置いた (どちらもロンされず残る) ことを確認
    const south8m = s.players.south.discards.filter((t) => t.id === "8m").length;
    expect(south8m).toBeGreaterThanOrEqual(2);
  });
});

describe("GameController / 供託の持ち越しと残置", () => {
  it("リーチ後に流局すると供託が残り、次局へ持ち越される (不変条件維持)", () => {
    // east は AWS役のないテンパイ (1z刻子 + 5s単騎)。リーチしても和了できず流局まで進む。
    const game = riggedGame({
      east: "111z234m567m234p5s9p",
      south: "1m4m7m1p4p7p1s4s7s2z3z4z6z",
      west: "2m9m3p6p9p2s5s8s9s2z4z6z7z",
      north: "3m6m9m2p5p8p3s6s9s1z3z4z6z",
    });
    const idx = game.state.players.east.hand.length - 1; // 9p
    expect(game.state.riichiCandidates).toContain(idx);
    game.humanRiichiDiscard(idx); // 5s 単騎リーチ (AWS役なし → 和了不可)
    playRoundToEnd(game);
    expect(game.state.phase).toBe("draw_game");
    expect(game.state.riichiPot).toBe(1000);
    expect(totalScore(game)).toBe(99000); // east が 1000 供託に出した
    expect(totalScore(game) + game.state.riichiPot).toBe(TOTAL_SCORE);

    game.startNextRound();
    // 次局へ供託が持ち越される (CPU 親が追いリーチし得るため ≥1000 で断言)
    expect(game.state.riichiPot).toBeGreaterThanOrEqual(1000);
    expect(totalScore(game) + game.state.riichiPot).toBe(TOTAL_SCORE);
  });
});
