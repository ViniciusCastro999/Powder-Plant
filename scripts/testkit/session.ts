/**
 * Long, player-like headless sessions for SimGrid tests.
 *
 * Three specific mistakes from ad-hoc test scripts prompted this file:
 *
 * 1. "Did it work" checked after a few hundred ticks or a 30-60s live
 *    session. A real player leaves the game running for minutes while
 *    slow things (a crop maturing, a Cogumelo cluster growing, a Lenhador
 *    walking cross-map to it) actually happen. Short windows read as "the
 *    feature doesn't work" when it just hadn't had time to yet.
 *
 * 2. Tracking "the same" pip tick to tick by nearest-position-match to the
 *    previous frame. With more than one pip of the same trade anywhere
 *    nearby, this silently latches onto the wrong one the moment two paths
 *    cross, producing a fake "teleport" or "flew 40 cells in one tick" that
 *    was actually two different, perfectly normal pips. Prefer the
 *    aggregate/engine-signal helpers below over reimplementing identity
 *    tracking in a test script.
 *
 * 3. A long session with no food source starves every pip to death
 *    (`CREATURE_STARVE_DEATH_CHANCE`) well before the behavior under test
 *    ever gets to run, which reads as "the pip never got there" instead of
 *    "the pip died of hunger 4000 ticks ago". `keepFolkFed` makes that a
 *    deliberate, visible choice instead of an accidental confound.
 */
import type { SimGrid } from "../../src/sim/grid";
import { FOLK_IDS } from "../../src/sim/grid";
import { MaterialId } from "../../src/sim/types";
import { CREATURE_FED_MAX, creatureFacing, creatureFed, creatureTimer, packCreature } from "../../src/sim/creatureMeta";

/**
 * Ticks per simulated minute of play, using a deliberately conservative
 * frame rate. `grid.step()` runs once per rendered frame (see
 * `Canvas.svelte`), not on a fixed clock — a real session runs anywhere
 * from ~15fps (a busy scene under swiftshader, observed this session) to
 * 60fps. Sizing "N minutes of play" off the low end means a test session
 * is never *shorter* than what a player would actually sit through, only
 * possibly longer (which just means more chances for the behavior to show
 * up, never fewer).
 */
export const TICKS_PER_MINUTE = 30 * 60;

/** All Folk material ids, Skeleton included — the full cast a session-level check usually cares about. */
export const FOLK_AND_SKELETON: readonly MaterialId[] = [...FOLK_IDS, MaterialId.Skeleton];

export interface FolkSnapshot {
  i: number;
  x: number;
  y: number;
  material: MaterialId;
  stuckTicks: number;
  hp: number;
  fed: number;
}

/** Every Folk/Skeleton cell right now — the basis for every other helper here. Cheap enough to call every sample tick on any real test grid size. */
export function scanFolk(grid: SimGrid, materials: readonly MaterialId[] = FOLK_AND_SKELETON): FolkSnapshot[] {
  const out: FolkSnapshot[] = [];
  for (let i = 0; i < grid.material.length; i++) {
    const m = grid.material[i] as MaterialId;
    if (!materials.includes(m)) continue;
    out.push({
      i, x: i % grid.width, y: Math.floor(i / grid.width), material: m,
      stuckTicks: grid.stuckTicks[i], hp: grid.hp[i], fed: creatureFed(grid.meta[i]),
    });
  }
  return out;
}

/**
 * Forces every current Folk cell's hunger to full. Call this once per tick
 * in a long session that isn't specifically testing hunger/food, so
 * starvation can never be the reason a pip stops acting. This is a
 * deliberate override, not a silent default — always pass it explicitly
 * (see `runSession`'s `keepFed` option) so a reader can tell a test chose
 * to rule hunger out.
 */
export function keepFolkFed(grid: SimGrid, materials: readonly MaterialId[] = FOLK_AND_SKELETON): void {
  for (let i = 0; i < grid.material.length; i++) {
    if (!materials.includes(grid.material[i] as MaterialId)) continue;
    const raw = grid.meta[i];
    grid.meta[i] = packCreature(creatureFacing(raw), creatureTimer(raw), CREATURE_FED_MAX);
  }
}

/**
 * The engine's own "is this actually stuck" signal — `stuckTicks` climbing
 * toward `FOLK_GIVEUP_ZONE` (100) means real repeated failure, not just
 * "hasn't moved this sample" (a pip mid-harvest legitimately stands still
 * for a while; that's not stuck). Prefer this over inferring "stuck" from
 * position deltas, which is exactly the ambiguous-identity trap described
 * at the top of this file.
 */
export function findStuckFolk(grid: SimGrid, threshold = 90): FolkSnapshot[] {
  return scanFolk(grid).filter((f) => f.stuckTicks >= threshold);
}

export interface SessionOptions {
  /** Total ticks to run. Use `TICKS_PER_MINUTE * minutes` to think in player time. */
  ticks: number;
  /** How often (in ticks) to call `onSample`. */
  sampleEvery?: number;
  /** Force every Folk cell's hunger to full periodically — see `keepFolkFed`. Default true: most feature tests aren't about hunger, and starving to death mid-test is a common, misleading confound. Set false when hunger/food IS the thing under test. */
  keepFed?: boolean;
  /** How often (in ticks) to refresh hunger when `keepFed` is on. Fed only decays on average once every ~320 ticks (`FOLK_HUNGER_INTERVAL`), so refreshing every tick is a needless full-grid scan on every single step — the same "prohibitively slow at scale" trap a large grid + many ticks + per-tick instrumentation fell into before. Default 50 leaves a wide safety margin at a fraction of the cost. */
  keepFedEvery?: number;
  /** Called every `sampleEvery` ticks with the current tick and a fresh Folk/Skeleton scan. */
  onSample?: (tick: number, folk: FolkSnapshot[]) => void;
}

export interface SessionResult {
  /** Every sample taken, in order. */
  samples: { tick: number; folk: FolkSnapshot[] }[];
  /** Any Folk cell seen stuck (see `findStuckFolk`) at any sample point, tagged with when. */
  stuckSightings: { tick: number; snapshot: FolkSnapshot }[];
}

/**
 * Runs a long, player-scale session and collects samples + stuck sightings
 * as it goes, instead of a bare `for` loop with ad-hoc bookkeeping rebuilt
 * per script. Keep `ticks` generous — see `TICKS_PER_MINUTE` — real
 * interactions (growth, spread, a pip crossing the map) need real time.
 */
export function runSession(grid: SimGrid, opts: SessionOptions): SessionResult {
  const { ticks, sampleEvery = 100, keepFed = true, keepFedEvery = 50, onSample } = opts;
  const result: SessionResult = { samples: [], stuckSightings: [] };
  for (let t = 0; t < ticks; t++) {
    if (keepFed && t % keepFedEvery === 0) keepFolkFed(grid);
    grid.step();
    if (t % sampleEvery !== 0) continue;
    const folk = scanFolk(grid);
    result.samples.push({ tick: t, folk });
    for (const f of folk) if (f.stuckTicks >= 90) result.stuckSightings.push({ tick: t, snapshot: f });
    onSample?.(t, folk);
  }
  return result;
}
