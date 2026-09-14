import { MaterialCategory, MaterialId, type DragBlob } from "./types";
import { MATERIALS, SINGLE_DROP_MATERIALS } from "./materials";
import { NEUTRAL_TEMP, EXTREME_COLD, EXTREME_HOT, COLD_1, COLD_2, COLD_3, HOT_2, isProsperous } from "./temperature";
import { rleEncode, rleDecode, SCHEMA_VERSION, type MapSnapshot } from "./storage";
import {
  HOUSE_ANCHOR_META, HOUSE_WALL_META, HOUSE_WALL_BRICK, HOUSE_WALL_WOOD, HOUSE_WALL_ICE,
  HOUSE_WALL_MATERIAL, HOUSE_WALLS, type RoofShape, type HousePlan, HOUSE_PLANS,
  MASON_MAX_PLAN, PLAN_GRANARY, PLAN_WOODSHED, HOUSE_MAX_DWELLING_SPAN,
  HOUSE_WALL, HOUSE_ROOF, HOUSE_WINDOW, HOUSE_CHIMNEY, HOUSE_FLOOR, HOUSE_DECK, HOUSE_STAIR,
  HOUSE_KIND_MASK, type HouseCell, houseCellMaterial, houseCells, HOUSE_BLUEPRINTS, HOUSE_HEIGHTS,
  houseStyle, houseType, packHouseAnchor,
} from "./houseBlueprints";
import {
  WHEAT_RIPE, GLASS_SHATTER_HITS, CIRCUIT_ON_META, LEVER_ARM_META, CIRCUIT_LINKED_META,
  CLONE_LOCK_MASK, CLONE_LINKED_META, CLONE_ON_META, MAGIC_LIFE,
} from "./metaBits";
import { NEIGHBORS_8, NEIGHBORS_4 } from "./neighbors";
import { stepLifeGeneration as stepLifeGenerationImpl } from "./systems/life";
import {
  randomEmptyNeighbor as randomEmptyNeighborImpl, antScentDir as antScentDirImpl,
  moveFish as moveFishImpl, stepAnt as stepAntImpl, birdPreyDir as birdPreyDirImpl,
  stepBird as stepBirdImpl, stepFish as stepFishImpl,
} from "./systems/wildlife";
import {
  CREATURE_FED_MAX, CREATURE_FED_BITS, CREATURE_STARVE_DEATH_CHANCE,
  packCreature, creatureFacing, creatureTimer, creatureFed,
} from "./creatureMeta";
import {
  stepMagic as stepMagicImpl, transmute as transmuteImpl, conjureCreature as conjureCreatureImpl,
} from "./systems/magic";
import {
  stepClone as stepCloneImpl, advancePulses as advancePulsesImpl, conducts as conductsImpl,
  pulseDirCandidates as pulseDirCandidatesImpl, circuitConnected as circuitConnectedImpl,
  stepCircuitBlock as stepCircuitBlockImpl, circuitPowered as circuitPoweredImpl,
  pulseAt as pulseAtImpl, stepWire as stepWireImpl, doorPowered as doorPoweredImpl,
  bodyCircuitState as bodyCircuitStateImpl, stepDoor as stepDoorImpl,
} from "./systems/electricity";
import {
  stepFire as stepFireImpl, tryMoveFire as tryMoveFireImpl, igniteAt as igniteAtImpl,
  detonate as detonateImpl, applyBlastImpulse as applyBlastImpulseImpl,
  isFusableExplosive as isFusableExplosiveImpl, collectExplosivePocket as collectExplosivePocketImpl,
  canDetonate as canDetonateImpl, stepFuse as stepFuseImpl, floodFuseConnected as floodFuseConnectedImpl,
  spawnShrapnelBurst as spawnShrapnelBurstImpl, advanceShrapnel as advanceShrapnelImpl,
  shatterGlass as shatterGlassImpl, advanceDebris as advanceDebrisImpl, depositDebris as depositDebrisImpl,
  advanceFlashes as advanceFlashesImpl, HEAT_FUSE_GLASS,
} from "./systems/fire";
import {
  growthFactor as growthFactorImpl, stepOrganic as stepOrganicImpl,
  stampProsperousBloom as stampProsperousBloomImpl, stepDirt as stepDirtImpl,
  stepSeed as stepSeedImpl, stampFlower as stampFlowerImpl, stemBelow as stemBelowImpl,
  crownAbove as crownAboveImpl, stepSprout as stepSproutImpl, stepWheat as stepWheatImpl,
} from "./systems/plants";
import {
  stepSalt as stepSaltImpl, stepMetal as stepMetalImpl, stepIce as stepIceImpl,
  frostOver as frostOverImpl, stepLava as stepLavaImpl, stepAcid as stepAcidImpl,
} from "./systems/reactions";

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
const ACID_START_CHARGES = 5;
// PULSE_MAX_STEPS lives in systems/electricity.ts.
export const SPROUT_BUDGET_MIN = 16;
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
export const SPROUT_BUDGET_MASK = 0x3f;
export const SPROUT_REGROWN_FLAG = 0x80;
/** Meta bit marking a Sprout (and everything grown from it) as a Lenhador's cultivated tree — it grows without needing water/mud close by, since the forester tends it. */
export const SPROUT_FOREST_FLAG = 0x40;
/**
 * Meta bit on a Madeira cell marking it as a living tree's trunk (grown by
 * stepSprout, not cut by anyone yet). A trunk renders like ordinary wood but
 * isn't counted as stockpiled timber and won't be pulled into a bridge — only
 * a Lenhador felling the tree turns it into plain, harvestable Madeira. Sits
 * clear of the HOUSE_* bits (0x40 wall / 0x80 anchor / 0x07 kind).
 */
export const TREE_TRUNK_META = 0x20;
/** Meta bit on a Semente marking it as one a Lenhador sowed — it germinates with a bigger growth budget so it fills out into a real tree, not a shrub. */
export const FOREST_SEED_META = 1;
/** A forest tree stops growing once it carries this many crown cells — keeps a tended tree from ballooning into a canopy blanket. */
const TREE_CROWN_CAP = 26;
/** How many cells a tree grows a bare vertical trunk before its crown bushes out. */
export const TREE_TRUNK_HEIGHT = 4;
/**
 * Size of that one-time catch-up bonus. Kept deliberately small: a Sprout's
 * budget is cloned (not split) at every branch point it spawns — the same
 * mechanic that lets an ordinary 16-34 germination budget produce a bushy
 * structure with far more than 34 total cells — so even a modest bonus can
 * balloon into a lot of extra growth once branching compounds it.
 */
export const SPROUT_REGROWTH_BONUS = 3;

/*
 * ── Trigo (the Plantador's crop) ────────────────────────────────────────
 * A wheat cell's `meta` is a 0-255 ripeness clock. It ticks up every step
 * (scaled by the climate `growthFactor`); the renderer greens it low and
 * golds it high. A shoot with headroom and its roots still near soil grows
 * a fresh cell on top up to WHEAT_MAX_HEIGHT. From WHEAT_RIPE on it's ripe:
 * food for the folk (see folkUpkeep / stepFarmer) and, rarely, it flings a
 * seed onto adjacent bare soil. An unrooted or hard-frosted stalk withers.
 */
// WHEAT_RIPE lives in metaBits.ts — the renderer needs it too.
export const WHEAT_MAX_HEIGHT = 3;
/** Cells of level furrow the Plantador needs ahead of it before it will sow a shoot (it grades a slightly wider strip). */
const WHEAT_FURROW = 1;
/** Divides the density gap when sinking through a liquid; smaller = faster sinking per point of density. */
const SINK_DENSITY_SCALE = 8;
/** Ticks a Powder/Liquid cell must fail to move before it's put to sleep and skipped. */
const SLEEP_THRESHOLD = 4;
// WATER_BASE_CONDUCT_CHANCE / PULSE_TOUCH_BONUS / PULSE_DRIFT_CHANCE /
// PULSE_LEAP_CHANCE live in systems/electricity.ts. PULSE_AIR_LIFE stays
// here — paintCell's Eletricidade brush needs it too.
/** Ticks a free-falling charge survives with nothing touching it — see the Pulse comment below. Short, so a lone spark fizzles out almost immediately. */
export const PULSE_AIR_LIFE = 6;
/**
 * Purely a visual flourish — see `Debris` for what actually shoves material
 * around. Shrapnel is evenly spread around the full circle from the
 * epicentre (plus a little angle jitter so it doesn't read as a perfect
 * starburst) and still shatters Glass on contact, but never moves grid
 * material itself.
 */
/** Per-tick chance a Gás cell that hasn't been ignited disperses into the air and vanishes — emitted as a puff like Fogo, and gone within about a second if nothing sets it off. */
const GAS_DISSIPATE_CHANCE = 0.015;
// GLASS_SHATTER_HITS lives in metaBits.ts — the renderer needs it too.
/** Ticks a detonation's initial bright Flash lasts before fully fading — a couple of frames, just long enough to read as a flash rather than a single-frame strobe. */
export const FLASH_LIFE = 4;
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
/**
 * When an explosive first goes off, the detonation floods the whole
 * *connected* body of explosive it's part of and lights a fuse on every
 * cell at once, timed by how many cells out it is — so a painted block
 * rips itself apart in one fast crack that visibly sweeps across it in a
 * few frames (like a real detonation front tearing through the charge),
 * not a lazy smoulder-chain crawling cell by cell over several seconds.
 */
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
export const DETONATIONS_PER_TICK_CAP = 240;
/** Fraction of a Vida brush stroke that actually gets painted — see the comment on VIDA in paintCell. */
const VIDA_PAINT_DENSITY = 0.4;
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
export const AMBIENT_ICE_MELT_TEMP = 5;
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
export const WATER_BOIL_TEMP = 100;
const ACID_BOIL_TEMP = 83;
const WATER_BOIL_CHANCE = 0.006;
const STEAM_CONDENSE_CHANCE = 0.01;
const ACID_BOIL_CHANCE = 0.006;
const ACID_VAPOR_CONDENSE_CHANCE = 0.01;
// CLONE_CHANCE / CLONE_PROPAGATE_CHANCE live in systems/electricity.ts.
// LIFE_EAT_CHANCE (Vida's per-material eat odds) lives in systems/life.ts.

// Creature meta-byte packing (facing/timer/fed) lives in creatureMeta.ts —
// every creature system (wildlife, folk, magic) shares it.

// Ant/Bird/Fish tuning constants live in systems/wildlife.ts, alongside the
// AI that uses them.

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

/** Cut Madeira anywhere on the map at or above which the Construtor has stock enough to start decking a bridge or a staircase — the woodlot has to be worked up first, but only barely: a couple of felled trees' worth, not a whole stockpile, so building starts soon after there's anything to build with at all. */
const BRIDGE_TIMBER_MIN = 4;

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
export const HP_POINTS_MASK = 0x7f;
export const HP_EMPOWERED = 0x80;
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

// CIRCUIT_ON_META / LEVER_ARM_META / CIRCUIT_LINKED_META / CLONE_LOCK_MASK /
// CLONE_LINKED_META / CLONE_ON_META live in metaBits.ts — the renderer needs
// them too. See that file for the full layout explanation.
// CIRCUIT_FLOOD_CAP lives in systems/electricity.ts.
/**
 * A single click of Alavanca stamps a housing (LEVER_FRAME, offsets from
 * its anchor at the top-left) with a two-cell-wide knob sitting inside it
 * — down at LEVER_KNOB_OFF to start, filling the housing's full interior
 * width so it actually reads at this size instead of getting lost as one
 * lone pixel. Flipping it (`toggleLever`) doesn't just recolor: the knob
 * cells themselves move, to LEVER_KNOB_ON up top, an actual switch thrown,
 * not a paint job. The top/bottom bars come in a cell narrower than the
 * sides to round off the corners instead of a flat rectangle.
 */
const LEVER_FRAME: readonly [number, number][] = [
  [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1], [3, 1],
  [0, 2], [3, 2],
  [0, 3], [3, 3],
  [0, 4], [3, 4],
  [0, 5], [3, 5],
  [0, 6], [1, 6], [2, 6], [3, 6],
  [1, 7], [2, 7],
];
const LEVER_KNOB_ON: readonly [number, number][] = [[1, 2], [2, 2]];
const LEVER_KNOB_OFF: readonly [number, number][] = [[1, 5], [2, 5]];
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

// House/bridge/staircase blueprint data (shapes, bit layout) lives in
// houseBlueprints.ts — pure data, shared by grid.ts and PixiStage's renderer.

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
export const WHEAT_PER_FARMER = 70;
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
/** Shortest clear rise a Construtor will bother building a staircase for — anything lower than this, a folk just steps or climbs it on its own (see folkWalk's wall-hauling), so a whole built structure would be overkill. */
const STAIR_MIN_RISE = 6;
/** Tallest ledge a Construtor will still climb toward — generous, so a proper multi-storey "vertical village" stays reachable. */
const STAIR_MAX_RISE = 80;
/** Radius (both directions) a Construtor checks for an existing staircase before starting a new one — one climb per ledge, same idea as `deckNear` for bridges. */
const STAIR_NEAR_RANGE = 60;
/** How far a Construtor actively looks for water to bridge — wider than the general FOLK_SCAN_RANGE (used for things like a farmer eyeing a nearby crop) so it seeks out a distant crossing on its own instead of only reacting to water it happens to wander within a short radius of. Bridges (and staircases) are what a Construtor is *for*; it shouldn't need luck to notice one's needed. */
const MASON_WATER_SEEK_RANGE = 80;
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

/**
 * Consecutive real actions folkWalk spends failing to make any headway on a
 * real want (see `stuckTicks`) before it gives up on it for a while — a
 * climb with no ledge at the top, a squeeze that never opens, a shaft too
 * packed to pass. Short enough that it doesn't read as ignoring an order,
 * long enough not to bail on an ordinary multi-step climb partway through.
 */
const FOLK_STUCK_LIMIT = 10;
/** Sentinel floor for `stuckTicks`: at or above this it means "currently giving up" rather than "counting failures" — see the give-up check at the top of folkWalk. */
const FOLK_GIVEUP_ZONE = 100;
/** How many further real actions the give-up (wantDir forced to 0) lasts — long enough for the spot to actually clear, short enough the folk is back on the job well within the same minute. */
const FOLK_GIVEUP_COOLDOWN = 50;

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

// Magia's tuning constants (MAGIC_CAST_COST, MAGIC_CONJURE_CHANCE,
// MAGIC_BLOOM_ON_DEATH) live in systems/magic.ts. MAGIC_LIFE lives in
// metaBits.ts — the renderer needs it too.

// NEIGHBORS_8 / NEIGHBORS_4 live in neighbors.ts — every system module needs them.
/** [dx, dy, weight] a Sprout can grow into — biased upward, never downward, so it reads as a little plant instead of a blob. */
export const SPROUT_DIRECTIONS = [
  [0, -1, 3],
  [-1, -1, 2], [1, -1, 2],
  [-1, 0, 1], [1, 0, 1],
] as const;
/** Growth directions for the lowest cells of a shoot — straight up only, so a tree starts with a clean vertical trunk before its crown spreads. */
export const TREE_TRUNK_DIRECTIONS = [[0, -1, 1]] as const;
/** Trunk cells a tended tree grows before it stamps its crown. */
export const TREE_CROWN_START = TREE_TRUNK_HEIGHT;
/**
 * The leaf cells of a tended tree's crown, stamped in one go around the top of
 * the trunk (relative to the tip cell) — a rounded blob so it reads as
 * foliage. Only lands on empty air, so a crowded spot just gets a smaller crown.
 */
export const TREE_CROWN_SHAPE: readonly (readonly [number, number])[] = [
  [-1, 0], [1, 0], [0, 0],
  [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
  [-1, -3], [0, -3], [1, -3],
  [0, -4],
];
/** How far sideways TREE_CROWN_SHAPE ever reaches from the trunk tip it's stamped around — the crown only ever lands cells actually in bounds (see stepSprout), so a tree whose tip ends up this close to the map's left/right edge stamps permanently short and can never fill out past LUMBERJACK_MIN_TREE. Used to keep a Lenhador from sowing a seed doomed to grow into one. */
export const TREE_CROWN_DX_MAX = Math.max(...TREE_CROWN_SHAPE.map(([dx]) => Math.abs(dx)));
/** How far above the trunk tip TREE_CROWN_SHAPE reaches — combined with the bare-trunk climb (TREE_CROWN_START) below, the total headroom a tended tree needs above where it's sown. */
export const TREE_CROWN_DY_MAX = Math.max(...TREE_CROWN_SHAPE.map(([, dy]) => -dy));

// FLOWER_PATTERNS / FLOWER_PATTERNS_PROSPEROUS / PLANT_BLOOM_FLOWER_PATTERNS /
// PLANT_BLOOM_BRANCH_PATTERNS live in systems/plants.ts.

/**
 * A charge of electricity. Never written into the material grid — it has
 * no physical form, doesn't occupy a cell, doesn't collide with matter,
 * with other charges, or with itself, and any number of them can overlap
 * the same space. It only interacts with the grid when it's *blocked*: a
 * solid stops it (reacting if that solid is a conductor, Gunpowder, or
 * something flammable), while Empty space and conductors just let it
 * keep travelling through.
 */
export interface Pulse {
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
export interface Shrapnel {
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
export interface Flash {
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
export interface Debris {
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
  processed: Uint8Array;
  /**
   * Consecutive ticks a Powder/Liquid cell has gone without moving. Past
   * SLEEP_THRESHOLD the cell is skipped entirely instead of re-running its
   * movement rules. Any real change near a cell (a swap, a paint) wakes it
   * back up. On its own this only helps cells that are genuinely blocked —
   * see `flowDir` below for the case that actually causes the visible
   * shoreline dither.
   */
  stillTicks: Uint8Array;
  /**
   * -1/0/1: the horizontal direction a Liquid cell committed to on its last
   * sideways flow. A cell parked between two equally "downhill" sideways
   * options that re-rolls the choice every tick will happily swap with its
   * neighbor, undo it next tick, and repeat forever — that move *succeeds*
   * every time, so `stillTicks` never sees a failure to count and the cell
   * never sleeps. Sticking to the last direction until it's actually
   * blocked turns that infinite flip-flop into a one-time settle.
   */
  flowDir: Int8Array;
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
  workCd: Uint8Array;
  /**
   * Consecutive real actions a walking folk has spent trying (and failing)
   * to make headway toward a want it can't reach this way — a climb that
   * tops out onto nothing, say, or a squeeze that never opens up. Moves
   * with the unit via `swap`, cleared by `set` and by any real progress.
   * Once it crosses `FOLK_GIVE_UP_TICKS` the folk backs off and lets the
   * spot go instead of refighting the same dead end forever: a byte of
   * memory a plain reactive walker (no pathfinding, no persistent plan)
   * has no other way to know it's been here before.
   */
  stuckTicks: Uint8Array;
  /** Active electricity charges currently travelling through a conductor — see `Pulse`. */
  pulses: Pulse[] = [];
  /** Decorative explosion sparks in flight — see `Shrapnel`. */
  shrapnel: Shrapnel[] = [];
  /** Material chunks physically thrown by an explosion, mid-flight — see `Debris`. */
  debris: Debris[] = [];
  /** Brief, very bright flash cells at a fresh detonation's epicenter — purely decorative, see `Flash`. */
  flashes: Flash[] = [];
  /** Brief red flash cells where a blow just landed — a combat hit marker, purely decorative. Same struct as `Flash`. */
  hits: Flash[] = [];
  /** Global temperature in Celsius — see `updateTemperature`. Starts at the neutral baseline since nothing hot or cold has run yet. */
  temp = NEUTRAL_TEMP;
  /** Weighted count of Fogo/Lava cells seen so far this tick's main scan — reset and accumulated in `step()`, consumed by `updateTemperature`. An absolute count, not a ratio — see HOT_PIXELS_FOR_MAX. */
  hotAccum = 0;
  /** Count of Gelo cells seen so far this tick's main scan. */
  coldAccum = 0;
  /** Pops left this tick before DETONATIONS_PER_TICK_CAP kicks in — see the constant. Refilled at the top of every `step()`. */
  detonationBudget = DETONATIONS_PER_TICK_CAP;
  /** This tick's powered/unpowered verdict for every Fio/Porta cell circuitPowered has already traced, keyed by grid index — a whole connected run gets settled once by the cell that happens to be visited first instead of repeating the same walk per cell. Cleared at the top of every `step()`. */
  circuitCache = new Map<number, boolean>();
  /** This tick's open/shut verdict for every Porta cell doorPowered has already traced, keyed by grid index — see doorPowered: a connected slab of Porta is one body, open if *any* cell of it is individually fed, not just the cells actually touching a Fio/Alavanca. Cleared at the top of every `step()`. */
  doorCache = new Map<number, boolean>();
  /** This tick's linked/active verdict for every locked Clone cell cloneCircuitState has already traced, keyed by grid index — see cloneCircuitState: a connected clump of Clone is one body, exactly like a Porta slab, not a grid of independent cells. Packs both booleans into one int (bit 0 = linked, bit 1 = active) to avoid an object per cell. Cleared at the top of every `step()`. */
  cloneCache = new Map<number, number>();
  /** Same as `cloneCache`, but for connected clumps of Bloco de Calor/Frio (see bodyCircuitState) — HeatBlock and ColdBlock never share a cell so one cache safely serves both. Cleared at the top of every `step()`. */
  blockCache = new Map<number, number>();
  tick = 0;
  /** Rolling census (refreshed every CENSUS_INTERVAL ticks) the trades use to cap themselves: houses to the head count, crops to the farmer count. */
  houseCensus = 0;
  folkCensus = 0;
  cropCensus = 0;
  farmerCensus = 0;
  timberCensus = 0;
  granaryCensus = 0;
  woodshedCensus = 0;
  /** Flips every plank any Construtor lays across the whole village — see the plank-laying site in stepMason, which only spends a real log on every *other* flip, halving what a bridge actually costs off the woodpile. A single shared counter (not one per mason/bridge) is enough: it doesn't matter which plank of which span skips the cost, only that on average half of them do. */
  bridgePlankFree = false;

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
    this.stuckTicks = new Uint8Array(width * height);
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
    this.stuckTicks.fill(0);
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
    this.stuckTicks[i] = 0;
    this.wake(x, y);
  }

  /** Wakes a cell and its neighbors so they re-evaluate movement next tick. */
  wake(x: number, y: number): void {
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
  draggable(id: MaterialId): boolean {
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
  nearestEmpty(x: number, y: number, reach = 3): number {
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

  restampBlob(blob: DragBlob, cx: number, cy: number, reach: number): void {
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

  metaFor(id: MaterialId): number {
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
  paintCell(x: number, y: number, id: MaterialId): void {
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
  dropOne(cx: number, cy: number, id: MaterialId): void {
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
  dropLever(cx: number, cy: number): void {
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
          if (clear) {
            for (const [kox, koy] of LEVER_KNOB_OFF) {
              if (!this.inBounds(ax + kox, ay + koy) || this.get(ax + kox, ay + koy) !== MaterialId.Empty) { clear = false; break; }
            }
          }
          if (!clear) continue;
          for (const [ox, oy] of LEVER_FRAME) this.set(ax + ox, ay + oy, MaterialId.Lever, 0);
          for (const [kox, koy] of LEVER_KNOB_OFF) this.set(ax + kox, ay + koy, MaterialId.Lever, LEVER_ARM_META); // starts off
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
   * regardless of which cell the cursor landed on. If (x, y) itself isn't
   * an Alavanca cell — LEVER_FRAME's rounded corners leave a couple of its
   * own bounding-box cells empty, so a right-click smack on the anchor
   * pixel a placement click just landed on can otherwise miss the fixture
   * entirely — it nudges to the nearest Alavanca within 2 cells first. A
   * no-op past that (empty ground, a different material, out of bounds) —
   * returns whether it actually found and flipped one, so a caller (the
   * right-click handler, which works no matter what tool is selected)
   * knows whether to treat the click as "handled" or fall through to its
   * usual behavior.
   */
  toggleLever(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.get(x, y) !== MaterialId.Lever) {
      let nx0 = -1, ny0 = -1;
      outer: for (let r = 1; r <= 2; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const cx = x + dx, cy = y + dy;
            if (this.inBounds(cx, cy) && this.get(cx, cy) === MaterialId.Lever) { nx0 = cx; ny0 = cy; break outer; }
          }
        }
      }
      if (nx0 < 0) return false;
      x = nx0; y = ny0;
    }
    const startI = this.index(x, y);
    const next = (this.meta[startI] & CIRCUIT_ON_META) === 0 ? CIRCUIT_ON_META : 0;
    const visited = new Set<number>([startI]);
    const stack = [startI];
    let minX = x, minY = y;
    const knobIs: number[] = (this.meta[startI] & LEVER_ARM_META) !== 0 ? [startI] : [];
    let budget = LEVER_FLOOD_CAP;
    while (stack.length > 0 && budget-- > 0) {
      const i = stack.pop()!;
      const cx = i % this.width, cy = (i / this.width) | 0;
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (i !== startI && (this.meta[i] & LEVER_ARM_META) !== 0) knobIs.push(i);
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
    const knobOffsets = next !== 0 ? LEVER_KNOB_ON : LEVER_KNOB_OFF;
    const knobSet = new Set(knobIs);
    for (const oldI of knobIs) {
      const oldX = oldI % this.width, oldY = (oldI / this.width) | 0;
      this.material[oldI] = MaterialId.Empty;
      this.meta[oldI] = 0;
      this.wake(oldX, oldY);
    }
    for (const [kox, koy] of knobOffsets) {
      const newKnobX = minX + kox, newKnobY = minY + koy;
      if (!this.inBounds(newKnobX, newKnobY)) continue;
      this.set(newKnobX, newKnobY, MaterialId.Lever, LEVER_ARM_META | next);
    }
    for (const i of visited) {
      if (knobSet.has(i)) continue; // already moved/reset above
      this.meta[i] = next; // frame cells: never LEVER_ARM_META, just the on/off bit
      this.wake(i % this.width, (i / this.width) | 0);
    }
    return true;
  }

  swap(ax: number, ay: number, bx: number, by: number): void {
    const ai = this.index(ax, ay);
    const bi = this.index(bx, by);
    const tm = this.material[ai];
    const tmeta = this.meta[ai];
    const tflow = this.flowDir[ai];
    const thp = this.hp[ai];
    const tcd = this.workCd[ai];
    const tstuck = this.stuckTicks[ai];
    this.material[ai] = this.material[bi];
    this.meta[ai] = this.meta[bi];
    this.flowDir[ai] = this.flowDir[bi];
    this.hp[ai] = this.hp[bi];
    this.workCd[ai] = this.workCd[bi];
    this.stuckTicks[ai] = this.stuckTicks[bi];
    this.material[bi] = tm;
    this.meta[bi] = tmeta;
    this.flowDir[bi] = tflow;
    this.hp[bi] = thp;
    this.workCd[bi] = tcd;
    this.stuckTicks[bi] = tstuck;
    this.processed[ai] = 1;
    this.processed[bi] = 1;
    this.wake(ax, ay);
    this.wake(bx, by);
  }

  canDisplace(intoId: MaterialId, movingDensity: number): boolean {
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
    if (this.cloneCache.size > 0) this.cloneCache.clear();
    if (this.blockCache.size > 0) this.blockCache.clear();
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
        else if (id === MaterialId.Lava) this.hotAccum += 2;
        else if (id === MaterialId.HeatBlock) {
          if (this.stepCircuitBlock(x, y, i, MaterialId.HeatBlock)) this.hotAccum += 2;
        } else if (id === MaterialId.Ice) this.coldAccum++;
        else if (id === MaterialId.ColdBlock) {
          if (this.stepCircuitBlock(x, y, i, MaterialId.ColdBlock)) this.coldAccum++;
        }

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
  updateTemperature(): void {
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
  stepPowder(x: number, y: number, density: number): boolean {
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

  stepLiquid(x: number, y: number, density: number): boolean {
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
  stepGas(x: number, y: number, density: number): boolean {
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

  tryMove(fx: number, fy: number, tx: number, ty: number, density: number): boolean {
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

  /** Fogo: spreads, ignites neighbours, smothers or burns out. See systems/fire.ts. */
  stepFire(x: number, y: number, i: number): void {
    stepFireImpl(this, x, y, i);
  }

  /** Moves a Fogo cell into empty space if it can. See systems/fire.ts. */
  tryMoveFire(fx: number, fy: number, tx: number, ty: number): boolean {
    return tryMoveFireImpl(this, fx, fy, tx, ty);
  }

  /** Sets a cell alight — a detonation for explosives, an ordinary burn otherwise. See systems/fire.ts. */
  igniteAt(x: number, y: number): void {
    igniteAtImpl(this, x, y);
  }

  /** One local detonation: consumes a small pocket, floods fuses through the rest of the charge, applies the blast impulse. See systems/fire.ts. */
  detonate(cx: number, cy: number): void {
    detonateImpl(this, cx, cy);
  }

  /** The physical shove of one detonation over its blast disc. See systems/fire.ts. */
  applyBlastImpulse(cx: number, cy: number, ex: number, ey: number, radius: number): void {
    applyBlastImpulseImpl(this, cx, cy, ex, ey, radius);
  }

  /** Whether a material detonates on a lit fuse (Pólvora/C4, not Gás). See systems/fire.ts. */
  isFusableExplosive(id: MaterialId): boolean {
    return isFusableExplosiveImpl(this, id);
  }

  /** The small local pocket a single detonation consumes. See systems/fire.ts. */
  collectExplosivePocket(cx: number, cy: number): [number, number][] {
    return collectExplosivePocketImpl(this, cx, cy);
  }

  /** Spends one pop of this tick's detonation budget, if any is left. See systems/fire.ts. */
  canDetonate(): boolean {
    return canDetonateImpl(this);
  }

  /** A lit fuse counts down and detonates at zero. See systems/fire.ts. */
  stepFuse(x: number, y: number, i: number): void {
    stepFuseImpl(this, x, y, i);
  }

  /** Floods the connected body of explosive and lights a timed fuse on every cell. See systems/fire.ts. */
  floodFuseConnected(seeds: readonly [number, number][]): void {
    floodFuseConnectedImpl(this, seeds);
  }

  /** Launches a decorative burst of heat-sparks from a detonation's epicentre. See systems/fire.ts. */
  spawnShrapnelBurst(ex: number, ey: number, count: number): void {
    spawnShrapnelBurstImpl(this, ex, ey, count);
  }

  /** Advances every Shrapnel particle one tick. See systems/fire.ts. */
  advanceShrapnel(): void {
    advanceShrapnelImpl(this);
  }

  /** Cracks (and eventually shatters) a Vidro cell hit by an impact. See systems/fire.ts. */
  shatterGlass(x: number, y: number): void {
    shatterGlassImpl(this, x, y);
  }

  /** Flies every in-flight Debris chunk one tick under gravity and drag. See systems/fire.ts. */
  advanceDebris(): void {
    advanceDebrisImpl(this);
  }

  /** Puts one chunk of debris back on the grid as its own material. See systems/fire.ts. */
  depositDebris(d: Debris): void {
    depositDebrisImpl(this, d);
  }

  /** Ages out every active Flash and combat-hit marker. See systems/fire.ts. */
  advanceFlashes(): void {
    advanceFlashesImpl(this);
  }


  /** Vida's own generation-by-generation automaton — see systems/life.ts. */
  stepLifeGeneration(): void {
    stepLifeGenerationImpl(this);
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
  /** How much temperature holds plant reproduction back or helps it along. See systems/plants.ts. */
  growthFactor(): number {
    return growthFactorImpl(this);
  }

  /** Planta: water-driven spread, occasional bloom. See systems/plants.ts. */
  stepOrganic(x: number, y: number): void {
    stepOrganicImpl(this, x, y);
  }

  /** Stamps a small one-shot growth from a Planta blooming in the prosperous climate. See systems/plants.ts. */
  stampProsperousBloom(x: number, y: number): void {
    stampProsperousBloomImpl(this, x, y);
  }

  /** Terra wicks up touching water into Barro (Mud). See systems/plants.ts. */
  stepDirt(x: number, y: number): void {
    stepDirtImpl(this, x, y);
  }

  /** Semente germinates into a Broto or a one-shot flower stamp. See systems/plants.ts. */
  stepSeed(x: number, y: number): void {
    stepSeedImpl(this, x, y);
  }

  /** Stamps one random small branch-and-flower pattern rooted at (x, y). See systems/plants.ts. */
  stampFlower(x: number, y: number): void {
    stampFlowerImpl(this, x, y);
  }

  /** Cells of trunk/stem stacked straight below (x, y), down to soil. See systems/plants.ts. */
  stemBelow(x: number, y: number): number {
    return stemBelowImpl(this, x, y);
  }

  /** Broto/Planta/Flor cells stacked straight above (x, y). See systems/plants.ts. */
  crownAbove(x: number, y: number): number {
    return crownAboveImpl(this, x, y);
  }

  /** A germinated Sprout grows toward open space, wild or tended into a tree. See systems/plants.ts. */
  stepSprout(x: number, y: number, i: number): void {
    stepSproutImpl(this, x, y, i);
  }

  /** Trigo: ripens, grows taller, self-seeds when ripe. See systems/plants.ts. */
  stepWheat(x: number, y: number, i: number): void {
    stepWheatImpl(this, x, y, i);
  }


  /** One grain of Salt fully saturates one touching Água cell (or thaws Gelo it lands on). See systems/reactions.ts. */
  stepSalt(x: number, y: number, i: number): void {
    stepSaltImpl(this, x, y, i);
  }

  /** Metal touching Água slowly rusts into Terra. See systems/reactions.ts. */
  stepMetal(x: number, y: number): void {
    stepMetalImpl(this, x, y);
  }

  /** Gelo melts near heat, spreads onto touching fresh Água. See systems/reactions.ts. */
  stepIce(x: number, y: number): void {
    stepIceImpl(this, x, y);
  }

  /** Below COLD_1, plant matter frosts a touching Empty cell into Gelo. See systems/reactions.ts. */
  frostOver(x: number, y: number): void {
    frostOverImpl(this, x, y);
  }

  /** Lava: quenches into Pedra on Água, ignites/melts what's around it. See systems/reactions.ts. */
  stepLava(x: number, y: number): void {
    stepLavaImpl(this, x, y);
  }

  /** Clone: locks onto a touching material, then spawns more of it once wired into an active circuit. See systems/electricity.ts. */
  stepClone(x: number, y: number, i: number): void {
    stepCloneImpl(this, x, y, i);
  }

  /** Acid spends one charge per tick attempting to dissolve a touching neighbor. See systems/reactions.ts. */
  stepAcid(x: number, y: number, i: number): void {
    stepAcidImpl(this, x, y, i);
  }

  /** Advances every in-flight Eletricidade charge one step. See systems/electricity.ts. */
  advancePulses(): void {
    advancePulsesImpl(this);
  }

  /** Whether a charge can pass through this cell right now. See systems/electricity.ts. */
  conducts(x: number, y: number): boolean {
    return conductsImpl(this, x, y);
  }

  /** Straight ahead first, then every other direction except doubling straight back. See systems/electricity.ts. */
  pulseDirCandidates(dx: number, dy: number): readonly (readonly [number, number])[] {
    return pulseDirCandidatesImpl(dx, dy);
  }

  // ── Creatures & Magia ──────────────────────────────────────────────────

  /** A random empty 8-neighbour of (x, y), or null if the cell is walled in. See systems/wildlife.ts. */
  randomEmptyNeighbor(x: number, y: number): [number, number] | null {
    return randomEmptyNeighborImpl(this, x, y);
  }

  /** Step direction [dx, dy] toward the nearest food a Formiga can smell, or [0, 0] if there's none. See systems/wildlife.ts. */
  antScentDir(x: number, y: number): [number, number] {
    return antScentDirImpl(this, x, y);
  }

  /** Moves a creature into an Empty cell and stamps its fresh state byte at the destination (swap() carries the old byte along, so it has to be overwritten). */
  moveCreature(fx: number, fy: number, tx: number, ty: number, newMeta: number): void {
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
  /** Moves a Peixe into an adjacent Água cell, keeping salinity/fish state each in their own place. See systems/wildlife.ts. */
  moveFish(fx: number, fy: number, tx: number, ty: number, fishMeta: number): void {
    moveFishImpl(this, fx, fy, tx, ty, fishMeta);
  }

  /** Formiga: a surface walker that eats, breeds, drowns and burns. See systems/wildlife.ts. */
  stepAnt(x: number, y: number, i: number): void {
    stepAntImpl(this, x, y, i);
  }

  /** The nearest thing a Pássaro will swoop on, or null. See systems/wildlife.ts. */
  birdPreyDir(x: number, y: number): [number, number] | null {
    return birdPreyDirImpl(this, x, y);
  }

  /** Pássaro: cruises, hunts, flees fire, lays Semente. See systems/wildlife.ts. */
  stepBird(x: number, y: number, i: number): void {
    stepBirdImpl(this, x, y, i);
  }

  /** Peixe: swims, eats, breeds, flops when out of water. See systems/wildlife.ts. */
  stepFish(x: number, y: number, i: number): void {
    stepFishImpl(this, x, y, i);
  }

  /** Magia: a mote that transmutes and conjures. See systems/magic.ts. */
  stepMagic(x: number, y: number, i: number): void {
    stepMagicImpl(this, x, y, i);
  }

  /** One enchantment nudging a cell toward life/order. See systems/magic.ts. */
  transmute(x: number, y: number): boolean {
    return transmuteImpl(this, x, y);
  }

  /** Rarely conjures a creature fitting its surroundings. See systems/magic.ts. */
  conjureCreature(x: number, y: number): void {
    conjureCreatureImpl(this, x, y);
  }

  // ── O povo: Construtor, Lenhador, Plantador, Guerreiro ─────────────────────

  /** Collects the 8-neighbours of (x, y) whose material is in `ids`. */
  adjacentOf(x: number, y: number, ids: readonly MaterialId[]): [number, number][] {
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
  folkScanForIds(x: number, y: number, ids: readonly MaterialId[], range: number): number {
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
  folkHomeDir(x: number, y: number, trade: MaterialId): number {
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
  folkScanDir(x: number, y: number, ids: readonly MaterialId[]): number {
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
  folkUpkeep(x: number, y: number, fed: number): number {
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
  folkSheltered(x: number, y: number): boolean {
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
  folkWeather(x: number, y: number, i: number, facing: number, fed: number, carry: number): boolean {
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
  folkCountIn(ax: number, ay: number, plan: HousePlan): number {
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
  folkWalk(
    x: number, y: number, i: number,
    facing: number, fed: number, carry: number, wantDir: number,
  ): void {
    // Given up on this want for a stretch (see `stuckTicks`): too many real
    // actions in a row spent fighting the same dead end — a climb with
    // nothing at the top, a shaft too packed to pass — with nothing to show
    // for it. Let it go and wander like any idle folk instead of refighting
    // it forever; food-seeking below still overrides this if it's hungry.
    const si = this.index(x, y);
    if (this.stuckTicks[si] >= FOLK_GIVEUP_ZONE) {
      wantDir = 0;
      this.stuckTicks[si]--;
      if (this.stuckTicks[si] < FOLK_GIVEUP_ZONE) this.stuckTicks[si] = 0;
    }
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
    // precarious leading edge of a deck still being laid. This checks
    // `isBridgeDeck` specifically, not the broader `isDeck` — an ordinary
    // house floor or a staircase tread underfoot is never precarious the way
    // an unfinished bridge plank is, so it must never count here.
    const onSpan = this.isBridgeDeck(x, y + 1);
    const spanFooted = (cx: number): boolean => {
      const c = this.inBounds(cx, y + 1) ? this.get(cx, y + 1) : MaterialId.Stone;
      return c !== MaterialId.Empty && c !== MaterialId.Water &&
        MATERIALS[c].category !== MaterialCategory.Liquid;
    };
    const onFinishedDeck = onSpan && spanFooted(x + 1) && spanFooted(x - 1);
    // Right by the water, or out on a bridge deck, a folk keeps its feet — no
    // climbing over a ledge or a fellow worker (scrambling up is what leaves a
    // Pip stranded at a corner or a crew stacked crooked on a half-built deck).
    // `isBridgeDeck`, not `isDeck`: a staircase tread or an ordinary house
    // floor must never trip this. They used to, through the broad `isDeck` —
    // a Pip squeezed right next to a staircase (which is *built* to be
    // climbed hand-over-hand, wall-style, by anyone passing by, not just the
    // Construtor who raised it) read as "out on a deck" from that alone and
    // permanently refused to climb, freezing there for good.
    const nearWater = !onFinishedDeck && below !== MaterialId.Water &&
      (this.countNear(x, y, MaterialId.Water, 4) > 0 || this.isBridgeDeck(x, y + 1) || this.isBridgeDeck(x + facing, y + 1) || this.isBridgeDeck(x - facing, y + 1));

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
        // A fellow folk sitting in the landing spot, not real ground —
        // trade places with it rather than freeze here for good. Two folk
        // on opposite ends of the same ghost run, each trying to pass
        // through toward the other, can otherwise deadlock forever:
        // neither the drop here nor the matching hop-up on the other side
        // ever finds the landing clear, since each *is* the other's
        // obstruction, and a want that keeps recomputing the same facing
        // every tick (unlike idle pacing) never breaks that on its own.
        // Swapping is guaranteed to work where a retreat isn't — a shaft
        // exactly one cell wide with a wall on every other side leaves
        // nowhere to retreat *to* — and passing single file in a tight
        // spot is just what folk do; only step around a Esqueleto instead
        // (a Pip has no business trading places with the thing hunting it).
        if (FOLK_IDS.includes(t as MaterialId)) {
          this.swap(x, y, x, y + d);
          this.meta[this.index(x, y + d)] = packCreature(facing, carry, fed);
          return;
        }
        if (MATERIALS[t].category === MaterialCategory.Creature) {
          this.folkRetreat(x, y, i, facing, carry, fed);
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
      // Only haul upward if the climb actually leads somewhere: a real ledge
      // has to exist within reach, found by scanning the wall's own face for
      // where it stops — not by asking "does the wall still look tall enough
      // from here", which reads differently at every row of the climb and
      // bounces forever on any wall whose remaining height from partway up
      // didn't happen to clear a fixed lookahead (a one-row lookahead bounces
      // off any one-cell lip; a two-row one bounces off any two-or-three-cell
      // wall instead — the asymmetry is in re-deriving the answer fresh from
      // a *moving* vantage point, not in the window size). Scanning for the
      // wall's actual top is vantage-independent: it finds the same row
      // whether asked from the bottom or partway up, so the climb never
      // second-guesses itself mid-way. Bounded to a modest height — a wall
      // taller than that is a real climb the staircase system handles, not a
      // Pip scrambling up a ledge — and the row just below the top is
      // guaranteed solid by construction of the scan, so it's always a
      // genuine landing, not more open air past the top of a free-standing
      // wall with nowhere to put a foot.
      const MAX_HAUL = 24;
      const ledgeRow = (dx: number): number => {
        for (let d = 0; d <= MAX_HAUL; d++) {
          const wy = y - d;
          if (!this.isFolkWall(x + dx, wy)) return this.inBounds(x, wy) ? wy : -1;
        }
        return -1;
      };
      const canHaul = (wallAhead && ledgeRow(facing) >= 0) || (wallBehind && ledgeRow(-facing) >= 0);
      if (!idle && !nearWater && braced && !capped && canHaul) {
        if (aboveGhost) {
          // Hop clean over the ghosted run to the first open cell above it —
          // the same way folk drop through a house from above — rather than
          // trying to stand inside a wall cell's own slot.
          for (let d = 1; d <= 24; d++) {
            if (this.isGhost(x, y - d)) continue;
            const t = this.get(x, y - d);
            if (t === MaterialId.Empty) {
              this.stuckTicks[si] = 0;
              this.moveCreature(x, y, x, y - d, packCreature(facing, carry, fed));
              return;
            }
            // A fellow folk in the landing spot, not real ground — same
            // deadlock as the matching drop-through above (this is its
            // upward twin), and the same fix: trade places rather than
            // freeze here for good (see the long comment there — a shaft
            // this narrow can leave nowhere to retreat to, but a swap
            // always works).
            if (FOLK_IDS.includes(t as MaterialId)) {
              this.stuckTicks[si] = 0;
              this.swap(x, y, x, y - d);
              this.meta[this.index(x, y - d)] = packCreature(facing, carry, fed);
              return;
            }
            if (MATERIALS[t].category === MaterialCategory.Creature) {
              this.folkRetreat(x, y, i, facing, carry, fed);
              return;
            }
            break;
          }
        } else {
          this.stuckTicks[si] = 0;
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
          this.stuckTicks[si] = 0;
          this.moveCreature(x, y, x + away, y, packCreature(away, carry, fed));
          return;
        }
      }
      // Just topped out off the side of a wall it was climbing a row ago
      // (not braced any more at this row, but the row right below still had
      // wall beside it): that means firm footing sits right here (see
      // `ledgeRow` above — the row a climbed wall's face gives way at is
      // always solid one row down). Step onto it sideways instead of
      // free-falling straight back down the very face it climbed, which is
      // what used to hand the climb back to square one every time, forever.
      // Gated on having actually just climbed something (not idle, and wall
      // right below), so an ordinary Pip walking off a natural ledge or
      // cliff edge in open ground still just falls, same as always.
      const justToppedOut = this.isFolkWall(x + facing, y + 1) || this.isFolkWall(x - facing, y + 1);
      if (!idle && !nearWater && justToppedOut) {
        for (const side of [facing, -facing]) {
          if (this.inBounds(x + side, y) && this.get(x + side, y) === MaterialId.Empty && this.firmFooting(x + side, y)) {
            this.stuckTicks[si] = 0;
            this.moveCreature(x, y, x + side, y, packCreature(side, carry, fed));
            return;
          }
        }
      }
      // Falling back here with a real want and nothing to show for it:
      // count it. Past FOLK_STUCK_LIMIT of these in a row, give up on the
      // want outright — retreat clear of the spot and sit out the next
      // FOLK_GIVEUP_COOLDOWN real actions idle (see the check at the top of
      // this function) — rather than keep climbing and falling in place
      // forever. An idle folk was never "trying" in the first place, so
      // this never counts against one just ambling off a ledge.
      if (!idle && !nearWater) {
        const stuck = Math.min(255, this.stuckTicks[si] + 1);
        if (stuck >= FOLK_STUCK_LIMIT) {
          // Set the give-up sentinel *before* retreating — `folkRetreat`
          // moves the folk via the same swap that carries `stuckTicks`
          // along, so writing it here at the cell it's still standing on
          // lands it at wherever retreat actually puts it.
          this.stuckTicks[si] = FOLK_GIVEUP_ZONE + FOLK_GIVEUP_COOLDOWN;
          this.folkRetreat(x, y, i, facing, carry, fed);
          return;
        }
        this.stuckTicks[si] = stuck;
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
      // Just wait a beat, or drop back. `isBridgeDeck`, not `isDeck`: this
      // has to stay off actual bridge planks only — a staircase or house
      // floor underfoot is no reason to refuse climbing past a fellow folk,
      // and treating it as one is exactly what deadlocks a queue at a
      // staircase's foot forever.
      if (this.isBridgeDeck(x, y + 1) || this.countNear(x, y, MaterialId.Water, 4) > 0) {
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
      this.stuckTicks[si] = 0;
      this.moveCreature(x, y, fwd, y - 1, packCreature(facing, carry, fed));
      return;
    }
    // Straight up the face, no step forward yet — only worth it for a folk
    // with a real reason to be scaling this (the next tick's below-empty
    // check picks the climb back up, wall permitting). An idle folk taking
    // this same hop lands in open air over its own just-vacated footing with
    // no want to justify a further climb (idle never climbs there, by
    // design), so it always falls straight back next tick and repeats,
    // forever, in place. Idle just turns away instead, same as any other
    // dead end.
    if (!idle && (!nearWater || climbToLand) && this.inBounds(x, y - 1) && this.get(x, y - 1) === MaterialId.Empty && Math.random() < 0.9) {
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
    // Truly nothing left to try, no movement at all this turn: the same
    // give-up counter as the below-empty dead end above, for the same
    // reason — a folk with a real want and a genuinely blocked path
    // otherwise just flips facing here forever.
    if (!idle) {
      const stuck = Math.min(255, this.stuckTicks[si] + 1);
      if (stuck >= FOLK_STUCK_LIMIT) {
        this.stuckTicks[si] = FOLK_GIVEUP_ZONE + FOLK_GIVEUP_COOLDOWN;
        this.folkRetreat(x, y, i, facing, carry, fed);
        return;
      }
      this.stuckTicks[si] = stuck;
    }
    this.meta[i] = packCreature(-facing, carry, fed);
  }

  /**
   * Last resort for a folk with nowhere left to go (walls all round, no
   * headroom): shoulder into whichever neighbor — straight up first, then
   * ahead, then behind — is soft Powder (never real rock, metal, ice...)
   * and climb into the gap it leaves. Returns whether it dug through.
   */
  folkDigOut(x: number, y: number, i: number, facing: number, carry: number, fed: number): boolean {
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
  folkRetreat(x: number, y: number, i: number, facing: number, carry: number, fed: number): void {
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
  folkActNow(x: number, y: number): boolean {
    if ((this.tick + y) % FOLK_ACT_INTERVAL === 0) return true;
    return this.get(x, y) === MaterialId.Water ||
      (this.inBounds(x, y + 1) && this.get(x, y + 1) === MaterialId.Water);
  }

  /** Nearest horizontal direction (-1/1) to a dry standable shore at row y, or 0. */
  nearestShoreDir(x: number, y: number): number {
    for (let d = 1; d <= 40; d++) {
      for (const dir of [1, -1] as const) {
        const cx = x + dir * d;
        if (this.inBounds(cx, y) && this.get(cx, y) !== MaterialId.Water && this.firmFooting(cx, y)) return dir;
      }
    }
    return 0;
  }

  /** A solid a folk can brace against to climb (a wall/step, not a powder pile it'd just sink into, and not a house — houses are intangible to folk). */
  isFolkWall(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true; // the world edge is a wall to lean on
    if (this.isGhost(x, y)) return false; // houses, trees and open doors are intangible to folk
    return MATERIALS[this.get(x, y)].category === MaterialCategory.Solid;
  }

  /** Whether cell `i` is part of a house — a structural material carrying the house-wall meta bit. (The bit alone isn't enough: a ripe Trigo head's ripeness meta can happen to set it.) */
  isHouseCell(i: number): boolean {
    return (this.meta[i] & HOUSE_WALL_META) !== 0 && HOUSE_WALLS.includes(this.material[i] as MaterialId);
  }

  /** A house cell folk pass straight through — walls, roof, windows, chimney. The floor course, mason-laid bridge decks and staircase treads (HOUSE_FLOOR / HOUSE_DECK / HOUSE_STAIR) stay solid underfoot. */
  houseGhost(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    if (!this.isHouseCell(i)) return false;
    if ((this.meta[i] & HOUSE_ANCHOR_META) !== 0) return true; // the doorway-sill anchor is a wall
    const kind = this.meta[i] & HOUSE_KIND_MASK;
    return kind !== HOUSE_FLOOR && kind !== HOUSE_DECK && kind !== HOUSE_STAIR;
  }

  /**
   * A folk walking through a house that's in its path: skips over the run of
   * intangible house cells ahead and steps into the first open cell beyond
   * them (interior air or the far side). Won't surface into open water.
   * Returns whether it moved.
   */
  folkThroughHouse(x: number, y: number, facing: number, fed: number, carry: number): boolean {
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
  folkPhase(x: number, y: number, facing: number, fed: number, carry: number): boolean {
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
  takeCensus(): void {
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

  lumberjackCensus = 0;

  /** The Fazendeiro raises a celeiro once the field's big enough, about one per three farmers. */
  fieldWantsGranary(): boolean {
    return this.cropCensus >= 24 && this.granaryCensus < Math.max(1, Math.round(this.farmerCensus / 3));
  }
  /** The Lenhador raises a galpão once the woodlot's producing, about one per three foresters. */
  woodlotWantsShed(): boolean {
    return this.timberCensus >= 6 && this.woodshedCensus < Math.max(1, Math.round(this.lumberjackCensus / 3));
  }

  /** Position [ax, ay] of the nearest storehouse anchor of plan `type` within `range` of (x, y), or null. */
  nearestStore(x: number, y: number, type: number, range: number): [number, number] | null {
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
  raiseStoreRight(x: number, y: number, type: number): boolean {
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
  nearStore(x: number, y: number, r: number): boolean {
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
  harvestReady(i: number, ticks: number): boolean {
    const c = this.workCd[i];
    if (c === 0) { this.workCd[i] = ticks; return false; }
    if (c === 1) { this.workCd[i] = 0; return true; }
    this.workCd[i] = c - 1;
    return false;
  }

  /** Stack one cell of `material` into the lowest open spot inside the storehouse anchored at (ax, ay). Returns whether it fit. */
  stashInStore(ax: number, ay: number, type: number, material: MaterialId): boolean {
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
  villageWantsHouse(): boolean {
    return this.houseCensus < Math.max(1, this.folkCensus);
  }

  /** The farmers stop sowing once the field's big enough for the hands tending it. */
  fieldWantsMoreWheat(): boolean {
    return this.cropCensus < Math.max(1, this.farmerCensus) * WHEAT_PER_FARMER;
  }

  /** The masons only start a bridge once the Lenhador has worked up a woodpile to build it from. */
  villageHasTimber(): boolean {
    return this.timberCensus >= BRIDGE_TIMBER_MIN;
  }

  /** Take one cut Madeira cell (nearest, non-deck) off the map — a plank the Construtor just laid came from the woodpile. No-op if there's none in reach. */
  consumeTimber(x: number, y: number): void {
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

  stepMason(x: number, y: number, i: number): void {
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
      wantDir = this.folkScanForIds(x, y, WATER_ONLY, MASON_WATER_SEEK_RANGE);
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
    const onDeckNow = this.isBridgeDeck(x, y + 1);
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
          this.isBridgeDeck(px, layRow - 1) || this.isBridgeDeck(px, layRow + 1) ||
          !this.inBounds(px, stand) || this.get(px, stand) !== MaterialId.Empty
        ) {
          // Can't place a clean plank + step onto it from here — walk and retry.
          this.folkWalk(x, y, i, facing, fed, 0, d);
          return;
        }
        this.set(px, layRow, MaterialId.Wood, HOUSE_WALL_META | HOUSE_DECK);
        // Half price: only every other plank actually spends a log off the
        // woodpile (see bridgePlankFree) — a bridge costs half what it used to.
        this.bridgePlankFree = !this.bridgePlankFree;
        if (!this.bridgePlankFree) this.consumeTimber(x, y);
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

    // Staircases: same idea as a bridge, but climbing to a ledge instead of
    // spanning water — a permanent, built structure any Pip can walk (see
    // isDeck), not just something the one purposeful folk free-climbs past
    // (see folkWalk's wall-hauling) and leaves no trace of. Dead vertical —
    // a ladder straight up from wherever the Construtor happens to be
    // standing, never leaning sideways.
    const onStairNow = this.isStair(x, y + 1);
    if (this.villageHasTimber() && this.firmFooting(x, y) && (onStairNow || !this.stairNear(x, y, STAIR_NEAR_RANGE))) {
      const plan = this.stairScan(x, y);
      if (plan) {
        // The new rung takes the Construtor's own current cell — has to be
        // vacated first (climbing into the open headroom stairScan already
        // confirmed above it), or `set` below would just be overwriting the
        // Construtor standing there instead of laying a rung underfoot.
        const layRow = plan.layRow;
        const stand = layRow - 1;
        this.moveCreature(x, y, x, stand, packCreature(facing, 0, fed));
        this.set(x, layRow, MaterialId.Wood, HOUSE_WALL_META | HOUSE_STAIR);
        this.consumeTimber(x, stand); // full price — the half-off only applies to bridge planks, see bridgePlankFree
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
        // street — genuinely idle (wantDir 0, same as stepWarrior passing
        // `home`), not a purposeful walk. That matters: idle is what keeps
        // folkWalk's wall-hauling from firing at all, so a Construtor just
        // turns away from a wall, a fence, a tight little structure it
        // wanders into instead of trying to power through or climb it —
        // treating ordinary wandering as "a real want" (climbs short walls
        // in its way, doesn't back off) is exactly what let one get stuck
        // fighting a cramped hand-built nook it should have just walked
        // away from. Reaching genuinely distant, unclaimed ground is still
        // the staircase/bridge triggers' job — those run unconditionally,
        // idle or not, so a real cliff or crossing still gets built the
        // moment an idly-wandering Construtor happens across one.
        const home = this.folkHomeDir(x, y, MaterialId.Mason);
        this.folkWalk(x, y, i, facing, fed, 0, home);
        return;
      }
    }

    // Closing on a gap in a wall: walk the last steps solidly (carry === 3),
    // never phasing through the house — that would carry the mason clean past
    // the hole it's trying to mend.
    this.folkWalk(x, y, i, facing, fed, repair.near ? 3 : 0, wantDir);
  }


  /** From a folk standing on a bridge deck, the horizontal direction to its nearer end (where the planks meet dry ground). 0 if not on a deck. */
  offDeckDir(x: number, y: number): number {
    if (!this.isBridgeDeck(x, y + 1)) return 0;
    const reach = (dir: number): number => {
      let cx = x, r = y + 1;
      for (let k = 1; k <= 320; k++) {
        if (this.isBridgeDeck(cx + dir, r)) cx += dir;
        else if (this.isBridgeDeck(cx + dir, r + 1)) { cx += dir; r += 1; }
        else if (this.isBridgeDeck(cx + dir, r - 1)) { cx += dir; r -= 1; }
        else return k;
      }
      return 999;
    };
    return reach(1) <= reach(-1) ? 1 : -1;
  }

  /** Whether a bridge deck already runs within `r` cells of (x, y) — one crossing per stretch of water, so a crew doesn't lay deck after parallel deck. Checks `isBridgeDeck`, not the broader `isDeck` — an ordinary house or storehouse floor tile that happens to fall in range is not a bridge and must never veto a real crossing. */
  deckNear(x: number, y: number, r: number): boolean {
    for (let dy = -MASON_ARCH_MAX - 3; dy <= MASON_ARCH_MAX + 3; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < this.width && this.isBridgeDeck(nx, ny)) return true;
      }
    }
    return false;
  }

  /**
   * Something a folk can walk on like solid ground: Madeira flagged as
   * house-floor (a real house/storehouse floor course), an actual
   * mason-laid bridge plank (HOUSE_DECK), or a staircase tread (HOUSE_STAIR)
   * — all three are walkable, not a ghost, for the movement/pathing code
   * that just cares about standing on *something* firm, one row higher or
   * lower than the last (see the deck/stair-following branch of folkWalk,
   * which already handles either without knowing which it's on). `deckNear`
   * / `stairNear` need to tell them apart (see `isBridgeDeck` / `isStair`),
   * so they don't use this.
   */
  isDeck(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    if (this.material[i] !== MaterialId.Wood || (this.meta[i] & HOUSE_WALL_META) === 0) return false;
    const kind = this.meta[i] & HOUSE_KIND_MASK;
    return kind === HOUSE_FLOOR || kind === HOUSE_DECK || kind === HOUSE_STAIR;
  }

  /** Specifically a plank the Construtor laid while bridging water — unlike `isDeck`, an ordinary house or storehouse floor tile (or a staircase tread) never counts, so `deckNear` can't mistake one for a finished crossing. */
  isBridgeDeck(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    return this.material[i] === MaterialId.Wood &&
      (this.meta[i] & HOUSE_WALL_META) !== 0 && (this.meta[i] & HOUSE_KIND_MASK) === HOUSE_DECK;
  }

  /** Specifically a tread the Construtor laid while climbing to a ledge — unlike `isDeck`, an ordinary floor tile or bridge plank never counts, so `stairNear` can't mistake one for a finished climb. */
  isStair(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    return this.material[i] === MaterialId.Wood &&
      (this.meta[i] & HOUSE_WALL_META) !== 0 && (this.meta[i] & HOUSE_KIND_MASK) === HOUSE_STAIR;
  }

  /** Whether a staircase already climbs within `r` cells of (x, y) — one climb per ledge, same idea as `deckNear` for bridges. Checked well above (x, y) too, since a climb runs vertically, not sideways. */
  stairNear(x: number, y: number, r: number): boolean {
    for (let dy = -STAIR_MAX_RISE - 3; dy <= 3; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < this.width && this.isStair(nx, ny)) return true;
      }
    }
    return false;
  }

  /**
   * Survey a climb from a Construtor at (x, y) straight up — a ladder-style
   * staircase, dead vertical, never leaning sideways as it rises. Already
   * partway up one it (or another Construtor) started, it just keeps
   * extending it one rung at a time; not on one yet, it first looks straight
   * up this same column for solid, standable ground actually worth climbing
   * to (see `standTop`) — any ground counts, a house floor included (the
   * whole point is connecting whatever's up there to whatever's down here,
   * not just "real" terrain), and no ledge at all means no staircase
   * starts. Returns `{ layRow }` — `layRow` is always the Construtor's own
   * current row: the rung takes the cell it's standing in right now,
   * vacated by the very move that climbs it up into the open headroom
   * above (see the call site — placing the rung *before* moving would just
   * be overwriting the Construtor standing there) — or null: nothing worth
   * climbing, or the climb is capped (the headroom above is no longer
   * open, whether because the ledge itself starts there or something else
   * is blocking it).
   */
  stairScan(x: number, y: number): { layRow: number } | null {
    if (!this.isStair(x, y + 1)) {
      let foundLedge = false;
      for (let s = STAIR_MIN_RISE; s <= STAIR_MAX_RISE; s++) {
        const cy = y - s;
        if (!this.inBounds(x, cy)) break;
        const top = this.standTop(x, cy - 1, cy + 1);
        // standTop reports the first solid row with headroom, full stop —
        // it doesn't know a tree trunk or a house wall is meant to be
        // walked straight through, not landed on. Climbing all the way up
        // to one of those would just plant the Construtor's ladder against
        // a ghost with nothing real to actually stand on, a "staircase to
        // nowhere." isGhost is the same check folk movement itself uses to
        // decide what's actually solid underfoot, so a target this rejects
        // isn't a real ledge either.
        if (top >= 0 && !this.isGhost(x, top)) { foundLedge = true; break; }
      }
      if (!foundLedge) return null;
    }
    const stand = y - 1;
    if (!this.inBounds(x, stand) || this.get(x, stand) !== MaterialId.Empty) return null; // capped, or nowhere to go
    return { layRow: y };
  }

  /**
   * Solid, dry footing to stand on: the cell (x, y) itself isn't water, and
   * the cell right under it is dry non-liquid solid — real ground, or a deck
   * plank. A Construtor only ever lays a plank while it has this under it, so
   * a bridge always grows out from a bank, never from a body dropped in the
   * water.
   */
  firmFooting(x: number, y: number): boolean {
    if (!this.inBounds(x, y) || this.get(x, y) === MaterialId.Water) return false;
    const b = this.inBounds(x, y + 1) ? this.get(x, y + 1) : MaterialId.Stone;
    return b !== MaterialId.Empty && b !== MaterialId.Water && MATERIALS[b].category !== MaterialCategory.Liquid;
  }

  /** Row of the first solid, standable surface in a vertical window at column `cx` (lowest row number wins), or -1. "Standable" = firm non-liquid with clear headroom just above. */
  standTop(cx: number, from: number, to: number): number {
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
  bridgeScan(
    x: number, y: number, dir: number,
  ): { walk: number; layRow: number } | null {
    const onDeck = this.isBridgeDeck(x, y + 1);
    // Trace our deck back to its near anchor.
    let ax = x, aRow = y + 1;
    if (onDeck) {
      for (let k = 0; k < 300; k++) {
        if (this.isBridgeDeck(ax - dir, aRow)) ax -= dir;
        else if (this.isBridgeDeck(ax - dir, aRow + 1)) { ax -= dir; aRow += 1; }
        else if (this.isBridgeDeck(ax - dir, aRow - 1)) { ax -= dir; aRow -= 1; }
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
        if (c !== MaterialId.Empty && !this.isBridgeDeck(cx, r0 + k)) return;
      }
    };
    if (onDeck) {
      noteWater(lx, lRow + 1);
      for (let k = 0; k < 300; k++) {
        if (this.isBridgeDeck(lx + dir, lRow)) lx += dir;
        else if (this.isBridgeDeck(lx + dir, lRow + 1)) { lx += dir; lRow += 1; }
        else if (this.isBridgeDeck(lx + dir, lRow - 1)) { lx += dir; lRow -= 1; }
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
        if (c !== MaterialId.Empty && !this.isBridgeDeck(cx, lRow + k)) break;
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
  underHouse(x: number, y: number): boolean {
    for (let d = 1; d <= FOUNDATION_DEPTH + 2; d++) {
      if (!this.inBounds(x, y - d)) break;
      if (this.isHouseCell(this.index(x, y - d))) return true;
    }
    return false;
  }

  /** Whether (x, y) is inside a house's footprint — a wall/roof cell anywhere up to a tall house's height overhead. Farmers and foresters won't sow indoors. */
  roofedOver(x: number, y: number): boolean {
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
  raiseHouse(ax: number, ay: number, style: number, type: number): void {
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
  masonRepair(x: number, y: number): { patched: boolean; dir: number; busy: boolean; near: boolean } {
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
  masonSurvey(x: number, y: number): { style: number; type: number } | null {
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
  houseFootprintClear(ax: number, ay: number, type: number): boolean {
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
  gradeStrip(x: number, y: number, span: number): boolean {
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
  groundLevel(x: number, y: number, span: number): boolean {
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
  treeCrown(tx: number, ty: number): number {
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
  isTrunk(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.material[this.index(x, y)] === MaterialId.Wood &&
      (this.meta[this.index(x, y)] & TREE_TRUNK_META) !== 0;
  }

  /** The foot of the tree trunk/stem passing through (tx, ty) — walks on down through more trunk or its still-soft stem (Broto/Planta) to find where it actually roots. */
  treeBase(tx: number, ty: number): number {
    let by = ty;
    for (let d = 0; d < 10; d++) {
      const n = by + 1;
      if (this.isTrunk(tx, n) || this.get(tx, n) === MaterialId.Sprout || this.get(tx, n) === MaterialId.Plant) by = n;
      else break;
    }
    return by;
  }

  /** Whether the tree trunk/stem passing through (tx, ty) has filled out enough of a crown to be worth felling — a bare or half-grown sapling reports false, so a Lenhador never treats one as "a tree to work" and paces at its foot forever waiting on it. */
  isMatureTree(tx: number, ty: number): boolean {
    return this.treeCrown(tx, this.treeBase(tx, ty)) >= LUMBERJACK_MIN_TREE;
  }

  /** Whether (x, y) is a Porta currently powered open. */
  isOpenDoor(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.material[this.index(x, y)] === MaterialId.Door &&
      (this.meta[this.index(x, y)] & CIRCUIT_ON_META) !== 0;
  }

  /**
   * Whichever kind of "there, but not really" cell a folk simply walks
   * through: a house wall/roof, a living tree trunk, or a powered-open
   * Porta. Every obstacle check in folkWalk treats all three identically —
   * this is the one place that says so.
   */
  isGhost(x: number, y: number): boolean {
    return this.houseGhost(x, y) || this.isTrunk(x, y) || this.isOpenDoor(x, y);
  }

  /** Whether (x, y) touches a Fio or Alavanca directly. See systems/electricity.ts. */
  circuitConnected(x: number, y: number): boolean {
    return circuitConnectedImpl(this, x, y);
  }

  /** Shared by Bloco de Calor / Bloco de Frio: whether this tick's contribution should count. See systems/electricity.ts. */
  stepCircuitBlock(x: number, y: number, i: number, matId: MaterialId): boolean {
    return stepCircuitBlockImpl(this, x, y, i, matId);
  }

  /** Whether (x, y) is fed power this tick. See systems/electricity.ts. */
  circuitPowered(x: number, y: number): boolean {
    return circuitPoweredImpl(this, x, y);
  }

  /** Whether a live Eletricidade charge is sitting at (x, y) right now. See systems/electricity.ts. */
  pulseAt(x: number, y: number): boolean {
    return pulseAtImpl(this, x, y);
  }

  /** A Fio lights up the instant it touches power. See systems/electricity.ts. */
  stepWire(x: number, y: number, i: number): void {
    stepWireImpl(this, x, y, i);
  }

  /** A connected slab of Porta is one body — open the instant any cell of it is fed. See systems/electricity.ts. */
  doorPowered(x: number, y: number): boolean {
    return doorPoweredImpl(this, x, y);
  }

  /** Generic body-union power state for a connected clump of same-material cells. See systems/electricity.ts. */
  bodyCircuitState(x: number, y: number, matId: MaterialId, cache: Map<number, number>): { linked: boolean; active: boolean } {
    return bodyCircuitStateImpl(this, x, y, matId, cache);
  }

  /** A Porta goes intangible and lights a shade brighter while powered. See systems/electricity.ts. */
  stepDoor(x: number, y: number, i: number): void {
    stepDoorImpl(this, x, y, i);
  }


  /** Loose (cut, not trunk / not structural) Madeira within `r` of (x, y). */
  looseWoodNear(x: number, y: number, r: number): number {
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
  stepLumberjack(x: number, y: number, i: number): void {
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
        const by = this.treeBase(tx, ty);
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
      // A tended tree's crown is stamped in one shot once it's grown (see
      // stepSprout) and only ever lands cells actually on the grid — sown
      // too close to the left/right edge or the top, it comes out clipped
      // and permanently short of LUMBERJACK_MIN_TREE, a "tree" no Lenhador
      // can ever fell and the seed that grew it a dead loss.
      const hasRoom = f - TREE_CROWN_DX_MAX >= 0 && f + TREE_CROWN_DX_MAX < this.width &&
        y - (TREE_CROWN_START + TREE_CROWN_DY_MAX) >= 0;
      if (
        hasRoom &&
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

    // Head for the nearest fully-grown tree (a lignified trunk with a full
    // crown — isMatureTree, not just isTrunk) to fell. A still-growing
    // sapling already has trunk material, but heading for one and camping at
    // its foot doesn't make it grow any faster — it only reads as the
    // Lenhador stuck pacing the same seedling forever. With no tree actually
    // ready, folkWalk drifts it back to the woodlot (Madeira / houses) where
    // it plants and paces while the saplings fill out.
    let wantDir = 0;
    let bestD = Infinity;
    for (let dy = -FOLK_SCAN_RANGE; dy <= FOLK_SCAN_RANGE; dy++) {
      for (let dx = -FOLK_SCAN_RANGE; dx <= FOLK_SCAN_RANGE; dx++) {
        if (dx === 0 && dy === 0 || !this.isTrunk(x + dx, y + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD && this.isMatureTree(x + dx, y + dy)) { bestD = d; wantDir = Math.sign(dx) || (Math.random() < 0.5 ? 1 : -1); }
      }
    }
    this.folkWalk(x, y, i, facing, fed, 0, wantDir);
  }

  /** How many cells of material `id` sit within `r` of (x, y). */
  countNear(x: number, y: number, id: MaterialId, r: number): number {
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
  clearOfGrowth(x: number, y: number, r: number): boolean {
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
  stepFarmer(x: number, y: number, i: number): void {
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
  fleeSkeletonDir(x: number, y: number): number {
    const foe = this.nearestOf(x, y, SimGrid.SKELETON_ONLY, SKELETON_FLEE_RANGE);
    if (!foe) return 0;
    return foe[0] > 0 ? -1 : foe[0] < 0 ? 1 : (Math.random() < 0.5 ? 1 : -1);
  }

  /** Nearest cell of any id in `ids` within `range` of (x, y) — returns its [dx, dy] offset, or null. */
  nearestOf(x: number, y: number, ids: readonly MaterialId[], range: number): [number, number] | null {
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
  strike(i: number, dmg: number, fromX: number, fromY: number): boolean {
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
  strikeClock(i: number, readyToHit: boolean): boolean {
    if (this.workCd[i] > 0) { this.workCd[i]--; return false; }
    if (!readyToHit) return false;
    this.workCd[i] = ATTACK_PERIOD;
    return true;
  }

  static readonly SKELETON_ONLY: readonly MaterialId[] = [MaterialId.Skeleton];

  /**
   * Guerreiro: one of o povo, but it guards instead of building. It patrols
   * among the houses; the moment a Esqueleto comes within WARRIOR_SIGHT it
   * *charges* — it drops the unhurried folk pace and takes a step every tick
   * to close the distance — and trades blows (one point a strike, about once
   * a second). It carries 10 hit points to a working Pip's 5.
   */
  stepWarrior(x: number, y: number, i: number): void {
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
  stepSkeleton(x: number, y: number, i: number): void {
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
