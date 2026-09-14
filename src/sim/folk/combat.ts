import type { SimGrid } from "../grid";
import { HP_POINTS_MASK, HP_EMPOWERED } from "../grid";
import { MaterialId } from "../types";
import { NEIGHBORS_8 } from "../neighbors";
import { FOLK_IDS } from "../grid";
import { CREATURE_FED_MAX, packCreature, creatureFacing, creatureFed } from "../creatureMeta";

/*
 * ── Combate: Guerreiro vs. Esqueleto ────────────────────────────────────────
 * The Guerreiro guards the village and charges any Esqueleto it spots; the
 * Esqueleto shambles toward the nearest Pip and strikes it. Both reuse the
 * shared `strike`/`strikeClock`/`nearestOf` primitives below, and `folkWalk`
 * itself (from folk/engine.ts) to actually close the distance.
 */
/** The only material a fleeing/hunting Esqueleto search ever looks for. */
const SKELETON_ONLY: readonly MaterialId[] = [MaterialId.Skeleton];
// Every Pip a Esqueleto will hunt is just FOLK_IDS (imported above) — used
// directly below rather than re-aliased to a new top-level const, since
// grid.ts and this module import from each other and a plain
// `const PIP_IDS = FOLK_IDS` computed at module-load time can freeze in as
// `undefined` depending on which side of that cycle finishes initializing
// first. Reading the import directly inside each function sidesteps that
// entirely — by the time any of these actually run, both modules are long
// since done loading.

/** Within this many cells of a Esqueleto, a working Pip drops its task and backs away — it's faster than the undead, so it can. */
const SKELETON_FLEE_RANGE = 11;
/**
 * Short radius a Guerreiro / Esqueleto checks for a foe *every* tick, so a
 * fight already underway never stutters. The full WARRIOR_SIGHT /
 * SKELETON_SIGHT sweep for spotting a new threat from afar is expensive
 * (a (2·range+1)² box, and it comes up empty — the whole box has to be
 * checked — on every tick there's simply nothing around, which with a
 * houseful of guards is most ticks) so that one only runs on the ordinary
 * work cadence instead. A real fight is always well inside this radius long
 * before that cadence would notice it late.
 */
const COMBAT_MELEE_CHECK = 6;
/** How far a Guerreiro scans for a Esqueleto to go and meet — a wide watch, so a guard picks up a threat well before it reaches the houses. */
const WARRIOR_SIGHT = 52;
/** Damage one strike lands. */
const ATTACK_DAMAGE = 1;
/** Ticks between strikes — a unit lands roughly one blow a second (the sim runs ~60 ticks/s). */
const ATTACK_PERIOD = 54;
/** Ticks a red hit-marker flashes at a struck cell. */
const HIT_FLASH_LIFE = 7;
/** How far a Esqueleto scans for a Pip to hunt. */
const SKELETON_SIGHT = 24;
/** A Esqueleto takes a turn only every Nth tick — slower and more lurching than the folk. */
const SKELETON_ACT_INTERVAL = 8;
/** Per-tick chance an idle (no prey in sight) Esqueleto reverses direction, so it wanders instead of marching one way forever. */
const SKELETON_WANDER_CHANCE = 0.5;

  /**
   * A working Pip that sees a Esqueleto close by drops what it's doing and
   * backs off — it outpaces the undead, so running works. Returns the away
   * direction (-1/1), or 0 if there's nothing to run from. The Guerreiro
   * never calls this — it closes in.
   */
export function fleeSkeletonDir(grid: SimGrid, x: number, y: number): number {
    const foe = grid.nearestOf(x, y, SKELETON_ONLY, SKELETON_FLEE_RANGE);
    if (!foe) return 0;
    return foe[0] > 0 ? -1 : foe[0] < 0 ? 1 : (Math.random() < 0.5 ? 1 : -1);
  }

  /** Nearest cell of any id in `ids` within `range` of (x, y) — returns its [dx, dy] offset, or null. */
export function nearestOf(grid: SimGrid, x: number, y: number, ids: readonly MaterialId[], range: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dy = -range; dy <= range; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -range; dx <= range; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= grid.width) continue;
        if ((dx === 0 && dy === 0) || !ids.includes(grid.material[ny * grid.width + nx] as MaterialId)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = [dx, dy]; }
      }
    }
    return best;
  }

  /**
   * Land `dmg` on whatever unit is at cell `i`, struck from (fromX, fromY).
   * The cell flashes red; a survivor is knocked a step back, away from the
   * blow. Returns true if it finished the target — a Esqueleto crumbles to
   * nothing, a Pip falls.
   */
export function strike(grid: SimGrid, i: number, dmg: number, fromX: number, fromY: number): boolean {
    if (i < 0 || i >= grid.hp.length) return false;
    const raw = grid.hp[i];
    const cur = raw & HP_POINTS_MASK;
    if (cur === 0) return false;
    const x = i % grid.width;
    const y = (i / grid.width) | 0;
    grid.hits.push({ x, y, life: HIT_FLASH_LIFE, maxLife: HIT_FLASH_LIFE });
    if (cur <= dmg) {
      grid.set(x, y, MaterialId.Empty);
      return true;
    }
    grid.hp[i] = (raw & HP_EMPOWERED) | (cur - dmg);
    // Recoil: often shove the victim a step back, away from the blow, if the
    // cell that way is clear. Not every time — a fight should still be a fight,
    // not two units pinballing apart on every hit.
    if (Math.random() < 0.55) {
      const kx = Math.sign(x - fromX) || (Math.random() < 0.5 ? 1 : -1);
      if (grid.inBounds(x + kx, y) && grid.get(x + kx, y) === MaterialId.Empty) {
        grid.moveCreature(x, y, x + kx, y, packCreature(-kx, 0, creatureFed(grid.meta[i])));
      }
    }
    return false;
  }

  /**
   * The attack clock for the fighter at cell `i`. Called once a turn while it's
   * in a fight: ticks the cooldown down, and when it's run out (and the unit is
   * `readyToHit`) resets it to ATTACK_PERIOD and returns true. A unit stood toe
   * to toe lands about one blow a second; the cooldown rides along through a
   * knockback since it lives in `workCd`, swapped with the unit.
   */
export function strikeClock(grid: SimGrid, i: number, readyToHit: boolean): boolean {
    if (grid.workCd[i] > 0) { grid.workCd[i]--; return false; }
    if (!readyToHit) return false;
    grid.workCd[i] = ATTACK_PERIOD;
    return true;
  }

  /**
   * Guerreiro: one of o povo, but it guards instead of building. It patrols
   * among the houses; the moment a Esqueleto comes within WARRIOR_SIGHT it
   * *charges* — it drops the unhurried folk pace and takes a step every tick
   * to close the distance — and trades blows (one point a strike, about once
   * a second). It carries 10 hit points to a working Pip's 5.
   */
export function stepWarrior(grid: SimGrid, x: number, y: number, i: number): void {
    grid.processed[i] = 1;
    const facing = creatureFacing(grid.meta[i]);
    const fed = grid.folkUpkeep(x, y, creatureFed(grid.meta[i]));
    if (fed < 0 || grid.material[i] !== MaterialId.Warrior) return;

    // Look for a fight first — a Guerreiro that's spotted a Esqueleto acts
    // every tick (it's running), not on the slow labour cadence. The full
    // WARRIOR_SIGHT sweep for spotting a threat from afar only runs on the
    // ordinary cadence (see COMBAT_MELEE_CHECK); a fight already underway is
    // always caught by the cheap short-range check every tick regardless.
    const foe = grid.nearestOf(x, y, SKELETON_ONLY, COMBAT_MELEE_CHECK) ||
      (grid.folkActNow(x, y) ? grid.nearestOf(x, y, SKELETON_ONLY, WARRIOR_SIGHT) : null);
    if (foe) {
      const [fdx, fdy] = foe;
      const nf = Math.sign(fdx) || facing;
      const adj = Math.abs(fdx) <= 1 && Math.abs(fdy) <= 1;
      if (grid.strikeClock(i, adj)) {
        const dmg = (grid.hp[i] & HP_EMPOWERED) ? ATTACK_DAMAGE * 2 : ATTACK_DAMAGE;
        grid.strike(grid.index(x + fdx, y + fdy), dmg, x, y);
      }
      if (adj) {
        grid.meta[i] = packCreature(nf, 0, fed);
        return;
      }
      grid.folkWalk(x, y, i, nf, fed, 0, nf); // charge, every tick
      return;
    }

    // Nothing to fight: back to the unhurried pace.
    if (!grid.folkActNow(x, y)) {
      grid.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    if (grid.folkWeather(x, y, i, facing, fed, 0)) return;
    const home = grid.folkHomeDir(x, y, MaterialId.Warrior);
    grid.folkWalk(x, y, i, facing, fed, 0, home);
  }

  /**
   * Esqueleto: a slow undead that hunts o povo. It shambles toward the
   * nearest Pip it can see and, toe to toe, strikes it once a second for one
   * point. It has 5 hit points; a Guerreiro's blows, Fogo, Lava, Ácido or
   * deep Água end it. It takes a turn only every SKELETON_ACT_INTERVAL ticks,
   * so the folk outpace it.
   */
export function stepSkeleton(grid: SimGrid, x: number, y: number, i: number): void {
    grid.processed[i] = 1;
    const facing = creatureFacing(grid.meta[i]);

    // Lethal ground: Lava on contact, or dragged under deep water.
    let waterBelow = false, waterAround = 0;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx, ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nId = grid.material[grid.index(nx, ny)] as MaterialId;
      if (nId === MaterialId.Lava) { grid.igniteAt(x, y); grid.set(x, y, MaterialId.Empty); return; }
      if (nId === MaterialId.Water) { waterAround++; if (dx === 0 && dy === 1) waterBelow = true; }
    }
    if (waterBelow && waterAround >= 6 && Math.random() < 0.14) {
      grid.set(x, y, MaterialId.Empty);
      return;
    }

    // Slow and lurching — takes a turn only every SKELETON_ACT_INTERVAL ticks,
    // so the folk always outpace it, but it acts every tick while it's actually
    // toe to toe with a Pip so a single shove can't break off the fight. The
    // cheap short-range check settles that every tick; the full SKELETON_SIGHT
    // sweep for spotting a Pip from afar only runs on the ordinary cadence
    // (see COMBAT_MELEE_CHECK) — anything adjacent is always inside it too,
    // so a fight already underway never has to wait on the slow cadence.
    const nearPrey = grid.nearestOf(x, y, FOLK_IDS, COMBAT_MELEE_CHECK);
    const adjacentNow = nearPrey !== null && Math.abs(nearPrey[0]) <= 1 && Math.abs(nearPrey[1]) <= 1;
    if (!adjacentNow && (grid.tick + x) % SKELETON_ACT_INTERVAL !== 0) {
      grid.meta[i] = packCreature(facing, 0, CREATURE_FED_MAX);
      return;
    }
    const prey = adjacentNow ? nearPrey : grid.nearestOf(x, y, FOLK_IDS, SKELETON_SIGHT);
    let wantDir = 0;
    if (prey) {
      const [pdx, pdy] = prey;
      wantDir = Math.sign(pdx) || facing;
      const adj = Math.abs(pdx) <= 1 && Math.abs(pdy) <= 1;
      if (grid.strikeClock(i, adj)) {
        const dmg = (grid.hp[i] & HP_EMPOWERED) ? ATTACK_DAMAGE * 2 : ATTACK_DAMAGE;
        grid.strike(grid.index(x + pdx, y + pdy), dmg, x, y);
      }
      if (adj) {
        grid.meta[i] = packCreature(wantDir, 0, CREATURE_FED_MAX);
        return;
      }
    } else if (Math.random() < SKELETON_WANDER_CHANCE) {
      wantDir = Math.random() < 0.5 ? -facing : facing;
    }
    // Reuse the folk surface walk (well fed, so it never forages) — it climbs,
    // steps down, and phases through house walls to get at the folk inside.
    grid.folkWalk(x, y, i, wantDir || facing, CREATURE_FED_MAX, 0, wantDir);
  }
