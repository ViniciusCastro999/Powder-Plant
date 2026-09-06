import { MaterialCategory, MaterialId } from "./types";
import { MATERIALS } from "./materials";
import { NEUTRAL_TEMP, EXTREME_COLD, EXTREME_HOT, COLD_1, COLD_2, COLD_3, isProsperous } from "./temperature";
import { rleEncode, rleDecode, SCHEMA_VERSION, type MapSnapshot } from "./storage";

/**
 * Per-tick chance a Powder/Liquid cell even attempts its falling-sand
 * movement check at all (straight down, then diagonals, then — for
 * Liquid — sideways) — 1 is the original full-speed gravity, 0.5 makes
 * everything fall/flow at roughly half speed on average, since this is a
 * discrete cellular automaton (always exactly 1 cell per successful
 * attempt) rather than a continuous physics sim with an actual
 * acceleration value to halve.
 */
const GRAVITY_STRENGTH = 0.5;
const GROWTH_CHANCE = 0.01;
const GERMINATE_CHANCE = 0.05;
const MUD_FORM_CHANCE = 0.05;
const ACID_START_CHARGES = 5;
/** Safety net only, not a visible countdown — see the Pulse comment below. */
const PULSE_MAX_STEPS = 4000;
const SPROUT_BUDGET_MIN = 16;
const SPROUT_BUDGET_MAX = 34;
/**
 * A Sprout's `meta` byte normally just holds its remaining growth budget
 * (see stepSprout), but budgets never exceed SPROUT_BUDGET_MAX — comfortably
 * under 128 — so the top bit is free to double as SPROUT_REGROWN_FLAG,
 * marking a cell (and everything grown from it afterward) as having
 * already spent its one prosperous catch-up bonus. Without a permanent
 * marker like this, a budget-exhausted cell reads identically whether it
 * matured normally or already got its bonus, and the bonus could
 * re-trigger every time the climate cycles back into the prosperous band —
 * exactly the "leaving and re-entering the season makes plants pile up
 * endlessly" bug this flag exists to prevent.
 */
const SPROUT_BUDGET_MASK = 0x7f;
const SPROUT_REGROWN_FLAG = 0x80;
/** Per-tick chance a fully-grown (budget-exhausted), not-yet-regrown Sprout gains a one-time bonus growth budget while sitting in the prosperous climate — see stepSprout. */
const SPROUT_PROSPEROUS_REGROWTH_CHANCE = 0.004;
/**
 * Size of that one-time catch-up bonus. Kept deliberately small: a Sprout's
 * budget is cloned (not split) at every branch point it spawns — the same
 * mechanic that lets an ordinary 16-34 germination budget produce a bushy
 * structure with far more than 34 total cells — so even a modest bonus can
 * balloon into a lot of extra growth once branching compounds it.
 */
const SPROUT_REGROWTH_BONUS = 3;
/** Divides the density gap when sinking through a liquid; smaller = faster sinking per point of density. */
const SINK_DENSITY_SCALE = 8;
/** Ticks a Powder/Liquid cell must fail to move before it's put to sleep and skipped. */
const SLEEP_THRESHOLD = 4;
/** Fire only spreads/burns/flickers on every Nth tick — an easy global slow-down independent of each material's own burnTicks. 1 = full speed. */
const FIRE_TICK_INTERVAL = 1;
/** Extra fuel a Fire cell loses on a tick where it's boxed in on all 3 upward cells — it smothers instead of sitting fully lit against a wall for its whole lifetime. */
const FIRE_SMOTHER_DECAY = 4;
/** Chance an active Fire cell leaps 2 cells instead of 1 on its flicker move, so a burst of flame scatters wider before it burns out. */
const FIRE_LEAP_CHANCE = 0.22;
/** Plain Metal touching Water has this per-tick chance to rust away into one Dirt particle. */
const RUST_CHANCE = 0.0012;
/** Fully salty Water rusts touching Metal this many times faster than fresh Water. */
const RUST_SALT_MULTIPLIER = 6;
/** Baseline chance a charge actually conducts through a touching Water cell; salinity raises it toward 1. Metal (and everything else conductive) always conducts. */
const WATER_BASE_CONDUCT_CHANCE = 0.55;
/** Ticks a free-falling charge survives with nothing touching it — see the Pulse comment below. Short, so a lone spark fizzles out almost immediately. */
const PULSE_AIR_LIFE = 6;
/** Extra ticks of life a charge regains (capped at PULSE_AIR_LIFE) on a tick another charge is touching it. Deliberately <= the 1/tick decay, so touching can only pause dissipation, never grow it — a dense cluster's total life can't climb back up, only hold steady at best, so it still visibly thins out instead of reading as "more electricity" than a lone spark. */
const PULSE_TOUCH_BONUS = 1;
/** Chance a free-falling charge nudges one column sideways instead of dropping straight down, per tick. */
const PULSE_DRIFT_CHANCE = 0.22;
/** Chance a free-falling charge covers 2 rows instead of 1 this tick, so it moves a bit faster without ballooning how far it can spread before it dissipates. */
const PULSE_LEAP_CHANCE = 0.15;
/** Per-tick chance a Metal cell touching Lava melts into Lava — fastest of the three. */
const LAVA_MELT_METAL = 0.02;
/** Per-tick chance a Sand cell touching Lava melts into Lava — middle speed. */
const LAVA_MELT_SAND = 0.008;
/** Per-tick chance a Stone cell touching Lava melts into Lava — slowest. */
const LAVA_MELT_STONE = 0.0025;
/** Per-tick chance a Gelo cell freezes a touching fresh-water neighbor into more Gelo. */
const ICE_FREEZE_CHANCE = 0.02;
/** Per-tick chance a Gelo cell touching Fogo/Lava melts back into Água. */
const ICE_MELT_CHANCE = 0.18;
/**
 * Purely a visual flourish now — see BlastWave for what actually shoves
 * material around. Shrapnel is evenly spread around the full circle (plus
 * a little angle jitter so it doesn't read as a perfect starburst), still
 * shatters Glass on contact, but no longer teleports whatever else it hits
 * to a final resting spot in one instant jump — that was the whole problem
 * with the old design, where Shrapnel itself was also responsible for
 * pushing material.
 */
/** Per-tick chance a Gás cell that hasn't been ignited disperses into the air and vanishes — emitted as a puff like Fogo, and gone within about a second if nothing sets it off. */
const GAS_DISSIPATE_CHANCE = 0.015;
/** Impacts (Shrapnel, Eletricidade) a Vidro cell absorbs as cracks before the next one finally shatters it into Areia — so a blast pits the surface it faces instead of shattering the whole pane in a single frame. */
const GLASS_SHATTER_HITS = 3;
/** Each particle's starting speed is randomized in this range — a spread of fast and slow debris reads as a real blast instead of a uniform ring all moving in lockstep. */
const SHRAPNEL_SPEED_MIN = 0.35;
const SHRAPNEL_SPEED_MAX = 0.95;
/** Ticks a Shrapnel particle survives before it's fully faded out — randomized per-particle so a burst doesn't blink out all at once. No gravity: it's a purely decorative spark, not a falling object, so it flies outward in a straight line and just dies out over time instead of curving into a fall. */
const SHRAPNEL_LIFE_MIN = 22;
const SHRAPNEL_LIFE_MAX = 42;
/** Hard ceiling on how many decorative Shrapnel particles a single blast spawns — a rendering/performance budget, not a limit on the blast's actual force (see CLUSTER_BONUS_PER_CHARGE, which is uncapped). */
const SHRAPNEL_VISUAL_CAP = 400;
/** Ticks a detonation's initial bright Flash lasts before fully fading — a couple of frames, just long enough to read as a flash rather than a single-frame strobe. */
const FLASH_LIFE = 4;
/**
 * How many cells a single blast-wave touch nudges a Powder/Liquid grain —
 * deliberately the same one-cell-per-tick movement everything else on the
 * grid gets, so a blast nudges material instead of making it visibly jump
 * several cells in one frame. What lets a grain keep climbing against
 * gravity for more than one frame is getting touched again on the *next*
 * tick too (the wavefront still sweeping past it, or the synchronous
 * first-ring expansion in `detonate` beating gravity to the very first
 * touch), not a bigger single push.
 */
const BLAST_LAUNCH_DISTANCE = 1;
/**
 * A BlastWave carries an `energy` value that starts high at the shape that
 * detonated and decays as it travels — energy is máxima no centro and
 * diminishes gradually with distance, exactly like a real shockwave, and
 * every effect the wave has (pushing a grain, igniting something
 * flammable) is gated by a roll against the current energy, so the effect
 * fades out smoothly rather than cutting off at a hard radius. Two
 * separate decay rates apply every layer the wave travels:
 *
 *  - ENERGY_DISTANCE_DECAY, unconditionally, purely from distance — slow
 *    enough that a big blast's high starting energy still reaches most of
 *    a reasonably-sized map before fizzling below ENERGY_EPSILON, while a
 *    lone charge's low starting energy dies out within a much shorter
 *    reach.
 *  - ENERGY_OBSTACLE_DECAY, an extra one-time cut, whenever the wave passes
 *    through a Solid (or otherwise immovable) cell — a wall genuinely
 *    shields whatever is standing behind it, instead of the wave routing
 *    around it via diagonals at full, undiminished strength.
 *
 * There's no separate fixed reach cap tied to blast size the way there
 * used to be: a wave simply keeps expanding for as long as it still has
 * energy above ENERGY_EPSILON, so how far a blast reaches falls directly
 * out of how much energy it started with, exactly like a real explosion.
 */
const ENERGY_DISTANCE_DECAY = 0.985;
const ENERGY_OBSTACLE_DECAY = 0.35;
/** Below this energy a path stops propagating — a natural fizzle instead of an arbitrary layer-count cutoff. */
const ENERGY_EPSILON = 0.015;
/**
 * Scales how readily the wave itself ignites a flammable cell it reaches
 * (Madeira, Óleo, and — since they're flammable too — Pólvora/C4, chain-
 * detonating them) on top of that material's own `ignitionChance`, gated
 * by the wave's current energy there. This is what makes "recebe calor
 * intenso, pode entrar em combustão" a direct effect of the shockwave
 * itself, not something that only ever happens via a separately-spreading
 * Fogo touching it afterward — and, being wave-driven, it's already
 * naturally blocked by ENERGY_OBSTACLE_DECAY: an explosive shielded behind
 * a thick wall doesn't get chain-detonated just for being nearby.
 *
 * `ignitionChance` itself is calibrated for *repeated* per-tick rolls
 * while continuously touching an ongoing Fogo (e.g. Madeira's 0.03 reads as
 * "3% per tick, tick after tick, for as long as the fire keeps burning
 * next to it"), but the wave only ever gets one single roll at each cell
 * it reaches. Multiplying by the raw ignitionChance alone would make that
 * one shot almost always fail — this factor scales it back up so a cell
 * sitting right at the high-energy heart of a blast reads as "intense
 * heat, very likely to ignite" the way the spec calls for, while a faint,
 * low-energy touch far from the epicenter still only has a small chance.
 */
const BLAST_IGNITE_FACTOR = 25;
/** How much extra blast scale (decorative Shrapnel count, starting energy) each extra cell in the small local *pocket* a single detonation consumes adds — see `detonate`/`collectExplosivePocket`. The pocket is only ~1-9 cells, so this stays modest; a big pile's force comes from a long chain of these small pops, not one huge blast. */
const CLUSTER_BONUS_PER_CHARGE = 0.12;
/** Ticks an explosive cell touching a fresh detonation waits before going off itself. This is what turns a solid painted block of Pólvora/C4 into a chain reaction that eats across it ring by ring over many frames, instead of the whole connected mass detonating in one instant. */
const CHAIN_DELAY_CONNECTED = 2;
/** Ticks a *separate* Pólvora/C4 pile (one the blast wave reached across a gap, not touching the charge that went off) waits before detonating — a scattered minefield ripples outward over several frames instead of flashing to nothing at once. */
const CHAIN_DELAY_SEPARATE = 5;
/** Decorative Shrapnel sparks spawned per individual detonation, scaled by its small pocket size. Low on purpose: a big pile now produces a long chain of these small pops rather than one massive burst. */
const SHRAPNEL_PER_POP = 7;
/** Fraction of a Vida brush stroke that actually gets painted — see the comment on VIDA in paintCell. */
const VIDA_PAINT_DENSITY = 0.4;
/** Chance a spreading Planta blooms into a Flor cell instead of plain leaf, checked only in the prosperous band. */
const FLOWER_BLOOM_CHANCE = 0.25;
/** Standalone per-tick chance a Planta cell blossoms directly into a touching empty cell while the climate is prosperous, even with no Água nearby to trigger its usual water-driven spread — a mature, already-settled patch still gets to flower once conditions are ideal. */
const PLANT_PROSPEROUS_BLOOM_CHANCE = 0.006;
/**
 * How many weighted hot/cold pixels it takes to fully saturate temperature
 * to EXTREME_HOT/EXTREME_COLD — an absolute count, deliberately *not* a
 * ratio against how much else is on the grid. A ratio meant a single
 * Fogo pixel on an otherwise-empty canvas registered as "100% of the
 * scene is on fire" and sent the reading rocketing off — a real bug, not
 * a balance nitpick. Counting absolute pixels instead means temperature
 * is something the player builds up on purpose, by actually placing
 * enough Fogo/Lava or Gelo, and Fogo and Gelo pull in opposite
 * directions on the same scale — burying a fire under ice cancels it out
 * rather than the two fighting on separate axes. Reaching either
 * extreme takes a real, deliberate amount of material; one stray pixel
 * barely nudges the needle.
 */
const HOT_PIXELS_FOR_MAX = 2200;
const COLD_PIXELS_FOR_MAX = 1600;
/** How fast the displayed temperature approaches its instantaneous target each tick — a fraction, not a jump, so it reads as thermal mass warming/cooling rather than snapping. */
const TEMP_LERP_RATE = 0.01;
/** Ambient temperature above which Água starts freezing on its own with no Gelo touching it, and the per-tick chance once it does — one tier per cold milestone, per-degree math is Gelo's job (see ICE_MELT_*). */
const AMBIENT_FREEZE_1 = 0.0006;
const AMBIENT_FREEZE_2 = 0.003;
const AMBIENT_FREEZE_3 = 0.012;
/**
 * A flammable cell's per-tick spontaneous-ignition chance once the
 * ambient temperature clears its own `spontaneousIgniteTemp` — starts at
 * this floor right at the threshold and climbs smoothly with each degree
 * past it (capped), instead of jumping between 3 fixed tiers. Different
 * plants scorch at different thresholds (see materials.ts), but they all
 * share this same "how fast the chance ramps up" curve.
 */
const SPONTANEOUS_IGNITE_BASE = 0.0002;
const SPONTANEOUS_IGNITE_PER_DEGREE = 0.00025;
const SPONTANEOUS_IGNITE_CAP = 0.02;
/** Gelo starts melting on its own (no Fogo/Lava touching it) above this ambient temperature — melt chance then climbs smoothly with each degree past it, capped. */
const AMBIENT_ICE_MELT_TEMP = 5;
const AMBIENT_ICE_MELT_PER_DEGREE = 0.0022;
const AMBIENT_ICE_MELT_CAP = 0.08;
/**
 * Água boils into Vapor at ordinary atmospheric pressure — 100°C, same as
 * real water. Ácido here is modeled after nitric acid (HNO₃), a common
 * strong acid that boils noticeably *below* water, at about 83°C — so
 * heating a scene with both in it, Ácido vaporizes first while the Água
 * right next to it is still sitting there as a liquid. Both directions
 * (boiling and condensing back) are a small per-tick chance, not instant,
 * so a pot of water crossing 100°C visibly simmers into vapor over time
 * rather than flashing to gas the instant it crosses the line, and a cloud
 * of vapor rains back down just as gradually once the climate cools back
 * below the threshold.
 */
const WATER_BOIL_TEMP = 100;
const ACID_BOIL_TEMP = 83;
const WATER_BOIL_CHANCE = 0.006;
const STEAM_CONDENSE_CHANCE = 0.01;
const ACID_BOIL_CHANCE = 0.006;
const ACID_VAPOR_CONDENSE_CHANCE = 0.01;
/** Below COLD_1, a Planta/Broto/Flor cell has a chance each tick to frost over one touching Empty cell into Gelo — a rime layer creeping in around it — one tier per cold milestone. */
const PLANT_FROST_1 = 0.004;
const PLANT_FROST_2 = 0.014;
const PLANT_FROST_3 = 0.035;
/** Per-tick chance a Clone that's already locked onto a material spawns one more unit of it into a touching empty cell. */
const CLONE_CHANCE = 0.1;
/** Per-tick chance an unlocked Clone touching an already-locked Clone inherits its lock — much slower than a direct touch, so a lock creeps through a connected blob of Clone instead of the whole thing snapping to the same material at once. */
const CLONE_PROPAGATE_CHANCE = 0.04;
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

const NEIGHBORS_8 = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
] as const;
const NEIGHBORS_4 = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
/** [dx, dy, weight] a Sprout can grow into — biased upward, never downward, so it reads as a little plant instead of a blob. */
const SPROUT_DIRECTIONS = [
  [0, -1, 3],
  [-1, -1, 2], [1, -1, 2],
  [-1, 0, 1], [1, 0, 1],
] as const;

/**
 * Tiny stamped shapes a Semente becomes when it germinates on Barro — a
 * one-shot pattern instead of gradual growth, so its size is guaranteed
 * (never more than 3 rows above the seed) rather than merely likely. Each
 * entry is [dx, dy, isFlower] relative to the seed's own cell; `isFlower`
 * cells become Flor (petal color varies by meta), the rest become a
 * dormant Sprout (stem green).
 */
const FLOWER_PATTERNS = [
  [[0, -1, false], [0, -2, true]],
  [[0, -1, false], [-1, -2, true], [1, -2, false]],
  [[0, -1, false], [0, -2, false], [-1, -2, true], [1, -2, true]],
  [[0, -1, false], [0, -2, false], [0, -3, true]],
  [[0, -1, false], [-1, -1, true], [1, -1, true]],
] as const;

/**
 * Taller variants of FLOWER_PATTERNS, used instead of the normal set while
 * the temperature is in the prosperous band — roughly double the reach
 * (the tallest normal pattern caps at 3 rows; these cap at 6), so a
 * Semente sprouting right when things are thriving visibly grows bigger
 * than one sprouting in ordinary conditions.
 */
const FLOWER_PATTERNS_PROSPEROUS = [
  [[0, -1, false], [0, -2, false], [0, -3, false], [0, -4, true]],
  [[0, -1, false], [0, -2, false], [-1, -3, false], [-1, -4, true], [1, -3, false], [1, -4, false]],
  [[0, -1, false], [0, -2, false], [0, -3, false], [-1, -4, true], [1, -4, true]],
  [[0, -1, false], [0, -2, false], [0, -3, false], [0, -4, false], [0, -5, false], [0, -6, true]],
  [[0, -1, false], [0, -2, false], [-1, -2, true], [1, -2, true], [0, -3, false], [0, -4, false], [-1, -4, true], [1, -4, true]],
] as const;

/**
 * Small stamped flower clusters a mature Planta blooms directly into on its
 * own in the prosperous climate — see PLANT_PROSPEROUS_BLOOM_CHANCE. Reach
 * up/sideways only (never a negative dy, i.e. never downward — a plant
 * doesn't sprout growth into the ground it's standing on) and never more
 * than 4 cells from the Planta cell itself. Each entry is [dx, dy,
 * isFlower] relative to the blooming Planta cell; `isFlower` cells become
 * Flor, the rest a plain Sprout-colored stem.
 */
const PLANT_BLOOM_FLOWER_PATTERNS = [
  [[1, 0, false], [2, 0, false], [3, -1, true]],
  [[-1, 0, false], [-2, -1, false], [-3, -1, true]],
  [[0, -1, false], [1, -2, false], [2, -3, true], [-1, -2, false], [-2, -3, true]],
  [[1, -1, false], [2, -2, false], [3, -3, true]],
  [[-1, -1, false], [-2, -2, false], [-3, -3, true], [-4, -4, true]],
] as const;

/**
 * Small twisted-branch shapes a mature Planta blooms into instead of a
 * flower cluster — the same reach/direction rules as
 * PLANT_BLOOM_FLOWER_PATTERNS, but all plain Sprout-colored stem (no Flor),
 * zig-zagging as it climbs to read as a gnarled little branch rather than a
 * straight twig.
 */
const PLANT_BLOOM_BRANCH_PATTERNS = [
  [[1, 0, false], [2, -1, false], [1, -2, false], [2, -3, false]],
  [[-1, 0, false], [-2, -1, false], [-1, -2, false], [-2, -3, false]],
  [[1, -1, false], [0, -2, false], [1, -3, false], [0, -4, false]],
  [[-1, -1, false], [0, -2, false], [-1, -3, false], [0, -4, false]],
] as const;

/**
 * A charge of electricity. Never written into the material grid — it has
 * no physical form, doesn't occupy a cell, doesn't collide with matter,
 * with other charges, or with itself, and any number of them can overlap
 * the same space. It only interacts with the grid when it's *blocked*: a
 * solid stops it (reacting if that solid is a conductor, Gunpowder, or
 * something flammable), while Empty space and conductors just let it
 * keep travelling through.
 */
interface Pulse {
  x: number;
  y: number;
  dx: number;
  dy: number;
  steps: number;
  /** Falling freely under gravity vs. currently racing along a conductor. */
  inConductor: boolean;
  /** Ticks left before a free-falling charge dissipates — reset to PULSE_AIR_LIFE whenever another charge is touching it, which is what lets a dense swarm punch further than a lone spark. Unused once inConductor. */
  life: number;
}

/**
 * A purely decorative spark of an explosion's flying debris. Not a
 * MaterialId — like a Pulse it's never written into the material grid, so
 * it never piles up or collides with itself, and any number can overlap.
 * It has real (float) position and velocity, unlike everything else on the
 * grid. No gravity: this isn't a falling object, so it flies outward in a
 * straight line at constant speed instead of curving into a fall. It's
 * blocked by anything solid (never passes through a block) and shatters
 * Glass on contact, but no longer shoves material around on its own — see
 * `BlastWave` for the thing that actually does that. It doesn't disappear
 * the instant it hits something or runs out of a fixed range either: `life`
 * ticks down every tick regardless, and the renderer fades its opacity down
 * with it (see PixiStage), so it always reads as gradually dying out rather
 * than an abrupt pop.
 */
interface Shrapnel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks left before this spark is fully faded out — see SHRAPNEL_LIFE_MIN/MAX. */
  life: number;
  /** This particle's original life, so the renderer can compute life/maxLife as a fade fraction. */
  maxLife: number;
}

/**
 * A single very bright cell at a fresh detonation's epicenter — "flash
 * inicial muito brilhante". Purely cosmetic and gone within a couple of
 * ticks (see FLASH_LIFE), just a near-white overlay the renderer blends in
 * proportional to `life`.
 */
interface Flash {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

/**
 * The actual physical force of an explosion — a multi-source wave that
 * grows outward from *every* cell of the detonated shape at once, not a
 * single circle centered on one epicenter. A thin horizontal line of C4
 * with Areia resting on top should blow that sand mostly straight up, all
 * along the line, not radiate it in a circular fan from one point; a
 * square block of explosive should puff outward roughly square-ish; an
 * oddly-shaped painted blob should push outward following its own
 * silhouette everywhere. That's exactly what a multi-source flood fill
 * gives for free: each cell adjacent to the blast's origin shape inherits
 * its outward push direction from whichever origin cell reached it first
 * (`dx`/`dy`), and every cell it goes on to reach in turn inherits that
 * *same* direction rather than recomputing a fresh "away from one center"
 * angle — so the push direction right next to the shape continues being
 * carried outward instead of rounding into a circle a few cells out.
 *
 * `frontier` is the ring of cells reached as of the last tick, each entry
 * also carrying the wave's remaining `energy` along that specific path
 * (see ENERGY_DISTANCE_DECAY/ENERGY_OBSTACLE_DECAY) — every tick it
 * expands one more layer via 8-directional flood fill, nudging any
 * Powder/Liquid cell it reaches one step further in its inherited
 * direction (via the same `tryMove` every other grain on the grid uses —
 * nothing about being blast-driven bypasses normal physics — and, since
 * that push is exactly BLAST_LAUNCH_DISTANCE (1) cell per touch, exactly as
 * gradual as every other grain's movement instead of jumping several cells
 * in one frame like an early version of this system did) and rolling a
 * chance to ignite anything flammable it reaches (see
 * BLAST_IGNITE_FACTOR), both scaled by that path's current energy so the
 * effect fades smoothly with distance instead of cutting off at a hard
 * radius. `visited` prevents re-processing a cell the wave already passed
 * through; a path simply stops propagating once its energy drops below
 * ENERGY_EPSILON, so how far the wave reaches falls directly out of how
 * much energy it started with rather than a separate fixed cap.
 *
 * `layersPerTick` is how many of those rings get processed in a single
 * tick — a lone charge only expands 1 ring/tick, slow enough to read as a
 * wave rippling outward. A big connected cluster's blast (see
 * CLUSTER_BONUS_PER_CHARGE, uncapped) instead expands several rings per
 * tick, so it sweeps the same distance in a handful of frames and reads as
 * an immediate, forceful blast everywhere at once instead of a lingering
 * trickle.
 */
interface BlastWave {
  frontier: { x: number; y: number; dx: number; dy: number; energy: number }[];
  visited: Set<number>;
  layersPerTick: number;
}

/**
 * Falling-sand grid: material id and per-cell meta (burn countdown, water
 * salinity, acid charge, electricity life — meaning depends on the cell's
 * material) live in flat typed arrays instead of a Cell[][] of objects, so
 * a full-grid tick stays cheap even at a few hundred cells wide.
 */
export class SimGrid {
  readonly width: number;
  readonly height: number;
  material: Uint8Array;
  meta: Uint8Array;
  /** Reset every tick; stops a cell that already moved from being moved again in the same pass. */
  private processed: Uint8Array;
  /**
   * Consecutive ticks a Powder/Liquid cell has gone without moving. Past
   * SLEEP_THRESHOLD the cell is skipped entirely instead of re-running its
   * movement rules. Any real change near a cell (a swap, a paint) wakes it
   * back up. On its own this only helps cells that are genuinely blocked —
   * see `flowDir` below for the case that actually causes the visible
   * shoreline dither.
   */
  private stillTicks: Uint8Array;
  /**
   * -1/0/1: the horizontal direction a Liquid cell committed to on its last
   * sideways flow. A cell parked between two equally "downhill" sideways
   * options that re-rolls the choice every tick will happily swap with its
   * neighbor, undo it next tick, and repeat forever — that move *succeeds*
   * every time, so `stillTicks` never sees a failure to count and the cell
   * never sleeps. Sticking to the last direction until it's actually
   * blocked turns that infinite flip-flop into a one-time settle.
   */
  private flowDir: Int8Array;
  /** Active electricity charges currently travelling through a conductor — see `Pulse`. */
  private pulses: Pulse[] = [];
  /** Active explosion debris in flight — see `Shrapnel`. */
  private shrapnel: Shrapnel[] = [];
  /** Active explosion shockwaves — see `BlastWave`. */
  private blastWaves: BlastWave[] = [];
  /** Brief, very bright flash cells at a fresh detonation's epicenter — purely decorative, see `Flash`. */
  private flashes: Flash[] = [];
  /** Global temperature in Celsius — see `updateTemperature`. Starts at the neutral baseline since nothing hot or cold has run yet. */
  private temp = NEUTRAL_TEMP;
  /** Weighted count of Fogo/Lava cells seen so far this tick's main scan — reset and accumulated in `step()`, consumed by `updateTemperature`. An absolute count, not a ratio — see HOT_PIXELS_FOR_MAX. */
  private hotAccum = 0;
  /** Count of Gelo cells seen so far this tick's main scan. */
  private coldAccum = 0;
  private tick = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.material = new Uint8Array(width * height);
    this.meta = new Uint8Array(width * height);
    this.processed = new Uint8Array(width * height);
    this.stillTicks = new Uint8Array(width * height);
    this.flowDir = new Int8Array(width * height);
  }

  /**
   * Wipes the grid back to a blank slate for the player's "Limpar tudo"
   * button — every material cell, but also everything that lives outside
   * `material`: in-flight Pulses and Shrapnel (neither would be touched by
   * just clearing the arrays, since that's precisely why they're kept
   * separate — "no physical form" — which without this made Eletricidade
   * visibly survive a clear), and the temperature, reset immediately to
   * neutral instead of just drifting back to it over the next several
   * seconds like it would from `updateTemperature`'s normal thermal-mass
   * smoothing.
   */
  reset(): void {
    this.material.fill(0);
    this.meta.fill(0);
    this.processed.fill(0);
    this.stillTicks.fill(0);
    this.flowDir.fill(0);
    this.pulses = [];
    this.shrapnel = [];
    this.blastWaves = [];
    this.flashes = [];
    this.temp = NEUTRAL_TEMP;
    this.hotAccum = 0;
    this.coldAccum = 0;
  }

  /**
   * A snapshot of everything worth persisting — the two cell arrays (RLE'd,
   * since a typical scene is mostly Empty), the grid size they were painted
   * at, and the current temperature. The transient effects (pulses,
   * shrapnel, blast waves, flashes) are deliberately dropped, same as
   * `reset()` clears them.
   */
  serialize(): MapSnapshot {
    return {
      v: SCHEMA_VERSION,
      w: this.width,
      h: this.height,
      temp: this.temp,
      mat: rleEncode(this.material),
      meta: rleEncode(this.meta),
    };
  }

  /**
   * Replaces the grid contents with a saved snapshot. Starts from a full
   * `reset()` (so nothing from the previous scene lingers), then writes the
   * decoded cells in. A snapshot painted at a different width than this grid
   * (window resized between save and load) is centered horizontally and
   * clipped to fit rather than refused outright.
   */
  load(snap: MapSnapshot): void {
    this.reset();
    const srcMat = rleDecode(snap.mat, snap.w * snap.h);
    const srcMeta = rleDecode(snap.meta, snap.w * snap.h);
    const offsetX = Math.floor((this.width - snap.w) / 2);
    const offsetY = this.height - snap.h; // anchor to the floor, not the ceiling
    for (let sy = 0; sy < snap.h; sy++) {
      const ty = sy + offsetY;
      if (ty < 0 || ty >= this.height) continue;
      for (let sx = 0; sx < snap.w; sx++) {
        const tx = sx + offsetX;
        if (tx < 0 || tx >= this.width) continue;
        const si = sy * snap.w + sx;
        const ti = ty * this.width + tx;
        this.material[ti] = srcMat[si];
        this.meta[ti] = srcMeta[si];
      }
    }
    this.temp = Math.max(EXTREME_COLD, Math.min(EXTREME_HOT, snap.temp));
  }

  /** Read-only positions of active electricity charges, for the renderer to overlay a glow on top of whatever conductor they're passing through. */
  get activePulses(): readonly { x: number; y: number }[] {
    return this.pulses;
  }

  /** Read-only positions (plus fade state) of in-flight explosion debris, for the renderer to overlay. */
  get activeShrapnel(): readonly { x: number; y: number; life: number; maxLife: number }[] {
    return this.shrapnel;
  }

  /** Read-only positions (plus fade state) of a fresh detonation's bright Flash cells, for the renderer to overlay. */
  get activeFlashes(): readonly { x: number; y: number; life: number; maxLife: number }[] {
    return this.flashes;
  }

  /** Current global temperature in Celsius — see `updateTemperature`. */
  get temperature(): number {
    return this.temp;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): MaterialId {
    return this.material[this.index(x, y)] as MaterialId;
  }

  set(x: number, y: number, id: MaterialId, meta = 0): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.material[i] = id;
    this.meta[i] = meta;
    this.wake(x, y);
  }

  /** Wakes a cell and its neighbors so they re-evaluate movement next tick. */
  private wake(x: number, y: number): void {
    this.stillTicks[this.index(x, y)] = 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny)) this.stillTicks[this.index(nx, ny)] = 0;
    }
  }

  private metaFor(id: MaterialId): number {
    if (id === MaterialId.Fire) return MATERIALS[MaterialId.Fire].burnTicks;
    if (id === MaterialId.Acid) return ACID_START_CHARGES;
    return 0;
  }

  /**
   * Writes one cell, but only onto empty space (unless `id` itself is
   * Empty, i.e. the eraser) — a brush stroke never overwrites whatever is
   * already there, including Fire, which spreads by touching flammable
   * neighbors during simulation instead of being paintable through them.
   * Electricity is the other exception, in the opposite direction: it has
   * no physical form, so the brush drops a charge free-falling from that
   * spot regardless of what's already there, instead of occupying the cell.
   * The eraser also has to reach charges explicitly — since Electricity
   * never lives in `material`, clearing that array alone would leave any
   * pulse sitting at this cell still travelling.
   */
  private paintCell(x: number, y: number, id: MaterialId): void {
    if (!this.inBounds(x, y)) return;
    if (id === MaterialId.Electricity) {
      this.pulses.push({ x, y, dx: 0, dy: 1, steps: 0, inConductor: false, life: PULSE_AIR_LIFE });
      return;
    }
    if (id === MaterialId.Empty) {
      if (this.pulses.length > 0) this.pulses = this.pulses.filter((p) => p.x !== x || p.y !== y);
      this.set(x, y, MaterialId.Empty);
      return;
    }
    if (this.get(x, y) !== MaterialId.Empty) return;
    // Vida is stippled at random instead of filling the brush solid — a
    // packed rectangle is a famously bad Conway seed (almost every cell has
    // well over 3 neighbors and dies to overcrowding in the very first
    // generation, leaving only scattered corners), so a solid-painted blob
    // would just collapse instantly. A sparse "soup" is what actually gives
    // Conway's rules something to do.
    if (id === MaterialId.Vida && Math.random() >= VIDA_PAINT_DENSITY) return;
    this.set(x, y, id, this.metaFor(id));
  }

  /**
   * Paints a filled circle of `id`, used for the "point"/"area" brush
   * shapes. `radius` can be fractional (brush sizes are 1-10 diameter, so
   * odd sizes give a .5 radius) — the loop bounds still step by whole
   * cells, since writing a typed array at a fractional index is a silent
   * no-op, and only the circular cutoff test uses the exact radius.
   */
  paint(cx: number, cy: number, radius: number, id: MaterialId): void {
    const r2 = radius * radius;
    const rInt = Math.ceil(radius);
    for (let dy = -rInt; dy <= rInt; dy++) {
      for (let dx = -rInt; dx <= rInt; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        this.paintCell(cx + dx, cy + dy, id);
      }
    }
  }

  /** Stamps a filled circle of `radius` at every step along the segment, for the "line" brush. */
  paintLine(x0: number, y0: number, x1: number, y1: number, radius: number, id: MaterialId): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    // Bresenham, stamping a small brush circle at each step so the line has thickness.
    for (;;) {
      this.paint(x, y, radius, id);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Filled axis-aligned rectangle between two opposite corners, for the "square area" brush. */
  paintRect(x0: number, y0: number, x1: number, y1: number, id: MaterialId): void {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        this.paintCell(x, y, id);
      }
    }
  }

  private swap(ax: number, ay: number, bx: number, by: number): void {
    const ai = this.index(ax, ay);
    const bi = this.index(bx, by);
    const tm = this.material[ai];
    const tmeta = this.meta[ai];
    const tflow = this.flowDir[ai];
    this.material[ai] = this.material[bi];
    this.meta[ai] = this.meta[bi];
    this.flowDir[ai] = this.flowDir[bi];
    this.material[bi] = tm;
    this.meta[bi] = tmeta;
    this.flowDir[bi] = tflow;
    this.processed[ai] = 1;
    this.processed[bi] = 1;
    this.wake(ax, ay);
    this.wake(bx, by);
  }

  private canDisplace(intoId: MaterialId, movingDensity: number): boolean {
    if (intoId === MaterialId.Empty) return true;
    const into = MATERIALS[intoId];
    return into.category === MaterialCategory.Liquid && movingDensity > into.density;
  }

  step(): void {
    this.tick++;
    this.processed.fill(0);
    const leftToRight = this.tick % 2 === 0;
    this.hotAccum = 0;
    this.coldAccum = 0;

    // Bottom-to-top so a cell that falls this tick isn't immediately
    // reprocessed as if it were the next row's original occupant.
    for (let y = this.height - 1; y >= 0; y--) {
      for (let xi = 0; xi < this.width; xi++) {
        const x = leftToRight ? xi : this.width - 1 - xi;
        const i = this.index(x, y);
        if (this.processed[i]) continue;
        const id = this.material[i] as MaterialId;
        if (id === MaterialId.Empty) continue;
        if (id === MaterialId.Fire) this.hotAccum++;
        else if (id === MaterialId.Lava || id === MaterialId.HeatBlock) this.hotAccum += 2;
        else if (id === MaterialId.Ice || id === MaterialId.ColdBlock) this.coldAccum++;

        const def = MATERIALS[id];
        switch (def.category) {
          case MaterialCategory.Powder:
            if (this.stillTicks[i] < SLEEP_THRESHOLD && Math.random() < GRAVITY_STRENGTH) {
              if (this.stepPowder(x, y, def.density)) this.stillTicks[i] = 0;
              else if (this.stillTicks[i] < 255) this.stillTicks[i]++;
            }
            break;
          case MaterialCategory.Liquid:
            if (this.stillTicks[i] < SLEEP_THRESHOLD && Math.random() < GRAVITY_STRENGTH) {
              if (this.stepLiquid(x, y, def.density)) this.stillTicks[i] = 0;
              else if (this.stillTicks[i] < 255) this.stillTicks[i]++;
            }
            break;
          case MaterialCategory.Gas:
            // Gás (unlike Vapor / Vapor de Ácido, which condense back by
            // temperature) has no lasting form — every tick, moving or not,
            // an un-ignited cell has a chance to disperse into the air, so a
            // puff fades on its own instead of piling up under the ceiling
            // forever.
            if (id === MaterialId.CombustibleGas && Math.random() < GAS_DISSIPATE_CHANCE) {
              this.set(x, y, MaterialId.Empty);
              break;
            }
            if (this.stillTicks[i] < SLEEP_THRESHOLD) {
              if (this.stepGas(x, y, def.density)) this.stillTicks[i] = 0;
              else if (this.stillTicks[i] < 255) this.stillTicks[i]++;
            }
            break;
          case MaterialCategory.Fire:
            this.stepFire(x, y, i);
            break;
          case MaterialCategory.Organic:
            if (id === MaterialId.Sprout) this.stepSprout(x, y, i);
            else if (id === MaterialId.Flor) this.processed[i] = 1; // a static petal, never grows or spreads on its own
            else this.stepOrganic(x, y);
            break;
          default:
            break;
        }

        // Reactions that aren't about movement run regardless of sleep
        // state — but only if this cell is still `id`: the Powder/Liquid
        // step above may have just swapped it elsewhere (e.g. Salt sinking
        // into Water), and index `i` now holds whatever took its place.
        // Reacting anyway used a stale index and clobbered that neighbor —
        // exactly how a Salt grain sinking into Water made both vanish.
        if (this.material[i] !== id) continue;
        if (id === MaterialId.Dirt) this.stepDirt(x, y);
        else if (id === MaterialId.Seed) this.stepSeed(x, y);
        else if (id === MaterialId.Salt) this.stepSalt(x, y, i);
        else if (id === MaterialId.Acid) this.stepAcid(x, y, i);
        else if (id === MaterialId.Metal) this.stepMetal(x, y);
        else if (id === MaterialId.Lava) this.stepLava(x, y);
        else if (id === MaterialId.Ice) this.stepIce(x, y);
        else if (def.explosive && this.meta[i] > 0) this.stepFuse(x, y, i);
        else if (id === MaterialId.Clone) this.stepClone(x, y, i);

        // Ambient temperature effects — only make sense once the cell has
        // survived whatever the reactions above just did to it.
        if (this.material[i] !== id) continue;
        if (def.flammable && id !== MaterialId.Fire && this.temp >= def.spontaneousIgniteTemp) {
          const excess = this.temp - def.spontaneousIgniteTemp;
          const chance = Math.min(SPONTANEOUS_IGNITE_CAP, SPONTANEOUS_IGNITE_BASE + excess * SPONTANEOUS_IGNITE_PER_DEGREE);
          if (Math.random() < chance) this.igniteAt(x, y);
        } else if (id === MaterialId.Water && this.meta[i] === 0 && this.temp <= COLD_1) {
          const chance =
            this.temp <= COLD_3 ? AMBIENT_FREEZE_3 :
            this.temp <= COLD_2 ? AMBIENT_FREEZE_2 :
            AMBIENT_FREEZE_1;
          if (Math.random() < chance) this.set(x, y, MaterialId.Ice);
        } else if (
          (id === MaterialId.Plant || id === MaterialId.Sprout || id === MaterialId.Flor) &&
          this.temp <= COLD_1
        ) {
          this.frostOver(x, y);
        } else if (id === MaterialId.Water && this.temp >= WATER_BOIL_TEMP) {
          if (Math.random() < WATER_BOIL_CHANCE) this.set(x, y, MaterialId.Steam);
        } else if (id === MaterialId.Steam && this.temp < WATER_BOIL_TEMP) {
          if (Math.random() < STEAM_CONDENSE_CHANCE) this.set(x, y, MaterialId.Water);
        } else if (id === MaterialId.Acid && this.temp >= ACID_BOIL_TEMP) {
          if (Math.random() < ACID_BOIL_CHANCE) this.set(x, y, MaterialId.AcidVapor);
        } else if (id === MaterialId.AcidVapor && this.temp < ACID_BOIL_TEMP) {
          if (Math.random() < ACID_VAPOR_CONDENSE_CHANCE) this.set(x, y, MaterialId.Acid, ACID_START_CHARGES);
        }
      }
    }

    this.advancePulses();
    this.advanceShrapnel();
    this.advanceBlastWaves();
    this.advanceFlashes();
    this.stepLifeGeneration();
    this.updateTemperature();
  }

  /**
   * Global temperature drifts toward an instantaneous target set by the
   * *absolute* (weighted) count of Fogo/Lava cells vs Gelo cells on the
   * grid — see HOT_PIXELS_FOR_MAX for why this isn't a ratio against the
   * active cell count. Each side's contribution saturates independently
   * at its own pixel count, then they're added together (hot positive,
   * cold negative) before being applied on top of NEUTRAL_TEMP and
   * clamped to the [EXTREME_COLD, EXTREME_HOT] the background color
   * range covers — so a matched Fogo fire and Gelo block mostly cancel
   * out, and the player has to actually balance the two to hold a
   * reading anywhere in particular, including the prosperous band. It
   * only drifts a fraction of the way to that target each tick (thermal
   * mass: nothing flashes from freezing to scorching in one frame).
   */
  private updateTemperature(): void {
    const hotFrac = Math.min(1, this.hotAccum / HOT_PIXELS_FOR_MAX);
    const coldFrac = Math.min(1, this.coldAccum / COLD_PIXELS_FOR_MAX);
    const target = NEUTRAL_TEMP + hotFrac * (EXTREME_HOT - NEUTRAL_TEMP) - coldFrac * (NEUTRAL_TEMP - EXTREME_COLD);
    this.temp += (target - this.temp) * TEMP_LERP_RATE;
    this.temp = Math.max(EXTREME_COLD, Math.min(EXTREME_HOT, this.temp));
  }

  /**
   * Shared by Powder and Liquid: try straight down, then the two diagonals,
   * preferring whichever horizontal direction this cell last committed to
   * (see `flowDir`) instead of a fresh coin flip every tick. On a long
   * slope, a cell resting where both diagonals are open re-rolling each
   * tick produces a different arrival choice every frame as cells cascade
   * through it — individually each move is a one-way step down, but the
   * *pattern* along the whole slope never looks settled. Falling straight
   * down clears the commitment (a vertical drop isn't a horizontal choice);
   * a diagonal or sideways move reinforces it so nearby cells tend to slide
   * the same way instead of interleaving randomly.
   */
  private stepPowder(x: number, y: number, density: number): boolean {
    const i = this.index(x, y);
    if (this.tryMove(x, y, x, y + 1, density)) {
      this.flowDir[this.index(x, y + 1)] = 0;
      return true;
    }
    let dir = this.flowDir[i];
    if (dir === 0) dir = Math.random() < 0.5 ? 1 : -1;
    if (this.tryMove(x, y, x + dir, y + 1, density)) {
      this.flowDir[this.index(x + dir, y + 1)] = dir;
      return true;
    }
    if (this.tryMove(x, y, x - dir, y + 1, density)) {
      this.flowDir[this.index(x - dir, y + 1)] = -dir;
      return true;
    }
    this.flowDir[i] = 0;
    return false;
  }

  private stepLiquid(x: number, y: number, density: number): boolean {
    const i = this.index(x, y);
    if (this.tryMove(x, y, x, y + 1, density)) {
      this.flowDir[this.index(x, y + 1)] = 0;
      return true;
    }
    let dir = this.flowDir[i];
    if (dir === 0) dir = Math.random() < 0.5 ? 1 : -1;
    if (this.tryMove(x, y, x + dir, y + 1, density)) {
      this.flowDir[this.index(x + dir, y + 1)] = dir;
      return true;
    }
    if (this.tryMove(x, y, x - dir, y + 1, density)) {
      this.flowDir[this.index(x - dir, y + 1)] = -dir;
      return true;
    }

    // Can't fall any further — flow sideways to find its level, same
    // committed-direction rule so it doesn't flip-flop with a neighbor.
    if (this.tryMove(x, y, x + dir, y, density)) {
      this.flowDir[this.index(x + dir, y)] = dir;
      return true;
    }
    // Committed direction is blocked — drop it instead of immediately
    // trying the reverse, which is the other half of the flip-flop.
    this.flowDir[i] = 0;
    return false;
  }

  /**
   * A Gas (Vapor, Vapor de Ácido) rises instead of falling — the exact
   * mirror image of `stepLiquid`'s "seek its own level" cascade, just
   * upside down: straight up first, then a diagonal-up in whichever
   * direction it last committed to, then disperses sideways once it can't
   * rise any further, instead of pooling at a floor. Reuses `tryMove` as-is
   * (rather than a bespoke helper): a gas's density is deliberately lower
   * than every Liquid's in this game, so `canDisplace`'s sink-chance check
   * already works out to "never displace a denser Liquid it's trying to
   * rise into", the same way it'd never let a light Powder sink into a
   * heavier one — it can only ever move into genuinely Empty space.
   */
  private stepGas(x: number, y: number, density: number): boolean {
    const i = this.index(x, y);
    if (this.tryMove(x, y, x, y - 1, density)) {
      this.flowDir[this.index(x, y - 1)] = 0;
      return true;
    }
    let dir = this.flowDir[i];
    if (dir === 0) dir = Math.random() < 0.5 ? 1 : -1;
    if (this.tryMove(x, y, x + dir, y - 1, density)) {
      this.flowDir[this.index(x + dir, y - 1)] = dir;
      return true;
    }
    if (this.tryMove(x, y, x - dir, y - 1, density)) {
      this.flowDir[this.index(x - dir, y - 1)] = -dir;
      return true;
    }
    // Can't rise any further — disperse sideways instead of just pooling,
    // same committed-direction rule so it doesn't flip-flop with a neighbor.
    if (this.tryMove(x, y, x + dir, y, density)) {
      this.flowDir[this.index(x + dir, y)] = dir;
      return true;
    }
    this.flowDir[i] = 0;
    return false;
  }

  private tryMove(fx: number, fy: number, tx: number, ty: number, density: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const targetId = this.get(tx, ty);
    if (this.processed[this.index(tx, ty)]) return false;
    if (!this.canDisplace(targetId, density)) return false;
    if (targetId !== MaterialId.Empty) {
      // Sinking through a liquid isn't instant — how quickly depends on how
      // much denser the mover is, so sand settles slowly through water
      // while stone (much denser) drops through almost immediately. Salty
      // water is itself a bit denser than fresh water (proportional to how
      // saturated it is), so anything — including more salt — sinks a
      // little slower through brine than through plain water.
      const into = MATERIALS[targetId];
      const targetIndex = this.index(tx, ty);
      const salinityBonus = targetId === MaterialId.Water ? (this.meta[targetIndex] / 255) * 1.5 : 0;
      const sinkChance = (density - (into.density + salinityBonus)) / SINK_DENSITY_SCALE;
      if (Math.random() > sinkChance) return false;
    }
    this.swap(fx, fy, tx, ty);
    return true;
  }

  private stepFire(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    // Fire only acts on every FIRE_TICK_INTERVAL-th tick — a global slow
    // motion knob for spread/ignition/fuel-burn/flicker all at once,
    // independent of each material's own burnTicks ratio.
    if (this.tick % FIRE_TICK_INTERVAL !== 0) return;

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      if (this.get(nx, ny) === MaterialId.Water) {
        this.set(x, y, MaterialId.Empty);
        return;
      }
    }

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nDef = MATERIALS[this.get(nx, ny)];
      if (nDef.flammable && Math.random() < nDef.ignitionChance) this.igniteAt(nx, ny);
    }

    // Boxed in on all 3 upward cells (nothing to flicker into): this flame
    // has nowhere to breathe and smothers out well before its fuel would
    // otherwise run out, instead of sitting fully lit against a wall.
    const smothered = ([[0, -1], [-1, -1], [1, -1]] as const).every(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return !this.inBounds(nx, ny) || this.get(nx, ny) !== MaterialId.Empty;
    });
    // Math.max clamps this at 0 before it's written back — meta is a
    // Uint8Array, so `meta[i] -= 4` when meta[i] is, say, 2 doesn't go
    // negative, it *underflows* to 254 and the "reached zero" check below
    // never trips again. That's exactly why fire pinned against the
    // ceiling (permanently smothered, since everything above row 0 is
    // out of bounds) looked like it never went out.
    this.meta[i] = Math.max(0, this.meta[i] - (smothered ? FIRE_SMOTHER_DECAY : 1));
    if (this.meta[i] <= 0) {
      this.set(x, y, MaterialId.Empty);
      return;
    }

    // Flickers upward through empty space instead of sitting still. A
    // fraction of moves leap 2 cells instead of 1 in the same direction —
    // occasional bigger jumps read as scattering embers, spreading the
    // flame further from where it started before it burns out.
    const dir = Math.random();
    const [ddx, ddy] = dir < 0.34 ? [0, -1] : dir < 0.67 ? [-1, -1] : [1, -1];
    const leap = Math.random() < FIRE_LEAP_CHANCE;
    if (leap && this.tryMoveFire(x, y, x + ddx * 2, y + ddy * 2)) return;
    this.tryMoveFire(x, y, x + ddx, y + ddy);
  }

  private tryMoveFire(fx: number, fy: number, tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty) || this.get(tx, ty) !== MaterialId.Empty) return false;
    this.swap(fx, fy, tx, ty);
    return true;
  }

  /** Sets a cell alight — a detonation for Gunpowder, an ordinary burn for anything else flammable. */
  private igniteAt(x: number, y: number): void {
    const def = MATERIALS[this.get(x, y)];
    if (def.explosive) {
      this.detonate(x, y);
    } else {
      this.set(x, y, MaterialId.Fire, def.burnTicks);
      this.processed[this.index(x, y)] = 1;
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
   * a single frame. Only explosive cells are ever deleted (consumed by
   * their own blast) — everything else nearby is just pushed by the
   * BlastWave (see its struct comment). A small burst of purely decorative
   * Shrapnel rides along on each pop.
   *
   * Other, *separate* explosive piles the wave reaches with enough energy
   * left (see BLAST_IGNITE_FACTOR) also don't go off in the same instant:
   * each gets a lit fuse too, on a slightly longer delay
   * (CHAIN_DELAY_SEPARATE), so a minefield of disconnected piles ripples
   * outward over several frames. The fuse lives in `meta` rather than a
   * separate queue keyed by position
   * specifically because Pólvora is Powder — it can fall. A queue holding
   * onto the (x, y) it was lit at would lose track of the charge the
   * moment gravity (or another blast) moved it, and silently never go off.
   * `meta` travels with the cell through every `swap()`, so the countdown
   * always keeps up with wherever the charge actually ends up (C4 never
   * falls, but shares the same mechanism for consistency).
   */
  private detonate(cx: number, cy: number): void {
    const pocket = this.collectExplosivePocket(cx, cy);

    // Only this small pocket is consumed by the blast — the rest of a
    // connected pile keeps its shape and detonates in turn via the fuses lit
    // just below, so a big block visibly chain-reacts instead of vanishing.
    for (const [x, y] of pocket) {
      this.set(x, y, MaterialId.Empty);
      this.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
    }

    // Light a short fuse on every still-inert explosive cell touching the
    // pocket — this is the chain reaction. Gás is never fused (it flashes
    // over instantly), only ever ignited directly.
    for (const [x, y] of pocket) {
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.index(nx, ny);
        if (this.meta[ni] === 0 && this.isFusableExplosive(this.get(nx, ny))) {
          this.meta[ni] = CHAIN_DELAY_CONNECTED + Math.floor(Math.random() * 3);
        }
      }
    }

    const scale = 1 + (pocket.length - 1) * CLUSTER_BONUS_PER_CHARGE;
    const visited = new Set<number>();
    const frontier: { x: number; y: number; dx: number; dy: number; energy: number }[] = [];
    for (const [x, y] of pocket) {
      visited.add(this.index(x, y));
      frontier.push({ x, y, dx: 0, dy: 0, energy: scale });
    }
    // Always one ring per tick — the force of a big pile comes from the long
    // chain of these small pops rippling across it, not from a single wave
    // sweeping the whole radius in a frame or two.
    const wave: BlastWave = { frontier, visited, layersPerTick: 1 };
    // Expand exactly one ring right now, synchronously, instead of only
    // waiting for advanceBlastWaves() at the end of this tick's step().
    // detonate() runs mid-sweep through the main per-cell loop (row by row,
    // bottom to top) — if a cell sitting directly above this shape hasn't
    // had its own turn yet this tick, ordinary gravity would otherwise see
    // the freshly-emptied space where the charge just was and immediately
    // fall into it before the blast ever got a chance to push it away, so
    // the crater always looked like it swallowed whatever was resting on
    // top instead of launching it outward.
    if (wave.frontier.length > 0) this.expandBlastWaveLayer(wave);
    if (wave.frontier.length > 0) this.blastWaves.push(wave);
    // Reuses the wave's own just-computed frontier as the sparks' launch
    // points and directions — see spawnShrapnelBurst for why that's what
    // makes the decorative debris follow the shape too, instead of always
    // radiating from one center in a perfect circle regardless of what
    // actually exploded.
    this.spawnShrapnelBurst(wave.frontier, Math.min(SHRAPNEL_VISUAL_CAP, Math.max(3, Math.round(SHRAPNEL_PER_POP * scale))));
  }

  /** Pólvora and C4 detonate on a lit fuse; Gás doesn't (it flashes over the instant it catches). */
  private isFusableExplosive(id: MaterialId): boolean {
    const def = MATERIALS[id];
    return def.explosive && def.category !== MaterialCategory.Gas;
  }

  /**
   * The small local group a single detonation consumes: the cell that went
   * off, plus any explosive cells directly touching it (8-directional). A
   * big connected mass is *not* collected whole here — it comes apart as a
   * chain reaction, one pocket per pop, via the fuses `detonate` lights.
   */
  private collectExplosivePocket(cx: number, cy: number): [number, number][] {
    const cells: [number, number][] = [[cx, cy]];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      // Gás isn't pulled into the pocket — it catches from the blast wave
      // and detonates in its own right instead of being quietly consumed.
      if (this.inBounds(nx, ny) && this.isFusableExplosive(this.get(nx, ny))) cells.push([nx, ny]);
    }
    return cells;
  }

  /** A lit fuse (meta > 0) on any explosive cell (Pólvora, C4) counts down once per tick and detonates when it reaches 0 — see `detonate`. */
  private stepFuse(x: number, y: number, i: number): void {
    this.meta[i]--;
    if (this.meta[i] <= 0) this.detonate(x, y);
  }

  /**
   * Launches a burst of Shrapnel, each at its own randomized speed and
   * lifespan, from a set of (x, y, dx, dy) launch points — the BlastWave
   * frontier right after its first expansion, i.e. exactly the cells the
   * wave itself just reached, each carrying the very same outward
   * direction it's pushing material in (see BlastWave's struct comment).
   * That's what makes the decorative sparks trace the exploded shape's own
   * silhouette instead of always radiating from one shared center point in
   * a perfect circle no matter what shape actually went off: a round
   * charge's frontier surrounds it from every side, so its sparks still
   * end up roughly circular, but a long line's frontier sits mostly above
   * and below it, so its sparks fly mostly up and down along the line's
   * whole length instead of fanning out sideways from one spot in the
   * middle.
   */
  private spawnShrapnelBurst(origins: readonly { x: number; y: number; dx: number; dy: number }[], count: number): void {
    if (origins.length === 0) return;
    for (let i = 0; i < count; i++) {
      const o = origins[Math.floor(Math.random() * origins.length)];
      const baseAngle = o.dx === 0 && o.dy === 0 ? Math.random() * Math.PI * 2 : Math.atan2(o.dy, o.dx);
      const angle = baseAngle + (Math.random() - 0.5) * 0.9;
      const speed = SHRAPNEL_SPEED_MIN + Math.random() * (SHRAPNEL_SPEED_MAX - SHRAPNEL_SPEED_MIN);
      const life = SHRAPNEL_LIFE_MIN + Math.floor(Math.random() * (SHRAPNEL_LIFE_MAX - SHRAPNEL_LIFE_MIN));
      this.shrapnel.push({
        x: o.x + 0.5,
        y: o.y + 0.5,
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
  private advanceShrapnel(): void {
    if (this.shrapnel.length === 0) return;
    const next: Shrapnel[] = [];
    for (const s of this.shrapnel) {
      s.life--;
      if (s.life <= 0) continue;

      const nx = s.x + s.vx;
      const ny = s.y + s.vy;
      const gx = Math.round(nx);
      const gy = Math.round(ny);
      if (this.inBounds(gx, gy)) {
        const id = this.get(gx, gy);
        if (id === MaterialId.Glass) {
          this.shatterGlass(gx, gy);
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
    this.shrapnel = next;
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
  private shatterGlass(x: number, y: number): void {
    const i = this.index(x, y);
    if (this.meta[i] + 1 >= GLASS_SHATTER_HITS) {
      this.set(x, y, MaterialId.Sand);
    } else {
      this.meta[i]++;
      this.wake(x, y);
    }
  }

  /**
   * Expands one BlastWave a single ring further via 8-directional flood
   * fill from its origin shape (see the struct comment for why a
   * multi-source fill, not a circle from one point). Each newly-reached
   * cell inherits its outward push direction from whichever frontier cell
   * discovered it — the origin cells themselves start with no direction
   * (`dx`/`dy` both 0), so the very first ring around the shape picks up
   * the raw offset to each neighbor, and every ring after that just carries
   * that same direction further out, tracing the shape's own contour
   * outward instead of rounding into a circle a few cells away.
   *
   * Energy decays by ENERGY_DISTANCE_DECAY every ring purely from distance,
   * plus an extra ENERGY_OBSTACLE_DECAY cut whenever the path passes
   * through a Solid (or otherwise immovable) cell — a wall genuinely
   * shields whatever is behind it instead of the wave routing around it at
   * full strength. A path stops propagating once its energy drops below
   * ENERGY_EPSILON, which is what actually bounds how far a blast reaches
   * (see BlastWave's comment) — there's no separate radius cap.
   *
   * Two effects happen at each newly-reached cell, both gated by that
   * path's current energy so they fade smoothly with distance instead of
   * cutting off at a hard boundary:
   *  - A Powder/Liquid cell is nudged exactly one cell in the inherited
   *    direction (via the same `tryMove` every other grain on the grid
   *    uses, so it's still blocked by a wall, sinks through a lighter
   *    liquid, etc.) — one cell per touch, same as gravity moves anything
   *    else, so a grain never visibly jumps several cells in a single
   *    frame. What keeps it rising against gravity for more than one frame
   *    isn't a bigger single push: it's getting touched again on the
   *    *next* tick too, either by this same wave's front still sweeping
   *    past it in the same direction, or by the synchronous first-ring
   *    expansion in `detonate` beating gravity to the very first touch —
   *    a grain that keeps getting caught by the expanding front keeps
   *    climbing tick after tick, gradually, until the front outruns it and
   *    gravity takes back over. It's also left with a `flowDir` bias
   *    afterward so it keeps drifting that way on its own for a few more
   *    ticks even once the wave itself has moved on.
   *  - Anything flammable and not already on fire has a chance to ignite —
   *    "recebe calor intenso, pode entrar em combustão" as a direct effect
   *    of the shockwave itself. Explosive materials (Pólvora, C4) are
   *    flammable too, so this is also what chain-detonates a *separate*
   *    pile the wave reaches (via a lit fuse, same as before — see
   *    `detonate`'s comment) instead of the old fixed-radius scan; being
   *    wave-driven, that chain now correctly respects ENERGY_OBSTACLE_DECAY
   *    too, so a pile shielded behind a thick wall doesn't sympathetically
   *    detonate just for being nearby.
   *
   * Within a single layer, more than one frontier cell can be adjacent to
   * the same not-yet-visited neighbor (two diagonal paths converging on the
   * same cell, for instance) — a real shockwave would arrive there via
   * whichever path lost the least energy, so candidates for the same cell
   * are collected first and only the highest-energy one is kept, instead of
   * just taking whichever happened to be processed first. Without this, a
   * perfectly symmetric blast could pick an arbitrary, order-dependent path
   * to two equally-distant points and have one of them come out with wildly
   * more energy than the other for no physical reason.
   */
  private expandBlastWaveLayer(w: BlastWave): void {
    const candidates = new Map<number, { x: number; y: number; dx: number; dy: number; energy: number }>();
    for (const cell of w.frontier) {
      for (const [ndx, ndy] of NEIGHBORS_8) {
        const nx = cell.x + ndx;
        const ny = cell.y + ndy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.index(nx, ny);
        if (w.visited.has(ni)) continue;

        const dx = cell.dx !== 0 || cell.dy !== 0 ? cell.dx : ndx;
        const dy = cell.dx !== 0 || cell.dy !== 0 ? cell.dy : ndy;
        const energy = cell.energy * ENERGY_DISTANCE_DECAY;

        const existing = candidates.get(ni);
        if (!existing || energy > existing.energy) {
          candidates.set(ni, { x: nx, y: ny, dx, dy, energy });
        }
      }
    }

    const nextFrontier: { x: number; y: number; dx: number; dy: number; energy: number }[] = [];
    for (const [ni, c] of candidates) {
      w.visited.add(ni);
      let energy = c.energy;

      const id = this.get(c.x, c.y);
      if (id !== MaterialId.Empty) {
        const def = MATERIALS[id];
        if (def.category === MaterialCategory.Powder || def.category === MaterialCategory.Liquid) {
          const stepX = c.dx === 0 ? 0 : c.dx > 0 ? 1 : -1;
          const stepY = c.dy === 0 ? 0 : c.dy > 0 ? 1 : -1;
          if (Math.random() < energy) this.launchPush(c.x, c.y, stepX, stepY, def.density);
        } else {
          // A wall or other immovable obstacle absorbs a real chunk of
          // the wave's remaining energy — that's the actual shielding
          // effect, not just "can't be pushed".
          energy *= ENERGY_OBSTACLE_DECAY;
        }
        if (def.flammable && id !== MaterialId.Fire && this.meta[ni] === 0) {
          const igniteChance = energy * def.ignitionChance * BLAST_IGNITE_FACTOR;
          if (Math.random() < igniteChance) {
            // A separate Pólvora/C4 pile the wave reaches gets a slightly
            // longer fuse than the connected chain, so a scattered minefield
            // ripples rather than all going at once; Gás and ordinary
            // flammables just catch immediately.
            if (this.isFusableExplosive(id)) this.meta[ni] = CHAIN_DELAY_SEPARATE + Math.floor(Math.random() * 4);
            else this.igniteAt(c.x, c.y);
          }
        }
      }

      if (energy >= ENERGY_EPSILON) nextFrontier.push({ x: c.x, y: c.y, dx: c.dx, dy: c.dy, energy });
    }
    w.frontier = nextFrontier;
  }

  /**
   * Shoves a single grain BLAST_LAUNCH_DISTANCE (1) cell in one direction
   * via `tryMove` — deliberately the same one-cell-per-tick movement
   * everything else on the grid gets, so a blast nudges material instead of
   * making it visibly jump several cells in one frame (see
   * `expandBlastWaveLayer`'s comment for how repeated touches, not a bigger
   * single push, are what let a grain keep climbing over several frames).
   */
  private launchPush(x: number, y: number, stepX: number, stepY: number, density: number): void {
    if (stepX === 0 && stepY === 0) return;
    let cx = x;
    let cy = y;
    for (let i = 0; i < BLAST_LAUNCH_DISTANCE; i++) {
      if (!this.tryMove(cx, cy, cx + stepX, cy + stepY, density)) break;
      cx += stepX;
      cy += stepY;
    }
    if ((cx !== x || cy !== y) && stepX !== 0) {
      this.flowDir[this.index(cx, cy)] = stepX;
    }
  }

  /** Advances every active BlastWave `layersPerTick` rings further — see `expandBlastWaveLayer`/`BlastWave`. */
  private advanceBlastWaves(): void {
    if (this.blastWaves.length === 0) return;
    const next: BlastWave[] = [];
    for (const w of this.blastWaves) {
      if (w.frontier.length === 0) continue;
      for (let i = 0; i < w.layersPerTick && w.frontier.length > 0; i++) {
        this.expandBlastWaveLayer(w);
      }
      if (w.frontier.length > 0) next.push(w);
    }
    this.blastWaves = next;
  }

  /** Ages out every active Flash — see the struct comment. */
  private advanceFlashes(): void {
    if (this.flashes.length === 0) return;
    const next: Flash[] = [];
    for (const f of this.flashes) {
      f.life--;
      if (f.life > 0) next.push(f);
    }
    this.flashes = next;
  }

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
  private stepLifeGeneration(): void {
    const alive: number[] = [];
    for (let i = 0; i < this.material.length; i++) {
      if (this.material[i] === MaterialId.Vida) alive.push(i);
    }
    if (alive.length === 0) return;
    const aliveSet = new Set(alive);

    const eaten = new Set<number>();
    for (const i of alive) {
      const x = i % this.width;
      const y = (i / this.width) | 0;
      const targets: [number, number][] = [];
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (LIFE_EAT_CHANCE[this.get(nx, ny)] !== undefined) targets.push([nx, ny]);
      }
      if (targets.length === 0) continue;
      const [tx, ty] = targets[Math.floor(Math.random() * targets.length)];
      const chance = LIFE_EAT_CHANCE[this.get(tx, ty)]!;
      if (Math.random() < chance) eaten.add(this.index(tx, ty));
    }

    const candidates = new Set<number>();
    for (const i of alive) {
      candidates.add(i);
      const x = i % this.width;
      const y = (i / this.width) | 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) candidates.add(this.index(nx, ny));
      }
    }

    const deaths: number[] = [];
    const born: number[] = [];
    for (const i of candidates) {
      const x = i % this.width;
      const y = (i / this.width) | 0;
      let count = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny) && aliveSet.has(this.index(nx, ny))) count++;
      }
      if (aliveSet.has(i)) {
        if (count < 2 || count > 3) deaths.push(i);
      } else if (count === 3 && this.material[i] === MaterialId.Empty) {
        born.push(i);
      }
    }

    for (const i of deaths) this.set(i % this.width, (i / this.width) | 0, MaterialId.Empty);
    for (const i of eaten) this.set(i % this.width, (i / this.width) | 0, MaterialId.Vida);
    for (const i of born) this.set(i % this.width, (i / this.width) | 0, MaterialId.Vida);
  }

  /**
   * How much temperature holds plant reproduction back or helps it along
   * — checked by Planta spreading, Semente germinating, and Broto
   * growing, all three being different flavors of "plants reproducing".
   * Colder than neutral slows it down in 3 steps; right in the
   * prosperous band (green background) it gets a boost instead — this is
   * the one place heat helps rather than hurts, since that band
   * specifically represents the temperature life thrives at. Above it,
   * heat goes back to being neutral for growth (it has its own problems —
   * spontaneous fires — instead).
   */
  private growthFactor(): number {
    if (this.temp <= COLD_3) return 0.15;
    if (this.temp <= COLD_2) return 0.4;
    if (this.temp <= COLD_1) return 0.7;
    if (isProsperous(this.temp)) return 1.6;
    return 1;
  }

  private stepOrganic(x: number, y: number): void {
    this.processed[this.index(x, y)] = 1;

    let nearWater = false;
    const emptySpots: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      if (nId === MaterialId.Water) nearWater = true;
      else if (nId === MaterialId.Empty) emptySpots.push([nx, ny]);
    }

    if (nearWater && emptySpots.length > 0 && Math.random() < GROWTH_CHANCE * this.growthFactor()) {
      const [gx, gy] = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      // In the prosperous band, a spreading Planta sometimes blooms into a
      // Flor cell instead of plain leaf — a visible sign it's thriving.
      if (isProsperous(this.temp) && Math.random() < FLOWER_BLOOM_CHANCE) {
        this.set(gx, gy, MaterialId.Flor, Math.floor(Math.random() * 4));
      } else {
        this.set(gx, gy, MaterialId.Plant);
      }
    } else if (isProsperous(this.temp) && emptySpots.length > 0 && Math.random() < PLANT_PROSPEROUS_BLOOM_CHANCE) {
      // Planta itself blossoms directly in the prosperous climate, even
      // without touching Água to trigger its usual water-driven spread —
      // a mature, already-settled patch with no water nearby still gets to
      // flower once the climate is ideal, instead of only ever blooming as
      // a side effect of active growth.
      this.stampProsperousBloom(x, y);
    }
  }

  /**
   * Stamps a small one-shot growth reaching out from an already-mature
   * Planta cell blooming directly in the prosperous climate — alternating
   * between a little flower cluster and a twisted bare branch instead of
   * always the same shape, and only up/sideways (never downward, since a
   * plant doesn't sprout growth into the ground). See
   * PLANT_BLOOM_FLOWER_PATTERNS / PLANT_BLOOM_BRANCH_PATTERNS.
   */
  private stampProsperousBloom(x: number, y: number): void {
    const patterns = Math.random() < 0.5 ? PLANT_BLOOM_FLOWER_PATTERNS : PLANT_BLOOM_BRANCH_PATTERNS;
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    for (const [dx, dy, isFlower] of pattern) {
      const gx = x + dx;
      const gy = y + dy;
      if (!this.inBounds(gx, gy) || this.get(gx, gy) !== MaterialId.Empty) continue;
      if (isFlower) {
        this.set(gx, gy, MaterialId.Flor, Math.floor(Math.random() * 4));
      } else {
        this.set(gx, gy, MaterialId.Sprout, 0);
      }
    }
  }

  /** Terra wicks up touching water and turns to Barro (Mud). */
  private stepDirt(x: number, y: number): void {
    if (Math.random() >= MUD_FORM_CHANCE) return;
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      if (this.get(nx, ny) === MaterialId.Water) {
        this.set(x, y, MaterialId.Mud);
        this.set(nx, ny, MaterialId.Empty);
        return;
      }
    }
  }

  /**
   * Seeds germinate differently depending on which soil they land on. On
   * dry Terra they become a Broto (Sprout) that grows cell by cell up to a
   * random budget — see `stepSprout`. On Barro (already-wet soil) they
   * instead stamp one small random branch-and-flower shape in a single
   * step (see `stampFlower`) — real growth simulation isn't needed there
   * since the result must stay tiny (never more than 3 rows tall) no
   * matter what, and a one-shot stamp guarantees that where a probabilistic
   * grower could only make it likely.
   */
  private stepSeed(x: number, y: number): void {
    // Touching Planta, Broto, Madeira or Flor from any side — not just
    // resting straight on top — instead of soil: there's nothing for it to
    // germinate into there, so it's absorbed harmlessly instead of piling
    // up against them. Checked on all 8 neighbors (not just straight down)
    // because an irregularly-shaped plant clump can just as easily block a
    // seed from the side or a diagonal nook as from directly underneath.
    // Broto matters here as much as the mature growths: dropping a big
    // batch of Sementes at once over a growing patch, some land straight on
    // young Brotos rather than the Plantas/Flores they'll eventually
    // become — without this they'd sit there forever, since a Broto is
    // neither soil to germinate into nor one of the mature growths that
    // absorbs them.
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      if (nId === MaterialId.Plant || nId === MaterialId.Wood || nId === MaterialId.Flor || nId === MaterialId.Sprout) {
        this.set(x, y, MaterialId.Empty);
        return;
      }
    }

    let onMud = false;
    let onDirt = false;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      if (nId === MaterialId.Mud) onMud = true;
      else if (nId === MaterialId.Dirt) onDirt = true;
    }
    if (!onMud && !onDirt) return;
    if (Math.random() >= GERMINATE_CHANCE * this.growthFactor()) return;

    if (onMud) {
      this.stampFlower(x, y);
    } else {
      const budget = SPROUT_BUDGET_MIN + Math.floor(Math.random() * (SPROUT_BUDGET_MAX - SPROUT_BUDGET_MIN));
      this.set(x, y, MaterialId.Sprout, budget);
    }
  }

  /** Stamps one random small branch-and-flower pattern rooted at (x, y) — see FLOWER_PATTERNS, or the taller FLOWER_PATTERNS_PROSPEROUS while conditions are thriving. */
  private stampFlower(x: number, y: number): void {
    this.set(x, y, MaterialId.Sprout, 0);
    const patterns = isProsperous(this.temp) ? FLOWER_PATTERNS_PROSPEROUS : FLOWER_PATTERNS;
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    for (const [dx, dy, isFlower] of pattern) {
      const gx = x + dx;
      const gy = y + dy;
      if (!this.inBounds(gx, gy) || this.get(gx, gy) !== MaterialId.Empty) continue;
      if (isFlower) {
        this.set(gx, gy, MaterialId.Flor, Math.floor(Math.random() * 4));
      } else {
        this.set(gx, gy, MaterialId.Sprout, 0);
      }
    }
  }

  /**
   * A germinated Sprout grows toward open space above it — mostly
   * straight up, sometimes branching sideways — instead of Planta's
   * uniform blob-in-any-empty-neighbor spread, so different seeds come out
   * as different little irregular shapes. Both the parent and the new cell
   * spend one unit of the shared growth budget (carried in `meta`), so a
   * sprout can neither branch forever nor chain arbitrarily deep — once
   * the budget hits zero it's normally a mature, static plant.
   *
   * That cap isn't permanent, though: a plant that finished growing (or
   * was one-shot stamped by a Semente germinating on Barro — see
   * stampFlower, which also builds out of budget-0 Sprout cells) while the
   * climate was anything but ideal doesn't stay stunted forever if the
   * climate later turns prosperous. A budget-exhausted Sprout sitting in
   * the prosperous band gets a slow trickle of bonus budget instead,
   * letting it resume growing exactly like it would have if it had
   * germinated in good conditions to begin with.
   */
  private stepSprout(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const raw = this.meta[i];
    let budget = raw & SPROUT_BUDGET_MASK;
    // Whether this cell (or the regrowth event it descends from) already
    // spent its one prosperous catch-up bonus — see the flag's write site
    // below for why it has to propagate to every cell grown afterward, not
    // just block the exact cell that rolled it.
    let regrown = (raw & SPROUT_REGROWN_FLAG) !== 0;
    if (budget <= 0 && (regrown || !isProsperous(this.temp))) return;

    // Mud counts as moisture too — it's Terra that already absorbed its
    // neighboring Water (see stepDirt), so a sprout rooted in Barro stays
    // "watered" even after the puddle beside it has been consumed. Checked
    // out to 2 cells (not just direct neighbors) so a shoot can still reach
    // its roots' moisture a couple of rows up, instead of stalling the
    // instant it grows one cell away from the water/mud below it.
    let nearMoisture = false;
    for (let dy = -2; dy <= 2 && !nearMoisture; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const nId = this.get(nx, ny);
        if (nId === MaterialId.Water || nId === MaterialId.Mud) {
          nearMoisture = true;
          break;
        }
      }
    }
    if (!nearMoisture) return;

    if (budget <= 0) {
      if (Math.random() >= SPROUT_PROSPEROUS_REGROWTH_CHANCE) return;
      // A one-time catch-up, not a fountain: this cell and every cell it
      // grows from here on carry the "already regrown" flag forward, so
      // repeatedly leaving and re-entering the prosperous climate can't
      // keep re-triggering fresh bonus growth on the same lineage forever
      // — each originally-dormant cell gets exactly one bonus round, ever.
      budget = SPROUT_REGROWTH_BONUS;
      regrown = true;
      this.meta[i] = budget | SPROUT_REGROWN_FLAG;
    }

    if (Math.random() >= GROWTH_CHANCE * this.growthFactor()) return;

    // Weighted toward up/up-left/up-right; sideways branches are rarer, and it never grows down.
    const candidates: [number, number][] = [];
    for (const [dx, dy, weight] of SPROUT_DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny) || this.get(nx, ny) !== MaterialId.Empty) continue;
      for (let w = 0; w < weight; w++) candidates.push([nx, ny]);
    }
    if (candidates.length === 0) return;

    const [gx, gy] = candidates[Math.floor(Math.random() * candidates.length)];
    const childMeta = (budget - 1) | (regrown ? SPROUT_REGROWN_FLAG : 0);
    this.set(gx, gy, MaterialId.Sprout, childMeta);
    this.meta[i] = childMeta;
  }

  /** One grain of Salt fully saturates exactly one touching (not-yet-salty) Water cell, 1:1, then is spent. */
  private stepSalt(x: number, y: number, i: number): void {
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const wi = this.index(nx, ny);
      if (this.material[wi] === MaterialId.Water && this.meta[wi] < 255) {
        this.meta[wi] = 255;
        this.material[i] = MaterialId.Empty;
        this.meta[i] = 0;
        this.wake(x, y);
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
  private stepMetal(x: number, y: number): void {
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      if (this.get(nx, ny) !== MaterialId.Water) continue;
      const salinity = this.meta[this.index(nx, ny)] / 255;
      const chance = RUST_CHANCE * (1 + salinity * (RUST_SALT_MULTIPLIER - 1));
      if (Math.random() < chance) {
        this.set(x, y, MaterialId.Dirt);
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
  private stepIce(x: number, y: number): void {
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      if ((nId === MaterialId.Fire || nId === MaterialId.Lava) && Math.random() < ICE_MELT_CHANCE) {
        this.set(x, y, MaterialId.Water);
        return;
      }
    }
    // Ambient heat melts it too, with no Fogo/Lava required — starts the
    // moment the room is above AMBIENT_ICE_MELT_TEMP and climbs smoothly
    // from there, instead of jumping between fixed tiers.
    if (this.temp > AMBIENT_ICE_MELT_TEMP) {
      const excess = this.temp - AMBIENT_ICE_MELT_TEMP;
      const chance = Math.min(AMBIENT_ICE_MELT_CAP, excess * AMBIENT_ICE_MELT_PER_DEGREE);
      if (Math.random() < chance) {
        this.set(x, y, MaterialId.Water);
        return;
      }
    }
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      if (this.material[ni] === MaterialId.Water && this.meta[ni] === 0 && Math.random() < ICE_FREEZE_CHANCE) {
        this.set(nx, ny, MaterialId.Ice);
      }
    }
  }

  /** Below COLD_1, plant matter starts frosting over: one touching Empty cell has a chance each tick to become Gelo, a rime layer creeping in from the cold. */
  private frostOver(x: number, y: number): void {
    const chance =
      this.temp <= COLD_3 ? PLANT_FROST_3 :
      this.temp <= COLD_2 ? PLANT_FROST_2 :
      PLANT_FROST_1;
    if (Math.random() >= chance) return;
    const emptyNeighbors: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.get(nx, ny) === MaterialId.Empty) emptyNeighbors.push([nx, ny]);
    }
    if (emptyNeighbors.length === 0) return;
    const [fx, fy] = emptyNeighbors[Math.floor(Math.random() * emptyNeighbors.length)];
    this.set(fx, fy, MaterialId.Ice);
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
  private stepLava(x: number, y: number): void {
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      if (this.get(nx, ny) === MaterialId.Water) {
        this.set(x, y, MaterialId.Stone);
        this.set(nx, ny, MaterialId.Empty);
        return;
      }
    }

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nDef = MATERIALS[this.get(nx, ny)];
      if (nDef.flammable && Math.random() < nDef.ignitionChance) this.igniteAt(nx, ny);
    }

    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      const chance =
        nId === MaterialId.Metal ? LAVA_MELT_METAL :
        nId === MaterialId.Sand ? LAVA_MELT_SAND :
        nId === MaterialId.Stone ? LAVA_MELT_STONE :
        0;
      if (chance > 0 && Math.random() < chance) this.set(nx, ny, MaterialId.Lava);
    }
  }

  /**
   * Clone starts locked onto nothing (`meta` 0, the same value as
   * MaterialId.Empty — its "not cloning anything yet" sentinel). The first
   * tick any other material (not Empty, not another Clone) touches one of
   * its 4 sides, it locks onto that material id permanently, no matter what
   * happens to the original touching cell afterward.
   *
   * An unlocked Clone touching an *already-locked* Clone instead slowly
   * inherits that neighbor's lock (at CLONE_PROPAGATE_CHANCE, much rarer
   * than an instant direct touch) — so a whole painted blob of Clone
   * gradually catches the same lock from wherever it first touched
   * something, spreading one connected cell at a time rather than jumping
   * to a disconnected clump elsewhere on the grid. It never overwrites a
   * Clone that's already locked onto something of its own.
   *
   * Once locked, every tick a Clone has a flat chance to spawn one more
   * unit of its material into a touching empty cell — a slow, permanent
   * spring of whatever it first tasted.
   */
  private stepClone(x: number, y: number, i: number): void {
    if (this.meta[i] === MaterialId.Empty) {
      const candidates: MaterialId[] = [];
      const lockedCloneNeighbors: MaterialId[] = [];
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.index(nx, ny);
        const nId = this.material[ni] as MaterialId;
        if (nId === MaterialId.Clone) {
          if (this.meta[ni] !== MaterialId.Empty) lockedCloneNeighbors.push(this.meta[ni] as MaterialId);
        } else if (nId !== MaterialId.Empty) {
          candidates.push(nId);
        }
      }
      // Eletricidade has no physical form, so it's never written into
      // `material` (see the Pulse comment) — a Clone can only "touch" it by
      // checking whether a live charge currently happens to be passing
      // through one of its 4 neighbor cells this tick.
      if (this.pulses.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) === 1)) {
        candidates.push(MaterialId.Electricity);
      }
      if (candidates.length > 0) {
        this.meta[i] = candidates[Math.floor(Math.random() * candidates.length)];
        return;
      }
      if (lockedCloneNeighbors.length > 0 && Math.random() < CLONE_PROPAGATE_CHANCE) {
        this.meta[i] = lockedCloneNeighbors[Math.floor(Math.random() * lockedCloneNeighbors.length)];
      }
      return;
    }

    if (Math.random() >= CLONE_CHANCE) return;
    const emptyNeighbors: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.get(nx, ny) === MaterialId.Empty) emptyNeighbors.push([nx, ny]);
    }
    if (emptyNeighbors.length === 0) return;
    const [gx, gy] = emptyNeighbors[Math.floor(Math.random() * emptyNeighbors.length)];
    const clonedId = this.meta[i] as MaterialId;
    if (clonedId === MaterialId.Electricity) {
      // Same as the Eletricidade brush (see paintCell): drops a fresh
      // free-falling charge rather than writing into `material`.
      this.pulses.push({ x: gx, y: gy, dx: 0, dy: 1, steps: 0, inConductor: false, life: PULSE_AIR_LIFE });
    } else {
      this.set(gx, gy, clonedId, this.metaFor(clonedId));
    }
  }

  /** Acid spends one charge per tick attempting to dissolve a touching neighbor; tougher materials are more likely to survive the attempt. */
  private stepAcid(x: number, y: number, i: number): void {
    const targets: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      if (MATERIALS[nId].acidResistance > 0) targets.push([nx, ny]);
    }
    if (targets.length === 0) return;

    const [tx, ty] = targets[Math.floor(Math.random() * targets.length)];
    const resistance = MATERIALS[this.get(tx, ty)].acidResistance;
    if (Math.random() < 1 / resistance) {
      this.set(tx, ty, MaterialId.Empty);
    }
    this.meta[i]--;
    if (this.meta[i] <= 0) {
      this.material[i] = MaterialId.Empty;
      this.meta[i] = 0;
      this.wake(x, y);
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
  private advancePulses(): void {
    if (this.pulses.length === 0) return;
    const posKey = (x: number, y: number) => x * this.height + y;
    const positions = new Set(this.pulses.map((p) => posKey(p.x, p.y)));
    const next: Pulse[] = [];
    for (const p of this.pulses) {
      p.steps++;
      if (p.steps > PULSE_MAX_STEPS) continue;

      if (p.inConductor) {
        let advanced = false;
        for (const [ddx, ddy] of this.pulseDirCandidates(p.dx, p.dy)) {
          const nx = p.x + ddx;
          const ny = p.y + ddy;
          if (!this.inBounds(nx, ny) || !this.conducts(nx, ny)) continue;
          next.push({ x: nx, y: ny, dx: ddx, dy: ddy, steps: p.steps, inConductor: true, life: p.life });
          advanced = true;
          break;
        }
        if (advanced) continue;

        const ex = p.x + p.dx;
        const ey = p.y + p.dy;
        if (!this.inBounds(ex, ey)) continue;
        const exitId = this.get(ex, ey);
        const exitDef = MATERIALS[exitId];
        if (exitDef.flammable) this.igniteAt(ex, ey);
        else if (exitId === MaterialId.Glass) this.shatterGlass(ex, ey);
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
      const life = Math.min(PULSE_AIR_LIFE, p.life - 1 + (touching ? PULSE_TOUCH_BONUS : 0));
      if (life <= 0) continue;

      // Pulled into any touching conductor, ignites any touching flammable.
      let reacted = false;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const nId = this.get(nx, ny);
        const def = MATERIALS[nId];
        if (def.conductive && this.conducts(nx, ny)) {
          next.push({ x: nx, y: ny, dx, dy, steps: p.steps, inConductor: true, life });
          reacted = true;
          break;
        }
        if (def.flammable) {
          this.igniteAt(nx, ny);
          reacted = true;
          break;
        }
        if (nId === MaterialId.Glass) {
          this.shatterGlass(nx, ny);
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
        if (this.inBounds(driftX, ty) && this.get(driftX, ty) === MaterialId.Empty) tx = driftX;
      }
      if (this.inBounds(tx, ty) && this.get(tx, ty) === MaterialId.Empty) {
        next.push({ x: tx, y: ty, dx: tx - p.x, dy: rows, steps: p.steps, inConductor: false, life });
      } else if (rows === 2 && this.inBounds(p.x, p.y + 1) && this.get(p.x, p.y + 1) === MaterialId.Empty) {
        // The 2-row leap landed somewhere blocked — fall back to a normal single-row step instead of just stopping.
        next.push({ x: p.x, y: p.y + 1, dx: 0, dy: 1, steps: p.steps, inConductor: false, life });
      }
      // Blocked by something inert (or the floor) with nothing nearby to
      // react to — the charge has nowhere left to go and simply ends.
    }
    this.pulses = next;
  }

  /**
   * Whether a charge can pass through this cell right now. Metal (and any
   * other always-conductive material) simply can; Water is a conductor but
   * not a reliable one — plain Water only carries the charge some of the
   * time, while salty Water carries it almost every time, so a saltier
   * puddle reads as visibly "better wired" than a fresh one.
   */
  private conducts(x: number, y: number): boolean {
    const id = this.get(x, y);
    const def = MATERIALS[id];
    if (!def.conductive) return false;
    if (id === MaterialId.Water) {
      const salinity = this.meta[this.index(x, y)] / 255;
      const chance = WATER_BASE_CONDUCT_CHANCE + (1 - WATER_BASE_CONDUCT_CHANCE) * salinity;
      return Math.random() < chance;
    }
    return true;
  }

  /** Straight ahead first, then every other direction except doubling straight back. */
  private pulseDirCandidates(dx: number, dy: number): readonly (readonly [number, number])[] {
    const rest = NEIGHBORS_8.filter(([ddx, ddy]) => !(ddx === dx && ddy === dy) && !(ddx === -dx && ddy === -dy));
    return [[dx, dy], ...rest];
  }
}
