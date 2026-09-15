import type { SimGrid } from "../grid";
import { CIRCUIT_ON_META } from "../metaBits";
import { MaterialCategory, MaterialId } from "../types";
import { NEIGHBORS_8 } from "../neighbors";
import { circuitPowered } from "./electricity";

/*
 * ── Portões: Geral, Povo/Fauna, Líquidos, Pó ─────────────────────────────
 *
 * Four paintable Sólido gates, one shared mechanism. Unpowered, a gate is
 * fully open — everything passes through it as if it weren't there at all.
 * Powered by a touching Alavanca or Fio, it "activates": it starts
 * physically blocking whichever categories its own variant targets (see
 * GATE_BLOCKS), and — regardless of variant — also blocks the wind itself
 * and every one of its visible motes, since a closed gate is still a solid
 * obstruction to a draft even if it's letting, say, water glide past it.
 * An unwired gate never activates on its own (unlike Bloco de Calor/Frio,
 * which runs standalone) — same "no standalone mode" rule as Torre de
 * defesa, since a gate that blocks nothing until told to is the entire
 * point of it existing.
 */

/** Cap on how many connected same-variant Portão cells one power-flood visits — a perf budget, well past any gate a player would actually paint. */
const GATE_FLOOD_CAP = 20000;

/** Every category a given Portão variant blocks while active — Portão Geral blocks three at once, the other three each block exactly one of those. */
const GATE_BLOCKS: Partial<Record<MaterialId, ReadonlySet<MaterialCategory>>> = {
  [MaterialId.GateGeneral]: new Set([MaterialCategory.Liquid, MaterialCategory.Powder, MaterialCategory.Creature]),
  [MaterialId.GateCreature]: new Set([MaterialCategory.Creature]),
  [MaterialId.GateLiquid]: new Set([MaterialCategory.Liquid]),
  [MaterialId.GatePowder]: new Set([MaterialCategory.Powder]),
};

/** Whether `id` is one of the four Portão variants. */
export function isGateMaterial(id: MaterialId): boolean {
  return id === MaterialId.GateGeneral || id === MaterialId.GateCreature
    || id === MaterialId.GateLiquid || id === MaterialId.GatePowder;
}

/**
 * A connected slab of the SAME Portão variant is one body, not a grid of
 * independent cells — activates the instant *any* cell of it is
 * individually fed (`circuitPowered`), exactly like a Porta used to.
 * Different variants never merge into one body even if painted touching
 * each other, since each keeps its own distinct behavior. Settled once per
 * connected slab per tick, memoized in `grid.gateCache`.
 */
function gateBodyActive(grid: SimGrid, x: number, y: number): boolean {
  const startI = grid.index(x, y);
  const cached = grid.gateCache.get(startI);
  if (cached !== undefined) return cached;
  const matId = grid.material[startI];
  const visited = new Set<number>([startI]);
  const stack = [startI];
  let found = false;
  let budget = GATE_FLOOD_CAP;
  while (stack.length > 0 && budget-- > 0) {
    const i = stack.pop()!;
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    if (circuitPowered(grid, cx, cy)) found = true;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (grid.material[j] !== matId || visited.has(j)) continue;
      visited.add(j);
      stack.push(j);
    }
  }
  for (const v of visited) grid.gateCache.set(v, found);
  return found;
}

/**
 * Recomputes whether the Portão at (x, y) is currently active (blocking)
 * and stamps CIRCUIT_ON_META to match — the one place that actually walks
 * the circuit each tick. Every other check in this file (and everywhere
 * else a gate's state matters — `isGhost`, wildlife movement, the wind
 * scan) just reads that bit back afterward instead of re-flooding.
 */
export function stepGate(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  const active = gateBodyActive(grid, x, y);
  if (((grid.meta[i] & CIRCUIT_ON_META) !== 0) !== active) grid.wake(x, y);
  grid.meta[i] = active ? CIRCUIT_ON_META : 0;
}

/** Whether the Portão at (x, y) is currently active (blocking its own categories, and the wind) — a plain bit read, since `stepGate` already settled it for this tick. */
export function gateActive(grid: SimGrid, x: number, y: number): boolean {
  return (grid.meta[grid.index(x, y)] & CIRCUIT_ON_META) !== 0;
}

/**
 * Whether the material at (x, y) is a Portão currently blocking `category`
 * — false for a non-gate cell, an unpowered gate, or a powered gate whose
 * own variant doesn't target that category at all (e.g. Portão Líquidos
 * never blocks Pó, active or not).
 */
export function gateBlocksCategory(grid: SimGrid, x: number, y: number, category: MaterialCategory): boolean {
  const id = grid.material[grid.index(x, y)] as MaterialId;
  const blocks = GATE_BLOCKS[id];
  if (!blocks || !blocks.has(category)) return false;
  return gateActive(grid, x, y);
}

/** Whether the material at (x, y) is a Portão currently blocking the wind — every variant blocks wind uniformly while active, regardless of which category it otherwise targets. */
export function gateBlocksWind(grid: SimGrid, x: number, y: number): boolean {
  const id = grid.material[grid.index(x, y)];
  return isGateMaterial(id) && gateActive(grid, x, y);
}

/** How many consecutive open Portão cells `gateSkipLanding` will look straight through in one step — a safety cap against an absurdly thick stack of gates, well past any wall of them a player would actually paint. */
const GATE_SKIP_CAP = 32;

/**
 * A Portão is never actually a swap/move target for anything passing
 * through it while open — it's a fixed structure, not something that
 * should go trading places with every grain of sand or ant that walks
 * past it. Given a mover already known to be heading from (fx, fy) toward
 * (tx, ty), this looks straight through any run of consecutive Portão
 * cells starting at (tx, ty) that aren't currently blocking `category`,
 * continuing in that same direction, and returns the real cell beyond
 * them — which the caller still needs to check the usual way (Empty?
 * blocked? something to sink through?), since it could itself be a
 * blocking gate, an ordinary wall, or open space. Returns null only if
 * the skip runs off the grid entirely or exceeds the safety cap; treat
 * that as "blocked", same as hitting an ordinary wall. Returns (tx, ty)
 * itself unchanged when it isn't a gate at all, so callers can use this
 * unconditionally without checking first.
 */
export function gateSkipLanding(
  grid: SimGrid, fx: number, fy: number, tx: number, ty: number, category: MaterialCategory,
): readonly [number, number] | null {
  let landX = tx, landY = ty;
  const ddx = tx - fx, ddy = ty - fy;
  let hops = 0;
  while (
    hops < GATE_SKIP_CAP
    && isGateMaterial(grid.material[grid.index(landX, landY)])
    && !gateBlocksCategory(grid, landX, landY, category)
  ) {
    landX += ddx;
    landY += ddy;
    hops++;
    if (!grid.inBounds(landX, landY)) return null;
  }
  return [landX, landY];
}
