/**
 * Save/load for painted maps. A map is just the grid's material + meta
 * arrays plus its dimensions and current temperature — the transient stuff
 * (electricity pulses, explosion debris, blast waves) is deliberately left
 * out, exactly like `SimGrid.reset()` clears it, since none of it is worth
 * freezing mid-flight.
 *
 * Storage is split across localStorage keys so saving one map doesn't
 * rewrite every other one: a single small index lists what exists, and each
 * map's (potentially large) cell data lives under its own key.
 */

const SCHEMA_VERSION = 1;
const INDEX_KEY = "powder-and-plant:maps";
const DATA_PREFIX = "powder-and-plant:map:";

/** The serialized cells of one map — see `SimGrid.serialize`/`load`. */
export interface MapSnapshot {
  v: number;
  /** Grid width the map was painted at; loading into a different width centers it horizontally. */
  w: number;
  /** Grid height (always 216 today, but stored so a future change stays loadable). */
  h: number;
  /** Ambient temperature at save time, so a loaded scene starts at the right climate instead of drifting there. */
  temp: number;
  /** Run-length-encoded material ids: [value, count, value, count, ...]. */
  mat: number[];
  /** Run-length-encoded per-cell meta bytes, same pair layout. */
  meta: number[];
}

/** One entry in the saved-maps index. */
export interface MapMeta {
  id: string;
  name: string;
  /** Epoch ms. */
  savedAt: number;
}

/** File wrapper for export/import — the snapshot plus its name. */
export interface MapFile {
  format: "powder-and-plant-map";
  v: number;
  name: string;
  snapshot: MapSnapshot;
}

export function rleEncode(arr: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < arr.length) {
    const value = arr[i];
    let run = 1;
    while (i + run < arr.length && arr[i + run] === value) run++;
    out.push(value, run);
    i += run;
  }
  return out;
}

export function rleDecode(pairs: readonly number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let pos = 0;
  for (let k = 0; k + 1 < pairs.length && pos < length; k += 2) {
    const value = pairs[k];
    const run = Math.min(pairs[k + 1], length - pos);
    out.fill(value, pos, pos + run);
    pos += run;
  }
  return out;
}

function readIndex(): MapMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is MapMeta =>
        m && typeof m.id === "string" && typeof m.name === "string" && typeof m.savedAt === "number",
    );
  } catch {
    return [];
  }
}

function writeIndex(index: MapMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

/** Saved maps, newest first. */
export function listMaps(): MapMeta[] {
  return readIndex().sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Thrown when localStorage rejects a write. Carries a stable `code` so the
 * UI layer can show a message in the player's language instead of this
 * English fallback.
 */
export class StorageFullError extends Error {
  readonly code = "storage-full";
  constructor() {
    super("Storage is full — delete a map and try again.");
    this.name = "StorageFullError";
  }
}

/** Thrown when an imported file isn't a recognizable Powder & Plant map. */
export class MapFileError extends Error {
  readonly code = "invalid-map-file";
  constructor() {
    super("That file isn't a Powder & Plant map.");
    this.name = "MapFileError";
  }
}

/**
 * Saves `snapshot` under `name`. A name that already exists (trimmed,
 * case-insensitively) overwrites that map in place rather than piling up a
 * second copy. Throws `StorageFullError` if localStorage rejects the write.
 */
export function saveMap(name: string, snapshot: MapSnapshot): MapMeta {
  const trimmed = name.trim() || "Untitled";
  const index = readIndex();
  const existing = index.find((m) => m.name.trim().toLowerCase() === trimmed.toLowerCase());
  const meta: MapMeta = {
    id: existing?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(DATA_PREFIX + meta.id, JSON.stringify(snapshot));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      throw new StorageFullError();
    }
    throw e;
  }

  const nextIndex = existing ? index.map((m) => (m.id === meta.id ? meta : m)) : [...index, meta];
  try {
    writeIndex(nextIndex);
  } catch {
    localStorage.removeItem(DATA_PREFIX + meta.id);
    throw new StorageFullError();
  }
  return meta;
}

export function loadMapSnapshot(id: string): MapSnapshot | null {
  try {
    const raw = localStorage.getItem(DATA_PREFIX + id);
    if (!raw) return null;
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function deleteMap(id: string): void {
  localStorage.removeItem(DATA_PREFIX + id);
  writeIndex(readIndex().filter((m) => m.id !== id));
}

/** Wraps a snapshot for download as a shareable `.json` file. */
export function toMapFile(name: string, snapshot: MapSnapshot): MapFile {
  return { format: "powder-and-plant-map", v: SCHEMA_VERSION, name: name.trim() || "Untitled", snapshot };
}

/** Parses an imported file, throwing if it isn't a recognizable map. */
export function parseMapFile(text: string): { name: string; snapshot: MapSnapshot } {
  const parsed = JSON.parse(text);
  const knownFormats = ["powder-and-plant-map", "powders-and-plants-map"];
  if (!parsed || !knownFormats.includes(parsed.format) || !parsed.snapshot) {
    throw new MapFileError();
  }
  return {
    name: typeof parsed.name === "string" ? parsed.name : "Imported map",
    snapshot: normalizeSnapshot(parsed.snapshot),
  };
}

/** Validates the shape of a parsed snapshot and coerces obvious problems, or throws. */
function normalizeSnapshot(raw: unknown): MapSnapshot {
  const s = raw as Partial<MapSnapshot>;
  if (
    !s ||
    typeof s.w !== "number" ||
    typeof s.h !== "number" ||
    !Array.isArray(s.mat) ||
    !Array.isArray(s.meta) ||
    s.w <= 0 ||
    s.h <= 0
  ) {
    throw new MapFileError();
  }
  return {
    v: typeof s.v === "number" ? s.v : SCHEMA_VERSION,
    w: Math.round(s.w),
    h: Math.round(s.h),
    temp: typeof s.temp === "number" ? s.temp : 10,
    mat: s.mat as number[],
    meta: s.meta as number[],
  };
}

export { SCHEMA_VERSION };
