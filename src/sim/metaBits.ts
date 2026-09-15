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
