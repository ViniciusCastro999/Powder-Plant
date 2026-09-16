import type { SimGrid } from "../grid";
import {
  SPROUT_BUDGET_MIN, SPROUT_BUDGET_MASK, SPROUT_REGROWTH_BONUS, FLASH_LIFE, HP_POINTS_MASK, HP_EMPOWERED,
  PULSE_AIR_LIFE,
} from "../grid";
import { WHEAT_RIPE } from "../metaBits";
import { MaterialId } from "../types";
import { NEIGHBORS_8 } from "../neighbors";
import { CREATURE_FED_MAX, creatureFacing, creatureTimer, creatureFed, packCreature } from "../creatureMeta";

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
  if (grid.inBounds(nx, ny) && transmute(grid, nx, ny)) {
    life = Math.max(1, life - MAGIC_CAST_COST);
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

/** Tops a creature's hunger back up to full, preserving its facing/timer bits — a small blessing, not a birth: nothing new appears, an existing Formiga/Pássaro/Peixe/Pip just stops being hungry. No-ops (costing the mote nothing) once it's already fed. */
function blessCreature(grid: SimGrid, x: number, y: number, i: number): boolean {
  if (creatureFed(grid.meta[i]) >= CREATURE_FED_MAX) return false;
  grid.meta[i] = packCreature(creatureFacing(grid.meta[i]), creatureTimer(grid.meta[i]), CREATURE_FED_MAX);
  grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
  return true;
}

/** Drops a fresh free charge right on top of a conductor — the same shape `paintCell` gives the Electricity brush — so a spark catches and races off along whatever network it landed on. */
function spark(grid: SimGrid, x: number, y: number): void {
  grid.pulses.push({ x, y, dx: 0, dy: 1, steps: 0, inConductor: false, life: PULSE_AIR_LIFE });
  grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
}

/**
 * One enchantment: nudges the cell at (x, y) toward life/order — or just
 * toward mischief, for the fixtures that don't really have a "more alive"
 * direction to go in. Returns whether it actually changed anything (a miss
 * costs the mote no extra life).
 */
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
    case MaterialId.CombustibleGas:
      if (Math.random() < 0.5) {
        grid.set(x, y, MaterialId.Empty);
        grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
        return true;
      }
      return false;
    case MaterialId.Stone:
      if (Math.random() < 0.5) {
        grid.set(x, y, MaterialId.Dirt);
        return true;
      }
      return false;
    case MaterialId.Brick:
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
    case MaterialId.Salt:
      if (Math.random() < 0.3) {
        grid.set(x, y, MaterialId.Sand);
        return true;
      }
      return false;
    case MaterialId.Dirt:
      grid.set(x, y, MaterialId.Plant);
      return true;
    case MaterialId.Mud:
      grid.set(x, y, MaterialId.Sprout, SPROUT_BUDGET_MIN);
      return true;
    case MaterialId.Oil:
      if (Math.random() < 0.4) {
        grid.set(x, y, MaterialId.Water);
        return true;
      }
      return false;
    case MaterialId.Warrior:
    case MaterialId.Skeleton: {
      // Magia doesn't unmake a fighter — it empowers it: twice the size,
      // twice the bite. Once only.
      if ((grid.hp[i] & HP_EMPOWERED) !== 0) return false;
      grid.hp[i] = HP_EMPOWERED | Math.min(HP_POINTS_MASK, (grid.hp[i] & HP_POINTS_MASK) * 2);
      grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      return true;
    }
    case MaterialId.Ant:
    case MaterialId.Bird:
    case MaterialId.Fish:
    case MaterialId.Mason:
    case MaterialId.Lumberjack:
    case MaterialId.Farmer:
      // A blessing, not a birth — tops up an existing creature's hunger.
      // Magia doesn't conjure new animals or folk (see stepMagic above).
      return blessCreature(grid, x, y, i);
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
    case MaterialId.Glass:
      grid.shatterGlass(x, y);
      return true;
    case MaterialId.Metal:
      if (Math.random() < 0.4) {
        spark(grid, x, y);
        return true;
      }
      return false;
    case MaterialId.Wire:
      if (Math.random() < 0.5) {
        spark(grid, x, y);
        return true;
      }
      return false;
    case MaterialId.Lever:
      return grid.toggleLever(x, y);
    case MaterialId.Fan:
      return grid.toggleFan(x, y);
    case MaterialId.HeatBlock:
      grid.set(x, y, MaterialId.ColdBlock, grid.meta[i]);
      grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      return true;
    case MaterialId.ColdBlock:
      grid.set(x, y, MaterialId.HeatBlock, grid.meta[i]);
      grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      return true;
    case MaterialId.Vida:
      if (Math.random() < 0.3) {
        grid.set(x, y, MaterialId.Flor, Math.floor(Math.random() * 4));
        return true;
      }
      return false;
    case MaterialId.Wheat:
      if (grid.meta[i] >= WHEAT_RIPE) return false;
      grid.meta[i] = WHEAT_RIPE;
      grid.wake(x, y);
      return true;
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
      // A pocket deep enough in its own kind occasionally crystallizes into
      // a floating chunk of Gelo — order taking hold, no fish involved.
      let wc = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ax = x + dx;
        const ay = y + dy;
        if (grid.inBounds(ax, ay) && grid.get(ax, ay) === MaterialId.Water) wc++;
      }
      if (wc >= 5 && Math.random() < 0.2) {
        grid.set(x, y, MaterialId.Ice);
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}
