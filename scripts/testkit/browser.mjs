// Reusable live-browser driver for "test it like a player would" checks.
//
// This consolidates a pattern that took four attempts to get right in one
// session: paint a thick, wavy, irregular stroke (never a straight 1px
// line); when the material is a Powder, actually WAIT for it to settle
// under gravity before painting anything on top of it (skipping this left
// a second material floating in open air, disconnected from the ground, in
// three separate live-browser attempts before the cause — Powder slumping
// well below wherever it was originally dragged — was even identified);
// and watch for a long time (minutes, not 30-60s) so slow, emergent
// interactions (growth, spread, a pip crossing the map) actually have a
// chance to happen before you conclude something doesn't work.
//
// Gotcha: the tile you paint isn't always the material you end up with —
// several materials are growth STAGES, not paintable tiles, and clicking a
// `.material-popup .tile` with a stage's name just times out with no
// useful error. To grow a real tree, paint "Seed" (Plants) and wait; it
// becomes a Sprout, then a hardened trunk, on its own. Cogumelo/Mushroom
// isn't paintable at all — it only grows out of a mature Fungus patch.
// When in doubt, open the category and dump `.material-popup .tile`'s
// text contents once to see the real tile names before scripting the rest.
//
// Usage sketch:
//   import { launchGame, paintThickWavyStroke, waitSettle, placeFolk, observeSession } from "./browser.mjs";
//   const { browser, page, cx, groundY } = await launchGame();
//   await paintThickWavyStroke(page, { category: "Powders", material: "Dirt", x0: cx - 260, x1: cx + 260, y: groundY, radius: 10 });
//   await waitSettle(page); // Dirt is a Powder — let it slump into its real resting shape first
//   await paintThickWavyStroke(page, { category: "Plants", material: "Fungus", x0: cx - 40, x1: cx + 140, y: groundY + 45, radius: 9 });
//   await placeFolk(page, "Lumberjack", cx - 55, groundY + 25);
//   const shots = await observeSession(page, { totalSeconds: 180, intervalSeconds: 20, outDir: "/tmp", prefix: "session" });
//   await browser.close();

import { chromium } from "/Users/viniciuscastro/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs";
import { readdirSync } from "fs";

const DEFAULT_URL = "http://localhost:5173/Powder-Plant/";

function findHeadlessShell() {
  const cacheDir = "/Users/viniciuscastro/Library/Caches/ms-playwright";
  const shellDir = readdirSync(cacheDir).find((d) => d.startsWith("chromium_headless_shell-"));
  return `${cacheDir}/${shellDir}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
}

/**
 * Launches the game and returns the page plus handy geometry (canvas
 * bounding box, horizontal center, and a `groundY` guess at 55% of the
 * canvas height — a reasonable default baseline for "paint ground starting
 * here downward", matching what finally worked after three earlier scripts
 * guessed a baseline too close to the canvas edge or the viewport center).
 */
export async function launchGame(url = DEFAULT_URL, { viewport = { width: 1280, height: 900 }, deviceScaleFactor = 2 } = {}) {
  const browser = await chromium.launch({
    executablePath: findHeadlessShell(),
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const skip = page.locator("text=Skip").first();
  if (await skip.count()) await skip.click();
  await page.waitForTimeout(300);
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  const slider = page.locator("input[type=range]");
  return {
    browser, page, canvas, box, slider, errors,
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    groundY: box.y + box.height * 0.55,
  };
}

/** Opens a top-level material category and clicks the named tile — e.g. selectMaterial(page, "Powders", "Dirt"). */
export async function selectMaterial(page, category, material) {
  await page.locator("button", { hasText: category }).first().click();
  await page.waitForTimeout(100);
  await page.locator(".material-popup .tile", { hasText: material, exact: true }).first().click();
  await page.waitForTimeout(100);
}

async function setBrush(page, slider, radius) {
  await slider.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, radius);
}

/**
 * Drags a thick brush along a wobbly path from (x0, y) to (x1, y) — never a
 * straight 1px line. `passes` stacks several such strokes downward
 * (`passSpacing` apart) for real thickness, the same way a player fills in
 * a mound with repeated drags rather than one thin ribbon.
 */
export async function paintThickWavyStroke(page, opts) {
  const {
    category, material, slider = page.locator("input[type=range]"),
    x0, x1, y,
    radius = 9, amplitude = 12, wavelength = 60, jitter = 6,
    passes = 1, passSpacing = 12, step = 8,
  } = opts;
  if (category && material) await selectMaterial(page, category, material);
  await setBrush(page, slider, radius);
  const phase = Math.random() * Math.PI * 2;
  for (let pass = 0; pass < passes; pass++) {
    const rowY = y + pass * passSpacing;
    await page.mouse.move(x0, rowY);
    await page.mouse.down();
    for (let x = x0; x <= x1; x += step) {
      const wobble = Math.sin(x / wavelength + phase) * amplitude + (Math.random() - 0.5) * jitter;
      await page.mouse.move(x, rowY + wobble);
    }
    await page.mouse.up();
  }
}

/**
 * Waits for freshly-painted Powder to fully settle under gravity. Call
 * this before painting anything meant to sit "on top of" or "connected
 * to" a Powder stroke — skipping it is what produced a floating,
 * disconnected patch in three separate attempts this session. 2.5s is
 * generous for a mound a few hundred cells wide; make it longer for a
 * taller or wider pile.
 */
export async function waitSettle(page, ms = 2500) {
  await page.waitForTimeout(ms);
}

/** Places a single Folk unit (Mason, Lumberjack, Farmer, Warrior, ...) at a page coordinate. */
export async function placeFolk(page, kind, x, y, { slider = page.locator("input[type=range]") } = {}) {
  await selectMaterial(page, "Folk", kind);
  await setBrush(page, slider, 1);
  await page.mouse.click(x, y);
}

/**
 * Watches the running game for a realistic length of time, screenshotting
 * at regular intervals, instead of a single check 30-60s in. Defaults to a
 * 3-minute total window — long enough for a crop to mature, a Cogumelo
 * cluster to grow, or a pip to walk cross-map and start working, all of
 * which routinely take longer than a minute of real play. Returns the list
 * of screenshot paths taken, in order.
 */
export async function observeSession(page, { totalSeconds = 180, intervalSeconds = 20, outDir = "/tmp", prefix = "session", onTick } = {}) {
  const paths = [];
  let elapsed = 0;
  while (elapsed < totalSeconds) {
    await page.waitForTimeout(intervalSeconds * 1000);
    elapsed += intervalSeconds;
    const path = `${outDir}/${prefix}_t${elapsed}.png`;
    await page.screenshot({ path });
    paths.push(path);
    await onTick?.(elapsed, path);
  }
  return paths;
}
