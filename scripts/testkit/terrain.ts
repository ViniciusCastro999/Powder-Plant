/**
 * Realistic terrain-painting helpers for headless SimGrid tests.
 *
 * Why this exists: ad-hoc test scripts kept building terrain as a single
 * straight `paintLine` call, or painted a second material right on top of
 * fresh Powder before it had settled. Real play never looks like that — a
 * player drags a thick brush along a wobbly path, usually in several
 * overlapping strokes, and Powders (Dirt, Sand, ...) visibly slump under
 * gravity for a moment before the next thing gets painted on them. Tests
 * that skip both of those produced a real, repeated failure this session: a
 * second material (Fungus) painted "just above" a freshly-painted Dirt
 * mound before it settled ended up floating in open air, disconnected from
 * the ground, in three separate live-browser attempts — a purely
 * test-methodology bug that looked like a game bug until screenshots were
 * inspected directly.
 *
 * Use `paintProfileBand` (or one of the shape presets below it) instead of
 * calling `grid.paintLine` directly whenever a test needs a stretch of
 * ground: it always paints with a wobbly, multi-pass thick brush and always
 * settles Powder terrain under real gravity before returning, so whatever's
 * painted next is guaranteed to land on solid, already-settled ground.
 *
 * That still isn't quite the end of it: a settled Powder's real surface is
 * a different shape than whatever profile it was painted from (see
 * `surfaceProfile`). Always measure the real surface of one layer before
 * painting the next layer from it, rather than reusing the original
 * profile function or a guessed offset.
 */
import type { SimGrid } from "../../src/sim/grid";
import { MaterialId, MaterialCategory } from "../../src/sim/types";
import { MATERIALS } from "../../src/sim/materials";

/** A column-by-column target surface height, e.g. from `hillProfile`. */
export type TerrainProfile = (x: number) => number;

export interface PaintBandOptions {
  x0: number;
  x1: number;
  material: MaterialId;
  /** Brush radius, same units as the UI's brush slider. A real player rarely paints thinner than this. */
  radius?: number;
  /** How many overlapping downward passes to stack for real thickness (a single stroke is a thin ribbon, not a player's ground). */
  passes?: number;
  /** Vertical spacing between passes. */
  passSpacing?: number;
  /** Horizontal distance between mouse-move samples along the stroke. */
  step?: number;
  /** Extra per-sample random jitter on top of the profile's own shape, mimicking an unsteady real drag. */
  jitter?: number;
  /**
   * How long to let the result settle under gravity afterward, in ticks.
   * Only matters for Powders (Solids/Plants/etc. don't move on their own).
   * Defaults to a generous 600 ticks — enough for a tall pile to fully
   * come to rest, which is the whole point: skipping this is what caused
   * the floating-terrain bug this kit exists to prevent.
   */
  settleTicks?: number;
}

/**
 * Paints a stretch of terrain following `profileY(x)`, as a thick brush
 * dragged along a wobbly path in several overlapping passes, then (for a
 * Powder) steps the grid until it's had time to fully settle under gravity.
 * This is the one function every terrain-shape preset below is built on;
 * reach for it directly for a custom silhouette.
 */
export function paintProfileBand(grid: SimGrid, profileY: TerrainProfile, opts: PaintBandOptions): void {
  const {
    x0, x1, material,
    radius = 9,
    passes = 12,
    passSpacing = 10,
    step = 4,
    jitter = 4,
    settleTicks = 600,
  } = opts;
  for (let pass = 0; pass < passes; pass++) {
    let prevX = Math.round(x0);
    let prevY = Math.round(profileY(x0) + pass * passSpacing + (Math.random() - 0.5) * jitter);
    for (let x = x0; x <= x1; x += step) {
      const rx = Math.round(x);
      const ry = Math.round(profileY(x) + pass * passSpacing + (Math.random() - 0.5) * jitter);
      // Rounded to whole cells: `paintLine`'s Bresenham walk advances by
      // exactly ±1 and stops on exact equality with the endpoint, so a
      // fractional coordinate here (guaranteed, since `profileY` and the
      // jitter are floating-point) would never land on it and loop
      // forever. `paintLine` itself now also guards against this, but
      // rounding here keeps the stepped shape intentional rather than
      // accidental.
      grid.paintLine(prevX, prevY, rx, ry, radius, material);
      prevX = rx;
      prevY = ry;
    }
  }
  if (MATERIALS[material].category === MaterialCategory.Powder) {
    settle(grid, settleTicks);
  }
}

/** Steps the grid forward, for letting freshly-painted Powder come to rest before building on it. */
export function settle(grid: SimGrid, ticks = 600): void {
  for (let t = 0; t < ticks; t++) grid.step();
}

/** A rounded hill/mound peaking at (peakX, peakY), sloping down to baseY at the given half-width. */
export function hillProfile(peakX: number, peakY: number, baseY: number, halfWidth: number): TerrainProfile {
  return (x: number) => {
    const t = Math.min(1, Math.abs(x - peakX) / halfWidth);
    const eased = 1 - Math.cos((1 - t) * Math.PI / 2); // slow near the peak, steep near the base — reads as a real mound, not a cone
    return baseY - (baseY - peakY) * eased;
  };
}

/** A dip/valley bottoming out at (bottomX, bottomY), rising to rimY at the given half-width. */
export function valleyProfile(bottomX: number, bottomY: number, rimY: number, halfWidth: number): TerrainProfile {
  const hill = hillProfile(bottomX, rimY, bottomY, halfWidth);
  return (x: number) => bottomY + rimY - hill(x);
}

/** A step down (or up) from highY to lowY, transitioning over `transition` cells around dropX — a cliff face, not a sheer single-column wall. */
export function cliffProfile(dropX: number, highY: number, lowY: number, transition = 10): TerrainProfile {
  return (x: number) => {
    const t = Math.max(0, Math.min(1, (x - dropX) / transition + 0.5));
    const eased = t * t * (3 - 2 * t); // smoothstep, so the drop isn't a razor edge
    return highY + (lowY - highY) * eased;
  };
}

/** Gentle rolling ground around baseY — the closest thing to "ordinary painted terrain" for tests that don't care about a specific silhouette. */
export function undulatingProfile(baseY: number, amplitude = 12, wavelength = 60): TerrainProfile {
  const phase = Math.random() * Math.PI * 2;
  return (x: number) => baseY + Math.sin(x / wavelength + phase) * amplitude;
}

/** Counts cells of a given material anywhere in the grid — handy for before/after totals (e.g. "did the felled mass actually shrink"). */
export function countMaterial(grid: SimGrid, material: MaterialId): number {
  let n = 0;
  for (let i = 0; i < grid.material.length; i++) if (grid.material[i] === material) n++;
  return n;
}

/**
 * Scans the *actual, already-settled* grid for the topmost cell of
 * `material` in each column and returns it as a `TerrainProfile` — the
 * profile function a layer was painted from describes where it was
 * *aimed*, not where it landed. A wide band of Powder settles into a
 * genuinely different shape (usually flatter and lower at the edges) than
 * whatever silhouette painted it, so painting the next layer from the
 * original profile either misses the real surface (lands inside solid
 * ground, which `paintCell` silently refuses — see `paintCell`'s
 * `here !== Empty` guard — so nothing gets painted at all and it looks
 * like the brush just didn't work) or overshoots it (the original floating-
 * terrain bug this kit exists to prevent). Measuring the real surface
 * after it settles and building the next layer from *that* sidesteps
 * both failure modes at once. Columns with no `material` cell at all keep
 * whatever the nearest scanned column returned, so the profile stays
 * usable at the edges of a patchy or partially-covered stretch.
 */
export function surfaceProfile(grid: SimGrid, material: MaterialId, x0: number, x1: number): TerrainProfile {
  const tops = new Map<number, number>();
  for (let x = Math.max(0, x0); x <= Math.min(grid.width - 1, x1); x++) {
    for (let y = 0; y < grid.height; y++) {
      if (grid.get(x, y) === material) { tops.set(x, y); break; }
    }
  }
  const known = [...tops.keys()].sort((a, b) => a - b);
  return (x: number) => {
    const rx = Math.round(x);
    if (tops.has(rx)) return tops.get(rx)!;
    if (known.length === 0) return grid.height; // no surface found at all — fall back to "off the bottom" rather than crash
    let nearest = known[0];
    for (const k of known) if (Math.abs(k - rx) < Math.abs(nearest - rx)) nearest = k;
    return tops.get(nearest)!;
  };
}
