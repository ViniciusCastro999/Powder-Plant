import type { SimGrid } from "../grid";
import { WATER_BOIL_TEMP } from "../grid";
import { MaterialId, MaterialCategory } from "../types";
import { MATERIALS } from "../materials";
import { NEIGHBORS_8 } from "../neighbors";
import { HOUSE_WALL_META } from "../houseBlueprints";
import {
  CREATURE_FED_MAX, CREATURE_STARVE_DEATH_CHANCE, packCreature, creatureFacing, creatureFed, creatureTimer,
} from "../creatureMeta";

/*
 * ── Creatures (Formiga, Pássaro, Peixe) ───────────────────────────────────
 * Animals don't fall — they pursue a simple goal each tick (a walker
 * hugging surfaces, a bird holding a cruising altitude, a fish staying
 * submerged). All three pack their state into the shared creature `meta`
 * layout (see creatureMeta.ts).
 */

/** Per-tick chance a submerged/idle Formiga drowns while touching Água. */
const ANT_DROWN_CHANCE = 0.2;
/** Ticks between each 1-point drain of a Formiga's fed gauge (so ~31·this ticks — roughly half a minute — of grace with no food at all). */
const ANT_HUNGER_INTERVAL = 55;
/** Per-tick chance a Formiga eats a touching Planta/Broto/Flor/Semente. */
const ANT_EAT_CHANCE = 0.5;
/** Per-tick chance a Formiga gnaws a touching solid it can actually eat (Madeira, Barro) — much slower than fresh greenery, so an ant-infested wooden wall crumbles gradually rather than vanishing. */
const ANT_EAT_SOLID_CHANCE = 0.06;
/** Fed points one bite of solid food restores (a full Planta/Semente meal tops the gauge right off). */
const ANT_SOLID_FEED_GAIN = 14;
/** Per-tick chance a well-fed Formiga next to an empty cell lays a new Formiga there. */
const ANT_BREED_CHANCE = 0.006;
/** Per-tick chance a walking Formiga burrows one step into loose Areia/Terra/Barro instead of only walking on top of it — this is what carves anthill tunnels. */
const ANT_DIG_CHANCE = 0.08;
/** Per-tick chance a Formiga spontaneously reverses direction, so a colony wanders instead of marching one way forever. */
const ANT_TURN_CHANCE = 0.03;
/** How many cells away a Formiga picks up the scent of food (Planta/Broto/Flor/Semente/Madeira/Barro) and turns toward it. */
const ANT_SMELL_RANGE = 7;

/** Rows from the top / fraction of height a Pássaro tries to stay between — it climbs when below the band and descends when above it. */
const BIRD_BAND_TOP_FRAC = 0.08;
const BIRD_BAND_BOTTOM_FRAC = 0.62;
/** How many cells away a Pássaro notices Fogo/Lava and starts fleeing. */
const BIRD_HAZARD_RANGE = 7;
/** How far a Pássaro spots a Formiga on the ground or a Peixe breaking the surface, then swoops straight at it. */
const BIRD_HUNT_RANGE = 13;
/** Fed level below which a Pássaro leaves its high cruise and patrols low to hunt. */
const BIRD_HUNGER_DIVE = 19;
/** Ticks between each 1-point drain of a Pássaro's fed gauge. */
const BIRD_HUNGER_INTERVAL = 55;
/** Fed points a Pássaro gains from one meal (Semente, Formiga, Peixe). */
const BIRD_FEED_GAIN = 12;
/** Per-tick chance a well-fed Pássaro drops a Semente into the open cell below it — deliberately tiny, since a whole flock shares this roll every tick. */
const BIRD_LAY_CHANCE = 0.0025;
const BIRD_TURN_CHANCE = 0.04;

/** Flop-timer steps (bits 1..2, so 0-3) a Peixe survives out of water; the timer only advances every FISH_AIR_TICK_SCALE ticks, so total grace ≈ FISH_AIR_TICKS·FISH_AIR_TICK_SCALE ticks of flopping to find its way back. */
const FISH_AIR_TICKS = 3;
const FISH_AIR_TICK_SCALE = 9;
/** Ticks between each 1-point drain of a Peixe's fed gauge. */
const FISH_HUNGER_INTERVAL = 70;
/** Per-tick chance a Peixe nibbles a touching submerged Planta/Broto/Semente. */
const FISH_EAT_CHANCE = 0.35;
/** Rows overhead a Peixe watches for a Pássaro — spots one and it dives for deep water, its only escape from a swoop. */
const FISH_BIRD_SCARE = 5;
/** Per-tick chance a well-fed Peixe with room around it spawns another Peixe into an adjacent Água cell. */
const FISH_BREED_CHANCE = 0.005;

/** A random empty 8-neighbour of (x, y), or null if the cell is walled in. */
export function randomEmptyNeighbor(grid: SimGrid, x: number, y: number): [number, number] | null {
  const spots: [number, number][] = [];
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Empty) spots.push([nx, ny]);
  }
  return spots.length ? spots[Math.floor(Math.random() * spots.length)] : null;
}

/** Step direction [dx, dy] (each -1/0/1) toward the nearest food a Formiga can smell within ANT_SMELL_RANGE, or [0, 0] if there's none. */
export function antScentDir(grid: SimGrid, x: number, y: number): [number, number] {
  let bestD = Infinity;
  let best: [number, number] = [0, 0];
  for (let dy = -ANT_SMELL_RANGE; dy <= ANT_SMELL_RANGE; dy++) {
    for (let dx = -ANT_SMELL_RANGE; dx <= ANT_SMELL_RANGE; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const id = grid.material[grid.index(nx, ny)] as MaterialId;
      if (
        id !== MaterialId.Plant && id !== MaterialId.Sprout && id !== MaterialId.Flor &&
        id !== MaterialId.Seed && id !== MaterialId.Wood && id !== MaterialId.Mud
      ) {
        continue;
      }
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = [Math.sign(dx), Math.sign(dy)];
      }
    }
  }
  return best;
}

/**
 * Moves a Peixe into an adjacent Água cell, keeping each side's meaning
 * intact — the fish's state byte follows the fish, and the water's
 * salinity stays with the water it left behind. `swap()` can't be used
 * here: it would trade the two meta bytes, turning the fish's hunger
 * gauge into a salinity reading and vice-versa.
 */
export function moveFish(grid: SimGrid, fx: number, fy: number, tx: number, ty: number, fishMeta: number): void {
  const fi = grid.index(fx, fy);
  const ti = grid.index(tx, ty);
  const salinity = grid.meta[ti];
  grid.material[ti] = MaterialId.Fish;
  grid.meta[ti] = fishMeta;
  grid.material[fi] = MaterialId.Water;
  grid.meta[fi] = salinity;
  grid.processed[fi] = 1;
  grid.processed[ti] = 1;
  grid.wake(fx, fy);
  grid.wake(tx, ty);
}

/**
 * Formiga: a surface walker. Falls when nothing's underfoot, otherwise
 * trudges along the ground in its facing direction — stepping down slopes,
 * climbing walls and low steps, burrowing through loose Areia/Terra/Barro
 * (which carves tunnels as the displaced grain spills back), and turning
 * around at water's edge or a dead end. Eats touching Planta/Broto/Flor/
 * Semente to refill a hunger gauge that drains over time (it starves
 * without food) and, when well fed, occasionally lays another Formiga.
 * Drowns in Água, burns in Fogo/Lava.
 */
export function stepAnt(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  let facing = creatureFacing(grid.meta[i]);
  let fed = creatureFed(grid.meta[i]);

  // An ant walking a shoreline has water to one side and is fine — it only
  // drowns when it's actually *in* it: water directly underfoot, or water
  // on most sides. Fogo/Lava on any side is instantly fatal.
  let waterBelow = false;
  let waterAround = 0;
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nId = grid.material[grid.index(nx, ny)] as MaterialId;
    if (nId === MaterialId.Water) {
      waterAround++;
      if (dx === 0 && dy === 1) waterBelow = true;
    } else if (nId === MaterialId.Lava) {
      grid.igniteAt(x, y);
      return;
    }
    // Touching Fogo is *not* handled here — the flame's own per-tick
    // ignition roll (stepFire, gated by this material's ignitionChance)
    // lights the ant, which is the same mechanism that then carries the
    // fire on to the next ant. A brief spark it can walk away from; a
    // sustained fire is still certain death within a tick or two.
  }
  if ((waterBelow || waterAround >= 3) && Math.random() < ANT_DROWN_CHANCE) {
    grid.set(x, y, MaterialId.Empty);
    return;
  }

  // Two food classes: fresh greenery (fast, fills the gauge right up) and
  // gnawable solids — Madeira and Barro — which ants really do eat, just
  // slowly, so an ant-ridden wooden wall wears away over time.
  const foods: [number, number][] = [];
  const solidFoods: [number, number][] = [];
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nId = grid.get(nx, ny);
    if (nId === MaterialId.Plant || nId === MaterialId.Sprout || nId === MaterialId.Flor || nId === MaterialId.Seed) {
      foods.push([nx, ny]);
    } else if (
      (nId === MaterialId.Wood || nId === MaterialId.Mud) &&
      (grid.meta[grid.index(nx, ny)] & HOUSE_WALL_META) === 0 // don't gnaw a house
    ) {
      solidFoods.push([nx, ny]);
    }
  }
  const breed = (): void => {
    if (Math.random() >= ANT_BREED_CHANCE) return;
    const spot = randomEmptyNeighbor(grid, x, y);
    if (spot) {
      grid.set(spot[0], spot[1], MaterialId.Ant, packCreature(Math.random() < 0.5 ? 1 : -1, 0, CREATURE_FED_MAX >> 1));
    }
  };
  if (foods.length > 0) {
    if (Math.random() < ANT_EAT_CHANCE) {
      const [fx, fy] = foods[Math.floor(Math.random() * foods.length)];
      grid.set(fx, fy, MaterialId.Empty);
      fed = CREATURE_FED_MAX;
      breed();
    }
  } else if (solidFoods.length > 0) {
    if (Math.random() < ANT_EAT_SOLID_CHANCE) {
      const [fx, fy] = solidFoods[Math.floor(Math.random() * solidFoods.length)];
      grid.set(fx, fy, MaterialId.Empty);
      fed = Math.min(CREATURE_FED_MAX, fed + ANT_SOLID_FEED_GAIN);
      breed();
    }
  } else if (fed > 0 && Math.random() < 1 / ANT_HUNGER_INTERVAL) {
    fed--;
  } else if (fed === 0 && Math.random() < CREATURE_STARVE_DEATH_CHANCE) {
    grid.set(x, y, MaterialId.Empty);
    return;
  }

  if (Math.random() < ANT_TURN_CHANCE) facing = -facing;

  // Follows a scent: if there's food it isn't already touching within
  // smelling distance, the ant turns toward it and heads over (climbing
  // if it's above) — this is what keeps a colony gathered on a plant
  // patch or gnawing up into a wooden post instead of every ant
  // wandering off after one nibble.
  // The scent check is a small area scan — only run it every few ticks
  // per ant (staggered by column so they don't all scan the same frame);
  // food doesn't move, so re-sniffing every single tick buys nothing.
  let scentUp = false;
  if (foods.length === 0 && solidFoods.length === 0 && (grid.tick + x) % 3 === 0) {
    const [sdx, sdy] = antScentDir(grid, x, y);
    if (sdx !== 0) facing = sdx;
    scentUp = sdy < 0;
  } else if (solidFoods.length > 0) {
    // Gnawing at a solid — keep pushing up into the chamber it's hollowing
    // out rather than dropping back to flat ground.
    scentUp = grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Empty;
  }

  const below = grid.inBounds(x, y + 1) ? grid.get(x, y + 1) : MaterialId.Stone;
  if (below === MaterialId.Empty) {
    grid.moveCreature(x, y, x, y + 1, packCreature(facing, 0, fed));
    return;
  }

  const fwd = x + facing;

  // Food sensed above (a plant clump overhead, wood it has eaten up into):
  // climb toward it rather than trudging along flat ground past it.
  if (scentUp) {
    if (grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Empty && Math.random() < 0.7) {
      grid.moveCreature(x, y, x, y - 1, packCreature(facing, 0, fed));
      return;
    }
    if (grid.inBounds(fwd, y - 1) && grid.get(fwd, y - 1) === MaterialId.Empty && Math.random() < 0.5) {
      grid.moveCreature(x, y, fwd, y - 1, packCreature(facing, 0, fed));
      return;
    }
  }

  const fwdId = grid.inBounds(fwd, y) ? grid.get(fwd, y) : MaterialId.Stone;
  if (fwdId === MaterialId.Water) {
    grid.meta[i] = packCreature(-facing, 0, fed);
    return;
  }
  if (fwdId === MaterialId.Empty) {
    const belowFwd = grid.inBounds(fwd, y + 1) ? grid.get(fwd, y + 1) : MaterialId.Stone;
    const target: [number, number] = belowFwd === MaterialId.Empty ? [fwd, y + 1] : [fwd, y];
    grid.moveCreature(x, y, target[0], target[1], packCreature(facing, 0, fed));
    return;
  }
  if (
    (fwdId === MaterialId.Sand || fwdId === MaterialId.Dirt || fwdId === MaterialId.Mud) &&
    Math.random() < ANT_DIG_CHANCE
  ) {
    grid.swap(x, y, fwd, y);
    grid.meta[grid.index(fwd, y)] = packCreature(facing, 0, fed);
    grid.meta[i] = 0;
    return;
  }
  // Blocked by another animal (the ant ahead in the trail, a bird, a fish):
  // just turn or wait rather than clambering over it — that eager climb was
  // what made a painted line of ants burst apart into a cloud in one tick,
  // so fire had nothing left to spread between.
  if (MATERIALS[fwdId].category === MaterialCategory.Creature) {
    grid.meta[i] = packCreature(Math.random() < 0.4 ? -facing : facing, 0, fed);
    return;
  }
  const upId = grid.inBounds(x, y - 1) ? grid.get(x, y - 1) : MaterialId.Stone;
  if (upId === MaterialId.Empty && Math.random() < 0.45) {
    grid.moveCreature(x, y, x, y - 1, packCreature(facing, 0, fed));
    return;
  }
  const fwdUpId = grid.inBounds(fwd, y - 1) ? grid.get(fwd, y - 1) : MaterialId.Stone;
  if (fwdUpId === MaterialId.Empty && Math.random() < 0.35) {
    grid.moveCreature(x, y, fwd, y - 1, packCreature(facing, 0, fed));
    return;
  }
  grid.meta[i] = packCreature(-facing, 0, fed);
}

/**
 * The nearest thing a Pássaro will swoop on — a Formiga, or a Peixe that's
 * broken the surface (has an Empty cell beside it, so the bird can reach
 * it without diving underwater) — within BIRD_HUNT_RANGE, or null. Returns
 * the [dx, dy] step direction toward it.
 */
export function birdPreyDir(grid: SimGrid, x: number, y: number): [number, number] | null {
  let bestD = Infinity;
  let best: [number, number] | null = null;
  for (let dy = -BIRD_HUNT_RANGE; dy <= BIRD_HUNT_RANGE; dy++) {
    for (let dx = -BIRD_HUNT_RANGE; dx <= BIRD_HUNT_RANGE; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const id = grid.material[grid.index(nx, ny)] as MaterialId;
      let prey = false;
      if (id === MaterialId.Ant) {
        prey = true;
      } else if (id === MaterialId.Fish) {
        prey = ([[0, -1], [-1, 0], [1, 0], [0, 1]] as const).some(([ax, ay]) => {
          const fx = nx + ax;
          const fy = ny + ay;
          return grid.inBounds(fx, fy) && grid.get(fx, fy) === MaterialId.Empty;
        });
      }
      if (!prey) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = [Math.sign(dx), Math.sign(dy)];
      }
    }
  }
  return best;
}

/**
 * Pássaro: cruises open air in a lazy band near the top of the scene, but
 * breaks off to **swoop** the moment it spots a Formiga on the ground or a
 * Peixe at the surface within BIRD_HUNT_RANGE — diving straight at it and
 * snatching it on contact. Flees Fogo/Lava (which always wins over a
 * hunt), and, with energy to spare, drops a Semente into the open cell
 * below it now and then. Burns if it can't get clear of flame.
 */
export function stepBird(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  let facing = creatureFacing(grid.meta[i]);
  let fed = creatureFed(grid.meta[i]);

  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    if (grid.get(nx, ny) === MaterialId.Lava) {
      grid.igniteAt(x, y);
      return;
    }
    // Fogo is left to the flame's own ignition roll (see stepFire) — that
    // way a burning bird reliably passes the fire to the next one instead
    // of just dying alone.
  }

  const foods: [number, number][] = [];
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nId = grid.get(nx, ny);
    if (nId === MaterialId.Seed || nId === MaterialId.Ant || nId === MaterialId.Fish) foods.push([nx, ny]);
  }
  // A swoop lands its catch far more reliably than an idle peck — prey
  // it's actually reached rarely gets away.
  if (foods.length > 0 && Math.random() < 0.85) {
    const [fx, fy] = foods[Math.floor(Math.random() * foods.length)];
    grid.set(fx, fy, MaterialId.Empty);
    fed = Math.min(CREATURE_FED_MAX, fed + BIRD_FEED_GAIN);
  } else if (fed > 0 && Math.random() < 1 / BIRD_HUNGER_INTERVAL) {
    fed--;
  } else if (fed === 0 && Math.random() < CREATURE_STARVE_DEATH_CHANCE) {
    grid.set(x, y, MaterialId.Empty);
    return;
  }

  if (
    fed > 20 && Math.random() < BIRD_LAY_CHANCE &&
    grid.inBounds(x, y + 2) &&
    grid.get(x, y + 1) === MaterialId.Empty && grid.get(x, y + 2) === MaterialId.Empty
  ) {
    // Two clear cells below, so the seed actually drops away instead of
    // hanging in a packed flock.
    grid.set(x, y + 1, MaterialId.Seed);
    fed -= 6;
  }

  let flee = 0;
  for (let dy = -BIRD_HAZARD_RANGE; dy <= BIRD_HAZARD_RANGE && flee === 0; dy++) {
    for (let dx = -BIRD_HAZARD_RANGE; dx <= BIRD_HAZARD_RANGE; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.material[grid.index(nx, ny)] as MaterialId;
      if (nId === MaterialId.Fire || nId === MaterialId.Lava) {
        flee = dx >= 0 ? -1 : 1;
        break;
      }
    }
  }

  const bandTop = Math.ceil(grid.height * BIRD_BAND_TOP_FRAC);
  // A peckish bird drops out of its lazy high cruise and patrols low over
  // the ground/water, hunting — which is what brings it within swooping
  // range of Formigas and surfacing Peixes. Once it's eaten its fill it
  // climbs back up to soar.
  const hungry = fed < BIRD_HUNGER_DIVE;
  const bandBottom = hungry
    ? grid.height - 3
    : Math.floor(grid.height * BIRD_BAND_BOTTOM_FRAC);
  let vbias: number;
  if (y < bandTop) vbias = 1;
  else if (y > bandBottom) vbias = -1;
  else if (hungry) vbias = Math.random() < 0.55 ? 1 : 0;
  else vbias = Math.random() < 0.3 ? -1 : Math.random() < 0.4 ? 1 : 0;

  // Hunt (only while peckish, and not fleeing): a spotted Formiga/Peixe
  // pulls the bird straight at it, ignoring the cruising band. A well-fed
  // bird just soars and lets prey be — that oscillation is what stops a
  // flock from hoovering every ant and fish off the map. Also the pricey
  // area scan then only runs for the birds actually hunting.
  const hunt = hungry && flee === 0 ? birdPreyDir(grid, x, y) : null;

  let tries: [number, number][];
  if (flee !== 0) {
    facing = flee;
    tries = [[flee, -1], [flee, 0], [0, -1], [flee, 1]];
  } else if (hunt) {
    const [hx, hy] = hunt;
    if (hx !== 0) facing = hx;
    tries = [
      [hx, hy],
      [hx, 0],
      [0, hy],
      [hx, -hy],
      [facing, 0],
    ];
  } else {
    if (Math.random() < BIRD_TURN_CHANCE) facing = -facing;
    tries = [
      [facing, vbias],
      [facing, 0],
      [0, vbias],
      [facing, vbias === 0 ? -1 : vbias],
      [0, -1],
    ];
  }
  for (const [mx, my] of tries) {
    if (mx === 0 && my === 0) continue;
    const nx = x + mx;
    const ny = y + my;
    if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Empty) {
      grid.moveCreature(x, y, nx, ny, packCreature(facing, 0, fed));
      return;
    }
  }
  grid.meta[i] = packCreature(-facing, 0, fed);
}

/**
 * Peixe: swims only inside Água, nudging horizontally in its facing
 * direction with a gentle vertical wander and shying away from the open
 * surface. Nibbles submerged Planta/Broto/Semente for food, breeds in
 * roomy water when well fed, and dies to Ácido/Lava/Fogo on contact or to
 * water that's come to a boil. Out of water it flops around a few ticks
 * (its `timer` nibble counting up) and then suffocates.
 */
export function stepFish(grid: SimGrid, x: number, y: number, i: number): void {
  grid.processed[i] = 1;
  let facing = creatureFacing(grid.meta[i]);
  let timer = creatureTimer(grid.meta[i]);
  let fed = creatureFed(grid.meta[i]);

  let waterCount = 0;
  let airCount = 0;
  const sideWater: [number, number][] = [];
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nId = grid.material[grid.index(nx, ny)] as MaterialId;
    if (nId === MaterialId.Acid || nId === MaterialId.Lava || nId === MaterialId.Fire) {
      grid.set(x, y, MaterialId.Empty);
      return;
    }
    if (nId === MaterialId.Water) {
      waterCount++;
      if (dx === 0 || dy === 0) sideWater.push([nx, ny]);
    } else if (nId === MaterialId.Empty) {
      airCount++;
    }
  }

  if (grid.temperature >= WATER_BOIL_TEMP && waterCount > 0 && Math.random() < 0.05) {
    grid.set(x, y, MaterialId.Empty);
    return;
  }

  if (waterCount === 0) {
    // Only actually suffocating if it's out in the air. Packed shoulder to
    // shoulder with other fish (no water *or* air touching) it's just
    // stuck for a beat — it'll get water back as the shoal shifts.
    if (airCount === 0) {
      grid.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    // The flop timer only advances every few ticks, so a fish flung onto
    // the bank has a real moment to thrash its way back to the water.
    if (grid.tick % FISH_AIR_TICK_SCALE === 0) timer++;
    if (timer >= FISH_AIR_TICKS) {
      grid.set(x, y, MaterialId.Empty);
      return;
    }
    const spots: [number, number][] = [];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Empty) spots.push([nx, ny]);
    }
    if (spots.length > 0) {
      const [nx, ny] = spots[Math.floor(Math.random() * spots.length)];
      grid.moveCreature(x, y, nx, ny, packCreature(facing, timer, fed));
    } else {
      grid.meta[i] = packCreature(facing, timer, fed);
    }
    return;
  }
  timer = 0;

  const foods: [number, number][] = [];
  for (const [dx, dy] of NEIGHBORS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nId = grid.get(nx, ny);
    if (nId === MaterialId.Plant || nId === MaterialId.Sprout || nId === MaterialId.Seed) foods.push([nx, ny]);
  }
  if (foods.length > 0 && Math.random() < FISH_EAT_CHANCE) {
    const [fx, fy] = foods[Math.floor(Math.random() * foods.length)];
    grid.set(fx, fy, MaterialId.Empty);
    fed = CREATURE_FED_MAX;
  } else if (fed > 0 && Math.random() < 1 / FISH_HUNGER_INTERVAL) {
    fed--;
  } else if (fed === 0 && Math.random() < CREATURE_STARVE_DEATH_CHANCE) {
    grid.set(x, y, MaterialId.Empty);
    return;
  }

  if (fed >= CREATURE_FED_MAX - 4 && waterCount >= 4 && sideWater.length > 0 && Math.random() < FISH_BREED_CHANCE) {
    const [bx, by] = sideWater[Math.floor(Math.random() * sideWater.length)];
    const bi = grid.index(bx, by);
    grid.material[bi] = MaterialId.Fish;
    grid.meta[bi] = packCreature(Math.random() < 0.5 ? 1 : -1, 0, CREATURE_FED_MAX >> 1);
    grid.processed[bi] = 1;
    grid.wake(bx, by);
    fed -= 8;
  }

  if (Math.random() < 0.03) facing = -facing;

  // A Pássaro hovering just overhead: bolt for deeper water. This is the
  // fish's one defence against a swoop — stay down and the bird can't
  // reach it.
  let birdAbove = false;
  for (let sy = 1; sy <= FISH_BIRD_SCARE && !birdAbove; sy++) {
    for (let sx = -2; sx <= 2; sx++) {
      if (grid.inBounds(x + sx, y - sy) && grid.get(x + sx, y - sy) === MaterialId.Bird) {
        birdAbove = true;
        break;
      }
    }
  }

  const aboveEmpty = grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Empty;
  const vbias = birdAbove ? 1 : aboveEmpty ? 1 : Math.random() < 0.25 ? -1 : Math.random() < 0.3 ? 1 : 0;
  const tries: [number, number][] = [
    [facing, vbias],
    [facing, 0],
    [0, vbias],
    [-facing, 0],
    [0, 1],
  ];
  for (const [mx, my] of tries) {
    if (mx === 0 && my === 0) continue;
    const nx = x + mx;
    const ny = y + my;
    if (grid.inBounds(nx, ny) && grid.get(nx, ny) === MaterialId.Water) {
      moveFish(grid, x, y, nx, ny, packCreature(facing, 0, fed));
      return;
    }
  }
  grid.meta[i] = packCreature(facing, 0, fed);
}
