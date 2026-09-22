import { MaterialId } from "./types";

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
export const HOUSE_ANCHOR_META = 0x80;
/** Meta bit marking a Tijolo/Madeira/Gelo cell as part of a mason's house (the anchor carries it too) — tells repair which cells it owns and lets folk phase through them. */
export const HOUSE_WALL_META = 0x40;
export const HOUSE_WALL_BRICK = 0;
export const HOUSE_WALL_WOOD = 1;
export const HOUSE_WALL_ICE = 2;
/** A Cogumelo-built house — the "estranho" style a mason raises out of loose felled Cogumelo instead of Tijolo/Madeira/Gelo (see the Lenhador's own felling in folk/lumberjack.ts). Not a true Solid like the other three, but it never falls or moves either, so it holds up a wall/roof just as well. */
export const HOUSE_WALL_MUSHROOM = 3;
/** Style code → the material the walls are built of. The first three must be true Solids — a Pedra/Areia "roof" would just cave in, since those are Powders here — Cogumelo is the one exception (see HOUSE_WALL_MUSHROOM). */
export const HOUSE_WALL_MATERIAL = [MaterialId.Brick, MaterialId.Wood, MaterialId.Ice, MaterialId.Mushroom] as const;
/** Any of these overhead + on both sides counts as shelter — the structural solids (or Cogumelo) a roof can actually be made of. */
export const HOUSE_WALLS: readonly MaterialId[] = [
  MaterialId.Brick, MaterialId.Wood, MaterialId.Ice, MaterialId.Metal, MaterialId.Glass, MaterialId.Mushroom,
];

/**
 * One buildable house. `span` = anchor→right-wall distance, `rise` = side-wall
 * height, `roof` = the roof silhouette, `capacity` = folk it shelters,
 * `supply` = loose building material the founding survey must turn up.
 */
export type RoofShape = "flat" | "gable" | "lean" | "hip" | "crown";
export interface HousePlan {
  span: number;
  rise: number;
  roof: RoofShape;
  capacity: number;
  supply: number;
  /** A storehouse, not a dwelling: no door, no chimney, no windows — a closed bin the folk stack harvest into. Built by the Fazendeiro (grain) / Lenhador (wood), never the Construtor. */
  store?: "grain" | "wood";
}
/** Smallest → largest dwellings (0-5), then the two storehouses (6-7). The anchor's `meta` stores the index (bits 2-4), so a mason returning later knows the shape to repair it to. */
export const HOUSE_PLANS: readonly HousePlan[] = [
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
export const MASON_MAX_PLAN = 5;
export const PLAN_GRANARY = 6;
export const PLAN_WOODSHED = 7;
/** Widest dwelling span the Construtor ever founds — the two storehouses tacked on the end of HOUSE_PLANS are narrower than that, so this can't just be HOUSE_PLANS.at(-1).span any more (that used to be the biggest house, back when the array held only dwellings). Used to keep a house's footprint well clear of the water it'd otherwise trap folk against. */
export const HOUSE_MAX_DWELLING_SPAN = Math.max(...HOUSE_PLANS.slice(0, MASON_MAX_PLAN + 1).map((p) => p.span));

/**
 * Each blueprint cell carries a `kind` so a house reads as a building, not a
 * wire outline: wall / roof, plus windows set into the walls, a masonry
 * chimney above the roof, and — on the bigger plans — a doubled wall base
 * and eaves that overhang the walls. `kind` is packed into the cell's `meta`
 * (bits 0-2) alongside HOUSE_WALL_META so repair keeps the right material
 * there and the renderer can light the windows and cap the chimney.
 */
export const HOUSE_WALL = 0;
export const HOUSE_ROOF = 1;
export const HOUSE_WINDOW = 2;
export const HOUSE_CHIMNEY = 3;
export const HOUSE_FLOOR = 4;
/**
 * A Construtor-laid bridge plank. Kept as its own kind rather than reusing
 * HOUSE_FLOOR (a real house's floor tile) even though the two behave
 * identically underfoot (see `isDeck`, which matches both) — `deckNear`
 * needs to tell them apart, so a stray floor tile (a storehouse, a house
 * whose plan happens to fall within range) can never be mistaken for an
 * already-built bridge and silently veto a real crossing forever.
 */
export const HOUSE_DECK = 5;
/** A Construtor-laid staircase rung — same idea as HOUSE_DECK (its own kind so `stairNear` can't mistake an ordinary floor for a finished climb), but stacking straight upward (a vertical ladder) instead of running level. See `stairScan`. */
export const HOUSE_STAIR = 6;
export const HOUSE_KIND_MASK = 0b111;
export type HouseCell = readonly [number, number, number]; // dx, dy, kind

/** The material a house cell of `kind` is built from, for wall style `style`. */
export function houseCellMaterial(kind: number, style: number): MaterialId {
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
export function houseCells(plan: HousePlan): HouseCell[] {
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
export const HOUSE_BLUEPRINTS: readonly (readonly HouseCell[])[] = HOUSE_PLANS.map(houseCells);
/** Roof-peak height of each plan above the anchor row — how far up the site must be clear to raise it. (The chimney sticks up higher but it's one thin stack at the edge, not worth gating a whole lot on.) */
export const HOUSE_HEIGHTS: readonly number[] = HOUSE_BLUEPRINTS.map((cells) =>
  cells.reduce((m, c) => (c[2] === HOUSE_CHIMNEY ? m : Math.max(m, -c[1])), 0),
);

export const houseStyle = (meta: number): number => meta & 0b11;
export const houseType = (meta: number): number => (meta >> 2) & 0b111;
/** The anchor `meta` byte for a house of the given wall style + plan index. */
export const packHouseAnchor = (style: number, type: number): number =>
  HOUSE_ANCHOR_META | HOUSE_WALL_META | ((type & 0b111) << 2) | (style & 0b11);
