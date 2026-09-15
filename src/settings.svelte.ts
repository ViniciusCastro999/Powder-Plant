/**
 * App-wide display/behavior settings the player picks in the Options
 * modal — temperature unit, the reference grid overlay, and whether
 * painting snaps to it. Kept in a `.svelte.ts` module, same pattern as
 * `i18n/locale.svelte.ts`, so any component reading these reruns when the
 * player changes one, and each persists across reloads independently.
 */

export type TemperatureUnit = "c" | "f";

/**
 * The reference grid's square size, in cells — always a divisor of 108
 * (half of the sim's fixed 216-row height) so the grid's center line and
 * every line above/below it land exactly on a row boundary, right out to
 * the top and bottom edges, with no leftover margin needed vertically for
 * any of the three sizes. See Canvas.svelte's drawableBounds for how the
 * (window-width-dependent) horizontal margin is derived the same way.
 */
export type GridSize = "small" | "medium" | "large";
export const GRID_SPACING: Record<GridSize, number> = {
  small: 12, // 18 squares tall, 9 each side of center
  medium: 18, // 12 squares tall, 6 each side
  large: 36, // 6 squares tall, 3 each side
};

const TEMP_UNIT_KEY = "powder-and-plant:temp-unit";
const SHOW_GRID_KEY = "powder-and-plant:show-grid";
const SNAP_GRID_KEY = "powder-and-plant:snap-grid";
const GRID_SIZE_KEY = "powder-and-plant:grid-size";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "1") return true;
    if (saved === "0") return false;
  } catch {
    // localStorage can throw in private mode — fall back silently.
  }
  return fallback;
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Ignore — the choice just won't persist across reloads.
  }
}

function detectTempUnit(): TemperatureUnit {
  try {
    const saved = localStorage.getItem(TEMP_UNIT_KEY);
    if (saved === "c" || saved === "f") return saved;
  } catch {
    // Ignore.
  }
  return "c";
}

function detectGridSize(): GridSize {
  try {
    const saved = localStorage.getItem(GRID_SIZE_KEY);
    if (saved === "small" || saved === "medium" || saved === "large") return saved;
  } catch {
    // Ignore.
  }
  return "medium";
}

let tempUnitState = $state<TemperatureUnit>(detectTempUnit());
let showGridState = $state(readBool(SHOW_GRID_KEY, false));
let snapGridState = $state(readBool(SNAP_GRID_KEY, false));
let gridSizeState = $state<GridSize>(detectGridSize());

export function temperatureUnit(): TemperatureUnit {
  return tempUnitState;
}
export function setTemperatureUnit(next: TemperatureUnit): void {
  tempUnitState = next;
  try {
    localStorage.setItem(TEMP_UNIT_KEY, next);
  } catch {
    // Ignore.
  }
}

/** Celsius (the sim's own native unit) to whatever the player picked, for display only. */
export function displayTemperature(celsius: number): number {
  return tempUnitState === "f" ? celsius * 1.8 + 32 : celsius;
}

export function showGrid(): boolean {
  return showGridState;
}
export function setShowGrid(next: boolean): void {
  showGridState = next;
  writeBool(SHOW_GRID_KEY, next);
}

export function snapToGrid(): boolean {
  return snapGridState;
}
export function setSnapToGrid(next: boolean): void {
  snapGridState = next;
  writeBool(SNAP_GRID_KEY, next);
}

export function gridSize(): GridSize {
  return gridSizeState;
}
export function setGridSize(next: GridSize): void {
  gridSizeState = next;
  try {
    localStorage.setItem(GRID_SIZE_KEY, next);
  } catch {
    // Ignore.
  }
}

/** Cells per grid square for the currently-picked size. */
export function gridSpacing(): number {
  return GRID_SPACING[gridSizeState];
}
