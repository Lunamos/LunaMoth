/* Compile-time exhaustiveness for discriminated-union switches.
 *
 * Call in a switch `default` after every known case. If a new union member is
 * added and a switch forgets to handle it, the argument stops being `never` and
 * this call fails to typecheck — the compiler points at exactly the stale switch.
 *
 * At RUNTIME it degrades to a no-op (warn + return null) rather than throwing:
 * the protocol layer is forward-compatible by design (clients ignore unknown
 * types), so an unexpected value must not crash a render or the stream loop. */
export function assertNever(x: never): null {
  if (typeof console !== "undefined") console.warn("unhandled union member:", x);
  return null;
}
