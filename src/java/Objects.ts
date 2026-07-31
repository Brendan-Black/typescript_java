/**
 * `java.util.Objects`, as the static-utility class it is in Java.
 *
 * Four of these are declared under working names — `hashCodeOf`, `equalsOf`, `compareOf`, `hashAll` — because
 * a module cannot export a bare `hashCode` or `equals` without the reader having to guess what they belong to.
 * Inside a namespace the qualifier does that job, so here they take the names Java gives them and
 * `Java.Objects.hash(x, y)` reads as the `Objects.hash(x, y)` it is.
 *
 * @module
 */

export { isNull, nonNull, requireNonNull, requireNonNullElse, requireNonNullElseGet } from "../fundamentals/Objects.js";

export {
  /** Java's `Objects.equals(a, b)`. */
  equalsOf as equals,
  /** Java's `Objects.hash(...)`. */
  hashAll as hash,
  /** Java's `Objects.hashCode(o)`. */
  hashCodeOf as hashCode,
} from "../fundamentals/Hashing.js";

export {
  /**
   * Natural-order comparison, reproducing `Double.compare` and `String.compareTo` rather than JavaScript's
   * relational operators.
   *
   * DEPARTURE: Java's `Objects.compare(a, b, c)` takes a comparator as a third argument and returns `0` when
   * `a === b`; this one takes two arguments and dispatches on the runtime type. Passing a third is a compile
   * error rather than a silently ignored argument, so the two cannot be confused at a call site. Reach for
   * {@link Java.Comparator} when the ordering is the thing you want to vary.
   */
  compareOf as compare,
} from "../fundamentals/Comparable.js";
