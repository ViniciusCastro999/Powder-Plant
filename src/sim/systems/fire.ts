import type { SimGrid } from "../grid";
import { FLASH_LIFE } from "../grid";
import { MaterialId, MaterialCategory } from "../types";
import { MATERIALS } from "../materials";
import { NEIGHBORS_8 } from "../neighbors";
import { GLASS_SHATTER_HITS } from "../metaBits";
import type { Shrapnel, Flash, Debris } from "../grid";

/*
 * ── Fogo, explosões, estilhaços e detritos ─────────────────────────────────
 * Fire spreads/flickers/ignites; explosives detonate as a local impulse
 * (see `detonate`) that throws loose material as `Debris` and lights a
 * chain of fuses through the rest of a connected charge; `Shrapnel` is a
 * purely decorative spark burst. See the doc comments on each function
 * below for the full mechanics.
 */

/** Fire only spreads/burns/flickers on every Nth tick — an easy global slow-down independent of each material's own burnTicks. 1 = full speed. */
const FIRE_TICK_INTERVAL = 1;
/** Extra fuel a Fire cell loses on a tick where it's boxed in on all 3 upward cells — it smothers instead of sitting fully lit against a wall for its whole lifetime. */
const FIRE_SMOTHER_DECAY = 4;
/** Chance an active Fire cell leaps 2 cells instead of 1 on its flicker move, so a burst of flame scatters wider before it burns out. */
const FIRE_LEAP_CHANCE = 0.22;
/** Per-tick chance a Sand cell touching Lava or Fire fuses into Glass instead of melting — glassblowing by the fire. Exported: stepLava (still in grid.ts) uses this too. */
export const HEAT_FUSE_GLASS = 0.03;
/** How many connected flammable creatures one ignition flashes over at once — this is what makes fire sweep a whole trail/flock instead of dying with the one it caught. A perf budget, not a balance knob. */
const CREATURE_FIRE_FLOOD_CAP = 600;

/**
 * The explosion model is impulse-based, not a flood-fill pressure wave: a
 * detonation reaches into the disc of grid around it and, for every loose
 * cell it finds (Powder, Liquid, and — near the core — the more fragile
 * solids), *lifts that cell off the grid entirely* and hands it to the
 * `Debris` particle system with an outward velocity. Those chunks then arc
 * out under real gravity, collide with whatever's still standing, and drop
 * back onto the grid as their own material wherever they come to rest — so
 * a blast genuinely scoops a crater and throws its contents outward into a
 * rim and a scatter, the way a real explosion does, instead of nudging
 * each grain one cell and letting it trickle back into the hole.
 *
 * BLAST_BASE_RADIUS is the reach (in cells) of the smallest possible pop —
 * a single loose grain of Pólvora. A bigger connected charge detonates as a
 * chain of these small pops (see the fuses in `detonate`), and each pop's
 * own reach also grows with `Math.sqrt(power)` so the consumed pocket's
 * size feeds through to a proportionally larger — but not runaway — disc.
 */
const BLAST_BASE_RADIUS = 9;
/** Fraction of the blast radius within which even sturdy solids (Pedra) can be pulverized into flying rubble; outside it they only shield. */
const BLAST_PULVERIZE_FRAC = 0.5;
/** Fraction of the blast radius within which the fragile solids (Madeira, Planta, Vidro, Gelo, Semente, Broto, Flor) are torn loose and thrown; outside it they're left standing (though a flammable one may still be lit by the heat). */
const BLAST_SHATTER_FRAC = 0.8;
/** Peak outward launch speed (cells/tick) handed to a chunk right at the epicenter — it falls off linearly to zero at the blast's edge. */
const BLAST_LAUNCH_SPEED = 4.0;
/** Every launched chunk also gets this much straight-up bias added on top of its radial velocity, so debris arcs and rains rather than skating flat along the ground. */
const BLAST_UPWARD_BIAS = 0.9;
/** Random ± spread (radians) added to each chunk's launch angle so the debris fans out instead of firing along perfectly radial spokes. */
const BLAST_ANGLE_JITTER = 0.5;
/** Hard ceiling on live `Debris` particles — past this, a fresh detonation stops converting cells to debris (it still consumes/ignites them) so a huge chain can't melt the frame rate. */
const DEBRIS_CAP = 5000;
/** Downward acceleration (cells/tick²) on a chunk in flight. */
const DEBRIS_GRAVITY = 0.044;
/** Per-tick multiplier on a chunk's velocity — mild air drag so fast debris sheds speed and settles instead of skating forever. */
const DEBRIS_DRAG = 0.991;
/** Below this speed a chunk is considered to have come to rest and is deposited back onto the grid. */
const DEBRIS_SETTLE_SPEED = 0.2;
/** Failsafe lifespan (ticks) — a chunk that somehow never settles is deposited anyway once this runs out. */
const DEBRIS_MAX_LIFE = 140;
/**
 * Scales how readily the blast itself ignites a flammable cell in range
 * (Madeira, Óleo, and the like) on top of that material's own
 * `ignitionChance`, by distance falloff — "recebe calor intenso, pode
 * entrar em combustão" as a direct effect of the explosion, not something
 * that only ever happens once a separately-spreading Fogo drifts over.
 *
 * `ignitionChance` is calibrated for *repeated* per-tick rolls while
 * continuously touching an ongoing Fogo (Madeira's 0.03 reads as "3% per
 * tick, for as long as the fire keeps burning next to it"), but the blast
 * gets one single roll per cell — this factor scales it back up so a cell
 * at the heart of a blast reads as "very likely to ignite" while a faint
 * touch near the rim still only has a small chance.
 */
const BLAST_IGNITE_FACTOR = 25;
/** How much extra blast scale (decorative Shrapnel count, starting energy) each extra cell in the small local *pocket* a single detonation consumes adds — see `detonate`/`collectExplosivePocket`. The pocket is only ~1-9 cells, so this stays modest; a big pile's force comes from a long chain of these small pops, not one huge blast. */
const CLUSTER_BONUS_PER_CHARGE = 0.2;
/**
 * When an explosive first goes off, the detonation floods the whole
 * *connected* body of explosive it's part of and lights a fuse on every
 * cell at once, timed by how many cells out it is — so a painted block
 * rips itself apart in one fast crack that visibly sweeps across it in a
 * few frames (like a real detonation front tearing through the charge),
 * not a lazy smoulder-chain crawling cell by cell over several seconds.
 */
const CHAIN_BASE_DELAY = 1;
/** BFS rings of connected explosive that share each 1-tick step of fuse delay — smaller = the detonation front sweeps the charge faster. */
const CHAIN_RINGS_PER_TICK = 4;
/** Cap on how many connected cells one detonation floods and fuses in a single pass — a rendering/perf budget; anything past it is picked up by the next detonation's own flood. */
const CHAIN_FLOOD_CAP = 1600;
/** Ticks a *separate* Pólvora/C4 pile (one the blast reached across a gap, not touching the charge that went off) waits before detonating — a scattered minefield ripples outward over several frames instead of flashing to nothing at once. */
const CHAIN_DELAY_SEPARATE = 5;
/** Decorative Shrapnel sparks spawned per individual detonation, scaled by its small pocket size. Low on purpose: a big pile now produces a long chain of these small pops rather than one massive burst. */
const SHRAPNEL_PER_POP = 7;
/** Each particle's starting speed is randomized in this range — a spread of fast and slow debris reads as a real blast instead of a uniform ring all moving in lockstep. */
const SHRAPNEL_SPEED_MIN = 0.35;
const SHRAPNEL_SPEED_MAX = 0.95;
/** Ticks a Shrapnel particle survives before it's fully faded out — randomized per-particle so a burst doesn't blink out all at once. No gravity: it's a purely decorative spark, not a falling object, so it flies outward in a straight line and just dies out over time instead of curving into a fall. */
const SHRAPNEL_LIFE_MIN = 22;
const SHRAPNEL_LIFE_MAX = 42;
/** Hard ceiling on how many decorative Shrapnel particles a single blast spawns — a rendering/performance budget, not a limit on the blast's actual force (see CLUSTER_BONUS_PER_CHARGE, which is uncapped). */
const SHRAPNEL_VISUAL_CAP = 400;

export function stepFire(grid: SimGrid, x: number, y: number, i: number): void {
    grid.processed[i] = 1;
    // Fire only acts on every FIRE_TICK_INTERVAL-th tick — a global slow
    // motion knob for spread/ignition/fuel-burn/flicker all at once,
    // independent of each material's own burnTicks ratio.
    if (grid.tick % FIRE_TICK_INTERVAL !== 0) return;

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (grid.get(nx, ny) === MaterialId.Water) {
        grid.set(x, y, MaterialId.Empty);
        return;
      }
    }

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const neigh = grid.get(nx, ny);
      // Sand held in the flame slowly fuses to Glass.
      if (neigh === MaterialId.Sand) { if (Math.random() < HEAT_FUSE_GLASS) grid.set(nx, ny, MaterialId.Glass); continue; }
      const nDef = MATERIALS[neigh];
      if (!nDef.flammable) continue;
      // A flame right next to an animal grabs it far more readily than it
      // would, say, a log — a creature that only had this material's slow
      // per-tick ignitionChance would usually be missed as the fire flickers
      // past, and a thin ant trail would never catch.
      const chance = nDef.category === MaterialCategory.Creature ? Math.max(nDef.ignitionChance, 0.55) : nDef.ignitionChance;
      if (Math.random() < chance) grid.igniteAt(nx, ny);
    }

    // Boxed in on all 3 upward cells (nothing to flicker into): this flame
    // has nowhere to breathe and smothers out well before its fuel would
    // otherwise run out, instead of sitting fully lit against a wall.
    const smothered = ([[0, -1], [-1, -1], [1, -1]] as const).every(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return !grid.inBounds(nx, ny) || grid.get(nx, ny) !== MaterialId.Empty;
    });
    // Math.max clamps this at 0 before it's written back — meta is a
    // Uint8Array, so `meta[i] -= 4` when meta[i] is, say, 2 doesn't go
    // negative, it *underflows* to 254 and the "reached zero" check below
    // never trips again. That's exactly why fire pinned against the
    // ceiling (permanently smothered, since everything above row 0 is
    // out of bounds) looked like it never went out.
    grid.meta[i] = Math.max(0, grid.meta[i] - (smothered ? FIRE_SMOTHER_DECAY : 1));
    if (grid.meta[i] <= 0) {
      grid.set(x, y, MaterialId.Empty);
      return;
    }

    // Flickers upward through empty space instead of sitting still. A
    // fraction of moves leap 2 cells instead of 1 in the same direction —
    // occasional bigger jumps read as scattering embers, spreading the
    // flame further from where it started before it burns out.
    const dir = Math.random();
    const [ddx, ddy] = dir < 0.34 ? [0, -1] : dir < 0.67 ? [-1, -1] : [1, -1];
    const leap = Math.random() < FIRE_LEAP_CHANCE;
    if (leap && grid.tryMoveFire(x, y, x + ddx * 2, y + ddy * 2)) return;
    grid.tryMoveFire(x, y, x + ddx, y + ddy);
  }

export function tryMoveFire(grid: SimGrid, fx: number, fy: number, tx: number, ty: number): boolean {
    if (!grid.inBounds(tx, ty) || grid.get(tx, ty) !== MaterialId.Empty) return false;
    grid.swap(fx, fy, tx, ty);
    return true;
  }

  /** Sets a cell alight — a detonation for Gunpowder, an ordinary burn for anything else flammable. */
export function igniteAt(grid: SimGrid, x: number, y: number): void {
    const def = MATERIALS[grid.get(x, y)];
    if (def.explosive) {
      // A whole flank of a huge charge can catch in the same tick (fire or a
      // blast reaching many separate cells at once) — spend from the shared
      // pop budget same as a fuse would, and give it a one-tick fuse to retry
      // through `stepFuse` if the budget's already spent.
      if (grid.canDetonate()) grid.detonate(x, y);
      else grid.meta[grid.index(x, y)] = 1;
      return;
    }
    grid.set(x, y, MaterialId.Fire, def.burnTicks);
    grid.processed[grid.index(x, y)] = 1;
    // Fire runs right through a huddle of animals: the whole connected
    // group of touching flammable creatures goes up at once. Without this
    // the flame flickers up and off the spot before the next one in a
    // trail or flock ever catches, so a torch to a colony just kills the
    // single ant it touched. Bounded by CREATURE_FIRE_FLOOD_CAP for perf;
    // any beyond that catch the ordinary way from the spreading Fogo.
    if (def.category === MaterialCategory.Creature) {
      let frontier = [grid.index(x, y)];
      const seen = new Set(frontier);
      let budget = CREATURE_FIRE_FLOOD_CAP;
      while (frontier.length > 0 && budget > 0) {
        const nextRing: number[] = [];
        for (const idx of frontier) {
          const cxx = idx % grid.width;
          const cyy = (idx / grid.width) | 0;
          for (const [dx, dy] of NEIGHBORS_8) {
            const nx = cxx + dx;
            const ny = cyy + dy;
            if (!grid.inBounds(nx, ny)) continue;
            const ni = grid.index(nx, ny);
            if (seen.has(ni)) continue;
            const nDef = MATERIALS[grid.material[ni] as MaterialId];
            if (nDef.category !== MaterialCategory.Creature || !nDef.flammable) continue;
            seen.add(ni);
            grid.set(nx, ny, MaterialId.Fire, nDef.burnTicks);
            grid.processed[ni] = 1;
            nextRing.push(ni);
            if (--budget <= 0) break;
          }
          if (budget <= 0) break;
        }
        frontier = nextRing;
      }
    }
  }

  /**
   * Any explosive material (Pólvora, C4, Gás) detonates instead of just
   * smouldering. A detonation is deliberately *local*: it consumes only a
   * small pocket around the cell that went off (that cell plus its touching
   * explosive neighbours — see `collectExplosivePocket`, ~1-9 cells), and
   * every explosive cell touching that pocket gets a short lit fuse
   * (`meta`, a tick countdown — see `stepFuse`) so it detonates a few ticks
   * later in turn. That's what makes a big solid block of Pólvora/C4 rip
   * itself apart as a visible chain reaction eating outward ring by ring
   * over roughly a second, instead of the whole connected mass vanishing in
   * a single frame.
   *
   * The blast itself is an *impulse*, applied once, right now: over the disc
   * of radius `BLAST_BASE_RADIUS·√power` around the epicentre, every loose
   * cell (all Powder/Liquid, plus the fragile solids near the core, plus
   * sturdy Pedra right at the core) is lifted straight off the grid and
   * handed to the `Debris` particle system with an outward velocity that's
   * strongest at the centre and fades to nothing at the rim, plus an upward
   * bias and some angular jitter. Those chunks arc out under gravity and
   * pile back onto the grid where they land (see `advanceDebris`), which is
   * what actually digs the crater and throws a rim up around it. Flammable
   * cells in range instead catch fire (heat of the blast), and a *separate*
   * explosive pile in range gets its own lit fuse on a slightly longer
   * delay (CHAIN_DELAY_SEPARATE) so a scattered minefield ripples rather
   * than going off all at once.
   *
   * The fuse lives in `meta` rather than a separate queue keyed by position
   * specifically because Pólvora is Powder — it can fall. A queue holding
   * onto the (x, y) it was lit at would lose track of the charge the moment
   * gravity (or another blast) moved it, and silently never go off. `meta`
   * travels with the cell through every `swap()`, so the countdown always
   * keeps up with wherever the charge actually ends up (C4 never falls, but
   * shares the same mechanism for consistency).
   */
export function detonate(grid: SimGrid, cx: number, cy: number): void {
    const pocket = grid.collectExplosivePocket(cx, cy);

    // Only this small pocket is consumed directly — the rest of a connected
    // pile keeps its shape and detonates in turn via the fuses lit just
    // below, so a big block visibly chain-reacts instead of vanishing.
    let ex = 0;
    let ey = 0;
    for (const [x, y] of pocket) {
      grid.set(x, y, MaterialId.Empty);
      grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      ex += x;
      ey += y;
    }
    ex /= pocket.length;
    ey /= pocket.length;

    // Flood the connected body of explosive this pocket is part of and light
    // every cell's fuse now, timed by distance so the detonation front
    // sweeps across the whole charge in a few frames. Gás is never fused (it
    // flashes over instantly), only ever ignited directly. Already-fused
    // cells stop the flood, so a second detonation into the same body is
    // cheap.
    grid.floodFuseConnected(pocket);

    const power = 1 + (pocket.length - 1) * CLUSTER_BONUS_PER_CHARGE;
    const radius = BLAST_BASE_RADIUS * Math.sqrt(power);
    grid.applyBlastImpulse(cx, cy, ex, ey, radius);

    // Decorative heat-sparks, radiating from the epicentre.
    grid.spawnShrapnelBurst(ex, ey, Math.min(SHRAPNEL_VISUAL_CAP, Math.max(4, Math.round(SHRAPNEL_PER_POP * power))));
  }

  /**
   * The physical shove of one detonation: walks every grid cell inside the
   * blast disc and, by distance-from-centre falloff, either throws it
   * (converts it to a `Debris` chunk with an outward + upward velocity),
   * ignites it, or — for a *separate* explosive pile — lights its fuse.
   * `cx`/`cy` is the cell that actually went off (used as the radial origin
   * so the push always points genuinely away from the charge); `ex`/`ey` is
   * the pocket's centre of mass (used only to keep the scan box tight).
   */
export function applyBlastImpulse(grid: SimGrid, cx: number, cy: number, ex: number, ey: number, radius: number): void {
    const r = Math.ceil(radius);
    const minX = Math.max(0, Math.floor(ex) - r);
    const maxX = Math.min(grid.width - 1, Math.ceil(ex) + r);
    const minY = Math.max(0, Math.floor(ey) - r);
    const maxY = Math.min(grid.height - 1, Math.ceil(ey) + r);
    const shatterR = radius * BLAST_SHATTER_FRAC;
    const pulverizeR = radius * BLAST_PULVERIZE_FRAC;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const rx = x - cx;
        const ry = y - cy;
        const dist = Math.hypot(rx, ry);
        if (dist > radius) continue;
        const i = grid.index(x, y);
        const id = grid.material[i] as MaterialId;
        if (id === MaterialId.Empty) continue;

        const falloff = 1 - dist / radius; // 1 at the centre, 0 at the rim
        const def = MATERIALS[id];

        // A separate explosive pile: fuse it (longer delay than the
        // connected chain) rather than throwing or burning it.
        if (grid.isFusableExplosive(id) && grid.meta[i] === 0) {
          if (Math.random() < 0.35 + 0.6 * falloff) {
            grid.meta[i] = CHAIN_DELAY_SEPARATE + Math.floor(Math.random() * 4);
          }
          continue;
        }

        // Flammable, non-explosive: the heat of the blast lights it.
        if (def.flammable && id !== MaterialId.Fire) {
          if (Math.random() < falloff * def.ignitionChance * BLAST_IGNITE_FACTOR) {
            grid.igniteAt(x, y);
            continue;
          }
        }

        // Decide whether this cell gets torn loose and thrown.
        const cat = def.category;
        const loose = cat === MaterialCategory.Powder || cat === MaterialCategory.Liquid || cat === MaterialCategory.Gas;
        const fragileSolid =
          id === MaterialId.Wood || id === MaterialId.Plant || id === MaterialId.Sprout ||
          id === MaterialId.Flor || id === MaterialId.Seed || id === MaterialId.Ice ||
          id === MaterialId.Glass || id === MaterialId.Salt;
        let throwIt = false;
        if (loose) throwIt = true;
        else if (fragileSolid && dist <= shatterR) throwIt = true;
        else if (id === MaterialId.Stone && dist <= pulverizeR && Math.random() < 0.6 * falloff) throwIt = true;

        if (!throwIt) continue;
        if (grid.debris.length >= DEBRIS_CAP) continue;

        // Glass throws sand grains, not intact panes.
        const chunkId = id === MaterialId.Glass ? MaterialId.Sand : id;
        const chunkMeta = id === MaterialId.Glass ? 0 : grid.meta[i];

        // Radial direction, away from the charge — straight up for a cell
        // sitting exactly on the epicentre.
        let ang: number;
        if (rx === 0 && ry === 0) ang = -Math.PI / 2;
        else ang = Math.atan2(ry, rx);
        ang += (Math.random() - 0.5) * BLAST_ANGLE_JITTER;
        const speed = BLAST_LAUNCH_SPEED * falloff * (0.55 + Math.random() * 0.7);

        grid.set(x, y, MaterialId.Empty);
        grid.debris.push({
          x: x + 0.5,
          y: y + 0.5,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - BLAST_UPWARD_BIAS * falloff,
          material: chunkId,
          meta: chunkMeta,
          life: DEBRIS_MAX_LIFE,
        });
      }
    }
  }

  /** Pólvora and C4 detonate on a lit fuse; Gás doesn't (it flashes over the instant it catches). */
export function isFusableExplosive(grid: SimGrid, id: MaterialId): boolean {
    const def = MATERIALS[id];
    return def.explosive && def.category !== MaterialCategory.Gas;
  }

  /**
   * The small local group a single detonation consumes: the cell that went
   * off, plus any explosive cells directly touching it (8-directional). A
   * big connected mass is *not* collected whole here — it comes apart as a
   * chain reaction, one pocket per pop, via the fuses `detonate` lights.
   */
export function collectExplosivePocket(grid: SimGrid, cx: number, cy: number): [number, number][] {
    const cells: [number, number][] = [[cx, cy]];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      // Gás isn't pulled into the pocket — it catches from the blast
      // and detonates in its own right instead of being quietly consumed.
      if (grid.inBounds(nx, ny) && grid.isFusableExplosive(grid.get(nx, ny))) cells.push([nx, ny]);
    }
    return cells;
  }

  /** Spends one pop of this tick's DETONATIONS_PER_TICK_CAP budget, if there's any left. */
export function canDetonate(grid: SimGrid): boolean {
    if (grid.detonationBudget <= 0) return false;
    grid.detonationBudget--;
    return true;
  }

  /** A lit fuse (meta > 0) on any explosive cell (Pólvora, C4) counts down once per tick and detonates when it reaches 0 — see `detonate`. Past the per-tick pop budget it just holds at zero and retries next tick, rather than force through and stall the frame. */
export function stepFuse(grid: SimGrid, x: number, y: number, i: number): void {
    grid.meta[i]--;
    if (grid.meta[i] <= 0) {
      if (grid.canDetonate()) grid.detonate(x, y);
      else grid.meta[i] = 1;
    }
  }

  /**
   * Breadth-first flood over the connected body of fusable explosive that
   * `seeds` belongs to, lighting a fuse on every still-inert cell timed by
   * how many cells out it is (CHAIN_RINGS_PER_TICK) — so the whole charge
   * detonates in one fast crack that sweeps across it in a few frames
   * rather than a cell-by-cell smoulder. Bounded by CHAIN_FLOOD_CAP; cells
   * past the budget are simply left for the next detonation's own flood to
   * pick up. Already-fused cells end a branch, so re-flooding the same body
   * is cheap.
   */
export function floodFuseConnected(grid: SimGrid, seeds: readonly [number, number][]): void {
    let frontier: number[] = [];
    for (const [x, y] of seeds) frontier.push(grid.index(x, y));
    const seen = new Set<number>(frontier);
    let ring = 0;
    let budget = CHAIN_FLOOD_CAP;
    while (frontier.length > 0 && budget > 0) {
      const nextRing: number[] = [];
      const delay = CHAIN_BASE_DELAY + Math.floor(ring / CHAIN_RINGS_PER_TICK);
      for (const idx of frontier) {
        const x = idx % grid.width;
        const y = (idx / grid.width) | 0;
        for (const [dx, dy] of NEIGHBORS_8) {
          const nx = x + dx;
          const ny = y + dy;
          if (!grid.inBounds(nx, ny)) continue;
          const ni = grid.index(nx, ny);
          if (seen.has(ni)) continue;
          if (!grid.isFusableExplosive(grid.material[ni] as MaterialId)) continue;
          seen.add(ni);
          if (grid.meta[ni] === 0) {
            grid.meta[ni] = Math.min(250, delay + Math.floor(Math.random() * 2));
            budget--;
          }
          nextRing.push(ni);
          if (budget <= 0) break;
        }
        if (budget <= 0) break;
      }
      frontier = nextRing;
      ring++;
    }
  }

  /**
   * Launches a burst of decorative heat-sparks radiating from a detonation's
   * epicentre, each at its own randomized angle, speed and lifespan so the
   * burst scatters and fades unevenly rather than reading as a uniform ring.
   * Purely cosmetic — the actual force is `Debris` (see `applyBlastImpulse`).
   */
export function spawnShrapnelBurst(grid: SimGrid, ex: number, ey: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = SHRAPNEL_SPEED_MIN + Math.random() * (SHRAPNEL_SPEED_MAX - SHRAPNEL_SPEED_MIN);
      const life = SHRAPNEL_LIFE_MIN + Math.floor(Math.random() * (SHRAPNEL_LIFE_MAX - SHRAPNEL_LIFE_MIN));
      grid.shrapnel.push({
        x: ex + 0.5,
        y: ey + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
      });
    }
  }

  /**
   * Advances every Shrapnel particle one tick. No gravity — it's a
   * decorative spark, not a falling object, so it flies outward at
   * constant speed in a straight line instead of curving into a fall. It
   * shatters Glass on contact (a nice touch worth keeping, and consumes
   * the spark on the spot), but hitting anything else solid just stops it
   * dead where it is rather than deleting it outright — either way, `life`
   * ticks down every tick regardless of whether it's still moving, and the
   * renderer fades its opacity down with it (see PixiStage), so a spark
   * always reads as gradually dying out instead of an abrupt pop, whether
   * that's mid-flight or after coming to rest.
   */
export function advanceShrapnel(grid: SimGrid): void {
    if (grid.shrapnel.length === 0) return;
    const next: Shrapnel[] = [];
    for (const s of grid.shrapnel) {
      s.life--;
      if (s.life <= 0) continue;

      const nx = s.x + s.vx;
      const ny = s.y + s.vy;
      const gx = Math.round(nx);
      const gy = Math.round(ny);
      if (grid.inBounds(gx, gy)) {
        const id = grid.get(gx, gy);
        if (id === MaterialId.Glass) {
          grid.shatterGlass(gx, gy);
          continue;
        }
        if (id === MaterialId.Empty) {
          s.x = nx;
          s.y = ny;
        }
        // Anything else solid: stays put right where it is, still fading
        // out over its remaining life instead of vanishing on contact.
      }
      next.push(s);
    }
    grid.shrapnel = next;
  }

  /**
   * Vidro is fragile, but not *instantly* fragile: each violent impact
   * (Shrapnel, Eletricidade) only cracks the cell it actually reaches —
   * tracked in `meta` — and it takes GLASS_SHATTER_HITS of them before that
   * one cell finally gives way into Areia. A blast therefore pits the face
   * of a pane pointed at it over a moment, instead of the whole sheet
   * flashing to sand the instant the first spark lands. Cracks never spread
   * to neighbouring glass on their own.
   */
export function shatterGlass(grid: SimGrid, x: number, y: number): void {
    const i = grid.index(x, y);
    if (grid.meta[i] + 1 >= GLASS_SHATTER_HITS) {
      grid.set(x, y, MaterialId.Sand);
    } else {
      grid.meta[i]++;
      grid.wake(x, y);
    }
  }

  /**
   * Flies every in-flight `Debris` chunk one tick: gravity, drag, then a
   * sub-stepped sweep along its velocity so a fast chunk can't tunnel
   * through a thin wall. A chunk is deposited back onto the grid — as its
   * own material — when it slows below DEBRIS_SETTLE_SPEED, when it runs
   * into something still standing, when it leaves the play area through the
   * floor/ceiling, or when its failsafe life runs out. Landing in Água or
   * Lava just splashes it in (deposited on top); landing on Fogo torches a
   * flammable chunk instead of stacking it.
   */
export function advanceDebris(grid: SimGrid): void {
    if (grid.debris.length === 0) return;
    const next: Debris[] = [];
    for (const d of grid.debris) {
      d.life--;
      if (grid.gravityEnabled) d.vy += DEBRIS_GRAVITY;
      d.vx *= DEBRIS_DRAG;
      d.vy *= DEBRIS_DRAG;

      const speed = Math.hypot(d.vx, d.vy);
      if (d.life <= 0 || speed < DEBRIS_SETTLE_SPEED) {
        grid.depositDebris(d);
        continue;
      }

      const steps = Math.max(1, Math.ceil(speed));
      const sx = d.vx / steps;
      const sy = d.vy / steps;
      let landed = false;
      for (let s = 0; s < steps; s++) {
        const nx = d.x + sx;
        const ny = d.y + sy;
        const gx = Math.round(nx);
        const gy = Math.round(ny);
        if (gx < 0 || gx >= grid.width) {
          // Flew off the side — just deposit where it last was.
          grid.depositDebris(d);
          landed = true;
          break;
        }
        if (gy < 0) {
          d.x = nx;
          d.y = 0;
          d.vy = Math.abs(d.vy) * 0.3; // clip off the ceiling
          continue;
        }
        if (gy >= grid.height) {
          grid.depositDebris(d);
          landed = true;
          break;
        }
        const hitId = grid.material[grid.index(gx, gy)] as MaterialId;
        if (hitId === MaterialId.Empty) {
          d.x = nx;
          d.y = ny;
          continue;
        }
        if (hitId === MaterialId.Fire && MATERIALS[d.material].flammable) {
          grid.igniteAt(Math.round(d.x), Math.round(d.y));
          landed = true;
          break;
        }
        if (hitId === MaterialId.Glass) {
          grid.shatterGlass(gx, gy);
          // keep going — it punched through
          d.x = nx;
          d.y = ny;
          continue;
        }
        // Ran into something standing — settle against it.
        grid.depositDebris(d);
        landed = true;
        break;
      }
      if (!landed) next.push(d);
    }
    grid.debris = next;
  }

  /**
   * Puts one chunk of debris back on the grid as its own material. Prefers
   * the exact cell it came to rest in; failing that (already filled), spirals
   * outward for the nearest Empty cell, then as a last resort stacks
   * straight up. A chunk that finds nowhere at all is simply lost — rare,
   * and better than corrupting a settled cell.
   */
export function depositDebris(grid: SimGrid, d: Debris): void {
    const place = (x: number, y: number): boolean => {
      if (!grid.inBounds(x, y) || grid.material[grid.index(x, y)] !== MaterialId.Empty) return false;
      grid.set(x, y, d.material, d.meta);
      return true;
    };
    const gx = Math.round(d.x);
    const gy = Math.round(d.y);
    if (place(gx, gy)) return;
    for (let ring = 1; ring <= 4; ring++) {
      for (let oy = -ring; oy <= ring; oy++) {
        for (let ox = -ring; ox <= ring; ox++) {
          if (Math.abs(ox) !== ring && Math.abs(oy) !== ring) continue;
          if (place(gx + ox, gy + oy)) return;
        }
      }
    }
    for (let up = 1; up <= 8; up++) if (place(gx, gy - up)) return;
  }

  /** Ages out every active Flash and combat-hit marker — see the struct comment. */
export function advanceFlashes(grid: SimGrid): void {
    if (grid.flashes.length > 0) {
      const next: Flash[] = [];
      for (const f of grid.flashes) { f.life--; if (f.life > 0) next.push(f); }
      grid.flashes = next;
    }
    if (grid.hits.length > 0) {
      const next: Flash[] = [];
      for (const f of grid.hits) { f.life--; if (f.life > 0) next.push(f); }
      grid.hits = next;
    }
  }
