# Testkit

Reusable helpers for testing sim changes the way a player would actually
encounter them: thick, irregular brush strokes on varied terrain shapes,
long sessions that give slow interactions (growth, spread, a pip crossing
the map) time to actually happen, and checks based on the engine's own
signals instead of fragile position-diffing.

This exists because several ad-hoc test scripts this session each rebuilt
the same handful of things slightly wrong, and each wrong version produced
a real, misleading failure before the actual mistake was found:

- **A straight 1px line, painted once, isn't what a player paints.**
  `paintProfileBand` (in `terrain.ts`) always paints as several overlapping,
  wobbly, thick-brush passes.
- **A Powder settles under gravity after being painted; its resting shape
  is not the shape it was painted in.** Painting a second material against
  the *original* silhouette (or even a guessed offset from it) either
  misses the real surface — `paint`/`paintLine` silently do nothing when
  the target cell isn't Empty, so it just looks like the brush failed — or
  leaves the second material floating in open air, disconnected from the
  ground. This happened in three separate live-browser attempts before the
  cause was found by inspecting screenshots, not headless numbers. Use
  `surfaceProfile` to measure the *actual* settled surface and build the
  next layer from that, never from the original profile.
- **`paintLine` can hang forever on non-integer coordinates.** Its
  Bresenham walk advances by exactly ±1 and stops on exact equality with
  the endpoint; a fractional endpoint (trivial to produce from any
  `Math.sin`-based terrain shape) never gets hit, so it loops forever with
  no error. `paintLine`/`paint` in `src/sim/grid.ts` now round their inputs
  defensively, and `paintProfileBand` also rounds explicitly. If you ever
  call `grid.paintLine`/`grid.paint` directly with computed coordinates,
  round them yourself too, on principle.
- **Tracking "the same" pip tick-to-tick by nearest-position-match breaks
  the moment two pips of the same trade are near each other** — it silently
  latches onto the wrong one and reports a fake teleport. Use `scanFolk`
  and the engine's own `stuckTicks` field (`findStuckFolk`) instead of
  reimplementing identity tracking in a test script.
- **A long session with no food source starves every pip to death before
  the behavior under test ever runs**, which reads as "it never got there"
  instead of "it died of hunger 4000 ticks ago". `runSession`'s `keepFed`
  (on by default) makes this a visible, deliberate choice.
- **A 30-60 second live-browser check is too short for anything involving
  growth or spread.** `browser.mjs`'s `observeSession` defaults to a
  3-minute window with periodic screenshots — actually look at the
  screenshots, not just the numbers.
- **Per-tick full-grid-scan instrumentation on a large grid over many
  thousands of ticks is slow enough to matter.** `runSession` only refreshes
  hunger every `keepFedEvery` ticks (default 50, not every tick) for
  exactly this reason — fed only decays on average once every ~320 ticks,
  so refreshing every tick was pure waste.

## Files

- **`terrain.ts`** — `paintProfileBand` + shape presets (`hillProfile`,
  `valleyProfile`, `cliffProfile`, `undulatingProfile`) for headless
  `SimGrid` tests, plus `surfaceProfile` (measure a settled layer's real
  surface) and `countMaterial`.
- **`session.ts`** — `runSession` for long, player-scale headless runs
  (`TICKS_PER_MINUTE` to think in player time), `scanFolk`/`findStuckFolk`
  for population-level checks that don't need per-pip identity tracking,
  and `keepFolkFed` to rule out starvation as a confound.
- **`browser.mjs`** — a Playwright driver for live-UI checks:
  `launchGame`, `paintThickWavyStroke`, `waitSettle`, `placeFolk`,
  `observeSession`. Same shape lessons as `terrain.ts`, applied to actually
  dragging the mouse across the real canvas.

## Usage

Headless (build with esbuild, run with node, same as any scratchpad script
— these aren't wired into `npm run check`/`build` on purpose, since they're
a test-authoring aid, not part of the shipped app):

```ts
import { SimGrid } from "../../src/sim/grid";
import { MaterialId } from "../../src/sim/types";
import { paintProfileBand, hillProfile, surfaceProfile } from "./terrain";
import { runSession, findStuckFolk, TICKS_PER_MINUTE } from "./session";

const g = new SimGrid(300, 150);
const hill = hillProfile(/* peakX */ 150, /* peakY */ 40, /* baseY */ 110, /* halfWidth */ 120);
paintProfileBand(g, hill, { x0: 20, x1: 280, material: MaterialId.Dirt });

const surface = surfaceProfile(g, MaterialId.Dirt, 20, 280);
paintProfileBand(g, (x) => surface(x) - 2, { x0: 80, x1: 220, material: MaterialId.Fungus, radius: 6, settleTicks: 0 });

g.set(150, Math.round(surface(150)) - 1, MaterialId.Lumberjack, g.metaFor(MaterialId.Lumberjack));
const result = runSession(g, { ticks: TICKS_PER_MINUTE * 3, sampleEvery: 200 });
console.log(result.stuckSightings); // should be empty
```

Live browser, mirroring the same scene:

```js
import { launchGame, paintThickWavyStroke, waitSettle, placeFolk, observeSession } from "./browser.mjs";

const { browser, page, cx, groundY } = await launchGame();
await paintThickWavyStroke(page, { category: "Powders", material: "Dirt", x0: cx - 260, x1: cx + 260, y: groundY, radius: 10, passes: 14 });
await waitSettle(page); // Dirt is a Powder — let it slump into its real shape before painting on top
await paintThickWavyStroke(page, { category: "Plants", material: "Fungus", x0: cx - 40, x1: cx + 140, y: groundY + 45, radius: 8 });
await placeFolk(page, "Lumberjack", cx - 55, groundY + 25);
await observeSession(page, { totalSeconds: 180, intervalSeconds: 20, outDir: "/tmp", prefix: "session" });
// then actually look at the screenshots in /tmp/session_t*.png
await browser.close();
```
