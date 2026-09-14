import type { SimGrid } from "../grid";
import {
  SPROUT_BUDGET_MIN, SPROUT_BUDGET_MASK, SPROUT_REGROWTH_BONUS, FLASH_LIFE, HP_POINTS_MASK, HP_EMPOWERED,
} from "../grid";
import { MaterialId } from "../types";
import { NEIGHBORS_8 } from "../neighbors";
import { CREATURE_FED_MAX, packCreature } from "../creatureMeta";
import { randomEmptyNeighbor } from "./wildlife";

/*
 * ── Magia ────────────────────────────────────────────────────────────────
 * A mote of enchantment: floats up and wanders, and each tick reaches for
 * one random neighbor and tries to turn it toward life and order. Potent
 * but self-limiting — it carries a lifespan in `meta` (set by the brush)
 * and every transmutation it lands also costs it extra life, so a single
 * mote can only do so much before it winks out.
 */
/** Extra life a mote spends when a transmutation attempt actually succeeds. */
const MAGIC_CAST_COST = 6;
/** Per-tick chance a Magia mote, sitting right by the right surroundings, conjures a creature (a Formiga on soil, a Peixe in water) into an adjacent empty cell. Deliberately rare — it's a surprise, not a spawner. */
const MAGIC_CONJURE_CHANCE = 0.003;
/** Per-tick chance a fading mote leaves a Flor where it vanishes — only ever taken when it dies resting against something solid, so flowers sprout on surfaces instead of hanging in mid-air. */
const MAGIC_BLOOM_ON_DEATH = 0.35;

/**
 * Magia: a mote that drifts up and wanders, and each tick reaches for one
 * random neighbour and tries to turn it toward life and order (see
 * `transmute`). It carries a lifespan in `meta`; every successful
 * transmutation costs it extra life on top of the steady per-tick drain,
 * so one mote can only work so much magic before it winks out — leaving a
 * Flor behind now and then when it does.
 */
export function stepMagic(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  let life = grid.meta[i];

  if (life <= 1) {
    // Only leaves a bloom if it fizzles resting against something solid —
    // a flower left hanging in open air looks wrong.
    const onSurface = ([[0, 1], [-1, 0], [1, 0], [0, -1]] as const).some(([dx, dy]) => {
      const sx = x + dx;
      const sy = y + dy;
      if (!grid.inBounds(sx, sy)) return true;
      const sId = grid.get(sx, sy);
      return sId !== MaterialId.Empty && sId !== MaterialId.Magic;
    });
    if (onSurface && Math.random() < MAGIC_BLOOM_ON_DEATH) {
      grid.set(x, y, MaterialId.Flor, Math.floor(Math.random() * 4));
    } else {
      grid.set(x, y, MaterialId.Empty);
      grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
    }
    return;
  }

  const [ndx, ndy] = NEIGHBORS_8[Math.floor(Math.random() * NEIGHBORS_8.length)];
  const nx = x + ndx;
  const ny = y + ndy;
  if (grid.inBounds(nx, ny)) {
    if (transmute(grid, nx, ny)) life = Math.max(1, life - MAGIC_CAST_COST);
    else if (Math.random() < MAGIC_CONJURE_CHANCE) conjureCreature(grid, x, y);
  }

  life--;
  // Wanders in every direction with only a faint upward lean, so a mote
  // works the patch it was cast on instead of racing to the ceiling.
  const dirs = [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, 1]] as const;
  const [mx, my] = dirs[Math.floor(Math.random() * dirs.length)];
  const tx = x + mx;
  const ty = y + my;
  if (grid.inBounds(tx, ty) && grid.get(tx, ty) === MaterialId.Empty) {
    grid.swap(x, y, tx, ty);
    grid.meta[grid.index(tx, ty)] = life;
  } else {
    grid.meta[i] = life;
  }
}

/** One enchantment: nudges the cell at (x, y) toward life/order. Returns whether it actually changed anything (a miss costs the mote no extra life). */
export function transmute(grid: SimGrid, x: number, y: number): boolean {
  const i = grid.index(x, y);
  const id = grid.material[i] as MaterialId;
  switch (id) {
    case MaterialId.Fire:
      if (Math.random() < 0.6) grid.set(x, y, MaterialId.Empty);
      else grid.set(x, y, MaterialId.Flor, Math.floor(Math.random() * 4));
      return true;
    case MaterialId.Lava:
      grid.set(x, y, MaterialId.Stone);
      return true;
    case MaterialId.Acid:
    case MaterialId.AcidVapor:
    case MaterialId.Steam:
      grid.set(x, y, MaterialId.Water);
      return true;
    case MaterialId.Gunpowder:
    case MaterialId.C4:
      grid.set(x, y, MaterialId.Sand);
      return true;
    case MaterialId.Stone:
      if (Math.random() < 0.5) {
        grid.set(x, y, MaterialId.Dirt);
        return true;
      }
      return false;
    case MaterialId.Sand:
      if (Math.random() < 0.25) {
        grid.set(x, y, MaterialId.Seed);
        return true;
      }
      return false;
    case MaterialId.Dirt:
      grid.set(x, y, MaterialId.Plant);
      return true;
    case MaterialId.Mud:
      grid.set(x, y, MaterialId.Sprout, SPROUT_BUDGET_MIN);
      return true;
    case MaterialId.Warrior:
    case MaterialId.Skeleton: {
      // Magia doesn't unmake a fighter — it empowers it: twice the size,
      // twice the bite. Once only.
      if ((grid.hp[i] & HP_EMPOWERED) !== 0) return false;
      grid.hp[i] = HP_EMPOWERED | Math.min(HP_POINTS_MASK, (grid.hp[i] & HP_POINTS_MASK) * 2);
      grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      return true;
    }
    case MaterialId.Wood:
      if (Math.random() < 0.4) {
        grid.set(x, y, MaterialId.Plant);
        return true;
      }
      return false;
    case MaterialId.Ice:
      if (Math.random() < 0.5) {
        grid.set(x, y, MaterialId.Water);
        return true;
      }
      return false;
    case MaterialId.Plant:
      if (Math.random() < 0.5) {
        grid.set(x, y, MaterialId.Flor, Math.floor(Math.random() * 4));
        return true;
      }
      return false;
    case MaterialId.Sprout:
      if ((grid.meta[i] & SPROUT_BUDGET_MASK) === 0) {
        grid.meta[i] = SPROUT_REGROWTH_BONUS + 4;
        grid.wake(x, y);
        return true;
      }
      return false;
    case MaterialId.Water: {
      let wc = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ax = x + dx;
        const ay = y + dy;
        if (grid.inBounds(ax, ay) && grid.get(ax, ay) === MaterialId.Water) wc++;
      }
      if (wc >= 5 && Math.random() < 0.05) {
        grid.material[i] = MaterialId.Fish;
        grid.meta[i] = packCreature(1, 0, CREATURE_FED_MAX);
        grid.wake(x, y);
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/** Rarely, a mote conjures a creature that fits its surroundings — a Formiga onto firm ground by greenery, or a Peixe into a body of water. Never into open air. */
export function conjureCreature(grid: SimGrid, x: number, y: number): void {
  const spot = randomEmptyNeighbor(grid, x, y);
  if (!spot) return;
  const [sx, sy] = spot;
  let nearSoil = false;
  let water = 0;
  for (const [dx, dy] of NEIGHBORS_8) {
    const ax = sx + dx;
    const ay = sy + dy;
    if (!grid.inBounds(ax, ay)) continue;
    const aId = grid.get(ax, ay);
    if (
      aId === MaterialId.Dirt || aId === MaterialId.Mud ||
      aId === MaterialId.Plant || aId === MaterialId.Sprout || aId === MaterialId.Flor
    ) {
      nearSoil = true;
    } else if (aId === MaterialId.Water) {
      water++;
    }
  }
  const solidBelow = grid.inBounds(sx, sy + 1) && grid.get(sx, sy + 1) !== MaterialId.Empty;
  if (water >= 4) {
    grid.set(sx, sy, MaterialId.Fish, grid.metaFor(MaterialId.Fish));
  } else if (nearSoil && solidBelow) {
    grid.set(sx, sy, MaterialId.Ant, grid.metaFor(MaterialId.Ant));
  }
}
