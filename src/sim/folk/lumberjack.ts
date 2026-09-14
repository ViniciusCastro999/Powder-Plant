import type { SimGrid } from "../grid";
import {
  TREE_TRUNK_META, HARVEST_WORK, STORE_REACH, HOUSE_SPACING, MASON_FOUND_CHANCE,
  TREE_CROWN_DX_MAX, TREE_CROWN_DY_MAX, TREE_CROWN_START, FOREST_SEED_META, FOLK_SCAN_RANGE,
  LUMBERJACK_MIN_TREE,
} from "../grid";
import { MaterialId, MaterialCategory } from "../types";
import { MATERIALS } from "../materials";
import { NEIGHBORS_8 } from "../neighbors";
import { HOUSE_WALL_META, HOUSE_PLANS, PLAN_WOODSHED } from "../houseBlueprints";
import { packCreature, creatureFacing, creatureFed } from "../creatureMeta";

/** Per-tick chance a Lenhador sows a Semente on the bare soil ahead of it. */
const LUMBERJACK_SOW_CHANCE = 0.32;
/** How clear of other greenery a patch has to be before a Lenhador plants there. */
const LUMBERJACK_SPACING = 4;
/** Width of the strip a Lenhador levels flat before sowing a seedling, like the other trades grade before they work. */
const LUMBERJACK_PLOT = 2;
/** Loose Madeira logs a felled tree yields, scattered on the ground beside the (now-clear) stump. */
const LUMBERJACK_LOG_YIELD = 3;
/** Madeira within 6 cells at or above which a Lenhador stops felling — the woodlot's stocked, don't carpet the ground with trunks. */
const LUMBERJACK_STOCK = 10;

  /** Loose (cut, not trunk / not structural) Madeira within `r` of (x, y). */
export function looseWoodNear(grid: SimGrid, x: number, y: number, r: number): number {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= grid.width) continue;
        const j = ny * grid.width + nx;
        if (grid.material[j] === MaterialId.Wood && (grid.meta[j] & (HOUSE_WALL_META | TREE_TRUNK_META)) === 0) n++;
      }
    }
    return n;
  }

  /**
   * Lenhador: a forester. Sows a Semente on bare Terra/Barro and then *leaves
   * it be* — the shoot grows a bare trunk that lignifies to Madeira under a
   * spreading green crown. Only once the tree has really filled out does the
   * Lenhador fell it: the crown drops away and the trunk becomes a stack of
   * cut logs. It stops once the woodlot's stocked. That growing woodpile is
   * what a Construtor needs before it will bridge a river.
   */
export function stepLumberjack(grid: SimGrid, x: number, y: number, i: number): void {
    grid.processed[i] = 1;
    const facing = creatureFacing(grid.meta[i]);
    const fed = grid.folkUpkeep(x, y, creatureFed(grid.meta[i]));
    if (fed < 0) return;
    if (!grid.folkActNow(x, y)) { // slow, deliberate labour (but act every tick to swim clear of water)
      grid.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    const flee = grid.fleeSkeletonDir(x, y);
    if (flee !== 0) { grid.folkWalk(x, y, i, flee, fed, 0, flee); return; }
    if (grid.folkWeather(x, y, i, facing, fed, 0)) return;

    // Fell a fully-grown tree it's touching — one with a lignified trunk under
    // a finished crown — while the woodlot still has room for the timber. A
    // sapling (no woody trunk yet) or a bare shoot is left alone to grow.
    const targets: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const tx = x + dx, ty = y + dy;
      if (grid.isTrunk(tx, ty)) targets.push([tx, ty]);
    }
    if (targets.length > 0 && grid.looseWoodNear(x, y, 16) < LUMBERJACK_STOCK) {
      targets.sort((a, b) => b[1] - a[1]); // lowest first
      for (const [tx, ty] of targets) {
        const by = grid.treeBase(tx, ty);
        const under = grid.get(tx, by + 1);
        if (under === MaterialId.Empty || MATERIALS[under].category === MaterialCategory.Liquid) continue;
        if (grid.treeCrown(tx, by) < LUMBERJACK_MIN_TREE) continue; // still a seedling — let it grow

        // Felling is slow work — it stands and swings the axe for a while first.
        if (!grid.harvestReady(i, HARVEST_WORK)) {
          grid.meta[i] = packCreature(facing, 0, fed);
          return;
        }

        // Timber it: the *whole* tree comes down — trunk and crown, both sides
        // — leaving the ground clear for the next sapling.
        for (let dy = -16; dy <= 1; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const cx = tx + dx, cy = by + dy;
            const g = grid.get(cx, cy);
            if (grid.isTrunk(cx, cy) || g === MaterialId.Sprout || g === MaterialId.Plant || g === MaterialId.Flor) {
              grid.set(cx, cy, MaterialId.Empty);
            }
          }
        }
        // The cut wood goes into the galpão if there's one in reach; otherwise
        // it drops as loose logs on the ground beside the stump (never in the
        // stump column, so that spot's free for the next seed).
        const shed = grid.nearestStore(x, y, PLAN_WOODSHED, STORE_REACH);
        let dropped = 0;
        for (let n = 0; n < LUMBERJACK_LOG_YIELD; n++) {
          if (shed && grid.stashInStore(shed[0], shed[1], PLAN_WOODSHED, MaterialId.Wood)) { dropped++; continue; }
          for (let r = 1; r <= 6 && dropped === n; r++) {
            for (const cx of [tx - r, tx + r]) {
              if (dropped > n || !grid.inBounds(cx, by)) continue;
              const floor = grid.get(cx, by + 1);
              if (grid.get(cx, by) === MaterialId.Empty && floor !== MaterialId.Empty &&
                MATERIALS[floor].category !== MaterialCategory.Liquid) {
                grid.set(cx, by, MaterialId.Wood, 0);
                dropped++;
              }
            }
          }
        }
        grid.meta[i] = packCreature(facing, 0, fed);
        return;
      }
    }

    // Raise a galpão once the woodlot's producing and the village wants one.
    {
      const gb = grid.inBounds(x, y + 1) ? grid.get(x, y + 1) : MaterialId.Stone;
      if (grid.woodlotWantsShed() && (gb === MaterialId.Dirt || gb === MaterialId.Mud) &&
        grid.countNear(x, y, MaterialId.Water, 3) === 0 && !grid.nearStore(x, y, HOUSE_SPACING)) {
        if (grid.gradeStrip(x, y, HOUSE_PLANS[PLAN_WOODSHED].span + 1)) {
          grid.meta[i] = packCreature(facing, 0, fed);
          return;
        }
        if (Math.random() < MASON_FOUND_CHANCE && grid.raiseStoreRight(x, y, PLAN_WOODSHED)) {
          grid.meta[i] = packCreature(facing, 0, fed);
          return;
        }
      }
    }

    // Prepare the plot before planting, like the other trades: level the
    // strip flat first (never next to water, where slumping the bank floods
    // the place), then sow a seedling on the level ground.
    const below = grid.inBounds(x, y + 1) ? grid.get(x, y + 1) : MaterialId.Stone;
    if (below === MaterialId.Dirt || below === MaterialId.Mud) {
      if (grid.countNear(x, y, MaterialId.Water, 3) === 0 && grid.gradeStrip(x, y, LUMBERJACK_PLOT + 1)) {
        grid.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      const f = x + 1;
      const belowF = grid.get(f, y + 1);
      // A tended tree's crown is stamped in one shot once it's grown (see
      // stepSprout) and only ever lands cells actually on the grid — sown
      // too close to the left/right edge or the top, it comes out clipped
      // and permanently short of LUMBERJACK_MIN_TREE, a "tree" no Lenhador
      // can ever fell and the seed that grew it a dead loss.
      const hasRoom = f - TREE_CROWN_DX_MAX >= 0 && f + TREE_CROWN_DX_MAX < grid.width &&
        y - (TREE_CROWN_START + TREE_CROWN_DY_MAX) >= 0;
      if (
        hasRoom &&
        grid.get(f, y) === MaterialId.Empty &&
        (belowF === MaterialId.Dirt || belowF === MaterialId.Mud) &&
        grid.groundLevel(x, y, LUMBERJACK_PLOT) &&
        grid.clearOfGrowth(x, y, LUMBERJACK_SPACING) &&
        !grid.roofedOver(f, y) && !grid.roofedOver(x, y) &&
        Math.random() < LUMBERJACK_SOW_CHANCE
      ) {
        grid.set(f, y, MaterialId.Seed, FOREST_SEED_META);
        grid.meta[i] = packCreature(facing, 0, fed);
        return;
      }
    }

    // Head for the nearest fully-grown tree (a lignified trunk with a full
    // crown — isMatureTree, not just isTrunk) to fell. A still-growing
    // sapling already has trunk material, but heading for one and camping at
    // its foot doesn't make it grow any faster — it only reads as the
    // Lenhador stuck pacing the same seedling forever. With no tree actually
    // ready, folkWalk drifts it back to the woodlot (Madeira / houses) where
    // it plants and paces while the saplings fill out.
    let wantDir = 0;
    let bestD = Infinity;
    for (let dy = -FOLK_SCAN_RANGE; dy <= FOLK_SCAN_RANGE; dy++) {
      for (let dx = -FOLK_SCAN_RANGE; dx <= FOLK_SCAN_RANGE; dx++) {
        if (dx === 0 && dy === 0 || !grid.isTrunk(x + dx, y + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD && grid.isMatureTree(x + dx, y + dy)) { bestD = d; wantDir = Math.sign(dx) || (Math.random() < 0.5 ? 1 : -1); }
      }
    }
    grid.folkWalk(x, y, i, facing, fed, 0, wantDir);
  }

  /** How many cells of material `id` sit within `r` of (x, y). */
export function countNear(grid: SimGrid, x: number, y: number, id: MaterialId, r: number): number {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < grid.width && grid.material[ny * grid.width + nx] === id) n++;
      }
    }
    return n;
  }

  /** Whether a square of `r` around (x, y) is free of growing things and cut timber — so a Lenhador won't crowd a new sapling onto a field or an existing stand. */
export function clearOfGrowth(grid: SimGrid, x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const g = grid.get(x + dx, y + dy);
        if (
          g === MaterialId.Seed || g === MaterialId.Sprout || g === MaterialId.Plant ||
          g === MaterialId.Flor || g === MaterialId.Wheat || g === MaterialId.Wood
        ) return false;
      }
    }
    return true;
  }
