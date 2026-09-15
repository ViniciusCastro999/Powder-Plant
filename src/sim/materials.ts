import { MaterialCategory, MaterialId, type MaterialDef } from "./types";

/** Sentinel for "never spontaneously ignites from ambient heat alone" — either not flammable, or (Pólvora) deliberately excluded so a hot room doesn't surprise-detonate it. */
const NEVER_SPONTANEOUS = 999;

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  [MaterialId.Empty]: {
    id: MaterialId.Empty,
    name: "Vazio",
    category: MaterialCategory.Empty,
    color: [0, 0, 0],
    density: 0,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Sand]: {
    id: MaterialId.Sand,
    name: "Areia",
    category: MaterialCategory.Powder,
    color: [214, 185, 116],
    density: 5,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 2,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Water]: {
    id: MaterialId.Water,
    name: "Água",
    category: MaterialCategory.Liquid,
    color: [64, 130, 214],
    density: 3,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: true,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Stone]: {
    id: MaterialId.Stone,
    name: "Pedra",
    category: MaterialCategory.Powder,
    color: [120, 120, 128],
    density: 10,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 9,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Wood]: {
    id: MaterialId.Wood,
    name: "Madeira",
    category: MaterialCategory.Solid,
    color: [122, 82, 48],
    density: 8,
    flammable: true,
    burnTicks: 260,
    ignitionChance: 0.03,
    explosive: false,
    acidResistance: 4,
    conductive: false,
    // Dense and slow to catch — needs real heat, not just a warm room.
    spontaneousIgniteTemp: 95,
  },
  [MaterialId.Fire]: {
    id: MaterialId.Fire,
    name: "Fogo",
    category: MaterialCategory.Fire,
    color: [255, 130, 30],
    density: 1,
    flammable: false,
    burnTicks: 90,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Plant]: {
    id: MaterialId.Plant,
    name: "Planta",
    category: MaterialCategory.Organic,
    color: [76, 175, 80],
    density: 6,
    flammable: true,
    burnTicks: 80,
    ignitionChance: 0.1,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: 60,
  },
  [MaterialId.Dirt]: {
    id: MaterialId.Dirt,
    name: "Terra",
    category: MaterialCategory.Powder,
    color: [92, 64, 44],
    density: 4,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 2,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Mud]: {
    id: MaterialId.Mud,
    name: "Barro",
    category: MaterialCategory.Powder,
    color: [72, 54, 42],
    density: 6,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 3,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Electricity]: {
    id: MaterialId.Electricity,
    name: "Eletricidade",
    category: MaterialCategory.Energy,
    color: [255, 236, 120],
    density: 1,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Metal]: {
    id: MaterialId.Metal,
    name: "Metal",
    category: MaterialCategory.Solid,
    color: [176, 184, 192],
    density: 12,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 10,
    conductive: true,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Seed]: {
    id: MaterialId.Seed,
    name: "Semente",
    category: MaterialCategory.Powder,
    color: [196, 156, 68],
    density: 4,
    flammable: true,
    burnTicks: 12,
    ignitionChance: 0.08,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    // Small and dry — the first thing to catch in a heat wave.
    spontaneousIgniteTemp: 50,
  },
  [MaterialId.Acid]: {
    id: MaterialId.Acid,
    name: "Ácido",
    category: MaterialCategory.Liquid,
    color: [166, 226, 60],
    density: 4,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Gunpowder]: {
    id: MaterialId.Gunpowder,
    name: "Pólvora",
    category: MaterialCategory.Powder,
    color: [58, 58, 64],
    density: 5,
    flammable: true,
    burnTicks: 6,
    ignitionChance: 0.85,
    explosive: true,
    acidResistance: 1,
    conductive: false,
    // Only ever goes off by contact (Fogo, Eletricidade, Lava) — an
    // ambient-heat detonation would feel like an unfair surprise.
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Oil]: {
    id: MaterialId.Oil,
    name: "Óleo",
    category: MaterialCategory.Liquid,
    color: [92, 68, 32],
    density: 2,
    flammable: true,
    burnTicks: 420,
    ignitionChance: 0.45,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: 70,
  },
  [MaterialId.Salt]: {
    id: MaterialId.Salt,
    name: "Sal",
    category: MaterialCategory.Powder,
    color: [230, 230, 225],
    density: 5,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Sprout]: {
    id: MaterialId.Sprout,
    name: "Broto",
    category: MaterialCategory.Organic,
    color: [138, 201, 100],
    density: 6,
    flammable: true,
    burnTicks: 60,
    ignitionChance: 0.1,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: 58,
  },
  [MaterialId.Lava]: {
    id: MaterialId.Lava,
    name: "Lava",
    category: MaterialCategory.Liquid,
    color: [255, 90, 20],
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Flor]: {
    id: MaterialId.Flor,
    name: "Flor",
    category: MaterialCategory.Organic,
    color: [235, 120, 170],
    density: 6,
    flammable: true,
    burnTicks: 40,
    ignitionChance: 0.1,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    // Delicate petals — scorch a little before the plain leaf they grew from.
    spontaneousIgniteTemp: 55,
  },
  [MaterialId.Vida]: {
    id: MaterialId.Vida,
    name: "Vida",
    category: MaterialCategory.Life,
    color: [90, 230, 205],
    density: 6,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Ice]: {
    id: MaterialId.Ice,
    name: "Gelo",
    category: MaterialCategory.Solid,
    color: [200, 228, 250],
    density: 7,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 3,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Glass]: {
    id: MaterialId.Glass,
    name: "Vidro",
    category: MaterialCategory.Solid,
    color: [205, 240, 235],
    density: 8,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Clone]: {
    id: MaterialId.Clone,
    name: "Clone",
    category: MaterialCategory.Solid,
    color: [178, 132, 22],
    density: 8,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Immune, like Vidro — a permanent production block shouldn't be able
    // to just dissolve away.
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.HeatBlock]: {
    id: MaterialId.HeatBlock,
    name: "Calor",
    category: MaterialCategory.Solid,
    color: [196, 70, 34],
    density: 8,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Fully immune and completely inert — a climate-control tool, not a
    // reactive material like Lava.
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.ColdBlock]: {
    id: MaterialId.ColdBlock,
    name: "Frio",
    category: MaterialCategory.Solid,
    color: [66, 138, 214],
    density: 8,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.C4]: {
    id: MaterialId.C4,
    name: "C4",
    category: MaterialCategory.Solid,
    color: [212, 196, 140],
    density: 8,
    flammable: true,
    burnTicks: 6,
    ignitionChance: 0.85,
    explosive: true,
    // Sturdier than loose Pólvora grains, but still not immune.
    acidResistance: 3,
    conductive: false,
    // Only ever goes off by contact (Fogo, Eletricidade, Lava), same as
    // Pólvora — an ambient-heat detonation would feel like an unfair
    // surprise.
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Steam]: {
    id: MaterialId.Steam,
    name: "Vapor",
    category: MaterialCategory.Gas,
    color: [225, 228, 232],
    density: 1,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Immune — Ácido doesn't dissolve water vapor.
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.AcidVapor]: {
    id: MaterialId.AcidVapor,
    name: "Vapor de Ácido",
    category: MaterialCategory.Gas,
    color: [196, 232, 150],
    density: 1,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.CombustibleGas]: {
    id: MaterialId.CombustibleGas,
    name: "Gás",
    category: MaterialCategory.Gas,
    color: [214, 206, 140],
    density: 1,
    flammable: true,
    // Unused in practice — explosive materials detonate instead of just
    // burning, see MaterialDef.explosive.
    burnTicks: 6,
    // Catches almost instantly on any contact — a real gas leak is exactly
    // this dangerous.
    ignitionChance: 0.9,
    explosive: true,
    acidResistance: 0,
    conductive: false,
    // Much lower than every other flammable's threshold on purpose — a gas
    // cloud drifting into a merely warm room, let alone a hot one, is
    // meant to read as a serious hazard.
    spontaneousIgniteTemp: 65,
  },
  [MaterialId.Ant]: {
    id: MaterialId.Ant,
    name: "Formiga",
    category: MaterialCategory.Creature,
    color: [178, 92, 60],
    // Light enough that a grain of Areia settling on top can't crush it into
    // the floor, heavy enough that it reads as matter, not a spark.
    density: 4,
    flammable: true,
    // Once alight it burns a good while — long enough for the flame to jump
    // to the next ant in the trail before it goes out, so a torch to a
    // colony actually sweeps through it.
    burnTicks: 45,
    ignitionChance: 0.24,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    // Never bursts into flame from ambient heat alone — only real contact
    // with Fogo/Lava lights an ant.
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Bird]: {
    id: MaterialId.Bird,
    name: "Pássaro",
    category: MaterialCategory.Creature,
    color: [124, 152, 194],
    density: 3,
    flammable: true,
    burnTicks: 50,
    ignitionChance: 0.22,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    // Only ever catches by real contact with flame, never from a hot sky.
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Fish]: {
    id: MaterialId.Fish,
    name: "Peixe",
    category: MaterialCategory.Creature,
    color: [228, 128, 92],
    density: 4,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Magic]: {
    id: MaterialId.Magic,
    name: "Magia",
    category: MaterialCategory.Magic,
    color: [182, 92, 232],
    density: 1,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Ácido flows right past it — you can't corrode enchantment.
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Mason]: {
    id: MaterialId.Mason,
    name: "Construtor",
    category: MaterialCategory.Creature,
    color: [176, 162, 142],
    density: 5,
    flammable: true,
    burnTicks: 40,
    ignitionChance: 0.14,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Lumberjack]: {
    id: MaterialId.Lumberjack,
    name: "Lenhador",
    category: MaterialCategory.Creature,
    color: [150, 108, 56], // timber brown, to read apart from the green Plantador
    density: 5,
    flammable: true,
    burnTicks: 40,
    ignitionChance: 0.15,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Farmer]: {
    id: MaterialId.Farmer,
    name: "Plantador",
    category: MaterialCategory.Creature,
    color: [120, 158, 84],
    density: 5,
    flammable: true,
    burnTicks: 40,
    ignitionChance: 0.15,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Brick]: {
    id: MaterialId.Brick,
    name: "Tijolo",
    category: MaterialCategory.Solid,
    color: [156, 82, 62],
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Fired and mortared — shrugs off Ácido far better than raw Pedra.
    acidResistance: 12,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Warrior]: {
    id: MaterialId.Warrior,
    name: "Guerreiro",
    category: MaterialCategory.Creature,
    color: [150, 120, 84], // leather and bronze
    density: 5,
    flammable: true,
    burnTicks: 40,
    ignitionChance: 0.13,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Skeleton]: {
    id: MaterialId.Skeleton,
    name: "Esqueleto",
    category: MaterialCategory.Creature,
    color: [214, 210, 194], // old bone
    density: 5,
    flammable: true,
    burnTicks: 26,
    ignitionChance: 0.2,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Wheat]: {
    id: MaterialId.Wheat,
    name: "Trigo",
    category: MaterialCategory.Organic,
    color: [206, 170, 96], // ripe gold; the renderer greens it while it's young
    density: 6,
    flammable: true,
    burnTicks: 32,
    ignitionChance: 0.16,
    explosive: false,
    acidResistance: 1,
    conductive: false,
    // Dry straw — catches from ambient heat a little before a leafy plant does.
    spontaneousIgniteTemp: 52,
  },
  [MaterialId.Lever]: {
    id: MaterialId.Lever,
    name: "Alavanca",
    category: MaterialCategory.Solid,
    color: [110, 108, 116], // dull iron; the renderer lights it warm when on
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 6,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Wire]: {
    id: MaterialId.Wire,
    name: "Fio",
    category: MaterialCategory.Solid,
    color: [96, 44, 36], // dim copper; the renderer brightens it to a live orange while powered
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 4,
    // Not a conductor for Eletricidade's own pulse physics (a charge
    // doesn't travel through it the way it does Metal) — but it still
    // reacts to one touching it: see grid.ts circuitPowered, which checks
    // for a live charge on or beside a Fio the same way it checks for an
    // on Alavanca.
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.GateGeneral]: {
    id: MaterialId.GateGeneral,
    name: "Portão Geral",
    category: MaterialCategory.Solid,
    color: [96, 104, 118], // cold gunmetal-blue — the imposing "blocks everything" gate
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Immune, like the other circuit fixtures (Alavanca, Para-raio) — a
    // resistance above 0 still means Ácido eventually eats through given
    // enough exposure (that's what happened last time), and a gate isn't
    // meant to ever fail that way at all. 0 is the actual "not even a
    // valid target" value — see stepAcid's own `acidResistance > 0` check.
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.GateCreature]: {
    id: MaterialId.GateCreature,
    name: "Portão Povo e Fauna",
    category: MaterialCategory.Solid,
    color: [150, 112, 72], // warm fence-brown — the "living things" gate
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.GateLiquid]: {
    id: MaterialId.GateLiquid,
    name: "Portão Líquidos",
    category: MaterialCategory.Solid,
    color: [70, 124, 168], // water-blue — the "liquids" gate
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.GatePowder]: {
    id: MaterialId.GatePowder,
    name: "Portão Pó",
    category: MaterialCategory.Solid,
    color: [182, 152, 104], // sandy tan — the "powders" gate
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Drain]: {
    id: MaterialId.Drain,
    name: "Ralo",
    category: MaterialCategory.Solid,
    color: [88, 96, 100], // dark grate-iron
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Immune, like the other circuit fixtures — a drain that dissolved or
    // melted wouldn't stay a drain for long.
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Pipe]: {
    id: MaterialId.Pipe,
    name: "Cano",
    category: MaterialCategory.Solid,
    color: [120, 128, 134], // duller galvanized tube
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Torneira]: {
    id: MaterialId.Torneira,
    name: "Torneira",
    category: MaterialCategory.Solid,
    color: [176, 148, 88], // brass spout, distinct from the Cano's dull galvanized gray
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 0,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.LightningRod]: {
    id: MaterialId.LightningRod,
    name: "Para-raio",
    category: MaterialCategory.Solid,
    color: [150, 156, 168], // pale galvanized metal
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Immune, like Alavanca — a safety fixture shouldn't dissolve away.
    acidResistance: 6,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.Fan]: {
    id: MaterialId.Fan,
    name: "Ventilador",
    category: MaterialCategory.Solid,
    color: [196, 218, 232], // pale, light blue housing; the renderer adds a slowly turning blade texture on top
    density: 8,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    acidResistance: 4,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
  [MaterialId.DefenseTower]: {
    id: MaterialId.DefenseTower,
    name: "Torre",
    category: MaterialCategory.Solid,
    color: [92, 98, 84], // gunmetal
    density: 9,
    flammable: false,
    burnTicks: 0,
    ignitionChance: 0,
    explosive: false,
    // Immune, like the other circuit fixtures — a defense that could just
    // melt away wouldn't be much of one.
    acidResistance: 6,
    conductive: false,
    spontaneousIgniteTemp: NEVER_SPONTANEOUS,
  },
};

export const MATERIAL_LIST: MaterialDef[] = Object.values(MATERIALS);

/**
 * Materials the brush only ever drops one cell of, one click at a time,
 * whatever the brush size or shape — o povo, so a fat brush can't flood the
 * map with a hundred townsfolk in a single stroke; Alavanca, so a fat brush
 * can't drop a cluster of switches on top of each other. Enforced in both
 * SimGrid.paint* (never place more than one) and Canvas.svelte (no painting
 * on drag or hold).
 */
export const SINGLE_DROP_MATERIALS: readonly MaterialId[] = [
  MaterialId.Mason, MaterialId.Lumberjack, MaterialId.Farmer, MaterialId.Warrior, MaterialId.Skeleton,
  MaterialId.Lever, MaterialId.DefenseTower,
];

/** One further split inside a crowded PaletteCategory — its own id (looked up in the same CATEGORY_LABELS map the category itself uses) and the slice of the category's materials it covers. */
export interface PaletteSubcategory {
  id: string;
  materials: readonly MaterialId[];
}

export interface PaletteCategory {
  id: string;
  label: string;
  /** Icon.svelte glyph name representing the whole category on its tab. */
  icon: string;
  materials: readonly MaterialId[];
  /**
   * Present only for a category crowded enough to split further — picking
   * the tab then asks which one first (see BottomPanel's subcategory
   * popup) instead of dumping every material from every subcategory into
   * one grid at once. `materials` above still lists the category's full
   * set (every subcategory's materials combined), so anything that just
   * wants "all of Elétricos" — the hints modal's own category browser,
   * say — doesn't need to know subcategories exist at all.
   */
  subcategories?: readonly PaletteSubcategory[];
}

/**
 * Player-facing grouping for the material picker — thematic, not the same
 * split as `MaterialCategory` (which is about simulation physics: Metal and
 * Vidro are both "Solid" for movement purposes but belong in very different
 * mental buckets for a player scanning a menu). This is the single source
 * of truth for both the categorized picker (BottomPanel) and the hints
 * modal (HintsModal) — add a new material to a category here and it
 * automatically shows up in both places.
 */
/**
 * Eight player-facing groups: the three matter states (Pó / Sólidos /
 * Líquidos), plants, wildlife and o povo split apart instead of one crowded
 * "Vida" bucket, the circuit fixtures grouped as their own "Elétricos" tab,
 * and whatever's left over in "Especiais". Trigo isn't here — only a
 * Fazendeiro grows it. The eraser, drag brush and gravity toggle aren't
 * materials at all; the UI keeps them in their own always-visible tools
 * panel.
 */
export const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    id: "po",
    label: "Pó",
    icon: "sand",
    // Pedra belongs here, not in Sólidos — it's simulated as a Powder (see
    // MaterialCategory.Powder on its own MaterialDef), just a heavier,
    // duller grain than Areia.
    materials: [MaterialId.Sand, MaterialId.Dirt, MaterialId.Mud, MaterialId.Salt, MaterialId.Gunpowder, MaterialId.Stone],
  },
  {
    id: "solidos",
    label: "Sólidos",
    icon: "metal",
    materials: [
      MaterialId.Wood, MaterialId.Metal, MaterialId.Glass, MaterialId.Brick,
      MaterialId.Ice, MaterialId.C4, MaterialId.HeatBlock, MaterialId.ColdBlock,
    ],
    subcategories: [
      { id: "solidos-construcao", materials: [MaterialId.Wood, MaterialId.Metal, MaterialId.Glass, MaterialId.Brick] },
      { id: "solidos-especiais", materials: [MaterialId.Ice, MaterialId.C4, MaterialId.HeatBlock, MaterialId.ColdBlock] },
    ],
  },
  {
    id: "liquidos",
    label: "Líquidos",
    icon: "water",
    materials: [MaterialId.Water, MaterialId.Oil, MaterialId.Acid, MaterialId.Lava],
  },
  {
    id: "plantas",
    label: "Plantas",
    icon: "plant",
    materials: [MaterialId.Plant, MaterialId.Seed, MaterialId.Vida],
  },
  {
    id: "fauna",
    label: "Fauna",
    icon: "bird",
    materials: [MaterialId.Ant, MaterialId.Bird, MaterialId.Fish],
  },
  {
    id: "povo",
    label: "Povo",
    icon: "folk",
    materials: [
      MaterialId.Mason, MaterialId.Lumberjack, MaterialId.Farmer, MaterialId.Warrior, MaterialId.Skeleton,
    ],
    subcategories: [
      { id: "povo-trabalhadores", materials: [MaterialId.Mason, MaterialId.Lumberjack, MaterialId.Farmer] },
      { id: "povo-combate", materials: [MaterialId.Warrior, MaterialId.Skeleton] },
    ],
  },
  {
    id: "eletricos",
    label: "Elétricos",
    icon: "electricity",
    materials: [
      MaterialId.Electricity, MaterialId.Lever, MaterialId.Wire,
      MaterialId.LightningRod, MaterialId.Fan, MaterialId.DefenseTower,
      MaterialId.Drain, MaterialId.Pipe, MaterialId.Torneira,
    ],
    subcategories: [
      { id: "eletricos-basico", materials: [MaterialId.Electricity, MaterialId.Lever, MaterialId.Wire] },
      { id: "eletricos-dispositivos", materials: [MaterialId.LightningRod, MaterialId.Fan, MaterialId.DefenseTower] },
      { id: "eletricos-hidraulica", materials: [MaterialId.Drain, MaterialId.Pipe, MaterialId.Torneira] },
    ],
  },
  {
    id: "portoes",
    label: "Portões",
    icon: "gate",
    // Geral first (the "blocks everything" one players reach for by
    // default), then the three single-category ones in the same order the
    // categories are always listed elsewhere (Povo/Fauna, Líquidos, Pó).
    materials: [
      MaterialId.GateGeneral, MaterialId.GateCreature, MaterialId.GateLiquid, MaterialId.GatePowder,
    ],
  },
  {
    id: "especiais",
    label: "Especiais",
    icon: "fire",
    materials: [MaterialId.Fire, MaterialId.Clone, MaterialId.Magic, MaterialId.CombustibleGas],
  },
];

/** Icon name shown for each material, in the palette and in the hints modal. */
export const ICON_BY_MATERIAL: Record<MaterialId, string> = {
  [MaterialId.Empty]: "eraser",
  [MaterialId.Sand]: "sand",
  [MaterialId.Water]: "water",
  [MaterialId.Stone]: "stone",
  [MaterialId.Wood]: "wood",
  [MaterialId.Fire]: "fire",
  [MaterialId.Plant]: "plant",
  [MaterialId.Dirt]: "dirt",
  [MaterialId.Mud]: "mud",
  [MaterialId.Electricity]: "electricity",
  [MaterialId.Metal]: "metal",
  [MaterialId.Seed]: "seed",
  [MaterialId.Acid]: "acid",
  [MaterialId.Gunpowder]: "gunpowder",
  [MaterialId.Oil]: "oil",
  [MaterialId.Salt]: "salt",
  [MaterialId.Lava]: "lava",
  [MaterialId.Vida]: "life",
  [MaterialId.Ice]: "ice",
  [MaterialId.Glass]: "glass",
  [MaterialId.Clone]: "clone",
  [MaterialId.HeatBlock]: "heat-block",
  [MaterialId.ColdBlock]: "cold-block",
  [MaterialId.C4]: "c4",
  // Vapor/Vapor de Ácido are never directly paintable — only ever appear
  // by boiling — but the type still needs an entry for every id.
  [MaterialId.Steam]: "water",
  [MaterialId.AcidVapor]: "acid",
  [MaterialId.CombustibleGas]: "gas",
  [MaterialId.Ant]: "ant",
  [MaterialId.Bird]: "bird",
  [MaterialId.Fish]: "fish",
  [MaterialId.Magic]: "magic",
  [MaterialId.Mason]: "mason",
  [MaterialId.Lumberjack]: "lumberjack",
  [MaterialId.Farmer]: "farmer",
  [MaterialId.Warrior]: "warrior",
  [MaterialId.Skeleton]: "skeleton",
  [MaterialId.Brick]: "brick",
  // Sprout and Flor only ever appear by germinating from a Semente —
  // neither has a palette button, but the type still needs an entry for
  // every id.
  [MaterialId.Wheat]: "wheat",
  [MaterialId.Sprout]: "plant",
  [MaterialId.Flor]: "plant",
  [MaterialId.Lever]: "lever",
  [MaterialId.Wire]: "wire",
  [MaterialId.GateGeneral]: "gate-general",
  [MaterialId.GateCreature]: "gate-creature",
  [MaterialId.GateLiquid]: "gate-liquid",
  [MaterialId.GatePowder]: "gate-powder",
  [MaterialId.LightningRod]: "lightning-rod",
  [MaterialId.Fan]: "fan",
  [MaterialId.DefenseTower]: "defense-tower",
  [MaterialId.Drain]: "drain",
  [MaterialId.Pipe]: "pipe",
  [MaterialId.Torneira]: "faucet",
};
