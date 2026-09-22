import { MaterialId } from "./types";

/**
 * `meta`-byte bit layouts that both the simulation (grid.ts) and the
 * renderer (PixiStage.ts) need to agree on — kept here as the one shared
 * source of truth instead of each side declaring its own copy and trusting
 * a comment to keep them in sync. (House/bridge/staircase bits live in
 * houseBlueprints.ts instead, alongside the blueprint shapes they belong to.)
 */

/** Ripeness at which a Trigo head is harvestable / edible — see stepWheat. */
export const WHEAT_RIPE = 120;

/** Impacts (Shrapnel, Eletricidade) a Vidro cell absorbs as cracks before the next one finally shatters it into Areia — so a blast pits the surface it faces instead of shattering the whole pane in a single frame. */
export const GLASS_SHATTER_HITS = 3;

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
export const CIRCUIT_ON_META = 0x01;
/** Marks a stamped Alavanca cell as the knob rather than the housing frame — see LEVER_FRAME/LEVER_KNOB_* and PixiStage's Alavanca render, which shades the two apart so the fixture reads as an actual switch instead of a flat block. Independent of CIRCUIT_ON_META (bit 0). */
export const LEVER_ARM_META = 0x02;
/** Marks a Bloco de Calor/Frio as wired into a circuit at all (touching a Fio/Alavanca) — see `stepCircuitBlock`. Only meaningful together with CIRCUIT_ON_META: unset entirely, the block is standalone and always active (its original behavior, and how the renderer leaves it alone); set, the render dims it dark when CIRCUIT_ON_META is also clear and lights it when both bits are set. */
export const CIRCUIT_LINKED_META = 0x02;
/**
 * Clone's `meta` already means something else — the locked material id
 * (0 = not locked yet, the same value as MaterialId.Empty) — so it can't
 * share CIRCUIT_ON_META/CIRCUIT_LINKED_META's low bits the way Fio/Porta/
 * Bloco de Calor-Frio do without corrupting that lock (Areia is 1, Água is
 * 2 — the exact bit values in use). Every MaterialId fits comfortably under
 * 64, so the lock lives in the low 6 bits and the wired/on state moves up
 * to the top two, same meaning as CIRCUIT_LINKED_META/CIRCUIT_ON_META
 * elsewhere, just shifted clear of the material id.
 */
export const CLONE_LOCK_MASK = 0x3f;
export const CLONE_LINKED_META = 0x40;
export const CLONE_ON_META = 0x80;

/**
 * A mote of enchantment's starting lifespan (ticks), set by the brush — see
 * `stepMagic`.
 */
export const MAGIC_LIFE = 200;

/**
 * A Vírus cell's starting lifespan (ticks) — set by the brush, and reset to
 * full on every fresh cell an outbreak claims. The renderer fades a cell's
 * color as this counts down toward 0, same idea as Magia's shimmer. See
 * `stepVirus`.
 */
export const VIRUS_LIFE = 220;

/** A Fungus cell's `meta`: which of the 8 materials it actually took root in — 3 bits, an index into FUNGUS_HOSTS, set once when the cell is first claimed (see systems/fungus.ts) and never changed after. The renderer looks the index back up in FUNGUS_HOSTS to give each origin its own color/texture instead of one flat look for every infection. */
export const FUNGUS_ORIGIN_MASK = 0x7;
/** The 8 materials Fungus can take root in, in the fixed order FUNGUS_ORIGIN_MASK's index refers to — same "shared lookup array indexed by a packed meta code" idea as FAN_DIR_VECTORS. */
export const FUNGUS_HOSTS: readonly MaterialId[] = [
  MaterialId.Wood, MaterialId.Plant, MaterialId.Brick, MaterialId.Sand,
  MaterialId.Dirt, MaterialId.Mud, MaterialId.Stone, MaterialId.Gunpowder,
];

/**
 * A Cogumelo cell's `meta` packs two things into one byte: the same 3-bit
 * FUNGUS_ORIGIN_MASK index at the bottom (which host it grew from — same
 * lookup as a Fungus cell's own origin, so its color/shape matches the
 * mycelium it sprouted from) plus its remaining growth budget in the 5
 * bits above that — together they exactly fill the byte. Budget counts
 * down as the cap grows (see systems/fungus.ts stepMushroom, the same
 * "spend one unit per new cell" idea as a Broto's own growth budget); once
 * it hits 0 the cell is fully grown and, if it still has open air above it
 * (i.e. it's a real cap tip, not buried under more cap), eligible to start
 * puffing out Esporo motes.
 */
export const MUSHROOM_BUDGET_SHIFT = 3;
export const MUSHROOM_BUDGET_MASK = 0x1f;

/**
 * Set on a Fungus cell that came from infecting a Vírus cell (see
 * claimVirus in systems/fungus.ts) instead of one of the 8 ordinary
 * FUNGUS_HOSTS — bit 3, one above FUNGUS_ORIGIN_MASK's own 3 bits, so it
 * never collides with a real origin index. Marks the cell as the special
 * "fungo especial" variant for the renderer, distinct from an ordinary
 * infection even though it's the exact same MaterialId.
 */
export const FUNGUS_VIRUS_FLAG = 0x08;

/**
 * Set on a Fungus cell the first time it ever sprouts a Cogumelo seed above
 * it (see systems/fungus.ts stepFungus) — bit 4, clear of both
 * FUNGUS_ORIGIN_MASK and FUNGUS_VIRUS_FLAG below it. Without this, the same
 * mycelium cell keeps re-rolling FUNGUS_MUSHROOM_CHANCE forever, so felling
 * a mature Cogumelo just reopens the empty cell above that exact spot for
 * a brand new one to sprout right back — cutting one down never actually
 * shrinks the infestation for good. One sprout per cell, permanently,
 * means a felled cluster is a real, lasting reduction instead of a spot
 * that quietly regrows on its own. The mycelium can still seed fresh
 * mushrooms elsewhere as it spreads into new ground — this only stops the
 * *same* cell from ever doing it twice.
 */
export const FUNGUS_SPROUTED_FLAG = 0x10;

/**
 * A Ventilador's `meta` bits: unlike Fio/Porta/Bloco de Calor-Frio it needs
 * three things at once — which of 8 directions it blows (3 bits, an index
 * into FAN_DIR_VECTORS, set at paint time from SimGrid.fanDirection and
 * rotatable afterward for a whole connected clump with a right-click — see
 * `toggleFan`), whether that clump is wired into a circuit at all, and
 * whether it's currently on — so direction gets its own bits instead of
 * overlapping CIRCUIT_ON_META/CIRCUIT_LINKED_META the way Bloco de
 * Calor/Frio safely can (a block that's just always on has no separate
 * "which way" to track).
 */
export const FAN_DIR_MASK = 0x07;
/** The eight directions a Ventilador can face, N first then clockwise, indexed by FAN_DIR_MASK — see stepFan. */
export const FAN_DIR_VECTORS: readonly (readonly [number, number])[] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];
/** Set once the fan clump touches a Fio/Alavanca at all — see stepFan / fanBody. Same meaning as CIRCUIT_LINKED_META, just moved up past FAN_DIR_MASK's 3 bits. */
export const FAN_LINKED_META = 0x08;
/** Only meaningful once FAN_LINKED_META is set: whether the clump is currently powered. Same meaning as CIRCUIT_ON_META, moved up past FAN_DIR_MASK. */
export const FAN_ON_META = 0x10;

/** Set on a Cano cell while it's holding one stored unit of Líquido — see systems/drains.ts surveyPipeNetwork/advancePipeFlows. */
export const PIPE_FILLED_META = 0x80;
/** Only meaningful together with PIPE_FILLED_META: the stored Líquido's own MaterialId, packed into the rest of the byte. */
export const PIPE_LIQUID_MASK = 0x7f;
