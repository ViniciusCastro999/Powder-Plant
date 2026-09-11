import { MaterialCategory, MaterialId, type DragBlob } from "./types";
import { MATERIALS, SINGLE_DROP_MATERIALS } from "./materials";
import { NEUTRAL_TEMP, EXTREME_COLD, EXTREME_HOT, COLD_1, COLD_2, COLD_3, HOT_2, isProsperous } from "./temperature";
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
const SPROUT_BUDGET_MASK = 0x3f;
const SPROUT_REGROWN_FLAG = 0x80;
/** Meta bit marking a Sprout (and everything grown from it) as a Lenhador's cultivated tree — it grows without needing water/mud close by, since the forester tends it. */
const SPROUT_FOREST_FLAG = 0x40;
/**
 * Meta bit on a Madeira cell marking it as a living tree's trunk (grown by
 * stepSprout, not cut by anyone yet). A trunk renders like ordinary wood but
 * isn't counted as stockpiled timber and won't be pulled into a bridge — only
 * a Lenhador felling the tree turns it into plain, harvestable Madeira. Sits
 * clear of the HOUSE_* bits (0x40 wall / 0x80 anchor / 0x07 kind).
 */
const TREE_TRUNK_META = 0x20;
/** Meta bit on a Semente marking it as one a Lenhador sowed — it germinates with a bigger growth budget so it fills out into a real tree, not a shrub. */
const FOREST_SEED_META = 1;
/** Growth budget a forester's seedling germinates with (vs a wild Semente's SPROUT_BUDGET_MIN..MAX) — enough for a trunk and a tidy crown, no more. Fits in the 6-bit budget field. */
const FOREST_SEED_BUDGET = 22;
/** A forest tree stops growing once it carries this many crown cells — keeps a tended tree from ballooning into a canopy blanket. */
const TREE_CROWN_CAP = 26;
/** How many cells a tree grows a bare vertical trunk before its crown bushes out. */
const TREE_TRUNK_HEIGHT = 4;
/** Per-tick chance a low, canopy-topped Sprout cell hardens into a Madeira trunk. */
const TREE_HARDEN_CHANCE = 0.12;
/** Crown cells (Sprout/Planta/Flor above) a trunk cell needs before it starts to lignify. */
const TREE_CROWN_FOR_BARK = 2;
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

/*
 * ── Trigo (the Plantador's crop) ────────────────────────────────────────
 * A wheat cell's `meta` is a 0-255 ripeness clock. It ticks up every step
 * (scaled by the climate `growthFactor`); the renderer greens it low and
 * golds it high. A shoot with headroom and its roots still near soil grows
 * a fresh cell on top up to WHEAT_MAX_HEIGHT. From WHEAT_RIPE on it's ripe:
 * food for the folk (see folkUpkeep / stepFarmer) and, rarely, it flings a
 * seed onto adjacent bare soil. An unrooted or hard-frosted stalk withers.
 */
const WHEAT_RIPEN_PER_TICK = 1;
const WHEAT_GROW_AT = 26;      // min ripeness before a cell shoots one above it
const WHEAT_RIPE = 120;        // ripeness at which a head is harvestable / edible
const WHEAT_MAX_HEIGHT = 3;
const WHEAT_GROW_CHANCE = 0.06;
const WHEAT_SEED_CHANCE = 0.006; // ripe head self-seeds onto adjacent bare soil
const WHEAT_WITHER_CHANCE = 0.05;
/** Cells of level furrow the Plantador needs ahead of it before it will sow a shoot (it grades a slightly wider strip). */
const WHEAT_FURROW = 1;
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
/** Per-tick chance a Sand cell touching Lava or Fire fuses into Glass instead of melting — glassblowing by the fire. */
const HEAT_FUSE_GLASS = 0.03;
/** Per-tick chance a Stone cell touching Lava melts into Lava — slowest. */
const LAVA_MELT_STONE = 0.0025;
/** Per-tick chance a Gelo cell freezes a touching fresh-water neighbor into more Gelo. */
const ICE_FREEZE_CHANCE = 0.02;
/** Per-tick chance a Gelo cell touching Fogo/Lava melts back into Água. */
const ICE_MELT_CHANCE = 0.18;
/**
 * Purely a visual flourish — see `Debris` for what actually shoves material
 * around. Shrapnel is evenly spread around the full circle from the
 * epicentre (plus a little angle jitter so it doesn't read as a perfect
 * starburst) and still shatters Glass on contact, but never moves grid
 * material itself.
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
/**
 * Hard ceiling on how many individual pops (`detonate` calls) happen in one
 * tick, no matter how much explosive is in play. Each pop is cheap on its
 * own, but a big enough charge — especially one lit all along one edge, so a
 * whole wide ring's fuses read zero on the same tick — can otherwise queue up
 * thousands of them at once and stall the frame for so long the page reads as
 * hung. Past this budget a fuse that hits zero, or a fresh ignition, just
 * waits one more tick and tries again instead of detonating immediately — the
 * blast still goes off in full, it just takes a few extra ticks to finish
 * eating a monster pile instead of freezing the game trying to do it in one.
 */
const DETONATIONS_PER_TICK_CAP = 240;
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

/*
 * ── Creatures (Formiga, Pássaro, Peixe) ───────────────────────────────────
 *
 * Animals don't fall — they pursue a simple goal each tick (a walker
 * hugging surfaces, a bird holding a cruising altitude, a fish staying
 * submerged). All three pack the same state layout into their one `meta`
 * byte, since `meta` is what rides along through `swap()`:
 *
 *   bit 0        facing: 0 = left, 1 = right
 *   bits 1..2    a small per-creature timer/phase (drown, flop, lay)
 *   bits 3..7    a 0-31 "fed" gauge — food refills it, it drains over time,
 *                and at 0 the creature slowly dies of hunger
 *
 * Deliberately low reproduction and non-zero starvation so a scene doesn't
 * fill up with animals: a colony only holds if there's food to sustain it.
 */
const CREATURE_FED_MAX = 31;
const CREATURE_FED_BITS = 3;
/**
 * Per-tick chance a creature whose fed gauge has been sitting at 0 finally
 * dies of starvation. Deliberately tiny: a well-fed animal takes a long
 * time to run its gauge down in the first place, and even once it's
 * completely starved it lingers for a good while — so a colony with any
 * food at all holds indefinitely, and only a swarm left with truly nothing
 * to eat slowly thins out.
 */
const CREATURE_STARVE_DEATH_CHANCE = 0.0005;
/** How many connected flammable creatures one ignition flashes over at once — this is what makes fire sweep a whole trail/flock instead of dying with the one it caught. A perf budget, not a balance knob. */
const CREATURE_FIRE_FLOOD_CAP = 600;

/** Per-tick chance a submerged/idle Formiga drowns while touching Água. */
const ANT_DROWN_CHANCE = 0.2;
/** Ticks between each 1-point drain of a Formiga's fed gauge (so ~31·this ticks — roughly half a minute — of grace with no food at all). */
const ANT_HUNGER_INTERVAL = 55;
/** Per-tick chance a Formiga eats a touching Planta/Broto/Flor/Semente. */
const ANT_EAT_CHANCE = 0.5;
/** Per-tick chance a Formiga gnaws a touching solid it can actually eat (Madeira, Barro) — much slower than fresh greenery, so an ant-infested wooden wall crumbles gradually rather than vanishing. */
const ANT_EAT_SOLID_CHANCE = 0.06;
/** Fed points one bite of solid food restores (a full Planta/Semente meal tops the gauge right off). */
const ANT_SOLID_FEED_GAIN = 14;
/** Per-tick chance a well-fed Formiga next to an empty cell lays a new Formiga there. */
const ANT_BREED_CHANCE = 0.006;
/** Per-tick chance a walking Formiga burrows one step into loose Areia/Terra/Barro instead of only walking on top of it — this is what carves anthill tunnels. */
const ANT_DIG_CHANCE = 0.08;
/** Per-tick chance a Formiga spontaneously reverses direction, so a colony wanders instead of marching one way forever. */
const ANT_TURN_CHANCE = 0.03;
/** How many cells away a Formiga picks up the scent of food (Planta/Broto/Flor/Semente/Madeira/Barro) and turns toward it. */
const ANT_SMELL_RANGE = 7;

/** Rows from the top / fraction of height a Pássaro tries to stay between — it climbs when below the band and descends when above it. */
const BIRD_BAND_TOP_FRAC = 0.08;
const BIRD_BAND_BOTTOM_FRAC = 0.62;
/** How many cells away a Pássaro notices Fogo/Lava and starts fleeing. */
const BIRD_HAZARD_RANGE = 7;
/** How far a Pássaro spots a Formiga on the ground or a Peixe breaking the surface, then swoops straight at it. */
const BIRD_HUNT_RANGE = 13;
/** Fed level below which a Pássaro leaves its high cruise and patrols low to hunt. */
const BIRD_HUNGER_DIVE = 19;
/** Ticks between each 1-point drain of a Pássaro's fed gauge. */
const BIRD_HUNGER_INTERVAL = 55;
/** Fed points a Pássaro gains from one meal (Semente, Formiga, Peixe). */
const BIRD_FEED_GAIN = 12;
/** Per-tick chance a well-fed Pássaro drops a Semente into the open cell below it — deliberately tiny, since a whole flock shares this roll every tick. */
const BIRD_LAY_CHANCE = 0.0025;
const BIRD_TURN_CHANCE = 0.04;

/** Flop-timer steps (bits 1..2, so 0-3) a Peixe survives out of water; the timer only advances every FISH_AIR_TICK_SCALE ticks, so total grace ≈ FISH_AIR_TICKS·FISH_AIR_TICK_SCALE ticks of flopping to find its way back. */
const FISH_AIR_TICKS = 3;
const FISH_AIR_TICK_SCALE = 9;
/** Ticks between each 1-point drain of a Peixe's fed gauge. */
const FISH_HUNGER_INTERVAL = 70;
/** Per-tick chance a Peixe nibbles a touching submerged Planta/Broto/Semente. */
const FISH_EAT_CHANCE = 0.35;
/** Rows overhead a Peixe watches for a Pássaro — spots one and it dives for deep water, its only escape from a swoop. */
const FISH_BIRD_SCARE = 5;
/** Per-tick chance a well-fed Peixe with room around it spawns another Peixe into an adjacent Água cell. */
const FISH_BREED_CHANCE = 0.005;

/*
 * ── O povo (Construtor, Lenhador, Plantador, Guerreiro) ─────────────────────
 * Upright folk. They walk surfaces like a Formiga (shared `folkWalk`), each
 * running its own trade on top of that. State byte reuses the creature
 * layout: bit 0 facing, bit 1 (via `creatureTimer` == 1) "carrying
 * something", bits 3..7 a fed gauge. They eat the same greenery/wood ants
 * do and starve only very slowly (CREATURE_STARVE_DEATH_CHANCE) — they're
 * agents in the world, not a population to balance. Água drowns them, Lava
 * kills on contact, Fogo lights them by the flame's own roll.
 */
const FOLK_HUNGER_INTERVAL = 320;
const FOLK_DROWN_CHANCE = 0.03;
const FOLK_EAT_CHANCE = 0.4;
/**
 * A Pip only takes a turn (a step, and any work that goes with it) every
 * Nth tick, staggered by its column so a crowd doesn't all move on the same
 * frame. Higher = slower, more deliberate folk. Everything a Pip does —
 * walking, digging, building, tending — is paced by this, so the trades
 * read as unhurried labour rather than a scramble.
 */
const FOLK_ACT_INTERVAL = 4;

/** How many cells around itself each tradesman scans for its work (water, soil, trees, damaged houses, build sites). Staggered per-column so they don't all scan the same frame. */
const FOLK_SCAN_RANGE = 28;
/** How far off an idle Pip will still spot its worksite and amble back toward it rather than striking out across the map. Only kicks in past FOLK_HOME_NEAR, so Pips at work roam freely and don't pile up. */
const FOLK_HOME_RANGE = 60;
/** Inside this many cells of a worksite a Pip roams free; past it, it ambles back. A Construtor gets a longer leash — it has to range out past a whole village to find fresh ground for the next house. */
const FOLK_HOME_NEAR = 20;
const MASON_HOME_NEAR = 36;
/**
 * What an idle Pip of each trade drifts back toward — its own kind of
 * worksite, plus the houses. Never other folk: folk drawn to folk collapse
 * into one frozen clump.
 */
const FOLK_HOME: Partial<Record<MaterialId, readonly MaterialId[]>> = {
  [MaterialId.Mason]: [MaterialId.Brick],
  [MaterialId.Farmer]: [MaterialId.Brick, MaterialId.Wheat, MaterialId.Mud],
  [MaterialId.Lumberjack]: [MaterialId.Brick, MaterialId.Wood, MaterialId.Sprout, MaterialId.Plant],
  [MaterialId.Warrior]: [MaterialId.Brick],
};

/** Per-tick chance a Lenhador fells a fully-grown tree it's touching into Madeira. */
const LUMBERJACK_FELL_CHANCE = 0.22;
/** Per-tick chance a Lenhador sows a Semente on the bare soil ahead of it. */
const LUMBERJACK_SOW_CHANCE = 0.32;
/** How clear of other greenery a patch has to be before a Lenhador plants there. */
const LUMBERJACK_SPACING = 4;
/** Width of the strip a Lenhador levels flat before sowing a seedling, like the other trades grade before they work. */
const LUMBERJACK_PLOT = 2;
/** Loose Madeira logs a felled tree yields, scattered on the ground beside the (now-clear) stump. */
const LUMBERJACK_LOG_YIELD = 3;
/** Madeira within 6 cells at or above which a Lenhador stops felling — the woodlot's stocked, don't carpet the ground with trunks. */
const LUMBERJACK_STOCK = 10;
/** How much crown (Broto/Planta/Flor cells around the base) a tree needs before a Lenhador will fell it — a fully stamped crown is ~17 cells, so this only clears once the tree has finished growing, never a sapling or a half-grown one. */
const LUMBERJACK_MIN_TREE = 12;

/** Per-tick chance a Fazendeiro sows Trigo / waters Terra when it's in the right spot. */
const FARMER_WORK_CHANCE = 0.4;
/** Act-turns a Fazendeiro / Lenhador spends stood working a harvest before it comes in — harvesting isn't instant. */
const HARVEST_WORK = 5;
/** How far a Fazendeiro / Lenhador looks for its storehouse to stash a load into. */
const STORE_REACH = 30;

/** Cut Madeira anywhere on the map at or above which the Construtor has stock enough to start decking a bridge — the woodlot has to be worked up first. Kept comfortably under LUMBERJACK_STOCK so even a single Lenhador's own woodpile clears it; any higher and a village with just one or two foresters never sees a bridge, since each Lenhador stops cutting once its own stock hits LUMBERJACK_STOCK. */
const BRIDGE_TIMBER_MIN = 8;

/** Hit points a fresh unit spawns with, by kind. Working folk are frail; the Guerreiro is built to last; a Esqueleto is somewhere between. */
const SPAWN_HP: Partial<Record<MaterialId, number>> = {
  [MaterialId.Mason]: 5,
  [MaterialId.Lumberjack]: 5,
  [MaterialId.Farmer]: 5,
  [MaterialId.Warrior]: 10,
  [MaterialId.Skeleton]: 5,
};
/** Damage one strike lands. */
const ATTACK_DAMAGE = 1;
/** Ticks between strikes — a unit lands roughly one blow a second (the sim runs ~60 ticks/s). */
const ATTACK_PERIOD = 54;
/** Ticks a red hit-marker flashes at a struck cell. */
const HIT_FLASH_LIFE = 7;
/** `hp` byte: low 7 bits are the points, the top bit flags a unit empowered by Magia (twice the damage, twice the size). */
const HP_POINTS_MASK = 0x7f;
const HP_EMPOWERED = 0x80;
/** How far a Guerreiro scans for a Esqueleto to go and meet — a wide watch, so a guard picks up a threat well before it reaches the houses. */
const WARRIOR_SIGHT = 52;
/** How far a Esqueleto scans for a Pip to hunt. */
const SKELETON_SIGHT = 24;
/** Within this many cells of a Esqueleto, a working Pip drops its task and backs away — it's faster than the undead, so it can. */
const SKELETON_FLEE_RANGE = 11;
/** A Esqueleto takes a turn only every Nth tick — slower and more lurching than the folk (FOLK_ACT_INTERVAL). */
const SKELETON_ACT_INTERVAL = 8;
/**
 * Short radius a Guerreiro / Esqueleto checks for a foe *every* tick, so a
 * fight already underway never stutters. The full WARRIOR_SIGHT /
 * SKELETON_SIGHT sweep for spotting a new threat from afar is expensive
 * (a (2·range+1)² box, and it comes up empty — the whole box has to be
 * checked — on every tick there's simply nothing around, which with a
 * houseful of guards is most ticks) so that one only runs on the ordinary
 * work cadence instead. A real fight is always well inside this radius long
 * before that cadence would notice it late.
 */
const COMBAT_MELEE_CHECK = 6;

/**
 * Simple circuit: an Alavanca's `meta` low bit is its on/off state (flipped
 * by right-clicking it — see `toggleLever`); a Fio's and a Porta's low bit is
 * whether they're currently powered, recomputed fresh every tick by tracing
 * back through connected Fio to an actually-on Alavanca (`circuitPowered`)
 * rather than just checking a neighbor's own bit — the latter would let a
 * closed loop of Fio (or a run left behind after its Alavanca switches off)
 * keep "confirming" itself forever, each cell citing the neighbor citing it
 * right back, with the real source gone.
 */
const CIRCUIT_ON_META = 0x01;
/** Marks a stamped Alavanca cell as the knob rather than the housing frame — see LEVER_FRAME/LEVER_KNOB_* and PixiStage's Alavanca render, which shades the two apart so the fixture reads as an actual switch instead of a flat block. Independent of CIRCUIT_ON_META (bit 0). */
const LEVER_ARM_META = 0x02;
/** Cap on how many connected Fio cells one circuitPowered trace visits — a perf budget for a pathological loop of wire, not a limit anyone wiring up a door will ever bump into. */
const CIRCUIT_FLOOD_CAP = 4000;
/**
 * A single click of Alavanca stamps a narrow housing (LEVER_FRAME, offsets
 * from its anchor at the top-left) with a knob sitting inside it — down at
 * LEVER_KNOB_OFF to start. Flipping it (`toggleLever`) doesn't just recolor:
 * the knob cell itself moves, to LEVER_KNOB_ON up top, an actual switch
 * thrown, not a paint job — so the housing has to be tall enough to hold
 * both slots with a gap between them.
 */
const LEVER_FRAME: readonly [number, number][] = [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [2, 1],
  [0, 2], [2, 2],
  [0, 3], [2, 3],
  [0, 4], [1, 4], [2, 4],
];
const LEVER_KNOB_ON: readonly [number, number] = [1, 1];
const LEVER_KNOB_OFF: readonly [number, number] = [1, 3];
/** Cap on how many connected Alavanca cells one toggleLever flip visits — a perf budget, well past the size of any lever fixture actually placed. */
const LEVER_FLOOD_CAP = 64;
/** Per-tick chance a Esqueleto with nothing in sight shuffles a step / turns. */
const SKELETON_WANDER_CHANCE = 0.5;

/** The four trades of o povo (the Guerreiro included — it's one of the folk, it just fights instead of building). */
const FOLK_IDS: readonly MaterialId[] = [
  MaterialId.Mason, MaterialId.Lumberjack, MaterialId.Farmer, MaterialId.Warrior,
];
/** Every Pip a Esqueleto will hunt. */
const PIP_IDS: readonly MaterialId[] = FOLK_IDS;
const WATER_ONLY = [MaterialId.Water] as const;
/** Standing growth a folk walks straight through instead of climbing or snagging on — crops and plant matter. */
const FOLK_WADEABLE = new Set<MaterialId>([
  MaterialId.Wheat, MaterialId.Plant, MaterialId.Sprout, MaterialId.Flor, MaterialId.Seed,
]);
/** Grown greenery a Lenhador fells for timber, and casts about for. */
const LUMBERJACK_TREES: readonly MaterialId[] = [MaterialId.Plant, MaterialId.Sprout];
/** Stray mature growth a Plantador harvests alongside its ripe Trigo. */
const FARMER_CROPS: readonly MaterialId[] = [MaterialId.Plant, MaterialId.Flor];
/** Below this fed level a folk with no urgent task heads for the nearest wheat. */
const FOLK_FORAGE_HUNGER = 14;
/** Below this it drops its trade entirely and makes for food — survival first. */
const FOLK_STARVING = 6;
/** How far a starving folk casts about for something to eat. */
const FOLK_FORAGE_RANGE = 38;
/** The only thing o povo eat: Trigo. They move the world around, they don't graze it. */
const FOLK_FORAGE: readonly MaterialId[] = [MaterialId.Wheat];
const DRY_SOIL = [MaterialId.Dirt] as const;

/*
 * ── Houses ──────────────────────────────────────────────────────────────
 * A Construtor doesn't just wall a field off — given a clear patch of ground
 * and a carried load it *founds a house* in one go: one Tijolo cell at the
 * left doorpost (the "anchor"), its `meta` packing an anchor flag, the
 * wall-material style, and which of the HOUSE_PLANS sizes it is; then every
 * wall and roof cell of that plan, stamped relative to the anchor.
 *
 * Four sizes, chosen by how much clear ground and how much loose supply the
 * founding survey turns up — a cramped lot with a little earth gets a
 * lean-to, a broad lot backed by a forest gets a whole timber hall. Each
 * plan shelters a set number of folk (roughly its interior width); a
 * chilled folk heading indoors skips a house that's already full and makes
 * for the next one.
 *
 * The wall material is likewise from what's abundant: Madeira → timber,
 * plentiful Gelo in a cold climate → an ice hut, otherwise loose earth
 * fired into Tijolo.
 *
 * Masons also keep standing houses in repair: a Construtor passing a house
 * with a hole knocked in it (fire, blast) fills the gap back in.
 *
 * When the ambient climate leaves [FOLK_COMFORT_MIN, MAX] the folk drop
 * their trades and head for shelter; anyone caught out in it too long dies
 * of exposure. "Sheltered" is purely geometric — a wall-material roof
 * overhead and a wall to either side — so a hand-built brick box counts
 * too. Folk squeeze straight through a thin house wall (see `folkPhase`)
 * rather than pacing a dead end, so a warren of houses never boxes them in.
 */
const HOUSE_ANCHOR_META = 0x80;
/** Meta bit marking a Tijolo/Madeira/Gelo cell as part of a mason's house (the anchor carries it too) — tells repair which cells it owns and lets folk phase through them. */
const HOUSE_WALL_META = 0x40;
const HOUSE_WALL_BRICK = 0;
const HOUSE_WALL_WOOD = 1;
const HOUSE_WALL_ICE = 2;
/** Style code → the material the walls are built of. All must be true Solids — a Pedra/Areia "roof" would just cave in, since those are Powders here. */
const HOUSE_WALL_MATERIAL = [MaterialId.Brick, MaterialId.Wood, MaterialId.Ice] as const;
/** Any of these overhead + on both sides counts as shelter — the structural solids a roof can actually be made of. */
const HOUSE_WALLS: readonly MaterialId[] = [
  MaterialId.Brick, MaterialId.Wood, MaterialId.Ice, MaterialId.Metal, MaterialId.Glass,
];

/**
 * One buildable house. `span` = anchor→right-wall distance, `rise` = side-wall
 * height, `roof` = the roof silhouette, `capacity` = folk it shelters,
 * `supply` = loose building material the founding survey must turn up.
 */
type RoofShape = "flat" | "gable" | "lean" | "hip" | "crown";
interface HousePlan {
  span: number;
  rise: number;
  roof: RoofShape;
  capacity: number;
  supply: number;
  /** A storehouse, not a dwelling: no door, no chimney, no windows — a closed bin the folk stack harvest into. Built by the Fazendeiro (grain) / Lenhador (wood), never the Construtor. */
  store?: "grain" | "wood";
}
/** Smallest → largest dwellings (0-5), then the two storehouses (6-7). The anchor's `meta` stores the index (bits 2-4), so a mason returning later knows the shape to repair it to. */
const HOUSE_PLANS: readonly HousePlan[] = [
  { span: 3, rise: 2, roof: "lean",  capacity: 2, supply: 8 },   // 0 · abrigo — a lean-to shed
  { span: 4, rise: 3, roof: "gable", capacity: 3, supply: 14 },  // 1 · casa — a peaked cottage
  { span: 5, rise: 3, roof: "hip",   capacity: 5, supply: 22 },  // 2 · casarão — a hipped house
  { span: 3, rise: 5, roof: "crown", capacity: 4, supply: 28 },  // 3 · torre — a battlemented tower
  { span: 7, rise: 4, roof: "gable", capacity: 9, supply: 40 },  // 4 · salão — a long peaked hall
  { span: 9, rise: 4, roof: "hip",   capacity: 13, supply: 56 }, // 5 · solar — a great hipped manor
  { span: 4, rise: 3, roof: "flat",  capacity: 0, supply: 16, store: "grain" }, // 6 · celeiro
  { span: 4, rise: 3, roof: "flat",  capacity: 0, supply: 16, store: "wood" },  // 7 · galpão
];
/** Plan indices the Construtor will actually found (the rest are storehouses). */
const MASON_MAX_PLAN = 5;
const PLAN_GRANARY = 6;
const PLAN_WOODSHED = 7;
/** Widest dwelling span the Construtor ever founds — the two storehouses tacked on the end of HOUSE_PLANS are narrower than that, so this can't just be HOUSE_PLANS.at(-1).span any more (that used to be the biggest house, back when the array held only dwellings). Used to keep a house's footprint well clear of the water it'd otherwise trap folk against. */
const HOUSE_MAX_DWELLING_SPAN = Math.max(...HOUSE_PLANS.slice(0, MASON_MAX_PLAN + 1).map((p) => p.span));

/**
 * Each blueprint cell carries a `kind` so a house reads as a building, not a
 * wire outline: wall / roof, plus windows set into the walls, a masonry
 * chimney above the roof, and — on the bigger plans — a doubled wall base
 * and eaves that overhang the walls. `kind` is packed into the cell's `meta`
 * (bits 0-2) alongside HOUSE_WALL_META so repair keeps the right material
 * there and the renderer can light the windows and cap the chimney.
 */
const HOUSE_WALL = 0;
const HOUSE_ROOF = 1;
const HOUSE_WINDOW = 2;
const HOUSE_CHIMNEY = 3;
const HOUSE_FLOOR = 4;
const HOUSE_KIND_MASK = 0b111;
type HouseCell = readonly [number, number, number]; // dx, dy, kind

/** The material a house cell of `kind` is built from, for wall style `style`. */
function houseCellMaterial(kind: number, style: number): MaterialId {
  if (kind === HOUSE_CHIMNEY) return MaterialId.Brick; // chimneys are always masonry
  return HOUSE_WALL_MATERIAL[style];
}

/**
 * The cells of a plan as [dx, dy, kind] from the anchor (left wall foot, on
 * the ground at the folk's own walking row). Side walls rise `rise` cells
 * (doubled at the base on the wider plans); the right wall's foot is the
 * doorway, left open. A roof caps it from dy = -rise up in one silhouette:
 *  - flat  — a level slab.        - hip   — gable with a short flat ridge.
 *  - gable — steps up to a peak.  - crown — flat slab with merlons.
 *  - lean  — one slope, high at the left wall down to the doorway.
 * Then eaves overhanging the walls, a lit window or three set into the walls,
 * and a chimney stack above the roof by the left wall.
 */
function houseCells(plan: HousePlan): HouseCell[] {
  const { span, rise } = plan;
  // A storehouse is a closed box: four walls, a flat lid, a solid floor, and
  // nothing else — no doorway (so the harvest stacked inside doesn't spill),
  // no chimney, no windows.
  if (plan.store) {
    const box: [number, number, number][] = [];
    for (let dy = 0; dy > -rise; dy--) {
      box.push([0, dy, HOUSE_WALL]);
      box.push([span, dy, HOUSE_WALL]);
    }
    for (let dx = 0; dx <= span; dx++) {
      box.push([dx, -rise, HOUSE_ROOF]);
      box.push([dx, 1, HOUSE_FLOOR]);
    }
    return box;
  }
  const roof = plan.roof;
  const cells: [number, number, number][] = [];
  const thick = span >= 8 ? 1 : 0; // wider houses get a two-cell-thick base course
  for (let dy = 0; dy > -rise; dy--) {
    cells.push([0, dy, HOUSE_WALL]);
    cells.push([span, dy, HOUSE_WALL]);
    if (thick && dy > -2) { // doubled lower wall
      cells.push([1, dy, HOUSE_WALL]);
      cells.push([span - 1, dy, HOUSE_WALL]);
    }
  }
  const roofY = (dx: number): number => {
    if (roof === "gable") return rise + Math.min(dx, span - dx);
    if (roof === "hip") return rise + Math.min(dx, span - dx, Math.max(1, Math.floor(span / 3)));
    if (roof === "lean") return rise + Math.round((span - dx) * 0.6);
    return rise; // flat / crown
  };
  let peakH = rise;
  for (let dx = -1; dx <= span + 1; dx++) {
    const h = roofY(Math.max(0, Math.min(span, dx)));
    peakH = Math.max(peakH, h);
    cells.push([dx, -h, HOUSE_ROOF]); // dx -1 and span+1 are the overhanging eaves
    if (dx === 0 || dx === span) {
      for (let k = rise; k < h; k++) cells.push([dx, -k, HOUSE_WALL]); // close the gable end
    }
    if (roof === "crown" && dx >= 0 && dx <= span && dx % 2 === 0) cells.push([dx, -rise - 1, HOUSE_WALL]); // merlon
  }
  // The doorway: clear the right wall's foot (one cell, two on a thick wall).
  const door = new Set([`${span},0`]);
  if (thick) door.add(`${span - 1},0`);
  // Windows set into the side walls (that's where there's wall to set them
  // in): one mid-height each side, plus an attic window high on the left of
  // the taller houses.
  const winY = Math.max(1, Math.floor(rise / 2));
  cells.push([0, -winY, HOUSE_WINDOW]);
  cells.push([span, -winY, HOUSE_WINDOW]);
  if (rise >= 5) cells.push([0, -(rise - 1), HOUSE_WINDOW]);
  // Chimney: a stack rising above the roof by the left wall.
  cells.push([0, -(peakH + 1), HOUSE_CHIMNEY]);
  cells.push([0, -(peakH + 2), HOUSE_CHIMNEY]);
  if (rise >= 6) cells.push([0, -(peakH + 3), HOUSE_CHIMNEY]);
  // A solid floor course laid on the ground under the whole footprint, so the
  // house keeps standing even if a mason quarries or an ant burrows the loose
  // earth out from under it. Two courses on the biggest plans.
  for (let dx = 0; dx <= span; dx++) {
    cells.push([dx, 1, HOUSE_FLOOR]);
    if (span >= 10) cells.push([dx, 2, HOUSE_FLOOR]);
  }
  return cells.filter(([dx, dy]) => !door.has(`${dx},${dy}`));
}
const HOUSE_BLUEPRINTS: readonly (readonly HouseCell[])[] = HOUSE_PLANS.map(houseCells);
/** Roof-peak height of each plan above the anchor row — how far up the site must be clear to raise it. (The chimney sticks up higher but it's one thin stack at the edge, not worth gating a whole lot on.) */
const HOUSE_HEIGHTS: readonly number[] = HOUSE_BLUEPRINTS.map((cells) =>
  cells.reduce((m, c) => (c[2] === HOUSE_CHIMNEY ? m : Math.max(m, -c[1])), 0),
);

const houseStyle = (meta: number): number => meta & 0b11;
const houseType = (meta: number): number => (meta >> 2) & 0b111;
/** The anchor `meta` byte for a house of the given wall style + plan index. */
const packHouseAnchor = (style: number, type: number): number =>
  HOUSE_ANCHOR_META | HOUSE_WALL_META | ((type & 0b111) << 2) | (style & 0b11);

/** How far a founding Construtor surveys the ground + supply and checks no other house is close (kept equal to the spacing so that check really covers the gap it promises), and the minimum anchor-to-anchor gap between houses. */
const HOUSE_SURVEY_RANGE = 17;
const HOUSE_SPACING = 17;
/** How far a chilled folk looks for a house to shelter in. */
const HOUSE_SHELTER_RANGE = 22;
/** Per-check chance a Construtor on a good, empty, house-free patch raises a house (the whole frame at once). High enough that it commits within a few turns of settling on a site, rather than standing frozen on it. */
const MASON_FOUND_CHANCE = 0.22;
/** How often (ticks) the rolling village census is refreshed. */
const CENSUS_INTERVAL = 90;
/** Ceiling on standing Trigo per Fazendeiro — a field sized to its keepers, not a runaway prairie. */
const WHEAT_PER_FARMER = 70;
/** How far a carrying Construtor notices a damaged house it could patch, and the per-tick chance it sets a brick when standing right next to the gap. */
const MASON_REPAIR_RANGE = 24;
const MASON_REPAIR_CHANCE = 0.4;
/** How wide a stretch of water a Construtor will look across for a far bank before deciding there's nothing to bridge to — generous, so a big lake still gets spanned. */
const MASON_BRIDGE_MAX = 200;
/** How far along a bank a Construtor will head to reach water it means to bridge. */
const MASON_APPROACH_MAX = 48;
/** How many cells above the near lip a Construtor's arched deck crowns — a gentle hump so it clears the water and meets a far bank at any height. */
const MASON_ARCH_MAX = 7;
/** How deep a gap between two banks still counts as "water to bridge" — a deep gorge with a stream at the bottom still gets a span. */
const MASON_SPAN_DROP = 40;
/** How far below its floor a house sinks a pier through any hollow or open water, so it always has solid footing. */
const FOUNDATION_DEPTH = 5;
/**
 * Before founding anything a Construtor *levels the lot*: over a strip as wide
 * as the largest house it shifts a cell of earth from the nearest hump into
 * the nearest hollow, one per turn, until the ground is flat. A house may
 * only be founded on a flat lot (`houseFootprintClear`). Past LEVEL_MAX_STEP
 * cells of unevenness it gives up and moves on.
 */
const LEVEL_MAX_STEP = 2;
/** Max wall thickness a boxed-in folk will squeeze straight through (see `folkPhase`). */
const FOLK_PHASE_REACH = 4;
/** Per-tick chance an idle folk (nothing to head toward, no village in sight) flips its facing — keeps it pacing a small patch instead of marching off in a straight line. */
const FOLK_WANDER_TURN = 0.22;

/** Ambient °C range the folk are content in; outside it they head indoors. */
const FOLK_COMFORT_MIN = COLD_1;
const FOLK_COMFORT_MAX = HOT_2;
/**
 * Per-tick exposure-death chance for an unsheltered folk, per degree the
 * climate is past the comfort band (capped) — gentle enough that a folk
 * that starts for home the moment the weather turns has time to get there,
 * lethal over a minute or two if it just stands out in a real blizzard.
 */
const FOLK_EXPOSURE_PER_DEGREE = 0.000012;
const FOLK_EXPOSURE_CAP = 0.0012;

/*
 * ── Magia ────────────────────────────────────────────────────────────────
 * A mote of enchantment: floats up and wanders, and each tick reaches for
 * one random neighbor and tries to turn it toward life and order. Potent
 * but self-limiting — it carries a lifespan in `meta` (set by the brush)
 * and every transmutation it lands also costs it extra life, so a single
 * mote can only do so much before it winks out.
 */
const MAGIC_LIFE = 200;
/** Extra life a mote spends when a transmutation attempt actually succeeds. */
const MAGIC_CAST_COST = 6;
/** Per-tick chance a Magia mote, sitting right by the right surroundings, conjures a creature (a Formiga on soil, a Peixe in water) into an adjacent empty cell. Deliberately rare — it's a surprise, not a spawner. */
const MAGIC_CONJURE_CHANCE = 0.003;
/** Per-tick chance a fading mote leaves a Flor where it vanishes — only ever taken when it dies resting against something solid, so flowers sprout on surfaces instead of hanging in mid-air. */
const MAGIC_BLOOM_ON_DEATH = 0.35;

/** Packs a creature's state into its one `meta` byte — see the block comment above. */
function packCreature(facing: number, timer: number, fed: number): number {
  return (facing > 0 ? 1 : 0) | ((timer & 0x3) << 1) | ((Math.max(0, Math.min(CREATURE_FED_MAX, fed)) & 0x1f) << CREATURE_FED_BITS);
}
function creatureFacing(meta: number): number {
  return meta & 1 ? 1 : -1;
}
function creatureTimer(meta: number): number {
  return (meta >> 1) & 0x3;
}
function creatureFed(meta: number): number {
  return (meta >> CREATURE_FED_BITS) & 0x1f;
}

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
/** Growth directions for the lowest cells of a shoot — straight up only, so a tree starts with a clean vertical trunk before its crown spreads. */
const TREE_TRUNK_DIRECTIONS = [[0, -1, 1]] as const;
/** Trunk cells a tended tree grows before it stamps its crown. */
const TREE_CROWN_START = TREE_TRUNK_HEIGHT;
/**
 * The leaf cells of a tended tree's crown, stamped in one go around the top of
 * the trunk (relative to the tip cell) — a rounded blob so it reads as
 * foliage. Only lands on empty air, so a crowded spot just gets a smaller crown.
 */
const TREE_CROWN_SHAPE: readonly (readonly [number, number])[] = [
  [-1, 0], [1, 0], [0, 0],
  [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
  [-1, -3], [0, -3], [1, -3],
  [0, -4],
];

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
 * `Debris` for the thing that actually does that. It doesn't disappear
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
 * One chunk of material physically thrown by an explosion — a grain of
 * sand, a splash of water, a splinter of wood — flying through the air with
 * real float position and velocity, unlike everything else on the grid.
 * `detonate` lifts a cell straight off the material grid and spawns one of
 * these in its place; `advanceDebris` then flies it under gravity and drag
 * until it either slows below DEBRIS_SETTLE_SPEED or slams into something
 * still standing, at which point it's deposited back onto the grid as
 * `material`/`meta` at the nearest open cell. That round trip — grid → air
 * → grid — is what actually carves a crater and heaps the spoil into a rim
 * around it, instead of the old wave that only ever nudged a grain one cell
 * at a time and let gravity trickle it back into the hole.
 */
interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The material this chunk is made of — deposited back onto the grid when it lands. */
  material: MaterialId;
  /** That material's per-cell meta, carried along so e.g. salty water stays salty when it splashes down. */
  meta: number;
  /** Failsafe countdown — deposited unconditionally when it hits 0 (see DEBRIS_MAX_LIFE). */
  life: number;
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
  /** When false, powders, liquids, gases and flying debris hold their position instead of falling/rising. Creatures and reactions carry on as normal. Toggled from the UI. */
  gravityEnabled = true;
  /** Grid indices the player is currently holding with the drag tool — the sim leaves these cells alone until they're dropped. */
  readonly heldCells = new Set<number>();
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
  /**
   * Hit points for the units that fight — o povo and the Esqueletos. One byte
   * per cell, moved with the creature by `swap`, stamped fresh by `set` from
   * SPAWN_HP. The top bit (0x80) is the "empowered by Magia" flag — such a
   * unit hits twice as hard and renders twice as big; the low 7 bits are the
   * points. Not serialized: a loaded map's creatures come back at full health
   * (see `load`), which is fine — a fight is a live event.
   */
  hp: Uint8Array;
  /**
   * A per-unit action clock — ticks left before a unit may act again. For a
   * fighter it's the cooldown between strikes (reset to ATTACK_PERIOD on a
   * blow); for a Fazendeiro / Lenhador it's the time a harvest takes (they
   * stand and work it down before the crop comes in). Moves with the unit via
   * `swap`, so a knockback or a shove doesn't reset it. Zero when idle.
   */
  private workCd: Uint8Array;
  /** Active electricity charges currently travelling through a conductor — see `Pulse`. */
  private pulses: Pulse[] = [];
  /** Decorative explosion sparks in flight — see `Shrapnel`. */
  private shrapnel: Shrapnel[] = [];
  /** Material chunks physically thrown by an explosion, mid-flight — see `Debris`. */
  private debris: Debris[] = [];
  /** Brief, very bright flash cells at a fresh detonation's epicenter — purely decorative, see `Flash`. */
  private flashes: Flash[] = [];
  /** Brief red flash cells where a blow just landed — a combat hit marker, purely decorative. Same struct as `Flash`. */
  private hits: Flash[] = [];
  /** Global temperature in Celsius — see `updateTemperature`. Starts at the neutral baseline since nothing hot or cold has run yet. */
  private temp = NEUTRAL_TEMP;
  /** Weighted count of Fogo/Lava cells seen so far this tick's main scan — reset and accumulated in `step()`, consumed by `updateTemperature`. An absolute count, not a ratio — see HOT_PIXELS_FOR_MAX. */
  private hotAccum = 0;
  /** Count of Gelo cells seen so far this tick's main scan. */
  private coldAccum = 0;
  /** Pops left this tick before DETONATIONS_PER_TICK_CAP kicks in — see the constant. Refilled at the top of every `step()`. */
  private detonationBudget = DETONATIONS_PER_TICK_CAP;
  /** This tick's powered/unpowered verdict for every Fio/Porta cell circuitPowered has already traced, keyed by grid index — a whole connected run gets settled once by the cell that happens to be visited first instead of repeating the same walk per cell. Cleared at the top of every `step()`. */
  private circuitCache = new Map<number, boolean>();
  /** This tick's open/shut verdict for every Porta cell doorPowered has already traced, keyed by grid index — see doorPowered: a connected slab of Porta is one body, open if *any* cell of it is individually fed, not just the cells actually touching a Fio/Alavanca. Cleared at the top of every `step()`. */
  private doorCache = new Map<number, boolean>();
  private tick = 0;
  /** Rolling census (refreshed every CENSUS_INTERVAL ticks) the trades use to cap themselves: houses to the head count, crops to the farmer count. */
  private houseCensus = 0;
  private folkCensus = 0;
  private cropCensus = 0;
  private farmerCensus = 0;
  private timberCensus = 0;
  private granaryCensus = 0;
  private woodshedCensus = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.material = new Uint8Array(width * height);
    this.meta = new Uint8Array(width * height);
    this.processed = new Uint8Array(width * height);
    this.stillTicks = new Uint8Array(width * height);
    this.flowDir = new Int8Array(width * height);
    this.hp = new Uint8Array(width * height);
    this.workCd = new Uint8Array(width * height);
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
    this.hp.fill(0);
    this.workCd.fill(0);
    this.heldCells.clear();
    this.pulses = [];
    this.shrapnel = [];
    this.debris = [];
    this.flashes = [];
    this.hits = [];
    this.temp = NEUTRAL_TEMP;
    this.hotAccum = 0;
    this.coldAccum = 0;
  }

  /**
   * A snapshot of everything worth persisting — the two cell arrays (RLE'd,
   * since a typical scene is mostly Empty), the grid size they were painted
   * at, and the current temperature. The transient effects (pulses,
   * shrapnel, debris, flashes) are deliberately dropped, same as
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
        this.hp[ti] = SPAWN_HP[srcMat[si] as MaterialId] ?? 0;
      }
    }
    this.temp = Math.max(EXTREME_COLD, Math.min(EXTREME_HOT, snap.temp));
  }

  /** Read-only positions of active electricity charges, for the renderer to overlay a glow on top of whatever conductor they're passing through. */
  get activePulses(): readonly { x: number; y: number }[] {
    return this.pulses;
  }

  /** Read-only positions (plus fade state) of in-flight decorative explosion sparks, for the renderer to overlay. */
  get activeShrapnel(): readonly { x: number; y: number; life: number; maxLife: number }[] {
    return this.shrapnel;
  }

  /** Read-only positions + material of the chunks an explosion has thrown into the air, for the renderer to draw as flying matter. */
  get activeDebris(): readonly { x: number; y: number; material: MaterialId; meta: number }[] {
    return this.debris;
  }

  /** Read-only positions (plus fade state) of a fresh detonation's bright Flash cells, for the renderer to overlay. */
  get activeFlashes(): readonly { x: number; y: number; life: number; maxLife: number }[] {
    return this.flashes;
  }

  /** Read-only positions (plus fade state) of fresh combat-hit markers, for the renderer to flash red. */
  get activeHits(): readonly { x: number; y: number; life: number; maxLife: number }[] {
    return this.hits;
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
    // Out-of-bounds reads report solid rock — the same way callers that do
    // bounds-check already treat the world edge. Without this an OOB read
    // returns undefined, and `MATERIALS[undefined].category` throws inside a
    // sim tick, which freezes the whole simulation.
    if (!this.inBounds(x, y)) return MaterialId.Stone;
    return this.material[this.index(x, y)] as MaterialId;
  }

  set(x: number, y: number, id: MaterialId, meta = 0): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.material[i] = id;
    this.meta[i] = meta;
    this.hp[i] = SPAWN_HP[id] ?? 0;
    this.workCd[i] = 0;
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

  /**
   * Whether a cell of `id` can be picked up and moved with the drag tool.
   * Solids stay put (they're structure); Empty, Fire and bodiless Energy
   * aren't things you can grab. Everything else — powders, liquids, gases,
   * plants, creatures, a Magia mote — is fair game.
   */
  private draggable(id: MaterialId): boolean {
    if (id === MaterialId.Empty || id === MaterialId.Fire) return false;
    const cat = MATERIALS[id].category;
    return cat !== MaterialCategory.Solid && cat !== MaterialCategory.Energy && cat !== MaterialCategory.Empty;
  }

  /**
   * Grabs every draggable cell in a disc of `radius` around (cx, cy) into a
   * `DragBlob` the caller steers with `moveBlob` / releases with `dropBlob`.
   * The cells stay put on the grid, just frozen (`heldCells`) so the sim
   * neither moves them nor lets anything flow into the space they occupy,
   * until the blob is actually steered somewhere else. Returns null if
   * nothing there could be picked up.
   */
  pickUpBlob(cx: number, cy: number, radius: number): DragBlob | null {
    const cells: DragBlob["cells"] = [];
    const placed: number[] = [];
    const r2 = radius * radius;
    const rInt = Math.max(0, Math.ceil(radius));
    for (let dy = -rInt; dy <= rInt; dy++) {
      for (let dx = -rInt; dx <= rInt; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        const i = this.index(x, y);
        if (this.heldCells.has(i)) continue;
        const id = this.material[i] as MaterialId;
        if (!this.draggable(id)) continue;
        cells.push({ dx, dy, mat: id, meta: this.meta[i] });
        this.heldCells.add(i); // held in place, not lifted out — the hole never opens
        placed.push(i);
        this.wake(x, y);
      }
    }
    if (cells.length === 0) return null;
    return { cells, ax: cx, ay: cy, placed };
  }

  /** Nearest currently-empty grid index to (x, y) within `reach` cells, or -1. Used so a dragged cell that lands on an obstacle spills beside it instead of vanishing. */
  private nearestEmpty(x: number, y: number, reach = 3): number {
    for (let r = 0; r <= reach; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (this.inBounds(nx, ny) && this.material[this.index(nx, ny)] === MaterialId.Empty) {
            return this.index(nx, ny);
          }
        }
      }
    }
    return -1;
  }

  /**
   * Re-stamps a held blob centred on (cx, cy): frees exactly the cells it was
   * occupying, then lays every cell down again at the new spot — at its own
   * offset if that's clear, otherwise spilled into the nearest open cell so
   * nothing is ever dropped. The placed cells stay frozen (`heldCells`) until
   * `dropBlob`.
   */
  moveBlob(blob: DragBlob, cx: number, cy: number): void {
    this.restampBlob(blob, cx, cy, 3);
  }

  private restampBlob(blob: DragBlob, cx: number, cy: number, reach: number): void {
    for (const pi of blob.placed) {
      if (this.heldCells.has(pi)) {
        this.material[pi] = MaterialId.Empty;
        this.meta[pi] = 0;
        this.heldCells.delete(pi);
        this.wake(pi % this.width, (pi / this.width) | 0);
      }
    }
    blob.placed.length = 0;
    for (const c of blob.cells) {
      const nx = cx + c.dx;
      const ny = cy + c.dy;
      const onOffset = this.inBounds(nx, ny) && this.material[this.index(nx, ny)] === MaterialId.Empty;
      const ni = onOffset
        ? this.index(nx, ny)
        : this.nearestEmpty(this.inBounds(nx, ny) ? nx : cx, this.inBounds(nx, ny) ? ny : cy, reach);
      if (ni < 0) continue; // nothing open within reach this pass — the cell stays in the blob and is retried on the next move / on drop
      this.material[ni] = c.mat;
      this.meta[ni] = c.meta;
      this.heldCells.add(ni);
      blob.placed.push(ni);
      this.wake(ni % this.width, (ni / this.width) | 0);
    }
    blob.ax = cx;
    blob.ay = cy;
  }

  /** Places a held blob one last time and hands its cells back to the sim (they fall, flow, react again from here). Widens the spill search so a full-handed drop onto cluttered ground still lands every cell. */
  dropBlob(blob: DragBlob, cx: number, cy: number): void {
    this.restampBlob(blob, cx, cy, Math.max(this.width, this.height));
    for (const pi of blob.placed) this.heldCells.delete(pi);
    blob.placed.length = 0;
  }

  private metaFor(id: MaterialId): number {
    if (id === MaterialId.Fire) return MATERIALS[MaterialId.Fire].burnTicks;
    if (id === MaterialId.Acid) return ACID_START_CHARGES;
    // A freshly painted creature starts well fed, empty-handed, facing a
    // random way.
    if (
      id === MaterialId.Ant || id === MaterialId.Bird || id === MaterialId.Fish ||
      id === MaterialId.Mason || id === MaterialId.Lumberjack ||
      id === MaterialId.Farmer || id === MaterialId.Warrior || id === MaterialId.Skeleton
    ) {
      return packCreature(Math.random() < 0.5 ? 1 : -1, 0, CREATURE_FED_MAX);
    }
    if (id === MaterialId.Magic) return MAGIC_LIFE;
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
   * pulse sitting at this cell still travelling. Peixe is the last
   * exception: it lives *in* water, so the brush paints it straight over
   * Água (one displaced cell is nothing) as well as into open space —
   * otherwise you could never drop a fish into a pool.
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
    const here = this.get(x, y);
    if (here !== MaterialId.Empty && !(id === MaterialId.Fish && here === MaterialId.Water)) return;
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
    if (SINGLE_DROP_MATERIALS.includes(id)) { this.dropOne(cx, cy, id); return; }
    const r2 = radius * radius;
    const rInt = Math.ceil(radius);
    for (let dy = -rInt; dy <= rInt; dy++) {
      for (let dx = -rInt; dx <= rInt; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        this.paintCell(cx + dx, cy + dy, id);
      }
    }
  }

  /**
   * Places a single cell of `id` at or near (cx, cy), for SINGLE_DROP
   * materials. If the exact spot is taken it nudges out to the nearest empty
   * cell within two steps, so a click that lands on a wall or another folk
   * still isn't wasted. An Alavanca is the exception: it stamps its whole
   * LEVER_SHAPE fixture instead of one cell (see `dropLever`).
   */
  private dropOne(cx: number, cy: number, id: MaterialId): void {
    if (id === MaterialId.Lever) { this.dropLever(cx, cy); return; }
    for (let r = 0; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (this.inBounds(x, y) && this.get(x, y) === MaterialId.Empty) {
            this.paintCell(x, y, id);
            return;
          }
        }
      }
    }
  }

  /** Stamps LEVER_SHAPE, anchored at or near (cx, cy) — the nearest spot within two steps whose whole footprint is clear. Every cell starts off (CIRCUIT_ON_META clear), flagged LEVER_ARM_META or not per the shape. */
  private dropLever(cx: number, cy: number): void {
    for (let r = 0; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const ax = cx + dx;
          const ay = cy + dy;
          let clear = true;
          for (const [ox, oy] of LEVER_FRAME) {
            if (!this.inBounds(ax + ox, ay + oy) || this.get(ax + ox, ay + oy) !== MaterialId.Empty) { clear = false; break; }
          }
          const [kox, koy] = LEVER_KNOB_OFF;
          if (clear && (!this.inBounds(ax + kox, ay + koy) || this.get(ax + kox, ay + koy) !== MaterialId.Empty)) clear = false;
          if (!clear) continue;
          for (const [ox, oy] of LEVER_FRAME) this.set(ax + ox, ay + oy, MaterialId.Lever, 0);
          this.set(ax + kox, ay + koy, MaterialId.Lever, LEVER_ARM_META); // starts off
          return;
        }
      }
    }
  }

  /** Stamps a filled circle of `radius` at every step along the segment, for the "line" brush. */
  paintLine(x0: number, y0: number, x1: number, y1: number, radius: number, id: MaterialId): void {
    if (SINGLE_DROP_MATERIALS.includes(id)) { this.dropOne(x0, y0, id); return; }
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
    if (SINGLE_DROP_MATERIALS.includes(id)) { this.dropOne(x0, y0, id); return; }
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

  /**
   * Right-click on a placed Alavanca is how it's switched: an actual thrown
   * switch, not a recolor — the knob cell itself jumps from LEVER_KNOB_OFF
   * to LEVER_KNOB_ON (or back), and every housing cell physically touching
   * it updates its on/off bit to match, so the whole fixture (or however
   * many lone Alavancas happen to be stuck together) switches as one unit
   * regardless of which cell the cursor landed on. A no-op anywhere else
   * (empty ground, a different material, out of bounds).
   */
  toggleLever(x: number, y: number): void {
    if (!this.inBounds(x, y) || this.get(x, y) !== MaterialId.Lever) return;
    const startI = this.index(x, y);
    const next = (this.meta[startI] & CIRCUIT_ON_META) === 0 ? CIRCUIT_ON_META : 0;
    const visited = new Set<number>([startI]);
    const stack = [startI];
    let minX = x, minY = y;
    let knobI = (this.meta[startI] & LEVER_ARM_META) !== 0 ? startI : -1;
    let budget = LEVER_FLOOD_CAP;
    while (stack.length > 0 && budget-- > 0) {
      const i = stack.pop()!;
      const cx = i % this.width, cy = (i / this.width) | 0;
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if ((this.meta[i] & LEVER_ARM_META) !== 0) knobI = i;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny)) continue;
        const j = this.index(nx, ny);
        if (this.material[j] !== MaterialId.Lever || visited.has(j)) continue;
        visited.add(j);
        stack.push(j);
      }
    }
    // The frame's own top-left is always the anchor LEVER_FRAME was stamped
    // from — true whichever slot the knob is currently sitting in.
    const [kox, koy] = next !== 0 ? LEVER_KNOB_ON : LEVER_KNOB_OFF;
    const newKnobX = minX + kox, newKnobY = minY + koy;
    if (knobI >= 0 && this.inBounds(newKnobX, newKnobY)) {
      const oldX = knobI % this.width, oldY = (knobI / this.width) | 0;
      this.material[knobI] = MaterialId.Empty;
      this.meta[knobI] = 0;
      this.wake(oldX, oldY);
      this.set(newKnobX, newKnobY, MaterialId.Lever, LEVER_ARM_META | next);
    }
    for (const i of visited) {
      if (i === knobI) continue; // already moved/reset above
      this.meta[i] = next; // frame cells: never LEVER_ARM_META, just the on/off bit
      this.wake(i % this.width, (i / this.width) | 0);
    }
  }

  private swap(ax: number, ay: number, bx: number, by: number): void {
    const ai = this.index(ax, ay);
    const bi = this.index(bx, by);
    const tm = this.material[ai];
    const tmeta = this.meta[ai];
    const tflow = this.flowDir[ai];
    const thp = this.hp[ai];
    const tcd = this.workCd[ai];
    this.material[ai] = this.material[bi];
    this.meta[ai] = this.meta[bi];
    this.flowDir[ai] = this.flowDir[bi];
    this.hp[ai] = this.hp[bi];
    this.workCd[ai] = this.workCd[bi];
    this.material[bi] = tm;
    this.meta[bi] = tmeta;
    this.flowDir[bi] = tflow;
    this.hp[bi] = thp;
    this.workCd[bi] = tcd;
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
    this.detonationBudget = DETONATIONS_PER_TICK_CAP;
    if (this.circuitCache.size > 0) this.circuitCache.clear();
    if (this.doorCache.size > 0) this.doorCache.clear();
    if (this.tick % CENSUS_INTERVAL === 1) this.takeCensus();

    // Bottom-to-top so a cell that falls this tick isn't immediately
    // reprocessed as if it were the next row's original occupant.
    for (let y = this.height - 1; y >= 0; y--) {
      for (let xi = 0; xi < this.width; xi++) {
        const x = leftToRight ? xi : this.width - 1 - xi;
        const i = this.index(x, y);
        if (this.processed[i]) continue;
        if (this.heldCells.size > 0 && this.heldCells.has(i)) continue; // in the player's hand
        const id = this.material[i] as MaterialId;
        if (id === MaterialId.Empty) continue;
        if (id === MaterialId.Fire) this.hotAccum++;
        else if (id === MaterialId.Lava || id === MaterialId.HeatBlock) this.hotAccum += 2;
        else if (id === MaterialId.Ice || id === MaterialId.ColdBlock) this.coldAccum++;

        const def = MATERIALS[id];
        switch (def.category) {
          case MaterialCategory.Powder:
            if (this.gravityEnabled && this.stillTicks[i] < SLEEP_THRESHOLD && Math.random() < GRAVITY_STRENGTH) {
              if (this.stepPowder(x, y, def.density)) this.stillTicks[i] = 0;
              else if (this.stillTicks[i] < 255) this.stillTicks[i]++;
            }
            break;
          case MaterialCategory.Liquid:
            if (this.gravityEnabled && this.stillTicks[i] < SLEEP_THRESHOLD && Math.random() < GRAVITY_STRENGTH) {
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
            if (this.gravityEnabled && this.stillTicks[i] < SLEEP_THRESHOLD) {
              if (this.stepGas(x, y, def.density)) this.stillTicks[i] = 0;
              else if (this.stillTicks[i] < 255) this.stillTicks[i]++;
            }
            break;
          case MaterialCategory.Fire:
            this.stepFire(x, y, i);
            break;
          case MaterialCategory.Organic:
            if (id === MaterialId.Sprout) this.stepSprout(x, y, i);
            else if (id === MaterialId.Wheat) this.stepWheat(x, y, i);
            else if (id === MaterialId.Flor) this.processed[i] = 1; // a static petal, never grows or spreads on its own
            else this.stepOrganic(x, y);
            break;
          case MaterialCategory.Creature:
            if (id === MaterialId.Ant) this.stepAnt(x, y, i);
            else if (id === MaterialId.Bird) this.stepBird(x, y, i);
            else if (id === MaterialId.Fish) this.stepFish(x, y, i);
            else if (id === MaterialId.Mason) this.stepMason(x, y, i);
            else if (id === MaterialId.Lumberjack) this.stepLumberjack(x, y, i);
            else if (id === MaterialId.Farmer) this.stepFarmer(x, y, i);
            else if (id === MaterialId.Warrior) this.stepWarrior(x, y, i);
            else if (id === MaterialId.Skeleton) this.stepSkeleton(x, y, i);
            break;
          case MaterialCategory.Magic:
            this.stepMagic(x, y, i);
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
        else if (id === MaterialId.Wire) this.stepWire(x, y, i);
        else if (id === MaterialId.Door) this.stepDoor(x, y, i);

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
          (id === MaterialId.Plant || id === MaterialId.Sprout || id === MaterialId.Flor || id === MaterialId.Wheat) &&
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
    this.advanceDebris();
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
      const neigh = this.get(nx, ny);
      // Sand held in the flame slowly fuses to Glass.
      if (neigh === MaterialId.Sand) { if (Math.random() < HEAT_FUSE_GLASS) this.set(nx, ny, MaterialId.Glass); continue; }
      const nDef = MATERIALS[neigh];
      if (!nDef.flammable) continue;
      // A flame right next to an animal grabs it far more readily than it
      // would, say, a log — a creature that only had this material's slow
      // per-tick ignitionChance would usually be missed as the fire flickers
      // past, and a thin ant trail would never catch.
      const chance = nDef.category === MaterialCategory.Creature ? Math.max(nDef.ignitionChance, 0.55) : nDef.ignitionChance;
      if (Math.random() < chance) this.igniteAt(nx, ny);
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
      // A whole flank of a huge charge can catch in the same tick (fire or a
      // blast reaching many separate cells at once) — spend from the shared
      // pop budget same as a fuse would, and give it a one-tick fuse to retry
      // through `stepFuse` if the budget's already spent.
      if (this.canDetonate()) this.detonate(x, y);
      else this.meta[this.index(x, y)] = 1;
      return;
    }
    this.set(x, y, MaterialId.Fire, def.burnTicks);
    this.processed[this.index(x, y)] = 1;
    // Fire runs right through a huddle of animals: the whole connected
    // group of touching flammable creatures goes up at once. Without this
    // the flame flickers up and off the spot before the next one in a
    // trail or flock ever catches, so a torch to a colony just kills the
    // single ant it touched. Bounded by CREATURE_FIRE_FLOOD_CAP for perf;
    // any beyond that catch the ordinary way from the spreading Fogo.
    if (def.category === MaterialCategory.Creature) {
      let frontier = [this.index(x, y)];
      const seen = new Set(frontier);
      let budget = CREATURE_FIRE_FLOOD_CAP;
      while (frontier.length > 0 && budget > 0) {
        const nextRing: number[] = [];
        for (const idx of frontier) {
          const cxx = idx % this.width;
          const cyy = (idx / this.width) | 0;
          for (const [dx, dy] of NEIGHBORS_8) {
            const nx = cxx + dx;
            const ny = cyy + dy;
            if (!this.inBounds(nx, ny)) continue;
            const ni = this.index(nx, ny);
            if (seen.has(ni)) continue;
            const nDef = MATERIALS[this.material[ni] as MaterialId];
            if (nDef.category !== MaterialCategory.Creature || !nDef.flammable) continue;
            seen.add(ni);
            this.set(nx, ny, MaterialId.Fire, nDef.burnTicks);
            this.processed[ni] = 1;
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
  private detonate(cx: number, cy: number): void {
    const pocket = this.collectExplosivePocket(cx, cy);

    // Only this small pocket is consumed directly — the rest of a connected
    // pile keeps its shape and detonates in turn via the fuses lit just
    // below, so a big block visibly chain-reacts instead of vanishing.
    let ex = 0;
    let ey = 0;
    for (const [x, y] of pocket) {
      this.set(x, y, MaterialId.Empty);
      this.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
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
    this.floodFuseConnected(pocket);

    const power = 1 + (pocket.length - 1) * CLUSTER_BONUS_PER_CHARGE;
    const radius = BLAST_BASE_RADIUS * Math.sqrt(power);
    this.applyBlastImpulse(cx, cy, ex, ey, radius);

    // Decorative heat-sparks, radiating from the epicentre.
    this.spawnShrapnelBurst(ex, ey, Math.min(SHRAPNEL_VISUAL_CAP, Math.max(4, Math.round(SHRAPNEL_PER_POP * power))));
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
  private applyBlastImpulse(cx: number, cy: number, ex: number, ey: number, radius: number): void {
    const r = Math.ceil(radius);
    const minX = Math.max(0, Math.floor(ex) - r);
    const maxX = Math.min(this.width - 1, Math.ceil(ex) + r);
    const minY = Math.max(0, Math.floor(ey) - r);
    const maxY = Math.min(this.height - 1, Math.ceil(ey) + r);
    const shatterR = radius * BLAST_SHATTER_FRAC;
    const pulverizeR = radius * BLAST_PULVERIZE_FRAC;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const rx = x - cx;
        const ry = y - cy;
        const dist = Math.hypot(rx, ry);
        if (dist > radius) continue;
        const i = this.index(x, y);
        const id = this.material[i] as MaterialId;
        if (id === MaterialId.Empty) continue;

        const falloff = 1 - dist / radius; // 1 at the centre, 0 at the rim
        const def = MATERIALS[id];

        // A separate explosive pile: fuse it (longer delay than the
        // connected chain) rather than throwing or burning it.
        if (this.isFusableExplosive(id) && this.meta[i] === 0) {
          if (Math.random() < 0.35 + 0.6 * falloff) {
            this.meta[i] = CHAIN_DELAY_SEPARATE + Math.floor(Math.random() * 4);
          }
          continue;
        }

        // Flammable, non-explosive: the heat of the blast lights it.
        if (def.flammable && id !== MaterialId.Fire) {
          if (Math.random() < falloff * def.ignitionChance * BLAST_IGNITE_FACTOR) {
            this.igniteAt(x, y);
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
        if (this.debris.length >= DEBRIS_CAP) continue;

        // Glass throws sand grains, not intact panes.
        const chunkId = id === MaterialId.Glass ? MaterialId.Sand : id;
        const chunkMeta = id === MaterialId.Glass ? 0 : this.meta[i];

        // Radial direction, away from the charge — straight up for a cell
        // sitting exactly on the epicentre.
        let ang: number;
        if (rx === 0 && ry === 0) ang = -Math.PI / 2;
        else ang = Math.atan2(ry, rx);
        ang += (Math.random() - 0.5) * BLAST_ANGLE_JITTER;
        const speed = BLAST_LAUNCH_SPEED * falloff * (0.55 + Math.random() * 0.7);

        this.set(x, y, MaterialId.Empty);
        this.debris.push({
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
      // Gás isn't pulled into the pocket — it catches from the blast
      // and detonates in its own right instead of being quietly consumed.
      if (this.inBounds(nx, ny) && this.isFusableExplosive(this.get(nx, ny))) cells.push([nx, ny]);
    }
    return cells;
  }

  /** Spends one pop of this tick's DETONATIONS_PER_TICK_CAP budget, if there's any left. */
  private canDetonate(): boolean {
    if (this.detonationBudget <= 0) return false;
    this.detonationBudget--;
    return true;
  }

  /** A lit fuse (meta > 0) on any explosive cell (Pólvora, C4) counts down once per tick and detonates when it reaches 0 — see `detonate`. Past the per-tick pop budget it just holds at zero and retries next tick, rather than force through and stall the frame. */
  private stepFuse(x: number, y: number, i: number): void {
    this.meta[i]--;
    if (this.meta[i] <= 0) {
      if (this.canDetonate()) this.detonate(x, y);
      else this.meta[i] = 1;
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
  private floodFuseConnected(seeds: readonly [number, number][]): void {
    let frontier: number[] = [];
    for (const [x, y] of seeds) frontier.push(this.index(x, y));
    const seen = new Set<number>(frontier);
    let ring = 0;
    let budget = CHAIN_FLOOD_CAP;
    while (frontier.length > 0 && budget > 0) {
      const nextRing: number[] = [];
      const delay = CHAIN_BASE_DELAY + Math.floor(ring / CHAIN_RINGS_PER_TICK);
      for (const idx of frontier) {
        const x = idx % this.width;
        const y = (idx / this.width) | 0;
        for (const [dx, dy] of NEIGHBORS_8) {
          const nx = x + dx;
          const ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const ni = this.index(nx, ny);
          if (seen.has(ni)) continue;
          if (!this.isFusableExplosive(this.material[ni] as MaterialId)) continue;
          seen.add(ni);
          if (this.meta[ni] === 0) {
            this.meta[ni] = Math.min(250, delay + Math.floor(Math.random() * 2));
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
  private spawnShrapnelBurst(ex: number, ey: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = SHRAPNEL_SPEED_MIN + Math.random() * (SHRAPNEL_SPEED_MAX - SHRAPNEL_SPEED_MIN);
      const life = SHRAPNEL_LIFE_MIN + Math.floor(Math.random() * (SHRAPNEL_LIFE_MAX - SHRAPNEL_LIFE_MIN));
      this.shrapnel.push({
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
   * Flies every in-flight `Debris` chunk one tick: gravity, drag, then a
   * sub-stepped sweep along its velocity so a fast chunk can't tunnel
   * through a thin wall. A chunk is deposited back onto the grid — as its
   * own material — when it slows below DEBRIS_SETTLE_SPEED, when it runs
   * into something still standing, when it leaves the play area through the
   * floor/ceiling, or when its failsafe life runs out. Landing in Água or
   * Lava just splashes it in (deposited on top); landing on Fogo torches a
   * flammable chunk instead of stacking it.
   */
  private advanceDebris(): void {
    if (this.debris.length === 0) return;
    const next: Debris[] = [];
    for (const d of this.debris) {
      d.life--;
      if (this.gravityEnabled) d.vy += DEBRIS_GRAVITY;
      d.vx *= DEBRIS_DRAG;
      d.vy *= DEBRIS_DRAG;

      const speed = Math.hypot(d.vx, d.vy);
      if (d.life <= 0 || speed < DEBRIS_SETTLE_SPEED) {
        this.depositDebris(d);
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
        if (gx < 0 || gx >= this.width) {
          // Flew off the side — just deposit where it last was.
          this.depositDebris(d);
          landed = true;
          break;
        }
        if (gy < 0) {
          d.x = nx;
          d.y = 0;
          d.vy = Math.abs(d.vy) * 0.3; // clip off the ceiling
          continue;
        }
        if (gy >= this.height) {
          this.depositDebris(d);
          landed = true;
          break;
        }
        const hitId = this.material[this.index(gx, gy)] as MaterialId;
        if (hitId === MaterialId.Empty) {
          d.x = nx;
          d.y = ny;
          continue;
        }
        if (hitId === MaterialId.Fire && MATERIALS[d.material].flammable) {
          this.igniteAt(Math.round(d.x), Math.round(d.y));
          landed = true;
          break;
        }
        if (hitId === MaterialId.Glass) {
          this.shatterGlass(gx, gy);
          // keep going — it punched through
          d.x = nx;
          d.y = ny;
          continue;
        }
        // Ran into something standing — settle against it.
        this.depositDebris(d);
        landed = true;
        break;
      }
      if (!landed) next.push(d);
    }
    this.debris = next;
  }

  /**
   * Puts one chunk of debris back on the grid as its own material. Prefers
   * the exact cell it came to rest in; failing that (already filled), spirals
   * outward for the nearest Empty cell, then as a last resort stacks
   * straight up. A chunk that finds nowhere at all is simply lost — rare,
   * and better than corrupting a settled cell.
   */
  private depositDebris(d: Debris): void {
    const place = (x: number, y: number): boolean => {
      if (!this.inBounds(x, y) || this.material[this.index(x, y)] !== MaterialId.Empty) return false;
      this.set(x, y, d.material, d.meta);
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
  private advanceFlashes(): void {
    if (this.flashes.length > 0) {
      const next: Flash[] = [];
      for (const f of this.flashes) { f.life--; if (f.life > 0) next.push(f); }
      this.flashes = next;
    }
    if (this.hits.length > 0) {
      const next: Flash[] = [];
      for (const f of this.hits) { f.life--; if (f.life > 0) next.push(f); }
      this.hits = next;
    }
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

    // A forester's seedling grows a full tree even on damp ground, where a
    // wild Semente would only ever stamp a little flower.
    const forester = (this.meta[this.index(x, y)] & FOREST_SEED_META) !== 0;
    if (onMud && !forester) {
      this.stampFlower(x, y);
    } else if (forester) {
      const budget = Math.min(SPROUT_BUDGET_MASK, FOREST_SEED_BUDGET + Math.floor(Math.random() * 8));
      this.set(x, y, MaterialId.Sprout, budget | SPROUT_FOREST_FLAG);
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
  /** Cells of trunk (Madeira flagged TREE_TRUNK) plus Broto/Planta stacked straight below (x, y), down to soil — how high up its own stem this cell sits. Capped. */
  private stemBelow(x: number, y: number): number {
    let n = 0;
    for (let d = 1; d <= 10; d++) {
      const ny = y + d;
      if (!this.inBounds(x, ny)) break;
      const j = this.index(x, ny);
      const m = this.material[j];
      if (m === MaterialId.Sprout || m === MaterialId.Plant) { n++; continue; }
      if (m === MaterialId.Wood && (this.meta[j] & TREE_TRUNK_META) !== 0) { n++; continue; }
      break;
    }
    return n;
  }

  /** Broto/Planta/Flor cells stacked straight above (x, y) — the crown carried over this stem cell. Capped. */
  private crownAbove(x: number, y: number): number {
    let n = 0;
    for (let d = 1; d <= 8; d++) {
      const ny = y - d;
      if (!this.inBounds(x, ny)) break;
      const m = this.material[this.index(x, ny)];
      if (m === MaterialId.Sprout || m === MaterialId.Plant || m === MaterialId.Flor) n++;
      else break;
    }
    return n;
  }

  private stepSprout(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const raw = this.meta[i];
    let budget = raw & SPROUT_BUDGET_MASK;
    // Whether this cell (or the regrowth event it descends from) already
    // spent its one prosperous catch-up bonus — see the flag's write site
    // below for why it has to propagate to every cell grown afterward, not
    // just block the exact cell that rolled it.
    let regrown = (raw & SPROUT_REGROWN_FLAG) !== 0;
    const forest = (raw & SPROUT_FOREST_FLAG) !== 0; // a Lenhador's tended tree

    // Lignify: a low cell of a tall plant, rooted near soil with a real crown
    // of leaves above it, slowly turns woody — so a grown tree reads as a
    // brown trunk under a green canopy instead of one green blob. Checked
    // before the budget gate so a finished tree still hardens its trunk.
    const stem = this.stemBelow(x, y);
    if (stem < TREE_TRUNK_HEIGHT && this.crownAbove(x, y) >= TREE_CROWN_FOR_BARK && Math.random() < TREE_HARDEN_CHANCE) {
      this.set(x, y, MaterialId.Wood, TREE_TRUNK_META);
      return;
    }

    if (budget <= 0 && (regrown || !isProsperous(this.temp))) return;

    // Mud counts as moisture too — it's Terra that already absorbed its
    // neighboring Water (see stepDirt), so a sprout rooted in Barro stays
    // "watered" even after the puddle beside it has been consumed. Checked
    // out to 2 cells (not just direct neighbors) so a shoot can still reach
    // its roots' moisture a couple of rows up, instead of stalling the
    // instant it grows one cell away from the water/mud below it.
    let nearMoisture = forest; // the forester keeps its saplings watered
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
    // A cell sitting on its own stem (Broto/Planta/trunk right below) can
    // reach further down that stem to its roots' water — that's what lets a
    // tree keep growing tall well above the damp ground it's rooted in,
    // instead of every shoot topping out two cells over the soil.
    if (!nearMoisture) {
      for (let d = 1; d <= 6; d++) {
        const ny = y + d;
        if (!this.inBounds(x, ny)) break;
        const m = this.material[this.index(x, ny)];
        if (m === MaterialId.Water || m === MaterialId.Mud) { nearMoisture = true; break; }
        const stem = m === MaterialId.Sprout || m === MaterialId.Plant ||
          (m === MaterialId.Wood && (this.meta[this.index(x, ny)] & TREE_TRUNK_META) !== 0);
        if (!stem) break;
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
      this.meta[i] = budget | SPROUT_REGROWN_FLAG | (forest ? SPROUT_FOREST_FLAG : 0);
    }

    if (Math.random() >= GROWTH_CHANCE * this.growthFactor()) return;
    const flags = (regrown ? SPROUT_REGROWN_FLAG : 0) | (forest ? SPROUT_FOREST_FLAG : 0);

    // A tended tree: a clean vertical trunk, then a crown stamped in one go, so
    // it reads as a real tree rather than a random bush.
    if (forest) {
      if (this.crownAbove(x, y) > 0) return; // this cell is inside the crown already
      if (stem < TREE_CROWN_START) {
        // still growing the bare trunk, straight up
        if (this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty) {
          this.set(x, y - 1, MaterialId.Sprout, ((budget - 1) & SPROUT_BUDGET_MASK) | flags);
          this.meta[i] = flags; // this cell is trunk now — done, ready to lignify
        }
        return;
      }
      // reached crown height — stamp the foliage around the tip
      for (const [dx, dy] of TREE_CROWN_SHAPE) {
        const cx = x + dx;
        const cy = y + dy;
        if (this.inBounds(cx, cy) && this.get(cx, cy) === MaterialId.Empty) {
          this.set(cx, cy, MaterialId.Sprout, flags); // budget 0 — a settled leaf
        }
      }
      this.meta[i] = flags;
      return;
    }

    // Wild Broto: bushy weighted spread, cloning its budget at every branch.
    const candidates: [number, number][] = [];
    for (const [dx, dy, weight] of (stem < TREE_TRUNK_HEIGHT ? TREE_TRUNK_DIRECTIONS : SPROUT_DIRECTIONS)) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny) || this.get(nx, ny) !== MaterialId.Empty) continue;
      for (let w = 0; w < weight; w++) candidates.push([nx, ny]);
    }
    if (candidates.length === 0) return;
    const [gx, gy] = candidates[Math.floor(Math.random() * candidates.length)];
    const childMeta = ((budget - 1) & SPROUT_BUDGET_MASK) | flags;
    this.set(gx, gy, MaterialId.Sprout, childMeta);
    this.meta[i] = childMeta;
  }

  /**
   * Trigo. `meta` is a ripeness clock: it ticks up (climate-scaled), the
   * renderer greens it low and golds it high. A stalk needs its roots near
   * soil — the bottom cell must sit on Terra/Barro/another wheat cell, or it
   * withers. With enough ripeness and headroom it grows one cell taller, up
   * to WHEAT_MAX_HEIGHT. Ripe heads (meta ≥ WHEAT_RIPE) occasionally fling a
   * shoot onto adjacent bare soil, so a sown row fills into a field.
   */
  private stepWheat(x: number, y: number, i: number): void {
    this.processed[i] = 1;

    // Rooted? The cell directly below must be soil or more wheat (a taller
    // segment standing on a lower one). Anything else underfoot — air, water,
    // a wall it grew off the edge of — and the stalk withers.
    const bi = this.inBounds(x, y + 1) ? this.index(x, y + 1) : -1;
    const below = bi >= 0 ? (this.material[bi] as MaterialId) : MaterialId.Stone;
    const onStoreFloor = bi >= 0 &&
      (this.meta[bi] & HOUSE_WALL_META) !== 0 && (this.meta[bi] & HOUSE_KIND_MASK) === HOUSE_FLOOR;
    const rooted =
      below === MaterialId.Dirt || below === MaterialId.Mud || below === MaterialId.Wheat ||
      below === MaterialId.Sand || // takes to loose sand too, just poorly
      onStoreFloor;                // grain stacked on a storehouse floor keeps
    if (!rooted) {
      if (Math.random() < WHEAT_WITHER_CHANCE) this.set(x, y, MaterialId.Empty);
      return;
    }

    let ripe = this.meta[i];
    if (ripe < 255 && Math.random() < this.growthFactor()) {
      ripe = Math.min(255, ripe + WHEAT_RIPEN_PER_TICK);
      this.meta[i] = ripe;
    }

    // Grow taller: only from a cell that's ripened a bit, only if this stalk
    // is under WHEAT_MAX_HEIGHT and the cell above is clear.
    if (ripe >= WHEAT_GROW_AT && this.get(x, y - 1) === MaterialId.Empty && Math.random() < WHEAT_GROW_CHANCE * this.growthFactor()) {
      let stalk = 1;
      for (let d = 1; d < WHEAT_MAX_HEIGHT; d++) {
        if (this.get(x, y + d) === MaterialId.Wheat) stalk++;
        else break;
      }
      if (stalk < WHEAT_MAX_HEIGHT) this.set(x, y - 1, MaterialId.Wheat, 0);
    }

    // A ripe head sows itself into an adjacent empty cell that has soil under
    // it — but not in under a house, and not once the field's at its limit.
    if (
      ripe >= WHEAT_RIPE && !this.roofedOver(x, y) &&
      this.cropCensus < Math.max(1, this.farmerCensus) * WHEAT_PER_FARMER + 40 &&
      Math.random() < WHEAT_SEED_CHANCE * this.growthFactor()
    ) {
      const spots: [number, number][] = [];
      for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny) || this.get(nx, ny) !== MaterialId.Empty) continue;
        if (this.roofedOver(nx, ny)) continue;
        const g = this.inBounds(nx, ny + 1) ? this.get(nx, ny + 1) : MaterialId.Stone;
        if (g === MaterialId.Dirt || g === MaterialId.Mud) spots.push([nx, ny]);
      }
      if (spots.length > 0) {
        const [sx, sy] = spots[Math.floor(Math.random() * spots.length)];
        this.set(sx, sy, MaterialId.Wheat, 0);
      }
    }
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
      // Salt thaws Gelo it lands on — the ice melts to brine and the grain
      // dissolves into it. (A real winter trick: salt the ice and it goes.)
      if (this.material[wi] === MaterialId.Ice && Math.random() < 0.5) {
        this.set(nx, ny, MaterialId.Water, 255);
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
      // Sand by the lava mostly fuses to Glass; only sometimes does it melt on
      // through into more Lava.
      if (nId === MaterialId.Sand && Math.random() < HEAT_FUSE_GLASS) { this.set(nx, ny, MaterialId.Glass); continue; }
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

  // ── Creatures & Magia ──────────────────────────────────────────────────

  /** A random empty 8-neighbour of (x, y), or null if the cell is walled in. */
  private randomEmptyNeighbor(x: number, y: number): [number, number] | null {
    const spots: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.get(nx, ny) === MaterialId.Empty) spots.push([nx, ny]);
    }
    return spots.length ? spots[Math.floor(Math.random() * spots.length)] : null;
  }

  /** Step direction [dx, dy] (each -1/0/1) toward the nearest food a Formiga can smell within ANT_SMELL_RANGE, or [0, 0] if there's none. */
  private antScentDir(x: number, y: number): [number, number] {
    let bestD = Infinity;
    let best: [number, number] = [0, 0];
    for (let dy = -ANT_SMELL_RANGE; dy <= ANT_SMELL_RANGE; dy++) {
      for (let dx = -ANT_SMELL_RANGE; dx <= ANT_SMELL_RANGE; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const id = this.material[this.index(nx, ny)] as MaterialId;
        if (
          id !== MaterialId.Plant && id !== MaterialId.Sprout && id !== MaterialId.Flor &&
          id !== MaterialId.Seed && id !== MaterialId.Wood && id !== MaterialId.Mud
        ) {
          continue;
        }
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [Math.sign(dx), Math.sign(dy)];
        }
      }
    }
    return best;
  }

  /** Moves a creature into an Empty cell and stamps its fresh state byte at the destination (swap() carries the old byte along, so it has to be overwritten). */
  private moveCreature(fx: number, fy: number, tx: number, ty: number, newMeta: number): void {
    this.swap(fx, fy, tx, ty);
    this.meta[this.index(tx, ty)] = newMeta;
  }

  /**
   * Moves a Peixe into an adjacent Água cell, keeping each side's meaning
   * intact — the fish's state byte follows the fish, and the water's
   * salinity stays with the water it left behind. `swap()` can't be used
   * here: it would trade the two meta bytes, turning the fish's hunger
   * gauge into a salinity reading and vice-versa.
   */
  private moveFish(fx: number, fy: number, tx: number, ty: number, fishMeta: number): void {
    const fi = this.index(fx, fy);
    const ti = this.index(tx, ty);
    const salinity = this.meta[ti];
    this.material[ti] = MaterialId.Fish;
    this.meta[ti] = fishMeta;
    this.material[fi] = MaterialId.Water;
    this.meta[fi] = salinity;
    this.processed[fi] = 1;
    this.processed[ti] = 1;
    this.wake(fx, fy);
    this.wake(tx, ty);
  }

  /**
   * Formiga: a surface walker. Falls when nothing's underfoot, otherwise
   * trudges along the ground in its facing direction — stepping down slopes,
   * climbing walls and low steps, burrowing through loose Areia/Terra/Barro
   * (which carves tunnels as the displaced grain spills back), and turning
   * around at water's edge or a dead end. Eats touching Planta/Broto/Flor/
   * Semente to refill a hunger gauge that drains over time (it starves
   * without food) and, when well fed, occasionally lays another Formiga.
   * Drowns in Água, burns in Fogo/Lava.
   */
  private stepAnt(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    let facing = creatureFacing(this.meta[i]);
    let fed = creatureFed(this.meta[i]);

    // An ant walking a shoreline has water to one side and is fine — it only
    // drowns when it's actually *in* it: water directly underfoot, or water
    // on most sides. Fogo/Lava on any side is instantly fatal.
    let waterBelow = false;
    let waterAround = 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.material[this.index(nx, ny)] as MaterialId;
      if (nId === MaterialId.Water) {
        waterAround++;
        if (dx === 0 && dy === 1) waterBelow = true;
      } else if (nId === MaterialId.Lava) {
        this.igniteAt(x, y);
        return;
      }
      // Touching Fogo is *not* handled here — the flame's own per-tick
      // ignition roll (stepFire, gated by this material's ignitionChance)
      // lights the ant, which is the same mechanism that then carries the
      // fire on to the next ant. A brief spark it can walk away from; a
      // sustained fire is still certain death within a tick or two.
    }
    if ((waterBelow || waterAround >= 3) && Math.random() < ANT_DROWN_CHANCE) {
      this.set(x, y, MaterialId.Empty);
      return;
    }

    // Two food classes: fresh greenery (fast, fills the gauge right up) and
    // gnawable solids — Madeira and Barro — which ants really do eat, just
    // slowly, so an ant-ridden wooden wall wears away over time.
    const foods: [number, number][] = [];
    const solidFoods: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      if (nId === MaterialId.Plant || nId === MaterialId.Sprout || nId === MaterialId.Flor || nId === MaterialId.Seed) {
        foods.push([nx, ny]);
      } else if (
        (nId === MaterialId.Wood || nId === MaterialId.Mud) &&
        (this.meta[this.index(nx, ny)] & HOUSE_WALL_META) === 0 // don't gnaw a house
      ) {
        solidFoods.push([nx, ny]);
      }
    }
    const breed = (): void => {
      if (Math.random() >= ANT_BREED_CHANCE) return;
      const spot = this.randomEmptyNeighbor(x, y);
      if (spot) {
        this.set(spot[0], spot[1], MaterialId.Ant, packCreature(Math.random() < 0.5 ? 1 : -1, 0, CREATURE_FED_MAX >> 1));
      }
    };
    if (foods.length > 0) {
      if (Math.random() < ANT_EAT_CHANCE) {
        const [fx, fy] = foods[Math.floor(Math.random() * foods.length)];
        this.set(fx, fy, MaterialId.Empty);
        fed = CREATURE_FED_MAX;
        breed();
      }
    } else if (solidFoods.length > 0) {
      if (Math.random() < ANT_EAT_SOLID_CHANCE) {
        const [fx, fy] = solidFoods[Math.floor(Math.random() * solidFoods.length)];
        this.set(fx, fy, MaterialId.Empty);
        fed = Math.min(CREATURE_FED_MAX, fed + ANT_SOLID_FEED_GAIN);
        breed();
      }
    } else if (fed > 0 && Math.random() < 1 / ANT_HUNGER_INTERVAL) {
      fed--;
    } else if (fed === 0 && Math.random() < CREATURE_STARVE_DEATH_CHANCE) {
      this.set(x, y, MaterialId.Empty);
      return;
    }

    if (Math.random() < ANT_TURN_CHANCE) facing = -facing;

    // Follows a scent: if there's food it isn't already touching within
    // smelling distance, the ant turns toward it and heads over (climbing
    // if it's above) — this is what keeps a colony gathered on a plant
    // patch or gnawing up into a wooden post instead of every ant
    // wandering off after one nibble.
    // The scent check is a small area scan — only run it every few ticks
    // per ant (staggered by column so they don't all scan the same frame);
    // food doesn't move, so re-sniffing every single tick buys nothing.
    let scentUp = false;
    if (foods.length === 0 && solidFoods.length === 0 && (this.tick + x) % 3 === 0) {
      const [sdx, sdy] = this.antScentDir(x, y);
      if (sdx !== 0) facing = sdx;
      scentUp = sdy < 0;
    } else if (solidFoods.length > 0) {
      // Gnawing at a solid — keep pushing up into the chamber it's hollowing
      // out rather than dropping back to flat ground.
      scentUp = this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty;
    }

    const below = this.inBounds(x, y + 1) ? this.get(x, y + 1) : MaterialId.Stone;
    if (below === MaterialId.Empty) {
      this.moveCreature(x, y, x, y + 1, packCreature(facing, 0, fed));
      return;
    }

    const fwd = x + facing;

    // Food sensed above (a plant clump overhead, wood it has eaten up into):
    // climb toward it rather than trudging along flat ground past it.
    if (scentUp) {
      if (this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty && Math.random() < 0.7) {
        this.moveCreature(x, y, x, y - 1, packCreature(facing, 0, fed));
        return;
      }
      if (this.inBounds(fwd, y - 1) && this.get(fwd, y - 1) === MaterialId.Empty && Math.random() < 0.5) {
        this.moveCreature(x, y, fwd, y - 1, packCreature(facing, 0, fed));
        return;
      }
    }

    const fwdId = this.inBounds(fwd, y) ? this.get(fwd, y) : MaterialId.Stone;
    if (fwdId === MaterialId.Water) {
      this.meta[i] = packCreature(-facing, 0, fed);
      return;
    }
    if (fwdId === MaterialId.Empty) {
      const belowFwd = this.inBounds(fwd, y + 1) ? this.get(fwd, y + 1) : MaterialId.Stone;
      const target: [number, number] = belowFwd === MaterialId.Empty ? [fwd, y + 1] : [fwd, y];
      this.moveCreature(x, y, target[0], target[1], packCreature(facing, 0, fed));
      return;
    }
    if (
      (fwdId === MaterialId.Sand || fwdId === MaterialId.Dirt || fwdId === MaterialId.Mud) &&
      Math.random() < ANT_DIG_CHANCE
    ) {
      this.swap(x, y, fwd, y);
      this.meta[this.index(fwd, y)] = packCreature(facing, 0, fed);
      this.meta[i] = 0;
      return;
    }
    // Blocked by another animal (the ant ahead in the trail, a bird, a fish):
    // just turn or wait rather than clambering over it — that eager climb was
    // what made a painted line of ants burst apart into a cloud in one tick,
    // so fire had nothing left to spread between.
    if (MATERIALS[fwdId].category === MaterialCategory.Creature) {
      this.meta[i] = packCreature(Math.random() < 0.4 ? -facing : facing, 0, fed);
      return;
    }
    const upId = this.inBounds(x, y - 1) ? this.get(x, y - 1) : MaterialId.Stone;
    if (upId === MaterialId.Empty && Math.random() < 0.45) {
      this.moveCreature(x, y, x, y - 1, packCreature(facing, 0, fed));
      return;
    }
    const fwdUpId = this.inBounds(fwd, y - 1) ? this.get(fwd, y - 1) : MaterialId.Stone;
    if (fwdUpId === MaterialId.Empty && Math.random() < 0.35) {
      this.moveCreature(x, y, fwd, y - 1, packCreature(facing, 0, fed));
      return;
    }
    this.meta[i] = packCreature(-facing, 0, fed);
  }

  /**
   * The nearest thing a Pássaro will swoop on — a Formiga, or a Peixe that's
   * broken the surface (has an Empty cell beside it, so the bird can reach
   * it without diving underwater) — within BIRD_HUNT_RANGE, or null. Returns
   * the [dx, dy] step direction toward it.
   */
  private birdPreyDir(x: number, y: number): [number, number] | null {
    let bestD = Infinity;
    let best: [number, number] | null = null;
    for (let dy = -BIRD_HUNT_RANGE; dy <= BIRD_HUNT_RANGE; dy++) {
      for (let dx = -BIRD_HUNT_RANGE; dx <= BIRD_HUNT_RANGE; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const id = this.material[this.index(nx, ny)] as MaterialId;
        let prey = false;
        if (id === MaterialId.Ant) {
          prey = true;
        } else if (id === MaterialId.Fish) {
          prey = ([[0, -1], [-1, 0], [1, 0], [0, 1]] as const).some(([ax, ay]) => {
            const fx = nx + ax;
            const fy = ny + ay;
            return this.inBounds(fx, fy) && this.get(fx, fy) === MaterialId.Empty;
          });
        }
        if (!prey) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [Math.sign(dx), Math.sign(dy)];
        }
      }
    }
    return best;
  }

  /**
   * Pássaro: cruises open air in a lazy band near the top of the scene, but
   * breaks off to **swoop** the moment it spots a Formiga on the ground or a
   * Peixe at the surface within BIRD_HUNT_RANGE — diving straight at it and
   * snatching it on contact. Flees Fogo/Lava (which always wins over a
   * hunt), and, with energy to spare, drops a Semente into the open cell
   * below it now and then. Burns if it can't get clear of flame.
   */
  private stepBird(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    let facing = creatureFacing(this.meta[i]);
    let fed = creatureFed(this.meta[i]);

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      if (this.get(nx, ny) === MaterialId.Lava) {
        this.igniteAt(x, y);
        return;
      }
      // Fogo is left to the flame's own ignition roll (see stepFire) — that
      // way a burning bird reliably passes the fire to the next one instead
      // of just dying alone.
    }

    const foods: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      if (nId === MaterialId.Seed || nId === MaterialId.Ant || nId === MaterialId.Fish) foods.push([nx, ny]);
    }
    // A swoop lands its catch far more reliably than an idle peck — prey
    // it's actually reached rarely gets away.
    if (foods.length > 0 && Math.random() < 0.85) {
      const [fx, fy] = foods[Math.floor(Math.random() * foods.length)];
      this.set(fx, fy, MaterialId.Empty);
      fed = Math.min(CREATURE_FED_MAX, fed + BIRD_FEED_GAIN);
    } else if (fed > 0 && Math.random() < 1 / BIRD_HUNGER_INTERVAL) {
      fed--;
    } else if (fed === 0 && Math.random() < CREATURE_STARVE_DEATH_CHANCE) {
      this.set(x, y, MaterialId.Empty);
      return;
    }

    if (
      fed > 20 && Math.random() < BIRD_LAY_CHANCE &&
      this.inBounds(x, y + 2) &&
      this.get(x, y + 1) === MaterialId.Empty && this.get(x, y + 2) === MaterialId.Empty
    ) {
      // Two clear cells below, so the seed actually drops away instead of
      // hanging in a packed flock.
      this.set(x, y + 1, MaterialId.Seed);
      fed -= 6;
    }

    let flee = 0;
    for (let dy = -BIRD_HAZARD_RANGE; dy <= BIRD_HAZARD_RANGE && flee === 0; dy++) {
      for (let dx = -BIRD_HAZARD_RANGE; dx <= BIRD_HAZARD_RANGE; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const nId = this.material[this.index(nx, ny)] as MaterialId;
        if (nId === MaterialId.Fire || nId === MaterialId.Lava) {
          flee = dx >= 0 ? -1 : 1;
          break;
        }
      }
    }

    const bandTop = Math.ceil(this.height * BIRD_BAND_TOP_FRAC);
    // A peckish bird drops out of its lazy high cruise and patrols low over
    // the ground/water, hunting — which is what brings it within swooping
    // range of Formigas and surfacing Peixes. Once it's eaten its fill it
    // climbs back up to soar.
    const hungry = fed < BIRD_HUNGER_DIVE;
    const bandBottom = hungry
      ? this.height - 3
      : Math.floor(this.height * BIRD_BAND_BOTTOM_FRAC);
    let vbias: number;
    if (y < bandTop) vbias = 1;
    else if (y > bandBottom) vbias = -1;
    else if (hungry) vbias = Math.random() < 0.55 ? 1 : 0;
    else vbias = Math.random() < 0.3 ? -1 : Math.random() < 0.4 ? 1 : 0;

    // Hunt (only while peckish, and not fleeing): a spotted Formiga/Peixe
    // pulls the bird straight at it, ignoring the cruising band. A well-fed
    // bird just soars and lets prey be — that oscillation is what stops a
    // flock from hoovering every ant and fish off the map. Also the pricey
    // area scan then only runs for the birds actually hunting.
    const hunt = hungry && flee === 0 ? this.birdPreyDir(x, y) : null;

    let tries: [number, number][];
    if (flee !== 0) {
      facing = flee;
      tries = [[flee, -1], [flee, 0], [0, -1], [flee, 1]];
    } else if (hunt) {
      const [hx, hy] = hunt;
      if (hx !== 0) facing = hx;
      tries = [
        [hx, hy],
        [hx, 0],
        [0, hy],
        [hx, -hy],
        [facing, 0],
      ];
    } else {
      if (Math.random() < BIRD_TURN_CHANCE) facing = -facing;
      tries = [
        [facing, vbias],
        [facing, 0],
        [0, vbias],
        [facing, vbias === 0 ? -1 : vbias],
        [0, -1],
      ];
    }
    for (const [mx, my] of tries) {
      if (mx === 0 && my === 0) continue;
      const nx = x + mx;
      const ny = y + my;
      if (this.inBounds(nx, ny) && this.get(nx, ny) === MaterialId.Empty) {
        this.moveCreature(x, y, nx, ny, packCreature(facing, 0, fed));
        return;
      }
    }
    this.meta[i] = packCreature(-facing, 0, fed);
  }

  /**
   * Peixe: swims only inside Água, nudging horizontally in its facing
   * direction with a gentle vertical wander and shying away from the open
   * surface. Nibbles submerged Planta/Broto/Semente for food, breeds in
   * roomy water when well fed, and dies to Ácido/Lava/Fogo on contact or to
   * water that's come to a boil. Out of water it flops around a few ticks
   * (its `timer` nibble counting up) and then suffocates.
   */
  private stepFish(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    let facing = creatureFacing(this.meta[i]);
    let timer = creatureTimer(this.meta[i]);
    let fed = creatureFed(this.meta[i]);

    let waterCount = 0;
    let airCount = 0;
    const sideWater: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.material[this.index(nx, ny)] as MaterialId;
      if (nId === MaterialId.Acid || nId === MaterialId.Lava || nId === MaterialId.Fire) {
        this.set(x, y, MaterialId.Empty);
        return;
      }
      if (nId === MaterialId.Water) {
        waterCount++;
        if (dx === 0 || dy === 0) sideWater.push([nx, ny]);
      } else if (nId === MaterialId.Empty) {
        airCount++;
      }
    }

    if (this.temp >= WATER_BOIL_TEMP && waterCount > 0 && Math.random() < 0.05) {
      this.set(x, y, MaterialId.Empty);
      return;
    }

    if (waterCount === 0) {
      // Only actually suffocating if it's out in the air. Packed shoulder to
      // shoulder with other fish (no water *or* air touching) it's just
      // stuck for a beat — it'll get water back as the shoal shifts.
      if (airCount === 0) {
        this.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      // The flop timer only advances every few ticks, so a fish flung onto
      // the bank has a real moment to thrash its way back to the water.
      if (this.tick % FISH_AIR_TICK_SCALE === 0) timer++;
      if (timer >= FISH_AIR_TICKS) {
        this.set(x, y, MaterialId.Empty);
        return;
      }
      const spots: [number, number][] = [];
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny) && this.get(nx, ny) === MaterialId.Empty) spots.push([nx, ny]);
      }
      if (spots.length > 0) {
        const [nx, ny] = spots[Math.floor(Math.random() * spots.length)];
        this.moveCreature(x, y, nx, ny, packCreature(facing, timer, fed));
      } else {
        this.meta[i] = packCreature(facing, timer, fed);
      }
      return;
    }
    timer = 0;

    const foods: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.get(nx, ny);
      if (nId === MaterialId.Plant || nId === MaterialId.Sprout || nId === MaterialId.Seed) foods.push([nx, ny]);
    }
    if (foods.length > 0 && Math.random() < FISH_EAT_CHANCE) {
      const [fx, fy] = foods[Math.floor(Math.random() * foods.length)];
      this.set(fx, fy, MaterialId.Empty);
      fed = CREATURE_FED_MAX;
    } else if (fed > 0 && Math.random() < 1 / FISH_HUNGER_INTERVAL) {
      fed--;
    } else if (fed === 0 && Math.random() < CREATURE_STARVE_DEATH_CHANCE) {
      this.set(x, y, MaterialId.Empty);
      return;
    }

    if (fed >= CREATURE_FED_MAX - 4 && waterCount >= 4 && sideWater.length > 0 && Math.random() < FISH_BREED_CHANCE) {
      const [bx, by] = sideWater[Math.floor(Math.random() * sideWater.length)];
      const bi = this.index(bx, by);
      this.material[bi] = MaterialId.Fish;
      this.meta[bi] = packCreature(Math.random() < 0.5 ? 1 : -1, 0, CREATURE_FED_MAX >> 1);
      this.processed[bi] = 1;
      this.wake(bx, by);
      fed -= 8;
    }

    if (Math.random() < 0.03) facing = -facing;

    // A Pássaro hovering just overhead: bolt for deeper water. This is the
    // fish's one defence against a swoop — stay down and the bird can't
    // reach it.
    let birdAbove = false;
    for (let sy = 1; sy <= FISH_BIRD_SCARE && !birdAbove; sy++) {
      for (let sx = -2; sx <= 2; sx++) {
        if (this.inBounds(x + sx, y - sy) && this.get(x + sx, y - sy) === MaterialId.Bird) {
          birdAbove = true;
          break;
        }
      }
    }

    const aboveEmpty = this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty;
    const vbias = birdAbove ? 1 : aboveEmpty ? 1 : Math.random() < 0.25 ? -1 : Math.random() < 0.3 ? 1 : 0;
    const tries: [number, number][] = [
      [facing, vbias],
      [facing, 0],
      [0, vbias],
      [-facing, 0],
      [0, 1],
    ];
    for (const [mx, my] of tries) {
      if (mx === 0 && my === 0) continue;
      const nx = x + mx;
      const ny = y + my;
      if (this.inBounds(nx, ny) && this.get(nx, ny) === MaterialId.Water) {
        this.moveFish(x, y, nx, ny, packCreature(facing, 0, fed));
        return;
      }
    }
    this.meta[i] = packCreature(facing, 0, fed);
  }

  /**
   * Magia: a mote that drifts up and wanders, and each tick reaches for one
   * random neighbour and tries to turn it toward life and order (see
   * `transmute`). It carries a lifespan in `meta`; every successful
   * transmutation costs it extra life on top of the steady per-tick drain,
   * so one mote can only work so much magic before it winks out — leaving a
   * Flor behind now and then when it does.
   */
  private stepMagic(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    let life = this.meta[i];

    if (life <= 1) {
      // Only leaves a bloom if it fizzles resting against something solid —
      // a flower left hanging in open air looks wrong.
      const onSurface = ([[0, 1], [-1, 0], [1, 0], [0, -1]] as const).some(([dx, dy]) => {
        const sx = x + dx;
        const sy = y + dy;
        if (!this.inBounds(sx, sy)) return true;
        const sId = this.get(sx, sy);
        return sId !== MaterialId.Empty && sId !== MaterialId.Magic;
      });
      if (onSurface && Math.random() < MAGIC_BLOOM_ON_DEATH) {
        this.set(x, y, MaterialId.Flor, Math.floor(Math.random() * 4));
      } else {
        this.set(x, y, MaterialId.Empty);
        this.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      }
      return;
    }

    const [ndx, ndy] = NEIGHBORS_8[Math.floor(Math.random() * NEIGHBORS_8.length)];
    const nx = x + ndx;
    const ny = y + ndy;
    if (this.inBounds(nx, ny)) {
      if (this.transmute(nx, ny)) life = Math.max(1, life - MAGIC_CAST_COST);
      else if (Math.random() < MAGIC_CONJURE_CHANCE) this.conjureCreature(x, y);
    }

    life--;
    // Wanders in every direction with only a faint upward lean, so a mote
    // works the patch it was cast on instead of racing to the ceiling.
    const dirs = [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, 1]] as const;
    const [mx, my] = dirs[Math.floor(Math.random() * dirs.length)];
    const tx = x + mx;
    const ty = y + my;
    if (this.inBounds(tx, ty) && this.get(tx, ty) === MaterialId.Empty) {
      this.swap(x, y, tx, ty);
      this.meta[this.index(tx, ty)] = life;
    } else {
      this.meta[i] = life;
    }
  }

  /** One enchantment: nudges the cell at (x, y) toward life/order. Returns whether it actually changed anything (a miss costs the mote no extra life). */
  private transmute(x: number, y: number): boolean {
    const i = this.index(x, y);
    const id = this.material[i] as MaterialId;
    switch (id) {
      case MaterialId.Fire:
        if (Math.random() < 0.6) this.set(x, y, MaterialId.Empty);
        else this.set(x, y, MaterialId.Flor, Math.floor(Math.random() * 4));
        return true;
      case MaterialId.Lava:
        this.set(x, y, MaterialId.Stone);
        return true;
      case MaterialId.Acid:
      case MaterialId.AcidVapor:
      case MaterialId.Steam:
        this.set(x, y, MaterialId.Water);
        return true;
      case MaterialId.Gunpowder:
      case MaterialId.C4:
        this.set(x, y, MaterialId.Sand);
        return true;
      case MaterialId.Stone:
        if (Math.random() < 0.5) {
          this.set(x, y, MaterialId.Dirt);
          return true;
        }
        return false;
      case MaterialId.Sand:
        if (Math.random() < 0.25) {
          this.set(x, y, MaterialId.Seed);
          return true;
        }
        return false;
      case MaterialId.Dirt:
        this.set(x, y, MaterialId.Plant);
        return true;
      case MaterialId.Mud:
        this.set(x, y, MaterialId.Sprout, SPROUT_BUDGET_MIN);
        return true;
      case MaterialId.Warrior:
      case MaterialId.Skeleton: {
        // Magia doesn't unmake a fighter — it empowers it: twice the size,
        // twice the bite. Once only.
        if ((this.hp[i] & HP_EMPOWERED) !== 0) return false;
        this.hp[i] = HP_EMPOWERED | Math.min(HP_POINTS_MASK, (this.hp[i] & HP_POINTS_MASK) * 2);
        this.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
        return true;
      }
      case MaterialId.Wood:
        if (Math.random() < 0.4) {
          this.set(x, y, MaterialId.Plant);
          return true;
        }
        return false;
      case MaterialId.Ice:
        if (Math.random() < 0.5) {
          this.set(x, y, MaterialId.Water);
          return true;
        }
        return false;
      case MaterialId.Plant:
        if (Math.random() < 0.5) {
          this.set(x, y, MaterialId.Flor, Math.floor(Math.random() * 4));
          return true;
        }
        return false;
      case MaterialId.Sprout:
        if ((this.meta[i] & SPROUT_BUDGET_MASK) === 0) {
          this.meta[i] = SPROUT_REGROWTH_BONUS + 4;
          this.wake(x, y);
          return true;
        }
        return false;
      case MaterialId.Water: {
        let wc = 0;
        for (const [dx, dy] of NEIGHBORS_8) {
          const ax = x + dx;
          const ay = y + dy;
          if (this.inBounds(ax, ay) && this.get(ax, ay) === MaterialId.Water) wc++;
        }
        if (wc >= 5 && Math.random() < 0.05) {
          this.material[i] = MaterialId.Fish;
          this.meta[i] = packCreature(1, 0, CREATURE_FED_MAX);
          this.wake(x, y);
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /** Rarely, a mote conjures a creature that fits its surroundings — a Formiga onto firm ground by greenery, or a Peixe into a body of water. Never into open air. */
  private conjureCreature(x: number, y: number): void {
    const spot = this.randomEmptyNeighbor(x, y);
    if (!spot) return;
    const [sx, sy] = spot;
    let nearSoil = false;
    let water = 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const ax = sx + dx;
      const ay = sy + dy;
      if (!this.inBounds(ax, ay)) continue;
      const aId = this.get(ax, ay);
      if (
        aId === MaterialId.Dirt || aId === MaterialId.Mud ||
        aId === MaterialId.Plant || aId === MaterialId.Sprout || aId === MaterialId.Flor
      ) {
        nearSoil = true;
      } else if (aId === MaterialId.Water) {
        water++;
      }
    }
    const solidBelow = this.inBounds(sx, sy + 1) && this.get(sx, sy + 1) !== MaterialId.Empty;
    if (water >= 4) {
      this.set(sx, sy, MaterialId.Fish, this.metaFor(MaterialId.Fish));
    } else if (nearSoil && solidBelow) {
      this.set(sx, sy, MaterialId.Ant, this.metaFor(MaterialId.Ant));
    }
  }

  // ── O povo: Construtor, Lenhador, Plantador, Guerreiro ─────────────────────

  /** Collects the 8-neighbours of (x, y) whose material is in `ids`. */
  private adjacentOf(x: number, y: number, ids: readonly MaterialId[]): [number, number][] {
    const out: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && ids.includes(this.get(nx, ny))) out.push([nx, ny]);
    }
    return out;
  }

  /**
   * Horizontal step (-1/0/1) toward the nearest cell in `ids` within `range`
   * (default FOLK_SCAN_RANGE), or 0. Only ever called on a Pip's own turn
   * (already staggered by FOLK_ACT_INTERVAL), so no extra gate here.
   */
  private folkScanForIds(x: number, y: number, ids: readonly MaterialId[], range: number): number {
    let bestD = Infinity;
    let bestDx = 0;
    // Nearest match that's actually off to one side, tracked separately —
    // see below.
    let bestDOffAxis = Infinity;
    let bestDxOffAxis = 0;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (!ids.includes(this.material[this.index(nx, ny)] as MaterialId)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestDx = Math.sign(dx) || (dy < 0 ? (Math.random() < 0.5 ? 1 : -1) : 0);
        }
        if (dx !== 0 && d < bestDOffAxis) {
          bestDOffAxis = d;
          bestDxOffAxis = Math.sign(dx);
        }
      }
    }
    // The single nearest match can be straight up or down (dx === 0, dy >=
    // 0), which resolves to "no direction" above — that's the right answer
    // when it's truly the only thing around, but wrong when it's merely the
    // closest of several and a short walk sideways reaches an equally good
    // one. Prefer any off-axis match over a direction-less "nearest".
    return bestDx !== 0 ? bestDx : bestDxOffAxis;
  }
  /**
   * A horizontal step (-1/0/1) back toward the village — the nearest house or
   * fellow worker between ~8 and FOLK_HOME_RANGE cells off. An idle Pip uses
   * this so it drifts back to where the work is instead of striking out across
   * the map; a Pip already in among the houses (nothing past 8 cells, or
   * nothing at all) gets 0 and just paces where it is.
   */
  private folkHomeDir(x: number, y: number, trade: MaterialId): number {
    const targets = FOLK_HOME[trade];
    if (!targets) return 0;
    const near = trade === MaterialId.Mason ? MASON_HOME_NEAR : FOLK_HOME_NEAR;
    // Expanding rings from r=1, so the first hit is the *nearest* worksite.
    // Within `near` of it the Pip is home and roams free (0); only a worksite
    // further off than that reels it back — never a far one while a near one
    // says it's already home.
    for (let r = 1; r <= FOLK_HOME_RANGE; r++) {
      for (let k = -r; k <= r; k++) {
        const probes: [number, number][] = [
          [x + k, y - r], [x + k, y + r], [x - r, y + k], [x + r, y + k],
        ];
        for (const [nx, ny] of probes) {
          if (!this.inBounds(nx, ny)) continue;
          if (targets.includes(this.material[this.index(nx, ny)] as MaterialId)) {
            return r <= near ? 0 : (Math.sign(nx - x) || (Math.random() < 0.5 ? 1 : -1));
          }
        }
      }
    }
    return 0;
  }
  private folkScanDir(x: number, y: number, ids: readonly MaterialId[]): number {
    return this.folkScanForIds(x, y, ids, FOLK_SCAN_RANGE);
  }

  /**
   * The shared lethal-environment + feeding + hunger pass for a member of
   * o povo. Returns the (possibly lowered) fed value, or -1 if the folk
   * just died and the caller must bail. Água drowns it (only when it's
   * genuinely *in* the water — a shoreline is safe), Lava kills on contact;
   * it eats the same greenery/wood a Formiga does and otherwise starves,
   * very slowly.
   */
  private folkUpkeep(x: number, y: number, fed: number): number {
    let waterBelow = false;
    let waterAround = 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.material[this.index(nx, ny)] as MaterialId;
      if (nId === MaterialId.Lava) {
        this.igniteAt(x, y);
        return -1;
      }
      if (nId === MaterialId.Water) {
        waterAround++;
        if (dx === 0 && dy === 1) waterBelow = true;
      }
    }
    // Only drowns when genuinely dragged under — water on all sides, no air
    // above. A folk swimming at the surface (air overhead) or wading a
    // shoreline is fine; it makes for the nearest shore in `folkWalk`.
    if (waterBelow && waterAround >= 7 && Math.random() < FOLK_DROWN_CHANCE) {
      this.set(x, y, MaterialId.Empty);
      return -1;
    }

    // Trigo — the staple the Plantador grows. A Pip eats only when it's
    // actually peckish (so a standing field isn't grazed to nothing by a
    // well-fed crew milling through it): a ripe head once it's below its
    // forage threshold, a green shoot only when genuinely starving.
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      if (this.material[ni] !== MaterialId.Wheat) continue;
      const ripe = this.meta[ni] >= WHEAT_RIPE;
      if ((ripe && fed <= FOLK_FORAGE_HUNGER) || fed <= FOLK_STARVING) {
        if (Math.random() < FOLK_EAT_CHANCE) {
          this.set(nx, ny, MaterialId.Empty);
          return CREATURE_FED_MAX;
        }
        return fed;
      }
    }

    // Exposure: a hostile climate with no roof over its head slowly kills,
    // the further past comfort the faster.
    const past =
      this.temp < FOLK_COMFORT_MIN ? FOLK_COMFORT_MIN - this.temp :
      this.temp > FOLK_COMFORT_MAX ? this.temp - FOLK_COMFORT_MAX : 0;
    if (past > 0 && !this.folkSheltered(x, y)) {
      if (Math.random() < Math.min(FOLK_EXPOSURE_CAP, past * FOLK_EXPOSURE_PER_DEGREE)) {
        this.set(x, y, MaterialId.Empty);
        return -1;
      }
    }

    if (fed > 0 && Math.random() < 1 / FOLK_HUNGER_INTERVAL) return fed - 1;
    // A Pip run right out of food doesn't drop dead — it's an agent you
    // placed, not livestock. It just sits at empty and keeps looking (see
    // the starving forage in `folkWalk`). Only a truly barren, foodless map
    // ever thins the crew, and very slowly.
    if (fed === 0 && Math.random() < CREATURE_STARVE_DEATH_CHANCE * 0.15) {
      this.set(x, y, MaterialId.Empty);
      return -1;
    }
    return fed;
  }

  /** Whether (x, y) is under cover — a structural-solid roof within 4 cells straight up and a wall within 5 cells to each side (checked at this row and the two above, so a doorway lintel still counts as that side's wall). Purely geometric, so a hand-built brick box shelters as well as a mason's house. */
  private folkSheltered(x: number, y: number): boolean {
    let roof = false;
    for (let d = 1; d <= 4; d++) {
      if (this.inBounds(x, y - d) && HOUSE_WALLS.includes(this.get(x, y - d))) {
        roof = true;
        break;
      }
    }
    if (!roof) return false;
    let left = false;
    let right = false;
    for (let d = 1; d <= 5; d++) {
      for (let up = 0; up <= 2; up++) {
        if (!left && this.inBounds(x - d, y - up) && HOUSE_WALLS.includes(this.get(x - d, y - up))) left = true;
        if (!right && this.inBounds(x + d, y - up) && HOUSE_WALLS.includes(this.get(x + d, y - up))) right = true;
      }
    }
    return left && right;
  }

  /**
   * The whole weather response for a member of o povo, run once per step
   * right after `folkUpkeep`. Returns true if it took over the folk's turn
   * (the caller must then just `return`):
   *
   *  - comfortable climate → false, the folk goes about its trade.
   *  - hostile + already sheltered → hunkers down in place (true).
   *  - hostile + a house within HOUSE_SHELTER_RANGE → walks toward the
   *    nearest one that still has room (each plan shelters HOUSE_PLANS
   *    capacity folk); a full house is skipped for the next. The scan is
   *    staggered every 3rd tick per column so a cold snap with a crowd of
   *    folk doesn't stall the sim; on the off ticks the folk keeps its
   *    heading.
   *  - hostile + no house in sight → false, the folk carries on (and takes
   *    the exposure risk from `folkUpkeep`) — better to keep moving and
   *    maybe stumble on cover than freeze on the spot.
   */
  private folkWeather(x: number, y: number, i: number, facing: number, fed: number, carry: number): boolean {
    if (this.temp >= FOLK_COMFORT_MIN && this.temp <= FOLK_COMFORT_MAX) return false;

    if (this.folkSheltered(x, y)) {
      // Hunker down and stay put — no `folkWalk`, since its squeeze-through-a-
      // wall fallback (`folkPhase`) could pop the folk straight back out into
      // the weather it just came in from.
      this.meta[i] = packCreature(facing, carry, fed);
      return true;
    }

    const anchors: { ax: number; ay: number; d: number; plan: HousePlan }[] = [];
    for (let dy = -HOUSE_SHELTER_RANGE; dy <= HOUSE_SHELTER_RANGE; dy++) {
      const row = (y + dy) * this.width;
      for (let dx = -HOUSE_SHELTER_RANGE; dx <= HOUSE_SHELTER_RANGE; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
        const ni = row + nx;
        if (this.material[ni] !== MaterialId.Brick || (this.meta[ni] & HOUSE_ANCHOR_META) === 0) continue;
        anchors.push({ ax: nx, ay: ny, d: dx * dx + dy * dy, plan: HOUSE_PLANS[houseType(this.meta[ni])] });
      }
    }
    if (anchors.length === 0) return false; // nowhere to go — carry on
    anchors.sort((a, b) => a.d - b.d);
    let target = anchors[0];
    for (const h of anchors) {
      if (this.folkCountIn(h.ax, h.ay, h.plan) < h.plan.capacity) { target = h; break; }
    }
    const homeX = target.ax + Math.min(2, target.plan.span - 1); // aim just inside
    this.folkWalk(x, y, i, facing, fed, carry, Math.sign(homeX - x) || 1);
    return true;
  }

  /** How many folk are standing within a house's footprint (anchor at ax,ay). */
  private folkCountIn(ax: number, ay: number, plan: HousePlan): number {
    let n = 0;
    for (let dy = -plan.rise; dy <= 0; dy++) {
      for (let dx = 0; dx <= plan.span; dx++) {
        if (FOLK_IDS.includes(this.get(ax + dx, ay + dy))) n++;
      }
    }
    return n;
  }

  /**
   * Shared surface walk for o povo. A folk with a heading (`wantDir`, from
   * its trade) marches for it and gets *over or through* whatever's in the
   * way — climbs the wall, clambers the ledge, squeezes past a thin barrier.
   * A folk with nothing to head toward (`wantDir` 0) ambles, drifting its
   * facing at random so it meanders instead of pacing a fixed line. The one
   * thing it never does is the old "march into a wall, about-face, march
   * into the far wall, forever" metronome: a true dead end just makes it
   * wait for the way to open, and only rarely double back.
   */
  private folkWalk(
    x: number, y: number, i: number,
    facing: number, fed: number, carry: number, wantDir: number,
  ): void {
    // Peckish: break off the errand and head for the nearest crop within a
    // wide radius — a folk that's marching a beat (a mason looking for a lot,
    // say) has to be able to divert for a bite or it starves out there.
    if (fed <= FOLK_FORAGE_HUNGER) {
      const foodDir = this.folkScanForIds(x, y, FOLK_FORAGE, FOLK_FORAGE_RANGE);
      if (foodDir !== 0) wantDir = foodDir;
    }
    // Nothing pressing and no work in reach: amble back toward this trade's
    // worksite (or the houses) rather than wander off. Only Pips with no
    // landmark at all fall through to the loose pacing below.
    if (wantDir === 0) wantDir = this.folkHomeDir(x, y, this.material[i] as MaterialId);
    if (wantDir !== 0) {
      facing = wantDir;
    } else if (Math.random() < FOLK_WANDER_TURN) {
      facing = Math.random() < 0.5 ? 1 : -1; // pace this patch, don't march
    }
    const idle = wantDir === 0;
    // carry === 3 is the "walk solidly" marker (a mason closing on a wall gap):
    // it treats houses as real walls this step instead of ghosting through.
    const solidWalk = carry === 3;
    if (solidWalk) carry = 0;

    const below = this.inBounds(x, y + 1) ? this.get(x, y + 1) : MaterialId.Stone;
    // A finished deck — a plank with real support (deck or ground) on *both*
    // sides at foot level — is just a road. Folk walk it and step off its ends
    // normally; the single-file / no-scramble rules below are only for the
    // precarious leading edge of a deck still being laid.
    const onSpan = this.isDeck(x, y + 1);
    const spanFooted = (cx: number): boolean => {
      const c = this.inBounds(cx, y + 1) ? this.get(cx, y + 1) : MaterialId.Stone;
      return c !== MaterialId.Empty && c !== MaterialId.Water &&
        MATERIALS[c].category !== MaterialCategory.Liquid;
    };
    const onFinishedDeck = onSpan && spanFooted(x + 1) && spanFooted(x - 1);
    // Right by the water, or out on a bridge deck, a folk keeps its feet — no
    // climbing over a ledge or a fellow worker (scrambling up is what leaves a
    // Pip stranded at a corner or a crew stacked crooked on a half-built deck).
    const nearWater = !onFinishedDeck && below !== MaterialId.Water &&
      (this.countNear(x, y, MaterialId.Water, 4) > 0 || this.isDeck(x, y + 1) || this.isDeck(x + facing, y + 1) || this.isDeck(x - facing, y + 1));

    // In the water: forget the errand and get out. Step onto any dry footing
    // adjacent; failing that, strike out along the surface toward the nearest
    // shore; failing that, keep the head up. This is what stops a folk that's
    // dropped in a river (or has a plank flood under it) from drowning in
    // place or dithering at a corner.
    if (below === MaterialId.Water || this.get(x, y) === MaterialId.Water) {
      // Submerged (water overhead too): float up toward the surface first,
      // where it's safe to swim.
      if (this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Water) {
        this.moveCreature(x, y, x, y - 1, packCreature(facing, carry, fed));
        return;
      }
      const shore = this.nearestShoreDir(x, y);
      const order: [number, number][] = [
        [shore || facing, 0], [-(shore || facing), 0],
        [shore || facing, -1], [-(shore || facing), -1],
        [shore || facing, 1], [-(shore || facing), 1],
      ];
      for (const [sx, sy] of order) {
        const tx = x + sx;
        const ty = y + sy;
        if (!this.inBounds(tx, ty) || this.get(tx, ty) !== MaterialId.Empty) continue;
        const foot = this.inBounds(tx, ty + 1) ? this.get(tx, ty + 1) : MaterialId.Stone;
        if (foot === MaterialId.Empty || foot === MaterialId.Water) continue; // no footing there
        this.moveCreature(x, y, tx, ty, packCreature(Math.sign(sx) || facing, carry, fed));
        return;
      }
      if (shore !== 0) {
        const tx = x + shore;
        const t = this.inBounds(tx, y) ? this.get(tx, y) : MaterialId.Stone;
        if (t === MaterialId.Water || t === MaterialId.Empty) {
          this.moveCreature(x, y, tx, y, packCreature(shore, carry, fed)); // swim for it
          return;
        }
      }
      if (this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty) {
        this.moveCreature(x, y, x, y - 1, packCreature(-facing, carry, fed));
        return;
      }
      // Wedged in a pocket under a bridge deck with water below — climb up
      // through the plank onto the walkway rather than sit there.
      if (this.isDeck(x, y - 1) && this.inBounds(x, y - 2) && this.get(x, y - 2) === MaterialId.Empty) {
        this.moveCreature(x, y, x, y - 2, packCreature(-facing, carry, fed));
        return;
      }
    }

    // Houses are intangible to folk — they walk through the walls as if the
    // building were on a plane behind them. Standing on a roof/wall cell (the
    // sim put one under the folk) just means dropping straight through it to
    // the first real footing below.
    if (this.isGhost(x, y + 1)) {
      for (let d = 1; d <= 24; d++) {
        if (this.isGhost(x, y + d)) continue;
        const t = this.inBounds(x, y + d) ? this.get(x, y + d) : MaterialId.Stone;
        if (t === MaterialId.Empty) {
          this.moveCreature(x, y, x, y + d, packCreature(facing, carry, fed));
          return;
        }
        break;
      }
    }

    // On a bridge deck with somewhere to be: follow the planks — up over the
    // crown of the arch and down the far side. Each next plank may sit a row
    // higher or lower than this one.
    if (!idle && this.isDeck(x, y + 1)) {
      const nx = x + facing;
      if (this.isDeck(nx, y + 1) && this.get(nx, y) === MaterialId.Empty) {
        this.moveCreature(x, y, nx, y, packCreature(facing, carry, fed));
        return;
      }
      if (this.isDeck(nx, y) && this.inBounds(nx, y - 1) && this.get(nx, y - 1) === MaterialId.Empty) {
        this.moveCreature(x, y, nx, y - 1, packCreature(facing, carry, fed));
        return;
      }
      if (this.isDeck(nx, y + 2) && this.get(nx, y + 1) === MaterialId.Empty) {
        this.moveCreature(x, y, nx, y + 1, packCreature(facing, carry, fed));
        return;
      }
    }

    if (below !== MaterialId.Empty && FOLK_WADEABLE.has(below)) {
      // Perched on a crop stalk, not solid ground — sink on down through it.
      this.moveCreature(x, y, x, y + 1, packCreature(facing, carry, fed));
      return;
    }

    if (below === MaterialId.Empty) {
      // Already level with a house's ghosted wall/roof (or a tree) straight
      // ahead: step through it right away rather than falling back down.
      // This is what closes the loop where climbing the *solid* floor course
      // below lands a folk exactly level with the wall course above it —
      // that course is ghostable, so `wallAhead` below reads false there and
      // the old code just dropped straight back onto the floor, to climb
      // and drop the same way forever.
      if (!nearWater && this.isGhost(x + facing, y) &&
        this.folkThroughHouse(x, y, facing, fed, carry)) {
        return;
      }
      // Nothing underfoot. A folk on a job that's pressed against a wall
      // (ahead or behind) scales it — hauls itself up cell by cell rather
      // than dropping — so it can reach a roof or an upper-wall gap. It tops
      // out on its own once there's no more wall beside it. An idle folk, or
      // one in open air, just falls.
      const wallAhead = this.isFolkWall(x + facing, y);
      const wallBehind = this.isFolkWall(x - facing, y);
      const braced = wallAhead || wallBehind;
      // A house wall/roof (or a tree) directly overhead isn't really a cap —
      // folk pass through those — so it doesn't stop the climb here either.
      // Left uncorrected, a folk climbing the outside of a house's solid
      // floor/anchor course reads "capped" the moment a wall cell sits right
      // above it and just gives up, bouncing forever between that one climb
      // and the drop back down (see the fall-back note below).
      const aboveGhost = this.isGhost(x, y - 1);
      const capped = !this.inBounds(x, y - 1) || (this.get(x, y - 1) !== MaterialId.Empty && !aboveGhost);
      // Only haul upward if the wall actually keeps going up — climbing past
      // the top of a lone ledge (a roof eave sticking out, say) just drops
      // the folk straight back onto it, over and over.
      const wallContinues =
        this.isFolkWall(x + facing, y - 1) || this.isFolkWall(x - facing, y - 1);
      if (!idle && !nearWater && braced && !capped && wallContinues) {
        if (aboveGhost) {
          // Hop clean over the ghosted run to the first open cell above it —
          // the same way folk drop through a house from above — rather than
          // trying to stand inside a wall cell's own slot.
          for (let d = 1; d <= 24; d++) {
            if (this.isGhost(x, y - d)) continue;
            if (this.get(x, y - d) === MaterialId.Empty) {
              this.moveCreature(x, y, x, y - d, packCreature(facing, carry, fed));
              return;
            }
            break;
          }
        } else {
          this.moveCreature(x, y, x, y - 1, packCreature(facing, carry, fed)); // haul up the face
          return;
        }
      }
      // Braced against a wall with a roof or eave capping the climb: don't
      // just drop and re-climb forever under the overhang. Duck through the
      // wall (into the house, then out its doorway), or peel off it so the
      // fall clears the eave.
      if (braced && capped) {
        if (this.folkPhase(x, y, wallAhead ? facing : -facing, fed, carry)) return;
        const away = wallBehind ? facing : -facing;
        if (this.inBounds(x + away, y) && this.get(x + away, y) === MaterialId.Empty) {
          this.moveCreature(x, y, x + away, y, packCreature(away, carry, fed));
          return;
        }
      }
      // An idle folk falling back off a wall it had no reason to climb (open
      // air above, so the haul-up above didn't fire) lands facing away from
      // that wall instead of holding its old facing — otherwise it just walks
      // straight back into the same wall next turn and hauls up again, a
      // climb-then-drop loop that reads as a Pip bouncing forever in a corner.
      const faceOut = idle && wallAhead && !wallBehind ? -facing : facing;
      this.moveCreature(x, y, x, y + 1, packCreature(faceOut, carry, fed));
      return;
    }

    const fwd = x + facing;
    const fwdId = this.inBounds(fwd, y) ? this.get(fwd, y) : MaterialId.Stone;
    // A house or a tree in the way is no obstacle — the folk step straight
    // through (house walls / roof, or a tree trunk) to the first open cell on
    // the far side.
    if (!solidWalk && this.isGhost(fwd, y) &&
      this.folkThroughHouse(x, y, facing, fed, carry)) return;
    // Wade straight through a standing crop or a patch of plants — a folk
    // never gets hung up in a wheat field; the stalk just parts around it.
    if (FOLK_WADEABLE.has(fwdId)) {
      const belowFwd = this.inBounds(fwd, y + 1) ? this.get(fwd, y + 1) : MaterialId.Stone;
      if (belowFwd !== MaterialId.Empty && belowFwd !== MaterialId.Water) {
        this.moveCreature(x, y, fwd, y, packCreature(facing, carry, fed));
        return;
      }
    }
    if (fwdId === MaterialId.Empty) {
      const belowFwd = this.inBounds(fwd, y + 1) ? this.get(fwd, y + 1) : MaterialId.Stone;
      if (belowFwd !== MaterialId.Empty) {
        // Won't step off dry land onto open deep water (that's how a folk
        // drifts out and drowns) — but a shallow puddle, or a plank a mason
        // laid there, is fine to walk on.
        if (
          belowFwd === MaterialId.Water && this.get(fwd, y + 2) === MaterialId.Water &&
          below !== MaterialId.Water // already out over water? carry on, turning back is worse
        ) {
          this.folkRetreat(x, y, i, facing, carry, fed);
          return;
        }
        this.moveCreature(x, y, fwd, y, packCreature(facing, carry, fed)); // step forward, level
        return;
      }
      // Nothing under the cell ahead. If it's a one-cell gap with solid
      // footing right across it, stride over — don't drop in only to climb
      // straight back out, over and over (the "stuck in the little hole").
      const ax = x + facing * 2;
      const acrossFloor = this.inBounds(ax, y + 1) ? this.get(ax, y + 1) : MaterialId.Stone;
      if (
        this.inBounds(ax, y) && this.get(ax, y) === MaterialId.Empty &&
        acrossFloor !== MaterialId.Empty && MATERIALS[acrossFloor].category !== MaterialCategory.Liquid
      ) {
        this.moveCreature(x, y, ax, y, packCreature(facing, carry, fed));
        return;
      }
      // Dropping off this ledge would land the folk in water at the bottom of
      // the fall, or drop it into a channel it should be bridging, not wading
      // — turn back.
      if (nearWater || below !== MaterialId.Water) {
        for (let d = 1; d <= 5; d++) {
          const c = this.get(fwd, y + d);
          if (c === MaterialId.Empty) continue;
          if (c === MaterialId.Water) {
            this.folkRetreat(x, y, i, facing, carry, fed);
            return;
          }
          break; // solid footing down there — fine to drop in
        }
      }
      this.moveCreature(x, y, fwd, y + 1, packCreature(facing, carry, fed)); // step down / into the gap
      return;
    }
    if (fwdId === MaterialId.Water) {
      // Can't wade — turn back off the shore rather than stand there dithering.
      this.folkRetreat(x, y, i, facing, carry, fed);
      return;
    }
    if (MATERIALS[fwdId].category === MaterialCategory.Creature) {
      // Near water it's single file — never clamber over the folk ahead (a
      // crew stacking up at the wrong height is what lays a crooked deck).
      // Just wait a beat, or drop back.
      if (this.isDeck(x, y + 1) || this.countNear(x, y, MaterialId.Water, 4) > 0) {
        this.meta[i] = packCreature(Math.random() < 0.5 ? -facing : facing, carry, fed);
        return;
      }
      // An idle folk gives way rather than crowd in — this is what stops a
      // knot of Pips packing solid at a shared worksite. A folk on a real
      // errand tries to get past: over the top if there's room, else hold a
      // beat (but turn back if it's wedged from behind too).
      if (idle) {
        this.meta[i] = packCreature(-facing, carry, fed);
        return;
      }
      if (this.inBounds(fwd, y - 1) && this.get(fwd, y - 1) === MaterialId.Empty && Math.random() < 0.7) {
        this.moveCreature(x, y, fwd, y - 1, packCreature(facing, carry, fed));
        return;
      }
      const backId = this.inBounds(x - facing, y) ? this.get(x - facing, y) : MaterialId.Stone;
      const jammed = !this.inBounds(x - facing, y) || MATERIALS[backId].category === MaterialCategory.Creature;
      this.meta[i] = packCreature(jammed || Math.random() < 0.25 ? -facing : facing, carry, fed);
      return;
    }
    // Blocked by a wall or step. Clamber over it (onto the ledge at fwd,
    // y-1), else straight up the face, else squeeze through it (`folkPhase`).
    // Not right by the water, though — turn back there instead of scrambling.
    // The exception: stepping *off* a deck up onto the dry far bank (solid
    // ground would be under our feet after the clamber). That's finishing the
    // crossing, not scrambling into the drink, so the water rule doesn't apply.
    const climbToLand =
      this.inBounds(fwd, y - 1) && this.get(fwd, y - 1) === MaterialId.Empty &&
      this.firmFooting(fwd, y - 1) && this.get(fwd, y + 1) !== MaterialId.Water;
    const overClear = (!nearWater || climbToLand) && this.inBounds(fwd, y - 1) && this.get(fwd, y - 1) === MaterialId.Empty;
    if (overClear && Math.random() < 0.95) {
      this.moveCreature(x, y, fwd, y - 1, packCreature(facing, carry, fed));
      return;
    }
    if ((!nearWater || climbToLand) && this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty && Math.random() < 0.9) {
      this.moveCreature(x, y, x, y - 1, packCreature(facing, carry, fed));
      return;
    }
    if (nearWater) {
      this.folkRetreat(x, y, i, facing, carry, fed);
      return;
    }
    if (this.folkPhase(x, y, facing, fed, carry)) return;
    if (this.folkPhase(x, y, -facing, fed, carry)) return; // try squeezing the other way too
    // Truly boxed in. Turn around, and if there's headroom haul up a cell so
    // a folk can never sit dead-still forever wedged between two others.
    if (this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty) {
      this.moveCreature(x, y, x, y - 1, packCreature(-facing, carry, fed));
      return;
    }
    // Sealed in on every side, packed earth overhead too — a pit that
    // slumped shut around it, say. Loose ground gives: dig out rather than
    // sit there entombed forever with nothing left in the ordinary
    // repertoire to try.
    if (this.folkDigOut(x, y, i, facing, carry, fed)) return;
    this.meta[i] = packCreature(-facing, carry, fed);
  }

  /**
   * Last resort for a folk with nowhere left to go (walls all round, no
   * headroom): shoulder into whichever neighbor — straight up first, then
   * ahead, then behind — is soft Powder (never real rock, metal, ice...)
   * and climb into the gap it leaves. Returns whether it dug through.
   */
  private folkDigOut(x: number, y: number, i: number, facing: number, carry: number, fed: number): boolean {
    for (const [dx, dy] of [[0, -1], [facing, 0], [-facing, 0]] as const) {
      const tx = x + dx, ty = y + dy;
      if (!this.inBounds(tx, ty)) continue;
      if (MATERIALS[this.get(tx, ty)].category === MaterialCategory.Powder) {
        this.set(tx, ty, MaterialId.Empty);
        this.moveCreature(x, y, tx, ty, packCreature(dx !== 0 ? dx : -facing, carry, fed));
        return true;
      }
    }
    return false;
  }

  /**
   * A folk backed up against water (or a ledge over water) that it can't
   * cross: it turns around and steps back onto firm ground rather than
   * standing at the corner flip-flopping its facing. If it's boxed in — water
   * or wall behind too — it climbs up out of the pocket, or as a last
   * resort digs through loose ground rather than flip its facing forever.
   */
  private folkRetreat(x: number, y: number, i: number, facing: number, carry: number, fed: number): void {
    for (const [dx, dy] of [[-facing, 0], [-facing, -1], [-facing, 1]] as const) {
      const tx = x + dx;
      const ty = y + dy;
      if (!this.inBounds(tx, ty) || this.get(tx, ty) !== MaterialId.Empty) continue;
      const foot = this.inBounds(tx, ty + 1) ? this.get(tx, ty + 1) : MaterialId.Stone;
      if (foot === MaterialId.Empty || foot === MaterialId.Water || MATERIALS[foot].category === MaterialCategory.Liquid) continue;
      this.moveCreature(x, y, tx, ty, packCreature(-facing, carry, fed));
      return;
    }
    if (this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty) {
      this.moveCreature(x, y, x, y - 1, packCreature(-facing, carry, fed));
      return;
    }
    if (this.folkDigOut(x, y, i, facing, carry, fed)) return;
    this.meta[i] = packCreature(-facing, carry, fed);
  }

  /** Whether a Pip takes its (slow, staggered) turn this tick — or is standing in water, in which case it acts every tick to get itself out. */
  private folkActNow(x: number, y: number): boolean {
    if ((this.tick + y) % FOLK_ACT_INTERVAL === 0) return true;
    return this.get(x, y) === MaterialId.Water ||
      (this.inBounds(x, y + 1) && this.get(x, y + 1) === MaterialId.Water);
  }

  /** Nearest horizontal direction (-1/1) to a dry standable shore at row y, or 0. */
  private nearestShoreDir(x: number, y: number): number {
    for (let d = 1; d <= 40; d++) {
      for (const dir of [1, -1] as const) {
        const cx = x + dir * d;
        if (this.inBounds(cx, y) && this.get(cx, y) !== MaterialId.Water && this.firmFooting(cx, y)) return dir;
      }
    }
    return 0;
  }

  /** A solid a folk can brace against to climb (a wall/step, not a powder pile it'd just sink into, and not a house — houses are intangible to folk). */
  private isFolkWall(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true; // the world edge is a wall to lean on
    if (this.isGhost(x, y)) return false; // houses, trees and open doors are intangible to folk
    return MATERIALS[this.get(x, y)].category === MaterialCategory.Solid;
  }

  /** Whether cell `i` is part of a house — a structural material carrying the house-wall meta bit. (The bit alone isn't enough: a ripe Trigo head's ripeness meta can happen to set it.) */
  private isHouseCell(i: number): boolean {
    return (this.meta[i] & HOUSE_WALL_META) !== 0 && HOUSE_WALLS.includes(this.material[i] as MaterialId);
  }

  /** A house cell folk pass straight through — walls, roof, windows, chimney. The floor course and mason-laid bridge decks (HOUSE_FLOOR) stay solid underfoot. */
  private houseGhost(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    if (!this.isHouseCell(i)) return false;
    if ((this.meta[i] & HOUSE_ANCHOR_META) !== 0) return true; // the doorway-sill anchor is a wall
    return (this.meta[i] & HOUSE_KIND_MASK) !== HOUSE_FLOOR;
  }

  /**
   * A folk walking through a house that's in its path: skips over the run of
   * intangible house cells ahead and steps into the first open cell beyond
   * them (interior air or the far side). Won't surface into open water.
   * Returns whether it moved.
   */
  private folkThroughHouse(x: number, y: number, facing: number, fed: number, carry: number): boolean {
    for (let step = 1; step <= 24; step++) {
      const tx = x + facing * step;
      if (!this.inBounds(tx, y)) return false;
      // straight through a house wall, a tree trunk, an open door, or a crop / stored harvest
      if (this.isGhost(tx, y) || FOLK_WADEABLE.has(this.get(tx, y))) continue;
      if (this.get(tx, y) !== MaterialId.Empty) return false; // something solid that isn't ghostable
      const below = this.inBounds(tx, y + 1) ? this.get(tx, y + 1) : MaterialId.Stone;
      if (below === MaterialId.Water) return false;
      this.moveCreature(x, y, tx, y, packCreature(facing, carry, fed));
      return true;
    }
    return false;
  }

  /**
   * A blocked folk ducks straight through a thin barrier. Looks past the
   * solid ahead — up to FOLK_PHASE_REACH cells of it — for the first open
   * cell it could stand in or drop from, and steps there in one move (the
   * cells between are untouched). Only wall-like solids are passable
   * (Tijolo/Madeira/Gelo/Metal/Vidro), never powders — folk climb those.
   * Returns whether it moved.
   */
  private folkPhase(x: number, y: number, facing: number, fed: number, carry: number): boolean {
    let reach = FOLK_PHASE_REACH + 1;
    for (let step = 2; step <= reach; step++) {
      const tx = x + facing * step;
      if (!this.inBounds(tx, y)) return false;
      if (this.isGhost(tx, y)) { reach = step + FOLK_PHASE_REACH + 1; continue; } // a house, a tree or an open door doesn't count against reach
      const t = this.get(tx, y);
      if (t === MaterialId.Empty) {
        const below = this.inBounds(tx, y + 1) ? this.get(tx, y + 1) : MaterialId.Stone;
        // Land on ground, or drop into open air (gravity takes it from there)
        // — anything but stepping straight into water.
        if (below === MaterialId.Water) return false;
        this.moveCreature(x, y, tx, y, packCreature(facing, carry, fed));
        return true;
      }
      if (MATERIALS[t].category !== MaterialCategory.Solid) return false;
    }
    return false;
  }

  /**
   * Construtor. A focused worker that heads straight for the nearest job and
   * clambers over what's in its way rather than pacing off it. It patches
   * damaged houses, levels a patch of ground and founds a house on it (the
   * whole frame at once, so a crew never piles onto one spot and no house
   * sits half-built with an open roof), and lays a raised timber walkway
   * across water it needs to get over. It doesn't mine the world for
   * materials: what it builds is conjured, hills and beaches stay whole.
   */
  /** Refresh the rolling census the trades throttle themselves against. */
  private takeCensus(): void {
    let houses = 0, folk = 0, crops = 0, farmers = 0, timber = 0, granaries = 0, woodsheds = 0, lumberjacks = 0;
    for (let j = 0; j < this.material.length; j++) {
      const m = this.material[j];
      if (m === MaterialId.Brick && (this.meta[j] & HOUSE_ANCHOR_META) !== 0) {
        const t = houseType(this.meta[j]);
        if (t === PLAN_GRANARY) granaries++;
        else if (t === PLAN_WOODSHED) woodsheds++;
        else houses++;
      } else if (m === MaterialId.Wheat) crops++;
      else if (m === MaterialId.Wood && (this.meta[j] & (HOUSE_WALL_META | TREE_TRUNK_META)) === 0) {
        timber++; // loose, cut timber — not a bridge plank, house wall, or living trunk
      } else if (m === MaterialId.Mason || m === MaterialId.Lumberjack || m === MaterialId.Farmer || m === MaterialId.Warrior) {
        folk++;
        if (m === MaterialId.Farmer) farmers++;
        else if (m === MaterialId.Lumberjack) lumberjacks++;
      }
    }
    this.houseCensus = houses;
    this.folkCensus = folk;
    this.cropCensus = crops;
    this.farmerCensus = farmers;
    this.timberCensus = timber;
    this.granaryCensus = granaries;
    this.woodshedCensus = woodsheds;
    this.lumberjackCensus = lumberjacks;
  }

  private lumberjackCensus = 0;

  /** The Fazendeiro raises a celeiro once the field's big enough, about one per three farmers. */
  private fieldWantsGranary(): boolean {
    return this.cropCensus >= 24 && this.granaryCensus < Math.max(1, Math.round(this.farmerCensus / 3));
  }
  /** The Lenhador raises a galpão once the woodlot's producing, about one per three foresters. */
  private woodlotWantsShed(): boolean {
    return this.timberCensus >= 6 && this.woodshedCensus < Math.max(1, Math.round(this.lumberjackCensus / 3));
  }

  /** Position [ax, ay] of the nearest storehouse anchor of plan `type` within `range` of (x, y), or null. */
  private nearestStore(x: number, y: number, type: number, range: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dy = -range; dy <= range; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -range; dx <= range; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= this.width) continue;
        const j = ny * this.width + nx;
        if (this.material[j] !== MaterialId.Brick || (this.meta[j] & HOUSE_ANCHOR_META) === 0) continue;
        if (houseType(this.meta[j]) !== type) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = [nx, ny]; }
      }
    }
    return best;
  }

  /**
   * A Fazendeiro / Lenhador raising its storehouse just right of (x, y): the
   * ground under the footprint has to be soil, and the volume above clear of
   * anything but its own crop (which it clears as it builds). Returns whether
   * it built.
   */
  private raiseStoreRight(x: number, y: number, type: number): boolean {
    const ax = x + 1;
    const { span } = HOUSE_PLANS[type];
    const height = HOUSE_HEIGHTS[type];
    if (!this.inBounds(ax + span, y + 1) || !this.inBounds(ax, y - height - 1)) return false;
    const growth = new Set<MaterialId>([
      MaterialId.Wheat, MaterialId.Sprout, MaterialId.Plant, MaterialId.Flor, MaterialId.Seed,
    ]);
    for (let s = 0; s <= span; s++) {
      const fx = ax + s;
      const under = this.get(fx, y + 1);
      if (under === MaterialId.Empty || MATERIALS[under].category === MaterialCategory.Liquid) return false;
      for (let up = 0; up <= height; up++) {
        const c = this.get(fx, y - up);
        if (c !== MaterialId.Empty && MATERIALS[c].category !== MaterialCategory.Powder && !growth.has(c) && !HOUSE_WALLS.includes(c)) {
          return false; // something solid in the way
        }
      }
    }
    // Clear the crop out of the footprint, then conjure the frame.
    for (let s = 0; s <= span; s++) {
      for (let up = 0; up <= height; up++) {
        if (growth.has(this.get(ax + s, y - up))) this.set(ax + s, y - up, MaterialId.Empty);
      }
    }
    this.raiseHouse(ax, y, type === PLAN_GRANARY ? HOUSE_WALL_BRICK : HOUSE_WALL_WOOD, type);
    return true;
  }

  /** Whether any structure anchor (house or storehouse) sits within `r` of (x, y) — so a new storehouse isn't crammed against one. */
  private nearStore(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= this.width) continue;
        const j = ny * this.width + nx;
        if (this.material[j] === MaterialId.Brick && (this.meta[j] & HOUSE_ANCHOR_META) !== 0) return true;
      }
    }
    return false;
  }

  /**
   * A slow job (harvest, fell) the unit at cell `i` works over `ticks` of its
   * turns: it stands there, ticking the clock down, and this returns true the
   * one turn the job finishes — then re-arms for the next.
   */
  private harvestReady(i: number, ticks: number): boolean {
    const c = this.workCd[i];
    if (c === 0) { this.workCd[i] = ticks; return false; }
    if (c === 1) { this.workCd[i] = 0; return true; }
    this.workCd[i] = c - 1;
    return false;
  }

  /** Stack one cell of `material` into the lowest open spot inside the storehouse anchored at (ax, ay). Returns whether it fit. */
  private stashInStore(ax: number, ay: number, type: number, material: MaterialId): boolean {
    const { span, rise } = HOUSE_PLANS[type];
    for (let dy = 0; dy > -rise; dy--) {
      for (let dx = 1; dx < span; dx++) {
        const cx = ax + dx;
        const cy = ay + dy;
        if (this.inBounds(cx, cy) && this.get(cx, cy) === MaterialId.Empty) {
          this.set(cx, cy, material, material === MaterialId.Wheat ? WHEAT_RIPE : 0);
          return true;
        }
      }
    }
    return false;
  }

  /** The masons stop founding once there's a house per Pip — a village, not a housing estate. */
  private villageWantsHouse(): boolean {
    return this.houseCensus < Math.max(1, this.folkCensus);
  }

  /** The farmers stop sowing once the field's big enough for the hands tending it. */
  private fieldWantsMoreWheat(): boolean {
    return this.cropCensus < Math.max(1, this.farmerCensus) * WHEAT_PER_FARMER;
  }

  /** The masons only start a bridge once the Lenhador has worked up a woodpile to build it from. */
  private villageHasTimber(): boolean {
    return this.timberCensus >= BRIDGE_TIMBER_MIN;
  }

  /** Take one cut Madeira cell (nearest, non-deck) off the map — a plank the Construtor just laid came from the woodpile. No-op if there's none in reach. */
  private consumeTimber(x: number, y: number): void {
    let bi = -1, bd = Infinity;
    for (let dy = -80; dy <= 80; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -80; dx <= 80; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= this.width) continue;
        const j = ny * this.width + nx;
        if (this.material[j] !== MaterialId.Wood || (this.meta[j] & (HOUSE_WALL_META | TREE_TRUNK_META)) !== 0) continue; // loose timber only
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = j; }
      }
    }
    if (bi >= 0) {
      this.material[bi] = MaterialId.Empty;
      this.meta[bi] = 0;
      this.hp[bi] = 0;
      this.wake(bi % this.width, (bi / this.width) | 0);
      if (this.timberCensus > 0) this.timberCensus--;
    }
  }

  private stepMason(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const facing = creatureFacing(this.meta[i]);
    const fed = this.folkUpkeep(x, y, creatureFed(this.meta[i]));
    if (fed < 0) return;
    if (!this.folkActNow(x, y)) { // slow, deliberate labour (but act every tick to swim clear of water)
      this.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    const flee = this.fleeSkeletonDir(x, y);
    if (flee !== 0) { this.folkWalk(x, y, i, flee, fed, 0, flee); return; }
    if (this.folkWeather(x, y, i, facing, fed, 0)) return;

    // Objective: the nearest damaged house wins; else work the ground here.
    const repair = this.masonRepair(x, y);
    if (repair.patched || repair.busy) {
      this.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    let wantDir = repair.dir;
    // The moment the woodpile's up to it, the Construtor makes straight for
    // the nearest water to raise its bridge — it doesn't wait to stumble
    // onto a crossing on its ordinary rounds. Repair still wins (a leaking
    // roof doesn't wait on a bridge), and it stands down once a span
    // already crosses this stretch.
    if (wantDir === 0 && this.villageHasTimber() && !this.deckNear(x, y, 40)) {
      wantDir = this.folkScanDir(x, y, WATER_ONLY);
    }

    // Bridging is in a Construtor's nature, like raising houses. It decks a
    // real-shaped timber bridge across any water it walks up to, however wide:
    // a short ramp off each bank, then one dead-level span the rest of the way,
    // a touch above the water — so two headlands with water between them get
    // joined, not just a flat ford. Guards: it builds from firm dry footing
    // only (a body dropped in the water wades out via folkWalk below), and one
    // bridge per crossing (`deckNear`). `bridgeScan` sorts lead from follower
    // (a follower gets `walk` > 0 and queues single file) and returns null once
    // the span is closed, so nobody keeps working — or pacing — a finished bridge.
    // A new bridge also waits on the Lenhador: no woodpile, no span.
    const startBridge = this.countNear(x, y, MaterialId.Water, 8) > 0 &&
      !this.deckNear(x, y, 40) && this.villageHasTimber();
    const onDeckNow = this.isDeck(x, y + 1);
    if ((wantDir !== 0 || onDeckNow || startBridge) && this.firmFooting(x, y)) {
      const dirs: readonly number[] = wantDir !== 0 ? [wantDir] : (facing >= 0 ? [1, -1] : [-1, 1]);
      let anyPlan = false;
      for (const d of dirs) {
        const plan = this.bridgeScan(x, y, d);
        if (!plan) continue;
        anyPlan = true;
        if (plan.walk > 0) {
          this.folkWalk(x, y, i, facing, fed, 0, d);
          return;
        }
        const px = x + d;
        // Keep the plank within a single step of the builder's own feet, and
        // never stack one on a plank already there.
        const layRow = Math.max(y, Math.min(y + 2, plan.layRow));
        const stand = layRow - 1;
        if (
          this.get(px, layRow) !== MaterialId.Empty ||
          this.isDeck(px, layRow - 1) || this.isDeck(px, layRow + 1) ||
          !this.inBounds(px, stand) || this.get(px, stand) !== MaterialId.Empty
        ) {
          // Can't place a clean plank + step onto it from here — walk and retry.
          this.folkWalk(x, y, i, facing, fed, 0, d);
          return;
        }
        this.set(px, layRow, MaterialId.Wood, HOUSE_WALL_META | HOUSE_FLOOR);
        this.consumeTimber(x, y);   // a plank comes off the Lenhador's woodpile
        this.moveCreature(x, y, px, stand, packCreature(d, 0, fed));
        return;
      }
      // Standing on a finished bridge with no span to push on: walk off it the
      // short way and get back to ordinary life rather than pacing the deck.
      if (onDeckNow && !anyPlan) {
        const off = this.offDeckDir(x, y);
        this.folkWalk(x, y, i, facing, fed, 0, off !== 0 ? off : facing);
        return;
      }
    }

    if (wantDir === 0) {
      // Level the strip (shifting a hump of earth into a hollow, never
      // removing any) — but not next to a channel, where slumping the bank
      // just floods the place.
      if (this.countNear(x, y, MaterialId.Water, 3) === 0 && this.gradeStrip(x, y, 8)) {
        this.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      // Found a house on flat ground, while the village still wants one.
      const spot = this.villageWantsHouse() ? this.masonSurvey(x, y) : null;
      if (spot) {
        if (Math.random() < MASON_FOUND_CHANCE) {
          this.raiseHouse(x + 1, y, spot.style, spot.type);
        } else {
          this.meta[i] = packCreature(facing, 0, fed); // keep working the site
          return;
        }
      } else {
        // Nothing to build here. Amble on to find fresh ground / patrol the
        // street, reined back by folkHomeDir so it never marches off to starve.
        const home = this.folkHomeDir(x, y, MaterialId.Mason);
        this.folkWalk(x, y, i, facing, fed, 0, home !== 0 ? home : facing);
        return;
      }
    }

    // Closing on a gap in a wall: walk the last steps solidly (carry === 3),
    // never phasing through the house — that would carry the mason clean past
    // the hole it's trying to mend.
    this.folkWalk(x, y, i, facing, fed, repair.near ? 3 : 0, wantDir);
  }


  /** From a folk standing on a bridge deck, the horizontal direction to its nearer end (where the planks meet dry ground). 0 if not on a deck. */
  private offDeckDir(x: number, y: number): number {
    if (!this.isDeck(x, y + 1)) return 0;
    const reach = (dir: number): number => {
      let cx = x, r = y + 1;
      for (let k = 1; k <= 320; k++) {
        if (this.isDeck(cx + dir, r)) cx += dir;
        else if (this.isDeck(cx + dir, r + 1)) { cx += dir; r += 1; }
        else if (this.isDeck(cx + dir, r - 1)) { cx += dir; r -= 1; }
        else return k;
      }
      return 999;
    };
    return reach(1) <= reach(-1) ? 1 : -1;
  }

  /** Whether a bridge deck already runs within `r` cells of (x, y) — one crossing per stretch of water, so a crew doesn't lay deck after parallel deck. */
  private deckNear(x: number, y: number, r: number): boolean {
    for (let dy = -MASON_ARCH_MAX - 3; dy <= MASON_ARCH_MAX + 3; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < this.width && this.isDeck(nx, ny)) return true;
      }
    }
    return false;
  }

  /** A deck plank a Construtor laid — Madeira flagged as house-floor, walkable, not a ghost. */
  private isDeck(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    return this.material[i] === MaterialId.Wood &&
      (this.meta[i] & HOUSE_WALL_META) !== 0 && (this.meta[i] & HOUSE_KIND_MASK) === HOUSE_FLOOR;
  }

  /**
   * Solid, dry footing to stand on: the cell (x, y) itself isn't water, and
   * the cell right under it is dry non-liquid solid — real ground, or a deck
   * plank. A Construtor only ever lays a plank while it has this under it, so
   * a bridge always grows out from a bank, never from a body dropped in the
   * water.
   */
  private firmFooting(x: number, y: number): boolean {
    if (!this.inBounds(x, y) || this.get(x, y) === MaterialId.Water) return false;
    const b = this.inBounds(x, y + 1) ? this.get(x, y + 1) : MaterialId.Stone;
    return b !== MaterialId.Empty && b !== MaterialId.Water && MATERIALS[b].category !== MaterialCategory.Liquid;
  }

  /** Row of the first solid, standable surface in a vertical window at column `cx` (lowest row number wins), or -1. "Standable" = firm non-liquid with clear headroom just above. */
  private standTop(cx: number, from: number, to: number): number {
    for (let r = from; r <= to; r++) {
      if (!this.inBounds(cx, r)) continue;
      const g = this.get(cx, r);
      if (g === MaterialId.Water || g === MaterialId.Empty || this.isDeck(cx, r)) continue;
      if (MATERIALS[g].category === MaterialCategory.Liquid) return -1;
      const head = this.inBounds(cx, r - 1) ? this.get(cx, r - 1) : MaterialId.Empty;
      if (head === MaterialId.Empty || FOLK_WADEABLE.has(head) || this.isDeck(cx, r - 1)) return r;
      return -1; // solid with no headroom — a wall face, not a footing
    }
    return -1;
  }

  /**
   * Survey a crossing from a Construtor at (x, y) heading `dir`. Follows any
   * deck it has already laid out to the leading edge, then looks across open
   * water for a bank to land on. Returns what to do next, or null — including
   * when the span is already closed, so nobody keeps pacing a finished bridge.
   *
   *  - `walk`  > 0 : the lead edge is that many steps off; go there.
   *  - `walk` === 0: lay the next plank now, at deck row `layRow`.
   *
   * The deck is shaped like a real bridge: short ramp off each bank, then one
   * dead-level span the rest of the way (a touch above the water).
   */
  private bridgeScan(
    x: number, y: number, dir: number,
  ): { walk: number; layRow: number } | null {
    const onDeck = this.isDeck(x, y + 1);
    // Trace our deck back to its near anchor.
    let ax = x, aRow = y + 1;
    if (onDeck) {
      for (let k = 0; k < 300; k++) {
        if (this.isDeck(ax - dir, aRow)) ax -= dir;
        else if (this.isDeck(ax - dir, aRow + 1)) { ax -= dir; aRow += 1; }
        else if (this.isDeck(ax - dir, aRow - 1)) { ax -= dir; aRow -= 1; }
        else break;
      }
    }
    const nearRow = aRow;                       // deck row where it meets the near bank
    // Trace forward to the leading edge of the deck, noting whether the span
    // we've already laid crosses open water.
    let lx = x, lRow = y + 1;
    let spannedWater = false;
    let waterTop = this.height;                 // highest (lowest row number) water seen
    const noteWater = (cx: number, r0: number): void => {
      for (let k = 0; k <= MASON_SPAN_DROP && this.inBounds(cx, r0 + k); k++) {
        const c = this.get(cx, r0 + k);
        if (c === MaterialId.Water) { spannedWater = true; waterTop = Math.min(waterTop, r0 + k); return; }
        if (c !== MaterialId.Empty && !this.isDeck(cx, r0 + k)) return;
      }
    };
    if (onDeck) {
      noteWater(lx, lRow + 1);
      for (let k = 0; k < 300; k++) {
        if (this.isDeck(lx + dir, lRow)) lx += dir;
        else if (this.isDeck(lx + dir, lRow + 1)) { lx += dir; lRow += 1; }
        else if (this.isDeck(lx + dir, lRow - 1)) { lx += dir; lRow -= 1; }
        else break;
        noteWater(lx, lRow + 1);
      }
    }
    const leadStep = Math.abs(lx - x);          // steps from here to the leading edge
    const nearDist = Math.abs(lx - ax);         // deck laid so far

    // From just past the leading edge, look for open water below the deck line
    // and a bank on the far side. If the deck already crosses water, we're past
    // the near bank — the next ground we meet is the far one.
    let sawWater = spannedWater;
    for (let s = 1; s <= MASON_BRIDGE_MAX; s++) {
      const cx = lx + dir * s;
      if (!this.inBounds(cx, lRow)) return null;
      for (let k = 0; k <= MASON_SPAN_DROP && this.inBounds(cx, lRow + k); k++) {
        const c = this.get(cx, lRow + k);
        if (c === MaterialId.Water) { sawWater = true; waterTop = Math.min(waterTop, lRow + k); break; }
        if (c !== MaterialId.Empty && !this.isDeck(cx, lRow + k)) break;
      }
      const top = this.standTop(cx, lRow - MASON_ARCH_MAX - 2, lRow + MASON_SPAN_DROP);
      if (top < 0) {
        if (!sawWater && s > MASON_APPROACH_MAX) return null;
        continue;
      }
      if (!sawWater) {
        // Ground before any water. Flat or dropping toward the shore: keep
        // walking the near bank. Rising well above the deck line: blocked by
        // terrain, not water — leave it to ordinary patrol.
        if (top >= lRow - 1) continue;
        return null;
      }
      // Ground past the water sitting well below the surface is the submerged
      // bed, not a bank — keep scanning for a real shore.
      if (top > waterTop + 2) continue;

      // Far bank found. If the leading edge already reaches it (adjacent, within
      // a single step up or down), the span is closed — return null so no one
      // keeps working, or pacing, a finished bridge.
      if (s === 1 && Math.abs(lRow - top) <= 1) return null;

      // Shape: a short ramp off each bank, one dead-level span between. The
      // level D sits at the higher of the two banks, but never below the water.
      const farRow = top;
      const span = nearDist + s;
      let deckLevel = Math.min(nearRow, farRow);
      if (deckLevel >= waterTop) deckLevel = waterTop - 1;
      const p = nearDist + 1;                       // where the next plank goes, from the near anchor
      const q = span - p;                           // ...and from the far anchor
      const nearRamp = Math.abs(deckLevel - nearRow);
      const farRamp = Math.abs(deckLevel - farRow);
      let target: number;
      if (p <= nearRamp) target = nearRow + Math.sign(deckLevel - nearRow) * p;
      else if (q <= farRamp) target = farRow + Math.sign(deckLevel - farRow) * q;
      else target = deckLevel;
      // move at most a row at a time from the current leading edge, and never
      // sink a plank below the water surface
      let layRow = onDeck ? lRow + Math.sign(target - lRow) : y + 1;
      while (layRow > waterTop && layRow > 1) layRow--;

      if (leadStep > 0) return { walk: leadStep, layRow };
      return { walk: 0, layRow };
    }
    return null;
  }

  /** Whether (x, y) has a house cell close overhead — i.e. digging it out would undermine a building. */
  private underHouse(x: number, y: number): boolean {
    for (let d = 1; d <= FOUNDATION_DEPTH + 2; d++) {
      if (!this.inBounds(x, y - d)) break;
      if (this.isHouseCell(this.index(x, y - d))) return true;
    }
    return false;
  }

  /** Whether (x, y) is inside a house's footprint — a wall/roof cell anywhere up to a tall house's height overhead. Farmers and foresters won't sow indoors. */
  private roofedOver(x: number, y: number): boolean {
    for (let d = 1; d <= 16; d++) {
      const ny = y - d;
      if (ny < 0) break;
      if (this.isHouseCell(ny * this.width + x)) return true;
    }
    return false;
  }

  /**
   * Stamps a whole house of plan `type` in one go once the mason has spent
   * its turns preparing the site (see `stepMason`): the anchor, then every
   * wall, roof, window, chimney and floor cell of the blueprint, over Empty
   * or loose Powder only (and over cells of this same house already stamped,
   * so a window can claim a spot the wall got to first). Doing it all at
   * once keeps a crew from piling onto one spot, and a house never sits
   * half-built with an open roof no one can reach to close.
   */
  private raiseHouse(ax: number, ay: number, style: number, type: number): void {
    const wallMat = HOUSE_WALL_MATERIAL[style];
    this.set(ax, ay, MaterialId.Brick, packHouseAnchor(style, type));
    for (const [dx, dy, kind] of HOUSE_BLUEPRINTS[type]) {
      if (dx === 0 && dy === 0) continue;
      const wx = ax + dx;
      const wy = ay + dy;
      if (!this.inBounds(wx, wy)) continue;
      const hi = this.index(wx, wy);
      const here = this.material[hi] as MaterialId;
      // Build into open space, or over a cell of this same house already
      // stamped (so a window can claim a wall's spot). Never over the ground
      // itself — the frame is conjured and sits on whatever's there, it
      // doesn't eat the hillside for bricks. (A blueprint cell that lands in
      // earth is just left buried; masonRepair knows that isn't damage.)
      const overwritable =
        here === MaterialId.Empty ||
        ((this.meta[hi] & HOUSE_WALL_META) !== 0 && (this.meta[hi] & HOUSE_ANCHOR_META) === 0);
      if (overwritable) {
        this.set(wx, wy, houseCellMaterial(kind, style), HOUSE_WALL_META | kind);
      }
    }
    // Underpin the footprint: wherever the ground under a column is missing
    // (a hollow, or open water), sink a wall-material pier down to solid bed
    // so the house has something to stand on. Where the ground is already
    // there it's left alone — no earth is dug or converted.
    const span = HOUSE_PLANS[type].span;
    for (let dx = 0; dx <= span; dx++) {
      const fx = ax + dx;
      for (let d = 1; d <= FOUNDATION_DEPTH; d++) {
        const fy = ay + d;
        if (!this.inBounds(fx, fy)) break;
        const b = this.get(fx, fy);
        if (b === MaterialId.Empty || b === MaterialId.Water) {
          this.set(fx, fy, wallMat, HOUSE_WALL_META | HOUSE_FLOOR);
        } else {
          break; // solid ground (or bedrock) — the pier is anchored
        }
      }
    }
  }

  /**
   * A carrying mason tending nearby houses. When `scan` is true it finds the
   * nearest house anchor within MASON_REPAIR_RANGE and walks *that one's*
   * blueprint (checking only the closest keeps the per-tick cost down with a
   * crew of masons) for a wall/roof/floor cell gone missing. If it's damaged
   * the mason makes for the gap and, standing by it, sets a fresh cell there
   * for part of its load. `dir` is a heading toward the damage, `busy` means
   * it's at the gap working, both 0/false if there's nothing to mend.
   */
  private masonRepair(x: number, y: number): { patched: boolean; dir: number; busy: boolean; near: boolean } {
    let anchorD = Infinity;
    let ai = -1;
    for (let dy = -MASON_REPAIR_RANGE; dy <= MASON_REPAIR_RANGE; dy++) {
      for (let dx = -MASON_REPAIR_RANGE; dx <= MASON_REPAIR_RANGE; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.index(nx, ny);
        if (this.material[ni] !== MaterialId.Brick || (this.meta[ni] & HOUSE_ANCHOR_META) === 0) continue;
        const d = dx * dx + dy * dy;
        if (d < anchorD) { anchorD = d; ai = ni; }
      }
    }
    if (ai < 0) return { patched: false, dir: 0, busy: false, near: false }; // no house in sight

    const nx = ai % this.width;
    const ny = (ai / this.width) | 0;
    const style = houseStyle(this.meta[ai]);
    let bestHoleD = Infinity;
    let holeX = 0;
    let holeY = 0;
    let holeMat: MaterialId = MaterialId.Brick;
    let holeKind = HOUSE_WALL;
    for (const [bx, by, kind] of HOUSE_BLUEPRINTS[houseType(this.meta[ai])]) {
      if (bx === 0 && by === 0) continue; // the anchor itself
      const wx = nx + bx;
      const wy = ny + by;
      if (!this.inBounds(wx, wy)) continue;
      const want = houseCellMaterial(kind, style);
      const h = this.get(wx, wy);
      if (h === want) continue; // intact
      if (h !== MaterialId.Empty) continue; // a real gap is open air; earth/sand banked into a cell isn't damage to chase
      const d = (wx - x) * (wx - x) + (wy - y) * (wy - y);
      if (d < bestHoleD) { bestHoleD = d; holeX = wx; holeY = wy; holeMat = want; holeKind = kind; }
    }
    if (bestHoleD === Infinity) return { patched: false, dir: 0, busy: false, near: false }; // nearest house is whole

    // Within reach of the gap: set a wall cell there. If the roll misses this
    // tick, stay put (busy) and try again — don't march off the job.
    if (Math.abs(holeX - x) <= 1 && Math.abs(holeY - y) <= 1) {
      if (Math.random() < MASON_REPAIR_CHANCE) {
        const cur = this.get(holeX, holeY);
        if (cur === MaterialId.Empty || MATERIALS[cur].category === MaterialCategory.Powder) {
          this.set(holeX, holeY, holeMat, HOUSE_WALL_META | holeKind);
          return { patched: true, dir: 0, busy: true, near: true };
        }
      }
      return { patched: false, dir: 0, busy: true, near: true };
    }
    return { patched: false, dir: Math.sign(holeX - x) || 1, busy: false, near: Math.abs(holeX - x) + Math.abs(holeY - y) <= 4 };
  }

  /**
   * Sizes up the ground just right of the mason for a new house. One sweep
   * of the surroundings tallies the loose building supply and rejects the
   * site outright if another house anchor is within HOUSE_SPACING. Then,
   * largest plan first, it returns the biggest house whose footprint fits
   * on clear flat ground and whose supply the survey turned up — or null.
   */
  private masonSurvey(x: number, y: number): { style: number; type: number } | null {
    const ax = x + 1;
    const ay = y;
    // Smallest plan must at least fit on the grid (get() is bounds-safe, but
    // there's no point surveying a site pressed against the edge/ceiling).
    if (!this.inBounds(ax, ay - HOUSE_HEIGHTS[0]) || !this.inBounds(ax + HOUSE_PLANS[0].span, ay + 1)) {
      return null;
    }
    let wood = 0;
    let ice = 0;
    let earth = 0; // loose Areia/Terra/Barro — fired or packed into Tijolo (not the Pedra bedrock underfoot, which is everywhere)
    for (let dy = -HOUSE_SURVEY_RANGE; dy <= HOUSE_SURVEY_RANGE; dy++) {
      for (let dx = -HOUSE_SURVEY_RANGE; dx <= HOUSE_SURVEY_RANGE; dx++) {
        const nx = ax + dx;
        const ny = ay + dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.index(nx, ny);
        const id = this.material[ni] as MaterialId;
        if (
          id === MaterialId.Brick && (this.meta[ni] & HOUSE_ANCHOR_META) !== 0 &&
          Math.abs(dx) <= HOUSE_SPACING && Math.abs(dy) <= HOUSE_SPACING
        ) {
          return null; // too close to another house
        }
        // Not on a waterline — water sloshing around a footprint traps folk
        // between the new walls and the pool. Give it a wide berth.
        if (id === MaterialId.Water && Math.abs(dx) <= HOUSE_MAX_DWELLING_SPAN && dy >= -2 && dy <= 4) {
          return null;
        }
        if (id === MaterialId.Wood) wood++;
        else if (id === MaterialId.Ice) ice++;
        else if (id === MaterialId.Sand || id === MaterialId.Dirt || id === MaterialId.Mud) earth++;
      }
    }
    const supply = wood + ice + earth;
    if (supply < HOUSE_PLANS[0].supply) return null;
    // A timber cabin or an ice hut only when that material is genuinely
    // plentiful right here; an ice hut also only where it's cold enough for
    // the Gelo not to just melt away. Otherwise fired Tijolo.
    const style =
      ice > wood && ice > earth && ice >= 16 && this.temp < AMBIENT_ICE_MELT_TEMP ? HOUSE_WALL_ICE :
      wood > earth && wood >= 16 ? HOUSE_WALL_WOOD :
      HOUSE_WALL_BRICK;
    // Largest that the lot and the supply allow — but not slavishly: about
    // half the time, when a bigger house would fit, the mason settles for the
    // next size down instead, so a well-stocked village still comes out a mix
    // of halls, cottages and huts rather than a row of identical blocks.
    for (let type = MASON_MAX_PLAN; type >= 0; type--) {
      if (supply < HOUSE_PLANS[type].supply) continue;
      if (!this.houseFootprintClear(ax, ay, type)) continue;
      if (type > 0 && Math.random() < 0.45) continue;
      return { style, type };
    }
    return null;
  }

  /**
   * Whether the lot for a house of plan `type` anchored at (ax, ay) is ready
   * to build on: the ground must be *level* — filled ground one cell under
   * every column and nothing protruding into the floor row — and the wall +
   * roof volume above it clear (Empty, loose powder, or existing house
   * wall). The mason grades the ground level itself first (see `gradeStrip`);
   * this is the gate that says the grading is done.
   */
  private houseFootprintClear(ax: number, ay: number, type: number): boolean {
    const { span } = HOUSE_PLANS[type];
    const height = HOUSE_HEIGHTS[type];
    if (!this.inBounds(ax, ay - height) || !this.inBounds(ax + span, ay + 1)) return false;
    for (let s = 0; s <= span; s++) {
      const fx = ax + s;
      const under = this.get(fx, ay + 1);
      if (under === MaterialId.Empty || MATERIALS[under].category === MaterialCategory.Liquid) return false; // a pit
      // A stray cell of loose powder in the floor row is fine — raiseHouse
      // builds straight over it. Anything solid there means the ground isn't level.
      const atFloor = this.get(fx, ay);
      if (atFloor !== MaterialId.Empty && MATERIALS[atFloor].category !== MaterialCategory.Powder) return false;
      for (let up = 1; up <= height; up++) {
        const c = this.get(fx, ay - up);
        if (c !== MaterialId.Empty && MATERIALS[c].category !== MaterialCategory.Powder && !HOUSE_WALLS.includes(c)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * A Pip grading the ground just ahead level before it builds or sows. Over
   * a strip it finds the nearest bump (loose powder standing in or above the
   * floor line) and the nearest shallow pit, and *moves* a cell of earth
   * from the bump into the pit — one per call, never adding or removing any
   * material. If there's a bump but nowhere to put the spoil (no pit), or a
   * pit but no loose earth to fill it with, it leaves the strip as it is and
   * the Pip moves on to find a flatter spot. Returns whether it moved a cell.
   * Shared by the Construtor (a house-wide strip) and the Plantador (a furrow).
   */
  private gradeStrip(x: number, y: number, span: number): boolean {
    const ax = x + 1;
    const ay = y;
    if (!this.inBounds(ax + span, ay + 2) || !this.inBounds(ax, ay - 1)) return false;

    let bumpX = -1;
    let bumpY = -1;
    let bumpD = Infinity;
    let pitX = -1;
    let pitD = Infinity;
    let rough = 0;
    for (let s = 0; s <= span; s++) {
      const cx = ax + s;
      for (let up = LEVEL_MAX_STEP - 1; up >= 0; up--) {
        const c = this.get(cx, ay - up);
        if (
          (c === MaterialId.Sand || c === MaterialId.Dirt || c === MaterialId.Mud) &&
          !this.underHouse(cx, ay - up)
        ) {
          rough++;
          const d = s * s + up * up;
          if (d < bumpD) { bumpD = d; bumpX = cx; bumpY = ay - up; }
          break;
        }
        if (c !== MaterialId.Empty) break; // solid/creature — leave it
      }
      // a pit: no ground directly under this column, solid bed not far below
      // (skipped right under a house, same as the bump check above — that
      // headroom is the foundation, not a hole waiting to be filled, and
      // trying to fill it just gets undone, leaving the grader parked here
      // forever instead of moving on).
      if (this.get(cx, ay + 1) === MaterialId.Empty && !this.underHouse(cx, ay + 1)) {
        const bed = this.get(cx, ay + 2);
        if (bed !== MaterialId.Empty && MATERIALS[bed].category !== MaterialCategory.Liquid) {
          rough++;
          const d = s * s;
          if (d < pitD) { pitD = d; pitX = cx; }
        } else {
          rough += 3; // a deep hole / water — not gradeable
        }
      }
    }
    if (rough === 0) return false;                    // already level
    if (rough > span + LEVEL_MAX_STEP) return false;  // a cliff, not a lot

    // Only act when there's a place for the spoil to go: shift earth from the
    // bump into the pit, conserving every cell.
    if (bumpX >= 0 && pitX >= 0) {
      this.set(bumpX, bumpY, MaterialId.Empty);
      this.set(pitX, ay + 1, MaterialId.Dirt);
      return true;
    }
    return false;
  }

  /**
   * Whether the `span+1` cells of ground just right of (x, y) form a level
   * furrow: filled ground one cell under each, nothing protruding into the
   * walking row. The gate the Construtor and Plantador grade toward before
   * building or sowing.
   */
  private groundLevel(x: number, y: number, span: number): boolean {
    const ax = x + 1;
    if (!this.inBounds(ax + span, y + 1)) return false;
    for (let s = 0; s <= span; s++) {
      const under = this.get(ax + s, y + 1);
      if (under === MaterialId.Empty || MATERIALS[under].category === MaterialCategory.Liquid) return false;
      if (this.get(ax + s, y) !== MaterialId.Empty) return false;
    }
    return true;
  }

  /** How much crown a tree rooted near (tx, ty) carries — Broto/Planta/Flor in a tall box reaching up from the base. A seedling is a cell or two; a grown tree is a dozen-plus. */
  private treeCrown(tx: number, ty: number): number {
    let n = 0;
    for (let dy = -9; dy <= 2; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const g = this.get(tx + dx, ty + dy);
        if (g === MaterialId.Sprout || g === MaterialId.Plant || g === MaterialId.Flor) n++;
      }
    }
    return n;
  }

  /** Whether (x, y) is a living tree trunk cell — Madeira flagged TREE_TRUNK. */
  private isTrunk(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.material[this.index(x, y)] === MaterialId.Wood &&
      (this.meta[this.index(x, y)] & TREE_TRUNK_META) !== 0;
  }

  /** Whether (x, y) is a Porta currently powered open. */
  private isOpenDoor(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.material[this.index(x, y)] === MaterialId.Door &&
      (this.meta[this.index(x, y)] & CIRCUIT_ON_META) !== 0;
  }

  /**
   * Whichever kind of "there, but not really" cell a folk simply walks
   * through: a house wall/roof, a living tree trunk, or a powered-open
   * Porta. Every obstacle check in folkWalk treats all three identically —
   * this is the one place that says so.
   */
  private isGhost(x: number, y: number): boolean {
    return this.houseGhost(x, y) || this.isTrunk(x, y) || this.isOpenDoor(x, y);
  }

  /**
   * Whether (x, y) — a Fio deciding its own state, or a Porta checking
   * what's feeding it — is fed power this tick. Touching an on Alavanca
   * directly is enough on its own; failing that, it traces outward through
   * connected Fio (never through another Porta or Alavanca — those don't
   * conduct past themselves) looking for one. The whole run this search
   * touches is settled at once (see `circuitCache`), and every trace starts
   * fresh from the actual switches each tick, so a loop of Fio (or a run an
   * Alavanca just switched off) can never light itself by "confirming" its
   * neighbor's bit the way a plain adjacency check would.
   */
  private circuitPowered(x: number, y: number): boolean {
    const startI = this.index(x, y);
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const j = this.index(nx, ny);
      if (this.material[j] === MaterialId.Lever && (this.meta[j] & CIRCUIT_ON_META) !== 0) return true;
    }
    const cached = this.circuitCache.get(startI);
    if (cached !== undefined) return cached;
    const visited = new Set<number>([startI]);
    const stack = [startI];
    let found = false;
    let budget = CIRCUIT_FLOOD_CAP;
    while (stack.length > 0 && budget-- > 0 && !found) {
      const i = stack.pop()!;
      const cx = i % this.width, cy = (i / this.width) | 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny)) continue;
        const j = this.index(nx, ny);
        const m = this.material[j];
        if (m === MaterialId.Lever && (this.meta[j] & CIRCUIT_ON_META) !== 0) { found = true; break; }
        if (m !== MaterialId.Wire || visited.has(j)) continue;
        visited.add(j);
        stack.push(j);
      }
    }
    for (const v of visited) this.circuitCache.set(v, found);
    return found;
  }

  /** A Fio lights up the instant it touches power, and goes dark the instant nothing feeds it — no lingering charge. */
  private stepWire(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const powered = this.circuitPowered(x, y);
    if (((this.meta[i] & CIRCUIT_ON_META) !== 0) !== powered) this.wake(x, y);
    this.meta[i] = powered ? CIRCUIT_ON_META : 0;
  }

  /**
   * A connected slab of Porta is one body, not a grid of independent cells:
   * open the instant *any* cell of it is individually fed (`circuitPowered`
   * — touching an Alavanca/Fio directly), not just the cells actually
   * touching one. Traces outward through connected Porta only (a Fio's own
   * reach through Porta stops dead — see circuitPowered — so a door doesn't
   * accidentally wire two separate doors together through a shared Fio;
   * this walk is the one that unions a single door's own cells). Settled
   * once per connected slab per tick (see `doorCache`).
   */
  private doorPowered(x: number, y: number): boolean {
    const startI = this.index(x, y);
    const cached = this.doorCache.get(startI);
    if (cached !== undefined) return cached;
    const visited = new Set<number>([startI]);
    const stack = [startI];
    let found = false;
    let budget = CIRCUIT_FLOOD_CAP;
    while (stack.length > 0 && budget-- > 0) {
      const i = stack.pop()!;
      const cx = i % this.width, cy = (i / this.width) | 0;
      if (this.circuitPowered(cx, cy)) found = true;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny)) continue;
        const j = this.index(nx, ny);
        if (this.material[j] !== MaterialId.Door || visited.has(j)) continue;
        visited.add(j);
        stack.push(j);
      }
    }
    for (const v of visited) this.doorCache.set(v, found);
    return found;
  }

  /**
   * A Porta goes intangible (see `isGhost`) and lights a shade brighter —
   * the renderer reads the same bit — for as long as it's powered by a
   * touching Alavanca or Fio, and shuts the instant that power's gone. It
   * doesn't animate open; that recolor and the change in what can walk
   * through it are the only tells.
   */
  private stepDoor(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const open = this.doorPowered(x, y);
    if (((this.meta[i] & CIRCUIT_ON_META) !== 0) !== open) this.wake(x, y);
    this.meta[i] = open ? CIRCUIT_ON_META : 0;
  }

  /** Loose (cut, not trunk / not structural) Madeira within `r` of (x, y). */
  private looseWoodNear(x: number, y: number, r: number): number {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= this.width) continue;
        const j = ny * this.width + nx;
        if (this.material[j] === MaterialId.Wood && (this.meta[j] & (HOUSE_WALL_META | TREE_TRUNK_META)) === 0) n++;
      }
    }
    return n;
  }

  /**
   * Lenhador: a forester. Sows a Semente on bare Terra/Barro and then *leaves
   * it be* — the shoot grows a bare trunk that lignifies to Madeira under a
   * spreading green crown. Only once the tree has really filled out does the
   * Lenhador fell it: the crown drops away and the trunk becomes a stack of
   * cut logs. It stops once the woodlot's stocked. That growing woodpile is
   * what a Construtor needs before it will bridge a river.
   */
  private stepLumberjack(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const facing = creatureFacing(this.meta[i]);
    const fed = this.folkUpkeep(x, y, creatureFed(this.meta[i]));
    if (fed < 0) return;
    if (!this.folkActNow(x, y)) { // slow, deliberate labour (but act every tick to swim clear of water)
      this.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    const flee = this.fleeSkeletonDir(x, y);
    if (flee !== 0) { this.folkWalk(x, y, i, flee, fed, 0, flee); return; }
    if (this.folkWeather(x, y, i, facing, fed, 0)) return;

    // Fell a fully-grown tree it's touching — one with a lignified trunk under
    // a finished crown — while the woodlot still has room for the timber. A
    // sapling (no woody trunk yet) or a bare shoot is left alone to grow.
    const targets: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const tx = x + dx, ty = y + dy;
      if (this.isTrunk(tx, ty)) targets.push([tx, ty]);
    }
    if (targets.length > 0 && this.looseWoodNear(x, y, 16) < LUMBERJACK_STOCK) {
      targets.sort((a, b) => b[1] - a[1]); // lowest first
      for (const [tx, ty] of targets) {
        // Find the foot of this tree's trunk (walk down through trunk / stem).
        let by = ty;
        for (let d = 0; d < 10; d++) {
          const n = by + 1;
          if (this.isTrunk(tx, n) || this.get(tx, n) === MaterialId.Sprout || this.get(tx, n) === MaterialId.Plant) by = n;
          else break;
        }
        const under = this.get(tx, by + 1);
        if (under === MaterialId.Empty || MATERIALS[under].category === MaterialCategory.Liquid) continue;
        if (this.treeCrown(tx, by) < LUMBERJACK_MIN_TREE) continue; // still a seedling — let it grow

        // Felling is slow work — it stands and swings the axe for a while first.
        if (!this.harvestReady(i, HARVEST_WORK)) {
          this.meta[i] = packCreature(facing, 0, fed);
          return;
        }

        // Timber it: the *whole* tree comes down — trunk and crown, both sides
        // — leaving the ground clear for the next sapling.
        for (let dy = -16; dy <= 1; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const cx = tx + dx, cy = by + dy;
            const g = this.get(cx, cy);
            if (this.isTrunk(cx, cy) || g === MaterialId.Sprout || g === MaterialId.Plant || g === MaterialId.Flor) {
              this.set(cx, cy, MaterialId.Empty);
            }
          }
        }
        // The cut wood goes into the galpão if there's one in reach; otherwise
        // it drops as loose logs on the ground beside the stump (never in the
        // stump column, so that spot's free for the next seed).
        const shed = this.nearestStore(x, y, PLAN_WOODSHED, STORE_REACH);
        let dropped = 0;
        for (let n = 0; n < LUMBERJACK_LOG_YIELD; n++) {
          if (shed && this.stashInStore(shed[0], shed[1], PLAN_WOODSHED, MaterialId.Wood)) { dropped++; continue; }
          for (let r = 1; r <= 6 && dropped === n; r++) {
            for (const cx of [tx - r, tx + r]) {
              if (dropped > n || !this.inBounds(cx, by)) continue;
              const floor = this.get(cx, by + 1);
              if (this.get(cx, by) === MaterialId.Empty && floor !== MaterialId.Empty &&
                MATERIALS[floor].category !== MaterialCategory.Liquid) {
                this.set(cx, by, MaterialId.Wood, 0);
                dropped++;
              }
            }
          }
        }
        this.meta[i] = packCreature(facing, 0, fed);
        return;
      }
    }

    // Raise a galpão once the woodlot's producing and the village wants one.
    {
      const gb = this.inBounds(x, y + 1) ? this.get(x, y + 1) : MaterialId.Stone;
      if (this.woodlotWantsShed() && (gb === MaterialId.Dirt || gb === MaterialId.Mud) &&
        this.countNear(x, y, MaterialId.Water, 3) === 0 && !this.nearStore(x, y, HOUSE_SPACING)) {
        if (this.gradeStrip(x, y, HOUSE_PLANS[PLAN_WOODSHED].span + 1)) {
          this.meta[i] = packCreature(facing, 0, fed);
          return;
        }
        if (Math.random() < MASON_FOUND_CHANCE && this.raiseStoreRight(x, y, PLAN_WOODSHED)) {
          this.meta[i] = packCreature(facing, 0, fed);
          return;
        }
      }
    }

    // Prepare the plot before planting, like the other trades: level the
    // strip flat first (never next to water, where slumping the bank floods
    // the place), then sow a seedling on the level ground.
    const below = this.inBounds(x, y + 1) ? this.get(x, y + 1) : MaterialId.Stone;
    if (below === MaterialId.Dirt || below === MaterialId.Mud) {
      if (this.countNear(x, y, MaterialId.Water, 3) === 0 && this.gradeStrip(x, y, LUMBERJACK_PLOT + 1)) {
        this.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      const f = x + 1;
      const belowF = this.get(f, y + 1);
      if (
        this.get(f, y) === MaterialId.Empty &&
        (belowF === MaterialId.Dirt || belowF === MaterialId.Mud) &&
        this.groundLevel(x, y, LUMBERJACK_PLOT) &&
        this.clearOfGrowth(x, y, LUMBERJACK_SPACING) &&
        !this.roofedOver(f, y) && !this.roofedOver(x, y) &&
        Math.random() < LUMBERJACK_SOW_CHANCE
      ) {
        this.set(f, y, MaterialId.Seed, FOREST_SEED_META);
        this.meta[i] = packCreature(facing, 0, fed);
        return;
      }
    }

    // Head for the nearest fully-grown tree (a lignified trunk) to fell. With
    // none ready, folkWalk drifts it back to the woodlot (Madeira / houses)
    // where it plants and paces while the saplings fill out.
    let wantDir = 0;
    let bestD = Infinity;
    for (let dy = -FOLK_SCAN_RANGE; dy <= FOLK_SCAN_RANGE; dy++) {
      for (let dx = -FOLK_SCAN_RANGE; dx <= FOLK_SCAN_RANGE; dx++) {
        if (dx === 0 && dy === 0 || !this.isTrunk(x + dx, y + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; wantDir = Math.sign(dx) || (Math.random() < 0.5 ? 1 : -1); }
      }
    }
    this.folkWalk(x, y, i, facing, fed, 0, wantDir);
  }

  /** How many cells of material `id` sit within `r` of (x, y). */
  private countNear(x: number, y: number, id: MaterialId, r: number): number {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < this.width && this.material[ny * this.width + nx] === id) n++;
      }
    }
    return n;
  }

  /** Whether a square of `r` around (x, y) is free of growing things and cut timber — so a Lenhador won't crowd a new sapling onto a field or an existing stand. */
  private clearOfGrowth(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const g = this.get(x + dx, y + dy);
        if (
          g === MaterialId.Seed || g === MaterialId.Sprout || g === MaterialId.Plant ||
          g === MaterialId.Flor || g === MaterialId.Wheat || g === MaterialId.Wood
        ) return false;
      }
    }
    return true;
  }

  /**
   * Plantador. Like the Construtor, a focused worker that *levels before it
   * sows*: it carries Água from a pool to dry Terra to make Barro, grades
   * the furrow ahead flat, and only then plants Trigo on it — Trigo takes
   * only on level ground. A sown row grows and self-seeds into a field.
   * Harvests a ripe Trigo head (or stray mature Planta/Flor) it touches for
   * a full meal. Over time it turns a barren strip into cropland that feeds
   * the whole village.
   */
  private stepFarmer(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const facing = creatureFacing(this.meta[i]);
    let carrying = creatureTimer(this.meta[i]) === 1;
    let fed = this.folkUpkeep(x, y, creatureFed(this.meta[i]));
    if (fed < 0) return;
    if (!this.folkActNow(x, y)) { // slow, deliberate labour (but act every tick to swim clear of water)
      this.meta[i] = packCreature(facing, carrying ? 1 : 0, fed);
      return;
    }
    if (this.folkWeather(x, y, i, facing, fed, carrying ? 1 : 0)) return;

    const below = this.inBounds(x, y + 1) ? this.get(x, y + 1) : MaterialId.Stone;

    // Raise a celeiro once the field's established and the village wants one —
    // before working the field, so a farmer standing in a mature crop still
    // gets round to putting up the storehouse.
    if (!carrying && this.fieldWantsGranary() && (below === MaterialId.Dirt || below === MaterialId.Mud) &&
      !this.nearStore(x, y, HOUSE_SPACING) && this.countNear(x, y, MaterialId.Water, 3) === 0) {
      if (this.gradeStrip(x, y, HOUSE_PLANS[PLAN_GRANARY].span + 1)) {
        this.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      if (Math.random() < MASON_FOUND_CHANCE && this.raiseStoreRight(x, y, PLAN_GRANARY)) {
        this.meta[i] = packCreature(facing, 0, fed);
        return;
      }
    }

    // Harvest a ripe head it's standing beside — a slow job it works at over
    // several turns. Hungry, it eats the head; otherwise, if there's a celeiro
    // in reach and the field's already big enough, the grain goes into store.
    let ripeAt: [number, number] | null = null;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      const nId = this.material[ni] as MaterialId;
      if ((nId === MaterialId.Wheat && this.meta[ni] >= WHEAT_RIPE) || FARMER_CROPS.includes(nId)) { ripeAt = [nx, ny]; break; }
    }
    if (ripeAt && !carrying) {
      const hungry = fed <= FOLK_FORAGE_HUNGER;
      // Once the field's got going, spare ripe heads go into the celeiro.
      const store = hungry || this.cropCensus < 30 ? null : this.nearestStore(x, y, PLAN_GRANARY, STORE_REACH);
      if (hungry || store) {
        if (this.harvestReady(i, HARVEST_WORK)) {
          if (hungry) { this.set(ripeAt[0], ripeAt[1], MaterialId.Empty); fed = CREATURE_FED_MAX; }
          else if (store && this.stashInStore(store[0], store[1], PLAN_GRANARY, MaterialId.Wheat)) {
            this.set(ripeAt[0], ripeAt[1], MaterialId.Empty);
          }
        }
        this.meta[i] = packCreature(facing, 0, fed);
        return; // stood at the work
      }
    }

    if (!carrying) {
      const water = this.adjacentOf(x, y, WATER_ONLY);
      if (water.length > 0 && Math.random() < FARMER_WORK_CHANCE) {
        const [wx, wy] = water[Math.floor(Math.random() * water.length)];
        this.set(wx, wy, MaterialId.Empty);
        carrying = true;
      }
    }

    let wantDir = 0;
    if (carrying && below === MaterialId.Dirt && Math.random() < FARMER_WORK_CHANCE) {
      this.set(x, y + 1, MaterialId.Mud);
      carrying = false;
    } else if (!carrying && (below === MaterialId.Dirt || below === MaterialId.Mud)) {
      // Grade the furrow flat, then sow one shoot on it. Standing to grade is
      // the "level first" beat; Trigo only takes on level ground.
      if (this.gradeStrip(x, y, WHEAT_FURROW + 1) && Math.random() < 0.7) {
        this.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      const f = x + 1;
      const belowF = this.get(f, y + 1);
      if (
        this.get(f, y) === MaterialId.Empty &&
        (belowF === MaterialId.Dirt || belowF === MaterialId.Mud) &&
        this.groundLevel(x, y, WHEAT_FURROW) &&
        this.fieldWantsMoreWheat() &&
        !this.roofedOver(f, y) && !this.roofedOver(x, y) && // never sow indoors
        Math.random() < FARMER_WORK_CHANCE
      ) {
        this.set(f, y, MaterialId.Wheat, 0);
      }
    }

    if (wantDir === 0) {
      // Carrying with no dry soil underfoot -> go find some. Empty-handed ->
      // go find water. Otherwise there's nothing to travel to (soil is right
      // here) and folkWalk keeps it working this patch.
      wantDir = carrying
        ? (below === MaterialId.Dirt ? 0 : this.folkScanDir(x, y, DRY_SOIL))
        : this.folkScanDir(x, y, WATER_ONLY);
    }
    this.folkWalk(x, y, i, facing, fed, carrying ? 1 : 0, wantDir);
  }

  /**
   * A working Pip that sees a Esqueleto close by drops what it's doing and
   * backs off — it outpaces the undead, so running works. Returns the away
   * direction (-1/1), or 0 if there's nothing to run from. The Guerreiro
   * never calls this — it closes in.
   */
  private fleeSkeletonDir(x: number, y: number): number {
    const foe = this.nearestOf(x, y, SimGrid.SKELETON_ONLY, SKELETON_FLEE_RANGE);
    if (!foe) return 0;
    return foe[0] > 0 ? -1 : foe[0] < 0 ? 1 : (Math.random() < 0.5 ? 1 : -1);
  }

  /** Nearest cell of any id in `ids` within `range` of (x, y) — returns its [dx, dy] offset, or null. */
  private nearestOf(x: number, y: number, ids: readonly MaterialId[], range: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dy = -range; dy <= range; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -range; dx <= range; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= this.width) continue;
        if ((dx === 0 && dy === 0) || !ids.includes(this.material[ny * this.width + nx] as MaterialId)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = [dx, dy]; }
      }
    }
    return best;
  }

  /**
   * Land `dmg` on whatever unit is at cell `i`, struck from (fromX, fromY).
   * The cell flashes red; a survivor is knocked a step back, away from the
   * blow. Returns true if it finished the target — a Esqueleto crumbles to
   * nothing, a Pip falls.
   */
  private strike(i: number, dmg: number, fromX: number, fromY: number): boolean {
    if (i < 0 || i >= this.hp.length) return false;
    const raw = this.hp[i];
    const cur = raw & HP_POINTS_MASK;
    if (cur === 0) return false;
    const x = i % this.width;
    const y = (i / this.width) | 0;
    this.hits.push({ x, y, life: HIT_FLASH_LIFE, maxLife: HIT_FLASH_LIFE });
    if (cur <= dmg) {
      this.set(x, y, MaterialId.Empty);
      return true;
    }
    this.hp[i] = (raw & HP_EMPOWERED) | (cur - dmg);
    // Recoil: often shove the victim a step back, away from the blow, if the
    // cell that way is clear. Not every time — a fight should still be a fight,
    // not two units pinballing apart on every hit.
    if (Math.random() < 0.55) {
      const kx = Math.sign(x - fromX) || (Math.random() < 0.5 ? 1 : -1);
      if (this.inBounds(x + kx, y) && this.get(x + kx, y) === MaterialId.Empty) {
        this.moveCreature(x, y, x + kx, y, packCreature(-kx, 0, creatureFed(this.meta[i])));
      }
    }
    return false;
  }

  /**
   * The attack clock for the fighter at cell `i`. Called once a turn while it's
   * in a fight: ticks the cooldown down, and when it's run out (and the unit is
   * `readyToHit`) resets it to ATTACK_PERIOD and returns true. A unit stood toe
   * to toe lands about one blow a second; the cooldown rides along through a
   * knockback since it lives in `workCd`, swapped with the unit.
   */
  private strikeClock(i: number, readyToHit: boolean): boolean {
    if (this.workCd[i] > 0) { this.workCd[i]--; return false; }
    if (!readyToHit) return false;
    this.workCd[i] = ATTACK_PERIOD;
    return true;
  }

  private static readonly SKELETON_ONLY: readonly MaterialId[] = [MaterialId.Skeleton];

  /**
   * Guerreiro: one of o povo, but it guards instead of building. It patrols
   * among the houses; the moment a Esqueleto comes within WARRIOR_SIGHT it
   * *charges* — it drops the unhurried folk pace and takes a step every tick
   * to close the distance — and trades blows (one point a strike, about once
   * a second). It carries 10 hit points to a working Pip's 5.
   */
  private stepWarrior(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const facing = creatureFacing(this.meta[i]);
    const fed = this.folkUpkeep(x, y, creatureFed(this.meta[i]));
    if (fed < 0 || this.material[i] !== MaterialId.Warrior) return;

    // Look for a fight first — a Guerreiro that's spotted a Esqueleto acts
    // every tick (it's running), not on the slow labour cadence. The full
    // WARRIOR_SIGHT sweep for spotting a threat from afar only runs on the
    // ordinary cadence (see COMBAT_MELEE_CHECK); a fight already underway is
    // always caught by the cheap short-range check every tick regardless.
    const foe = this.nearestOf(x, y, SimGrid.SKELETON_ONLY, COMBAT_MELEE_CHECK) ||
      (this.folkActNow(x, y) ? this.nearestOf(x, y, SimGrid.SKELETON_ONLY, WARRIOR_SIGHT) : null);
    if (foe) {
      const [fdx, fdy] = foe;
      const nf = Math.sign(fdx) || facing;
      const adj = Math.abs(fdx) <= 1 && Math.abs(fdy) <= 1;
      if (this.strikeClock(i, adj)) {
        const dmg = (this.hp[i] & HP_EMPOWERED) ? ATTACK_DAMAGE * 2 : ATTACK_DAMAGE;
        this.strike(this.index(x + fdx, y + fdy), dmg, x, y);
      }
      if (adj) {
        this.meta[i] = packCreature(nf, 0, fed);
        return;
      }
      this.folkWalk(x, y, i, nf, fed, 0, nf); // charge, every tick
      return;
    }

    // Nothing to fight: back to the unhurried pace.
    if (!this.folkActNow(x, y)) {
      this.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    if (this.folkWeather(x, y, i, facing, fed, 0)) return;
    const home = this.folkHomeDir(x, y, MaterialId.Warrior);
    this.folkWalk(x, y, i, facing, fed, 0, home);
  }

  /**
   * Esqueleto: a slow undead that hunts o povo. It shambles toward the
   * nearest Pip it can see and, toe to toe, strikes it once a second for one
   * point. It has 5 hit points; a Guerreiro's blows, Fogo, Lava, Ácido or
   * deep Água end it. It takes a turn only every SKELETON_ACT_INTERVAL ticks,
   * so the folk outpace it.
   */
  private stepSkeleton(x: number, y: number, i: number): void {
    this.processed[i] = 1;
    const facing = creatureFacing(this.meta[i]);

    // Lethal ground: Lava on contact, or dragged under deep water.
    let waterBelow = false, waterAround = 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nId = this.material[this.index(nx, ny)] as MaterialId;
      if (nId === MaterialId.Lava) { this.igniteAt(x, y); this.set(x, y, MaterialId.Empty); return; }
      if (nId === MaterialId.Water) { waterAround++; if (dx === 0 && dy === 1) waterBelow = true; }
    }
    if (waterBelow && waterAround >= 6 && Math.random() < 0.14) {
      this.set(x, y, MaterialId.Empty);
      return;
    }

    // Slow and lurching — takes a turn only every SKELETON_ACT_INTERVAL ticks,
    // so the folk always outpace it, but it acts every tick while it's actually
    // toe to toe with a Pip so a single shove can't break off the fight. The
    // cheap short-range check settles that every tick; the full SKELETON_SIGHT
    // sweep for spotting a Pip from afar only runs on the ordinary cadence
    // (see COMBAT_MELEE_CHECK) — anything adjacent is always inside it too,
    // so a fight already underway never has to wait on the slow cadence.
    const nearPrey = this.nearestOf(x, y, PIP_IDS, COMBAT_MELEE_CHECK);
    const adjacentNow = nearPrey !== null && Math.abs(nearPrey[0]) <= 1 && Math.abs(nearPrey[1]) <= 1;
    if (!adjacentNow && (this.tick + x) % SKELETON_ACT_INTERVAL !== 0) {
      this.meta[i] = packCreature(facing, 0, CREATURE_FED_MAX);
      return;
    }
    const prey = adjacentNow ? nearPrey : this.nearestOf(x, y, PIP_IDS, SKELETON_SIGHT);
    let wantDir = 0;
    if (prey) {
      const [pdx, pdy] = prey;
      wantDir = Math.sign(pdx) || facing;
      const adj = Math.abs(pdx) <= 1 && Math.abs(pdy) <= 1;
      if (this.strikeClock(i, adj)) {
        const dmg = (this.hp[i] & HP_EMPOWERED) ? ATTACK_DAMAGE * 2 : ATTACK_DAMAGE;
        this.strike(this.index(x + pdx, y + pdy), dmg, x, y);
      }
      if (adj) {
        this.meta[i] = packCreature(wantDir, 0, CREATURE_FED_MAX);
        return;
      }
    } else if (Math.random() < SKELETON_WANDER_CHANCE) {
      wantDir = Math.random() < 0.5 ? -facing : facing;
    }
    // Reuse the folk surface walk (well fed, so it never forages) — it climbs,
    // steps down, and phases through house walls to get at the folk inside.
    this.folkWalk(x, y, i, wantDir || facing, CREATURE_FED_MAX, 0, wantDir);
  }

}
