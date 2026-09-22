import type { SimGrid } from "../grid";
import {
  HOUSE_SPACING, MASON_FOUND_CHANCE, STORE_REACH, HARVEST_WORK, WATER_ONLY, FOLK_FORAGE_HUNGER,
} from "../grid";
import { MaterialId } from "../types";
import { NEIGHBORS_8 } from "../neighbors";
import { WHEAT_RIPE } from "../metaBits";
import { HOUSE_PLANS, PLAN_GRANARY } from "../houseBlueprints";
import { CREATURE_FED_MAX, packCreature, creatureFacing, creatureFed, creatureTimer } from "../creatureMeta";
import { INFECTED_HARVEST_WORK } from "./infection";

/** Stray mature growth a Plantador harvests alongside its ripe Trigo. */
const FARMER_CROPS: readonly MaterialId[] = [MaterialId.Plant, MaterialId.Flor];
const DRY_SOIL = [MaterialId.Dirt] as const;
/** Per-tick chance a Fazendeiro sows Trigo / waters Terra when it's in the right spot. */
const FARMER_WORK_CHANCE = 0.4;
/** Cells of level furrow the Plantador needs ahead of it before it will sow a shoot (it grades a slightly wider strip). */
const WHEAT_FURROW = 1;

  /**
   * Plantador. Like the Construtor, a focused worker that *levels before it
   * sows*: it carries Água from a pool to dry Terra to make Barro, grades
   * the furrow ahead flat, and only then plants Trigo on it — Trigo takes
   * only on level ground. A sown row grows and self-seeds into a field.
   * Harvests a ripe Trigo head (or stray mature Planta/Flor) it touches for
   * a full meal. Over time it turns a barren strip into cropland that feeds
   * the whole village.
   */
export function stepFarmer(grid: SimGrid, x: number, y: number, i: number): void {
    grid.processed[i] = 1;
    const facing = creatureFacing(grid.meta[i]);
    let carrying = creatureTimer(grid.meta[i]) === 1;
    let fed = grid.folkUpkeep(x, y, creatureFed(grid.meta[i]));
    if (fed < 0) return;
    grid.tickPipInfection(x, y, i);
    const infected = grid.isPipInfected(i);
    if (!infected && !grid.folkActNow(x, y)) { // slow, deliberate labour (but act every tick to swim clear of water) — an infected Fazendeiro skips this entirely, it never slows down
      grid.meta[i] = packCreature(facing, carrying ? 1 : 0, fed);
      return;
    }
    if (grid.folkWeather(x, y, i, facing, fed, carrying ? 1 : 0)) return;

    const below = grid.inBounds(x, y + 1) ? grid.get(x, y + 1) : MaterialId.Stone;

    // Raise a celeiro once the field's established and the village wants one —
    // before working the field, so a farmer standing in a mature crop still
    // gets round to putting up the storehouse.
    if (!carrying && grid.fieldWantsGranary() && (below === MaterialId.Dirt || below === MaterialId.Mud) &&
      !grid.nearStore(x, y, HOUSE_SPACING) && grid.countNear(x, y, MaterialId.Water, 3) === 0) {
      if (grid.gradeStrip(x, y, HOUSE_PLANS[PLAN_GRANARY].span + 1)) {
        grid.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      if (Math.random() < MASON_FOUND_CHANCE && grid.raiseStoreRight(x, y, PLAN_GRANARY)) {
        grid.meta[i] = packCreature(facing, 0, fed);
        return;
      }
    }

    // Harvest a ripe head it's standing beside — a slow job it works at over
    // several turns. Hungry, it eats the head; otherwise, if there's a celeiro
    // in reach and the field's already big enough, the grain goes into store.
    let ripeAt: [number, number] | null = null;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx, ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const ni = grid.index(nx, ny);
      const nId = grid.material[ni] as MaterialId;
      if ((nId === MaterialId.Wheat && grid.meta[ni] >= WHEAT_RIPE) || FARMER_CROPS.includes(nId)) { ripeAt = [nx, ny]; break; }
    }
    if (ripeAt && !carrying) {
      const hungry = fed <= FOLK_FORAGE_HUNGER;
      // Once the field's got going, spare ripe heads go into the celeiro.
      const store = hungry || grid.cropCensus < 30 ? null : grid.nearestStore(x, y, PLAN_GRANARY, STORE_REACH);
      if (hungry || store) {
        if (grid.harvestReady(i, infected ? INFECTED_HARVEST_WORK : HARVEST_WORK)) {
          if (hungry) { grid.set(ripeAt[0], ripeAt[1], MaterialId.Empty); fed = CREATURE_FED_MAX; }
          else if (store && grid.stashInStore(store[0], store[1], PLAN_GRANARY, MaterialId.Wheat)) {
            grid.set(ripeAt[0], ripeAt[1], MaterialId.Empty);
          }
        }
        grid.meta[i] = packCreature(facing, 0, fed);
        return; // stood at the work
      }
    }

    if (!carrying) {
      const water = grid.adjacentOf(x, y, WATER_ONLY);
      if (water.length > 0 && Math.random() < FARMER_WORK_CHANCE) {
        const [wx, wy] = water[Math.floor(Math.random() * water.length)];
        grid.set(wx, wy, MaterialId.Empty);
        carrying = true;
      }
    }

    let wantDir = 0;
    if (carrying && below === MaterialId.Dirt && Math.random() < FARMER_WORK_CHANCE) {
      grid.set(x, y + 1, MaterialId.Mud);
      carrying = false;
    } else if (!carrying && (below === MaterialId.Dirt || below === MaterialId.Mud || below === MaterialId.Fungus)) {
      // Grade the furrow flat, then sow one shoot on it. Standing to grade is
      // the "level first" beat; Trigo only takes on level ground. Fungus
      // ground has no bumps for gradeStrip to find (it only looks for rough
      // Areia/Terra/Barro), so it's already effectively "graded" — the
      // Fazendeiro just moves straight on to sowing there.
      if (grid.gradeStrip(x, y, WHEAT_FURROW + 1) && Math.random() < 0.7) {
        grid.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      const f = x + 1;
      const belowF = grid.get(f, y + 1);
      if (
        grid.get(f, y) === MaterialId.Empty &&
        (belowF === MaterialId.Dirt || belowF === MaterialId.Mud || belowF === MaterialId.Fungus) &&
        grid.groundLevel(x, y, WHEAT_FURROW) &&
        grid.fieldWantsMoreWheat() &&
        !grid.roofedOver(f, y) && !grid.roofedOver(x, y) && // never sow indoors
        Math.random() < FARMER_WORK_CHANCE
      ) {
        grid.set(f, y, MaterialId.Wheat, 0);
      }
    }

    if (wantDir === 0) {
      // Carrying with no dry soil underfoot -> go find some. Empty-handed ->
      // go find water. Otherwise there's nothing to travel to (soil is right
      // here) and folkWalk keeps it working this patch.
      wantDir = carrying
        ? (below === MaterialId.Dirt ? 0 : grid.folkScanDir(x, y, DRY_SOIL))
        : grid.folkScanDir(x, y, WATER_ONLY);
    }
    grid.folkWalk(x, y, i, facing, fed, carrying ? 1 : 0, wantDir);
  }
