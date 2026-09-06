export const enum MaterialId {
  Empty = 0,
  Sand = 1,
  Water = 2,
  Stone = 3,
  Wood = 4,
  Fire = 5,
  Plant = 6,
  Dirt = 7,
  Mud = 8,
  Electricity = 9,
  Metal = 10,
  Seed = 11,
  Acid = 12,
  Gunpowder = 13,
  Oil = 14,
  Salt = 15,
  /** The capped, irregularly-shaped growth a Semente sprouts into — see grid.ts stepSprout. */
  Sprout = 16,
  /** Molten rock — melts Pedra/Metal/Areia into more of itself, each at a different rate. */
  Lava = 17,
  /** A petal cell of the tiny stamped flower a Semente becomes when it germinates on Barro — see grid.ts stampFlower. Its rendered color varies by `meta` for visual variety. */
  Flor = 18,
  /** A cellular automaton in its own right: lives/dies by Conway's rules among its own kind, and spreads by eating nearby plant matter — see grid.ts stepLifeGeneration. */
  Vida = 19,
  /** Freezes touching fresh Água (not salgada); melts back near Fogo/Lava — see grid.ts stepIce. */
  Ice = 20,
  /** Very acid-resistant but fragile — Estilhaço and Eletricidade shatter it into Areia on contact — see grid.ts shatterGlass. */
  Glass = 21,
  /** A static block that locks onto the first material to touch it, then spawns a steady trickle of that same material into its empty neighbors forever — see grid.ts stepClone. */
  Clone = 22,
  /** A static, inert heat source — pushes the ambient temperature up like Lava/Fogo do, but never moves, melts, ignites anything, or is affected by anything itself. A clean tool for steering the climate. */
  HeatBlock = 23,
  /** A static, inert cold source — pushes the ambient temperature down like Gelo does, but never moves, melts, freezes anything, or is affected by anything itself. A clean tool for steering the climate. */
  ColdBlock = 24,
  /** Same explosive behavior as Pólvora (ignites, detonates, chain-reacts with other explosives) but a static Solid instead of a falling Powder — a charge you place exactly where you want it to stay. */
  C4 = 25,
  /** Água boiled off at WATER_BOIL_TEMP — a Gas that rises instead of falling, and slowly condenses back into Água once the ambient climate cools back below that point. Not directly paintable, only ever appears by boiling. */
  Steam = 26,
  /** Ácido boiled off at ACID_BOIL_TEMP — rises like Vapor, then rains back down as fresh Ácido once the climate cools below that point again. Not directly paintable, only ever appears by boiling. */
  AcidVapor = 27,
  /** A directly-paintable flammable Gas — rises and disperses like Vapor, but ignites easily and detonates like Pólvora/C4 instead of just burning, and can catch from ambient heat alone at a much lower threshold than other flammables. */
  CombustibleGas = 28,
}

export const enum BrushShape {
  Point = "point",
  Line = "line",
  Square = "square",
  Circle = "circle",
}

export const enum MaterialCategory {
  Empty,
  Solid,
  Powder,
  Liquid,
  Gas,
  Fire,
  Organic,
  /** Fast-moving, short-lived — electricity travelling through conductors. */
  Energy,
  /** Governed by its own generation-by-generation automaton instead of the usual per-cell movement rules — see grid.ts stepLifeGeneration. */
  Life,
}

export interface MaterialDef {
  id: MaterialId;
  name: string;
  category: MaterialCategory;
  /** Base RGB; the grid renderer jitters this per-cell so fills don't look flat. */
  color: readonly [number, number, number];
  /** Higher falls through lower in liquids/powders. */
  density: number;
  flammable: boolean;
  /** Ticks this material stays on fire once ignited (or, for Fire itself, once placed directly). */
  burnTicks: number;
  /** Chance per tick, per burning neighbor, that contact ignites this material. */
  ignitionChance: number;
  /** Detonates instead of just smouldering when it catches fire. */
  explosive: boolean;
  /** How many Acid "charges" it takes to dissolve one cell of this; 0 = immune. */
  acidResistance: number;
  /** Conducts Electricity on contact (e.g. Metal). */
  conductive: boolean;
  /** Ambient temperature (°C) above which this can spontaneously catch fire with no touching flame at all — different plants/materials scorch at different heats. Ignored for non-flammable materials; use a very high value (e.g. 999) for a flammable material that should only ever ignite by contact. */
  spontaneousIgniteTemp: number;
}

/**
 * Per-cell state beyond material id, packed as one byte per cell instead of
 * a second object per cell so the grid stays flat typed arrays:
 *  - Fire: ticks of fuel left.
 *  - Water: salinity (0-255, tints the render toward brine white).
 *  - Acid: corrosion charges left before it's spent.
 *  - Sprout: remaining growth budget before it stops spreading.
 */
export interface SimBuffers {
  material: Uint8Array;
  meta: Uint8Array;
}
