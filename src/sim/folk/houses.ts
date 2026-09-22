import type { SimGrid } from "../grid";
import {
  WATER_ONLY, MASON_FOUND_CHANCE, HOUSE_SPACING, FOLK_WADEABLE, TREE_TRUNK_META,
  LUMBERJACK_MIN_TREE, AMBIENT_ICE_MELT_TEMP,
} from "../grid";
import { MaterialId, MaterialCategory } from "../types";
import { MATERIALS } from "../materials";
import { isGateMaterial } from "../systems/gates";
import {
  HOUSE_WALL_META, HOUSE_ANCHOR_META, HOUSE_KIND_MASK, HOUSE_FLOOR, HOUSE_DECK, HOUSE_STAIR,
  HOUSE_WALL, HOUSE_WALLS, HOUSE_WALL_MATERIAL, HOUSE_WALL_ICE, HOUSE_WALL_WOOD, HOUSE_WALL_BRICK, HOUSE_WALL_MUSHROOM,
  HOUSE_PLANS, HOUSE_HEIGHTS, HOUSE_BLUEPRINTS, HOUSE_MAX_DWELLING_SPAN, MASON_MAX_PLAN,
  houseCellMaterial, houseStyle, houseType, packHouseAnchor,
} from "../houseBlueprints";
import { packCreature, creatureFacing, creatureFed } from "../creatureMeta";

/*
 * ── Casas, pontes, escadas e o Construtor ──────────────────────────────────
 * The Construtor's whole trade: repairing damaged houses, decking a bridge
 * across water, climbing a vertical staircase to a ledge, and founding new
 * houses once the site and the woodpile allow it. Also home to the
 * tree/house predicates (isGhost, isTrunk, isMatureTree, ...) that the rest
 * of o povo leans on to know what's solid underfoot and what's just scenery
 * folk walk straight through.
 */
/** How far a founding Construtor surveys the ground + supply and checks no other house is close (kept equal to the spacing so that check really covers the gap it promises). */
const HOUSE_SURVEY_RANGE = 17;
/** How far a carrying Construtor notices a damaged house it could patch, and the per-tick chance it sets a brick when standing right next to the gap. */
const MASON_REPAIR_RANGE = 24;
const MASON_REPAIR_CHANCE = 0.4;
/** How wide a stretch of water a Construtor will look across for a far bank before deciding there's nothing to bridge to — generous, so a big lake still gets spanned. */
const MASON_BRIDGE_MAX = 200;
/** How far along a bank a Construtor will head to reach water it means to bridge. */
const MASON_APPROACH_MAX = 48;
/** How many cells above the near lip a Construtor's arched deck crowns — a gentle hump so it clears the water and meets a far bank at any height. */
const MASON_ARCH_MAX = 7;
/** How deep a gap between two banks still counts as "water to bridge" — a deep gorge with a stream at the bottom still gets a span. */
const MASON_SPAN_DROP = 40;
/** Shortest clear rise a Construtor will bother building a staircase for — anything lower than this, a folk just steps or climbs it on its own (see folkWalk's wall-hauling), so a whole built structure would be overkill. */
const STAIR_MIN_RISE = 6;
/** Tallest ledge a Construtor will still climb toward — generous, so a proper multi-storey "vertical village" stays reachable. */
const STAIR_MAX_RISE = 80;
/** Radius (both directions) a Construtor checks for an existing staircase before starting a new one — one climb per ledge, same idea as `deckNear` for bridges. */
const STAIR_NEAR_RANGE = 60;
/** How far a Construtor actively looks for water to bridge — wider than the general FOLK_SCAN_RANGE (used for things like a farmer eyeing a nearby crop) so it seeks out a distant crossing on its own instead of only reacting to water it happens to wander within a short radius of. Bridges (and staircases) are what a Construtor is *for*; it shouldn't need luck to notice one's needed. */
const MASON_WATER_SEEK_RANGE = 80;
/** How far below its floor a house sinks a pier through any hollow or open water, so it always has solid footing. */
const FOUNDATION_DEPTH = 5;
/**
 * Before founding anything a Construtor *levels the lot*: over a strip as wide
 * as the largest house it shifts a cell of earth from the nearest hump into
 * the nearest hollow, one per turn, until the ground is flat. A house may
 * only be founded on a flat lot (`houseFootprintClear`). Past LEVEL_MAX_STEP
 * cells of unevenness it gives up and moves on.
 */
const LEVEL_MAX_STEP = 2;

export function stepMason(grid: SimGrid, x: number, y: number, i: number): void {
    grid.processed[i] = 1;
    const facing = creatureFacing(grid.meta[i]);
    const fed = grid.folkUpkeep(x, y, creatureFed(grid.meta[i]));
    if (fed < 0) return;
    grid.tickPipInfection(x, y, i);
    if (!grid.isPipInfected(i) && !grid.folkActNow(x, y)) { // slow, deliberate labour (but act every tick to swim clear of water) — an infected Construtor skips this entirely, it never slows down
      grid.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    const flee = grid.fleeSkeletonDir(x, y);
    if (flee !== 0) { grid.folkWalk(x, y, i, flee, fed, 0, flee); return; }
    if (grid.folkWeather(x, y, i, facing, fed, 0)) return;

    // Objective: the nearest damaged house wins; else work the ground here.
    const repair = grid.masonRepair(x, y);
    if (repair.patched || repair.busy) {
      grid.meta[i] = packCreature(facing, 0, fed);
      return;
    }
    let wantDir = repair.dir;
    // The moment the woodpile's up to it, the Construtor makes straight for
    // the nearest water to raise its bridge — it doesn't wait to stumble
    // onto a crossing on its ordinary rounds. Repair still wins (a leaking
    // roof doesn't wait on a bridge), and it stands down once a span
    // already crosses this stretch.
    if (wantDir === 0 && grid.villageHasTimber() && !grid.deckNear(x, y, 40)) {
      wantDir = grid.folkScanForIds(x, y, WATER_ONLY, MASON_WATER_SEEK_RANGE);
    }

    // Bridging is in a Construtor's nature, like raising houses. It decks a
    // real-shaped timber bridge across any water it walks up to, however wide:
    // a short ramp off each bank, then one dead-level span the rest of the way,
    // a touch above the water — so two headlands with water between them get
    // joined, not just a flat ford. Guards: it builds from firm dry footing
    // only (a body dropped in the water wades out via folkWalk below), and one
    // bridge per crossing (`deckNear`). `bridgeScan` sorts lead from follower
    // (a follower gets `walk` > 0 and queues single file) and returns null once
    // the span is closed, so nobody keeps working — or pacing — a finished bridge.
    // A new bridge also waits on the Lenhador: no woodpile, no span.
    const startBridge = grid.countNear(x, y, MaterialId.Water, 8) > 0 &&
      !grid.deckNear(x, y, 40) && grid.villageHasTimber();
    const onDeckNow = grid.isBridgeDeck(x, y + 1);
    if ((wantDir !== 0 || onDeckNow || startBridge) && grid.firmFooting(x, y)) {
      const dirs: readonly number[] = wantDir !== 0 ? [wantDir] : (facing >= 0 ? [1, -1] : [-1, 1]);
      let anyPlan = false;
      for (const d of dirs) {
        const plan = grid.bridgeScan(x, y, d);
        if (!plan) continue;
        anyPlan = true;
        if (plan.walk > 0) {
          grid.folkWalk(x, y, i, facing, fed, 0, d);
          return;
        }
        const px = x + d;
        // Keep the plank within a single step of the builder's own feet, and
        // never stack one on a plank already there.
        const layRow = Math.max(y, Math.min(y + 2, plan.layRow));
        const stand = layRow - 1;
        if (
          grid.get(px, layRow) !== MaterialId.Empty ||
          grid.isBridgeDeck(px, layRow - 1) || grid.isBridgeDeck(px, layRow + 1) ||
          !grid.inBounds(px, stand) || grid.get(px, stand) !== MaterialId.Empty
        ) {
          // Can't place a clean plank + step onto it from here — walk and retry.
          grid.folkWalk(x, y, i, facing, fed, 0, d);
          return;
        }
        grid.set(px, layRow, MaterialId.Wood, HOUSE_WALL_META | HOUSE_DECK);
        // Half price: only every other plank actually spends a log off the
        // woodpile (see bridgePlankFree) — a bridge costs half what it used to.
        grid.bridgePlankFree = !grid.bridgePlankFree;
        if (!grid.bridgePlankFree) grid.consumeTimber(x, y);
        grid.moveCreature(x, y, px, stand, packCreature(d, 0, fed));
        return;
      }
      // Standing on a finished bridge with no span to push on: walk off it the
      // short way and get back to ordinary life rather than pacing the deck.
      if (onDeckNow && !anyPlan) {
        const off = grid.offDeckDir(x, y);
        grid.folkWalk(x, y, i, facing, fed, 0, off !== 0 ? off : facing);
        return;
      }
    }

    // Staircases: same idea as a bridge, but climbing to a ledge instead of
    // spanning water — a permanent, built structure any Pip can walk (see
    // isDeck), not just something the one purposeful folk free-climbs past
    // (see folkWalk's wall-hauling) and leaves no trace of. Dead vertical —
    // a ladder straight up from wherever the Construtor happens to be
    // standing, never leaning sideways.
    const onStairNow = grid.isStair(x, y + 1);
    if (grid.villageHasTimber() && grid.firmFooting(x, y) && (onStairNow || !grid.stairNear(x, y, STAIR_NEAR_RANGE))) {
      const plan = grid.stairScan(x, y);
      if (plan) {
        // The new rung takes the Construtor's own current cell — has to be
        // vacated first (climbing into the open headroom stairScan already
        // confirmed above it), or `set` below would just be overwriting the
        // Construtor standing there instead of laying a rung underfoot.
        const layRow = plan.layRow;
        const stand = layRow - 1;
        grid.moveCreature(x, y, x, stand, packCreature(facing, 0, fed));
        grid.set(x, layRow, MaterialId.Wood, HOUSE_WALL_META | HOUSE_STAIR);
        grid.consumeTimber(x, stand); // full price — the half-off only applies to bridge planks, see bridgePlankFree
        return;
      }
    }

    if (wantDir === 0) {
      // Level the strip (shifting a hump of earth into a hollow, never
      // removing any) — but not next to a channel, where slumping the bank
      // just floods the place.
      if (grid.countNear(x, y, MaterialId.Water, 3) === 0 && grid.gradeStrip(x, y, 8)) {
        grid.meta[i] = packCreature(facing, 0, fed);
        return;
      }
      // Found a house on flat ground, while the village still wants one.
      const spot = grid.villageWantsHouse() ? grid.masonSurvey(x, y) : null;
      if (spot) {
        if (Math.random() < MASON_FOUND_CHANCE) {
          grid.raiseHouse(x + 1, y, spot.style, spot.type);
        } else {
          grid.meta[i] = packCreature(facing, 0, fed); // keep working the site
          return;
        }
      } else {
        // Nothing to build here. Amble on to find fresh ground / patrol the
        // street — genuinely idle (wantDir 0, same as stepWarrior passing
        // `home`), not a purposeful walk. That matters: idle is what keeps
        // folkWalk's wall-hauling from firing at all, so a Construtor just
        // turns away from a wall, a fence, a tight little structure it
        // wanders into instead of trying to power through or climb it —
        // treating ordinary wandering as "a real want" (climbs short walls
        // in its way, doesn't back off) is exactly what let one get stuck
        // fighting a cramped hand-built nook it should have just walked
        // away from. Reaching genuinely distant, unclaimed ground is still
        // the staircase/bridge triggers' job — those run unconditionally,
        // idle or not, so a real cliff or crossing still gets built the
        // moment an idly-wandering Construtor happens across one.
        const home = grid.folkHomeDir(x, y, MaterialId.Mason);
        grid.folkWalk(x, y, i, facing, fed, 0, home);
        return;
      }
    }

    // Closing on a gap in a wall: walk the last steps solidly (carry === 3),
    // never phasing through the house — that would carry the mason clean past
    // the hole it's trying to mend.
    grid.folkWalk(x, y, i, facing, fed, repair.near ? 3 : 0, wantDir);
  }


  /** From a folk standing on a bridge deck, the horizontal direction to its nearer end (where the planks meet dry ground). 0 if not on a deck. */
export function offDeckDir(grid: SimGrid, x: number, y: number): number {
    if (!grid.isBridgeDeck(x, y + 1)) return 0;
    const reach = (dir: number): number => {
      let cx = x, r = y + 1;
      for (let k = 1; k <= 320; k++) {
        if (grid.isBridgeDeck(cx + dir, r)) cx += dir;
        else if (grid.isBridgeDeck(cx + dir, r + 1)) { cx += dir; r += 1; }
        else if (grid.isBridgeDeck(cx + dir, r - 1)) { cx += dir; r -= 1; }
        else return k;
      }
      return 999;
    };
    return reach(1) <= reach(-1) ? 1 : -1;
  }

  /** Whether a bridge deck already runs within `r` cells of (x, y) — one crossing per stretch of water, so a crew doesn't lay deck after parallel deck. Checks `isBridgeDeck`, not the broader `isDeck` — an ordinary house or storehouse floor tile that happens to fall in range is not a bridge and must never veto a real crossing. */
export function deckNear(grid: SimGrid, x: number, y: number, r: number): boolean {
    for (let dy = -MASON_ARCH_MAX - 3; dy <= MASON_ARCH_MAX + 3; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < grid.width && grid.isBridgeDeck(nx, ny)) return true;
      }
    }
    return false;
  }

  /**
   * Something a folk can walk on like solid ground: Madeira flagged as
   * house-floor (a real house/storehouse floor course), an actual
   * mason-laid bridge plank (HOUSE_DECK), or a staircase tread (HOUSE_STAIR)
   * — all three are walkable, not a ghost, for the movement/pathing code
   * that just cares about standing on *something* firm, one row higher or
   * lower than the last (see the deck/stair-following branch of folkWalk,
   * which already handles either without knowing which it's on). `deckNear`
   * / `stairNear` need to tell them apart (see `isBridgeDeck` / `isStair`),
   * so they don't use grid.
   */
export function isDeck(grid: SimGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y)) return false;
    const i = grid.index(x, y);
    if (grid.material[i] !== MaterialId.Wood || (grid.meta[i] & HOUSE_WALL_META) === 0) return false;
    const kind = grid.meta[i] & HOUSE_KIND_MASK;
    return kind === HOUSE_FLOOR || kind === HOUSE_DECK || kind === HOUSE_STAIR;
  }

  /** Specifically a plank the Construtor laid while bridging water — unlike `isDeck`, an ordinary house or storehouse floor tile (or a staircase tread) never counts, so `deckNear` can't mistake one for a finished crossing. */
export function isBridgeDeck(grid: SimGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y)) return false;
    const i = grid.index(x, y);
    return grid.material[i] === MaterialId.Wood &&
      (grid.meta[i] & HOUSE_WALL_META) !== 0 && (grid.meta[i] & HOUSE_KIND_MASK) === HOUSE_DECK;
  }

  /** Specifically a tread the Construtor laid while climbing to a ledge — unlike `isDeck`, an ordinary floor tile or bridge plank never counts, so `stairNear` can't mistake one for a finished climb. */
export function isStair(grid: SimGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y)) return false;
    const i = grid.index(x, y);
    return grid.material[i] === MaterialId.Wood &&
      (grid.meta[i] & HOUSE_WALL_META) !== 0 && (grid.meta[i] & HOUSE_KIND_MASK) === HOUSE_STAIR;
  }

  /** Whether a staircase already climbs within `r` cells of (x, y) — one climb per ledge, same idea as `deckNear` for bridges. Checked well above (x, y) too, since a climb runs vertically, not sideways. */
export function stairNear(grid: SimGrid, x: number, y: number, r: number): boolean {
    for (let dy = -STAIR_MAX_RISE - 3; dy <= 3; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= grid.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < grid.width && grid.isStair(nx, ny)) return true;
      }
    }
    return false;
  }

  /**
   * Survey a climb from a Construtor at (x, y) straight up — a ladder-style
   * staircase, dead vertical, never leaning sideways as it rises. Already
   * partway up one it (or another Construtor) started, it just keeps
   * extending it one rung at a time; not on one yet, it first looks straight
   * up this same column for solid, standable ground actually worth climbing
   * to (see `standTop`) — any ground counts, a house floor included (the
   * whole point is connecting whatever's up there to whatever's down here,
   * not just "real" terrain), and no ledge at all means no staircase
   * starts. Returns `{ layRow }` — `layRow` is always the Construtor's own
   * current row: the rung takes the cell it's standing in right now,
   * vacated by the very move that climbs it up into the open headroom
   * above (see the call site — placing the rung *before* moving would just
   * be overwriting the Construtor standing there) — or null: nothing worth
   * climbing, or the climb is capped (the headroom above is no longer
   * open, whether because the ledge itself starts there or something else
   * is blocking it).
   */
export function stairScan(grid: SimGrid, x: number, y: number): { layRow: number } | null {
    if (!grid.isStair(x, y + 1)) {
      let foundLedge = false;
      for (let s = STAIR_MIN_RISE; s <= STAIR_MAX_RISE; s++) {
        const cy = y - s;
        if (!grid.inBounds(x, cy)) break;
        const top = grid.standTop(x, cy - 1, cy + 1);
        // standTop reports the first solid row with headroom, full stop —
        // it doesn't know a tree trunk or a house wall is meant to be
        // walked straight through, not landed on. Climbing all the way up
        // to one of those would just plant the Construtor's ladder against
        // a ghost with nothing real to actually stand on, a "staircase to
        // nowhere." isGhost is the same check folk movement itself uses to
        // decide what's actually solid underfoot, so a target this rejects
        // isn't a real ledge either.
        if (top >= 0 && !grid.isGhost(x, top)) { foundLedge = true; break; }
      }
      if (!foundLedge) return null;
    }
    const stand = y - 1;
    if (!grid.inBounds(x, stand) || grid.get(x, stand) !== MaterialId.Empty) return null; // capped, or nowhere to go
    return { layRow: y };
  }

  /**
   * Solid, dry footing to stand on: the cell (x, y) itself isn't water, and
   * the cell right under it is dry non-liquid solid — real ground, or a deck
   * plank. A Construtor only ever lays a plank while it has this under it, so
   * a bridge always grows out from a bank, never from a body dropped in the
   * water.
   */
export function firmFooting(grid: SimGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y) || grid.get(x, y) === MaterialId.Water) return false;
    const b = grid.inBounds(x, y + 1) ? grid.get(x, y + 1) : MaterialId.Stone;
    return b !== MaterialId.Empty && b !== MaterialId.Water && MATERIALS[b].category !== MaterialCategory.Liquid;
  }

  /** Row of the first solid, standable surface in a vertical window at column `cx` (lowest row number wins), or -1. "Standable" = firm non-liquid with clear headroom just above. */
export function standTop(grid: SimGrid, cx: number, from: number, to: number): number {
    for (let r = from; r <= to; r++) {
      if (!grid.inBounds(cx, r)) continue;
      const g = grid.get(cx, r);
      if (g === MaterialId.Water || g === MaterialId.Empty || grid.isDeck(cx, r)) continue;
      if (MATERIALS[g].category === MaterialCategory.Liquid) return -1;
      const head = grid.inBounds(cx, r - 1) ? grid.get(cx, r - 1) : MaterialId.Empty;
      if (head === MaterialId.Empty || FOLK_WADEABLE.has(head) || grid.isDeck(cx, r - 1)) return r;
      return -1; // solid with no headroom — a wall face, not a footing
    }
    return -1;
  }

  /**
   * Survey a crossing from a Construtor at (x, y) heading `dir`. Follows any
   * deck it has already laid out to the leading edge, then looks across open
   * water for a bank to land on. Returns what to do next, or null — including
   * when the span is already closed, so nobody keeps pacing a finished bridge.
   *
   *  - `walk`  > 0 : the lead edge is that many steps off; go there.
   *  - `walk` === 0: lay the next plank now, at deck row `layRow`.
   *
   * The deck is shaped like a real bridge: short ramp off each bank, then one
   * dead-level span the rest of the way (a touch above the water).
   */
export function bridgeScan(
    grid: SimGrid, x: number, y: number, dir: number,
  ): { walk: number; layRow: number } | null {
    const onDeck = grid.isBridgeDeck(x, y + 1);
    // Trace our deck back to its near anchor.
    let ax = x, aRow = y + 1;
    if (onDeck) {
      for (let k = 0; k < 300; k++) {
        if (grid.isBridgeDeck(ax - dir, aRow)) ax -= dir;
        else if (grid.isBridgeDeck(ax - dir, aRow + 1)) { ax -= dir; aRow += 1; }
        else if (grid.isBridgeDeck(ax - dir, aRow - 1)) { ax -= dir; aRow -= 1; }
        else break;
      }
    }
    const nearRow = aRow;                       // deck row where it meets the near bank
    // Trace forward to the leading edge of the deck, noting whether the span
    // we've already laid crosses open water.
    let lx = x, lRow = y + 1;
    let spannedWater = false;
    let waterTop = grid.height;                 // highest (lowest row number) water seen
    const noteWater = (cx: number, r0: number): void => {
      for (let k = 0; k <= MASON_SPAN_DROP && grid.inBounds(cx, r0 + k); k++) {
        const c = grid.get(cx, r0 + k);
        if (c === MaterialId.Water) { spannedWater = true; waterTop = Math.min(waterTop, r0 + k); return; }
        if (c !== MaterialId.Empty && !grid.isBridgeDeck(cx, r0 + k)) return;
      }
    };
    if (onDeck) {
      noteWater(lx, lRow + 1);
      for (let k = 0; k < 300; k++) {
        if (grid.isBridgeDeck(lx + dir, lRow)) lx += dir;
        else if (grid.isBridgeDeck(lx + dir, lRow + 1)) { lx += dir; lRow += 1; }
        else if (grid.isBridgeDeck(lx + dir, lRow - 1)) { lx += dir; lRow -= 1; }
        else break;
        noteWater(lx, lRow + 1);
      }
    }
    const leadStep = Math.abs(lx - x);          // steps from here to the leading edge
    const nearDist = Math.abs(lx - ax);         // deck laid so far

    // From just past the leading edge, look for open water below the deck line
    // and a bank on the far side. If the deck already crosses water, we're past
    // the near bank — the next ground we meet is the far one.
    let sawWater = spannedWater;
    for (let s = 1; s <= MASON_BRIDGE_MAX; s++) {
      const cx = lx + dir * s;
      if (!grid.inBounds(cx, lRow)) return null;
      for (let k = 0; k <= MASON_SPAN_DROP && grid.inBounds(cx, lRow + k); k++) {
        const c = grid.get(cx, lRow + k);
        if (c === MaterialId.Water) { sawWater = true; waterTop = Math.min(waterTop, lRow + k); break; }
        if (c !== MaterialId.Empty && !grid.isBridgeDeck(cx, lRow + k)) break;
      }
      const top = grid.standTop(cx, lRow - MASON_ARCH_MAX - 2, lRow + MASON_SPAN_DROP);
      if (top < 0) {
        if (!sawWater && s > MASON_APPROACH_MAX) return null;
        continue;
      }
      if (!sawWater) {
        // Ground before any water. Flat or dropping toward the shore: keep
        // walking the near bank. Rising well above the deck line: blocked by
        // terrain, not water — leave it to ordinary patrol.
        if (top >= lRow - 1) continue;
        return null;
      }
      // Ground past the water sitting well below the surface is the submerged
      // bed, not a bank — keep scanning for a real shore.
      if (top > waterTop + 2) continue;

      // Far bank found. If the leading edge already reaches it (adjacent, within
      // a single step up or down), the span is closed — return null so no one
      // keeps working, or pacing, a finished bridge.
      if (s === 1 && Math.abs(lRow - top) <= 1) return null;

      // Shape: a short ramp off each bank, one dead-level span between. The
      // level D sits at the higher of the two banks, but never below the water.
      const farRow = top;
      const span = nearDist + s;
      let deckLevel = Math.min(nearRow, farRow);
      if (deckLevel >= waterTop) deckLevel = waterTop - 1;
      const p = nearDist + 1;                       // where the next plank goes, from the near anchor
      const q = span - p;                           // ...and from the far anchor
      const nearRamp = Math.abs(deckLevel - nearRow);
      const farRamp = Math.abs(deckLevel - farRow);
      let target: number;
      if (p <= nearRamp) target = nearRow + Math.sign(deckLevel - nearRow) * p;
      else if (q <= farRamp) target = farRow + Math.sign(deckLevel - farRow) * q;
      else target = deckLevel;
      // move at most a row at a time from the current leading edge, and never
      // sink a plank below the water surface
      let layRow = onDeck ? lRow + Math.sign(target - lRow) : y + 1;
      while (layRow > waterTop && layRow > 1) layRow--;

      if (leadStep > 0) return { walk: leadStep, layRow };
      return { walk: 0, layRow };
    }
    return null;
  }

  /** Whether (x, y) has a house cell close overhead — i.e. digging it out would undermine a building. */
export function underHouse(grid: SimGrid, x: number, y: number): boolean {
    for (let d = 1; d <= FOUNDATION_DEPTH + 2; d++) {
      if (!grid.inBounds(x, y - d)) break;
      if (grid.isHouseCell(grid.index(x, y - d))) return true;
    }
    return false;
  }

  /** Whether (x, y) is inside a house's footprint — a wall/roof cell anywhere up to a tall house's height overhead. Farmers and foresters won't sow indoors. */
export function roofedOver(grid: SimGrid, x: number, y: number): boolean {
    for (let d = 1; d <= 16; d++) {
      const ny = y - d;
      if (ny < 0) break;
      if (grid.isHouseCell(ny * grid.width + x)) return true;
    }
    return false;
  }

  /**
   * Stamps a whole house of plan `type` in one go once the mason has spent
   * its turns preparing the site (see `stepMason`): the anchor, then every
   * wall, roof, window, chimney and floor cell of the blueprint, over Empty
   * or loose Powder only (and over cells of this same house already stamped,
   * so a window can claim a spot the wall got to first). Doing it all at
   * once keeps a crew from piling onto one spot, and a house never sits
   * half-built with an open roof no one can reach to close.
   */
export function raiseHouse(grid: SimGrid, ax: number, ay: number, style: number, type: number): void {
    const wallMat = HOUSE_WALL_MATERIAL[style];
    grid.set(ax, ay, MaterialId.Brick, packHouseAnchor(style, type));
    for (const [dx, dy, kind] of HOUSE_BLUEPRINTS[type]) {
      if (dx === 0 && dy === 0) continue;
      const wx = ax + dx;
      const wy = ay + dy;
      if (!grid.inBounds(wx, wy)) continue;
      const hi = grid.index(wx, wy);
      const here = grid.material[hi] as MaterialId;
      // Build into open space, or over a cell of this same house already
      // stamped (so a window can claim a wall's spot). Never over the ground
      // itself — the frame is conjured and sits on whatever's there, it
      // doesn't eat the hillside for bricks. (A blueprint cell that lands in
      // earth is just left buried; masonRepair knows that isn't damage.)
      const overwritable =
        here === MaterialId.Empty ||
        ((grid.meta[hi] & HOUSE_WALL_META) !== 0 && (grid.meta[hi] & HOUSE_ANCHOR_META) === 0);
      if (overwritable) {
        grid.set(wx, wy, houseCellMaterial(kind, style), HOUSE_WALL_META | kind);
      }
    }
    // Underpin the footprint: wherever the ground under a column is missing
    // (a hollow, or open water), sink a wall-material pier down to solid bed
    // so the house has something to stand on. Where the ground is already
    // there it's left alone — no earth is dug or converted.
    const span = HOUSE_PLANS[type].span;
    for (let dx = 0; dx <= span; dx++) {
      const fx = ax + dx;
      for (let d = 1; d <= FOUNDATION_DEPTH; d++) {
        const fy = ay + d;
        if (!grid.inBounds(fx, fy)) break;
        const b = grid.get(fx, fy);
        if (b === MaterialId.Empty || b === MaterialId.Water) {
          grid.set(fx, fy, wallMat, HOUSE_WALL_META | HOUSE_FLOOR);
        } else {
          break; // solid ground (or bedrock) — the pier is anchored
        }
      }
    }
  }

  /**
   * A carrying mason tending nearby houses. When `scan` is true it finds the
   * nearest house anchor within MASON_REPAIR_RANGE and walks *that one's*
   * blueprint (checking only the closest keeps the per-tick cost down with a
   * crew of masons) for a wall/roof/floor cell gone missing. If it's damaged
   * the mason makes for the gap and, standing by it, sets a fresh cell there
   * for part of its load. `dir` is a heading toward the damage, `busy` means
   * it's at the gap working, both 0/false if there's nothing to mend.
   */
export function masonRepair(grid: SimGrid, x: number, y: number): { patched: boolean; dir: number; busy: boolean; near: boolean } {
    let anchorD = Infinity;
    let ai = -1;
    for (let dy = -MASON_REPAIR_RANGE; dy <= MASON_REPAIR_RANGE; dy++) {
      for (let dx = -MASON_REPAIR_RANGE; dx <= MASON_REPAIR_RANGE; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inBounds(nx, ny)) continue;
        const ni = grid.index(nx, ny);
        if (grid.material[ni] !== MaterialId.Brick || (grid.meta[ni] & HOUSE_ANCHOR_META) === 0) continue;
        const d = dx * dx + dy * dy;
        if (d < anchorD) { anchorD = d; ai = ni; }
      }
    }
    if (ai < 0) return { patched: false, dir: 0, busy: false, near: false }; // no house in sight

    const nx = ai % grid.width;
    const ny = (ai / grid.width) | 0;
    const style = houseStyle(grid.meta[ai]);
    let bestHoleD = Infinity;
    let holeX = 0;
    let holeY = 0;
    let holeMat: MaterialId = MaterialId.Brick;
    let holeKind = HOUSE_WALL;
    for (const [bx, by, kind] of HOUSE_BLUEPRINTS[houseType(grid.meta[ai])]) {
      if (bx === 0 && by === 0) continue; // the anchor itself
      const wx = nx + bx;
      const wy = ny + by;
      if (!grid.inBounds(wx, wy)) continue;
      const want = houseCellMaterial(kind, style);
      const h = grid.get(wx, wy);
      if (h === want) continue; // intact
      if (h !== MaterialId.Empty) continue; // a real gap is open air; earth/sand banked into a cell isn't damage to chase
      const d = (wx - x) * (wx - x) + (wy - y) * (wy - y);
      if (d < bestHoleD) { bestHoleD = d; holeX = wx; holeY = wy; holeMat = want; holeKind = kind; }
    }
    if (bestHoleD === Infinity) return { patched: false, dir: 0, busy: false, near: false }; // nearest house is whole

    // Within reach of the gap: set a wall cell there. If the roll misses this
    // tick, stay put (busy) and try again — don't march off the job.
    if (Math.abs(holeX - x) <= 1 && Math.abs(holeY - y) <= 1) {
      if (Math.random() < MASON_REPAIR_CHANCE) {
        const cur = grid.get(holeX, holeY);
        if (cur === MaterialId.Empty || MATERIALS[cur].category === MaterialCategory.Powder) {
          grid.set(holeX, holeY, holeMat, HOUSE_WALL_META | holeKind);
          return { patched: true, dir: 0, busy: true, near: true };
        }
      }
      return { patched: false, dir: 0, busy: true, near: true };
    }
    return { patched: false, dir: Math.sign(holeX - x) || 1, busy: false, near: Math.abs(holeX - x) + Math.abs(holeY - y) <= 4 };
  }

  /**
   * Sizes up the ground just right of the mason for a new house. One sweep
   * of the surroundings tallies the loose building supply and rejects the
   * site outright if another house anchor is within HOUSE_SPACING. Then,
   * largest plan first, it returns the biggest house whose footprint fits
   * on clear flat ground and whose supply the survey turned up — or null.
   */
export function masonSurvey(grid: SimGrid, x: number, y: number): { style: number; type: number } | null {
    const ax = x + 1;
    const ay = y;
    // Smallest plan must at least fit on the grid (get() is bounds-safe, but
    // there's no point surveying a site pressed against the edge/ceiling).
    if (!grid.inBounds(ax, ay - HOUSE_HEIGHTS[0]) || !grid.inBounds(ax + HOUSE_PLANS[0].span, ay + 1)) {
      return null;
    }
    let wood = 0;
    let ice = 0;
    let earth = 0; // loose Areia/Terra/Barro — fired or packed into Tijolo (not the Pedra bedrock underfoot, which is everywhere)
    let mushroom = 0; // loose Cogumelo, felled by a Lenhador — see HOUSE_WALL_MUSHROOM
    for (let dy = -HOUSE_SURVEY_RANGE; dy <= HOUSE_SURVEY_RANGE; dy++) {
      for (let dx = -HOUSE_SURVEY_RANGE; dx <= HOUSE_SURVEY_RANGE; dx++) {
        const nx = ax + dx;
        const ny = ay + dy;
        if (!grid.inBounds(nx, ny)) continue;
        const ni = grid.index(nx, ny);
        const id = grid.material[ni] as MaterialId;
        if (
          id === MaterialId.Brick && (grid.meta[ni] & HOUSE_ANCHOR_META) !== 0 &&
          Math.abs(dx) <= HOUSE_SPACING && Math.abs(dy) <= HOUSE_SPACING
        ) {
          return null; // too close to another house
        }
        // Not on a waterline — water sloshing around a footprint traps folk
        // between the new walls and the pool. Give it a wide berth.
        if (id === MaterialId.Water && Math.abs(dx) <= HOUSE_MAX_DWELLING_SPAN && dy >= -2 && dy <= 4) {
          return null;
        }
        if (id === MaterialId.Wood) wood++;
        else if (id === MaterialId.Ice) ice++;
        else if (id === MaterialId.Sand || id === MaterialId.Dirt || id === MaterialId.Mud) earth++;
        else if (id === MaterialId.Mushroom) mushroom++;
      }
    }
    const supply = wood + ice + earth + mushroom;
    if (supply < HOUSE_PLANS[0].supply) return null;
    // A timber cabin or an ice hut only when that material is genuinely
    // plentiful right here; an ice hut also only where it's cold enough for
    // the Gelo not to just melt away. A Cogumelo house takes priority over
    // either when the Lenhador's stockpiled enough loose Cogumelo — it's
    // the "estranho" option, so it wins ties rather than losing out to the
    // ordinary ones. Otherwise fired Tijolo.
    const style =
      mushroom >= wood && mushroom >= ice && mushroom >= earth && mushroom >= 16 ? HOUSE_WALL_MUSHROOM :
      ice > wood && ice > earth && ice >= 16 && grid.temp < AMBIENT_ICE_MELT_TEMP ? HOUSE_WALL_ICE :
      wood > earth && wood >= 16 ? HOUSE_WALL_WOOD :
      HOUSE_WALL_BRICK;
    // Largest that the lot and the supply allow — but not slavishly: about
    // half the time, when a bigger house would fit, the mason settles for the
    // next size down instead, so a well-stocked village still comes out a mix
    // of halls, cottages and huts rather than a row of identical blocks.
    for (let type = MASON_MAX_PLAN; type >= 0; type--) {
      if (supply < HOUSE_PLANS[type].supply) continue;
      if (!grid.houseFootprintClear(ax, ay, type)) continue;
      if (type > 0 && Math.random() < 0.45) continue;
      return { style, type };
    }
    return null;
  }

  /**
   * Whether the lot for a house of plan `type` anchored at (ax, ay) is ready
   * to build on: the ground must be *level* — filled ground one cell under
   * every column and nothing protruding into the floor row — and the wall +
   * roof volume above it clear (Empty, loose powder, or existing house
   * wall). The mason grades the ground level itself first (see `gradeStrip`);
   * this is the gate that says the grading is done.
   */
export function houseFootprintClear(grid: SimGrid, ax: number, ay: number, type: number): boolean {
    const { span } = HOUSE_PLANS[type];
    const height = HOUSE_HEIGHTS[type];
    if (!grid.inBounds(ax, ay - height) || !grid.inBounds(ax + span, ay + 1)) return false;
    for (let s = 0; s <= span; s++) {
      const fx = ax + s;
      const under = grid.get(fx, ay + 1);
      if (under === MaterialId.Empty || MATERIALS[under].category === MaterialCategory.Liquid) return false; // a pit
      // A stray cell of loose powder in the floor row is fine — raiseHouse
      // builds straight over it. Anything solid there means the ground isn't level.
      const atFloor = grid.get(fx, ay);
      if (atFloor !== MaterialId.Empty && MATERIALS[atFloor].category !== MaterialCategory.Powder) return false;
      for (let up = 1; up <= height; up++) {
        const c = grid.get(fx, ay - up);
        if (c !== MaterialId.Empty && MATERIALS[c].category !== MaterialCategory.Powder && !HOUSE_WALLS.includes(c)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * A Pip grading the ground just ahead level before it builds or sows. Over
   * a strip it finds the nearest bump (loose powder standing in or above the
   * floor line) and the nearest shallow pit, and *moves* a cell of earth
   * from the bump into the pit — one per call, never adding or removing any
   * material. If there's a bump but nowhere to put the spoil (no pit), or a
   * pit but no loose earth to fill it with, it leaves the strip as it is and
   * the Pip moves on to find a flatter spot. Returns whether it moved a cell.
   * Shared by the Construtor (a house-wide strip) and the Plantador (a furrow).
   */
export function gradeStrip(grid: SimGrid, x: number, y: number, span: number): boolean {
    const ax = x + 1;
    const ay = y;
    if (!grid.inBounds(ax + span, ay + 2) || !grid.inBounds(ax, ay - 1)) return false;

    let bumpX = -1;
    let bumpY = -1;
    let bumpD = Infinity;
    let pitX = -1;
    let pitD = Infinity;
    let rough = 0;
    for (let s = 0; s <= span; s++) {
      const cx = ax + s;
      for (let up = LEVEL_MAX_STEP - 1; up >= 0; up--) {
        const c = grid.get(cx, ay - up);
        if (
          (c === MaterialId.Sand || c === MaterialId.Dirt || c === MaterialId.Mud) &&
          !grid.underHouse(cx, ay - up)
        ) {
          rough++;
          const d = s * s + up * up;
          if (d < bumpD) { bumpD = d; bumpX = cx; bumpY = ay - up; }
          break;
        }
        if (c !== MaterialId.Empty) break; // solid/creature — leave it
      }
      // a pit: no ground directly under this column, solid bed not far below
      // (skipped right under a house, same as the bump check above — that
      // headroom is the foundation, not a hole waiting to be filled, and
      // trying to fill it just gets undone, leaving the grader parked here
      // forever instead of moving on).
      if (grid.get(cx, ay + 1) === MaterialId.Empty && !grid.underHouse(cx, ay + 1)) {
        const bed = grid.get(cx, ay + 2);
        if (bed !== MaterialId.Empty && MATERIALS[bed].category !== MaterialCategory.Liquid) {
          rough++;
          const d = s * s;
          if (d < pitD) { pitD = d; pitX = cx; }
        } else {
          rough += 3; // a deep hole / water — not gradeable
        }
      }
    }
    if (rough === 0) return false;                    // already level
    if (rough > span + LEVEL_MAX_STEP) return false;  // a cliff, not a lot

    // Only act when there's a place for the spoil to go: shift earth from the
    // bump into the pit, conserving every cell.
    if (bumpX >= 0 && pitX >= 0) {
      grid.set(bumpX, bumpY, MaterialId.Empty);
      grid.set(pitX, ay + 1, MaterialId.Dirt);
      return true;
    }
    return false;
  }

  /**
   * Whether the `span+1` cells of ground just right of (x, y) form a level
   * furrow: filled ground one cell under each, nothing protruding into the
   * walking row. The gate the Construtor and Plantador grade toward before
   * building or sowing.
   */
export function groundLevel(grid: SimGrid, x: number, y: number, span: number): boolean {
    const ax = x + 1;
    if (!grid.inBounds(ax + span, y + 1)) return false;
    for (let s = 0; s <= span; s++) {
      const under = grid.get(ax + s, y + 1);
      if (under === MaterialId.Empty || MATERIALS[under].category === MaterialCategory.Liquid) return false;
      if (grid.get(ax + s, y) !== MaterialId.Empty) return false;
    }
    return true;
  }

  /** How much crown a tree rooted near (tx, ty) carries — Broto/Planta/Flor in a tall box reaching up from the base. A seedling is a cell or two; a grown tree is a dozen-plus. */
export function treeCrown(grid: SimGrid, tx: number, ty: number): number {
    let n = 0;
    for (let dy = -9; dy <= 2; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const g = grid.get(tx + dx, ty + dy);
        if (g === MaterialId.Sprout || g === MaterialId.Plant || g === MaterialId.Flor) n++;
      }
    }
    return n;
  }

  /** Whether (x, y) is a living tree trunk cell — Madeira flagged TREE_TRUNK. */
export function isTrunk(grid: SimGrid, x: number, y: number): boolean {
    return grid.inBounds(x, y) && grid.material[grid.index(x, y)] === MaterialId.Wood &&
      (grid.meta[grid.index(x, y)] & TREE_TRUNK_META) !== 0;
  }

  /** The foot of the tree trunk/stem passing through (tx, ty) — walks on down through more trunk or its still-soft stem (Broto/Planta) to find where it actually roots. */
export function treeBase(grid: SimGrid, tx: number, ty: number): number {
    let by = ty;
    for (let d = 0; d < 10; d++) {
      const n = by + 1;
      if (grid.isTrunk(tx, n) || grid.get(tx, n) === MaterialId.Sprout || grid.get(tx, n) === MaterialId.Plant) by = n;
      else break;
    }
    return by;
  }

  /** Whether the tree trunk/stem passing through (tx, ty) has filled out enough of a crown to be worth felling — a bare or half-grown sapling reports false, so a Lenhador never treats one as "a tree to work" and paces at its foot forever waiting on it. */
export function isMatureTree(grid: SimGrid, tx: number, ty: number): boolean {
    return grid.treeCrown(tx, grid.treeBase(tx, ty)) >= LUMBERJACK_MIN_TREE;
  }

  /** Whether (x, y) is a Portão a folk (or Esqueleto) can currently just walk through — any of the four variants, as long as it isn't actively blocking Povo/Fauna right now (an unpowered gate never blocks anyone; Portão Líquidos/Pó never block Povo/Fauna even powered). */
export function isOpenGate(grid: SimGrid, x: number, y: number): boolean {
    return grid.inBounds(x, y) && isGateMaterial(grid.material[grid.index(x, y)]) &&
      !grid.gateBlocksCategory(x, y, MaterialCategory.Creature);
  }

  /**
   * Whichever kind of "there, but not really" cell a folk simply walks (or
   * climbs) through: a house wall/roof, a living tree trunk, a Portão not
   * currently blocking Povo/Fauna, or a wild (not built into a house)
   * Cogumelo. Every *sideways or upward* obstacle check in folkWalk treats
   * all of these identically — this is the one place that says so. It is
   * NOT what decides whether a folk has real footing to stand on below it
   * — see `isFloorGhost` for that, a deliberately narrower check.
   *
   * A wild Cogumelo counts because it grows into whatever branching shape
   * it wants (see systems/fungus.ts) with zero regard for whether it's
   * blocking a path — without this, o povo would get boxed in and stuck
   * the moment a cap grew across the one route between them and their
   * work. But a house a mason actually built out of felled Cogumelo (see
   * HOUSE_WALL_MUSHROOM) is checked through `houseGhost` instead, which
   * already knows to keep a house's floor/deck/stair solid underfoot while
   * still letting folk walk through its walls/roof — the isHouseCell guard
   * here is what routes a house-flagged Cogumelo cell to that logic
   * instead of the always-ghost wild-growth rule.
   */
export function isGhost(grid: SimGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y)) return false;
    if (grid.houseGhost(x, y) || grid.isTrunk(x, y) || grid.isOpenGate(x, y)) return true;
    const i = grid.index(x, y);
    return grid.material[i] === MaterialId.Mushroom && !grid.isHouseCell(i);
  }

  /**
   * Whether the cell right below a folk's feet is real enough to stand on
   * — used only by folkWalk's own "do I have footing, or do I fall
   * through" check, never by the general walk-through-obstacles logic
   * above. Deliberately narrower than `isGhost`: a house wall/roof, a
   * living tree trunk and a Portão still give way underfoot exactly like
   * they always did, but a wild Cogumelo does NOT — a mushroom growing
   * under a folk's feet is solid ground to stand on, same as a rock would
   * be, even though the *exact same cell* is still something the folk
   * walks straight through if it's blocking a path sideways instead (see
   * `isGhost`). Without this split, a folk standing on — or a Lenhador
   * dropping loose Cogumelo lumber onto the ground beneath — a Cogumelo
   * sank straight through it via the same "ghost floor" logic a house
   * roof uses, reading as the folk floating/sinking through solid-looking
   * ground for no reason. Fungus itself was never affected by that bug —
   * it was never `isGhost` in the first place — but is included here too
   * for the same reason `isGhost`'s own doc used to give it: a Fazendeiro
   * sowing Trigo straight into infected ground (see systems/plants.ts)
   * needs that to stay solid underfoot.
   */
export function isFloorGhost(grid: SimGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y)) return false;
    return grid.houseGhost(x, y) || grid.isTrunk(x, y) || grid.isOpenGate(x, y);
  }
