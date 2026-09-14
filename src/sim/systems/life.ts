import type { SimGrid } from "../grid";
import { MaterialId } from "../types";
import { NEIGHBORS_8 } from "../neighbors";

/**
 * Per-tick chance a Vida cell eats a given touching material, converting
 * it into a new Vida cell — tougher/less nutritious things get eaten
 * slower. Anything not listed here isn't food at all.
 */
const LIFE_EAT_CHANCE: Partial<Record<MaterialId, number>> = {
  [MaterialId.Seed]: 0.05,
  [MaterialId.Flor]: 0.04,
  [MaterialId.Plant]: 0.025,
  [MaterialId.Sprout]: 0.025,
  [MaterialId.Wood]: 0.006,
};

/**
 * Vida runs its own generation-by-generation automaton instead of the
 * usual per-cell movement rules, so it gets one dedicated pass per tick
 * rather than a case in the main switch. Two things happen, both based
 * on a single snapshot of who's alive *before* this tick's changes (a
 * proper synchronous update, like real Conway — mutating cells as we go
 * would make later cells in the scan see already-updated neighbors and
 * skew the count):
 *
 *  1. Eating: every living cell may convert one touching edible neighbor
 *     (Planta, Flor, Broto, Semente, Madeira — see LIFE_EAT_CHANCE) into
 *     a new Vida cell, at that material's own chance — so tougher food
 *     spreads into slower.
 *  2. Conway's own B3/S23 rule: a live cell with 2-3 live neighbors
 *     survives, otherwise dies; a dead (Empty) cell with exactly 3 live
 *     neighbors is born. Only Empty cells can be born into — Vida can't
 *     spontaneously replace some other material.
 */
export function stepLifeGeneration(grid: SimGrid): void {
  const alive: number[] = [];
  for (let i = 0; i < grid.material.length; i++) {
    if (grid.material[i] === MaterialId.Vida) alive.push(i);
  }
  if (alive.length === 0) return;
  const aliveSet = new Set(alive);

  const eaten = new Set<number>();
  for (const i of alive) {
    const x = i % grid.width;
    const y = (i / grid.width) | 0;
    const targets: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (LIFE_EAT_CHANCE[grid.get(nx, ny)] !== undefined) targets.push([nx, ny]);
    }
    if (targets.length === 0) continue;
    const [tx, ty] = targets[Math.floor(Math.random() * targets.length)];
    const chance = LIFE_EAT_CHANCE[grid.get(tx, ty)]!;
    if (Math.random() < chance) eaten.add(grid.index(tx, ty));
  }

  const candidates = new Set<number>();
  for (const i of alive) {
    candidates.add(i);
    const x = i % grid.width;
    const y = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid.inBounds(nx, ny)) candidates.add(grid.index(nx, ny));
    }
  }

  const deaths: number[] = [];
  const born: number[] = [];
  for (const i of candidates) {
    const x = i % grid.width;
    const y = (i / grid.width) | 0;
    let count = 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid.inBounds(nx, ny) && aliveSet.has(grid.index(nx, ny))) count++;
    }
    if (aliveSet.has(i)) {
      if (count < 2 || count > 3) deaths.push(i);
    } else if (count === 3 && grid.material[i] === MaterialId.Empty) {
      born.push(i);
    }
  }

  for (const i of deaths) grid.set(i % grid.width, (i / grid.width) | 0, MaterialId.Empty);
  for (const i of eaten) grid.set(i % grid.width, (i / grid.width) | 0, MaterialId.Vida);
  for (const i of born) grid.set(i % grid.width, (i / grid.width) | 0, MaterialId.Vida);
}
