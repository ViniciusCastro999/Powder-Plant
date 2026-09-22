import type { SimGrid } from "../grid";
import { MaterialId } from "../types";

/*
 * ── Pips infectados ──────────────────────────────────────────────────────
 * Any of the four trades (Pedreiro, Fazendeiro, Lenhador, Guerreiro) that
 * spends long enough standing on Fungus/Cogumelo gets taken over by it for
 * good — a permanent, one-way transformation, not the passing "poeira de
 * esporo" tint every pip already gets just from standing there a moment
 * (see PixiStage's FOLK_FIGURE tinting, which now also stays on forever
 * once a pip is actually infected).
 *
 * Exposure is tracked in `flowDir`, a field every creature already carries
 * through `swap()` (see grid.ts) when it moves, but that no Folk code
 * otherwise reads or writes — Gás/Líquido are `flowDir`'s only other
 * users, and neither is ever a creature cell, so reusing it here for a
 * persistent per-pip counter is safe. `flowDir` is a signed 8-bit field
 * (-128..127), so PIP_INFECTION_MARK has to stay comfortably inside that
 * positive range.
 *
 * Exposure climbs while standing on the mycelium and decays slowly while
 * off it, so a pip that just happens to cross a patch once never tips
 * over — only genuinely sustained contact (working a field grown through
 * with Fungus, camped by a big Cogumelo) does. Once exposure reaches
 * PIP_INFECTION_MARK it's permanent: `tickPipInfection` simply stops
 * touching the counter once it gets there, so it can never decay back out.
 *
 * An infected pip works at a completely different pace: every trade's own
 * step function bypasses the ordinary `folkActNow` unhurried cadence for
 * it (see each trade's own call site) and finishes harvest-gated work
 * (felling, harvesting) near-instantly (INFECTED_HARVEST_WORK in place of
 * the ordinary HARVEST_WORK). An infected Guerreiro additionally turns on
 * everyone — see systems/combat.ts.
 */
/** Ticks of cumulative exposure to Fungus/Cogumelo before infection locks in for good. */
export const PIP_INFECTION_MARK = 100;
/** How many ticks of harvest-style work (see harvestReady) an infected pip needs — a sliver of the ordinary HARVEST_WORK, since the whole point is that it does everything "muito rápido". */
export const INFECTED_HARVEST_WORK = 1;

/** Whether the pip at cell `i` has crossed permanently into infection. */
export function isPipInfected(grid: SimGrid, i: number): boolean {
  return grid.flowDir[i] >= PIP_INFECTION_MARK;
}

/** Whether any of the 8 cells around (x, y) is Fungus or Cogumelo. */
function touchingMycelium(grid: SimGrid, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const m = grid.get(nx, ny);
      if (m === MaterialId.Fungus || m === MaterialId.Mushroom) return true;
    }
  }
  return false;
}

/**
 * Climbs exposure while touching Fungus/Cogumelo (standing on it, or right
 * up against it on any side — a Lenhador felling a Cogumelo cluster is
 * almost always braced against it sideways, not standing on top of it,
 * since Cogumelo is walk-through terrain now), decays it slowly otherwise,
 * and locks in for good once it reaches PIP_INFECTION_MARK. Call once per
 * tick from every infectable trade's own step function, before deciding
 * anything else.
 */
export function tickPipInfection(grid: SimGrid, x: number, y: number, i: number): void {
  if (grid.flowDir[i] >= PIP_INFECTION_MARK) return; // already permanent — nothing left to track
  if (touchingMycelium(grid, x, y)) grid.flowDir[i]++;
  else if (grid.flowDir[i] > 0) grid.flowDir[i]--;
}
