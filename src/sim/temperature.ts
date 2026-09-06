/**
 * Global temperature thresholds, shared between the simulation (grid.ts,
 * which reacts to them — spontaneous fires, ambient freezing/melting,
 * plant growth) and the UI (which picks an icon for the current reading).
 * Kept in one place so both sides always agree on where one band ends and
 * the next begins.
 *
 * Eight contiguous bands cover the whole -50..170 range, each with its
 * own icon: Congelante, Muito frio, Frio, Neutro (the default resting
 * state — NEUTRAL_TEMP sits in the middle of it), Próspero (the narrow
 * sweet spot the player has to warm *up* to from neutral and then hold),
 * Quente, Muito quente, Escaldante.
 */

/** Absolute floor/ceiling the background color (and the temperature itself) clamp to. */
export const EXTREME_COLD = -50;
export const EXTREME_HOT = 170;

/** Where the grid sits with nothing hot or cold anywhere on it — the actual default, not the prosperous band. */
export const NEUTRAL_TEMP = 10;

/** Cold milestones, mildest first (each is that band's *warm* edge). */
export const COLD_1 = 0;
export const COLD_2 = -15;
export const COLD_3 = -30;

/** The band prosperous for life as we know it — a deliberate target above neutral, not the resting state. */
export const PROSPEROUS_LOW = 20;
export const PROSPEROUS_HIGH = 30;
/** Reference midpoint, used only for labeling/hint copy — the band itself is what matters for logic. */
export const PROSPEROUS_TEMP = 25;

/** Hot milestones, mildest first (each is that band's *cool* edge). PROSPEROUS_HIGH doubles as HOT_1 — Quente starts exactly where Próspero ends. */
export const HOT_1 = PROSPEROUS_HIGH;
export const HOT_2 = 55;
export const HOT_3 = 90;

export function isProsperous(temp: number): boolean {
  return temp >= PROSPEROUS_LOW && temp < PROSPEROUS_HIGH;
}
