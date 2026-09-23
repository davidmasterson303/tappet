/**
 * Which concept of an unbuilt design this build draws — the loop's A/B/C gate.
 *
 * ── Why the real screens, and not a mock ────────────────────────────────────
 *
 * This is how 13 Sep's hub concepts were put to the critic
 * (`design-loop/mobile-ios/concepts/hub/README.md`): three candidates built as
 * screens the app actually renders, on real rows, shot on the simulator. A
 * mock would have been faster and would have been judged on the mock — the
 * type would be a designer's guess at the type, the values a designer's guess
 * at the values, and the critique would be of a picture rather than of the
 * product. Every concept here reaches the same data through the same client.
 *
 * ── ⚠ Gating, and why it is not `fixtures`' gate ────────────────────────────
 *
 * `__DEV__` **and** `EXPO_PUBLIC_DESIGN_VARIANT` set to a known letter. It is
 * deliberately *not* behind `EXPO_PUBLIC_DESIGN_FIXTURES`: these concepts are
 * judged on the reviewer account's three real cars, because the thing under
 * design is a **switcher between cars** and the fixture garage holds one.
 *
 * ⚠ **This module is temporary.** It exists for one round: three answers to
 * "how does an owner change which car the app is about" go to the critic
 * blind, one is picked, and the other two are deleted along with this file.
 * A variant gate that outlives its round becomes a second codebase behind a
 * flag nobody reads — so if this is still here after the loop closes, that is
 * the bug, not the concepts.
 *
 * 22 Sep 2026, for the Garage/Car redundancy (drift §6.23).
 */
export type DesignVariant = 'a' | 'b' | 'c';

const VARIANTS: readonly string[] = ['a', 'b', 'c'];

/**
 * The letter this build draws, or `null` for the shipped app.
 *
 * Read at call time rather than at import: Metro inlines `process.env` at
 * bundle time either way, but a function keeps the gate readable at the one
 * place it matters and keeps a stale module-level constant from surviving a
 * fast refresh mid-capture.
 */
export function designVariant(): DesignVariant | null {
  if (!__DEV__) return null;
  const raw = (process.env.EXPO_PUBLIC_DESIGN_VARIANT ?? '').trim().toLowerCase();
  return VARIANTS.includes(raw) ? (raw as DesignVariant) : null;
}

/**
 * Whether the app is drawing a car-first structure — four tabs, no garage.
 *
 * All three concepts share it: it is the premise they are three answers to,
 * not a thing they differ on. David, 22 Sep, on the garage and the car tabs
 * feeling redundant: *"a and c are ruled out for the subpar solution to
 * single car owner, which is not an edge case at all … let's try b."*
 */
export function carFirstStructure(): boolean {
  return designVariant() !== null;
}
