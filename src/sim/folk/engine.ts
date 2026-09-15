import type { SimGrid } from "../grid";
import { MaterialId, MaterialCategory } from "../types";
import { MATERIALS } from "../materials";
import { COLD_1, HOT_2 } from "../temperature";
import { NEIGHBORS_8 } from "../neighbors";
import { WHEAT_RIPE } from "../metaBits";
import {
  HOUSE_WALLS, HOUSE_WALL_META, HOUSE_ANCHOR_META, HOUSE_KIND_MASK, HOUSE_FLOOR,
  HOUSE_DECK, HOUSE_STAIR, HOUSE_PLANS, type HousePlan, houseType,
} from "../houseBlueprints";
import { CREATURE_FED_MAX, CREATURE_STARVE_DEATH_CHANCE, packCreature } from "../creatureMeta";
import { FOLK_SCAN_RANGE, FOLK_FORAGE_HUNGER, FOLK_WADEABLE, FOLK_IDS } from "../grid";

/*
 * ── O povo (Construtor, Lenhador, Plantador, Guerreiro): motor compartilhado ──
 * Every trade shares this same surface-walk / upkeep / weather / shelter
 * engine; each trade's own AI (stepMason, stepLumberjack, ...) just supplies
 * a `wantDir` and lets `folkWalk` get it there over or through whatever's
 * in the way.
 */

const FOLK_HUNGER_INTERVAL = 320;
const FOLK_DROWN_CHANCE = 0.03;
const FOLK_EAT_CHANCE = 0.4;
/**
 * A Pip only takes a turn (a step, and any work that goes with it) every
 * Nth tick, staggered by its column so a crowd doesn't all move on the same
 * frame. Higher = slower, more deliberate folk. Everything a Pip does —
 * walking, digging, building, tending — is paced by this, so the trades
 * read as unhurried labour rather than a scramble.
 */
const FOLK_ACT_INTERVAL = 4;
/** How far off an idle Pip will still spot its worksite and amble back toward it rather than striking out across the map. Only kicks in past FOLK_HOME_NEAR, so Pips at work roam freely and don't pile up. */
const FOLK_HOME_RANGE = 60;
/** Inside this many cells of a worksite a Pip roams free; past it, it ambles back. A Construtor gets a longer leash — it has to range out past a whole village to find fresh ground for the next house. */
const FOLK_HOME_NEAR = 20;
const MASON_HOME_NEAR = 36;
/**
 * What an idle Pip of each trade drifts back toward — its own kind of
 * worksite, plus the houses. Never other folk: folk drawn to folk collapse
 * into one frozen clump.
 */
const FOLK_HOME: Partial<Record<MaterialId, readonly MaterialId[]>> = {
  [MaterialId.Mason]: [MaterialId.Brick],
  [MaterialId.Farmer]: [MaterialId.Brick, MaterialId.Wheat, MaterialId.Mud],
  [MaterialId.Lumberjack]: [MaterialId.Brick, MaterialId.Wood, MaterialId.Sprout, MaterialId.Plant],
  [MaterialId.Warrior]: [MaterialId.Brick],
};
/** Below this it drops its trade entirely and makes for food — survival first. */
const FOLK_STARVING = 6;
/** How far a starving folk casts about for something to eat. */
const FOLK_FORAGE_RANGE = 38;
/** The only thing o povo eat: Trigo. They move the world around, they don't graze it. */
const FOLK_FORAGE: readonly MaterialId[] = [MaterialId.Wheat];
/** How far a chilled folk looks for a house to shelter in. */
const HOUSE_SHELTER_RANGE = 22;
/** Max wall thickness a boxed-in folk will squeeze straight through (see `folkPhase`). */
const FOLK_PHASE_REACH = 4;
/** Per-tick chance an idle folk (nothing to head toward, no village in sight) flips its facing — keeps it pacing a small patch instead of marching off in a straight line. */
const FOLK_WANDER_TURN = 0.22;

/**
 * Consecutive real actions folkWalk spends failing to make any headway on a
 * real want (see `stuckTicks`) before it gives up on it for a while — a
 * climb with no ledge at the top, a squeeze that never opens, a shaft too
 * packed to pass. Short enough that it doesn't read as ignoring an order,
 * long enough not to bail on an ordinary multi-step climb partway through.
 */
const FOLK_STUCK_LIMIT = 10;
/** Sentinel floor for `stuckTicks`: at or above this it means "currently giving up" rather than "counting failures" — see the give-up check at the top of folkWalk. */
const FOLK_GIVEUP_ZONE = 100;
/** How many further real actions the give-up (wantDir forced to 0) lasts — long enough for the spot to actually clear, short enough the folk is back on the job well within the same minute. */
const FOLK_GIVEUP_COOLDOWN = 50;

/** Ambient °C range the folk are content in; outside it they head indoors. */
const FOLK_COMFORT_MIN = COLD_1;
const FOLK_COMFORT_MAX = HOT_2;
/**
 * Per-tick exposure-death chance for an unsheltered folk, per degree the
 * climate is past the comfort band (capped) — gentle enough that a folk
 * that starts for home the moment the weather turns has time to get there,
 * lethal over a minute or two if it just stands out in a real blizzard.
 */
const FOLK_EXPOSURE_PER_DEGREE = 0.000012;
const FOLK_EXPOSURE_CAP = 0.0012;

  /** Collects the 8-neighbours of (x, y) whose material is in `ids`. */
export function adjacentOf(grid: SimGrid, x: number, y: number, ids: readonly MaterialId[]): [number, number][] {
    const out: [number, number][] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid.inBounds(nx, ny) && ids.includes(grid.get(nx, ny))) out.push([nx, ny]);
    }
    return out;
  }

  /**
   * Horizontal step (-1/0/1) toward the nearest cell in `ids` within `range`
   * (default FOLK_SCAN_RANGE), or 0. Only ever called on a Pip's own turn
   * (already staggered by FOLK_ACT_INTERVAL), so no extra gate here.
   */
export function folkScanForIds(grid: SimGrid, x: number, y: number, ids: readonly MaterialId[], range: number): number {
    let bestD = Infinity;
    let bestDx = 0;
    // Nearest match that's actually off to one side, tracked separately —
    // see below.
    let bestDOffAxis = Infinity;
    let bestDxOffAxis = 0;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inBounds(nx, ny)) continue;
        if (!ids.includes(grid.material[grid.index(nx, ny)] as MaterialId)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestDx = Math.sign(dx) || (dy < 0 ? (Math.random() < 0.5 ? 1 : -1) : 0);
        }
        if (dx !== 0 && d < bestDOffAxis) {
          bestDOffAxis = d;
          bestDxOffAxis = Math.sign(dx);
        }
      }
    }
    // The single nearest match can be straight up or down (dx === 0, dy >=
    // 0), which resolves to "no direction" above — that's the right answer
    // when it's truly the only thing around, but wrong when it's merely the
    // closest of several and a short walk sideways reaches an equally good
    // one. Prefer any off-axis match over a direction-less "nearest".
    return bestDx !== 0 ? bestDx : bestDxOffAxis;
  }
  /**
   * A horizontal step (-1/0/1) back toward the village — the nearest house or
   * fellow worker between ~8 and FOLK_HOME_RANGE cells off. An idle Pip uses
   * this so it drifts back to where the work is instead of striking out across
   * the map; a Pip already in among the houses (nothing past 8 cells, or
   * nothing at all) gets 0 and just paces where it is.
   */
export function folkHomeDir(grid: SimGrid, x: number, y: number, trade: MaterialId): number {
    const targets = FOLK_HOME[trade];
    if (!targets) return 0;
    const near = trade === MaterialId.Mason ? MASON_HOME_NEAR : FOLK_HOME_NEAR;
    // Expanding rings from r=1, so the first hit is the *nearest* worksite.
    // Within `near` of it the Pip is home and roams free (0); only a worksite
    // further off than that reels it back — never a far one while a near one
    // says it's already home.
    for (let r = 1; r <= FOLK_HOME_RANGE; r++) {
      for (let k = -r; k <= r; k++) {
        const probes: [number, number][] = [
          [x + k, y - r], [x + k, y + r], [x - r, y + k], [x + r, y + k],
        ];
        for (const [nx, ny] of probes) {
          if (!grid.inBounds(nx, ny)) continue;
          if (targets.includes(grid.material[grid.index(nx, ny)] as MaterialId)) {
            return r <= near ? 0 : (Math.sign(nx - x) || (Math.random() < 0.5 ? 1 : -1));
          }
        }
      }
    }
    return 0;
  }
export function folkScanDir(grid: SimGrid, x: number, y: number, ids: readonly MaterialId[]): number {
    return grid.folkScanForIds(x, y, ids, FOLK_SCAN_RANGE);
  }

  /**
   * The shared lethal-environment + feeding + hunger pass for a member of
   * o povo. Returns the (possibly lowered) fed value, or -1 if the folk
   * just died and the caller must bail. Água drowns it (only when it's
   * genuinely *in* the water — a shoreline is safe), Lava kills on contact;
   * it eats the same greenery/wood a Formiga does and otherwise starves,
   * very slowly.
   */
export function folkUpkeep(grid: SimGrid, x: number, y: number, fed: number): number {
    let waterBelow = false;
    let waterAround = 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.material[grid.index(nx, ny)] as MaterialId;
      if (nId === MaterialId.Lava) {
        grid.igniteAt(x, y);
        return -1;
      }
      if (nId === MaterialId.Water) {
        waterAround++;
        if (dx === 0 && dy === 1) waterBelow = true;
      }
    }
    // Only drowns when genuinely dragged under — water on all sides, no air
    // above. A folk swimming at the surface (air overhead) or wading a
    // shoreline is fine; it makes for the nearest shore in `folkWalk`.
    if (waterBelow && waterAround >= 7 && Math.random() < FOLK_DROWN_CHANCE) {
      grid.set(x, y, MaterialId.Empty);
      return -1;
    }

    // Trigo — the staple the Plantador grows. A Pip eats only when it's
    // actually peckish (so a standing field isn't grazed to nothing by a
    // well-fed crew milling through it): a ripe head once it's below its
    // forage threshold, a green shoot only when genuinely starving.
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const ni = grid.index(nx, ny);
      if (grid.material[ni] !== MaterialId.Wheat) continue;
      const ripe = grid.meta[ni] >= WHEAT_RIPE;
      if ((ripe && fed <= FOLK_FORAGE_HUNGER) || fed <= FOLK_STARVING) {
        if (Math.random() < FOLK_EAT_CHANCE) {
          grid.set(nx, ny, MaterialId.Empty);
          return CREATURE_FED_MAX;
        }
        return fed;
      }
    }

    // Exposure: a hostile climate with no roof over its head slowly kills,
    // the further past comfort the faster.
    const past =
      grid.temp < FOLK_COMFORT_MIN ? FOLK_COMFORT_MIN - grid.temp :
      grid.temp > FOLK_COMFORT_MAX ? grid.temp - FOLK_COMFORT_MAX : 0;
    if (past > 0 && !grid.folkSheltered(x, y)) {
      if (Math.random() < Math.min(FOLK_EXPOSURE_CAP, past * FOLK_EXPOSURE_PER_DEGREE)) {
        grid.set(x, y, MaterialId.Empty);
        return -1;
      }
    }

    if (fed > 0 && Math.random() < 1 / FOLK_HUNGER_INTERVAL) return fed - 1;
    // A Pip run right out of food doesn't drop dead — it's an agent you
    // placed, not livestock. It just sits at empty and keeps looking (see
    // the starving forage in `folkWalk`). Only a truly barren, foodless map
    // ever thins the crew, and very slowly.
    if (fed === 0 && Math.random() < CREATURE_STARVE_DEATH_CHANCE * 0.15) {
      grid.set(x, y, MaterialId.Empty);
      return -1;
    }
    return fed;
  }

  /** Whether (x, y) is under cover — a structural-solid roof within 4 cells straight up and a wall within 5 cells to each side (checked at this row and the two above, so a doorway lintel still counts as that side's wall). Purely geometric, so a hand-built brick box shelters as well as a mason's house. */
export function folkSheltered(grid: SimGrid, x: number, y: number): boolean {
    let roof = false;
    for (let d = 1; d <= 4; d++) {
      if (grid.inBounds(x, y - d) && HOUSE_WALLS.includes(grid.get(x, y - d))) {
        roof = true;
        break;
      }
    }
    if (!roof) return false;
    let left = false;
    let right = false;
    for (let d = 1; d <= 5; d++) {
      for (let up = 0; up <= 2; up++) {
        if (!left && grid.inBounds(x - d, y - up) && HOUSE_WALLS.includes(grid.get(x - d, y - up))) left = true;
        if (!right && grid.inBounds(x + d, y - up) && HOUSE_WALLS.includes(grid.get(x + d, y - up))) right = true;
      }
    }
    return left && right;
  }

  /**
   * The whole weather response for a member of o povo, run once per step
   * right after `folkUpkeep`. Returns true if it took over the folk's turn
   * (the caller must then just `return`):
   *
   *  - comfortable climate → false, the folk goes about its trade.
   *  - hostile + already sheltered → hunkers down in place (true).
   *  - hostile + a house within HOUSE_SHELTER_RANGE → walks toward the
   *    nearest one that still has room (each plan shelters HOUSE_PLANS
   *    capacity folk); a full house is skipped for the next. The scan is
   *    staggered every 3rd tick per column so a cold snap with a crowd of
   *    folk doesn't stall the sim; on the off ticks the folk keeps its
   *    heading.
   *  - hostile + no house in sight → false, the folk carries on (and takes
   *    the exposure risk from `folkUpkeep`) — better to keep moving and
   *    maybe stumble on cover than freeze on the spot.
   */
export function folkWeather(grid: SimGrid, x: number, y: number, i: number, facing: number, fed: number, carry: number): boolean {
    if (grid.temp >= FOLK_COMFORT_MIN && grid.temp <= FOLK_COMFORT_MAX) return false;

    if (grid.folkSheltered(x, y)) {
      // Hunker down and stay put — no `folkWalk`, since its squeeze-through-a-
      // wall fallback (`folkPhase`) could pop the folk straight back out into
      // the weather it just came in from.
      grid.meta[i] = packCreature(facing, carry, fed);
      return true;
    }

    const anchors: { ax: number; ay: number; d: number; plan: HousePlan }[] = [];
    for (let dy = -HOUSE_SHELTER_RANGE; dy <= HOUSE_SHELTER_RANGE; dy++) {
      const row = (y + dy) * grid.width;
      for (let dx = -HOUSE_SHELTER_RANGE; dx <= HOUSE_SHELTER_RANGE; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
        const ni = row + nx;
        if (grid.material[ni] !== MaterialId.Brick || (grid.meta[ni] & HOUSE_ANCHOR_META) === 0) continue;
        anchors.push({ ax: nx, ay: ny, d: dx * dx + dy * dy, plan: HOUSE_PLANS[houseType(grid.meta[ni])] });
      }
    }
    if (anchors.length === 0) return false; // nowhere to go — carry on
    anchors.sort((a, b) => a.d - b.d);
    let target = anchors[0];
    for (const h of anchors) {
      if (grid.folkCountIn(h.ax, h.ay, h.plan) < h.plan.capacity) { target = h; break; }
    }
    const homeX = target.ax + Math.min(2, target.plan.span - 1); // aim just inside
    grid.folkWalk(x, y, i, facing, fed, carry, Math.sign(homeX - x) || 1);
    return true;
  }

  /** How many folk are standing within a house's footprint (anchor at ax,ay). */
export function folkCountIn(grid: SimGrid, ax: number, ay: number, plan: HousePlan): number {
    let n = 0;
    for (let dy = -plan.rise; dy <= 0; dy++) {
      for (let dx = 0; dx <= plan.span; dx++) {
        if (FOLK_IDS.includes(grid.get(ax + dx, ay + dy))) n++;
      }
    }
    return n;
  }

  /**
   * Shared surface walk for o povo. A folk with a heading (`wantDir`, from
   * its trade) marches for it and gets *over or through* whatever's in the
   * way — climbs the wall, clambers the ledge, squeezes past a thin barrier.
   * A folk with nothing to head toward (`wantDir` 0) ambles, drifting its
   * facing at random so it meanders instead of pacing a fixed line. The one
   * thing it never does is the old "march into a wall, about-face, march
   * into the far wall, forever" metronome: a true dead end just makes it
   * wait for the way to open, and only rarely double back.
   */
export function folkWalk(
    grid: SimGrid, x: number, y: number, i: number,
    facing: number, fed: number, carry: number, wantDir: number,
  ): void {
    // Given up on this want for a stretch (see `stuckTicks`): too many real
    // actions in a row spent fighting the same dead end — a climb with
    // nothing at the top, a shaft too packed to pass — with nothing to show
    // for it. Let it go and wander like any idle folk instead of refighting
    // it forever; food-seeking below still overrides this if it's hungry.
    const si = grid.index(x, y);
    if (grid.stuckTicks[si] >= FOLK_GIVEUP_ZONE) {
      wantDir = 0;
      grid.stuckTicks[si]--;
      if (grid.stuckTicks[si] < FOLK_GIVEUP_ZONE) grid.stuckTicks[si] = 0;
    }
    // Peckish: break off the errand and head for the nearest crop within a
    // wide radius — a folk that's marching a beat (a mason looking for a lot,
    // say) has to be able to divert for a bite or it starves out there.
    if (fed <= FOLK_FORAGE_HUNGER) {
      const foodDir = grid.folkScanForIds(x, y, FOLK_FORAGE, FOLK_FORAGE_RANGE);
      if (foodDir !== 0) wantDir = foodDir;
    }
    // Nothing pressing and no work in reach: amble back toward this trade's
    // worksite (or the houses) rather than wander off. Only Pips with no
    // landmark at all fall through to the loose pacing below.
    if (wantDir === 0) wantDir = grid.folkHomeDir(x, y, grid.material[i] as MaterialId);
    if (wantDir !== 0) {
      facing = wantDir;
    } else if (Math.random() < FOLK_WANDER_TURN) {
      facing = Math.random() < 0.5 ? 1 : -1; // pace this patch, don't march
    }
    const idle = wantDir === 0;
    // carry === 3 is the "walk solidly" marker (a mason closing on a wall gap):
    // it treats houses as real walls this step instead of ghosting through.
    const solidWalk = carry === 3;
    if (solidWalk) carry = 0;

    const below = grid.inBounds(x, y + 1) ? grid.get(x, y + 1) : MaterialId.Stone;
    // A finished deck — a plank with real support (deck or ground) on *both*
    // sides at foot level — is just a road. Folk walk it and step off its ends
    // normally; the single-file / no-scramble rules below are only for the
    // precarious leading edge of a deck still being laid. This checks
    // `isBridgeDeck` specifically, not the broader `isDeck` — an ordinary
    // house floor or a staircase tread underfoot is never precarious the way
    // an unfinished bridge plank is, so it must never count here.
    const onSpan = grid.isBridgeDeck(x, y + 1);
    const spanFooted = (cx: number): boolean => {
      const c = grid.inBounds(cx, y + 1) ? grid.get(cx, y + 1) : MaterialId.Stone;
      return c !== MaterialId.Empty && c !== MaterialId.Water &&
        MATERIALS[c].category !== MaterialCategory.Liquid;
    };
    const onFinishedDeck = onSpan && spanFooted(x + 1) && spanFooted(x - 1);
    // Right by the water, or out on a bridge deck, a folk keeps its feet — no
    // climbing over a ledge or a fellow worker (scrambling up is what leaves a
    // Pip stranded at a corner or a crew stacked crooked on a half-built deck).
    // `isBridgeDeck`, not `isDeck`: a staircase tread or an ordinary house
    // floor must never trip grid. They used to, through the broad `isDeck` —
    // a Pip squeezed right next to a staircase (which is *built* to be
    // climbed hand-over-hand, wall-style, by anyone passing by, not just the
    // Construtor who raised it) read as "out on a deck" from that alone and
    // permanently refused to climb, freezing there for good.
    const nearWater = !onFinishedDeck && below !== MaterialId.Water &&
      (grid.countNear(x, y, MaterialId.Water, 4) > 0 || grid.isBridgeDeck(x, y + 1) || grid.isBridgeDeck(x + facing, y + 1) || grid.isBridgeDeck(x - facing, y + 1));

    // In the water: forget the errand and get out. Step onto any dry footing
    // adjacent; failing that, strike out along the surface toward the nearest
    // shore; failing that, keep the head up. This is what stops a folk that's
    // dropped in a river (or has a plank flood under it) from drowning in
    // place or dithering at a corner.
    if (below === MaterialId.Water || grid.get(x, y) === MaterialId.Water) {
      // Submerged (water overhead too): float up toward the surface first,
      // where it's safe to swim.
      if (grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Water) {
        grid.moveCreature(x, y, x, y - 1, packCreature(facing, carry, fed));
        return;
      }
      const shore = grid.nearestShoreDir(x, y);
      const order: [number, number][] = [
        [shore || facing, 0], [-(shore || facing), 0],
        [shore || facing, -1], [-(shore || facing), -1],
        [shore || facing, 1], [-(shore || facing), 1],
      ];
      for (const [sx, sy] of order) {
        const tx = x + sx;
        const ty = y + sy;
        if (!grid.inBounds(tx, ty) || grid.get(tx, ty) !== MaterialId.Empty) continue;
        const foot = grid.inBounds(tx, ty + 1) ? grid.get(tx, ty + 1) : MaterialId.Stone;
        if (foot === MaterialId.Empty || foot === MaterialId.Water) continue; // no footing there
        grid.moveCreature(x, y, tx, ty, packCreature(Math.sign(sx) || facing, carry, fed));
        return;
      }
      if (shore !== 0) {
        const tx = x + shore;
        const t = grid.inBounds(tx, y) ? grid.get(tx, y) : MaterialId.Stone;
        if (t === MaterialId.Water || t === MaterialId.Empty) {
          grid.moveCreature(x, y, tx, y, packCreature(shore, carry, fed)); // swim for it
          return;
        }
      }
      if (grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Empty) {
        grid.moveCreature(x, y, x, y - 1, packCreature(-facing, carry, fed));
        return;
      }
      // Wedged in a pocket under a bridge deck with water below — climb up
      // through the plank onto the walkway rather than sit there.
      if (grid.isDeck(x, y - 1) && grid.inBounds(x, y - 2) && grid.get(x, y - 2) === MaterialId.Empty) {
        grid.moveCreature(x, y, x, y - 2, packCreature(-facing, carry, fed));
        return;
      }
    }

    // Houses are intangible to folk — they walk through the walls as if the
    // building were on a plane behind them. Standing on a roof/wall cell (the
    // sim put one under the folk) just means dropping straight through it to
    // the first real footing below.
    if (grid.isGhost(x, y + 1)) {
      for (let d = 1; d <= 24; d++) {
        if (grid.isGhost(x, y + d)) continue;
        const t = grid.inBounds(x, y + d) ? grid.get(x, y + d) : MaterialId.Stone;
        if (t === MaterialId.Empty) {
          grid.moveCreature(x, y, x, y + d, packCreature(facing, carry, fed));
          return;
        }
        // A fellow folk sitting in the landing spot, not real ground —
        // trade places with it rather than freeze here for good. Two folk
        // on opposite ends of the same ghost run, each trying to pass
        // through toward the other, can otherwise deadlock forever:
        // neither the drop here nor the matching hop-up on the other side
        // ever finds the landing clear, since each *is* the other's
        // obstruction, and a want that keeps recomputing the same facing
        // every tick (unlike idle pacing) never breaks that on its own.
        // Swapping is guaranteed to work where a retreat isn't — a shaft
        // exactly one cell wide with a wall on every other side leaves
        // nowhere to retreat *to* — and passing single file in a tight
        // spot is just what folk do; only step around a Esqueleto instead
        // (a Pip has no business trading places with the thing hunting it).
        if (FOLK_IDS.includes(t as MaterialId)) {
          grid.swap(x, y, x, y + d);
          grid.meta[grid.index(x, y + d)] = packCreature(facing, carry, fed);
          return;
        }
        if (MATERIALS[t].category === MaterialCategory.Creature) {
          grid.folkRetreat(x, y, i, facing, carry, fed);
          return;
        }
        break;
      }
    }

    // On a bridge deck with somewhere to be: follow the planks — up over the
    // crown of the arch and down the far side. Each next plank may sit a row
    // higher or lower than this one.
    if (!idle && grid.isDeck(x, y + 1)) {
      const nx = x + facing;
      if (grid.isDeck(nx, y + 1) && grid.get(nx, y) === MaterialId.Empty) {
        grid.moveCreature(x, y, nx, y, packCreature(facing, carry, fed));
        return;
      }
      if (grid.isDeck(nx, y) && grid.inBounds(nx, y - 1) && grid.get(nx, y - 1) === MaterialId.Empty) {
        grid.moveCreature(x, y, nx, y - 1, packCreature(facing, carry, fed));
        return;
      }
      if (grid.isDeck(nx, y + 2) && grid.get(nx, y + 1) === MaterialId.Empty) {
        grid.moveCreature(x, y, nx, y + 1, packCreature(facing, carry, fed));
        return;
      }
    }

    if (below !== MaterialId.Empty && FOLK_WADEABLE.has(below)) {
      // Perched on a crop stalk, not solid ground — sink on down through it.
      grid.moveCreature(x, y, x, y + 1, packCreature(facing, carry, fed));
      return;
    }

    if (below === MaterialId.Empty) {
      // Already level with a house's ghosted wall/roof (or a tree) straight
      // ahead: step through it right away rather than falling back down.
      // This is what closes the loop where climbing the *solid* floor course
      // below lands a folk exactly level with the wall course above it —
      // that course is ghostable, so `wallAhead` below reads false there and
      // the old code just dropped straight back onto the floor, to climb
      // and drop the same way forever.
      if (!nearWater && grid.isGhost(x + facing, y) &&
        grid.folkThroughHouse(x, y, facing, fed, carry)) {
        return;
      }
      // Nothing underfoot. A folk on a job that's pressed against a wall
      // (ahead or behind) scales it — hauls itself up cell by cell rather
      // than dropping — so it can reach a roof or an upper-wall gap. It tops
      // out on its own once there's no more wall beside it. An idle folk, or
      // one in open air, just falls.
      const wallAhead = grid.isFolkWall(x + facing, y);
      const wallBehind = grid.isFolkWall(x - facing, y);
      const braced = wallAhead || wallBehind;
      // A house wall/roof (or a tree) directly overhead isn't really a cap —
      // folk pass through those — so it doesn't stop the climb here either.
      // Left uncorrected, a folk climbing the outside of a house's solid
      // floor/anchor course reads "capped" the moment a wall cell sits right
      // above it and just gives up, bouncing forever between that one climb
      // and the drop back down (see the fall-back note below).
      const aboveGhost = grid.isGhost(x, y - 1);
      const capped = !grid.inBounds(x, y - 1) || (grid.get(x, y - 1) !== MaterialId.Empty && !aboveGhost);
      // Only haul upward if the climb actually leads somewhere: a real ledge
      // has to exist within reach, found by scanning the wall's own face for
      // where it stops — not by asking "does the wall still look tall enough
      // from here", which reads differently at every row of the climb and
      // bounces forever on any wall whose remaining height from partway up
      // didn't happen to clear a fixed lookahead (a one-row lookahead bounces
      // off any one-cell lip; a two-row one bounces off any two-or-three-cell
      // wall instead — the asymmetry is in re-deriving the answer fresh from
      // a *moving* vantage point, not in the window size). Scanning for the
      // wall's actual top is vantage-independent: it finds the same row
      // whether asked from the bottom or partway up, so the climb never
      // second-guesses itself mid-way. Bounded to a modest height — a wall
      // taller than that is a real climb the staircase system handles, not a
      // Pip scrambling up a ledge — and the row just below the top is
      // guaranteed solid by construction of the scan, so it's always a
      // genuine landing, not more open air past the top of a free-standing
      // wall with nowhere to put a foot.
      const MAX_HAUL = 24;
      const ledgeRow = (dx: number): number => {
        for (let d = 0; d <= MAX_HAUL; d++) {
          const wy = y - d;
          if (!grid.isFolkWall(x + dx, wy)) return grid.inBounds(x, wy) ? wy : -1;
        }
        return -1;
      };
      const canHaul = (wallAhead && ledgeRow(facing) >= 0) || (wallBehind && ledgeRow(-facing) >= 0);
      if (!idle && !nearWater && braced && !capped && canHaul) {
        if (aboveGhost) {
          // Hop clean over the ghosted run to the first open cell above it —
          // the same way folk drop through a house from above — rather than
          // trying to stand inside a wall cell's own slot.
          for (let d = 1; d <= 24; d++) {
            if (grid.isGhost(x, y - d)) continue;
            const t = grid.get(x, y - d);
            if (t === MaterialId.Empty) {
              grid.stuckTicks[si] = 0;
              grid.moveCreature(x, y, x, y - d, packCreature(facing, carry, fed));
              return;
            }
            // A fellow folk in the landing spot, not real ground — same
            // deadlock as the matching drop-through above (this is its
            // upward twin), and the same fix: trade places rather than
            // freeze here for good (see the long comment there — a shaft
            // this narrow can leave nowhere to retreat to, but a swap
            // always works).
            if (FOLK_IDS.includes(t as MaterialId)) {
              grid.stuckTicks[si] = 0;
              grid.swap(x, y, x, y - d);
              grid.meta[grid.index(x, y - d)] = packCreature(facing, carry, fed);
              return;
            }
            if (MATERIALS[t].category === MaterialCategory.Creature) {
              grid.folkRetreat(x, y, i, facing, carry, fed);
              return;
            }
            break;
          }
        } else {
          grid.stuckTicks[si] = 0;
          grid.moveCreature(x, y, x, y - 1, packCreature(facing, carry, fed)); // haul up the face
          return;
        }
      }
      // Braced against a wall with a roof or eave capping the climb: don't
      // just drop and re-climb forever under the overhang. Duck through the
      // wall (into the house, then out its doorway), or peel off it so the
      // fall clears the eave.
      if (braced && capped) {
        if (grid.folkPhase(x, y, wallAhead ? facing : -facing, fed, carry)) return;
        const away = wallBehind ? facing : -facing;
        if (grid.inBounds(x + away, y) && grid.get(x + away, y) === MaterialId.Empty) {
          grid.stuckTicks[si] = 0;
          grid.moveCreature(x, y, x + away, y, packCreature(away, carry, fed));
          return;
        }
      }
      // Just topped out off the side of a wall it was climbing a row ago
      // (not braced any more at this row, but the row right below still had
      // wall beside it): that means firm footing sits right here (see
      // `ledgeRow` above — the row a climbed wall's face gives way at is
      // always solid one row down). Step onto it sideways instead of
      // free-falling straight back down the very face it climbed, which is
      // what used to hand the climb back to square one every time, forever.
      // Gated on having actually just climbed something (not idle, and wall
      // right below), so an ordinary Pip walking off a natural ledge or
      // cliff edge in open ground still just falls, same as always.
      const justToppedOut = grid.isFolkWall(x + facing, y + 1) || grid.isFolkWall(x - facing, y + 1);
      if (!idle && !nearWater && justToppedOut) {
        for (const side of [facing, -facing]) {
          if (grid.inBounds(x + side, y) && grid.get(x + side, y) === MaterialId.Empty && grid.firmFooting(x + side, y)) {
            grid.stuckTicks[si] = 0;
            grid.moveCreature(x, y, x + side, y, packCreature(side, carry, fed));
            return;
          }
        }
      }
      // Falling back here with a real want and nothing to show for it:
      // count it. Past FOLK_STUCK_LIMIT of these in a row, give up on the
      // want outright — retreat clear of the spot and sit out the next
      // FOLK_GIVEUP_COOLDOWN real actions idle (see the check at the top of
      // this function) — rather than keep climbing and falling in place
      // forever. An idle folk was never "trying" in the first place, so
      // this never counts against one just ambling off a ledge.
      if (!idle && !nearWater) {
        const stuck = Math.min(255, grid.stuckTicks[si] + 1);
        if (stuck >= FOLK_STUCK_LIMIT) {
          // Set the give-up sentinel *before* retreating — `folkRetreat`
          // moves the folk via the same swap that carries `stuckTicks`
          // along, so writing it here at the cell it's still standing on
          // lands it at wherever retreat actually puts it.
          grid.stuckTicks[si] = FOLK_GIVEUP_ZONE + FOLK_GIVEUP_COOLDOWN;
          grid.folkRetreat(x, y, i, facing, carry, fed);
          return;
        }
        grid.stuckTicks[si] = stuck;
      }
      // An idle folk falling back off a wall it had no reason to climb (open
      // air above, so the haul-up above didn't fire) lands facing away from
      // that wall instead of holding its old facing — otherwise it just walks
      // straight back into the same wall next turn and hauls up again, a
      // climb-then-drop loop that reads as a Pip bouncing forever in a corner.
      const faceOut = idle && wallAhead && !wallBehind ? -facing : facing;
      grid.moveCreature(x, y, x, y + 1, packCreature(faceOut, carry, fed));
      return;
    }

    const fwd = x + facing;
    const fwdId = grid.inBounds(fwd, y) ? grid.get(fwd, y) : MaterialId.Stone;
    // A house or a tree in the way is no obstacle — the folk step straight
    // through (house walls / roof, or a tree trunk) to the first open cell on
    // the far side.
    if (!solidWalk && grid.isGhost(fwd, y) &&
      grid.folkThroughHouse(x, y, facing, fed, carry)) return;
    // Wade straight through a standing crop or a patch of plants — a folk
    // never gets hung up in a wheat field; the stalk just parts around it.
    if (FOLK_WADEABLE.has(fwdId)) {
      const belowFwd = grid.inBounds(fwd, y + 1) ? grid.get(fwd, y + 1) : MaterialId.Stone;
      if (belowFwd !== MaterialId.Empty && belowFwd !== MaterialId.Water) {
        grid.moveCreature(x, y, fwd, y, packCreature(facing, carry, fed));
        return;
      }
    }
    if (fwdId === MaterialId.Empty) {
      const belowFwd = grid.inBounds(fwd, y + 1) ? grid.get(fwd, y + 1) : MaterialId.Stone;
      if (belowFwd !== MaterialId.Empty) {
        // Won't step off dry land onto open deep water (that's how a folk
        // drifts out and drowns) — but a shallow puddle, or a plank a mason
        // laid there, is fine to walk on.
        if (
          belowFwd === MaterialId.Water && grid.get(fwd, y + 2) === MaterialId.Water &&
          below !== MaterialId.Water // already out over water? carry on, turning back is worse
        ) {
          grid.folkRetreat(x, y, i, facing, carry, fed);
          return;
        }
        grid.moveCreature(x, y, fwd, y, packCreature(facing, carry, fed)); // step forward, level
        return;
      }
      // Nothing under the cell ahead. If it's a one-cell gap with solid
      // footing right across it, stride over — don't drop in only to climb
      // straight back out, over and over (the "stuck in the little hole").
      const ax = x + facing * 2;
      const acrossFloor = grid.inBounds(ax, y + 1) ? grid.get(ax, y + 1) : MaterialId.Stone;
      if (
        grid.inBounds(ax, y) && grid.get(ax, y) === MaterialId.Empty &&
        acrossFloor !== MaterialId.Empty && MATERIALS[acrossFloor].category !== MaterialCategory.Liquid
      ) {
        grid.moveCreature(x, y, ax, y, packCreature(facing, carry, fed));
        return;
      }
      // Dropping off this ledge would land the folk in water at the bottom of
      // the fall, or drop it into a channel it should be bridging, not wading
      // — turn back.
      if (nearWater || below !== MaterialId.Water) {
        for (let d = 1; d <= 5; d++) {
          const c = grid.get(fwd, y + d);
          if (c === MaterialId.Empty) continue;
          if (c === MaterialId.Water) {
            grid.folkRetreat(x, y, i, facing, carry, fed);
            return;
          }
          break; // solid footing down there — fine to drop in
        }
      }
      grid.moveCreature(x, y, fwd, y + 1, packCreature(facing, carry, fed)); // step down / into the gap
      return;
    }
    if (fwdId === MaterialId.Water) {
      // Can't wade — turn back off the shore rather than stand there dithering.
      grid.folkRetreat(x, y, i, facing, carry, fed);
      return;
    }
    if (MATERIALS[fwdId].category === MaterialCategory.Creature) {
      // Near water it's single file — never clamber over the folk ahead (a
      // crew stacking up at the wrong height is what lays a crooked deck).
      // Just wait a beat, or drop back. `isBridgeDeck`, not `isDeck`: this
      // has to stay off actual bridge planks only — a staircase or house
      // floor underfoot is no reason to refuse climbing past a fellow folk,
      // and treating it as one is exactly what deadlocks a queue at a
      // staircase's foot forever.
      if (grid.isBridgeDeck(x, y + 1) || grid.countNear(x, y, MaterialId.Water, 4) > 0) {
        grid.meta[i] = packCreature(Math.random() < 0.5 ? -facing : facing, carry, fed);
        return;
      }
      // An idle folk gives way rather than crowd in — this is what stops a
      // knot of Pips packing solid at a shared worksite. A folk on a real
      // errand tries to get past: over the top if there's room, else hold a
      // beat (but turn back if it's wedged from behind too).
      if (idle) {
        grid.meta[i] = packCreature(-facing, carry, fed);
        return;
      }
      if (grid.inBounds(fwd, y - 1) && grid.get(fwd, y - 1) === MaterialId.Empty && Math.random() < 0.7) {
        grid.moveCreature(x, y, fwd, y - 1, packCreature(facing, carry, fed));
        return;
      }
      const backId = grid.inBounds(x - facing, y) ? grid.get(x - facing, y) : MaterialId.Stone;
      const jammed = !grid.inBounds(x - facing, y) || MATERIALS[backId].category === MaterialCategory.Creature;
      grid.meta[i] = packCreature(jammed || Math.random() < 0.25 ? -facing : facing, carry, fed);
      return;
    }
    // Blocked by a wall or step. Clamber over it (onto the ledge at fwd,
    // y-1), else straight up the face, else squeeze through it (`folkPhase`).
    // Not right by the water, though — turn back there instead of scrambling.
    // The exception: stepping *off* a deck up onto the dry far bank (solid
    // ground would be under our feet after the clamber). That's finishing the
    // crossing, not scrambling into the drink, so the water rule doesn't apply.
    const climbToLand =
      grid.inBounds(fwd, y - 1) && grid.get(fwd, y - 1) === MaterialId.Empty &&
      grid.firmFooting(fwd, y - 1) && grid.get(fwd, y + 1) !== MaterialId.Water;
    const overClear = (!nearWater || climbToLand) && grid.inBounds(fwd, y - 1) && grid.get(fwd, y - 1) === MaterialId.Empty;
    if (overClear && Math.random() < 0.95) {
      grid.stuckTicks[si] = 0;
      grid.moveCreature(x, y, fwd, y - 1, packCreature(facing, carry, fed));
      return;
    }
    // Straight up the face, no step forward yet — only worth it for a folk
    // with a real reason to be scaling this (the next tick's below-empty
    // check picks the climb back up, wall permitting). An idle folk taking
    // this same hop lands in open air over its own just-vacated footing with
    // no want to justify a further climb (idle never climbs there, by
    // design), so it always falls straight back next tick and repeats,
    // forever, in place. Idle just turns away instead, same as any other
    // dead end.
    if (!idle && (!nearWater || climbToLand) && grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Empty && Math.random() < 0.9) {
      grid.moveCreature(x, y, x, y - 1, packCreature(facing, carry, fed));
      return;
    }
    if (nearWater) {
      grid.folkRetreat(x, y, i, facing, carry, fed);
      return;
    }
    if (grid.folkPhase(x, y, facing, fed, carry)) return;
    if (grid.folkPhase(x, y, -facing, fed, carry)) return; // try squeezing the other way too
    // Truly boxed in. Turn around, and if there's headroom haul up a cell so
    // a folk can never sit dead-still forever wedged between two others.
    if (grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Empty) {
      grid.moveCreature(x, y, x, y - 1, packCreature(-facing, carry, fed));
      return;
    }
    // Sealed in on every side, packed earth overhead too — a pit that
    // slumped shut around it, say. Loose ground gives: dig out rather than
    // sit there entombed forever with nothing left in the ordinary
    // repertoire to try.
    if (grid.folkDigOut(x, y, i, facing, carry, fed)) return;
    // Truly nothing left to try, no movement at all this turn: the same
    // give-up counter as the below-empty dead end above, for the same
    // reason — a folk with a real want and a genuinely blocked path
    // otherwise just flips facing here forever.
    if (!idle) {
      const stuck = Math.min(255, grid.stuckTicks[si] + 1);
      if (stuck >= FOLK_STUCK_LIMIT) {
        grid.stuckTicks[si] = FOLK_GIVEUP_ZONE + FOLK_GIVEUP_COOLDOWN;
        grid.folkRetreat(x, y, i, facing, carry, fed);
        return;
      }
      grid.stuckTicks[si] = stuck;
    }
    grid.meta[i] = packCreature(-facing, carry, fed);
  }

  /**
   * Last resort for a folk with nowhere left to go (walls all round, no
   * headroom): shoulder into whichever neighbor — straight up first, then
   * ahead, then behind — is soft Powder (never real rock, metal, ice...)
   * and climb into the gap it leaves. Returns whether it dug through.
   */
export function folkDigOut(grid: SimGrid, x: number, y: number, i: number, facing: number, carry: number, fed: number): boolean {
    for (const [dx, dy] of [[0, -1], [facing, 0], [-facing, 0]] as const) {
      const tx = x + dx, ty = y + dy;
      if (!grid.inBounds(tx, ty)) continue;
      if (MATERIALS[grid.get(tx, ty)].category === MaterialCategory.Powder) {
        grid.set(tx, ty, MaterialId.Empty);
        grid.moveCreature(x, y, tx, ty, packCreature(dx !== 0 ? dx : -facing, carry, fed));
        return true;
      }
    }
    return false;
  }

  /**
   * A folk backed up against water (or a ledge over water) that it can't
   * cross: it turns around and steps back onto firm ground rather than
   * standing at the corner flip-flopping its facing. If it's boxed in — water
   * or wall behind too — it climbs up out of the pocket, or as a last
   * resort digs through loose ground rather than flip its facing forever.
   */
export function folkRetreat(grid: SimGrid, x: number, y: number, i: number, facing: number, carry: number, fed: number): void {
    for (const [dx, dy] of [[-facing, 0], [-facing, -1], [-facing, 1]] as const) {
      const tx = x + dx;
      const ty = y + dy;
      if (!grid.inBounds(tx, ty) || grid.get(tx, ty) !== MaterialId.Empty) continue;
      const foot = grid.inBounds(tx, ty + 1) ? grid.get(tx, ty + 1) : MaterialId.Stone;
      if (foot === MaterialId.Empty || foot === MaterialId.Water || MATERIALS[foot].category === MaterialCategory.Liquid) continue;
      grid.moveCreature(x, y, tx, ty, packCreature(-facing, carry, fed));
      return;
    }
    if (grid.inBounds(x, y - 1) && grid.get(x, y - 1) === MaterialId.Empty) {
      grid.moveCreature(x, y, x, y - 1, packCreature(-facing, carry, fed));
      return;
    }
    if (grid.folkDigOut(x, y, i, facing, carry, fed)) return;
    grid.meta[i] = packCreature(-facing, carry, fed);
  }

  /** Whether a Pip takes its (slow, staggered) turn this tick — or is standing in water, in which case it acts every tick to get itself out. Staggered by both coordinates, not just `y`: a village's whole workforce walks the same ground floor, so keying this on height alone synced every Pip on that floor onto the exact same tick — each one's turn is cheap, but dozens all landing on one frame in lockstep was a visible periodic stutter. Adding `x` spreads them back across all `FOLK_ACT_INTERVAL` ticks. */
export function folkActNow(grid: SimGrid, x: number, y: number): boolean {
    if ((grid.tick + x + y) % FOLK_ACT_INTERVAL === 0) return true;
    return grid.get(x, y) === MaterialId.Water ||
      (grid.inBounds(x, y + 1) && grid.get(x, y + 1) === MaterialId.Water);
  }

  /** Nearest horizontal direction (-1/1) to a dry standable shore at row y, or 0. */
export function nearestShoreDir(grid: SimGrid, x: number, y: number): number {
    for (let d = 1; d <= 40; d++) {
      for (const dir of [1, -1] as const) {
        const cx = x + dir * d;
        if (grid.inBounds(cx, y) && grid.get(cx, y) !== MaterialId.Water && grid.firmFooting(cx, y)) return dir;
      }
    }
    return 0;
  }

  /** A solid a folk can brace against to climb (a wall/step, not a powder pile it'd just sink into, and not a house — houses are intangible to folk). */
export function isFolkWall(grid: SimGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y)) return true; // the world edge is a wall to lean on
    if (grid.isGhost(x, y)) return false; // houses, trees and open doors are intangible to folk
    return MATERIALS[grid.get(x, y)].category === MaterialCategory.Solid;
  }

  /** Whether cell `i` is part of a house — a structural material carrying the house-wall meta bit. (The bit alone isn't enough: a ripe Trigo head's ripeness meta can happen to set it.) */
export function isHouseCell(grid: SimGrid, i: number): boolean {
    return (grid.meta[i] & HOUSE_WALL_META) !== 0 && HOUSE_WALLS.includes(grid.material[i] as MaterialId);
  }

  /** A house cell folk pass straight through — walls, roof, windows, chimney. The floor course, mason-laid bridge decks and staircase treads (HOUSE_FLOOR / HOUSE_DECK / HOUSE_STAIR) stay solid underfoot. */
export function houseGhost(grid: SimGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y)) return false;
    const i = grid.index(x, y);
    if (!grid.isHouseCell(i)) return false;
    if ((grid.meta[i] & HOUSE_ANCHOR_META) !== 0) return true; // the doorway-sill anchor is a wall
    const kind = grid.meta[i] & HOUSE_KIND_MASK;
    return kind !== HOUSE_FLOOR && kind !== HOUSE_DECK && kind !== HOUSE_STAIR;
  }

  /**
   * A folk walking through a house that's in its path: skips over the run of
   * intangible house cells ahead and steps into the first open cell beyond
   * them (interior air or the far side). Won't surface into open water.
   * Returns whether it moved.
   */
export function folkThroughHouse(grid: SimGrid, x: number, y: number, facing: number, fed: number, carry: number): boolean {
    for (let step = 1; step <= 24; step++) {
      const tx = x + facing * step;
      if (!grid.inBounds(tx, y)) return false;
      // straight through a house wall, a tree trunk, an open door, or a crop / stored harvest
      if (grid.isGhost(tx, y) || FOLK_WADEABLE.has(grid.get(tx, y))) continue;
      if (grid.get(tx, y) !== MaterialId.Empty) return false; // something solid that isn't ghostable
      const below = grid.inBounds(tx, y + 1) ? grid.get(tx, y + 1) : MaterialId.Stone;
      if (below === MaterialId.Water) return false;
      grid.moveCreature(x, y, tx, y, packCreature(facing, carry, fed));
      return true;
    }
    return false;
  }

  /**
   * A blocked folk ducks straight through a thin barrier. Looks past the
   * solid ahead — up to FOLK_PHASE_REACH cells of it — for the first open
   * cell it could stand in or drop from, and steps there in one move (the
   * cells between are untouched). Only wall-like solids are passable
   * (Tijolo/Madeira/Gelo/Metal/Vidro), never powders — folk climb those.
   * Returns whether it moved.
   */
export function folkPhase(grid: SimGrid, x: number, y: number, facing: number, fed: number, carry: number): boolean {
    let reach = FOLK_PHASE_REACH + 1;
    for (let step = 2; step <= reach; step++) {
      const tx = x + facing * step;
      if (!grid.inBounds(tx, y)) return false;
      if (grid.isGhost(tx, y)) { reach = step + FOLK_PHASE_REACH + 1; continue; } // a house, a tree or an open door doesn't count against reach
      const t = grid.get(tx, y);
      if (t === MaterialId.Empty) {
        const below = grid.inBounds(tx, y + 1) ? grid.get(tx, y + 1) : MaterialId.Stone;
        // Land on ground, or drop into open air (gravity takes it from there)
        // — anything but stepping straight into water.
        if (below === MaterialId.Water) return false;
        grid.moveCreature(x, y, tx, y, packCreature(facing, carry, fed));
        return true;
      }
      if (MATERIALS[t].category !== MaterialCategory.Solid) return false;
    }
    return false;
  }
