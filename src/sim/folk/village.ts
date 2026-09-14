import type { SimGrid } from "../grid";
import { WHEAT_PER_FARMER, TREE_TRUNK_META } from "../grid";
import { MaterialId, MaterialCategory } from "../types";
import { MATERIALS } from "../materials";
import { WHEAT_RIPE } from "../metaBits";
import {
  HOUSE_ANCHOR_META, HOUSE_WALL_META, PLAN_GRANARY, PLAN_WOODSHED, houseType,
  HOUSE_PLANS, HOUSE_HEIGHTS, HOUSE_WALLS, HOUSE_WALL_BRICK, HOUSE_WALL_WOOD,
} from "../houseBlueprints";

/**
 * Village-wide census (refreshed on a rolling interval — see stepMason's
 * caller) and the storehouse bookkeeping the trades throttle themselves
 * against: how many houses/crops/timber/farmers/lumberjacks are already
 * out there, whether it's time for another granary/woodshed, and stashing
 * a harvest into one once it's raised.
 */
/** Cut Madeira anywhere on the map at or above which the Construtor has stock enough to start decking a bridge or a staircase — the woodlot has to be worked up first, but only barely: a couple of felled trees' worth, not a whole stockpile, so building starts soon after there's anything to build with at all. */
const BRIDGE_TIMBER_MIN = 4;

  /** Refresh the rolling census the trades throttle themselves against. */
export function takeCensus(grid: SimGrid): void {
    let houses = 0, folk = 0, crops = 0, farmers = 0, timber = 0, granaries = 0, woodsheds = 0, lumberjacks = 0;
    for (let j = 0; j < grid.material.length; j++) {
      const m = grid.material[j];
      if (m === MaterialId.Brick && (grid.meta[j] & HOUSE_ANCHOR_META) !== 0) {
        const t = houseType(grid.meta[j]);
        if (t === PLAN_GRANARY) granaries++;
        else if (t === PLAN_WOODSHED) woodsheds++;
        else houses++;
      } else if (m === MaterialId.Wheat) crops++;
      else if (m === MaterialId.Wood && (grid.meta[j] & (HOUSE_WALL_META | TREE_TRUNK_META)) === 0) {
        timber++; // loose, cut timber — not a bridge plank, house wall, or living trunk
      } else if (m === MaterialId.Mason || m === MaterialId.Lumberjack || m === MaterialId.Farmer || m === MaterialId.Warrior) {
        folk++;
        if (m === MaterialId.Farmer) farmers++;
        else if (m === MaterialId.Lumberjack) lumberjacks++;
      }
    }
    grid.houseCensus = houses;
    grid.folkCensus = folk;
    grid.cropCensus = crops;
    grid.farmerCensus = farmers;
    grid.timberCensus = timber;
    grid.granaryCensus = granaries;
    grid.woodshedCensus = woodsheds;
    grid.lumberjackCensus = lumberjacks;
  }

  /** The Fazendeiro raises a celeiro once the field's big enough, about one per three farmers. */
export function fieldWantsGranary(grid: SimGrid): boolean {
    return grid.cropCensus >= 24 && grid.granaryCensus < Math.max(1, Math.round(grid.farmerCensus / 3));
  }
  /** The Lenhador raises a galpão once the woodlot's producing, about one per three foresters. */
export function woodlotWantsShed(grid: SimGrid): boolean {
    return grid.timberCensus >= 6 && grid.woodshedCensus < Math.max(1, Math.round(grid.lumberjackCensus / 3));
  }

  /** Position [ax, ay] of the nearest storehouse anchor of plan `type` within `range` of (x, y), or null. */
export function nearestStore(grid: SimGrid, x: number, y: number, type: number, range: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dy = -range; dy <= range; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -range; dx <= range; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= grid.width) continue;
        const j = ny * grid.width + nx;
        if (grid.material[j] !== MaterialId.Brick || (grid.meta[j] & HOUSE_ANCHOR_META) === 0) continue;
        if (houseType(grid.meta[j]) !== type) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = [nx, ny]; }
      }
    }
    return best;
  }

  /**
   * A Fazendeiro / Lenhador raising its storehouse just right of (x, y): the
   * ground under the footprint has to be soil, and the volume above clear of
   * anything but its own crop (which it clears as it builds). Returns whether
   * it built.
   */
export function raiseStoreRight(grid: SimGrid, x: number, y: number, type: number): boolean {
    const ax = x + 1;
    const { span } = HOUSE_PLANS[type];
    const height = HOUSE_HEIGHTS[type];
    if (!grid.inBounds(ax + span, y + 1) || !grid.inBounds(ax, y - height - 1)) return false;
    const growth = new Set<MaterialId>([
      MaterialId.Wheat, MaterialId.Sprout, MaterialId.Plant, MaterialId.Flor, MaterialId.Seed,
    ]);
    for (let s = 0; s <= span; s++) {
      const fx = ax + s;
      const under = grid.get(fx, y + 1);
      if (under === MaterialId.Empty || MATERIALS[under].category === MaterialCategory.Liquid) return false;
      for (let up = 0; up <= height; up++) {
        const c = grid.get(fx, y - up);
        if (c !== MaterialId.Empty && MATERIALS[c].category !== MaterialCategory.Powder && !growth.has(c) && !HOUSE_WALLS.includes(c)) {
          return false; // something solid in the way
        }
      }
    }
    // Clear the crop out of the footprint, then conjure the frame.
    for (let s = 0; s <= span; s++) {
      for (let up = 0; up <= height; up++) {
        if (growth.has(grid.get(ax + s, y - up))) grid.set(ax + s, y - up, MaterialId.Empty);
      }
    }
    grid.raiseHouse(ax, y, type === PLAN_GRANARY ? HOUSE_WALL_BRICK : HOUSE_WALL_WOOD, type);
    return true;
  }

  /** Whether any structure anchor (house or storehouse) sits within `r` of (x, y) — so a new storehouse isn't crammed against one. */
export function nearStore(grid: SimGrid, x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= grid.width) continue;
        const j = ny * grid.width + nx;
        if (grid.material[j] === MaterialId.Brick && (grid.meta[j] & HOUSE_ANCHOR_META) !== 0) return true;
      }
    }
    return false;
  }

  /**
   * A slow job (harvest, fell) the unit at cell `i` works over `ticks` of its
   * turns: it stands there, ticking the clock down, and this returns true the
   * one turn the job finishes — then re-arms for the next.
   */
export function harvestReady(grid: SimGrid, i: number, ticks: number): boolean {
    const c = grid.workCd[i];
    if (c === 0) { grid.workCd[i] = ticks; return false; }
    if (c === 1) { grid.workCd[i] = 0; return true; }
    grid.workCd[i] = c - 1;
    return false;
  }

  /** Stack one cell of `material` into the lowest open spot inside the storehouse anchored at (ax, ay). Returns whether it fit. */
export function stashInStore(grid: SimGrid, ax: number, ay: number, type: number, material: MaterialId): boolean {
    const { span, rise } = HOUSE_PLANS[type];
    for (let dy = 0; dy > -rise; dy--) {
      for (let dx = 1; dx < span; dx++) {
        const cx = ax + dx;
        const cy = ay + dy;
        if (grid.inBounds(cx, cy) && grid.get(cx, cy) === MaterialId.Empty) {
          grid.set(cx, cy, material, material === MaterialId.Wheat ? WHEAT_RIPE : 0);
          return true;
        }
      }
    }
    return false;
  }

  /** The masons stop founding once there's a house per Pip — a village, not a housing estate. */
export function villageWantsHouse(grid: SimGrid): boolean {
    return grid.houseCensus < Math.max(1, grid.folkCensus);
  }

  /** The farmers stop sowing once the field's big enough for the hands tending it. */
export function fieldWantsMoreWheat(grid: SimGrid): boolean {
    return grid.cropCensus < Math.max(1, grid.farmerCensus) * WHEAT_PER_FARMER;
  }

  /** The masons only start a bridge once the Lenhador has worked up a woodpile to build it from. */
export function villageHasTimber(grid: SimGrid): boolean {
    return grid.timberCensus >= BRIDGE_TIMBER_MIN;
  }

  /** Take one cut Madeira cell (nearest, non-deck) off the map — a plank the Construtor just laid came from the woodpile. No-op if there's none in reach. */
export function consumeTimber(grid: SimGrid, x: number, y: number): void {
    let bi = -1, bd = Infinity;
    for (let dy = -80; dy <= 80; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -80; dx <= 80; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= grid.width) continue;
        const j = ny * grid.width + nx;
        if (grid.material[j] !== MaterialId.Wood || (grid.meta[j] & (HOUSE_WALL_META | TREE_TRUNK_META)) !== 0) continue; // loose timber only
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = j; }
      }
    }
    if (bi >= 0) {
      grid.material[bi] = MaterialId.Empty;
      grid.meta[bi] = 0;
      grid.hp[bi] = 0;
      grid.wake(bi % grid.width, (bi / grid.width) | 0);
      if (grid.timberCensus > 0) grid.timberCensus--;
    }
  }
