import type { SimGrid, WindPuff } from "../grid";
import { FLASH_LIFE, PULSE_AIR_LIFE } from "../grid";
import { MaterialCategory, MaterialId } from "../types";
import { MATERIALS } from "../materials";
import { FAN_DIR_MASK, FAN_DIR_VECTORS, FAN_LINKED_META, FAN_ON_META, CIRCUIT_ON_META } from "../metaBits";
import { NEIGHBORS_8 } from "../neighbors";
import { circuitConnected, circuitPowered } from "./electricity";
import { nearestOf, strike, strikeClock } from "../folk/combat";
import { isGateMaterial, gateBlocksWind } from "./gates";

/*
 * ── Elementos eletrônicos: Para-raio, Ventilador, Torre de defesa ───────────
 */

/** Baseline reach for the smallest possible (one-cell) Para-raio. */
const LIGHTNING_ROD_RANGE_BASE = 10;
/** How much further a Para-raio's pull reaches per extra cell painted into it — more mass, more draw. */
const LIGHTNING_ROD_RANGE_PER_CELL = 1.2;
const LIGHTNING_ROD_RANGE_MAX = 120;
/** Cap on how many connected Para-raio cells one flood visits — a perf budget, well past any rod a player would actually paint. */
const ROD_FLOOD_CAP = 20000;

/** A connected clump of Para-raio is one fixture — its total mass (for range and pull speed) plus every one of its own cells, so a pull always aims at the nearest point of the *actual* shape, never a corner of its bounding box that might not even be part of it (a curved or L-shaped rod's box covers plenty of empty space its shape doesn't). */
interface RodBody {
  size: number;
  leaderIndex: number;
  cells: readonly (readonly [number, number])[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Floods the connected clump of Para-raio cells touching (x, y) — same "a
 * connected clump is one fixture" idea as `fanBody`, just without any
 * circuit state to track, since a rod always runs. `leaderIndex` (the
 * smallest grid index in the clump) is which single cell actually gets to
 * pull each tick — see `stepLightningRod`, which needs exactly one pull
 * attempt per clump per pulse, not one per cell (a big rod has plenty of
 * cells, and every one of them independently nudging the same charge in
 * the same tick would drag it in far faster than any single cell's own
 * pull speed implies, however small that number is). Memoized per clump
 * per tick in `grid.rodCache`.
 */
function rodBody(grid: SimGrid, x: number, y: number): RodBody {
  const startI = grid.index(x, y);
  const cached = grid.rodCache.get(startI);
  if (cached) return cached;
  const visited = new Set<number>([startI]);
  const stack = [startI];
  const cells: [number, number][] = [];
  let leaderIndex = startI;
  let minX = x, maxX = x, minY = y, maxY = y;
  let budget = ROD_FLOOD_CAP;
  while (stack.length > 0 && budget-- > 0) {
    const i = stack.pop()!;
    if (i < leaderIndex) leaderIndex = i;
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    cells.push([cx, cy]);
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (grid.material[j] !== MaterialId.LightningRod || visited.has(j)) continue;
      visited.add(j);
      stack.push(j);
    }
  }
  const body: RodBody = { size: cells.length, leaderIndex, cells, minX, maxX, minY, maxY };
  for (const v of visited) grid.rodCache.set(v, body);
  return body;
}

/** Cells per tick a lone (one-cell) Para-raio pulls a charge by — guaranteed, not a chance. A free-falling charge can drop at most 2 cells in a single tick (see PULSE_LEAP_CHANCE in systems/electricity.ts), so this has to match that worst case or a charge sinking straight away from the rod would slowly lose ground every tick and eventually wander back out of range instead of ever actually arriving. */
const LIGHTNING_ROD_PULL_SPEED_BASE = 2;
/** Extra cells per tick of pull speed per this many cells of connected mass — more mass, a firmer grip, not just a longer reach. */
const LIGHTNING_ROD_MASS_PER_SPEED = 25;
const LIGHTNING_ROD_PULL_SPEED_MAX = 6;

/**
 * Para-raio: a normal paintable Sólido, like Vidro or Metal — paint a
 * single cell or a whole mass of it. Every tick, pulls any free-falling
 * (not yet inside a conductor) Eletricidade charge within reach a few
 * cells closer to the nearest point of its own shape, overriding the
 * charge's own fall for that tick — see `advancePulses`, which runs right
 * after this and picks up from wherever the charge ends up. That pull is
 * a guaranteed minimum, not a coin flip: a charge sinking straight away
 * from the rod under its own gravity needs the pull to reliably keep pace
 * or it never gets any closer no matter how long it's "in range", so this
 * always closes at least LIGHTNING_ROD_PULL_SPEED_BASE cells of distance
 * a tick (more for a bigger rod), rather than sometimes doing nothing at
 * all. Nothing about the charge itself changes along the way, just where
 * it's headed, and the crawl still takes many ticks for anything but a
 * short hop — gradual, not a snap. Once adjacent it's grounded on the
 * spot (its `life` is zeroed, so the very next free-fall check in
 * `advancePulses` drops it) instead of being left to drift into something
 * flammable. The more mass in the connected clump, the further out it
 * reaches *and* the faster it pulls — a lone cell barely manages, a real
 * tower of it draws a charge in fast from well off to the side. Has no
 * effect on a charge already racing through a conductor — that one was
 * never going to wander off course anyway.
 */
export function stepLightningRod(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  if (grid.pulses.length === 0) return;
  const body = rodBody(grid, x, y);
  if (i !== body.leaderIndex) return; // one pull attempt per clump per pulse, not one per cell
  const range = Math.min(LIGHTNING_ROD_RANGE_MAX, LIGHTNING_ROD_RANGE_BASE + body.size * LIGHTNING_ROD_RANGE_PER_CELL);
  const pullSpeed = Math.min(LIGHTNING_ROD_PULL_SPEED_MAX, LIGHTNING_ROD_PULL_SPEED_BASE + Math.floor(body.size / LIGHTNING_ROD_MASS_PER_SPEED));
  for (const p of grid.pulses) {
    if (p.inConductor) continue;
    let nx: number, ny: number;
    if (p.rodTargetX !== undefined && p.rodTargetY !== undefined) {
      // Already locked onto a cell from an earlier tick — keep heading
      // there instead of re-picking, or it would jitter between different
      // targets every tick and never actually settle on a path.
      nx = p.rodTargetX;
      ny = p.rodTargetY;
    } else {
      // Cheap reject first: distance to the bounding box is never more
      // than the distance to the shape's actual nearest cell, so anything
      // the box already rules out can skip the real scan below entirely.
      const boxX = Math.min(Math.max(p.x, body.minX), body.maxX);
      const boxY = Math.min(Math.max(p.y, body.minY), body.maxY);
      if (Math.max(Math.abs(boxX - p.x), Math.abs(boxY - p.y)) > range) continue;

      // Newly in range: lock onto ONE cell, at random, from every rod cell
      // actually within reach — not always the single closest one. A charge
      // approaching from any one direction has an exact nearest cell that's
      // almost always the same for every other charge coming from nearby
      // (say, the very top of a tall thin rod), so always aiming there
      // funnels an entire falling burst into one exact spot and makes it
      // visibly queue up hovering right above that point instead of
      // spreading into the rod the way something being drawn toward a
      // whole object should. Picking randomly among every reachable cell
      // spreads different charges' landing points across the rod's full
      // shape instead.
      const candidates: (readonly [number, number])[] = [];
      for (const cell of body.cells) {
        const [cx, cy] = cell;
        if (Math.max(Math.abs(cx - p.x), Math.abs(cy - p.y)) <= range) candidates.push(cell);
      }
      if (candidates.length === 0) continue;
      const [tx, ty] = candidates[Math.floor(Math.random() * candidates.length)];
      nx = tx;
      ny = ty;
      p.rodTargetX = nx;
      p.rodTargetY = ny;
    }
    const dx = nx - p.x;
    const dy = ny - p.y;
    const best = Math.max(Math.abs(dx), Math.abs(dy));
    if (best <= 1) {
      p.life = 0;
      grid.flashes.push({ x: nx, y: ny, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      continue;
    }
    // A free-falling charge normally fizzles out within a handful of ticks
    // on its own (see PULSE_AIR_LIFE) — nowhere near enough time to show a
    // multi-tick pull happening. Held in a rod's field, it doesn't get to
    // just fade on schedule: its life is kept topped up for as long as
    // it's actually in range, same as if it were still fresh.
    p.life = PULSE_AIR_LIFE;
    // Steers toward the locked target along the true angle between them —
    // both axes move together, in proportion to how far off each one
    // actually is — rather than closing one axis at a time at full speed.
    // Moving only one axis per tick drew a rigid staircase of dead-straight
    // vertical and horizontal segments, which always looked like the pull
    // snapping to the rod's own alignment instead of curving in — exactly
    // the "sempre reto em vertical ou horizontal" look this replaces. A
    // charge coming in from mostly one side now visibly bends the rest of
    // the way, a real diagonal approach instead of two rigid right-angle
    // stretches.
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    const mag = Math.min(dist, 1 + Math.floor(Math.random() * pullSpeed));
    let moveX = Math.round((dx / dist) * mag);
    let moveY = Math.round((dy / dist) * mag);
    // A small chance to nudge the minor axis a little extra (or start it
    // moving even when the proportional step alone would round it to 0)
    // keeps several charges converging on the same area from all curving
    // along the exact same line.
    if (Math.random() < 0.3) {
      if (Math.abs(dx) >= Math.abs(dy) && dy !== 0) moveY += Math.sign(dy);
      else if (dx !== 0) moveX += Math.sign(dx);
    }
    p.x += moveX;
    p.y += moveY;
    // Claim it for this tick so the normal free-fall step (random drift,
    // gravity down regardless of which way the rod is pulling) doesn't
    // also run on top of this move — see the field's doc comment on Pulse.
    p.rodPulled = true;
  }
}

/** A connected clump of Ventilador is one fixture, exactly like Bloco de Calor/Frio — this is its combined on/off state plus cell count, so a bigger fan blows harder. `leaderIndex` and `cells` exist purely so exactly one cell per clump per tick spawns wind motes (see stepFan) — otherwise a fan with dozens of face cells would spawn dozens of motes a tick just from having a tall or wide face, completely swamping any per-mote population cap regardless of how it's enforced. */
interface FanBody {
  linked: boolean;
  active: boolean;
  size: number;
  leaderIndex: number;
  cells: readonly (readonly [number, number])[];
  /** This tick's gust strength (see FAN_GUST_MIN/MAX) — rolled once here, when the body is first computed for the tick, so every cell of the body reads the exact same gust rather than each face cell rolling its own (which would look like flickering static, not a real gust sweeping the whole draft at once). */
  gust: number;
}

/** Cap on how many connected Ventilador cells one flood visits — a perf budget, well past any fan a player would actually paint. */
const FAN_FLOOD_CAP = 20000;

/**
 * Floods the connected clump of Ventilador cells touching (x, y), same
 * "one body" idea as `bodyCircuitState` (untouched by any Fio/Alavanca, it
 * just always runs; touched by one, the whole clump switches together) but
 * also counting the clump's total size, since a Ventilador's draft scales
 * with how much fan the player actually painted. Memoized per clump per
 * tick in `grid.fanCache`, exactly like the circuit caches.
 */
function fanBody(grid: SimGrid, x: number, y: number): FanBody {
  const startI = grid.index(x, y);
  const cached = grid.fanCache.get(startI);
  if (cached) return cached;
  const visited = new Set<number>([startI]);
  const stack = [startI];
  const cells: [number, number][] = [];
  let linked = false;
  let active = false;
  let leaderIndex = startI;
  let budget = FAN_FLOOD_CAP;
  while (stack.length > 0 && budget-- > 0) {
    const i = stack.pop()!;
    if (i < leaderIndex) leaderIndex = i;
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    cells.push([cx, cy]);
    if (circuitConnected(grid, cx, cy)) {
      linked = true;
      if (circuitPowered(grid, cx, cy)) active = true;
    }
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (grid.material[j] !== MaterialId.Fan || visited.has(j)) continue;
      visited.add(j);
      stack.push(j);
    }
  }
  if (!linked) active = true; // untouched by any Fio/Alavanca: runs unconditionally, same as a standalone Bloco de Calor/Frio
  const gust = FAN_GUST_MIN + Math.random() * (FAN_GUST_MAX - FAN_GUST_MIN);
  const state: FanBody = { linked, active, size: cells.length, leaderIndex, cells, gust };
  for (const v of visited) grid.fanCache.set(v, state);
  return state;
}

/** Baseline reach/strength for the smallest possible (one-cell) Ventilador — deliberately weak on its own. */
const FAN_RANGE_BASE = 6;
/** How much further a fan's draft reaches per extra cell of the fan's TOTAL connected body — not just its face — so a wide, deep mass of fan reaches dramatically further than a lone cell, and keeps growing well past what a modest fan could ever manage. */
const FAN_RANGE_PER_CELL = 0.8;
/** Raised well past what any reasonably-sized fan would hit in practice, so a genuinely huge painted mass keeps reaching further instead of plateauing early — the real ceiling in play is how much fan the player is willing to paint, not this cap. */
const FAN_RANGE_MAX = 200;
const FAN_PUSH_CHANCE_BASE = 0.025;
/** How much more reliably a fan pushes per extra cell painted into it. */
const FAN_PUSH_CHANCE_PER_CELL = 0.005;
const FAN_PUSH_CHANCE_MAX = 0.28;
/** Chance a successful push carries its grain an extra cell in the same tick (checked twice, so occasionally two extra) — the bit of inertia/randomness in how FAR a single gust shoves something, on top of the gust already varying how OFTEN it shoves at all. */
const FAN_PUSH_LEAP_CHANCE = 0.22;
/**
 * Wind isn't a steady, unchanging force — real gusts ebb and flow. Each
 * fan body rerolls a gust multiplier once a tick (not once per cell, same
 * reasoning as leaderIndex elsewhere) and applies it to that tick's push
 * chance, so the draft visibly surges and eases over time instead of
 * pushing at one constant, perfectly linear rate every single tick.
 */
const FAN_GUST_MIN = 2.50;
const FAN_GUST_MAX = 3.00;
/** Hard safety ceiling on how many wind motes can exist at once across EVERY fan combined — a perf backstop for pathological cases (dozens of huge fans running at once), not the everyday throttle. Each fan body is kept near its own size-scaled target independently (see FAN_PUFF_TARGET_* and stepFan). */
const FAN_PUFF_MAX = 10500;
/**
 * Motes per cell of a fan's own `range`, not per cell of its body — so the
 * population always looks equally dense no matter the fan's size, instead
 * of a fan with a longer reach ending up with the same total mote count
 * spread thinner over a much longer trail. Bump this to make every fan's
 * wind read as thicker/denser across the board.
 */
const FAN_PUFF_DENSITY = 6;
/** Floor on a fan body's own target, so a tiny fan (short range, otherwise only a handful of motes at this density) still reads as a visible draft rather than a near-empty trickle. */
const FAN_PUFF_TARGET_MIN = 30;
/** Ultimate cap on a single fan body's own target, well below FAN_PUFF_MAX so there's always headroom for other fans too. */
const FAN_PUFF_TARGET_MAX = 1500;
/** How far past the fan's real push range a mote is allowed to keep drifting before fading out — a little overshoot past where the wind actually stops moving powder reads as a trailing whoosh instead of an abrupt visual cutoff. */
const FAN_PUFF_OVERSHOOT = 1.6;
/** How far the push scan fans out to either side of its dead-ahead ray, perpendicular to the blow direction — Pó settles below the fan's exact row/column and Gás rises above it, so a single-cell-wide line would miss most of what it's meant to move. */
const FAN_BAND_RADIUS = 2;

/** Whether a Ventilador's draft actually moves this material — any Pó (Areia through Pedra) or loose gas/flame, not liquids or anything nailed down (Sólidos other than Pó itself). */
function windCarries(id: MaterialId): boolean {
  if (id === MaterialId.Fire) return true;
  const cat = MATERIALS[id].category;
  return cat === MaterialCategory.Powder || cat === MaterialCategory.Gas || cat === MaterialCategory.Liquid
    || cat === MaterialCategory.Creature;
}

/**
 * Whether the wind (the real push, or one of its visible motes) is
 * actually stopped dead at (x, y) — true for an ordinary Sólido same as
 * always, but a Portão is the one exception: it only blocks the draft
 * while it's actively closed, regardless of which category it targets —
 * an open Portão Líquidos lets the wind sail straight through it exactly
 * like it lets Água and Areia through, even though its whole job is
 * normally about liquids, not air.
 */
function windBlocked(grid: SimGrid, x: number, y: number): boolean {
  const id = grid.get(x, y);
  if (id === MaterialId.Empty || windCarries(id)) return false;
  if (isGateMaterial(id)) return gateBlocksWind(grid, x, y);
  return true;
}

/**
 * Ventilador: a normal paintable Sólido, like Vidro or Metal — paint a
 * single cell or a whole wall of it, whichever, and every connected clump
 * is one fixture (see `fanBody`): untouched by any circuit it just always
 * runs, wired to a Fio/Alavanca it switches on and off together, and the
 * more of it there is, the further and more reliably its draft pushes
 * things along. Faces one of 8 directions (see FAN_DIR_VECTORS) set per
 * cell at paint time (`SimGrid.fanDirection`, chosen from the brush before
 * placing) and rotatable afterward for a whole clump at once with a
 * right-click (see `toggleFan`). Only the cells on the clump's downstream
 * face — nothing of its own material immediately ahead — actually scan and
 * push, each along its own ray, so a tall or wide fan's reach naturally
 * covers its own extent instead of one fixed band; a thick fan's interior
 * cells are skipped since the face in front of them already does the same
 * job.
 */
export function stepFan(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  const body = fanBody(grid, x, y);
  const next = (grid.meta[i] & FAN_DIR_MASK) | (body.linked ? FAN_LINKED_META : 0) | (body.active ? FAN_ON_META : 0);
  if (grid.meta[i] !== next) grid.meta[i] = next;
  if (!body.active) return;

  const [dx, dy] = FAN_DIR_VECTORS[grid.meta[i] & FAN_DIR_MASK];
  const aheadX = x + dx, aheadY = y + dy;
  const isFace = !(grid.inBounds(aheadX, aheadY) && grid.get(aheadX, aheadY) === MaterialId.Fan);

  // body.gust is rerolled once a tick (per body, not per cell — see
  // fanBody) so the draft's actual push strength drifts up and down over
  // time instead of pushing at one perfectly steady, linear rate forever.
  const pushChance = Math.min(1, Math.min(FAN_PUSH_CHANCE_MAX, FAN_PUSH_CHANCE_BASE + body.size * FAN_PUSH_CHANCE_PER_CELL) * body.gust);
  const range = Math.min(FAN_RANGE_MAX, FAN_RANGE_BASE + body.size * FAN_RANGE_PER_CELL);
  // The exact expected speed the push physics above actually moves a grain
  // at: `pushChance` chance of a push happening at all in a given tick,
  // and when it does, the inertia leaps (FAN_PUSH_LEAP_CHANCE) carry it an
  // average of `avgLeapDistance` cells rather than always exactly one. A
  // wind mote uses this SAME number for its own drift speed (see below)
  // instead of a separately-tuned formula that only happened to grow
  // alongside it — so the visible motes are never faster or slower than
  // the wind that's actually moving the powder.
  const avgLeapDistance = 1 + FAN_PUSH_LEAP_CHANCE + FAN_PUSH_LEAP_CHANCE * 0.4;
  const windSpeed = pushChance * avgLeapDistance;

  if (isFace) {
    // Heavy Pó sinks to whatever it's resting on and Gás rises to whatever
    // ceiling it finds — neither necessarily stays exactly level with the
    // fan's own row — so the scan also fans out a little on either side of
    // its ray (perpendicular to the blow direction) instead of checking
    // only the single-cell-wide line straight ahead.
    // Each band is its own ray, walked outward one distance at a time, so
    // it can stop dead the moment it hits a Sólido — a wall of Vidro or
    // Metal in the way genuinely blocks the draft from reaching anything
    // behind it, instead of the wind reaching straight through a solid
    // obstruction to push loose material on the far side of it.
    const px = -dy, py = dx;
    // A tall or wide fan is a whole run of face cells stacked perpendicular
    // to the blow direction, each already covering its OWN row exactly at
    // s=0 — so only the cells at the very top and bottom of that run (the
    // ones with no fan neighbor further out) need to extend their band
    // outward at all, to catch material that settled just past the fan's
    // own edge. Every interior face cell used to extend its own band too,
    // which meant an interior row got scanned — and independently rolled
    // for a push — by several neighboring face cells at once every tick,
    // silently pushing real material several times faster than the single
    // `pushChance` roll the wind motes' own speed was built from.
    const hasNegNeighbor = grid.inBounds(x - px, y - py) && grid.get(x - px, y - py) === MaterialId.Fan;
    const hasPosNeighbor = grid.inBounds(x + px, y + py) && grid.get(x + px, y + py) === MaterialId.Fan;
    const sLo = hasNegNeighbor ? 0 : -FAN_BAND_RADIUS;
    const sHi = hasPosNeighbor ? 0 : FAN_BAND_RADIUS;
    for (let s = sLo; s <= sHi; s++) {
      for (let d = 1; d <= range; d++) {
        const fx = x + dx * d + px * s, fy = y + dy * d + py * s;
        if (!grid.inBounds(fx, fy)) break;
        const here = grid.get(fx, fy);
        if (here === MaterialId.Empty) continue;
        if (windBlocked(grid, fx, fy)) break; // a solid (or a currently-closed Portão) blocks the rest of this ray
        if (!windCarries(here)) continue; // an open Portão itself isn't pushable, but doesn't stop the ray either
        const tx = fx + dx, ty = fy + dy;
        if (!grid.inBounds(tx, ty) || grid.get(tx, ty) !== MaterialId.Empty) continue;
        if (Math.random() >= pushChance) continue;
        // A little inertia: most successful pushes just nudge the grain one
        // cell, but every so often the gust behind that particular grain
        // happens to be a bit stronger and carries it a couple of cells in
        // the same go — random per push, not a fixed distance every time,
        // so no two grains caught by the same gust move in quite as
        // lockstep a way.
        let leapX = fx, leapY = fy;
        let steps = 1;
        if (Math.random() < FAN_PUSH_LEAP_CHANCE) steps++;
        if (Math.random() < FAN_PUSH_LEAP_CHANCE * 0.4) steps++;
        let actualSteps = 0;
        for (let step = 0; step < steps; step++) {
          const nx2 = leapX + dx, ny2 = leapY + dy;
          if (!grid.inBounds(nx2, ny2) || grid.get(nx2, ny2) !== MaterialId.Empty) break;
          grid.swap(leapX, leapY, nx2, ny2);
          leapX = nx2;
          leapY = ny2;
          actualSteps++;
        }
        // The ray scans outward in exactly the direction things get pushed
        // in, so without this, the very next `d` (or the one after, for a
        // multi-cell leap) would land on the spot this grain just moved
        // to and roll ANOTHER push chance on it immediately — and if that
        // one hit too, the one after that, cascading a single grain almost
        // the whole way down the ray in one tick with some regularity
        // instead of moving at the intended per-tick rate. Skipping the
        // scan past wherever it actually ended up keeps one push attempt
        // per grain per tick, matching the speed the wind motes drift at.
        d += actualSteps;
      }
    }
  }

  // Wind motes are spawned once per *body* per tick, from the leader cell
  // only — not once per face cell. A fan's face can easily be dozens of
  // cells tall or wide, and rolling a spawn chance on every one of them
  // would scale the total rate with the fan's *face size* rather than its
  // overall size or the effect it's actually meant to show.
  if (i === body.leaderIndex) {
    // Literally the same speed the wind is actually moving powder at this
    // tick (see windSpeed above) — already scales with size (bigger fan,
    // higher pushChance, faster wind) and already carries this tick's gust,
    // since pushChance itself does. Each mote keeps whatever speed it was
    // born with for its whole trip, same as a real gust of wind carrying a
    // puff of dust at whatever strength it had at that instant.
    const puffSpeed = Math.max(0.02, windSpeed);
    // Ticks to live so the mote fades out a little past `range` cells out
    // — slightly overshooting exactly where the draft stops pushing powder
    // reads as a nice trailing whoosh rather than the visual cutting off
    // right at the edge of the real effect.
    const life = Math.max(1, Math.round((range * FAN_PUFF_OVERSHOOT) / puffSpeed));
    // Spawning is throttled by chance, not by batching several motes and
    // then hard-blocking once a count cap is hit: a bigger fan's motes
    // live longer (their life tracks `range`), so it needs to spawn them
    // *less* often, not more, to land on its own target population below
    // — working backwards from that target (chance * life ≈ target) keeps
    // arrivals spread evenly over time. Batch-then-block instead made
    // whole cohorts spawn and later expire together, producing
    // synchronized "waves" of motes with visible empty gaps between them
    // rather than a continuous stream.
    // Scaled off `range`, not `body.size` — a fan that reaches twice as far
    // keeps twice as many motes in flight, so the wind looks equally dense
    // over its whole length regardless of how big or small the fan itself
    // is, instead of the same trail thinning out the further it reaches.
    const target = Math.min(FAN_PUFF_TARGET_MAX, Math.max(FAN_PUFF_TARGET_MIN, range * FAN_PUFF_DENSITY));
    // Average new motes needed per tick to sustain `target` given how long
    // one actually lives (population ≈ rate * life at equilibrium). A fast,
    // strong fan's motes can have a short enough life that sustaining a
    // dense target needs spawning more than one a tick — spawning at most
    // one, ever, silently caps the achievable population at roughly `life`
    // itself no matter how high `target` is set, which is exactly why
    // density used to fall off for bigger, faster-blowing fans instead of
    // staying constant. The fractional remainder is handled by chance so a
    // rate like 2.3/tick averages out correctly rather than always
    // rounding to 2 or 3.
    const spawnRate = target / life;
    const guaranteed = Math.floor(spawnRate);
    const bonusChance = spawnRate - guaranteed;
    const spawnCount = guaranteed + (Math.random() < bonusChance ? 1 : 0);
    if (spawnCount > 0) {
      // How many motes THIS body already has in flight, checked against its
      // own target rather than the shared pool — a small fan's motes turn
      // over fast (short life, so a high chance keeps it near its own target
      // almost immediately), and without this, that quick turnover let it
      // fill most of one shared population cap long before a much bigger fan
      // nearby ever got its own motes off the ground, since a big fan's
      // motes live far longer and so need a much lower chance per tick to
      // land on the same target — exactly the "big fan barely shows any
      // wind" bug this fixes. FAN_PUFF_MAX below is now just a hard safety
      // ceiling for pathological cases (dozens of fans at once), not the
      // everyday throttle.
      let owned = 0;
      for (const puff of grid.windPuffs) if (puff.owner === body.leaderIndex) owned++;
      // Motes should visibly emerge from the fan's face, not from wherever
      // in its solid block the leader cell happens to sit — so pick spawn
      // points only from cells that actually have open air (or at least not
      // more fan) immediately ahead of them in the blow direction.
      const faceCells = body.cells.filter(([cx, cy]) => {
        const nx = cx + dx, ny = cy + dy;
        return !grid.inBounds(nx, ny) || grid.get(nx, ny) !== MaterialId.Fan;
      });
      const spawnCells = faceCells.length > 0 ? faceCells : body.cells;
      for (let k = 0; k < spawnCount; k++) {
        if (owned >= target || grid.windPuffs.length >= FAN_PUFF_MAX) break;
        const [ox, oy] = spawnCells[Math.floor(Math.random() * spawnCells.length)];
        const puff: WindPuff = {
          x: ox + dx * 1.5,
          y: oy + dy * 1.5,
          vx: dx * puffSpeed,
          vy: dy * puffSpeed,
          life,
          maxLife: life,
          owner: body.leaderIndex,
        };
        grid.windPuffs.push(puff);
        owned++;
      }
    }
  }
}

/** Advances every drifting wind mote one tick — constant velocity, no gravity, gone once its life runs out or it drifts off the grid. */
export function advanceWindPuffs(grid: SimGrid): void {
  if (grid.windPuffs.length === 0) return;
  const next: WindPuff[] = [];
  for (const w of grid.windPuffs) {
    w.life--;
    if (w.life <= 0) continue;
    w.x += w.vx;
    w.y += w.vy;
    const gx = Math.round(w.x), gy = Math.round(w.y);
    if (!grid.inBounds(gx, gy)) continue;
    // Whatever stops the real wind dead (see windBlocked/the push scan
    // above) — an ordinary Sólido, or a currently-closed Portão — has to
    // stop the decorative motes at the same spot too, or the visual would
    // show dust drifting straight through a wall the real draft can't
    // actually get past. An open Portão is the one thing that blocks
    // neither: motes drift right on through it, same as the real draft.
    if (windBlocked(grid, gx, gy)) continue;
    next.push(w);
  }
  grid.windPuffs = next;
}

const SKELETON_ONLY: readonly MaterialId[] = [MaterialId.Skeleton];
/** How far a Torre de defesa can spot and shoot a Esqueleto. */
const TOWER_RANGE = 40;
const TOWER_DAMAGE = 1;
const TOWER_FLASH_LIFE = 7;

/** Cap on how many connected Torre de defesa cells one power check visits — the fixture is a fixed small footprint, so this is a generous safety margin, not a real limit. */
const TOWER_FLOOD_CAP = 64;

/**
 * Whether this Torre de defesa's connected clump is powered right now — a
 * body, not a grid of cells each independently deciding for itself: active
 * the moment *any* cell of it is fed (`circuitPowered`), exactly like a
 * Porta slab. Unlike Bloco de Calor/Frio it has no standalone mode — an
 * untouched Torre never fires at all, on purpose (see stepDefenseTower).
 * Memoized per clump per tick in `grid.towerCache`.
 */
function towerBodyPowered(grid: SimGrid, x: number, y: number): boolean {
  const startI = grid.index(x, y);
  const cached = grid.towerCache.get(startI);
  if (cached !== undefined) return cached;
  const visited = new Set<number>([startI]);
  const stack = [startI];
  let active = false;
  let budget = TOWER_FLOOD_CAP;
  while (stack.length > 0 && budget-- > 0) {
    const i = stack.pop()!;
    const cx = i % grid.width, cy = (i / grid.width) | 0;
    if (circuitPowered(grid, cx, cy)) active = true;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx, ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.index(nx, ny);
      if (grid.material[j] !== MaterialId.DefenseTower || visited.has(j)) continue;
      visited.add(j);
      stack.push(j);
    }
  }
  for (const v of visited) grid.towerCache.set(v, active);
  return active;
}

/**
 * Torre de defesa: a fixed crenellated-turret fixture (see
 * DEFENSE_TOWER_SHAPE in grid.ts), only active while its whole connected
 * clump is powered by a touching Alavanca or Fio (see `towerBodyPowered`),
 * so it takes wiring it up on purpose rather than being free automatic
 * defense. While on, every cell of it independently spots the nearest
 * Esqueleto within TOWER_RANGE and shoots on the same attack cooldown as a
 * Guerreiro (see `strikeClock`) — the same one point a hit, without
 * needing to stand next to it — so the whole tower fires as many times as
 * it has cells, each on its own clock.
 */
export function stepDefenseTower(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  const active = towerBodyPowered(grid, x, y);
  grid.meta[i] = active ? CIRCUIT_ON_META : 0;
  if (!active) return;

  const foe = nearestOf(grid, x, y, SKELETON_ONLY, TOWER_RANGE);
  if (!foe) return;
  const [fdx, fdy] = foe;
  if (strikeClock(grid, i, true)) {
    strike(grid, grid.index(x + fdx, y + fdy), TOWER_DAMAGE, x, y);
    grid.hits.push({ x, y, life: TOWER_FLASH_LIFE, maxLife: TOWER_FLASH_LIFE });
  }
}
