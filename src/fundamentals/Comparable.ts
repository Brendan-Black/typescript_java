import { ClassCastException } from "../exceptions/ClassCastException.js";
import { NullPointerException } from "../exceptions/NullPointerException.js";

/**
 * Java's `Comparable<T>`: a type that knows its own total order.
 *
 * Implement it the same way you implement `equals` and `hashCode` — from the fields that define the value:
 *
 * ```ts
 * class Money extends JavaObject implements Comparable<Money> {
 *   constructor(public readonly cents: number) { super(); }
 *   public compareTo(other: Money): number {
 *     return this.cents - other.cents;
 *   }
 * }
 * ```
 *
 * Java's contract asks that `compareTo` be *consistent with equals* — that `a.compareTo(b) === 0` exactly when
 * `a.equals(b)`. Nothing enforces that here any more than it does on the JVM, but a sorted structure built on an
 * inconsistent pair will disagree with a hashed one about what counts as the same element.
 *
 * The return value carries only its sign: negative for "before", zero for "same position", positive for "after".
 * The magnitude is not part of the contract, which is what lets `this.cents - other.cents` be a legal
 * implementation and `Math.sign` of it be an equally legal one.
 */
export interface Comparable<T> {
  compareTo(other: T): number;
}

/**
 * The types {@link compareOf} can order without being told how: the primitives Java gives a natural order to,
 * `Date`, and anything implementing {@link Comparable}.
 *
 * This is the constraint on {@link naturalOrder} and on the one-argument form of {@link comparing}, so asking for
 * an order that does not exist is a compile error rather than a `ClassCastException` at sort time. `Comparable<never>`
 * is the "some Comparable, any element type" spelling: every `Comparable<T>` is assignable to it, and nothing else is.
 */
export type NaturallyOrdered = number | string | bigint | boolean | Date | Comparable<never>;

/**
 * Java's `String.compareTo`: the difference of the first differing UTF-16 code unit, or the difference in length
 * when one string is a prefix of the other.
 *
 * Reproduced exactly rather than reduced to -1/0/1, for the same reason `String.hashCode` is — a value computed
 * here matches one computed on the JVM. The ordering that falls out is by code unit, which is what `<` on
 * JavaScript strings already does; it is *not* locale-aware, and `"Z" < "a"` here as it does in Java.
 */
function compareStrings(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i++) {
    const left = a.charCodeAt(i);
    const right = b.charCodeAt(i);
    if (left !== right) {
      return left - right;
    }
  }
  return a.length - b.length;
}

/**
 * Java's `Double.compare`, which is not `a - b` and not `<`.
 *
 * Two cases separate it from the obvious implementations, and both are the reason Java has a static method for
 * this at all:
 *
 * - **`NaN` sorts last, and equals itself.** `<` and `>` are both false against `NaN`, so a comparator written as
 *   `a - b` returns `NaN` and `Array.prototype.sort` treats that as "leave them alone" — one `NaN` in the input is
 *   enough to leave the rest of the array in an arbitrary order. Here `NaN` is simply greater than everything.
 * - **`-0` sorts before `0`.** They are `===`, so nothing else distinguishes them, but Java's bit-level comparison
 *   does and so does this.
 *
 * `a - b` is also wrong for large integers for a third reason Java documents on `Integer.compare`: the subtraction
 * overflows. It cannot overflow in a JavaScript double, but it does lose precision past 2^53, and two distinct
 * values that differ only below that threshold subtract to `0`.
 */
function compareDoubles(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  // Neither less nor greater: equal, one of the zeros, or NaN on at least one side.
  if (Number.isNaN(a)) {
    return Number.isNaN(b) ? 0 : 1;
  }
  if (Number.isNaN(b)) {
    return -1;
  }
  if (a === 0 && b === 0 && !Object.is(a, b)) {
    return Object.is(a, -0) ? -1 : 1;
  }
  return 0;
}

/**
 * Duck-typed, unlike {@link hashCodeOf}'s `instanceof JavaObject` check, and deliberately so: `Comparable` is an
 * interface rather than a base class, so there is no constructor to have run and no private field to look for. A
 * stray `compareTo` property is also a far less likely accident than a stray `hashCode` — it is not a name
 * anything in the JavaScript standard library uses.
 */
function isComparable(value: unknown): value is Comparable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "compareTo" in value &&
    typeof value.compareTo === "function"
  );
}

/**
 * Natural order, widened the same way {@link hashCodeOf} and {@link equalsOf} widen their Java originals.
 *
 * This is the primitive every ordering in the library bottoms out in: {@link naturalOrder} is this function lifted
 * into a {@link Comparator}, and the one-argument {@link comparing} applies it to an extracted key. The rules:
 *
 * - numbers compare as `Double.compare` does, so `NaN` sorts last and `-0` before `0`
 * - strings compare by UTF-16 code unit, returning `String.compareTo`'s exact value
 * - booleans compare as `Boolean.compare` does: `false` before `true`
 * - bigints compare by value
 * - `Date`s compare by instant, matching Java's `Date implements Comparable<Date>`
 * - anything with a `compareTo` method is asked for its own answer
 *
 * Both arguments must be the same kind of thing. Comparing a number to a string is a `ClassCastException`, which
 * is what the JVM does with a heterogeneous list handed to a natural-order sort.
 *
 * @param a the left-hand value; if it implements {@link Comparable}, its `compareTo` decides the answer
 * @param b the right-hand value
 * @returns negative, zero or positive, by the sign convention {@link Comparable} describes
 * @throws NullPointerException if either value is `null` or `undefined` — natural order has no opinion about
 *   absence, which is exactly why {@link nullsFirst} and {@link nullsLast} exist
 * @throws ClassCastException if the two values have no order in common
 */
export function compareOf(a: unknown, b: unknown): number {
  if (a === null || a === undefined || b === null || b === undefined) {
    throw new NullPointerException(
      "Natural order is undefined for null. Wrap the comparator in nullsFirst() or nullsLast() to place absent values.",
    );
  }
  if (typeof a === "number" && typeof b === "number") {
    return compareDoubles(a, b);
  }
  if (typeof a === "string" && typeof b === "string") {
    return compareStrings(a, b);
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    // `Boolean.compare(x, y)`: false sorts before true.
    return a === b ? 0 : a ? 1 : -1;
  }
  if (typeof a === "bigint" && typeof b === "bigint") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (a instanceof Date && b instanceof Date) {
    // through compareDoubles rather than by subtraction, so an Invalid Date (whose time is NaN) sorts to the end
    // instead of poisoning the whole sort
    return compareDoubles(a.getTime(), b.getTime());
  }
  if (isComparable(a)) {
    // The argument goes through unchecked, as it does on the JVM: a `compareTo` handed the wrong type is expected
    // to throw a ClassCastException of its own, and only it knows what type it wanted.
    return a.compareTo(b);
  }
  throw new ClassCastException(
    `${describe(a)} has no natural order against ${describe(b)}. Implement Comparable, or sort with an explicit comparator.`,
  );
}

/** the type name a `ClassCastException` message needs, without tripping over a null prototype or a bare symbol */
function describe(value: unknown): string {
  if (typeof value === "object") {
    return value === null ? "null" : (value.constructor?.name ?? "object");
  }
  return typeof value;
}
