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
  /** A static block that locks onto the first material to touch it, then spawns a steady trickle of that same material into its empty neighbors forever — see grid.ts stepClone. Left untouched by any Fio/Alavanca it runs unconditionally, same as always; touching one, it only spawns while that circuit is actually on (see circuitConnected). */
  Clone = 22,
  /** A static, inert heat source — pushes the ambient temperature up like Lava/Fogo do, but never moves, melts, ignites anything, or is affected by anything itself. A clean tool for steering the climate. Left untouched by any Fio/Alavanca it's always on; touching one, it only heats while that circuit is (see circuitConnected). */
  HeatBlock = 23,
  /** A static, inert cold source — pushes the ambient temperature down like Gelo does, but never moves, melts, freezes anything, or is affected by anything itself. A clean tool for steering the climate. Left untouched by any Fio/Alavanca it's always on; touching one, it only cools while that circuit is (see circuitConnected). */
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
   * A carrier: an Eletricidade charge landing anywhere on a run of Fio
   * powers the whole run, exactly like an on Alavanca touching it would —
   * even though the spark itself doesn't travel any further than the one
   * cell it lands on (not `conductive`, unlike Metal). Unpowered the very
   * next tick once nothing feeds it any more — no lingering charge. Has no
   * effect on its own; see grid.ts circuitPowered.
   */
  Wire = 41,
  /**
   * A normal paintable Sólido gate — open (passable to everything) while
   * unpowered, and while powered by a touching Alavanca or Fio, blocks Pó,
   * Líquido AND Povo/Fauna all at once (the other three Portões below each
   * block just one of those). A blocked category can't enter or pass
   * through the cell at all (Pó/Líquido/Gás skip clean past it toward
   * whatever's beyond, the same way Povo phases through a house wall,
   * rather than physically swapping into it); an unblocked category always
   * passes through it, powered or not. Also blocks the wind itself (and
   * its visible motes) while powered, regardless of which category is
   * actually blocked — see systems/gates.ts.
   */
  GateGeneral = 42,
  /**
   * A normal paintable Sólido, like Vidro or Metal — paint a single cell or
   * a whole mass of it. Pulls in any free-falling Eletricidade charge
   * within reach and grounds it safely the moment it arrives, instead of
   * leaving it to drift into Pólvora, Óleo or Gás and touch it off; the
   * more connected mass it has, the further out it reaches. Has no effect
   * on a charge already travelling through a conductor. See
   * systems/electronics.ts stepLightningRod.
   */
  LightningRod = 43,
  /**
   * A normal paintable Sólido, like Vidro or Metal — paint a single cell or
   * a whole wall of it. A connected clump is one fixture (same one-body idea
   * as Bloco de Calor/Frio): it just always runs unless wired to a
   * Fio/Alavanca, in which case the whole clump switches together. It blows
   * a steady wind in one of 8 directions chosen from the brush before
   * painting (right-click rotates a whole placed clump 45° at a time,
   * cycling all the way around), pushing any Pó, Fogo or Vapor along ahead
   * of it and leaving a visible trail of drifting motes so the draft itself
   * reads on screen — and the more of it there is, the further and more
   * reliably it blows. See systems/electronics.ts stepFan.
   */
  Fan = 44,
  /**
   * A static fixture stamped as a fixed crenellated-turret shape in one
   * click (see SINGLE_DROP_MATERIALS / dropDefenseTower / DEFENSE_TOWER_SHAPE)
   * — a real little tower, several times the footprint of a single Pip
   * cell. The whole clump is one body: it only switches on while powered by
   * a touching Alavanca or Fio, exactly like a Porta, with no standalone
   * mode (unlike Bloco de Calor/Frio, an unwired tower never fires). While
   * on, every cell of it independently strikes the nearest Esqueleto within
   * range, the same one point a hit as a Guerreiro, without needing to
   * stand next to it. See systems/electronics.ts stepDefenseTower.
   */
  DefenseTower = 45,
  /** Same paintable-gate idea as Portão Geral, but powered blocks ONLY Povo and Fauna (every Creature — Formiga/Pássaro/Peixe and every Pip). See systems/gates.ts. */
  GateCreature = 46,
  /** Same paintable-gate idea as Portão Geral, but powered blocks ONLY Líquido. See systems/gates.ts. */
  GateLiquid = 47,
  /** Same paintable-gate idea as Portão Geral, but powered blocks ONLY Pó. See systems/gates.ts. */
  GatePowder = 48,
  /**
   * A normal paintable Sólido — immune to Ácido, Lava and fire alike. Any
   * Líquido touching it has a small, weak chance each tick of being sucked
   * in — if it's touching a connected Cano network, the liquid flows
   * visibly through the pipe (see systems/drains.ts) toward an open
   * Torneira if one is reachable and on, or, failing that, is simply
   * stored inside the Cano itself (the network fills up cell by cell,
   * emptying back out once a Torneira does open); with no Cano at all
   * touching it, the liquid just vanishes. Also drifts a faint, purely
   * decorative trickle of motes toward itself (no physical effect on
   * anything) as a visual tell that it's actively drawing something in.
   * Switches on/off exactly like Ventilador: a connected clump is one
   * fixture, running unconditionally unless wired to a Fio/Alavanca, in
   * which case the whole clump switches together.
   */
  Drain = 49,
  /**
   * A normal paintable Sólido — the same Ácido/Lava/fire immunity as Ralo.
   * Carries no charge or current of its own; it's the conduit a connected
   * Ralo routes sucked-up Líquido through, and doubles as a reservoir when
   * no open Torneira is reachable — the network holds whatever Líquido
   * flows into it, cell by connected cell, until one opens up. See
   * systems/drains.ts.
   */
  Pipe = 50,
  /**
   * A normal paintable Sólido, same Ácido/Lava/fire immunity as Ralo and
   * Cano — the actual outlet of a Cano network. Switches on/off exactly
   * like Ventilador (a connected clump is one fixture, running
   * unconditionally unless wired to a Fio/Alavanca): while on, it's the
   * only place a connected network's Líquido — freshly arriving, or
   * already stored inside the Cano — actually flows back out into the
   * open; while off it's sealed, same as a Cano dead end. Several
   * reachable Torneiras open at once split the flow between them evenly,
   * chance by chance, rather than one draining the network dry first. See
   * systems/drains.ts.
   */
  Torneira = 51,
  /**
   * A slow-creeping infection, not a falling/flowing substance — it sits
   * where it lands and, tick by tick, reaches into each of its 8 neighbors
   * to claim it. A living host (Madeira/Planta/Broto/Flor/Trigo/Semente, or
   * any Pip/animal except the already-dead Esqueleto) is consumed fast;
   * everything else with a body — Sólido, Líquido, Gás, Fio, Cano,
   * Torneira, Portão, whatever — can still be claimed too, just at a
   * crawl. Vidro is the one true exception, immune outright. Each cell also
   * carries its own fading lifespan — one that never finds a fresh host
   * eventually dies out on its own — so an outbreak that runs out of
   * things to infect burns itself out instead of turning the whole map
   * purple forever. Fogo/Lava sterilizes it on contact; a Magia mote
   * purifies it outright. See systems/virus.ts.
   */
  Virus = 52,
  /**
   * A second, rival strain of Vírus — identical in every way (same hosts,
   * same speeds, same immunities, same fading lifespan) except its color
   * and the one thing that makes it a rival at all: the two treat each
   * other as hosts too, at the fast/living rate, each converting a
   * touching cell of the other over to its own color. Wherever the two
   * outbreaks meet, that's a real, ongoing battle line instead of either
   * one just quietly claiming the other's territory. Only ever reached by
   * right-clicking the Vírus tile (it has no palette tile of its own) — see
   * BottomPanel's pickSecondary. See systems/virus.ts.
   */
  VirusPink = 53,
  /**
   * Mycelium: a slow-growing network spreading into a touching cell of
   * eight materials (Madeira, Planta, Tijolo, Areia, Terra, Barro, Pedra,
   * Pólvora — see FUNGUS_HOSTS in metaBits.ts), the same way Vírus claims a
   * host, just gentler and with nowhere near its reach — plus one more
   * target Vírus itself doesn't get any immunity from: a touching Vírus/
   * Vírus Rosa cell is claimed outright too, converted straight into a
   * special flagged Fungus cell that's stopped reproducing for good (see
   * claimVirus in systems/fungus.ts), a genuine predator relationship
   * rather than the two just ignoring each other. Vírus itself still can't
   * claim Fungus back — the immunity only runs the other way. Each cell
   * remembers which of those eight hosts it actually took root in (or that
   * it came from an infected Vírus cell instead — packed into its own
   * meta) so the renderer gives every origin its own color/texture instead
   * of one flat look for the whole network. Flammable like any organic
   * matter, so Fogo burns through it same as Madeira. Every so often a
   * patch sprouts a Cogumelo on open ground above itself. Never decays on
   * its own — once rooted, a network persists as long as there's something
   * left to hold it. See systems/fungus.ts.
   */
  Fungus = 54,
  /**
   * A Cogumelo: what a Fungus patch occasionally sprouts on open ground
   * above itself — not something you paint yourself (see Esporos, below,
   * for the actual paintable gas cloud). Grows cell by cell like a Broto,
   * up to a randomly chosen final size anywhere from a tiny single cap to a
   * full tree's worth of cells, and which of Fungus's eight hosts it grew
   * from decides both its color and its growth shape (a different weighted
   * spread per origin), so different infections sprout visibly different
   * mushrooms. Once grown it's permanent, same as the mycelium below it —
   * it never decays or pops on its own — and every so often one of its cap
   * tips puffs a short column of Esporo motes into the open air above it,
   * reaching up to a random height each time. See systems/fungus.ts.
   */
  Mushroom = 55,
  /**
   * "Esporos" — a real Gás (so a Ventilador's draft actually carries it,
   * same as Vapor or Gás Combustível), painted the same immediate way as
   * Fogo/Gás: every open-air cell the brush passes over fills with it right
   * away, a cloud with no solid core underneath, drifting and thinning out
   * on its own like any other gas. Touch down against one of Fungus's eight
   * hosts and it has a chance to take root there as a fresh Fungus cell —
   * the "wind carries the outbreak somewhere new" part. Touching a Vírus
   * cell instead, same chance, claims it outright the same way — converted
   * straight into a special flagged Fungus cell that's stopped reproducing
   * for good, not just gradually weakened. Fogo or Lava kills it outright
   * on contact, same as they sterilize Vírus. Also what a Cogumelo's cap
   * puffs out on its own now and then. See systems/fungus.ts.
   */
  Spore = 56,
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
  /** A stationary infection that spreads by claiming one random neighbor per tick instead of falling or flowing — see systems/virus.ts stepVirus. */
  Virus,
  /** Fungus — the mycelium spreading through several materials — and Cogumelo, the mushroom it grows — see systems/fungus.ts. Esporos, the cloud a Cogumelo puffs out, is a real Gás instead (see MaterialCategory.Gas) so a Ventilador's draft actually carries it. */
  Fungus,
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
