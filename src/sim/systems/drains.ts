import type { SimGrid, PipeFlow, SuctionMote } from "../grid";
import { MaterialCategory, MaterialId } from "../types";
import { MATERIALS } from "../materials";
import { NEIGHBORS_8 } from "../neighbors";
import { bodyCircuitState } from "./electricity";
import { PIPE_FILLED_META, PIPE_LIQUID_MASK } from "../metaBits";

/*
 * ── Ralo, Cano e Torneira ────────────────────────────────────────────────
 *
 * Ralo: a normal paintable Sólido — switches on/off exactly like Ventilador
 * (see stepCircuitBlock, the same generic body-union mechanism HeatBlock/
 * ColdBlock already use). While on, any Líquido touching it has a small,
 * weak per-tick chance of being sucked in. Absorbed Líquido becomes a
 * `PipeFlow` that visibly crawls into a connected Cano network — heading
 * for an open Torneira if one is reachable (`kind: "release"`, exits back
 * into the world there), or, failing that, the nearest still-empty Cano
 * cell (`kind: "store"`, just parks there instead) — or, if there's no
 * Cano touching it at all, simply vanishes as always.
 *
 * Cano: a conduit and, in the same breath, a reservoir. A cell flagged
 * PIPE_FILLED_META is holding one unit of some Líquido in place — the
 * network fills up cell by cell as the Ralo feeds it faster than any
 * Torneira drains it, exactly like a real pipe backing up.
 *
 * Torneira: the only place a network's Líquido — freshly arriving, or
 * already sitting stored in the Cano — actually flows back out into the
 * open. Switches on/off exactly like Ralo. Several reachable Torneiras
 * open at once split the flow between them: each unit of Líquido
 * independently rolls which one it heads for with equal odds the moment
 * it needs to leave (see `pickDestination`), so across enough of them the
 * shares average out even, and a run of bad luck can leave a Torneira
 * dry if the network simply didn't have much to give in the first place.
 */

/** Per-tick chance a Ralo actually pulls in a touching Líquido cell — deliberately low, "leve força de sucção, mas bem pouco". */
const DRAIN_SUCK_CHANCE = 0.1;
/** Per-tick chance an open Torneira pulls one stored unit out of the network — same "weak trickle" spirit as the Ralo's own suck chance. */
const FAUCET_RELEASE_CHANCE = 0.15;
/** Cap on how many connected Cano cells one network search visits — a perf budget, well past any pipe run a player would actually paint. */
const PIPE_FLOOD_CAP = 4000;
/**
 * How close together (cells, Chebyshev) two candidate Torneira touch-points
 * have to be for the network search to treat them as the same outlet
 * rather than two separate ones to split between. A Torneira painted
 * several cells wide borders the Cano network at more than one point along
 * its own edge, and those all need to count as the single fixture they
 * are, not multiply its odds in the random pick.
 */
const EXIT_CLUSTER_RANGE = 6;
/**
 * How far (cells, Chebyshev) `findNearbyPipeCells` looks around a sucking
 * Ralo (or a releasing Torneira) for Cano to start from. A thick brush
 * stroke often paints the fixture several cells wide, and painting never
 * overwrites an existing solid — so if the player dabbed it partly onto a
 * wall or floor already there, the stroke (and the Cano it meets) can come
 * out split into pieces that don't actually touch each other, or into a
 * stray speck too small to reach anywhere. This search doesn't care: it
 * just looks outward from wherever the liquid actually needs to enter or
 * leave, feeding every bit of Cano it finds in as a possible starting
 * point at once, so a real connected run still gets found even when a
 * disconnected fragment happens to sit closer. Comfortably past the
 * thickest possible stroke (radius 4.5) either way.
 */
const DRAIN_PIPE_SEARCH_RANGE = 10;
/** Cap on how many nearby Cano cells the range search in `findNearbyPipeCells` feeds in at once — plenty for anything a brush stroke could scatter within range. */
const DRAIN_PIPE_SEARCH_MAX = 48;
/** Cap on how many connected body cells (Ralo or Torneira) the flood in `findNearbyPipeCells` visits looking for a touching Cano — no real limit, same idea as `PIPE_FLOOD_CAP`: a fixture is one body no matter how far it stretches, so Cano touching any part of it should still count. */
const DRAIN_BODY_FLOOD_CAP = 4000;
/** Cells per tick a `PipeFlow` travels along its path. */
const PIPE_FLOW_SPEED = 0.35;
/** Consecutive stuck ticks (unable to deposit or store) a `PipeFlow` tolerates before it's just dropped — a safety valve against ever piling up unbounded, not something normal play should actually hit. */
const PIPE_FLOW_STUCK_LIMIT = 200;
/** Per-tick chance an active Ralo spawns one purely decorative suction mote. */
const SUCTION_MOTE_CHANCE = 0.5;
/** Hard cap on live suction motes across every Ralo combined — cosmetic, kept small since the whole point is a faint, weak trickle, not a visible vortex. */
const SUCTION_MOTE_MAX = 60;
/** How far out (cells) a suction mote can spawn from its Ralo — short on purpose, "bem pouca e fraca". */
const SUCTION_MOTE_RANGE = 2.5;
/** Cells per tick a suction mote drifts inward. */
const SUCTION_MOTE_SPEED = 0.12;

/**
 * Per-tick memoization for `surveyPipeNetwork`, keyed by the exact
 * `starts` array `findNearbyPipeCells` returned — which, thanks to
 * `grid.drainPipeCache`, is the *same array instance* for every cell of
 * one connected Ralo body this tick. Safe to share like this because
 * surveying never mutates anything by itself, only decides where a
 * specific unit of freshly-absorbed Líquido should head — unlike pulling
 * *stored* Líquido back out (see `torneiraLeader` instead, which a shared
 * cache here couldn't safely do: two cells reading the same cached "here's
 * a stored unit" answer could both go claim it in the same tick). A
 * WeakMap needs no explicit per-tick clearing: `drainPipeCache` being
 * cleared each tick means a fresh tick always gets fresh `starts` arrays,
 * so last tick's entries here simply fall out of both maps together once
 * nothing references them anymore. Without this, a body of a hundred Ralo
 * cells sharing one big Cano network re-surveyed that same network from
 * scratch a hundred times over — this and drainPipeCache together are
 * what actually fixed placing a lot of them being laggy.
 */
const surveyCache = new WeakMap<readonly number[], PipeDestination | "full" | null>();

/**
 * Ralo: switches on/off exactly like Ventilador/Bloco de Calor — a
 * connected clump is one fixture, standalone it just always runs, wired to
 * a Fio/Alavanca the whole clump switches together (see stepCircuitBlock).
 * While on, sucks in any touching Líquido at a low per-tick chance each,
 * feeding it into a connected Cano network (see `surveyPipeNetwork`) or
 * just consuming it if no Cano touches at all. Also spawns a faint, purely
 * decorative suction mote now and then — cosmetic only, never touches the
 * material grid.
 */
export function stepDrain(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  const active = grid.stepCircuitBlock(x, y, i, MaterialId.Drain);
  if (!active) return;

  let surveyed = false;
  let destination: PipeDestination | "full" | null = null;
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nId = grid.get(nx, ny);
    if (MATERIALS[nId].category !== MaterialCategory.Liquid) continue;
    if (Math.random() >= DRAIN_SUCK_CHANCE) continue;

    // Every liquid neighbor this same tick shares one network search — a
    // Ralo with several touching Líquido cells at once (a puddle lapping
    // at it from multiple sides) shouldn't re-walk the same Cano run per
    // neighbor. The Ralo can be one big painted body (a thick brush
    // stroke, several cells wide), so the nearest Cano isn't necessarily
    // touching this exact sub-cell — see `findNearbyPipeCells`.
    if (!surveyed) {
      const nearby = findNearbyPipeCells(grid, x, y, MaterialId.Drain);
      const cached = surveyCache.get(nearby);
      if (cached !== undefined) {
        destination = cached;
      } else {
        destination = surveyPipeNetwork(grid, nearby);
        surveyCache.set(nearby, destination);
      }
      surveyed = true;
    }

    if (destination === null) {
      // No Cano touching the Ralo at all — vanishes, same as always.
      grid.set(nx, ny, MaterialId.Empty);
      continue;
    }
    if (destination === "full") continue; // the whole reachable network is already storing all it can hold — leave the liquid be

    const ni = grid.index(nx, ny);
    grid.pipeFlows.push({
      path: destination.path,
      index: 0,
      t: 0,
      speed: PIPE_FLOW_SPEED,
      material: nId,
      meta: grid.meta[ni],
      kind: destination.kind,
      stuck: 0,
    });
    grid.set(nx, ny, MaterialId.Empty);
  }

  // Only a cell with a genuinely open side (Empty or Líquido) ever spawns
  // one — an interior cell fully boxed in by the rest of the Ralo's own
  // body has nothing real to be seen drifting out of. What actually made
  // the effect cluster at the bottom of a multi-cell body wasn't this
  // per-cell check — it was the shared cap below being gated at spawn
  // time while the main tick scan visits cells bottom-to-top, so the
  // lower edge always claimed the budget first. Fixing that (see
  // `advanceSuctionMotes`) is what lets every genuinely open edge cell,
  // all the way around the body, actually get its fair turn.
  const openDirs: (readonly [number, number])[] = [];
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx, ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nId = grid.get(nx, ny);
    if (nId === MaterialId.Empty || MATERIALS[nId].category === MaterialCategory.Liquid) openDirs.push([dx, dy]);
  }
  if (openDirs.length > 0 && Math.random() < SUCTION_MOTE_CHANCE) {
    const [odx, ody] = openDirs[Math.floor(Math.random() * openDirs.length)];
    const ang = Math.atan2(ody, odx) + (Math.random() - 0.5) * (Math.PI / 2);
    const r = SUCTION_MOTE_RANGE * (0.4 + Math.random() * 0.6);
    const sx = x + 0.5 + Math.cos(ang) * r;
    const sy = y + 0.5 + Math.sin(ang) * r;
    const ddx = x + 0.5 - sx;
    const ddy = y + 0.5 - sy;
    const dist = Math.hypot(ddx, ddy) || 1;
    const life = Math.max(1, Math.round(dist / SUCTION_MOTE_SPEED));
    const mote: SuctionMote = {
      x: sx,
      y: sy,
      vx: (ddx / dist) * SUCTION_MOTE_SPEED,
      vy: (ddy / dist) * SUCTION_MOTE_SPEED,
      life,
      maxLife: life,
    };
    grid.suctionMotes.push(mote);
  }
}

/**
 * Torneira: switches on/off exactly like Ralo. While on, at a modest
 * per-tick chance, pulls one already-stored unit of Líquido out of its
 * reachable Cano network and releases it right back out into the open —
 * this is what drains a network's backlog once a tap finally opens, since
 * `stepDrain` only ever routes *freshly arriving* Líquido toward an open
 * Torneira; anything that piled up earlier, while every Torneira on the
 * network was closed or nonexistent, just sits there as PIPE_FILLED_META
 * until some Torneira comes looking for it here.
 */
export function stepFaucet(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  const active = grid.stepCircuitBlock(x, y, i, MaterialId.Torneira);
  if (!active) return;
  // Only the connected body's leader cell ever actually searches for
  // stored Líquido to pull — unlike `surveyPipeNetwork` (safe to share,
  // since it only ever decides where *freshly arriving* Líquido should go
  // and never mutates anything by itself), this one claims and clears a
  // specific stored unit. Letting every cell of a wide Torneira fixture
  // roll for that independently risked two of them claiming the very same
  // unit in one tick, on top of redoing the same network search once per
  // cell for nothing — the exact kind of repeated work that made placing a
  // lot of Ralos/Torneiras noticeably laggy.
  if (torneiraLeader(grid, x, y) !== i) return;
  if (Math.random() >= FAUCET_RELEASE_CHANCE) return;

  const filled = findNearestFilledPipeCell(grid, findNearbyPipeCells(grid, x, y, MaterialId.Torneira));
  if (!filled) return;

  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx, ny = y + dy;
    if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Empty) {
      grid.meta[filled.idx] &= ~PIPE_FILLED_META;
      grid.set(nx, ny, filled.material, 0);
      return;
    }
  }
}

/**
 * The smallest grid index among a connected clump of Torneira cells
 * touching (x, y) — same "one fixture, one cell actually does the work"
 * idea as `rodBody`'s leaderIndex. Memoized per clump per tick in
 * `grid.torneiraLeaderCache`.
 */
function torneiraLeader(grid: SimGrid, x: number, y: number): number {
  const startIdx = grid.index(x, y);
  const cached = grid.torneiraLeaderCache.get(startIdx);
  if (cached !== undefined) return cached;

  const visited = new Set<number>([startIdx]);
  const queue: number[] = [startIdx];
  let qi = 0;
  let leader = startIdx;
  let budget = DRAIN_BODY_FLOOD_CAP;
  while (qi < queue.length && budget-- > 0) {
    const i = queue[qi++];
    if (i < leader) leader = i;
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (grid.material[j] !== MaterialId.Torneira || visited.has(j)) continue;
      visited.add(j);
      queue.push(j);
    }
  }
  for (const v of visited) grid.torneiraLeaderCache.set(v, leader);
  return leader;
}

/**
 * Every Cano cell touching a body of `bodyMatId` (Ralo or Torneira) at
 * (x, y) — however far away, as long as it's genuinely part of the same
 * fixture. Two complementary searches: first a flood through the body's
 * own connected cells (any chain of touching same-material cells),
 * collecting every Cano bordering any of it, with no real distance limit,
 * since it's one fixture no matter how large; then, in case the brush
 * stroke came out split into pieces that don't actually touch each other
 * (painting never overwrites an existing solid, so dabbing a fixture
 * partly onto a wall or floor already there leaves a gap right where the
 * stroke crossed it), a short-range scan around (x, y) that also catches a
 * nearby Cano the body-flood couldn't reach through. Returns every one
 * found so the caller can start a search from all of them at once — if one
 * path turns out to be a disconnected stray fragment too small to lead
 * anywhere, a real connected run found elsewhere in the same search still
 * gets used instead of being shadowed by it.
 */
function findNearbyPipeCells(grid: SimGrid, x: number, y: number, bodyMatId: MaterialId): number[] {
  const startIdx = grid.index(x, y);
  const cached = grid.drainPipeCache.get(startIdx);
  if (cached) return cached;

  const found = new Set<number>();

  const bodyVisited = new Set<number>([startIdx]);
  const queue: number[] = [startIdx];
  let qi = 0;
  let budget = DRAIN_BODY_FLOOD_CAP;
  while (qi < queue.length && budget-- > 0) {
    const i = queue[qi++];
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      const nId = grid.material[j];
      if (nId === MaterialId.Pipe) { found.add(j); continue; }
      if (nId !== bodyMatId || bodyVisited.has(j)) continue;
      bodyVisited.add(j);
      queue.push(j);
    }
  }

  for (let r = 1; r <= DRAIN_PIPE_SEARCH_RANGE && found.size < DRAIN_PIPE_SEARCH_MAX; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (grid.inBounds(nx, ny) && grid.material[grid.index(nx, ny)] === MaterialId.Pipe) found.add(grid.index(nx, ny));
      }
    }
  }

  // Every cell the body-flood actually visited shares this exact same
  // result for the rest of the tick — see grid.ts's drainPipeCache doc
  // comment. The position-dependent range search above only ever adds to
  // it, so a cache hit from a different cell of the body is, at worst, a
  // few cells short of what that specific cell's own range search might
  // have additionally found — the body-flood itself (by far the more
  // expensive part, and the part that's identical for the whole body
  // regardless of entry point) is never shortchanged.
  const result = Array.from(found);
  for (const v of bodyVisited) grid.drainPipeCache.set(v, result);
  return result;
}

/** Where a freshly-absorbed unit of Líquido should go: out through a specific reachable Torneira, or parked in a specific still-empty Cano cell. */
type PipeDestination = { kind: "release" | "store"; path: readonly (readonly [number, number])[] };

/**
 * Floods outward from every Cano cell in `starts` at once through
 * connected Cano only, surveying the whole reachable network in one pass
 * for where a fresh unit of Líquido should go:
 *
 * - Any open Torneira touching the network is a release candidate.
 * Touch-points within `EXIT_CLUSTER_RANGE` of each other collapse into one
 * candidate first (a Torneira painted several cells wide touches the
 * network at more than one point along its own edge, and that's one
 * outlet, not several) — then one candidate is picked at random with
 * equal odds. That random pick is the whole trick behind splitting a flow
 * between several open Torneiras: each unit of Líquido independently
 * rolls which one it heads for right here, so across enough of them the
 * shares average out even, and it composes for free through as many of
 * them as a network has.
 * - Failing that, the *nearest* Cano cell not already flagged
 * PIPE_FILLED_META is where it gets stored instead — BFS already visits
 * nearest cells first, so the first one found is automatically the
 * closest, meaning a network fills up outward from wherever the Ralo
 * actually feeds it rather than at some arbitrary far corner.
 *
 * Returns null if no Cano touches the Ralo at all, `"full"` if Cano is
 * reachable but every cell of it is already both filled and Torneira-free
 * (nothing to do with more Líquido right now), or the chosen destination
 * otherwise.
 */
function surveyPipeNetwork(grid: SimGrid, starts: readonly number[]): PipeDestination | "full" | null {
  const start = starts.filter((idx) => grid.material[idx] === MaterialId.Pipe);
  if (start.length === 0) return null;

  const visited = new Set<number>(start);
  const parent = new Map<number, number>();
  const queue: number[] = [...start];
  let qi = 0;
  let budget = PIPE_FLOOD_CAP;
  const faucetCandidates: number[] = [];
  const seenFaucets = new Set<number>();
  let nearestEmpty = -1;

  while (qi < queue.length && budget-- > 0) {
    const i = queue[qi++];
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    if (nearestEmpty === -1 && (grid.meta[i] & PIPE_FILLED_META) === 0) nearestEmpty = i;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      const nId = grid.material[j];
      if (nId === MaterialId.Torneira && !seenFaucets.has(j)) {
        seenFaucets.add(j);
        const ty = (j / grid.width) | 0, tx = j % grid.width;
        if (bodyCircuitState(grid, tx, ty, MaterialId.Torneira, grid.blockCache).active) faucetCandidates.push(j);
        continue;
      }
      if (nId !== MaterialId.Pipe || visited.has(j)) continue;
      visited.add(j);
      parent.set(j, i);
      queue.push(j);
    }
  }

  const reconstruct = (exit: number): (readonly [number, number])[] => {
    const path: [number, number][] = [];
    let cur: number | undefined = exit;
    while (cur !== undefined) {
      path.push([cur % grid.width, (cur / grid.width) | 0]);
      cur = parent.get(cur);
    }
    path.reverse();
    return path;
  };

  if (faucetCandidates.length > 0) {
    // Collapse touch-points within EXIT_CLUSTER_RANGE into one outlet —
    // see the doc comment above.
    const clusters: { rep: number; repX: number; repY: number }[] = [];
    for (const f of faucetCandidates) {
      const fx = f % grid.width, fy = (f / grid.width) | 0;
      const cluster = clusters.find((cl) => Math.max(Math.abs(fx - cl.repX), Math.abs(fy - cl.repY)) <= EXIT_CLUSTER_RANGE);
      if (!cluster) clusters.push({ rep: f, repX: fx, repY: fy });
    }
    const chosen = clusters[Math.floor(Math.random() * clusters.length)].rep;
    // The parent chain only reaches the Cano cell touching this Torneira,
    // not the Torneira cell itself — extend the path onto it so the
    // travelling flow visibly enters the fixture instead of stopping one
    // cell short.
    const touchingPipe = NEIGHBORS_8.map(([dx, dy]) => grid.index((chosen % grid.width) + dx, ((chosen / grid.width) | 0) + dy))
      .find((j) => visited.has(j) && grid.material[j] === MaterialId.Pipe);
    const path = touchingPipe !== undefined ? reconstruct(touchingPipe) : [];
    path.push([chosen % grid.width, (chosen / grid.width) | 0]);

    // `chosen` is just whichever Torneira cell happens to touch the Cano —
    // for a Torneira painted as a wide fixture (a brush stroke, same as
    // the Ralo's own body), that's frequently a cell buried in the middle
    // of it, with every neighbor more Torneira or Cano, nowhere open to
    // actually deposit onto. Walk on through the connected Torneira body
    // from there to whichever of its own cells genuinely has an open face,
    // and extend the path the rest of the way there — otherwise the flow
    // arrives with nowhere to go and piles up forever instead of ever
    // finishing (see advancePipeFlows).
    const openFace = findOpenFaceInBody(grid, chosen, MaterialId.Torneira);
    if (openFace) for (const [ox, oy] of openFace) path.push([ox, oy]);

    return { kind: "release", path };
  }

  if (nearestEmpty !== -1) return { kind: "store", path: reconstruct(nearestEmpty) };
  return "full";
}

/**
 * From `startIdx` (a cell of material `bodyMatId`), walks through the rest
 * of its connected body for the nearest cell that actually has an open
 * (Empty) face — returns the path of body cells to reach it (`startIdx`
 * itself excluded, since the caller already has that), an empty array if
 * `startIdx` already qualifies, or null if no cell of the whole reachable
 * body ever does (the fixture is entirely boxed in on every side — no
 * plausible amount of stored Líquido has anywhere left to go).
 */
function findOpenFaceInBody(
  grid: SimGrid, startIdx: number, bodyMatId: MaterialId,
): (readonly [number, number])[] | null {
  const hasOpenFace = (i: number): boolean => {
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (grid.inBounds(nx, ny) && grid.material[grid.index(nx, ny)] === MaterialId.Empty) return true;
    }
    return false;
  };
  if (hasOpenFace(startIdx)) return [];

  const visited = new Set<number>([startIdx]);
  const parent = new Map<number, number>();
  const queue: number[] = [startIdx];
  let qi = 0;
  let budget = DRAIN_BODY_FLOOD_CAP;
  while (qi < queue.length && budget-- > 0) {
    const i = queue[qi++];
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (grid.material[j] !== bodyMatId || visited.has(j)) continue;
      visited.add(j);
      parent.set(j, i);
      if (hasOpenFace(j)) {
        const path: [number, number][] = [];
        let cur: number | undefined = j;
        while (cur !== undefined && cur !== startIdx) {
          path.push([cur % grid.width, (cur / grid.width) | 0]);
          cur = parent.get(cur);
        }
        path.reverse();
        return path;
      }
      queue.push(j);
    }
  }
  return null;
}

/**
 * Finds *some* currently-Empty cell touching the connected `bodyMatId`
 * body reachable from `startIdx` — for a `PipeFlow` arriving to deposit
 * whose own pinned spot (chosen back when the path was first built) is
 * occupied right now. A Torneira painted as one wide fixture often has
 * only a single cell of it actually facing open air, and many flows can
 * converge on that exact same fixture at once — if each one only ever
 * checks that one pinned cell, whichever got there first blocks every
 * other one from ever finishing, even though the fixture might have
 * emptied out somewhere else in the meantime. Checking the whole body
 * again, fresh, lets a flow redirect to wherever's actually free right
 * now instead of stalling on one spot until it's just dropped.
 */
function findAnyOpenCell(grid: SimGrid, startIdx: number, bodyMatId: MaterialId): [number, number] | null {
  const openNeighbor = (i: number): [number, number] | null => {
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (grid.inBounds(nx, ny) && grid.material[grid.index(nx, ny)] === MaterialId.Empty) return [nx, ny];
    }
    return null;
  };
  const own = openNeighbor(startIdx);
  if (own) return own;

  const visited = new Set<number>([startIdx]);
  const queue: number[] = [startIdx];
  let qi = 0;
  let budget = DRAIN_BODY_FLOOD_CAP;
  while (qi < queue.length && budget-- > 0) {
    const i = queue[qi++];
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (grid.material[j] !== bodyMatId || visited.has(j)) continue;
      visited.add(j);
      const found = openNeighbor(j);
      if (found) return found;
      queue.push(j);
    }
  }
  return null;
}

/** Finds the nearest Cano cell flagged PIPE_FILLED_META reachable from `starts`, for a Torneira pulling stored Líquido back out — same nearest-first BFS idea as `surveyPipeNetwork`'s own storage search, just looking for the opposite thing. */
function findNearestFilledPipeCell(
  grid: SimGrid, starts: readonly number[],
): { idx: number; material: MaterialId } | null {
  const start = starts.filter((idx) => grid.material[idx] === MaterialId.Pipe);
  if (start.length === 0) return null;

  const visited = new Set<number>(start);
  const queue: number[] = [...start];
  let qi = 0;
  let budget = PIPE_FLOOD_CAP;
  while (qi < queue.length && budget-- > 0) {
    const i = queue[qi++];
    if ((grid.meta[i] & PIPE_FILLED_META) !== 0) return { idx: i, material: (grid.meta[i] & PIPE_LIQUID_MASK) as MaterialId };
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (visited.has(j) || grid.material[j] !== MaterialId.Pipe) continue;
      visited.add(j);
      queue.push(j);
    }
  }
  return null;
}

/**
 * Advances every travelling `PipeFlow` one tick along its precomputed
 * path — a straight walk cell to cell, `t` interpolating the fractional
 * position between the current cell and the next for a smooth crawl
 * rather than a visible jump each time it crosses a cell boundary. Once it
 * reaches the far end: a `"release"` flow deposits its real material into
 * whichever touching Empty cell is actually open right then (the specific
 * one that made this cell an exit might, rarely, have filled in since) —
 * or, on the off chance none is free anymore, just holds there one more
 * tick and tries again rather than losing the liquid outright. A
 * `"store"` flow instead flags the Cano cell itself as holding it
 * (PIPE_FILLED_META) — or, if some other flow already claimed that exact
 * cell in the meantime, looks one cell further for a still-empty neighbor
 * before giving up on it. Either way, `PIPE_FLOW_STUCK_LIMIT` bounds how
 * long a flow keeps retrying: `surveyPipeNetwork` picks a path that should
 * always end somewhere genuinely open, but a wired-off Torneira, a busy
 * neighbor, or some future edge case shouldn't be able to leave a flow
 * retrying forever — that's how a whole network's worth of them quietly
 * piled up without end before this limit existed.
 */
export function advancePipeFlows(grid: SimGrid): void {
  if (grid.pipeFlows.length === 0) return;
  const next: PipeFlow[] = [];
  for (const f of grid.pipeFlows) {
    // Whatever it's currently sitting on has to still actually be there —
    // erasing (or otherwise clearing) part of a network mid-flow used to
    // leave the flow itself untouched, so it kept right on animating and
    // eventually deposited real Líquido through pipe that no longer
    // existed, reading as "the liquid didn't actually get erased". Ordinarily
    // that's a Cano cell, except at the very last step of a "release" flow,
    // which by design ends sitting on the Torneira itself (see
    // surveyPipeNetwork) rather than the Cano leading into it.
    const [cx, cy] = f.path[f.index];
    const curMat = grid.material[grid.index(cx, cy)];
    const onTorneira = f.kind === "release" && f.index === f.path.length - 1 && curMat === MaterialId.Torneira;
    if (curMat !== MaterialId.Pipe && !onTorneira) continue;
    f.t += f.speed;
    while (f.t >= 1 && f.index < f.path.length - 1) {
      f.t -= 1;
      f.index++;
    }
    if (f.index >= f.path.length - 1) {
      const [ex, ey] = f.path[f.path.length - 1];
      if (f.kind === "release") {
        // The immediate neighbors first (cheap, and the common case) —
        // falling back to a fresh search of the whole connected Torneira
        // body only if that specific spot is occupied right now. A wide
        // Torneira fixture can easily have several flows converging on the
        // one cell of it that actually faces open air at once; if every
        // one of them only ever checked that same single pinned spot,
        // whichever got there first would block the rest until they time
        // out, even while the fixture empties out somewhere else nearby.
        let placed = false;
        for (const [dx, dy] of NEIGHBORS_8) {
          const nx = ex + dx, ny = ey + dy;
          if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Empty) {
            grid.set(nx, ny, f.material, f.meta);
            placed = true;
            break;
          }
        }
        if (!placed) {
          const spot = findAnyOpenCell(grid, grid.index(ex, ey), MaterialId.Torneira);
          if (spot) { grid.set(spot[0], spot[1], f.material, f.meta); placed = true; }
        }
        if (!placed && ++f.stuck < PIPE_FLOW_STUCK_LIMIT) next.push(f); // every spot in the fixture is occupied right now — wait and retry, up to the limit
      } else {
        const ei = grid.index(ex, ey);
        let target = (grid.meta[ei] & PIPE_FILLED_META) === 0 ? ei : -1;
        if (target === -1) {
          for (const [dx, dy] of NEIGHBORS_8) {
            const nx = ex + dx, ny = ey + dy;
            if (!grid.inBounds(nx, ny)) continue;
            const j = grid.index(nx, ny);
            if (grid.material[j] === MaterialId.Pipe && (grid.meta[j] & PIPE_FILLED_META) === 0) { target = j; break; }
          }
        }
        if (target !== -1) grid.meta[target] = PIPE_FILLED_META | (f.material & PIPE_LIQUID_MASK);
        // else: everything nearby filled up in the meantime — this unit is simply absorbed into the now-full network rather than tracked further.
      }
      continue;
    }
    next.push(f);
  }
  grid.pipeFlows = next;
}

/**
 * Advances every decorative suction mote one tick — straight-line drift
 * toward wherever its Ralo spawned it, fading out on arrival or once its
 * short life runs out. Purely visual: never read by anything but the
 * renderer. `SUCTION_MOTE_MAX` is enforced here, at random, rather than by
 * refusing new spawns once the count is already at the cap: the main tick
 * scan visits every cell bottom-to-top, so gating at spawn time would let
 * a Ralo body's lower cells always claim the shared budget first, tick
 * after tick, starving its upper cells outright instead of just capping
 * the total. Randomly culling the overflow here spreads the cap fairly
 * across wherever motes actually spawned this tick.
 */
export function advanceSuctionMotes(grid: SimGrid): void {
  if (grid.suctionMotes.length === 0) return;
  const next: SuctionMote[] = [];
  for (const m of grid.suctionMotes) {
    m.life--;
    if (m.life <= 0) continue;
    m.x += m.vx;
    m.y += m.vy;
    next.push(m);
  }
  while (next.length > SUCTION_MOTE_MAX) {
    const idx = Math.floor(Math.random() * next.length);
    next[idx] = next[next.length - 1];
    next.pop();
  }
  grid.suctionMotes = next;
}
