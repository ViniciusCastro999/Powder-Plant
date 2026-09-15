import type { SimGrid, PipeFlow, SuctionMote } from "../grid";
import { MaterialCategory, MaterialId } from "../types";
import { MATERIALS } from "../materials";
import { NEIGHBORS_4, NEIGHBORS_8 } from "../neighbors";

/*
 * ── Ralo e Cano ──────────────────────────────────────────────────────────
 *
 * Ralo: a normal paintable Sólido — switches on/off exactly like Ventilador
 * (see stepCircuitBlock, the same generic body-union mechanism HeatBlock/
 * ColdBlock already use). While on, any Líquido touching it has a small,
 * weak per-tick chance of being sucked in. If a connected Cano network
 * reaches all the way to an actual opening (see `findPipeExit`), the
 * absorbed liquid becomes a `PipeFlow` that visibly travels the pipe's own
 * path and reappears at that opening instead of just vanishing.
 *
 * Cano: purely a conduit — it has no state or behavior of its own beyond
 * being what `findPipeExit` walks through.
 */

/** Per-tick chance a Ralo actually pulls in a touching Líquido cell — deliberately low, "leve força de sucção, mas bem pouco". */
const DRAIN_SUCK_CHANCE = 0.1;
/** Cap on how many connected Cano cells one exit search visits — a perf budget, well past any pipe run a player would actually paint. */
const PIPE_FLOOD_CAP = 4000;
/** Cells per tick a `PipeFlow` travels along its path. */
const PIPE_FLOW_SPEED = 0.35;
/** Per-tick chance an active Ralo spawns one purely decorative suction mote. */
const SUCTION_MOTE_CHANCE = 0.5;
/** Hard cap on live suction motes across every Ralo combined — cosmetic, kept small since the whole point is a faint, weak trickle, not a visible vortex. */
const SUCTION_MOTE_MAX = 60;
/** How far out (cells) a suction mote can spawn from its Ralo — short on purpose, "bem pouca e fraca". */
const SUCTION_MOTE_RANGE = 2.5;
/** Cells per tick a suction mote drifts inward. */
const SUCTION_MOTE_SPEED = 0.12;

/**
 * Ralo: switches on/off exactly like Ventilador/Bloco de Calor — a
 * connected clump is one fixture, standalone it just always runs, wired to
 * a Fio/Alavanca the whole clump switches together (see stepCircuitBlock).
 * While on, sucks in any touching Líquido at a low per-tick chance each,
 * routing it through a connected Cano to a real opening if one reaches
 * that far (see `findPipeExit`/`grid.pipeFlows`), or just consuming it
 * otherwise. Also spawns a faint, purely decorative suction mote now and
 * then — cosmetic only, never touches the material grid.
 */
export function stepDrain(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  const active = grid.stepCircuitBlock(x, y, i, MaterialId.Drain);
  if (!active) return;

  let pathComputed = false;
  let path: readonly (readonly [number, number])[] | null = null;
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nId = grid.get(nx, ny);
    if (MATERIALS[nId].category !== MaterialCategory.Liquid) continue;
    if (Math.random() >= DRAIN_SUCK_CHANCE) continue;

    // Every liquid neighbor this same tick shares one pipe search — a Ralo
    // with several touching Líquido cells at once (a puddle lapping at it
    // from multiple sides) shouldn't re-walk the same Cano run per neighbor.
    if (!pathComputed) { path = findPipeExit(grid, x, y); pathComputed = true; }

    if (path && path.length > 0) {
      const ni = grid.index(nx, ny);
      grid.pipeFlows.push({
        path,
        index: 0,
        t: 0,
        speed: PIPE_FLOW_SPEED,
        material: nId,
        meta: grid.meta[ni],
      });
    }
    grid.set(nx, ny, MaterialId.Empty);
  }

  if (Math.random() < SUCTION_MOTE_CHANCE && grid.suctionMotes.length < SUCTION_MOTE_MAX) {
    const ang = Math.random() * Math.PI * 2;
    const r = SUCTION_MOTE_RANGE * (0.4 + Math.random() * 0.6);
    const sx = x + 0.5 + Math.cos(ang) * r;
    const sy = y + 0.5 + Math.sin(ang) * r;
    const ddx = x + 0.5 - sx;
    const ddy = y + 0.5 - sy;
    const dist = Math.hypot(ddx, ddy) || 1;
    const life = Math.max(1, Math.round(dist / SUCTION_MOTE_SPEED));
    const mote: SuctionMote = {
      x: sx,
      y: sy,
      vx: (ddx / dist) * SUCTION_MOTE_SPEED,
      vy: (ddy / dist) * SUCTION_MOTE_SPEED,
      life,
      maxLife: life,
    };
    grid.suctionMotes.push(mote);
  }
}

/**
 * Breadth-first search outward from every Cano cell directly touching the
 * Ralo at (dx0, dy0), through connected Cano only, for the NEAREST cell
 * that actually opens onto empty air — the first one a standard BFS
 * reaches is necessarily the closest, so a pipe with several possible
 * outlets always picks the shortest run rather than an arbitrary one. The
 * entry cells themselves never count as that opening, even if one has
 * some open air beside it (a pipe laid along open ground almost always
 * does, right where it starts) — otherwise the "exit" would routinely
 * turn out to be right back next to the drain one cell later, instead of
 * the far end of the run genuinely opening up somewhere. Returns the full
 * cell path from that first touching Cano cell to the real opening (for
 * the travelling `PipeFlow` to walk), or null if no Cano is touching the
 * Ralo at all, or none of it reaches an actual opening within the flood
 * budget.
 */
function findPipeExit(grid: SimGrid, dx0: number, dy0: number): readonly (readonly [number, number])[] | null {
  const start: number[] = [];
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = dx0 + dx, ny = dy0 + dy;
    if (grid.inBounds(nx, ny) && grid.material[grid.index(nx, ny)] === MaterialId.Pipe) start.push(grid.index(nx, ny));
  }
  if (start.length === 0) return null;

  // The entry cells (touching the Ralo itself) never count as the exit,
  // even if one of them happens to have some open air beside it (a pipe
  // laid along open ground almost always does, right where it starts) —
  // otherwise the "exit" would routinely turn out to be right back next to
  // the drain it just left, one cell later, instead of the far end of the
  // run actually opening up somewhere.
  const startSet = new Set<number>(start);
  const visited = new Set<number>(start);
  const parent = new Map<number, number>();
  const queue: number[] = [...start];
  let qi = 0;
  let budget = PIPE_FLOOD_CAP;
  let exit = -1;
  while (qi < queue.length && budget-- > 0) {
    const i = queue[qi++];
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    if (!startSet.has(i)) {
      // A genuine opening, not just "this run happens to be laid across
      // open ground so there's air right above the whole thing" (true of
      // almost any pipe a player would actually build) — only a cell where
      // the run actually STOPS (at most one other Cano touching it, i.e. a
      // real dead end, not a straight-through segment or a junction) and
      // that also touches open air counts.
      let pipeNeighbors = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = cx + dx, ny = cy + dy;
        if (grid.inBounds(nx, ny) && grid.material[grid.index(nx, ny)] === MaterialId.Pipe) pipeNeighbors++;
      }
      let isExit = false;
      if (pipeNeighbors <= 1) for (const [dx, dy] of NEIGHBORS_4) {
        const nx = cx + dx, ny = cy + dy;
        if (grid.inBounds(nx, ny) && grid.material[grid.index(nx, ny)] === MaterialId.Empty) { isExit = true; break; }
      }
      if (isExit) { exit = i; break; }
    }
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (visited.has(j) || grid.material[j] !== MaterialId.Pipe) continue;
      visited.add(j);
      parent.set(j, i);
      queue.push(j);
    }
  }
  if (exit === -1) return null;

  const path: [number, number][] = [];
  let cur: number | undefined = exit;
  while (cur !== undefined) {
    path.push([cur % grid.width, (cur / grid.width) | 0]);
    cur = parent.get(cur);
  }
  path.reverse();
  return path;
}

/**
 * Advances every travelling `PipeFlow` one tick along its precomputed
 * path — a straight walk cell to cell, `t` interpolating the fractional
 * position between the current cell and the next for a smooth crawl
 * rather than a visible jump each time it crosses a cell boundary. Once it
 * reaches the far end, it deposits its real material into whichever
 * touching Empty cell is actually open right then (the specific one that
 * made this cell an "exit" might, rarely, have filled in since) — or, on
 * the off chance none is free anymore, just holds there one more tick and
 * tries again rather than losing the liquid outright.
 */
export function advancePipeFlows(grid: SimGrid): void {
  if (grid.pipeFlows.length === 0) return;
  const next: PipeFlow[] = [];
  for (const f of grid.pipeFlows) {
    f.t += f.speed;
    while (f.t >= 1 && f.index < f.path.length - 1) {
      f.t -= 1;
      f.index++;
    }
    if (f.index >= f.path.length - 1) {
      const [ex, ey] = f.path[f.path.length - 1];
      let placed = false;
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = ex + dx, ny = ey + dy;
        if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Empty) {
          grid.set(nx, ny, f.material, f.meta);
          placed = true;
          break;
        }
      }
      if (!placed) next.push(f); // exit's momentarily blocked — wait and retry next tick
      continue;
    }
    next.push(f);
  }
  grid.pipeFlows = next;
}

/** Advances every decorative suction mote one tick — straight-line drift toward wherever its Ralo spawned it, fading out on arrival or once its short life runs out. Purely visual: never read by anything but the renderer. */
export function advanceSuctionMotes(grid: SimGrid): void {
  if (grid.suctionMotes.length === 0) return;
  const next: SuctionMote[] = [];
  for (const m of grid.suctionMotes) {
    m.life--;
    if (m.life <= 0) continue;
    m.x += m.vx;
    m.y += m.vy;
    next.push(m);
  }
  grid.suctionMotes = next;
}
