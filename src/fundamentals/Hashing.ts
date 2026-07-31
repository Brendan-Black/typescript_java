import { _Object } from "./Object.js";

/**
 * Identity hash codes for values that have no value-based hash of their own — plain objects, arrays, functions,
 * unregistered symbols. Java's `System.identityHashCode` derives one from the object header; JavaScript will not
 * show us a pointer, so we mint a number lazily and remember it. A WeakMap holds the entry only as long as the
 * key itself is alive, so this does not leak.
 */
const IDENTITY_HASHES = new WeakMap<WeakKey, number>();

/** scratch space for pulling the IEEE-754 bits out of a double, allocated once rather than per call */
const DOUBLE_BITS = new DataView(new ArrayBuffer(8));

function identityHashCode(value: WeakKey): number {
  let hash = IDENTITY_HASHES.get(value);
  if (hash === undefined) {
    hash = Math.floor(Math.random() * 0x7fffffff);
    IDENTITY_HASHES.set(value, hash);
  }
  return hash;
}

/**
 * Java's `String.hashCode`: `s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]`, truncated to a signed 32-bit int.
 * Reproduced exactly rather than approximated, so a hash computed here matches one computed on the JVM.
 */
function stringHashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function numberHashCode(value: number): number {
  // `Integer.hashCode(i)` is `i`, so small integers hash to themselves and stay readable in a debugger.
  // `-0 | 0` is `0`, which is what we want here: SameValueZero treats -0 and 0 as the same key.
  if (Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff) {
    return value | 0;
  }
  // `Double.hashCode`: the 64 bits of the double, folded in half.
  DOUBLE_BITS.setFloat64(0, value);
  return (DOUBLE_BITS.getInt32(0) ^ DOUBLE_BITS.getInt32(4)) | 0;
}

/**
 * Java's `Objects.hashCode(o)`, widened to cover the JavaScript types Java has no equivalent for.
 *
 * Every hash-based collection in this library routes through here, which is what lets a {@link Map} be keyed
 * on a string, a number, or an {@link _Object} with equal comfort. The rules:
 *
 * - `null` and `undefined` hash to `0`, matching `Objects.hashCode(null)`
 * - strings, numbers, bigints and booleans hash by value, using Java's own algorithms where Java has one
 * - an {@link _Object} hashes to whatever its `hashCode()` returns, so value types can opt in by overriding
 * - anything else — a plain object, an array, a function — gets a stable identity hash, which is exactly what
 *   Java's `Object.hashCode` gives you for a class that has not overridden it
 *
 * @param value the value to hash; any type, including null and undefined
 * @returns a signed 32-bit integer
 */
export function hashCodeOf(value: unknown): number {
  if (value === null || value === undefined) {
    // Java's `Objects.hashCode(null)`. `undefined` folds in with it because Java has no equivalent concept.
    return 0;
  }
  switch (typeof value) {
    case "boolean":
      // `Boolean.hashCode`'s two magic constants, kept for fidelity with the JVM
      return value ? 1231 : 1237;
    case "number":
      return numberHashCode(value);
    case "bigint":
      return stringHashCode(value.toString());
    case "string":
      return stringHashCode(value);
    case "symbol": {
      const registeredKey = Symbol.keyFor(value);
      // registered symbols are interned by string and compare `===` across realms, so they must hash by that string
      return registeredKey === undefined ? identityHashCode(value) : stringHashCode(registeredKey);
    }
    default:
      // deliberately `instanceof _Object` rather than duck-typing on "has a hashCode method": an arbitrary
      // object carrying a `hashCode` property is far more likely to be unrelated than to be honouring the contract.
      // `| 0` because a sloppy override is free to return a float, and a bucket key must be an integer.
      return value instanceof _Object ? value.hashCode() | 0 : identityHashCode(value as object);
  }
}

/**
 * Java's `Objects.equals(a, b)`, widened the same way {@link hashCodeOf} is.
 *
 * An {@link _Object} is asked for its own answer via `equals`; everything else falls back to SameValueZero,
 * the comparison JavaScript's own `Map` and `Set` use.
 *
 * NOTE: `null` and `undefined` are distinct here, and neither equals the other. A map is a container, and
 * silently rewriting one of the caller's keys into the other would be a worse surprise than keeping both.
 *
 * @param a the left-hand value; if it is a `Java.Object`, its `equals` decides the answer
 * @param b the right-hand value
 */
export function equalsOf(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || a === undefined) {
    return false;
  }
  if (a instanceof _Object) {
    // Java calls `a.equals(b)`, and `equals` is free to be asymmetric when a subclass is sloppy about it.
    // Keeping the argument order means a broken override misbehaves here the same way it would on the JVM.
    return a.equals(b);
  }
  // SameValueZero, matching JS Map/Set: NaN is its own key rather than a value that can never be found again.
  return typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
}

/**
 * Java's `Objects.hash(...)`: combines several values into one hash code, so a value class can override
 * `hashCode()` in a single line and stay consistent with a field-by-field `equals`.
 *
 * ```ts
 * public hashCode(): number {
 *   return hashAll(this.x, this.y);
 * }
 * ```
 *
 * @param values the fields to fold together, in a fixed order
 * @returns a signed 32-bit integer
 */
export function hashAll(...values: readonly unknown[]): number {
  let hash = 1;
  for (const value of values) {
    hash = (Math.imul(31, hash) + hashCodeOf(value)) | 0;
  }
  return hash;
}
