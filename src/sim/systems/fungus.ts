import type { SimGrid } from "../grid";
import { FLASH_LIFE } from "../grid";
import { FUNGUS_HOSTS, FUNGUS_ORIGIN_MASK, MUSHROOM_BUDGET_SHIFT, MUSHROOM_BUDGET_MASK, FUNGUS_VIRUS_FLAG, FUNGUS_SPROUTED_FLAG } from "../metaBits";
import { MaterialId } from "../types";
import { NEIGHBORS_4, NEIGHBORS_8 } from "../neighbors";

/*
 * ── Fungo ────────────────────────────────────────────────────────────────
 * Two materials, plus a real Gás:
 *  - `Fungus` (the mycelium) sits in place and, tick by tick, spreads into
 *    any touching cell of one of the 8 materials in FUNGUS_HOSTS (Madeira,
 *    Planta, Tijolo, Areia, Terra, Barro, Pedra, Pólvora) — nothing else.
 *    Each cell remembers which of those it actually took over (packed into
 *    its own meta, see FUNGUS_ORIGIN_MASK) purely so the renderer can give
 *    every origin its own color/texture instead of one flat look for the
 *    whole network. Never decays on its own; a network persists as long as
 *    there's something left to hold it. Flammable like any organic matter
 *    (see its MaterialDef), so Fogo already burns through it with zero
 *    extra code here. Every so often a cell sprouts a `Mushroom` seed on
 *    open ground above itself — but only ever once per cell (see
 *    FUNGUS_SPROUTED_FLAG), so felling a mature Cogumelo is a permanent
 *    win there, not a spot that quietly regrows; the mycelium can still
 *    seed fresh mushrooms elsewhere as it keeps spreading into new ground.
 *    A touching Vírus/Vírus Rosa cell is also
 *    fair game, same as any other host — claimed outright (see
 *    claimVirus), converting it into a special flagged Fungus cell
 *    (FUNGUS_VIRUS_FLAG) instead of the usual per-origin look, since a
 *    consumed virus cell has stopped reproducing entirely, not just been
 *    worn down.
 *  - `Mushroom` ("Cogumelo") grows cell by cell out of that seed, exactly
 *    the same budget-driven branching idea as a Broto growing into a tree
 *    (see systems/plants.ts stepSprout) — every cell spends one unit of a
 *    shared growth budget to spawn the next, so the final size is random
 *    and unbounded by any fixed shape, from a tiny single cap up to
 *    however big MUSHROOM_BUDGET_MAX lets it reach (tuned to roughly a
 *    tree's worth of cells). Which of Fungus's eight hosts it grew from
 *    decides both its color (inherited origin, same lookup as the
 *    mycelium) and which weighted direction set it grows with (see
 *    MUSHROOM_ORIGIN_DIRECTIONS), so different infections sprout visibly
 *    different-shaped mushrooms, not just different colors. Once a
 *    branch's budget hits zero it's a mature cap cell, permanent like the
 *    mycelium below it; if it still has open air directly above it (a real
 *    tip, not buried under more cap) it occasionally puffs a short column
 *    of `Spore` motes upward, reaching a random height each time.
 *  - `Spore` ("Esporos") is a Gás for painting/Ventilador purposes (see its
 *    MaterialDef/MaterialCategory and windCarries in systems/electronics.ts)
 *    but doesn't rise like Vapor — grid.ts skips the shared rise-biased
 *    stepGas for it specifically, and `stepSpore` below drifts it one
 *    random step in any of the 8 directions each tick instead, so a puff
 *    radiates outward from wherever it appeared and curls in place rather
 *    than climbing, same as real smoke without a draft pushing it. Fogo or
 *    Lava kills it outright on contact, same as they sterilize Vírus.
 */
/** Per-neighbor, per-tick chance a Fungus cell claims a touching host. */
const FUNGUS_SPREAD_CHANCE = 0.01;
/** Per-tick chance a Fungus cell with open air directly above sprouts a fresh Cogumelo seed there. Rare on purpose — a network reads as mostly mycelium with the odd mushroom poking through, not a solid carpet of caps. */
const FUNGUS_MUSHROOM_CHANCE = 0.0015;
/** The biggest growth budget a freshly sprouted Cogumelo can roll — tuned to land the largest possible mushrooms around the same total cell count as a tended tree's trunk + crown (see TREE_CROWN_SHAPE/TREE_TRUNK_HEIGHT in grid.ts), not literally unbounded. */
const MUSHROOM_BUDGET_MAX = 20;
/** Per-tick chance a still-growing Cogumelo cell spends one unit of budget to spawn another cap cell next to it. */
const MUSHROOM_GROW_CHANCE = 0.03;
/** Per-tick chance a mature cap tip (budget spent, open air right above it) puffs a fresh column of Esporo motes upward. Checked per tip, so a big mushroom with many tips puffs noticeably more often overall than a small one — reads as "the bigger the mushroom, the more it's actively fruiting". Deliberately rare — a mushroom should read as mostly just standing there, with a puff being a occasional event, not a constant stream. */
const MUSHROOM_EMIT_CHANCE = 0.0003;
/** The tallest a single puffed column of Esporo motes can reach above a cap tip — the actual height rolled fresh each time is 1..this, so it's never the exact same puff twice. */
const MUSHROOM_PUFF_MAX_HEIGHT = 12;
/** Per-tick chance a mature cap tip even bothers checking whether it's part of a big enough cluster to act as a wild tower — a cheap gate in front of the pricier countNear scan below, so most ticks skip it entirely. */
const MUSHROOM_TOWER_ROLL_CHANCE = 0.05;
/** How far out MUSHROOM_TOWER_ROLL_CHANCE's cluster check looks. */
const MUSHROOM_TOWER_CLUSTER_RADIUS = 8;
/** How many Cogumelo cells need to be packed into MUSHROOM_TOWER_CLUSTER_RADIUS before a tip is "big enough" to act as a wild tower — roughly what a genuinely tree-sized mushroom (not just a little cap) actually looks like, so only the impressive ones fight back. */
const MUSHROOM_TOWER_MIN_CLUSTER = 15;
/** How far a Cogumelo acting as a wild tower can spot and hit a Esqueleto — same reach as a real Torre de defesa. */
const MUSHROOM_TOWER_RANGE = 40;
const MUSHROOM_TOWER_DAMAGE = 1;
const MUSHROOM_TOWER_FLASH_LIFE = 7;
/** The only material a Cogumelo-tower ever targets. */
const SKELETON_ONLY: readonly MaterialId[] = [MaterialId.Skeleton];
/**
 * [dx, dy, weight] each origin's Cogumelo grows with — same weighted
 * "candidate directions" idea as a Broto's own SPROUT_DIRECTIONS, just one
 * distinct set per host so different infections read as visibly different
 * mushroom silhouettes, not only different colors. Every set stays upward/
 * sideways only (never a positive dy), same rule a real plant follows —
 * nothing sprouts down into the ground it's rooted in. Indexed the same as
 * FUNGUS_HOSTS (Madeira, Planta, Tijolo, Areia, Terra, Barro, Pedra,
 * Pólvora).
 */
const MUSHROOM_ORIGIN_DIRECTIONS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0, -1, 5], [-1, -1, 1], [1, -1, 1]], // Madeira — a tall, narrow bracket fungus climbing straight up
  [[0, -1, 2], [-1, -1, 2], [1, -1, 2], [-1, 0, 2], [1, 0, 2]], // Planta — a round, bushy dome
  [[-1, -1, 3], [1, -1, 3], [0, -1, 1]], // Tijolo — small tight diagonal tufts
  [[-1, 0, 3], [1, 0, 3], [0, -1, 1], [-1, -1, 1], [1, -1, 1]], // Areia — a low, wide, flattened cap
  [[0, -1, 4], [-1, -1, 2], [1, -1, 2]], // Terra — a classic upright stem-and-cap
  [[-1, -1, 3], [-1, 0, 2], [0, -1, 2], [1, -1, 1]], // Barro — a lopsided, drooping cluster
  [[0, -1, 1], [-1, -1, 1], [1, -1, 1], [-1, 0, 1], [1, 0, 1]], // Pedra — craggy, jagged, spreads evenly in every direction
  [[-1, -1, 3], [1, -1, 3], [0, -1, 1]], // Pólvora — thin, sharp, spiky diagonal spread
];
/** Per-neighbor, per-tick chance a Fungus cell claims a touching Vírus/Vírus Rosa cell outright, same idea as claiming an ordinary host — faster than Vírus's own fastest spread (VIRUS_LIVING_SPREAD_CHANCE, 0.015), so a mycelium actually in contact with an outbreak can outpace it instead of forever falling behind a Vírus patch that just keeps growing. */
const FUNGUS_VIRUS_INFECT_CHANCE = 0.025;
/** Per-neighbor, per-tick chance a drifting Esporo claims a touching Vírus/Vírus Rosa cell outright, same idea as SPORE_LAND_CHANCE on an ordinary host — also bumped up near Vírus's own fastest spread rate, for the same reason. */
const SPORE_VIRUS_INFECT_CHANCE = 0.018;
/** Per-tick chance a Esporo touching a host actually takes root there, becoming a fresh Fungus cell. */
const SPORE_LAND_CHANCE = 0.02;
/**
 * Per-tick chance a Esporo fizzles out, the ONLY thing that ever ends its
 * life — no separate hard lifespan countdown. Every cell in a freshly
 * painted puff starts out identical, so a fixed countdown would've had them
 * all hit zero on the very same tick and blink out together, exactly the
 * "vanishes all at once, like Magia" look that was rejected. A flat
 * per-tick chance instead gives each cell its own independently random
 * moment to fizzle — some early, some late — so the puff thins out
 * unevenly over a long stretch, real smoke dissipating rather than a timer
 * expiring.
 */
const SPORE_FIZZLE_CHANCE = 0.003;
/** Per-tick chance a live Esporo takes one step of its own isotropic drift — less than every tick so it wafts unevenly, curling around instead of snapping along a straight line. */
const SPORE_DRIFT_CHANCE = 0.5;
/** Esporo's density for the shared `tryMove` collision check — matches its MaterialDef, light enough to never displace anything solid. */
const SPORE_DENSITY = 1;

function isHost(id: MaterialId): boolean {
  return FUNGUS_HOSTS.includes(id);
}

function isVirus(id: MaterialId): boolean {
  return id === MaterialId.Virus || id === MaterialId.VirusPink;
}

/** Claims (x, y) for the Fungus network, remembering which host it actually took over (see FUNGUS_HOSTS/FUNGUS_ORIGIN_MASK) so the renderer can give this particular infection its own color/texture. */
function claim(grid: SimGrid, x: number, y: number, hostId: MaterialId): void {
  const origin = FUNGUS_HOSTS.indexOf(hostId);
  grid.set(x, y, MaterialId.Fungus, (origin < 0 ? 0 : origin) & FUNGUS_ORIGIN_MASK);
}

/**
 * Claims a Vírus/Vírus Rosa cell for the Fungus network — same idea as
 * `claim`, converting it straight into a Fungus cell, except there's no
 * real host origin to remember, so it's flagged FUNGUS_VIRUS_FLAG instead
 * for a distinct "fungo especial" look. Since the cell is now Fungus, not
 * Vírus, it's already stopped reproducing the instant this runs — nothing
 * further to do about that.
 */
function claimVirus(grid: SimGrid, x: number, y: number): void {
  grid.set(x, y, MaterialId.Fungus, FUNGUS_VIRUS_FLAG);
  grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
}

/** Fungus (the mycelium) or Mushroom (a growing/mature Cogumelo) — dispatches on which one this cell actually is. */
export function stepFungus(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  if (grid.material[i] === MaterialId.Mushroom) {
    stepMushroom(grid, x, y, i);
    return;
  }

  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nid = grid.get(nx, ny);
    if (isHost(nid) && Math.random() < FUNGUS_SPREAD_CHANCE) claim(grid, nx, ny, nid);
    else if (isVirus(nid) && Math.random() < FUNGUS_VIRUS_INFECT_CHANCE) claimVirus(grid, nx, ny);
  }

  if (
    (grid.meta[i] & FUNGUS_SPROUTED_FLAG) === 0 &&
    grid.get(x, y - 1) === MaterialId.Empty && Math.random() < FUNGUS_MUSHROOM_CHANCE
  ) {
    const origin = grid.meta[i] & FUNGUS_ORIGIN_MASK;
    // Squaring a 0..1 roll skews the result toward the low end, so most
    // sprouted Cogumelos stay small and only the rare one rolls anywhere
    // close to MUSHROOM_BUDGET_MAX — a field of infected wood should read as
    // mostly little mushrooms with the odd big one, not big ones everywhere.
    const budget = 1 + Math.floor(Math.random() * Math.random() * MUSHROOM_BUDGET_MAX);
    grid.set(x, y - 1, MaterialId.Mushroom, origin | (budget << MUSHROOM_BUDGET_SHIFT));
    // Spent for good — felling this Cogumelo later must not let the exact
    // same spot just sprout another one right back (see FUNGUS_SPROUTED_FLAG).
    grid.meta[i] |= FUNGUS_SPROUTED_FLAG;
  }
}

/**
 * A Cogumelo cell's whole tick: while it still has growth budget left, a
 * chance to spend one unit spawning another cap cell nearby (see
 * MUSHROOM_ORIGIN_DIRECTIONS); once spent, a mature cap tip (still open air
 * directly above it) occasionally puffs a column of Esporo motes upward.
 */
function stepMushroom(grid: SimGrid, x: number, y: number, i: number): void {
  const meta = grid.meta[i];
  const origin = meta & FUNGUS_ORIGIN_MASK;
  const budget = (meta >> MUSHROOM_BUDGET_SHIFT) & MUSHROOM_BUDGET_MASK;

  if (budget > 0) {
    if (Math.random() < MUSHROOM_GROW_CHANCE) {
      const dirs = MUSHROOM_ORIGIN_DIRECTIONS[origin] ?? MUSHROOM_ORIGIN_DIRECTIONS[4];
      const candidates: [number, number][] = [];
      for (const [dx, dy, weight] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inBounds(nx, ny) || grid.get(nx, ny) !== MaterialId.Empty) continue;
        for (let w = 0; w < weight; w++) candidates.push([nx, ny]);
      }
      if (candidates.length > 0) {
        if (budget === 1) {
          // The final step: stamp a small multi-cell cap flourish (up to 3
          // cells, whichever candidates are actually free) instead of just
          // one more stem cell, so the chain finishes with something that
          // actually reads as a cap rather than just petering out mid-line.
          // Every stamped cell is already mature (budget 0).
          const picks = Math.min(candidates.length, 1 + Math.floor(Math.random() * 3));
          for (let p = 0; p < picks; p++) {
            const idx = Math.floor(Math.random() * candidates.length);
            const [gx, gy] = candidates.splice(idx, 1)[0];
            grid.set(gx, gy, MaterialId.Mushroom, origin);
          }
        } else {
          const [gx, gy] = candidates[Math.floor(Math.random() * candidates.length)];
          const childMeta = origin | ((budget - 1) << MUSHROOM_BUDGET_SHIFT);
          grid.set(gx, gy, MaterialId.Mushroom, childMeta);
        }
        // The cell that just grew stops for good right here — it does NOT
        // keep its own leftover budget to spend again later. Only the new
        // cell(s) it just stamped carry the count onward. Letting both the
        // parent and the child stay independently "still growing" after
        // every single step turns this into a branching tree whose total
        // size explodes combinatorially with budget (every cell able to
        // spawn many more over its remaining lifetime) — total cell counts
        // in the hundreds for a budget of only 20, nowhere near "up to a
        // tree's worth". One grow-then-done per cell instead makes it a
        // single meandering chain (its exact path still shaped by the
        // weighted directions below, so different origins still read as
        // differently-shaped mushrooms) capped with one small flourish,
        // whose total length tracks the starting budget almost exactly,
        // matching what a "maximum size" promise actually needs to mean.
        grid.meta[i] = origin;
      } else {
        // Boxed in with nowhere left to grow — settle as mature right here
        // instead of waiting forever for room that will never open up.
        grid.meta[i] = origin;
      }
    }
    return;
  }

  if (grid.get(x, y - 1) === MaterialId.Empty && Math.random() < MUSHROOM_EMIT_CHANCE) {
    emitSporeColumn(grid, x, y);
  }

  // A big enough cluster of Cogumelo acts like a wild, unplanted Torre de
  // defesa — no wiring, no Alavanca, it just quietly watches for a
  // Esqueleto in range and lashes out with a spore-dart. countNear is the
  // one non-trivial-cost check here, so it's only ever rolled after the
  // cheap random gate below already passed, keeping the common case free.
  if (Math.random() < MUSHROOM_TOWER_ROLL_CHANCE && grid.countNear(x, y, MaterialId.Mushroom, MUSHROOM_TOWER_CLUSTER_RADIUS) >= MUSHROOM_TOWER_MIN_CLUSTER) {
    const foe = grid.nearestOf(x, y, SKELETON_ONLY, MUSHROOM_TOWER_RANGE);
    if (foe) {
      const [fdx, fdy] = foe;
      if (grid.strikeClock(i, true)) {
        grid.strike(grid.index(x + fdx, y + fdy), MUSHROOM_TOWER_DAMAGE, x, y);
        grid.hits.push({ x, y, life: MUSHROOM_TOWER_FLASH_LIFE, maxLife: MUSHROOM_TOWER_FLASH_LIFE });
      }
    }
  }
}

/** Puffs a column of Esporo motes straight up from (x, y), 1 to MUSHROOM_PUFF_MAX_HEIGHT cells tall (rerolled every time), stopping early if it runs into anything that isn't open air. */
function emitSporeColumn(grid: SimGrid, x: number, y: number): void {
  const height = 1 + Math.floor(Math.random() * MUSHROOM_PUFF_MAX_HEIGHT);
  for (let d = 1; d <= height; d++) {
    const ny = y - d;
    if (!grid.inBounds(x, ny) || grid.get(x, ny) !== MaterialId.Empty) break;
    grid.set(x, ny, MaterialId.Spore);
  }
}

/**
 * An Esporo cell's whole tick — called from `step()`'s per-material
 * reaction chain the same way Vapor's own condensation is, since grid.ts's
 * main category switch deliberately skips the shared stepGas for this one
 * material (see the MaterialCategory.Gas case). Fogo/Lava kills it on
 * contact — checked first, every tick, same idea as Vírus's own
 * sterilize-by-fire check (see stepVirus) — before touching down on a host
 * (rooting a fresh Fungus patch) or a Vírus cell (claiming it, same as a
 * host — see claimVirus), fizzling out (see SPORE_FIZZLE_CHANCE — no
 * separate hard lifespan), and — instead of rising — one random step of
 * isotropic drift, so a puff radiates outward from wherever it appeared and
 * thins out in place rather than climbing off like Vapor does.
 */
export function stepSpore(grid: SimGrid, x: number, y: number): void {
  // Checked against all 8 neighbors, not just the 4 cardinal ones — Fogo is
  // a mobile ember that flickers a cell or two every tick on its own, so a
  // narrower check would miss a diagonal lick of flame constantly.
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nid = grid.get(nx, ny);
    if (nid === MaterialId.Fire || nid === MaterialId.Lava) {
      grid.set(x, y, MaterialId.Empty);
      grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      return;
    }
  }

  for (const [dx, dy] of NEIGHBORS_4) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nid = grid.get(nx, ny);
    if (isHost(nid) && Math.random() < SPORE_LAND_CHANCE) {
      claim(grid, x, y, nid);
      return;
    }
    if (isVirus(nid) && Math.random() < SPORE_VIRUS_INFECT_CHANCE) claimVirus(grid, nx, ny);
  }
  if (Math.random() < SPORE_FIZZLE_CHANCE) {
    grid.set(x, y, MaterialId.Empty);
    return;
  }

  if (Math.random() < SPORE_DRIFT_CHANCE) {
    const [dx, dy] = NEIGHBORS_8[Math.floor(Math.random() * NEIGHBORS_8.length)];
    grid.tryMove(x, y, x + dx, y + dy, SPORE_DENSITY);
  }
}
