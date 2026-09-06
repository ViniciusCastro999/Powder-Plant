import { Application, BufferImageSource, Sprite, Texture } from "pixi.js";
import type { SimGrid } from "../sim/grid";
import { MaterialCategory, MaterialId } from "../sim/types";
import { MATERIALS } from "../sim/materials";
import { EXTREME_COLD, EXTREME_HOT, COLD_1, COLD_3, PROSPEROUS_LOW, PROSPEROUS_TEMP, PROSPEROUS_HIGH, HOT_2, HOT_3, isProsperous } from "../sim/temperature";

/** How much lighter fully-salty water renders vs. plain water (0 = no change, 1 = white). */
const SALT_LIGHTEN = 0.45;
/** Fire's remaining-fuel window (in ticks) over which it dims toward black instead of popping straight to Empty. */
const FIRE_FADE_TICKS = 20;
/** Petal color variants for Flor, picked per-cell by its meta value. */
const FLOWER_COLORS: readonly (readonly [number, number, number])[] = [
  [235, 120, 170],
  [255, 205, 80],
  [255, 250, 250],
  [190, 140, 230],
];
/** Explosion Shrapnel's color — Fire's color, darkened, since it's not fire but reads as related debris/heat. */
const SHRAPNEL_COLOR: readonly [number, number, number] = (() => {
  const [r, g, b] = MATERIALS[MaterialId.Fire].color;
  return [r * 0.68, g * 0.62, b * 0.62];
})();
/** How strongly Shrapnel's color blends into whatever's already drawn beneath it — purely decorative debris, so it reads as translucent rather than a solid opaque dot. */
const SHRAPNEL_ALPHA = 0.55;

/**
 * Background color anchors, coldest to hottest — [temperature, [r,g,b]].
 * Deliberately dips back to the same near-black neutral on both sides of
 * the prosperous band's green peak, so the tint reads as "this specific
 * temperature is the sweet spot" rather than green just being wherever
 * cold shades into hot. `colorForTemperature` linearly interpolates
 * between whichever two anchors the current reading falls between.
 */
const TEMP_COLOR_STOPS: readonly (readonly [number, readonly [number, number, number]])[] = [
  [EXTREME_COLD, [8, 19, 40]],
  [COLD_3, [10, 24, 42]],
  [COLD_1, [7, 12, 18]],
  [PROSPEROUS_LOW, [5, 7, 10]],
  [PROSPEROUS_TEMP, [9, 31, 17]],
  [PROSPEROUS_HIGH, [5, 7, 10]],
  [HOT_2, [30, 14, 7]],
  [HOT_3, [46, 11, 6]],
  [EXTREME_HOT, [64, 9, 5]],
];

/** Eases the raw 0-1 position between two anchors instead of moving through it at a constant rate — a plain linear lerp has a sharp change of slope exactly at every named threshold (COLD_1, PROSPEROUS_LOW/HIGH, HOT_2/3...), which reads as the background visibly "cutting" right at that temperature instead of drifting smoothly through it. */
function smoothstep(f: number): number {
  return f * f * (3 - 2 * f);
}

function colorForTemperature(temp: number): readonly [number, number, number] {
  const stops = TEMP_COLOR_STOPS;
  if (temp <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (temp <= t1) {
      const f = smoothstep((temp - t0) / (t1 - t0));
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * A tiny decorative motif stamped into the empty background — each entry is
 * [dx, dy, intensity] relative to an anchor cell, `intensity` scaling how
 * strongly that particular pixel of the shape blends in. A recognizable
 * little silhouette instead of a single random dot, while still reading as
 * a very translucent background charm rather than an actual particle.
 */
type DecorShape = readonly (readonly [number, number, number])[];

/** A small snowflake/ice-crystal silhouette — a cross with faint diagonal tips. */
const ICE_CRYSTAL_SHAPE: DecorShape = [
  [0, 0, 1],
  [0, -1, 0.85], [0, 1, 0.85], [-1, 0, 0.85], [1, 0, 0.85],
  [-1, -1, 0.45], [1, -1, 0.45], [-1, 1, 0.45], [1, 1, 0.45],
];
/** A rising ember/spark — a bright core with a fading tail drifting upward. */
const EMBER_SHAPE: DecorShape = [
  [0, 0, 1],
  [0, -1, 0.7], [0, -2, 0.35],
  [-1, 0, 0.4], [1, 0, 0.4],
];
/** A small diagonal glint/sparkle — reads distinct from the ice crystal's straight cross. */
const PROSPEROUS_SPARKLE_SHAPE: DecorShape = [
  [0, 0, 1],
  [-1, -1, 0.55], [1, -1, 0.55], [-1, 1, 0.55], [1, 1, 0.55],
];

interface DecorMotif {
  shape: DecorShape;
  color: readonly [number, number, number];
  /** Larger = sparser: an anchor only qualifies when `hash(i) % density === 0`. */
  density: number;
  /** 0-1: how fully faded in the motif is right now — see `decorForTemperature`. */
  strength: number;
}

/** How many degrees past a motif's own threshold it takes to fade fully in (or, approaching from the other side, fully out). */
const DECOR_FADE_RANGE = 8;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The current climate's decorative motif for the empty background — frost
 * crystals in the cold, embers in the heat, a soft sparkle right at the
 * prosperous band — or null in the plain neutral band, where nothing
 * notable is happening. Each motif carries a `strength` that fades in
 * smoothly over DECOR_FADE_RANGE degrees past its threshold (and back out
 * the same way) instead of snapping straight to full opacity the instant
 * the temperature crosses a boundary — dozens of little crystals or embers
 * all popping into existence across the whole screen in the same frame is
 * exactly the "instant cut" a gradual climate is supposed to avoid.
 */
function decorForTemperature(temp: number): DecorMotif | null {
  if (isProsperous(temp)) {
    // Fades in from both edges of the band, peaking at its center.
    const half = (PROSPEROUS_HIGH - PROSPEROUS_LOW) / 2;
    const strength = clamp01(1 - Math.abs(temp - PROSPEROUS_TEMP) / half);
    if (strength <= 0) return null;
    return { shape: PROSPEROUS_SPARKLE_SHAPE, color: [190, 255, 205], density: 1400, strength };
  }
  if (temp <= COLD_1) {
    const strength = clamp01((COLD_1 - temp) / DECOR_FADE_RANGE);
    return { shape: ICE_CRYSTAL_SHAPE, color: [200, 225, 255], density: 1100, strength };
  }
  if (temp >= PROSPEROUS_HIGH) {
    const strength = clamp01((temp - PROSPEROUS_HIGH) / DECOR_FADE_RANGE);
    return { shape: EMBER_SHAPE, color: [255, 150, 90], density: 900, strength };
  }
  return null;
}

/** Cheap integer hash so per-cell color grain is stable frame-to-frame instead of flickering like static. */
function hash(i: number): number {
  let h = (i ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export class PixiStage {
  readonly app: Application;
  private readonly grid: SimGrid;
  private readonly pixels: Uint8Array;
  private readonly source: BufferImageSource;
  private readonly sprite: Sprite;
  /** Non-empty cells as of the last `renderFrame()` — counted alongside the render pass instead of a second full scan. */
  activeCellCount = 0;

  private constructor(app: Application, grid: SimGrid, pixels: Uint8Array, source: BufferImageSource, sprite: Sprite) {
    this.app = app;
    this.grid = grid;
    this.pixels = pixels;
    this.source = source;
    this.sprite = sprite;
  }

  static async create(container: HTMLElement, grid: SimGrid): Promise<PixiStage> {
    const app = new Application();
    await app.init({
      resizeTo: container,
      backgroundColor: 0x05070a,
      antialias: false,
    });
    container.appendChild(app.canvas);

    const pixels = new Uint8Array(grid.width * grid.height * 4);
    const source = new BufferImageSource({
      resource: pixels,
      width: grid.width,
      height: grid.height,
      scaleMode: "nearest",
    });
    const sprite = new Sprite(new Texture({ source }));
    app.stage.addChild(sprite);

    return new PixiStage(app, grid, pixels, source, sprite);
  }

  /**
   * Scales the low-res grid sprite up to fill the canvas, letterboxing to
   * keep square pixels. Called every frame (cheap — a handful of divisions)
   * rather than from a resize event: `resizeTo`'s own resize happens via a
   * ResizeObserver callback that can land after our first layout read, so
   * an event-driven refit was intermittently sizing off a stale 0×0 screen
   * whenever the container wasn't already laid out at init time.
   */
  private fitSprite(): void {
    const scale = Math.min(this.app.screen.width / this.grid.width, this.app.screen.height / this.grid.height);
    this.sprite.width = this.grid.width * scale;
    this.sprite.height = this.grid.height * scale;
    this.sprite.x = (this.app.screen.width - this.sprite.width) / 2;
    this.sprite.y = (this.app.screen.height - this.sprite.height) / 2;
  }

  /** Maps a canvas-space pointer position to a grid cell, or null if outside the letterboxed sprite. */
  pointerToCell(canvasX: number, canvasY: number): [number, number] | null {
    const gx = Math.floor((canvasX - this.sprite.x) / this.sprite.width * this.grid.width);
    const gy = Math.floor((canvasY - this.sprite.y) / this.sprite.height * this.grid.height);
    if (!this.grid.inBounds(gx, gy)) return null;
    return [gx, gy];
  }

  renderFrame(): void {
    this.fitSprite();
    // The grid sprite is sized to fill the container exactly (no
    // letterboxing — see fitSprite), so it fully covers the renderer's own
    // background almost all the time; setting it too is just a harmless
    // fallback for the rare frame where MIN/MAX_GRID_W clamping leaves a
    // sliver exposed. The color that actually reads as "the background" to
    // the player is whatever Empty cells render as below.
    const [br, bg, bb] = colorForTemperature(this.grid.temperature);
    this.app.renderer.background.color = (clamp8(br) << 16) | (clamp8(bg) << 8) | clamp8(bb);
    const decor = decorForTemperature(this.grid.temperature);
    const { material, meta, width } = this.grid;
    let activeCount = 0;
    for (let i = 0; i < material.length; i++) {
      const id = material[i] as MaterialId;
      let [r, g, b] = MATERIALS[id].color;
      const p = i * 4;
      if (id === MaterialId.Empty) {
        // Looks for a nearby sparse "anchor" cell whose shape reaches this
        // pixel — recognizable little frost-crystal/ember/sparkle
        // silhouettes matching the current climate, instead of a single
        // random dot. Purely cosmetic: `hash` keeps each anchor in a
        // stable spot frame to frame instead of flickering like static.
        let dr = br;
        let dg = bg;
        let db = bb;
        if (decor) {
          const x = i % width;
          const y = (i / width) | 0;
          for (const [sdx, sdy, intensity] of decor.shape) {
            const ax = x - sdx;
            const ay = y - sdy;
            if (ax < 0 || ax >= width || ay < 0 || ay >= this.grid.height) continue;
            const ai = ay * width + ax;
            if (material[ai] !== MaterialId.Empty || hash(ai) % decor.density !== 0) continue;
            const t = 0.26 * intensity * decor.strength;
            dr = dr + (decor.color[0] - dr) * t;
            dg = dg + (decor.color[1] - dg) * t;
            db = db + (decor.color[2] - db) * t;
            break;
          }
        }
        this.pixels[p] = clamp8(dr);
        this.pixels[p + 1] = clamp8(dg);
        this.pixels[p + 2] = clamp8(db);
        this.pixels[p + 3] = 255;
        continue;
      }
      activeCount++;
      if (id === MaterialId.Water && meta[i] > 0) {
        // Salty water stays the same blue, just lighter — lerping each
        // channel toward white by a fraction, instead of toward a fixed
        // pale color that would wash the hue out toward gray.
        const t = (meta[i] / 255) * SALT_LIGHTEN;
        r = r + (255 - r) * t;
        g = g + (255 - g) * t;
        b = b + (255 - b) * t;
      } else if (id === MaterialId.Flor) {
        // Each petal cell picks one of a few colors by its meta "variant"
        // instead of always rendering the same flower color, so different
        // germinations read as visually distinct little flowers.
        [r, g, b] = FLOWER_COLORS[meta[i] % FLOWER_COLORS.length];
      } else if (id === MaterialId.Fire) {
        // Fades toward black over its last FIRE_FADE_TICKS of fuel instead
        // of burning at full brightness right up until it pops to Empty.
        const t = Math.min(1, meta[i] / FIRE_FADE_TICKS);
        r *= t;
        g *= t;
        b *= t;
      }
      // Liquids constantly swap cells while finding their level, so grain
      // keyed on grid position (not particle identity) would flicker as
      // water moves — keep them a flat color and reserve the grain for
      // materials that actually stay put once settled.
      const grain = MATERIALS[id].category === MaterialCategory.Liquid ? 0 : (hash(i) % 21) - 10;
      this.pixels[p] = clamp8(r + grain);
      this.pixels[p + 1] = clamp8(g + grain);
      this.pixels[p + 2] = clamp8(b + grain);
      this.pixels[p + 3] = 255;
    }

    // Electricity has no physical form, so it's never in `material` —
    // paint its charges as a bright overlay on top of whatever they're
    // currently passing over (open air or the conductor carrying them).
    const [er, eg, eb] = MATERIALS[MaterialId.Electricity].color;
    for (const pulse of this.grid.activePulses) {
      const p = this.grid.index(pulse.x, pulse.y) * 4;
      this.pixels[p] = er;
      this.pixels[p + 1] = eg;
      this.pixels[p + 2] = eb;
      this.pixels[p + 3] = 255;
    }

    // Shrapnel is also never in `material` — a purely decorative overlay,
    // rounded from its float position, blended into whatever's already
    // drawn there instead of a flat opaque overwrite so it reads as a
    // translucent fleck of debris rather than a solid dot. Its blend
    // strength ramps down with its remaining life, so it always reads as
    // gradually dying out rather than an abrupt pop when it's removed.
    const [sr, sg, sb] = SHRAPNEL_COLOR;
    for (const s of this.grid.activeShrapnel) {
      const gx = Math.round(s.x);
      const gy = Math.round(s.y);
      if (!this.grid.inBounds(gx, gy)) continue;
      const p = this.grid.index(gx, gy) * 4;
      const t = SHRAPNEL_ALPHA * (s.life / s.maxLife);
      this.pixels[p] = clamp8(this.pixels[p] + (sr - this.pixels[p]) * t);
      this.pixels[p + 1] = clamp8(this.pixels[p + 1] + (sg - this.pixels[p + 1]) * t);
      this.pixels[p + 2] = clamp8(this.pixels[p + 2] + (sb - this.pixels[p + 2]) * t);
      this.pixels[p + 3] = 255;
    }

    // A fresh detonation's Flash — very bright, near-white, and gone within
    // a couple of ticks (see FLASH_LIFE). Drawn last so it reads as a burst
    // of light on top of everything else at the epicenter for that instant.
    for (const f of this.grid.activeFlashes) {
      if (!this.grid.inBounds(f.x, f.y)) continue;
      const p = this.grid.index(f.x, f.y) * 4;
      const t = f.life / f.maxLife;
      this.pixels[p] = clamp8(this.pixels[p] + (255 - this.pixels[p]) * t);
      this.pixels[p + 1] = clamp8(this.pixels[p + 1] + (250 - this.pixels[p + 1]) * t);
      this.pixels[p + 2] = clamp8(this.pixels[p + 2] + (230 - this.pixels[p + 2]) * t);
      this.pixels[p + 3] = 255;
    }

    this.activeCellCount = activeCount + this.grid.activePulses.length + this.grid.activeShrapnel.length;
    this.source.update();
  }
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
