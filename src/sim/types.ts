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
  /**
   * A tiny walker that follows surfaces — climbs walls, trudges up slopes,
   * falls when unsupported, and burrows through loose Areia/Terra/Barro
   * carving tunnels. Follows the scent of nearby food and gathers on it:
   * eats Planta/Broto/Flor/Semente, and gnaws slowly through Madeira/Barro.
   * Starves without food, multiplies when well fed. Drowns in Água, burns
   * in Fogo/Lava (fire sweeps the whole connected colony), dissolves in
   * Ácido; hunted by Pássaros. See grid.ts stepAnt.
   */
  Ant = 29,
  /**
   * Soars in a lazy band near the top of the scene, but a hungry one drops
   * out of its cruise to **swoop** any Formiga on the ground or Peixe at
   * the surface it spots, snatching it on contact. Also pecks Semente and
   * drops one below it now and then — a moving seed-disperser. Flees
   * Fogo/Lava; burns (and passes the fire down the flock) if it can't get
   * clear. See grid.ts stepBird.
   */
  Bird = 30,
  /**
   * Swims only inside Água (fresh or salgada), schooling loosely with other
   * Peixes and nibbling submerged Planta/Broto/Semente. Suffocates and
   * flops out of water, dies in Ácido/Lava/Fogo, cooks if the water boils,
   * and is trapped by encroaching Gelo. Breeds in water when fed. See
   * grid.ts stepFish.
   */
  Fish = 31,
  /**
   * A short-lived mote of enchantment that drifts upward and wanders,
   * transmuting one neighbor per tick toward life and order: quenches
   * Fogo/Lava/Ácido, weathers Pedra to Terra, greens Terra/Madeira into
   * Planta, defuses Pólvora/C4 into Areia, makes plants bloom, and rarely
   * conjures a creature into open space. Fades after its `meta` lifespan,
   * sometimes leaving a Flor behind. See grid.ts stepMagic.
   */
  Magic = 32,
  /**
   * One of "o povo" — little upright folk that walk surfaces like a Formiga
   * but each carry out a trade. The Construtor levels a clear patch of ground
   * and *conjures a whole house* on it — walls and a roof with a doorway,
   * the wall material by what's abundant nearby (loose earth → Tijolo, a
   * forest → a Madeira cabin, a glacier → a Gelo hut) — founding one only
   * until there's a house per Pip. It also decks a raised Madeira bridge
   * across a river in its way. The folk shelter in the houses (walking
   * straight through the walls) when the climate turns. See grid.ts stepMason.
   */
  Mason = 33,
  /**
   * People-folk: the Lenhador sows a Semente onto bare soil to start a tree
   * and then *leaves it to grow*. Only once a sapling has filled out into a
   * proper tree does it fell it — one low block of Madeira per trunk — and it
   * stops felling once the woodlot's stocked. The stacked timber is what the
   * Construtor needs before it will bridge a river. See grid.ts stepLumberjack.
   */
  Lumberjack = 34,
  /**
   * People-folk: the Plantador sows Semente into soil, carries Água to dry
   * Terra to make Barro, and harvests mature growth — turning barren ground
   * into a garden that feeds the whole ecosystem. See grid.ts stepFarmer.
   */
  Farmer = 35,
  /**
   * People-folk: the Guerreiro guards the village. It patrols among the
   * houses, and when a Esqueleto comes within sight it closes on it and
   * trades blows — sword in its facing hand, shield in the other. Tougher
   * than the working folk (10 hit points to their 5), it deals one point a
   * strike, about once a second. See grid.ts stepWarrior.
   */
  Warrior = 36,
  /**
   * Fired masonry — a sturdy, inert Solid the Construtor produces (and the
   * player can paint). A `meta` of HOUSE_ANCHOR_META marks one brick as a
   * house's doorway-sill origin, the reference every other brick of that
   * house's blueprint is placed against, and the point folk walk to when
   * the climate turns against them and they need to get indoors. See
   * grid.ts stepMason / folkShelter.
   */
  Brick = 37,
  /**
   * The Plantador's crop. Sown as a single shoot on Terra/Barro, it grows a
   * stalk a few cells tall and ripens on a per-cell `meta` timer (green when
   * young, gold when ripe). Ripe Trigo is food — the folk (and especially
   * the Plantador that grew it) eat it; a ripe head occasionally self-seeds
   * onto adjacent bare soil. Flammable, withers unsupported or in a hard
   * frost. See grid.ts stepWheat / stepFarmer.
   */
  Wheat = 38,
  /**
   * A shambling undead that hunts o povo. Slower than the folk, it makes for
   * the nearest Pip it can see and strikes it for one point about once a
   * second (a working Pip has 5 hit points, a Guerreiro 10). It has 5 of its
   * own, and a Guerreiro's blows — or Fogo, Lava, Ácido, deep Água — put it
   * down. See grid.ts stepSkeleton.
   */
  Skeleton = 39,
  /**
   * A static switch, always placed one at a time regardless of brush size
   * (see SINGLE_DROP_MATERIALS) — right-clicking an existing Alavanca flips
   * it on/off (its `meta` low bit); it starts off. On, it feeds power
   * straight into a touching Fio or Porta, exactly like a powered wire — no
   * wire needed for something it's already touching. See grid.ts
   * toggleLever / circuitPowered.
   */
  Lever = 40,
  /**
   * A conductor: powered the tick after any neighbor is powered (an on
   * Alavanca, or another powered Fio), unpowered the very next tick once
   * nothing feeds it any more — no lingering charge. Purely a carrier; it
   * has no effect on its own; see grid.ts circuitPowered.
   */
  Wire = 41,
  /**
   * A Solid wall that goes intangible to folk and creatures — walked
   * through exactly like a house wall — for as long as it's powered by a
   * touching Alavanca or Fio, and lights a shade brighter while it is. It
   * doesn't animate open; the color shift and the change in what can pass
   * through it are the only tells. See grid.ts circuitPowered / isGhost.
   */
  Door = 42,
}

export const enum BrushShape {
  Point = "point",
  Line = "line",
  Square = "square",
  Circle = "circle",
  /** Hold and drag a clump of non-solid matter (powder, liquid, gas, plants, creatures) from one place to another. */
  Drag = "drag",
}

/** A clump of cells lifted off the grid by the drag tool, mid-move. See SimGrid.pickUpBlob. */
export interface DragBlob {
  cells: { dx: number; dy: number; mat: MaterialId; meta: number }[];
  /** Grid anchor the cells are currently placed around. */
  ax: number;
  ay: number;
  /** The exact grid indices the blob currently occupies, so a move clears precisely those. */
  placed: number[];
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
  /** A mobile animal that follows its own goal-driven movement (surface walking, flight, swimming) instead of gravity-driven falling — Formiga, Pássaro, Peixe. See grid.ts stepAnt/stepBird/stepFish. */
  Creature,
  /** Enchantment: drifts and transmutes its surroundings rather than obeying ordinary physics — see grid.ts stepMagic. */
  Magic,
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
