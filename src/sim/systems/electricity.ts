import type { SimGrid } from "../grid";
import { PULSE_AIR_LIFE } from "../grid";
import { MaterialId } from "../types";
import { MATERIALS } from "../materials";
import { NEIGHBORS_4, NEIGHBORS_8 } from "../neighbors";
import {
  CIRCUIT_ON_META, CIRCUIT_LINKED_META, CLONE_LOCK_MASK, CLONE_LINKED_META, CLONE_ON_META,
} from "../metaBits";

/** Cap on how many connected Fio cells one circuitPowered trace visits — a perf budget for a pathological loop of wire, not a limit anyone wiring up a door will ever bump into. */
const CIRCUIT_FLOOD_CAP = 4000;
/** Per-tick chance a Clone that's already locked onto a material spawns one more unit of it into a touching empty cell. */
const CLONE_CHANCE = 0.1;
/** Per-tick chance an unlocked Clone touching an already-locked Clone inherits its lock — much slower than a direct touch, so a lock creeps through a connected blob of Clone instead of the whole thing snapping to the same material at once. */
const CLONE_PROPAGATE_CHANCE = 0.04;
/** Safety net only, not a visible countdown — see the Pulse comment in grid.ts. */
const PULSE_MAX_STEPS = 4000;
/** Extra ticks of life a charge regains (capped at PULSE_AIR_LIFE) on a tick another charge is touching it. Deliberately <= the 1/tick decay, so touching can only pause dissipation, never grow it — a dense cluster's total life can't climb back up, only hold steady at best, so it still visibly thins out instead of reading as "more electricity" than a lone spark. */
const PULSE_TOUCH_BONUS = 1;
/** Per-tick chance a free-falling charge that's touching another one annihilates instead — a crowded burst thins itself out fast, rather than the touch bonus alone just slowing how quickly it fades. */
const PULSE_ANNIHILATE_CHANCE = 0.18;
/** Per-tick chance a free-falling charge nudges sideways instead of falling straight down. */
const PULSE_DRIFT_CHANCE = 0.22;
/** Per-tick chance a free-falling charge covers 2 rows instead of 1. */
const PULSE_LEAP_CHANCE = 0.15;
/** Baseline chance plain (unsalted) Água carries a charge through it in one tick — salinity scales this up toward a near-certain 1 as the water gets saltier. */
const WATER_BASE_CONDUCT_CHANCE = 0.55;

/**
 * Vida runs its own generation-by-generation automaton — see systems/life.ts.
 * Clone's own cloning behavior: touches a neighbor, locks onto its
 * material (or Eletricidade, sensed via a passing charge), then spawns
 * more of it once wired into an active circuit (or unconditionally, if
 * never wired up at all).
 */
export function stepClone(grid: SimGrid, x: number, y: number, i: number): void {
  if ((grid.meta[i] & CLONE_LOCK_MASK) === MaterialId.Empty) {
    const candidates: MaterialId[] = [];
    const lockedCloneNeighbors: MaterialId[] = [];
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const ni = grid.index(nx, ny);
      const nId = grid.material[ni] as MaterialId;
      if (nId === MaterialId.Clone) {
        const nLock = grid.meta[ni] & CLONE_LOCK_MASK;
        if (nLock !== MaterialId.Empty) lockedCloneNeighbors.push(nLock as MaterialId);
      } else if (nId !== MaterialId.Empty && nId !== MaterialId.Wire && nId !== MaterialId.Lever) {
        // Fio/Alavanca wire a Clone into a circuit — they're control
        // cells, not something to clone, so they never count as a
        // touch (a Clone hooked up to a switch would otherwise have a
        // chance to lock onto "Fio" itself instead of the material it's
        // actually sitting next to).
        candidates.push(nId);
      }
    }
    // Eletricidade has no physical form, so it's never written into
    // `material` (see the Pulse comment) — a Clone can only "touch" it by
    // checking whether a live charge currently happens to be passing
    // through one of its 4 neighbor cells this tick.
    if (grid.pulses.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) === 1)) {
      candidates.push(MaterialId.Electricity);
    }
    if (candidates.length > 0) {
      grid.meta[i] = (grid.meta[i] & ~CLONE_LOCK_MASK) | candidates[Math.floor(Math.random() * candidates.length)];
      return;
    }
    if (lockedCloneNeighbors.length > 0 && Math.random() < CLONE_PROPAGATE_CHANCE) {
      grid.meta[i] = (grid.meta[i] & ~CLONE_LOCK_MASK) | lockedCloneNeighbors[Math.floor(Math.random() * lockedCloneNeighbors.length)];
    }
    return;
  }

  // Wired to a Fio/Alavanca, it only spawns while that circuit is on;
  // left alone (touching neither), it just runs as always. A connected
  // clump of Clone is one body for this, exactly like a Porta slab (see
  // bodyCircuitState) — linked and switched together even for the cells
  // that aren't themselves touching the wire, not each cell independently
  // deciding for itself. Either way, CLONE_LINKED_META / CLONE_ON_META
  // (above the locked-material bits — see the mask) get set to match so
  // the renderer can show the same verdict (see PixiStage) instead of it
  // just silently stopping with no visible tell.
  const { linked, active } = bodyCircuitState(grid, x, y, MaterialId.Clone, grid.cloneCache);
  const next = (grid.meta[i] & CLONE_LOCK_MASK) | (linked ? CLONE_LINKED_META : 0) | (active ? CLONE_ON_META : 0);
  if (grid.meta[i] !== next) { grid.meta[i] = next; grid.wake(x, y); }
  if (!active) return;
  if (Math.random() >= CLONE_CHANCE) return;
  const emptyNeighbors: [number, number][] = [];
  for (const [dx, dy] of NEIGHBORS_4) {
    const nx = x + dx;
    const ny = y + dy;
    if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Empty) emptyNeighbors.push([nx, ny]);
  }
  if (emptyNeighbors.length === 0) return;
  const [gx, gy] = emptyNeighbors[Math.floor(Math.random() * emptyNeighbors.length)];
  const clonedId = (grid.meta[i] & CLONE_LOCK_MASK) as MaterialId;
  if (clonedId === MaterialId.Electricity) {
    // Same as the Eletricidade brush (see paintCell): drops a fresh
    // free-falling charge rather than writing into `material`.
    grid.pulses.push({ x: gx, y: gy, dx: 0, dy: 1, steps: 0, inConductor: false, life: PULSE_AIR_LIFE });
  } else {
    grid.set(gx, gy, clonedId, grid.metaFor(clonedId));
  }
}

/**
 * Advances every charge one step. A charge inside a conductor prefers
 * continuing straight so it "goes in a line", but follows a bend if the
 * wire turns, and never immediately doubles back the way it came.
 * Reaching the end of the conductor "sai no final": Gunpowder/Óleo there
 * ignite, Empty space lets it resume falling, anything else inert just
 * absorbs the charge. `PULSE_MAX_STEPS` only guards against a charge
 * stuck looping forever inside a closed metal ring, not normal travel.
 *
 * A free-falling charge is different: it dissipates like a fire running
 * out of fuel (`life`, ticking down every tick). Touching another charge
 * only pauses that decay (PULSE_TOUCH_BONUS can't outpace the per-tick
 * loss) instead of restoring it, so a dense cluster can hold on a little
 * longer than a lone spark but never grows or sustains itself — the whole
 * burst still visibly thins out and fizzles within a handful of ticks. It
 * also nudges sideways at random, and occasionally covers 2 rows in one
 * tick, so a burst of charges spreads into a small, quick-fading cone
 * instead of a rigid beam, with only a few stragglers ever reaching the
 * ground.
 */
export function advancePulses(grid: SimGrid): void {
  if (grid.pulses.length === 0) return;
  const posKey = (x: number, y: number) => x * grid.height + y;
  const positions = new Set(grid.pulses.map((p) => posKey(p.x, p.y)));
  const next: typeof grid.pulses = [];
  for (const p of grid.pulses) {
    p.steps++;
    if (p.steps > PULSE_MAX_STEPS) continue;

    // A Para-raio already moved this charge toward itself earlier this same
    // tick (see stepLightningRod) — let that stand as the tick's one move
    // instead of also running the normal free-fall step on top of it,
    // which used to fight the pull (gravity yanking it back down right
    // after the rod pulled it sideways or up) and made the approach look
    // like a jittery bounce instead of one smooth, deliberate curve.
    if (p.rodPulled) {
      p.rodPulled = false;
      next.push(p);
      continue;
    }

    if (p.inConductor) {
      let advanced = false;
      for (const [ddx, ddy] of pulseDirCandidates(p.dx, p.dy)) {
        const nx = p.x + ddx;
        const ny = p.y + ddy;
        if (!grid.inBounds(nx, ny) || !conducts(grid, nx, ny)) continue;
        next.push({ x: nx, y: ny, dx: ddx, dy: ddy, steps: p.steps, inConductor: true, life: p.life });
        advanced = true;
        break;
      }
      if (advanced) continue;

      const ex = p.x + p.dx;
      const ey = p.y + p.dy;
      if (!grid.inBounds(ex, ey)) continue;
      const exitId = grid.get(ex, ey);
      const exitDef = MATERIALS[exitId];
      if (exitDef.flammable) grid.igniteAt(ex, ey);
      else if (exitId === MaterialId.Glass) grid.shatterGlass(ex, ey);
      else if (exitId === MaterialId.Empty) {
        next.push({ x: ex, y: ey, dx: 0, dy: 1, steps: p.steps, inConductor: false, life: PULSE_AIR_LIFE });
      }
      // Anything else inert simply absorbs the charge here.
      continue;
    }

    // Free-falling: always loses 1 tick of life, but gains a smaller
    // bonus back if another charge is touching it right now — a lone
    // spark still fizzles out almost instantly, and even a dense burst
    // only staves off dissipation, it doesn't live forever, since drift
    // keeps breaking contacts apart tick by tick.
    let touching = false;
    for (const [dx, dy] of NEIGHBORS_8) {
      if (positions.has(posKey(p.x + dx, p.y + dy))) {
        touching = true;
        break;
      }
    }
    // A crowded cluster doesn't just fade slower than a lone spark, it
    // actively cancels itself out — a charge touching another one has a
    // real chance of annihilating outright, so a big painted burst thins
    // down toward a handful of survivors within a tick or two instead of
    // the touch bonus merely stretching out how long the whole dense mass
    // hangs around.
    if (touching && Math.random() < PULSE_ANNIHILATE_CHANCE) continue;
    const life = Math.min(PULSE_AIR_LIFE, p.life - 1 + (touching ? PULSE_TOUCH_BONUS : 0));
    if (life <= 0) continue;

    // Pulled into any touching conductor, ignites any touching flammable.
    let reacted = false;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.get(nx, ny);
      const def = MATERIALS[nId];
      if (def.conductive && conducts(grid, nx, ny)) {
        next.push({ x: nx, y: ny, dx, dy, steps: p.steps, inConductor: true, life });
        reacted = true;
        break;
      }
      if (def.flammable) {
        grid.igniteAt(nx, ny);
        reacted = true;
        break;
      }
      if (nId === MaterialId.Glass) {
        grid.shatterGlass(nx, ny);
        reacted = true;
        break;
      }
    }
    if (reacted) continue;

    // Otherwise keeps falling, with an occasional random sideways nudge
    // (falling back to straight down if that column is blocked), and a
    // chance to cover 2 rows in one tick instead of 1 — both faster and
    // reaching further from where it started before it dissipates.
    const rows = Math.random() < PULSE_LEAP_CHANCE ? 2 : 1;
    const ty = p.y + rows;
    let tx = p.x;
    if (Math.random() < PULSE_DRIFT_CHANCE) {
      const driftX = p.x + (Math.random() < 0.5 ? -1 : 1) * rows;
      if (grid.inBounds(driftX, ty) && grid.get(driftX, ty) === MaterialId.Empty) tx = driftX;
    }
    if (grid.inBounds(tx, ty) && grid.get(tx, ty) === MaterialId.Empty) {
      next.push({ x: tx, y: ty, dx: tx - p.x, dy: rows, steps: p.steps, inConductor: false, life });
    } else if (rows === 2 && grid.inBounds(p.x, p.y + 1) && grid.get(p.x, p.y + 1) === MaterialId.Empty) {
      // The 2-row leap landed somewhere blocked — fall back to a normal single-row step instead of just stopping.
      next.push({ x: p.x, y: p.y + 1, dx: 0, dy: 1, steps: p.steps, inConductor: false, life });
    }
    // Blocked by something inert (or the floor) with nothing nearby to
    // react to — the charge has nowhere left to go and simply ends.
  }
  grid.pulses = next;
}

/**
 * Whether a charge can pass through this cell right now. Metal (and any
 * other always-conductive material) simply can; Water is a conductor but
 * not a reliable one — plain Water only carries the charge some of the
 * time, while salty Water carries it almost every time, so a saltier
 * puddle reads as visibly "better wired" than a fresh one.
 */
export function conducts(grid: SimGrid, x: number, y: number): boolean {
  const id = grid.get(x, y);
  const def = MATERIALS[id];
  if (!def.conductive) return false;
  if (id === MaterialId.Water) {
    const salinity = grid.meta[grid.index(x, y)] / 255;
    const chance = WATER_BASE_CONDUCT_CHANCE + (1 - WATER_BASE_CONDUCT_CHANCE) * salinity;
    return Math.random() < chance;
  }
  return true;
}

/** Straight ahead first, then every other direction except doubling straight back. */
export function pulseDirCandidates(dx: number, dy: number): readonly (readonly [number, number])[] {
  const rest = NEIGHBORS_8.filter(([ddx, ddy]) => !(ddx === dx && ddy === dy) && !(ddx === -dx && ddy === -dy));
  return [[dx, dy], ...rest];
}

/**
 * Whether (x, y) touches a Fio or Alavanca directly — i.e. whether it's
 * wired into a circuit at all, as opposed to standing alone. Clone/Bloco
 * de Calor/Bloco de Frio check this first: touching nothing conductive,
 * they just run as always (their original, circuit-free behavior);
 * touching a Fio or Alavanca opts them into `circuitPowered` instead, on
 * only while that circuit actually is.
 */
export function circuitConnected(grid: SimGrid, x: number, y: number): boolean {
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx, ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const m = grid.material[grid.index(nx, ny)];
    if (m === MaterialId.Wire || m === MaterialId.Lever) return true;
  }
  return false;
}

/**
 * Shared by Bloco de Calor / Bloco de Frio: works out whether this tick's
 * heat/cold contribution should count, and leaves CIRCUIT_LINKED_META /
 * CIRCUIT_ON_META set to match so the renderer can show the same verdict
 * (see PixiStage) instead of the block just silently stopping with no
 * visible tell. A connected clump of the same block is one body for this,
 * exactly like a Porta slab (see bodyCircuitState) — switched together
 * even for cells that aren't themselves touching the wire, not each cell
 * independently deciding for itself. Returns whether it's active this
 * tick.
 */
export function stepCircuitBlock(grid: SimGrid, x: number, y: number, i: number, matId: MaterialId): boolean {
  const { linked, active } = bodyCircuitState(grid, x, y, matId, grid.blockCache);
  const next = (linked ? CIRCUIT_LINKED_META : 0) | (active ? CIRCUIT_ON_META : 0);
  if (grid.meta[i] !== next) { grid.meta[i] = next; grid.wake(x, y); }
  return active;
}

/**
 * Whether (x, y) — a Fio deciding its own state, or a Porta checking
 * what's feeding it — is fed power this tick. Touching an on Alavanca, or
 * a live Eletricidade charge riding this very cell or sitting right beside
 * it, is enough on its own — "beside" matters because a free-falling
 * charge can never actually land *inside* a Fio's cell (Fio is solid, so
 * the charge just stops dead in the empty cell touching it, the same way
 * it'd stop against any other solid); requiring an exact overlap would
 * mean only a charge painted directly on top of a Fio ever lit it up, and
 * one that fell onto it from above never would. Failing that direct
 * touch, it traces outward through connected Fio (never through another
 * Porta or Alavanca — those don't conduct past themselves) looking for an
 * on Alavanca or a charge touching any cell of that run — a charge
 * landing anywhere along a run of Fio powers the *whole* run, exactly
 * like an on Alavanca would, even though the physical spark itself
 * doesn't travel any further than the one cell it's stopped against (Fio
 * isn't `conductive`). The whole run this search touches is settled at
 * once (see `circuitCache`), and every trace starts fresh from the actual
 * switches and charges each tick — so a loop of Fio (or a run an Alavanca
 * just switched off, or a charge that's since moved on or dissipated)
 * can never light itself by "confirming" its neighbor's bit the way a
 * plain adjacency check would, and power drops the instant nothing's
 * actually touching any more.
 */
export function circuitPowered(grid: SimGrid, x: number, y: number): boolean {
  if (pulseAt(grid, x, y)) return true; // a charge riding this very cell is its own live source
  const startI = grid.index(x, y);
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx, ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const j = grid.index(nx, ny);
    const m = grid.material[j];
    if (m === MaterialId.Lever && (grid.meta[j] & CIRCUIT_ON_META) !== 0) return true;
    if (pulseAt(grid, nx, ny)) return true; // a charge touching us from any side — whether riding a neighboring Fio or just stopped dead against us — counts same as landing square on us
  }
  const cached = grid.circuitCache.get(startI);
  if (cached !== undefined) return cached;
  const visited = new Set<number>([startI]);
  const stack = [startI];
  let found = false;
  let budget = CIRCUIT_FLOOD_CAP;
  while (stack.length > 0 && budget-- > 0 && !found) {
    const i = stack.pop()!;
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      const m = grid.material[j];
      if (m === MaterialId.Lever && (grid.meta[j] & CIRCUIT_ON_META) !== 0) { found = true; break; }
      if (pulseAt(grid, nx, ny)) { found = true; break; } // a charge touching any cell of this run, from any side, powers the whole run
      if (m !== MaterialId.Wire || visited.has(j)) continue;
      visited.add(j);
      stack.push(j);
    }
  }
  for (const v of visited) grid.circuitCache.set(v, found);
  return found;
}

/** Whether a live Eletricidade charge is sitting at (x, y) right now — Eletricidade has no physical form (see paintCell), so this is the only way to "see" it touching a cell. */
export function pulseAt(grid: SimGrid, x: number, y: number): boolean {
  for (const p of grid.pulses) if (p.x === x && p.y === y) return true;
  return false;
}

/** A Fio lights up the instant it touches power, and goes dark the instant nothing feeds it — no lingering charge. */
export function stepWire(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  const powered = circuitPowered(grid, x, y);
  if (((grid.meta[i] & CIRCUIT_ON_META) !== 0) !== powered) grid.wake(x, y);
  grid.meta[i] = powered ? CIRCUIT_ON_META : 0;
}

/**
 * Generic body-union power state for a connected clump of same-material
 * cells that only gate on a circuit when actually touched (Bloco de
 * Calor/Frio, Clone) — one body, exactly like a Porta slab (see
 * doorPowered), not a grid of cells each independently deciding for
 * itself whether it happens to be the one touching a Fio/Alavanca. Traces
 * outward through connected `matId` cells: linked the moment *any* cell
 * of the clump touches a Fio/Alavanca (circuitConnected), and — only once
 * linked — active if *any* cell of it is individually fed
 * (circuitPowered), not just the cells actually touching the wire. A
 * clump nobody's wired up at all just runs as always (linked false,
 * active true). Settled once per connected clump per tick in whichever
 * `cache` the caller passes (each material kind gets its own, since a
 * given grid index only ever holds one at a time but different callers
 * shouldn't stomp each other's memoized verdicts); packs both booleans
 * into one int since a Map of plain objects would mean an allocation per
 * cell every tick.
 */
export function bodyCircuitState(
  grid: SimGrid, x: number, y: number, matId: MaterialId, cache: Map<number, number>,
): { linked: boolean; active: boolean } {
  const startI = grid.index(x, y);
  const cached = cache.get(startI);
  if (cached !== undefined) return { linked: (cached & 1) !== 0, active: (cached & 2) !== 0 };
  const visited = new Set<number>([startI]);
  const stack = [startI];
  let linked = false;
  let active = false;
  let budget = CIRCUIT_FLOOD_CAP;
  while (stack.length > 0 && budget-- > 0) {
    const i = stack.pop()!;
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    if (circuitConnected(grid, cx, cy)) {
      linked = true;
      if (circuitPowered(grid, cx, cy)) active = true;
    }
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (grid.material[j] !== matId || visited.has(j)) continue;
      visited.add(j);
      stack.push(j);
    }
  }
  if (!linked) active = true; // untouched by any Fio/Alavanca: runs unconditionally, same as always
  const packed = (linked ? 1 : 0) | (active ? 2 : 0);
  for (const v of visited) cache.set(v, packed);
  return { linked, active };
}

