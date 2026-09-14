/*
 * ── Creatures (Formiga, Pássaro, Peixe, o povo, Esqueleto) ─────────────────
 *
 * Every creature packs its state into its one `meta` byte, since `meta` is
 * what rides along through `swap()`:
 *
 *   bit 0        facing: 0 = left, 1 = right
 *   bits 1..2    a small per-creature timer/phase (drown, flop, lay, carry)
 *   bits 3..7    a 0-31 "fed" gauge — food refills it, it drains over time,
 *                and at 0 the creature slowly dies of hunger
 *
 * Deliberately low reproduction and non-zero starvation so a scene doesn't
 * fill up with animals: a colony only holds if there's food to sustain it.
 */
export const CREATURE_FED_MAX = 31;
export const CREATURE_FED_BITS = 3;
/**
 * Per-tick chance a creature whose fed gauge has been sitting at 0 finally
 * dies of starvation. Deliberately tiny: a well-fed animal takes a long
 * time to run its gauge down in the first place, and even once it's
 * completely starved it lingers for a good while — so a colony with any
 * food at all holds indefinitely, and only a swarm left with truly nothing
 * to eat slowly thins out.
 */
export const CREATURE_STARVE_DEATH_CHANCE = 0.0005;

/** Packs a creature's state into its one `meta` byte — see the block comment above. */
export function packCreature(facing: number, timer: number, fed: number): number {
  return (facing > 0 ? 1 : 0) | ((timer & 0x3) << 1) | ((Math.max(0, Math.min(CREATURE_FED_MAX, fed)) & 0x1f) << CREATURE_FED_BITS);
}
export function creatureFacing(meta: number): number {
  return meta & 1 ? 1 : -1;
}
export function creatureTimer(meta: number): number {
  return (meta >> 1) & 0x3;
}
export function creatureFed(meta: number): number {
  return (meta >> CREATURE_FED_BITS) & 0x1f;
}
