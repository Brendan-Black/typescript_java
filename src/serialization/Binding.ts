/**
 * The two things every binding contract needs and none of them owns.
 *
 * Internal to the serialization layer — deliberately absent from the package root, because neither of these is
 * something a caller composes a contract out of. They are here rather than duplicated across four modules so
 * that a failure reads identically whichever format and whichever direction it came from.
 */

/**
 * What to call a value in a message.
 *
 * The type name rather than the value, except for the handful of cases where the value is short and saying it
 * is more use than naming its type. Shared by the readers, which describe what a document turned out to hold,
 * and the writers, which describe what a `T` turned out to hold — the same sentence either way.
 */
export function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "nothing";
  }
  if (Array.isArray(value)) {
    return "an array";
  }
  if (typeof value === "object") {
    return "an object";
  }
  if (typeof value === "string") {
    return "a string";
  }
  return `${typeof value} ${String(value)}`;
}

/**
 * The values on the path from the root of the document down to whatever is being written just now.
 *
 * Module-level because a writer's `write` has nowhere to thread it: the recursion runs through separate writer
 * objects a caller composed, and widening the signature to carry a set would put the bookkeeping in the way of
 * everyone who ever writes a contract of their own. Writing is synchronous from the first call to the last, so
 * a single set is not shared between two traversals that could interleave, and {@link withoutCycles} removes
 * what it added even when the write below it throws.
 */
const open = new Set<object>();

/**
 * Runs `write` with `value` marked as being written, and refuses a value that is already on the path above it.
 *
 * A document is a tree, and a cycle has no JSON or XML form at all — the same object twice over is where a
 * hand-rolled encoder recurses until the stack gives out. `JSON.stringify` catches it and says
 * `Converting circular structure to JSON`; this says which slot closed the loop.
 *
 * The same value appearing twice in different branches is a tree and passes: only ancestors are held, and each
 * is dropped again on the way back up.
 *
 * @param onCycle what to throw when `value` is already open — the caller's own bind failure, since the two
 *   formats raise different ones
 */
export function withoutCycles<T>(value: unknown, onCycle: () => never, write: () => T): T {
  if (typeof value !== "object" || value === null) {
    return write();
  }
  if (open.has(value)) {
    return onCycle();
  }
  open.add(value);
  try {
    return write();
  } finally {
    open.delete(value);
  }
}
