import type { SimGrid } from "../grid";
import { AMBIENT_ICE_MELT_TEMP } from "../grid";
import { HEAT_FUSE_GLASS } from "./fire";
import { COLD_1, COLD_2, COLD_3 } from "../temperature";
import { MaterialId } from "../types";
import { MATERIALS } from "../materials";
import { NEIGHBORS_4, NEIGHBORS_8 } from "../neighbors";

/*
 * ── Reações diversas: Sal, Metal, Gelo, geada, Lava, Ácido ─────────────────
 * A handful of unrelated-but-simple per-cell material reactions that don't
 * warrant their own subsystem each.
 */

/** Plain Metal touching Water has this per-tick chance to rust away into one Dirt particle. */
const RUST_CHANCE = 0.0012;
/** Fully salty Water rusts touching Metal this many times faster than fresh Water. */
const RUST_SALT_MULTIPLIER = 6;
/** Per-tick chance a Gelo cell touching Fogo/Lava melts back into Água. */
const ICE_MELT_CHANCE = 0.18;
/** Per-tick chance a Gelo cell freezes a touching fresh-water neighbor into more Gelo. */
const ICE_FREEZE_CHANCE = 0.02;
/** Ambient temperature above which Gelo starts melting on its own, and the per-degree climb toward AMBIENT_ICE_MELT_CAP past that threshold. */
const AMBIENT_ICE_MELT_PER_DEGREE = 0.0022;
const AMBIENT_ICE_MELT_CAP = 0.08;
/** Below COLD_1, a Planta/Broto/Flor cell has a chance each tick to frost over one touching Empty cell into Gelo — a rime layer creeping in around it — one tier per cold milestone. */
const PLANT_FROST_1 = 0.004;
const PLANT_FROST_2 = 0.014;
const PLANT_FROST_3 = 0.035;
/** Per-tick chance a Metal cell touching Lava melts into Lava — fastest of the three. */
const LAVA_MELT_METAL = 0.02;
/** Per-tick chance a Sand cell touching Lava melts into Lava — middle speed. */
const LAVA_MELT_SAND = 0.008;
/** Per-tick chance a Stone cell touching Lava melts into Lava — slowest. */
const LAVA_MELT_STONE = 0.0025;

/** One grain of Salt fully saturates exactly one touching (not-yet-salty) Water cell, 1:1, then is spent — or thaws a Gelo cell it lands on into brine. */
export function stepSalt(grid: SimGrid, x: number, y: number, i: number): void {
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const wi = grid.index(nx, ny);
      if (grid.material[wi] === MaterialId.Water && grid.meta[wi] < 255) {
        grid.meta[wi] = 255;
        grid.material[i] = MaterialId.Empty;
        grid.meta[i] = 0;
        grid.wake(x, y);
        return;
      }
      // Salt thaws Gelo it lands on — the ice melts to brine and the grain
      // dissolves into it. (A real winter trick: salt the ice and it goes.)
      if (grid.material[wi] === MaterialId.Ice && Math.random() < 0.5) {
        grid.set(nx, ny, MaterialId.Water, 255);
        grid.material[i] = MaterialId.Empty;
        grid.meta[i] = 0;
        grid.wake(x, y);
        return;
      }
    }
  }

  /**
   * Metal touching Water rusts: a slow, per-tick chance for the Metal cell
   * itself to degrade straight into a Dirt particle (which then falls like
   * any other Powder). The Water is never consumed — rusting just keeps
   * happening for as long as it stays in contact — and only happens while
   * that contact lasts, so a dried-out patch of metal stops corroding.
   * Salty Water rusts it several times faster than fresh Water.
   */
export function stepMetal(grid: SimGrid, x: number, y: number): void {
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (grid.get(nx, ny) !== MaterialId.Water) continue;
      const salinity = grid.meta[grid.index(nx, ny)] / 255;
      const chance = RUST_CHANCE * (1 + salinity * (RUST_SALT_MULTIPLIER - 1));
      if (Math.random() < chance) {
        grid.set(x, y, MaterialId.Dirt);
      }
      return;
    }
  }

  /**
   * Gelo melts back into Água when touching Fogo or Lava — checked first,
   * since heat always wins over freezing. Otherwise it slowly spreads:
   * touching fresh Água (salinity 0) has a per-tick chance to freeze that
   * neighbor into more Gelo. Salty Água never freezes.
   */
export function stepIce(grid: SimGrid, x: number, y: number): void {
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.get(nx, ny);
      if ((nId === MaterialId.Fire || nId === MaterialId.Lava) && Math.random() < ICE_MELT_CHANCE) {
        grid.set(x, y, MaterialId.Water);
        return;
      }
    }
    // Ambient heat melts it too, with no Fogo/Lava required — starts the
    // moment the room is above AMBIENT_ICE_MELT_TEMP and climbs smoothly
    // from there, instead of jumping between fixed tiers.
    if (grid.temp > AMBIENT_ICE_MELT_TEMP) {
      const excess = grid.temp - AMBIENT_ICE_MELT_TEMP;
      const chance = Math.min(AMBIENT_ICE_MELT_CAP, excess * AMBIENT_ICE_MELT_PER_DEGREE);
      if (Math.random() < chance) {
        grid.set(x, y, MaterialId.Water);
        return;
      }
    }
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const ni = grid.index(nx, ny);
      if (grid.material[ni] === MaterialId.Water && grid.meta[ni] === 0 && Math.random() < ICE_FREEZE_CHANCE) {
        grid.set(nx, ny, MaterialId.Ice);
      }
    }
  }

  /** Below COLD_1, plant matter starts frosting over: one touching Empty cell has a chance each tick to become Gelo, a rime layer creeping in from the cold. */
export function frostOver(grid: SimGrid, x: number, y: number): void {
    const chance =
      grid.temp <= COLD_3 ? PLANT_FROST_3 :
      grid.temp <= COLD_2 ? PLANT_FROST_2 :
      PLANT_FROST_1;
    if (Math.random() >= chance) return;
    const emptyNeighbors: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Empty) emptyNeighbors.push([nx, ny]);
    }
    if (emptyNeighbors.length === 0) return;
    const [fx, fy] = emptyNeighbors[Math.floor(Math.random() * emptyNeighbors.length)];
    grid.set(fx, fy, MaterialId.Ice);
  }

  /**
   * Lava: touching Water cools it down instantly into Pedra (and boils the
   * water away) instead of melting anything that tick — real lava does the
   * same thing, quenching into rock the moment it hits water. Otherwise
   * it's hot enough to ignite anything flammable around it exactly like
   * Fogo does (Pólvora included, which detonates instead of just burning),
   * and it melts Pedra, Metal and Areia on contact into more Lava — each
   * at its own per-tick chance, so Metal liquefies fastest, Areia in the
   * middle, and Pedra (the most heat-resistant of the three) slowest.
   */
export function stepLava(grid: SimGrid, x: number, y: number): void {
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (grid.get(nx, ny) === MaterialId.Water) {
        grid.set(x, y, MaterialId.Stone);
        grid.set(nx, ny, MaterialId.Empty);
        return;
      }
    }

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nDef = MATERIALS[grid.get(nx, ny)];
      if (nDef.flammable && Math.random() < nDef.ignitionChance) grid.igniteAt(nx, ny);
    }

    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.get(nx, ny);
      // Sand by the lava mostly fuses to Glass; only sometimes does it melt on
      // through into more Lava.
      if (nId === MaterialId.Sand && Math.random() < HEAT_FUSE_GLASS) { grid.set(nx, ny, MaterialId.Glass); continue; }
      const chance =
        nId === MaterialId.Metal ? LAVA_MELT_METAL :
        nId === MaterialId.Sand ? LAVA_MELT_SAND :
        nId === MaterialId.Stone ? LAVA_MELT_STONE :
        0;
      if (chance > 0 && Math.random() < chance) grid.set(nx, ny, MaterialId.Lava);
    }
  }

export function stepAcid(grid: SimGrid, x: number, y: number, i: number): void {
    const targets: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.get(nx, ny);
      if (MATERIALS[nId].acidResistance > 0) targets.push([nx, ny]);
    }
    if (targets.length === 0) return;

    const [tx, ty] = targets[Math.floor(Math.random() * targets.length)];
    const resistance = MATERIALS[grid.get(tx, ty)].acidResistance;
    if (Math.random() < 1 / resistance) {
      grid.set(tx, ty, MaterialId.Empty);
    }
    grid.meta[i]--;
    if (grid.meta[i] <= 0) {
      grid.material[i] = MaterialId.Empty;
      grid.meta[i] = 0;
      grid.wake(x, y);
    }
  }
