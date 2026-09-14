import type { SimGrid } from "../grid";
import { COLD_1, COLD_2, COLD_3, isProsperous } from "../temperature";
import { MaterialId } from "../types";
import { NEIGHBORS_4, NEIGHBORS_8 } from "../neighbors";
import { WHEAT_RIPE } from "../metaBits";
import { HOUSE_WALL_META, HOUSE_KIND_MASK, HOUSE_FLOOR } from "../houseBlueprints";
import {
  SPROUT_BUDGET_MIN, SPROUT_BUDGET_MASK, SPROUT_REGROWTH_BONUS, SPROUT_REGROWN_FLAG, SPROUT_FOREST_FLAG,
  FOREST_SEED_META, TREE_TRUNK_META, TREE_TRUNK_HEIGHT, TREE_CROWN_START, TREE_CROWN_SHAPE,
  TREE_TRUNK_DIRECTIONS, SPROUT_DIRECTIONS, WHEAT_MAX_HEIGHT, WHEAT_PER_FARMER,
} from "../grid";

/*
 * ── Plantas, Sementes, Brotos, árvores e Trigo ─────────────────────────────
 * Everything that grows: Planta's water-driven spread, Semente germinating
 * into a Broto (tree sapling) or a one-shot flower stamp, a Broto's own
 * cell-by-cell growth into a tree (wild or Lenhador-tended), and Trigo's
 * ripen/grow/self-seed cycle. `growthFactor()` is the one shared "how much
 * does the climate help or hurt" knob every one of these checks.
 */
/** Per-tick chance a Planta cell spreads water-driven growth into a touching empty cell. */
const GROWTH_CHANCE = 0.01;
/** Per-tick chance a Semente sitting on damp/dry soil germinates. */
const GERMINATE_CHANCE = 0.05;
/** Per-tick chance a Terra cell touching Água wicks it up into Barro (Mud). */
const MUD_FORM_CHANCE = 0.05;
/** Chance a spreading Planta blooms into a Flor cell instead of plain leaf, checked only in the prosperous band. */
const FLOWER_BLOOM_CHANCE = 0.25;
/** Standalone per-tick chance a Planta cell blossoms directly into a touching empty cell while the climate is prosperous, even with no Água nearby to trigger its usual water-driven spread — a mature, already-settled patch still gets to flower once conditions are ideal. */
const PLANT_PROSPEROUS_BLOOM_CHANCE = 0.006;
/** Growth budget a forester's seedling germinates with (vs a wild Semente's SPROUT_BUDGET_MIN..MAX) — enough for a trunk and a tidy crown, no more. Fits in the 6-bit budget field. */
const FOREST_SEED_BUDGET = 22;
/**
 * A Sprout's `meta` byte normally just holds its remaining growth budget,
 * but budgets never exceed SPROUT_BUDGET_MAX — comfortably under 128.
 */
const SPROUT_BUDGET_MAX = 34;
/** Per-tick chance a low, canopy-topped Sprout cell hardens into a Madeira trunk. */
const TREE_HARDEN_CHANCE = 0.12;
/** Crown cells (Sprout/Planta/Flor above) a trunk cell needs before it starts to lignify. */
const TREE_CROWN_FOR_BARK = 2;
/** Per-tick chance a fully-grown (budget-exhausted), not-yet-regrown Sprout gains a one-time bonus growth budget while sitting in the prosperous climate — see stepSprout. */
const SPROUT_PROSPEROUS_REGROWTH_CHANCE = 0.004;

/**
 * Tiny stamped shapes a Semente becomes when it germinates on Barro — a
 * one-shot pattern instead of gradual growth, so its size is guaranteed
 * (never more than 3 rows above the seed) rather than merely likely. Each
 * entry is [dx, dy, isFlower] relative to the seed's own cell; `isFlower`
 * cells become Flor (petal color varies by meta), the rest become a
 * dormant Sprout (stem green).
 */
const FLOWER_PATTERNS = [
  [[0, -1, false], [0, -2, true]],
  [[0, -1, false], [-1, -2, true], [1, -2, false]],
  [[0, -1, false], [0, -2, false], [-1, -2, true], [1, -2, true]],
  [[0, -1, false], [0, -2, false], [0, -3, true]],
  [[0, -1, false], [-1, -1, true], [1, -1, true]],
] as const;

/**
 * Taller variants of FLOWER_PATTERNS, used instead of the normal set while
 * the temperature is in the prosperous band — roughly double the reach
 * (the tallest normal pattern caps at 3 rows; these cap at 6), so a
 * Semente sprouting right when things are thriving visibly grows bigger
 * than one sprouting in ordinary conditions.
 */
const FLOWER_PATTERNS_PROSPEROUS = [
  [[0, -1, false], [0, -2, false], [0, -3, false], [0, -4, true]],
  [[0, -1, false], [0, -2, false], [-1, -3, false], [-1, -4, true], [1, -3, false], [1, -4, false]],
  [[0, -1, false], [0, -2, false], [0, -3, false], [-1, -4, true], [1, -4, true]],
  [[0, -1, false], [0, -2, false], [0, -3, false], [0, -4, false], [0, -5, false], [0, -6, true]],
  [[0, -1, false], [0, -2, false], [-1, -2, true], [1, -2, true], [0, -3, false], [0, -4, false], [-1, -4, true], [1, -4, true]],
] as const;

/**
 * Small stamped flower clusters a mature Planta blooms directly into on its
 * own in the prosperous climate — see PLANT_PROSPEROUS_BLOOM_CHANCE. Reach
 * up/sideways only (never a negative dy, i.e. never downward — a plant
 * doesn't sprout growth into the ground it's standing on) and never more
 * than 4 cells from the Planta cell itself. Each entry is [dx, dy,
 * isFlower] relative to the blooming Planta cell; `isFlower` cells become
 * Flor, the rest a plain Sprout-colored stem.
 */
const PLANT_BLOOM_FLOWER_PATTERNS = [
  [[1, 0, false], [2, 0, false], [3, -1, true]],
  [[-1, 0, false], [-2, -1, false], [-3, -1, true]],
  [[0, -1, false], [1, -2, false], [2, -3, true], [-1, -2, false], [-2, -3, true]],
  [[1, -1, false], [2, -2, false], [3, -3, true]],
  [[-1, -1, false], [-2, -2, false], [-3, -3, true], [-4, -4, true]],
] as const;

/**
 * Small twisted-branch shapes a mature Planta blooms into instead of a
 * flower cluster — the same reach/direction rules as
 * PLANT_BLOOM_FLOWER_PATTERNS, but all plain Sprout-colored stem (no Flor),
 * zig-zagging as it climbs to read as a gnarled little branch rather than a
 * straight twig.
 */
const PLANT_BLOOM_BRANCH_PATTERNS = [
  [[1, 0, false], [2, -1, false], [1, -2, false], [2, -3, false]],
  [[-1, 0, false], [-2, -1, false], [-1, -2, false], [-2, -3, false]],
  [[1, -1, false], [0, -2, false], [1, -3, false], [0, -4, false]],
  [[-1, -1, false], [0, -2, false], [-1, -3, false], [0, -4, false]],
] as const;

/** Ripeness at which a cell can shoot one above it. */
const WHEAT_GROW_AT = 26;
/** How much a Trigo head's ripeness climbs per tick, scaled by growthFactor(). */
const WHEAT_RIPEN_PER_TICK = 1;
/** Per-tick chance a rooted, ripe-enough stalk under WHEAT_MAX_HEIGHT grows one cell taller. */
const WHEAT_GROW_CHANCE = 0.06;
/** Per-tick chance a ripe head self-seeds onto adjacent bare soil. */
const WHEAT_SEED_CHANCE = 0.006;
/** Per-tick chance an unrooted stalk withers away. */
const WHEAT_WITHER_CHANCE = 0.05;

  /**
   * How much temperature holds plant reproduction back or helps it along
   * — checked by Planta spreading, Semente germinating, and Broto
   * growing, all three being different flavors of "plants reproducing".
   * Colder than neutral slows it down in 3 steps; right in the
   * prosperous band (green background) it gets a boost instead — this is
   * the one place heat helps rather than hurts, since that band
   * specifically represents the temperature life thrives at. Above it,
   * heat goes back to being neutral for growth (it has its own problems —
   * spontaneous fires — instead).
   */
export function growthFactor(grid: SimGrid): number {
    if (grid.temp <= COLD_3) return 0.15;
    if (grid.temp <= COLD_2) return 0.4;
    if (grid.temp <= COLD_1) return 0.7;
    if (isProsperous(grid.temp)) return 1.6;
    return 1;
  }

export function stepOrganic(grid: SimGrid, x: number, y: number): void {
    grid.processed[grid.index(x, y)] = 1;

    let nearWater = false;
    const emptySpots: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.get(nx, ny);
      if (nId === MaterialId.Water) nearWater = true;
      else if (nId === MaterialId.Empty) emptySpots.push([nx, ny]);
    }

    if (nearWater && emptySpots.length > 0 && Math.random() < GROWTH_CHANCE * grid.growthFactor()) {
      const [gx, gy] = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      // In the prosperous band, a spreading Planta sometimes blooms into a
      // Flor cell instead of plain leaf — a visible sign it's thriving.
      if (isProsperous(grid.temp) && Math.random() < FLOWER_BLOOM_CHANCE) {
        grid.set(gx, gy, MaterialId.Flor, Math.floor(Math.random() * 4));
      } else {
        grid.set(gx, gy, MaterialId.Plant);
      }
    } else if (isProsperous(grid.temp) && emptySpots.length > 0 && Math.random() < PLANT_PROSPEROUS_BLOOM_CHANCE) {
      // Planta itself blossoms directly in the prosperous climate, even
      // without touching Água to trigger its usual water-driven spread —
      // a mature, already-settled patch with no water nearby still gets to
      // flower once the climate is ideal, instead of only ever blooming as
      // a side effect of active growth.
      grid.stampProsperousBloom(x, y);
    }
  }

  /**
   * Stamps a small one-shot growth reaching out from an already-mature
   * Planta cell blooming directly in the prosperous climate — alternating
   * between a little flower cluster and a twisted bare branch instead of
   * always the same shape, and only up/sideways (never downward, since a
   * plant doesn't sprout growth into the ground). See
   * PLANT_BLOOM_FLOWER_PATTERNS / PLANT_BLOOM_BRANCH_PATTERNS.
   */
export function stampProsperousBloom(grid: SimGrid, x: number, y: number): void {
    const patterns = Math.random() < 0.5 ? PLANT_BLOOM_FLOWER_PATTERNS : PLANT_BLOOM_BRANCH_PATTERNS;
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    for (const [dx, dy, isFlower] of pattern) {
      const gx = x + dx;
      const gy = y + dy;
      if (!grid.inBounds(gx, gy) || grid.get(gx, gy) !== MaterialId.Empty) continue;
      if (isFlower) {
        grid.set(gx, gy, MaterialId.Flor, Math.floor(Math.random() * 4));
      } else {
        grid.set(gx, gy, MaterialId.Sprout, 0);
      }
    }
  }

  /** Terra wicks up touching water and turns to Barro (Mud). */
export function stepDirt(grid: SimGrid, x: number, y: number): void {
    if (Math.random() >= MUD_FORM_CHANCE) return;
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (grid.get(nx, ny) === MaterialId.Water) {
        grid.set(x, y, MaterialId.Mud);
        grid.set(nx, ny, MaterialId.Empty);
        return;
      }
    }
  }

  /**
   * Seeds germinate differently depending on which soil they land on. On
   * dry Terra they become a Broto (Sprout) that grows cell by cell up to a
   * random budget — see `stepSprout`. On Barro (already-wet soil) they
   * instead stamp one small random branch-and-flower shape in a single
   * step (see `stampFlower`) — real growth simulation isn't needed there
   * since the result must stay tiny (never more than 3 rows tall) no
   * matter what, and a one-shot stamp guarantees that where a probabilistic
   * grower could only make it likely.
   */
export function stepSeed(grid: SimGrid, x: number, y: number): void {
    // Touching Planta, Broto, Madeira or Flor from any side — not just
    // resting straight on top — instead of soil: there's nothing for it to
    // germinate into there, so it's absorbed harmlessly instead of piling
    // up against them. Checked on all 8 neighbors (not just straight down)
    // because an irregularly-shaped plant clump can just as easily block a
    // seed from the side or a diagonal nook as from directly underneath.
    // Broto matters here as much as the mature growths: dropping a big
    // batch of Sementes at once over a growing patch, some land straight on
    // young Brotos rather than the Plantas/Flores they'll eventually
    // become — without this they'd sit there forever, since a Broto is
    // neither soil to germinate into nor one of the mature growths that
    // absorbs them.
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.get(nx, ny);
      if (nId === MaterialId.Plant || nId === MaterialId.Wood || nId === MaterialId.Flor || nId === MaterialId.Sprout) {
        grid.set(x, y, MaterialId.Empty);
        return;
      }
    }

    let onMud = false;
    let onDirt = false;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.get(nx, ny);
      if (nId === MaterialId.Mud) onMud = true;
      else if (nId === MaterialId.Dirt) onDirt = true;
    }
    if (!onMud && !onDirt) return;
    if (Math.random() >= GERMINATE_CHANCE * grid.growthFactor()) return;

    // A forester's seedling grows a full tree even on damp ground, where a
    // wild Semente would only ever stamp a little flower.
    const forester = (grid.meta[grid.index(x, y)] & FOREST_SEED_META) !== 0;
    if (onMud && !forester) {
      grid.stampFlower(x, y);
    } else if (forester) {
      const budget = Math.min(SPROUT_BUDGET_MASK, FOREST_SEED_BUDGET + Math.floor(Math.random() * 8));
      grid.set(x, y, MaterialId.Sprout, budget | SPROUT_FOREST_FLAG);
    } else {
      const budget = SPROUT_BUDGET_MIN + Math.floor(Math.random() * (SPROUT_BUDGET_MAX - SPROUT_BUDGET_MIN));
      grid.set(x, y, MaterialId.Sprout, budget);
    }
  }

  /** Stamps one random small branch-and-flower pattern rooted at (x, y) — see FLOWER_PATTERNS, or the taller FLOWER_PATTERNS_PROSPEROUS while conditions are thriving. */
export function stampFlower(grid: SimGrid, x: number, y: number): void {
    grid.set(x, y, MaterialId.Sprout, 0);
    const patterns = isProsperous(grid.temp) ? FLOWER_PATTERNS_PROSPEROUS : FLOWER_PATTERNS;
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    for (const [dx, dy, isFlower] of pattern) {
      const gx = x + dx;
      const gy = y + dy;
      if (!grid.inBounds(gx, gy) || grid.get(gx, gy) !== MaterialId.Empty) continue;
      if (isFlower) {
        grid.set(gx, gy, MaterialId.Flor, Math.floor(Math.random() * 4));
      } else {
        grid.set(gx, gy, MaterialId.Sprout, 0);
      }
    }
  }

  /**
   * A germinated Sprout grows toward open space above it — mostly
   * straight up, sometimes branching sideways — instead of Planta's
   * uniform blob-in-any-empty-neighbor spread, so different seeds come out
   * as different little irregular shapes. Both the parent and the new cell
   * spend one unit of the shared growth budget (carried in `meta`), so a
   * sprout can neither branch forever nor chain arbitrarily deep — once
   * the budget hits zero it's normally a mature, static plant.
   *
   * That cap isn't permanent, though: a plant that finished growing (or
   * was one-shot stamped by a Semente germinating on Barro — see
   * stampFlower, which also builds out of budget-0 Sprout cells) while the
   * climate was anything but ideal doesn't stay stunted forever if the
   * climate later turns prosperous. A budget-exhausted Sprout sitting in
   * the prosperous band gets a slow trickle of bonus budget instead,
   * letting it resume growing exactly like it would have if it had
   * germinated in good conditions to begin with.
   */
  /** Cells of trunk (Madeira flagged TREE_TRUNK) plus Broto/Planta stacked straight below (x, y), down to soil — how high up its own stem this cell sits. Capped. */
export function stemBelow(grid: SimGrid, x: number, y: number): number {
    let n = 0;
    for (let d = 1; d <= 10; d++) {
      const ny = y + d;
      if (!grid.inBounds(x, ny)) break;
      const j = grid.index(x, ny);
      const m = grid.material[j];
      if (m === MaterialId.Sprout || m === MaterialId.Plant) { n++; continue; }
      if (m === MaterialId.Wood && (grid.meta[j] & TREE_TRUNK_META) !== 0) { n++; continue; }
      break;
    }
    return n;
  }

  /** Broto/Planta/Flor cells stacked straight above (x, y) — the crown carried over this stem cell. Capped. */
export function crownAbove(grid: SimGrid, x: number, y: number): number {
    let n = 0;
    for (let d = 1; d <= 8; d++) {
      const ny = y - d;
      if (!grid.inBounds(x, ny)) break;
      const m = grid.material[grid.index(x, ny)];
      if (m === MaterialId.Sprout || m === MaterialId.Plant || m === MaterialId.Flor) n++;
      else break;
    }
    return n;
  }

export function stepSprout(grid: SimGrid, x: number, y: number, i: number): void {
    grid.processed[i] = 1;
    const raw = grid.meta[i];
    let budget = raw & SPROUT_BUDGET_MASK;
    // Whether this cell (or the regrowth event it descends from) already
    // spent its one prosperous catch-up bonus — see the flag's write site
    // below for why it has to propagate to every cell grown afterward, not
    // just block the exact cell that rolled it.
    let regrown = (raw & SPROUT_REGROWN_FLAG) !== 0;
    const forest = (raw & SPROUT_FOREST_FLAG) !== 0; // a Lenhador's tended tree

    // Lignify: a low cell of a tall plant, rooted near soil with a real crown
    // of leaves above it, slowly turns woody — so a grown tree reads as a
    // brown trunk under a green canopy instead of one green blob. Checked
    // before the budget gate so a finished tree still hardens its trunk.
    const stem = grid.stemBelow(x, y);
    if (stem < TREE_TRUNK_HEIGHT && grid.crownAbove(x, y) >= TREE_CROWN_FOR_BARK && Math.random() < TREE_HARDEN_CHANCE) {
      grid.set(x, y, MaterialId.Wood, TREE_TRUNK_META);
      return;
    }

    if (budget <= 0 && (regrown || !isProsperous(grid.temp))) return;

    // Mud counts as moisture too — it's Terra that already absorbed its
    // neighboring Water (see stepDirt), so a sprout rooted in Barro stays
    // "watered" even after the puddle beside it has been consumed. Checked
    // out to 2 cells (not just direct neighbors) so a shoot can still reach
    // its roots' moisture a couple of rows up, instead of stalling the
    // instant it grows one cell away from the water/mud below it.
    let nearMoisture = forest; // the forester keeps its saplings watered
    for (let dy = -2; dy <= 2 && !nearMoisture; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inBounds(nx, ny)) continue;
        const nId = grid.get(nx, ny);
        if (nId === MaterialId.Water || nId === MaterialId.Mud) {
          nearMoisture = true;
          break;
        }
      }
    }
    // A cell sitting on its own stem (Broto/Planta/trunk right below) can
    // reach further down that stem to its roots' water — that's what lets a
    // tree keep growing tall well above the damp ground it's rooted in,
    // instead of every shoot topping out two cells over the soil.
    if (!nearMoisture) {
      for (let d = 1; d <= 6; d++) {
        const ny = y + d;
        if (!grid.inBounds(x, ny)) break;
        const m = grid.material[grid.index(x, ny)];
        if (m === MaterialId.Water || m === MaterialId.Mud) { nearMoisture = true; break; }
        const stem = m === MaterialId.Sprout || m === MaterialId.Plant ||
          (m === MaterialId.Wood && (grid.meta[grid.index(x, ny)] & TREE_TRUNK_META) !== 0);
        if (!stem) break;
      }
    }
    if (!nearMoisture) return;

    if (budget <= 0) {
      if (Math.random() >= SPROUT_PROSPEROUS_REGROWTH_CHANCE) return;
      // A one-time catch-up, not a fountain: this cell and every cell it
      // grows from here on carry the "already regrown" flag forward, so
      // repeatedly leaving and re-entering the prosperous climate can't
      // keep re-triggering fresh bonus growth on the same lineage forever
      // — each originally-dormant cell gets exactly one bonus round, ever.
      budget = SPROUT_REGROWTH_BONUS;
      regrown = true;
      grid.meta[i] = budget | SPROUT_REGROWN_FLAG | (forest ? SPROUT_FOREST_FLAG : 0);
    }

    if (Math.random() >= GROWTH_CHANCE * grid.growthFactor()) return;
    const flags = (regrown ? SPROUT_REGROWN_FLAG : 0) | (forest ? SPROUT_FOREST_FLAG : 0);

    // A tended tree: a clean vertical trunk, then a crown stamped in one go, so
    // it reads as a real tree rather than a random bush.
    if (forest) {
      if (grid.crownAbove(x, y) > 0) return; // this cell is inside the crown already
      if (stem < TREE_CROWN_START) {
        // still growing the bare trunk, straight up
        if (grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Empty) {
          grid.set(x, y - 1, MaterialId.Sprout, ((budget - 1) & SPROUT_BUDGET_MASK) | flags);
          grid.meta[i] = flags; // this cell is trunk now — done, ready to lignify
        }
        return;
      }
      // reached crown height — stamp the foliage around the tip
      for (const [dx, dy] of TREE_CROWN_SHAPE) {
        const cx = x + dx;
        const cy = y + dy;
        if (grid.inBounds(cx, cy) && grid.get(cx, cy) === MaterialId.Empty) {
          grid.set(cx, cy, MaterialId.Sprout, flags); // budget 0 — a settled leaf
        }
      }
      grid.meta[i] = flags;
      return;
    }

    // Wild Broto: bushy weighted spread, cloning its budget at every branch.
    const candidates: [number, number][] = [];
    for (const [dx, dy, weight] of (stem < TREE_TRUNK_HEIGHT ? TREE_TRUNK_DIRECTIONS : SPROUT_DIRECTIONS)) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny) || grid.get(nx, ny) !== MaterialId.Empty) continue;
      for (let w = 0; w < weight; w++) candidates.push([nx, ny]);
    }
    if (candidates.length === 0) return;
    const [gx, gy] = candidates[Math.floor(Math.random() * candidates.length)];
    const childMeta = ((budget - 1) & SPROUT_BUDGET_MASK) | flags;
    grid.set(gx, gy, MaterialId.Sprout, childMeta);
    grid.meta[i] = childMeta;
  }

  /**
   * Trigo. `meta` is a ripeness clock: it ticks up (climate-scaled), the
   * renderer greens it low and golds it high. A stalk needs its roots near
   * soil — the bottom cell must sit on Terra/Barro/another wheat cell, or it
   * withers. With enough ripeness and headroom it grows one cell taller, up
   * to WHEAT_MAX_HEIGHT. Ripe heads (meta ≥ WHEAT_RIPE) occasionally fling a
   * shoot onto adjacent bare soil, so a sown row fills into a field.
   */
export function stepWheat(grid: SimGrid, x: number, y: number, i: number): void {
    grid.processed[i] = 1;

    // Rooted? The cell directly below must be soil or more wheat (a taller
    // segment standing on a lower one). Anything else underfoot — air, water,
    // a wall it grew off the edge of — and the stalk withers.
    const bi = grid.inBounds(x, y + 1) ? grid.index(x, y + 1) : -1;
    const below = bi >= 0 ? (grid.material[bi] as MaterialId) : MaterialId.Stone;
    const onStoreFloor = bi >= 0 &&
      (grid.meta[bi] & HOUSE_WALL_META) !== 0 && (grid.meta[bi] & HOUSE_KIND_MASK) === HOUSE_FLOOR;
    const rooted =
      below === MaterialId.Dirt || below === MaterialId.Mud || below === MaterialId.Wheat ||
      below === MaterialId.Sand || // takes to loose sand too, just poorly
      onStoreFloor;                // grain stacked on a storehouse floor keeps
    if (!rooted) {
      if (Math.random() < WHEAT_WITHER_CHANCE) grid.set(x, y, MaterialId.Empty);
      return;
    }

    let ripe = grid.meta[i];
    if (ripe < 255 && Math.random() < grid.growthFactor()) {
      ripe = Math.min(255, ripe + WHEAT_RIPEN_PER_TICK);
      grid.meta[i] = ripe;
    }

    // Grow taller: only from a cell that's ripened a bit, only if this stalk
    // is under WHEAT_MAX_HEIGHT and the cell above is clear.
    if (ripe >= WHEAT_GROW_AT && grid.get(x, y - 1) === MaterialId.Empty && Math.random() < WHEAT_GROW_CHANCE * grid.growthFactor()) {
      let stalk = 1;
      for (let d = 1; d < WHEAT_MAX_HEIGHT; d++) {
        if (grid.get(x, y + d) === MaterialId.Wheat) stalk++;
        else break;
      }
      if (stalk < WHEAT_MAX_HEIGHT) grid.set(x, y - 1, MaterialId.Wheat, 0);
    }

    // A ripe head sows itself into an adjacent empty cell that has soil under
    // it — but not in under a house, and not once the field's at its limit.
    if (
      ripe >= WHEAT_RIPE && !grid.roofedOver(x, y) &&
      grid.cropCensus < Math.max(1, grid.farmerCensus) * WHEAT_PER_FARMER + 40 &&
      Math.random() < WHEAT_SEED_CHANCE * grid.growthFactor()
    ) {
      const spots: [number, number][] = [];
      for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inBounds(nx, ny) || grid.get(nx, ny) !== MaterialId.Empty) continue;
        if (grid.roofedOver(nx, ny)) continue;
        const g = grid.inBounds(nx, ny + 1) ? grid.get(nx, ny + 1) : MaterialId.Stone;
        if (g === MaterialId.Dirt || g === MaterialId.Mud) spots.push([nx, ny]);
      }
      if (spots.length > 0) {
        const [sx, sy] = spots[Math.floor(Math.random() * spots.length)];
        grid.set(sx, sy, MaterialId.Wheat, 0);
      }
    }
  }
