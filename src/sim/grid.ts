import { MaterialCategory, MaterialId, type DragBlob } from "./types";
import { MATERIALS, SINGLE_DROP_MATERIALS } from "./materials";
import { NEUTRAL_TEMP, EXTREME_COLD, EXTREME_HOT, COLD_1, COLD_2, COLD_3 } from "./temperature";
import { rleEncode, rleDecode, SCHEMA_VERSION, type MapSnapshot } from "./storage";
import type { HousePlan } from "./houseBlueprints";
import { CIRCUIT_ON_META, LEVER_ARM_META, MAGIC_LIFE, FAN_DIR_MASK } from "./metaBits";
import { NEIGHBORS_8 } from "./neighbors";
import { stepLifeGeneration as stepLifeGenerationImpl } from "./systems/life";
import {
  randomEmptyNeighbor as randomEmptyNeighborImpl, antScentDir as antScentDirImpl,
  moveFish as moveFishImpl, stepAnt as stepAntImpl, birdPreyDir as birdPreyDirImpl,
  stepBird as stepBirdImpl, stepFish as stepFishImpl,
} from "./systems/wildlife";
import { CREATURE_FED_MAX, packCreature } from "./creatureMeta";
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
  stepLightningRod as stepLightningRodImpl, stepFan as stepFanImpl,
  advanceWindPuffs as advanceWindPuffsImpl, stepDefenseTower as stepDefenseTowerImpl,
} from "./systems/electronics";
import {
  stepFire as stepFireImpl, tryMoveFire as tryMoveFireImpl, igniteAt as igniteAtImpl,
  detonate as detonateImpl, applyBlastImpulse as applyBlastImpulseImpl,
  isFusableExplosive as isFusableExplosiveImpl, collectExplosivePocket as collectExplosivePocketImpl,
  canDetonate as canDetonateImpl, stepFuse as stepFuseImpl, floodFuseConnected as floodFuseConnectedImpl,
  spawnShrapnelBurst as spawnShrapnelBurstImpl, advanceShrapnel as advanceShrapnelImpl,
  shatterGlass as shatterGlassImpl, advanceDebris as advanceDebrisImpl, depositDebris as depositDebrisImpl,
  advanceFlashes as advanceFlashesImpl,
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
import {
  adjacentOf as adjacentOfImpl, folkScanForIds as folkScanForIdsImpl, folkHomeDir as folkHomeDirImpl,
  folkScanDir as folkScanDirImpl, folkUpkeep as folkUpkeepImpl, folkSheltered as folkShelteredImpl,
  folkWeather as folkWeatherImpl, folkCountIn as folkCountInImpl, folkWalk as folkWalkImpl,
  folkDigOut as folkDigOutImpl, folkRetreat as folkRetreatImpl, folkActNow as folkActNowImpl,
  nearestShoreDir as nearestShoreDirImpl, isFolkWall as isFolkWallImpl, isHouseCell as isHouseCellImpl,
  houseGhost as houseGhostImpl, folkThroughHouse as folkThroughHouseImpl, folkPhase as folkPhaseImpl,
} from "./folk/engine";
import {
  takeCensus as takeCensusImpl, fieldWantsGranary as fieldWantsGranaryImpl,
  woodlotWantsShed as woodlotWantsShedImpl, nearestStore as nearestStoreImpl,
  raiseStoreRight as raiseStoreRightImpl, nearStore as nearStoreImpl, harvestReady as harvestReadyImpl,
  stashInStore as stashInStoreImpl, villageWantsHouse as villageWantsHouseImpl,
  fieldWantsMoreWheat as fieldWantsMoreWheatImpl, villageHasTimber as villageHasTimberImpl,
  consumeTimber as consumeTimberImpl,
} from "./folk/village";
import {
  fleeSkeletonDir as fleeSkeletonDirImpl, nearestOf as nearestOfImpl, strike as strikeImpl,
  strikeClock as strikeClockImpl, stepWarrior as stepWarriorImpl, stepSkeleton as stepSkeletonImpl,
} from "./folk/combat";
import { stepFarmer as stepFarmerImpl } from "./folk/farmer";
import {
  looseWoodNear as looseWoodNearImpl, stepLumberjack as stepLumberjackImpl,
  countNear as countNearImpl, clearOfGrowth as clearOfGrowthImpl,
} from "./folk/lumberjack";
import {
  stepMason as stepMasonImpl, offDeckDir as offDeckDirImpl, deckNear as deckNearImpl,
  isDeck as isDeckImpl, isBridgeDeck as isBridgeDeckImpl, isStair as isStairImpl,
  stairNear as stairNearImpl, stairScan as stairScanImpl, firmFooting as firmFootingImpl,
  standTop as standTopImpl, bridgeScan as bridgeScanImpl, underHouse as underHouseImpl,
  roofedOver as roofedOverImpl, raiseHouse as raiseHouseImpl, masonRepair as masonRepairImpl,
  masonSurvey as masonSurveyImpl, houseFootprintClear as houseFootprintClearImpl,
  gradeStrip as gradeStripImpl, groundLevel as groundLevelImpl, treeCrown as treeCrownImpl,
  isTrunk as isTrunkImpl, treeBase as treeBaseImpl, isMatureTree as isMatureTreeImpl,
  isOpenDoor as isOpenDoorImpl, isGhost as isGhostImpl,
} from "./folk/houses";

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
// WHEAT_FURROW lives in folk/farmer.ts.
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
/** Fraction of an Eletricidade brush stroke that actually drops a charge — a big brush painting a filled area would otherwise spawn one pulse per cell it covers, dumping a huge simultaneous burst; thinning it out the same way Vida's stroke is thinned gives a lighter, more natural-looking spark shower instead. */
const ELECTRICITY_PAINT_DENSITY = 0.35;
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
// FOLK_HUNGER_INTERVAL / FOLK_DROWN_CHANCE / FOLK_EAT_CHANCE / FOLK_ACT_INTERVAL /
// FOLK_HOME_RANGE / FOLK_HOME_NEAR / MASON_HOME_NEAR / FOLK_HOME live in
// folk/engine.ts, alongside the shared walk/upkeep logic that uses them.

/** How many cells around itself each tradesman scans for its work (water, soil, trees, damaged houses, build sites). Staggered per-column so they don't all scan the same frame. */
export const FOLK_SCAN_RANGE = 28;

// LUMBERJACK_SOW_CHANCE / LUMBERJACK_SPACING / LUMBERJACK_PLOT /
// LUMBERJACK_LOG_YIELD / LUMBERJACK_STOCK live in folk/lumberjack.ts.
/** How much crown (Broto/Planta/Flor cells around the base) a tree needs before a Lenhador will fell it — a fully stamped crown is ~17 cells, so this only clears once the tree has finished growing, never a sapling or a half-grown one. Exported: houses.ts's isMatureTree needs this too. */
export const LUMBERJACK_MIN_TREE = 12;

// FARMER_WORK_CHANCE lives in folk/farmer.ts.
/** Act-turns a Fazendeiro / Lenhador spends stood working a harvest before it comes in — harvesting isn't instant. */
export const HARVEST_WORK = 5;
/** How far a Fazendeiro / Lenhador looks for its storehouse to stash a load into. */
export const STORE_REACH = 30;

/** Hit points a fresh unit spawns with, by kind. Working folk are frail; the Guerreiro is built to last; a Esqueleto is somewhere between. */
const SPAWN_HP: Partial<Record<MaterialId, number>> = {
  [MaterialId.Mason]: 5,
  [MaterialId.Lumberjack]: 5,
  [MaterialId.Farmer]: 5,
  [MaterialId.Warrior]: 10,
  [MaterialId.Skeleton]: 5,
};
/** `hp` byte: low 7 bits are the points, the top bit flags a unit empowered by Magia (twice the damage, twice the size). */
export const HP_POINTS_MASK = 0x7f;
export const HP_EMPOWERED = 0x80;
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
/** A Torre de defesa's fixed footprint — a small crenellated turret, three wide and six tall (17 cells, several times the size of the old plain block), reading as an actual tower silhouette rather than a flat square. The gap in the top row is the crenellation notch. See `dropDefenseTower`. */
const DEFENSE_TOWER_SHAPE: readonly [number, number][] = [
  [0, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
  [0, 2], [1, 2], [2, 2],
  [0, 3], [1, 3], [2, 3],
  [0, 4], [1, 4], [2, 4],
  [0, 5], [1, 5], [2, 5],
];
/** Cap on how many connected Alavanca cells one toggleLever flip visits — a perf budget, well past the size of any lever fixture actually placed. */
const LEVER_FLOOD_CAP = 64;
/** Cap on how many connected Ventilador cells one toggleFan flip visits — a perf budget, well past any fan a player would actually paint. */
const FAN_TOGGLE_FLOOD_CAP = 20000;

/** The four trades of o povo (the Guerreiro included — it's one of the folk, it just fights instead of building). */
export const FOLK_IDS: readonly MaterialId[] = [
  MaterialId.Mason, MaterialId.Lumberjack, MaterialId.Farmer, MaterialId.Warrior,
];
// PIP_IDS lives in folk/combat.ts.
export const WATER_ONLY = [MaterialId.Water] as const;
/** Standing growth a folk walks straight through instead of climbing or snagging on — crops and plant matter. */
export const FOLK_WADEABLE = new Set<MaterialId>([
  MaterialId.Wheat, MaterialId.Plant, MaterialId.Sprout, MaterialId.Flor, MaterialId.Seed,
]);
// FARMER_CROPS / DRY_SOIL live in folk/farmer.ts.
/** Below this fed level a folk with no urgent task heads for the nearest wheat. */
export const FOLK_FORAGE_HUNGER = 14;
// FOLK_STARVING / FOLK_FORAGE_RANGE / FOLK_FORAGE live in folk/engine.ts.

// House/bridge/staircase blueprint data (shapes, bit layout) lives in
// houseBlueprints.ts — pure data, shared by grid.ts and PixiStage's renderer.

// HOUSE_SURVEY_RANGE / MASON_REPAIR_RANGE / MASON_REPAIR_CHANCE / MASON_BRIDGE_MAX /
// MASON_APPROACH_MAX / MASON_ARCH_MAX / MASON_SPAN_DROP / STAIR_MIN_RISE /
// STAIR_MAX_RISE / STAIR_NEAR_RANGE / MASON_WATER_SEEK_RANGE / FOUNDATION_DEPTH /
// LEVEL_MAX_STEP live in folk/houses.ts.
export const HOUSE_SPACING = 17;
// HOUSE_SHELTER_RANGE lives in folk/engine.ts.
/** Per-check chance a Construtor on a good, empty, house-free patch raises a house (the whole frame at once). High enough that it commits within a few turns of settling on a site, rather than standing frozen on it. */
export const MASON_FOUND_CHANCE = 0.22;
/** How often (ticks) the rolling village census is refreshed. */
const CENSUS_INTERVAL = 90;
/** Ceiling on standing Trigo per Fazendeiro — a field sized to its keepers, not a runaway prairie. */
export const WHEAT_PER_FARMER = 70;
// FOLK_PHASE_REACH / FOLK_WANDER_TURN / FOLK_STUCK_LIMIT / FOLK_GIVEUP_ZONE /
// FOLK_GIVEUP_COOLDOWN / FOLK_COMFORT_MIN / FOLK_COMFORT_MAX /
// FOLK_EXPOSURE_PER_DEGREE / FOLK_EXPOSURE_CAP live in folk/engine.ts.

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
  /** Set for one tick by stepLightningRod right after it moves this charge toward a rod. advancePulses checks it so a pulled charge isn't ALSO given its normal random free-fall step in the same tick — running both at once fought each other (gravity yanking it back down right after the rod pulled it sideways or up) and made the pull look like a jittery bounce instead of one smooth, deliberate motion. */
  rodPulled?: boolean;
  /** The specific rod cell this charge locked onto the first tick it came into a Para-raio's range — picked once, at random, from every rod cell within reach, and kept until grounded (see stepLightningRod). Without a persistent per-charge target, distance to the shape's actual nearest cell always resolves to the same single point (its closest edge) for any charge approaching from roughly the same direction, so a whole falling burst would funnel into one exact spot and visibly queue up there instead of spreading across the rod the way something actually being drawn toward a large object would. */
  rodTargetX?: number;
  rodTargetY?: number;
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
 * A single drifting mote of a Ventilador's draft — purely decorative, like
 * Shrapnel, so the wind itself reads on screen even where it has nothing to
 * actually push (open air, or a stretch with no Gás/Fogo in its path). Never
 * written into the material grid, real float position and constant
 * velocity, fades out as `life` runs down. See systems/electronics.ts
 * stepFan / advanceWindPuffs.
 */
export interface WindPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  /** The spawning fan body's leaderIndex — lets stepFan count how many motes THIS body already has in flight, so several fans (a tiny one and a huge one, say) each get to fill their own share of the population instead of competing for one shared pool, where a small fan's fast-turnover motes could crowd out a big one's slower, longer-lived ones. */
  owner: number;
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
  /** Drifting motes of a Ventilador's draft, purely decorative — see `WindPuff`. */
  windPuffs: WindPuff[] = [];
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
  /** This tick's linked/active/size verdict for every connected clump of Ventilador — see fanBody in systems/electronics.ts. Cleared at the top of every `step()`. */
  fanCache = new Map<number, { linked: boolean; active: boolean; size: number; leaderIndex: number; cells: readonly (readonly [number, number])[]; gust: number }>();
  /** This tick's powered verdict for every connected clump of Torre de defesa — a clump is one body, active if *any* cell of it is individually fed, same idea as doorCache but never "runs standalone" the way a Bloco de Calor/Frio can. Cleared at the top of every `step()`. */
  towerCache = new Map<number, boolean>();
  /** This tick's shape (size, leader cell, bounding box) for every connected clump of Para-raio — see rodBody in systems/electronics.ts: more mass pulls in a charge from further out, and only the clump's leader cell actually performs the pull. Cleared at the top of every `step()`. */
  rodCache = new Map<number, { size: number; leaderIndex: number; cells: readonly (readonly [number, number])[]; minX: number; maxX: number; minY: number; maxY: number }>();
  /** Direction newly-painted Ventilador cells face (an index into FAN_DIR_VECTORS, 0-7), chosen from the brush before placing — see BottomPanel's direction picker and `metaFor`. Right-click still rotates a whole placed clump afterward (see `toggleFan`). */
  fanDirection = 2;
  tick = 0;
  /** Rolling census (refreshed every CENSUS_INTERVAL ticks) the trades use to cap themselves: houses to the head count, crops to the farmer count. */
  houseCensus = 0;
  folkCensus = 0;
  cropCensus = 0;
  farmerCensus = 0;
  timberCensus = 0;
  granaryCensus = 0;
  woodshedCensus = 0;
  lumberjackCensus = 0;
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
    this.windPuffs = [];
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

  /** Read-only positions (plus fade state) of a Ventilador's drifting wind motes, for the renderer to overlay. */
  get activeWindPuffs(): readonly { x: number; y: number; life: number; maxLife: number }[] {
    return this.windPuffs;
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
    if (id === MaterialId.Fan) return this.fanDirection & FAN_DIR_MASK;
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
  /**
   * Same as `paintCell`, but thins out Eletricidade first — used by the
   * multi-cell brush strokes (`paint`, `paintRect`), where painting solid
   * would drop one pulse per cell the stroke covers, dumping a huge
   * simultaneous burst from a single brush dab. `paintCell` itself stays
   * fully deterministic (always drops exactly the cell it's given) since
   * plenty of callers — every regression script that sets up a single
   * charge for a test, `paintLine`'s point-by-point walk via `paint` aside
   * — rely on one call reliably placing one charge.
   */
  private paintCellForStroke(x: number, y: number, id: MaterialId): void {
    if (id === MaterialId.Electricity && Math.random() >= ELECTRICITY_PAINT_DENSITY) return;
    this.paintCell(x, y, id);
  }

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
        this.paintCellForStroke(cx + dx, cy + dy, id);
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
    if (id === MaterialId.DefenseTower) { this.dropDefenseTower(cx, cy); return; }
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

  /** Stamps DEFENSE_TOWER_SHAPE — a small crenellated turret — anchored at or near (cx, cy), at the nearest spot within two steps whose whole footprint is clear. */
  dropDefenseTower(cx: number, cy: number): void {
    for (let r = 0; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const ax = cx + dx, ay = cy + dy;
          let clear = true;
          for (const [ox, oy] of DEFENSE_TOWER_SHAPE) {
            if (!this.inBounds(ax + ox, ay + oy) || this.get(ax + ox, ay + oy) !== MaterialId.Empty) { clear = false; break; }
          }
          if (!clear) continue;
          for (const [ox, oy] of DEFENSE_TOWER_SHAPE) this.set(ax + ox, ay + oy, MaterialId.DefenseTower, 0);
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
        this.paintCellForStroke(x, y, id);
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

  /**
   * Right-click on (or near) a Ventilador rotates which way it blows 45°
   * clockwise (see FAN_DIR_VECTORS) — eight clicks cycle all the way
   * around. Like toggleLever, nudges to the nearest Ventilador within 2
   * cells if the click didn't land exactly on one. Returns whether it
   * actually found and rotated one.
   */
  toggleFan(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.get(x, y) !== MaterialId.Fan) {
      let nx0 = -1, ny0 = -1;
      outer: for (let r = 1; r <= 2; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const cx = x + dx, cy = y + dy;
            if (this.inBounds(cx, cy) && this.get(cx, cy) === MaterialId.Fan) { nx0 = cx; ny0 = cy; break outer; }
          }
        }
      }
      if (nx0 < 0) return false;
      x = nx0; y = ny0;
    }
    // A connected clump of Ventilador is one fixture (see fanBody) — flip
    // the whole thing together, not just the one cell that got clicked.
    const startI = this.index(x, y);
    const visited = new Set<number>([startI]);
    const stack = [startI];
    let budget = FAN_TOGGLE_FLOOD_CAP;
    while (stack.length > 0 && budget-- > 0) {
      const i = stack.pop()!;
      const cx = i % this.width, cy = (i / this.width) | 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny)) continue;
        const j = this.index(nx, ny);
        if (this.material[j] !== MaterialId.Fan || visited.has(j)) continue;
        visited.add(j);
        stack.push(j);
      }
    }
    for (const i of visited) {
      const dir = ((this.meta[i] & FAN_DIR_MASK) + 1) & 7;
      this.meta[i] = (this.meta[i] & ~FAN_DIR_MASK) | dir;
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
    if (this.fanCache.size > 0) this.fanCache.clear();
    if (this.towerCache.size > 0) this.towerCache.clear();
    if (this.rodCache.size > 0) this.rodCache.clear();
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
        else if (id === MaterialId.LightningRod) this.stepLightningRod(x, y, i);
        else if (id === MaterialId.Fan) this.stepFan(x, y, i);
        else if (id === MaterialId.DefenseTower) this.stepDefenseTower(x, y, i);

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
    this.advanceWindPuffs();
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

  /** Collects the 8-neighbours of (x, y) whose material is in `ids`. See folk/engine.ts. */
  adjacentOf(x: number, y: number, ids: readonly MaterialId[]): [number, number][] {
    return adjacentOfImpl(this, x, y, ids);
  }

  /** Horizontal step toward the nearest cell in `ids` within `range`. See folk/engine.ts. */
  folkScanForIds(x: number, y: number, ids: readonly MaterialId[], range: number): number {
    return folkScanForIdsImpl(this, x, y, ids, range);
  }

  /** A horizontal step back toward the village for an idle Pip. See folk/engine.ts. */
  folkHomeDir(x: number, y: number, trade: MaterialId): number {
    return folkHomeDirImpl(this, x, y, trade);
  }

  /** folkScanForIds at the default FOLK_SCAN_RANGE. See folk/engine.ts. */
  folkScanDir(x: number, y: number, ids: readonly MaterialId[]): number {
    return folkScanDirImpl(this, x, y, ids);
  }

  /** Shared lethal-environment + feeding + hunger pass for o povo. See folk/engine.ts. */
  folkUpkeep(x: number, y: number, fed: number): number {
    return folkUpkeepImpl(this, x, y, fed);
  }

  /** Whether (x, y) is under a roof with a wall to each side. See folk/engine.ts. */
  folkSheltered(x: number, y: number): boolean {
    return folkShelteredImpl(this, x, y);
  }

  /** The whole weather response for a member of o povo. See folk/engine.ts. */
  folkWeather(x: number, y: number, i: number, facing: number, fed: number, carry: number): boolean {
    return folkWeatherImpl(this, x, y, i, facing, fed, carry);
  }

  /** How many folk are standing within a house's footprint. See folk/engine.ts. */
  folkCountIn(ax: number, ay: number, plan: HousePlan): number {
    return folkCountInImpl(this, ax, ay, plan);
  }

  /** Shared surface walk for o povo: climbs, squeezes, wades, wanders. See folk/engine.ts. */
  folkWalk(
    x: number, y: number, i: number,
    facing: number, fed: number, carry: number, wantDir: number,
  ): void {
    folkWalkImpl(this, x, y, i, facing, fed, carry, wantDir);
  }

  /** Last resort: digs through soft Powder when truly boxed in. See folk/engine.ts. */
  folkDigOut(x: number, y: number, i: number, facing: number, carry: number, fed: number): boolean {
    return folkDigOutImpl(this, x, y, i, facing, carry, fed);
  }

  /** A folk backed against water it can't cross turns and steps back. See folk/engine.ts. */
  folkRetreat(x: number, y: number, i: number, facing: number, carry: number, fed: number): void {
    folkRetreatImpl(this, x, y, i, facing, carry, fed);
  }

  /** Whether a Pip takes its turn this tick. See folk/engine.ts. */
  folkActNow(x: number, y: number): boolean {
    return folkActNowImpl(this, x, y);
  }

  /** Nearest horizontal direction to a dry standable shore at row y. See folk/engine.ts. */
  nearestShoreDir(x: number, y: number): number {
    return nearestShoreDirImpl(this, x, y);
  }

  /** A solid a folk can brace against to climb. See folk/engine.ts. */
  isFolkWall(x: number, y: number): boolean {
    return isFolkWallImpl(this, x, y);
  }

  /** Whether cell `i` is part of a house. See folk/engine.ts. */
  isHouseCell(i: number): boolean {
    return isHouseCellImpl(this, i);
  }

  /** A house cell folk pass straight through. See folk/engine.ts. */
  houseGhost(x: number, y: number): boolean {
    return houseGhostImpl(this, x, y);
  }

  /** A folk walking through a house in its path skips the intangible run. See folk/engine.ts. */
  folkThroughHouse(x: number, y: number, facing: number, fed: number, carry: number): boolean {
    return folkThroughHouseImpl(this, x, y, facing, fed, carry);
  }

  /** A blocked folk ducks straight through a thin barrier. See folk/engine.ts. */
  folkPhase(x: number, y: number, facing: number, fed: number, carry: number): boolean {
    return folkPhaseImpl(this, x, y, facing, fed, carry);
  }


  /** Refresh the rolling census the trades throttle themselves against. See folk/village.ts. */
  takeCensus(): void {
    takeCensusImpl(this);
  }

  /** The Fazendeiro raises a celeiro once the field's big enough. See folk/village.ts. */
  fieldWantsGranary(): boolean {
    return fieldWantsGranaryImpl(this);
  }

  /** The Lenhador raises a galpão once the woodlot's producing. See folk/village.ts. */
  woodlotWantsShed(): boolean {
    return woodlotWantsShedImpl(this);
  }

  /** Position of the nearest storehouse anchor of plan `type` within `range`, or null. See folk/village.ts. */
  nearestStore(x: number, y: number, type: number, range: number): [number, number] | null {
    return nearestStoreImpl(this, x, y, type, range);
  }

  /** A Fazendeiro / Lenhador raising its storehouse just right of (x, y). See folk/village.ts. */
  raiseStoreRight(x: number, y: number, type: number): boolean {
    return raiseStoreRightImpl(this, x, y, type);
  }

  /** Whether any structure anchor sits within `r` of (x, y). See folk/village.ts. */
  nearStore(x: number, y: number, r: number): boolean {
    return nearStoreImpl(this, x, y, r);
  }

  /** A slow job (harvest, fell) worked over `ticks` of turns. See folk/village.ts. */
  harvestReady(i: number, ticks: number): boolean {
    return harvestReadyImpl(this, i, ticks);
  }

  /** Stack one cell of `material` into the lowest open spot of a storehouse. See folk/village.ts. */
  stashInStore(ax: number, ay: number, type: number, material: MaterialId): boolean {
    return stashInStoreImpl(this, ax, ay, type, material);
  }

  /** The masons stop founding once there's a house per Pip. See folk/village.ts. */
  villageWantsHouse(): boolean {
    return villageWantsHouseImpl(this);
  }

  /** The farmers stop sowing once the field's big enough. See folk/village.ts. */
  fieldWantsMoreWheat(): boolean {
    return fieldWantsMoreWheatImpl(this);
  }

  /** The masons only start a bridge once there's a woodpile to build from. See folk/village.ts. */
  villageHasTimber(): boolean {
    return villageHasTimberImpl(this);
  }

  /** Take one cut Madeira cell off the map for a plank just laid. See folk/village.ts. */
  consumeTimber(x: number, y: number): void {
    consumeTimberImpl(this, x, y);
  }

  /** Construtor: repairs, bridges, builds stairs, founds houses. See folk/houses.ts. */
  stepMason(x: number, y: number, i: number): void {
    stepMasonImpl(this, x, y, i);
  }

  /** From a folk on a bridge deck, the direction to its nearer end. See folk/houses.ts. */
  offDeckDir(x: number, y: number): number {
    return offDeckDirImpl(this, x, y);
  }

  /** Whether a bridge deck already runs within `r` cells of (x, y). See folk/houses.ts. */
  deckNear(x: number, y: number, r: number): boolean {
    return deckNearImpl(this, x, y, r);
  }

  /** A house floor, bridge plank, or staircase tread — all walkable, not a ghost. See folk/houses.ts. */
  isDeck(x: number, y: number): boolean {
    return isDeckImpl(this, x, y);
  }

  /** Specifically a plank the Construtor laid while bridging water. See folk/houses.ts. */
  isBridgeDeck(x: number, y: number): boolean {
    return isBridgeDeckImpl(this, x, y);
  }

  /** Specifically a tread the Construtor laid while climbing to a ledge. See folk/houses.ts. */
  isStair(x: number, y: number): boolean {
    return isStairImpl(this, x, y);
  }

  /** Whether a staircase already climbs within `r` cells of (x, y). See folk/houses.ts. */
  stairNear(x: number, y: number, r: number): boolean {
    return stairNearImpl(this, x, y, r);
  }

  /** Survey a vertical climb from a Construtor, extending or starting a staircase. See folk/houses.ts. */
  stairScan(x: number, y: number): { layRow: number } | null {
    return stairScanImpl(this, x, y);
  }

  /** Solid, dry footing to stand on. See folk/houses.ts. */
  firmFooting(x: number, y: number): boolean {
    return firmFootingImpl(this, x, y);
  }

  /** Row of the first solid, standable surface in a vertical window. See folk/houses.ts. */
  standTop(cx: number, from: number, to: number): number {
    return standTopImpl(this, cx, from, to);
  }

  /** Survey a bridge crossing from a Construtor heading `dir`. See folk/houses.ts. */
  bridgeScan(x: number, y: number, dir: number): { walk: number; layRow: number } | null {
    return bridgeScanImpl(this, x, y, dir);
  }

  /** Whether (x, y) has a house cell close overhead. See folk/houses.ts. */
  underHouse(x: number, y: number): boolean {
    return underHouseImpl(this, x, y);
  }

  /** Whether (x, y) is inside a house's footprint. See folk/houses.ts. */
  roofedOver(x: number, y: number): boolean {
    return roofedOverImpl(this, x, y);
  }

  /** Stamps a whole house of plan `type` in one go. See folk/houses.ts. */
  raiseHouse(ax: number, ay: number, style: number, type: number): void {
    raiseHouseImpl(this, ax, ay, style, type);
  }

  /** A carrying mason tending nearby houses for damage. See folk/houses.ts. */
  masonRepair(x: number, y: number): { patched: boolean; dir: number; busy: boolean; near: boolean } {
    return masonRepairImpl(this, x, y);
  }

  /** Sizes up the ground just right of the mason for a new house. See folk/houses.ts. */
  masonSurvey(x: number, y: number): { style: number; type: number } | null {
    return masonSurveyImpl(this, x, y);
  }

  /** Whether the lot for a house of plan `type` is ready to build on. See folk/houses.ts. */
  houseFootprintClear(ax: number, ay: number, type: number): boolean {
    return houseFootprintClearImpl(this, ax, ay, type);
  }

  /** A Pip grading the ground just ahead level before it builds or sows. See folk/houses.ts. */
  gradeStrip(x: number, y: number, span: number): boolean {
    return gradeStripImpl(this, x, y, span);
  }

  /** Whether a level furrow of `span+1` cells sits just right of (x, y). See folk/houses.ts. */
  groundLevel(x: number, y: number, span: number): boolean {
    return groundLevelImpl(this, x, y, span);
  }

  /** How much crown a tree rooted near (tx, ty) carries. See folk/houses.ts. */
  treeCrown(tx: number, ty: number): number {
    return treeCrownImpl(this, tx, ty);
  }

  /** Whether (x, y) is a living tree trunk cell. See folk/houses.ts. */
  isTrunk(x: number, y: number): boolean {
    return isTrunkImpl(this, x, y);
  }

  /** The foot of the tree trunk/stem passing through (tx, ty). See folk/houses.ts. */
  treeBase(tx: number, ty: number): number {
    return treeBaseImpl(this, tx, ty);
  }

  /** Whether the tree at (tx, ty) has filled out enough of a crown to fell. See folk/houses.ts. */
  isMatureTree(tx: number, ty: number): boolean {
    return isMatureTreeImpl(this, tx, ty);
  }

  /** Whether (x, y) is a Porta currently powered open. See folk/houses.ts. */
  isOpenDoor(x: number, y: number): boolean {
    return isOpenDoorImpl(this, x, y);
  }

  /** A house wall/roof, a living tree trunk, or a powered-open Porta — folk pass straight through. See folk/houses.ts. */
  isGhost(x: number, y: number): boolean {
    return isGhostImpl(this, x, y);
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

  /** Pulls in any free-falling Eletricidade charge within range and grounds it. See systems/electronics.ts. */
  stepLightningRod(x: number, y: number, i: number): void {
    stepLightningRodImpl(this, x, y, i);
  }

  /** Blows Gás/Vapor/Fogo along its facing direction, with a visible trail of wind motes. See systems/electronics.ts. */
  stepFan(x: number, y: number, i: number): void {
    stepFanImpl(this, x, y, i);
  }

  /** Advances every drifting wind mote one tick. See systems/electronics.ts. */
  advanceWindPuffs(): void {
    advanceWindPuffsImpl(this);
  }

  /** While powered, spots and shoots the nearest Esqueleto within range. See systems/electronics.ts. */
  stepDefenseTower(x: number, y: number, i: number): void {
    stepDefenseTowerImpl(this, x, y, i);
  }


  /** Loose (cut, not trunk / not structural) Madeira within `r` of (x, y). See folk/lumberjack.ts. */
  looseWoodNear(x: number, y: number, r: number): number {
    return looseWoodNearImpl(this, x, y, r);
  }

  /** Lenhador: sows, tends and fells trees, stocking the woodpile. See folk/lumberjack.ts. */
  stepLumberjack(x: number, y: number, i: number): void {
    stepLumberjackImpl(this, x, y, i);
  }

  /** How many cells of material `id` sit within `r` of (x, y). See folk/lumberjack.ts. */
  countNear(x: number, y: number, id: MaterialId, r: number): number {
    return countNearImpl(this, x, y, id, r);
  }

  /** Whether a square of `r` around (x, y) is free of growing things and cut timber. See folk/lumberjack.ts. */
  clearOfGrowth(x: number, y: number, r: number): boolean {
    return clearOfGrowthImpl(this, x, y, r);
  }

  stepFarmer(x: number, y: number, i: number): void {
    stepFarmerImpl(this, x, y, i);
  }


  /** A working Pip that sees a Esqueleto close by drops what it's doing and backs off. See folk/combat.ts. */
  fleeSkeletonDir(x: number, y: number): number {
    return fleeSkeletonDirImpl(this, x, y);
  }

  /** Nearest cell of any id in `ids` within `range` of (x, y). See folk/combat.ts. */
  nearestOf(x: number, y: number, ids: readonly MaterialId[], range: number): [number, number] | null {
    return nearestOfImpl(this, x, y, ids, range);
  }

  /** Land `dmg` on whatever unit is at cell `i`. See folk/combat.ts. */
  strike(i: number, dmg: number, fromX: number, fromY: number): boolean {
    return strikeImpl(this, i, dmg, fromX, fromY);
  }

  /** The attack clock for the fighter at cell `i`. See folk/combat.ts. */
  strikeClock(i: number, readyToHit: boolean): boolean {
    return strikeClockImpl(this, i, readyToHit);
  }

  /** Guerreiro: guards the village, charges and fights any Esqueleto it spots. See folk/combat.ts. */
  stepWarrior(x: number, y: number, i: number): void {
    stepWarriorImpl(this, x, y, i);
  }

  /** Esqueleto: a slow undead that hunts and strikes o povo. See folk/combat.ts. */
  stepSkeleton(x: number, y: number, i: number): void {
    stepSkeletonImpl(this, x, y, i);
  }
}
