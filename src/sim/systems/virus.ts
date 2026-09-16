import type { SimGrid } from "../grid";
import { FLASH_LIFE } from "../grid";
import { VIRUS_LIFE } from "../metaBits";
import { MaterialId } from "../types";
import { NEIGHBORS_8 } from "../neighbors";

/*
 * ── Vírus ────────────────────────────────────────────────────────────────
 * A stationary infection: unlike Magia (a mote that wanders), a Vírus cell
 * sits exactly where it lands and, tick by tick, rolls a per-neighbor
 * chance against each of its 8 neighbors in turn — the same shape Fogo's
 * own spread already uses (see stepFire's ignitionChance loop). A claimed
 * cell is consumed outright and becomes more Vírus, in whichever of the two
 * rival colors (see `MaterialId.VirusPink`) did the claiming. Living things
 * (plant matter, animals, o povo) go fast — that's the actual "plague"
 * part. Everything else — Sólido, Líquido, Gás, componentes elétricos,
 * cano, torneira, portão, literally anything with a body — can still be
 * claimed, just at a crawl; Vidro is the one true exception, immune
 * outright. Each cell also fades on its own, so a dead-end infection with
 * nothing left to claim burns out instead of lingering forever.
 */
/** Per-neighbor, per-tick chance a touching living host (see the two lists below), OR a touching cell of the rival strain, gets claimed. */
const VIRUS_LIVING_SPREAD_CHANCE = 0.015;
/**
 * Per-neighbor, per-tick chance a touching *non-living* material gets
 * claimed — everything that isn't Vidro, Fogo or Lava, however solid or
 * mechanical: Metal, Pedra, Fio, Cano, Torneira, Portão, all of it.
 * Deliberately tiny — orders of magnitude below the living rate — so it
 * reads as an outbreak slowly, inevitably rotting a structure over a very
 * long stretch of play instead of a wall of Metal actually stopping it.
 */
const VIRUS_INERT_SPREAD_CHANCE = 0.0003;
/** Per-neighbor, per-tick chance it drifts into open air — spores crossing a gap are much less reliable than claiming something they're already touching. */
const VIRUS_AIRBORNE_CHANCE = 0.003;
/** The one material Vírus can never claim, at any speed — everything else on the grid is eventually fair game. */
const VIRUS_IMMUNE: readonly MaterialId[] = [MaterialId.Glass];
/** Living plant matter — claimed at the fast rate. */
const VIRUS_ORGANIC_HOSTS: readonly MaterialId[] = [
  MaterialId.Wood, MaterialId.Plant, MaterialId.Sprout, MaterialId.Flor, MaterialId.Wheat, MaterialId.Seed,
];
/** Living creatures/folk — claimed at the fast rate. Esqueleto is left off this list on purpose: it's already dead, nothing left for a plague to take. */
const VIRUS_CREATURE_HOSTS: readonly MaterialId[] = [
  MaterialId.Ant, MaterialId.Bird, MaterialId.Fish,
  MaterialId.Mason, MaterialId.Lumberjack, MaterialId.Farmer, MaterialId.Warrior,
];

/** The other strain's id, for the two colors that actually fight each other — null for anything that isn't one of the two Vírus materials. */
function rivalStrain(id: MaterialId): MaterialId | null {
  if (id === MaterialId.Virus) return MaterialId.VirusPink;
  if (id === MaterialId.VirusPink) return MaterialId.Virus;
  return null;
}

/**
 * Vírus (either color): a stationary infection that fades on its own (see
 * `VIRUS_LIFE`) unless it keeps claiming fresh hosts. Fogo/Lava sterilizes
 * it on contact — checked first, every tick, so a burning quarantine line
 * always wins even if the cell would otherwise have plenty of life left.
 */
export function stepVirus(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  const ownId = grid.material[i] as MaterialId;

  // Checked against all 8 neighbors, not just the 4 cardinal ones — Fogo is
  // a mobile ember that flickers a cell or two every tick on its own, so a
  // narrower check would miss a diagonal lick of flame constantly.
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nid = grid.get(nx, ny);
    if (nid === MaterialId.Fire || nid === MaterialId.Lava) {
      grid.set(x, y, MaterialId.Empty);
      grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
      return;
    }
  }

  const life = grid.meta[i] - 1;
  if (life <= 0) {
    grid.set(x, y, MaterialId.Empty);
    return;
  }
  grid.meta[i] = life;

  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    infect(grid, nx, ny, ownId);
  }
}

/** Rolls this tick's infection attempt against the cell at (x, y), converting it to `ownId` (whichever of the two Vírus colors is doing the claiming) — the odds depend entirely on what's actually there (see the rates above). */
function infect(grid: SimGrid, x: number, y: number, ownId: MaterialId): void {
  const i = grid.index(x, y);
  const id = grid.material[i] as MaterialId;

  if (id === MaterialId.Empty) {
    if (Math.random() < VIRUS_AIRBORNE_CHANCE) grid.set(x, y, ownId, VIRUS_LIFE);
    return;
  }
  if (id === ownId || VIRUS_IMMUNE.includes(id)) return;

  // The rival strain: each color treats the other as a host too, at the
  // fast rate — this is the actual battle, fought one cell at a time
  // wherever a purple and a pink patch happen to touch.
  if (rivalStrain(id) === ownId) {
    if (Math.random() < VIRUS_LIVING_SPREAD_CHANCE) grid.set(x, y, ownId, VIRUS_LIFE);
    return;
  }

  const isCreature = VIRUS_CREATURE_HOSTS.includes(id);
  if (isCreature || VIRUS_ORGANIC_HOSTS.includes(id)) {
    if (Math.random() < VIRUS_LIVING_SPREAD_CHANCE) {
      grid.set(x, y, ownId, VIRUS_LIFE);
      if (isCreature) grid.flashes.push({ x, y, life: FLASH_LIFE, maxLife: FLASH_LIFE });
    }
    return;
  }

  if (Math.random() < VIRUS_INERT_SPREAD_CHANCE) {
    grid.set(x, y, ownId, VIRUS_LIFE);
  }
}
