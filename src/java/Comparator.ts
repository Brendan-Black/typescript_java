/**
 * `java.util.Comparator`: the type and its static factories, under one name.
 *
 * In Java these are the same declaration — `Comparator<T>` is an interface you implement *and* the class you
 * call `Comparator.naturalOrder()` on. TypeScript keeps types and values in separate declaration spaces, which
 * is what lets that be reproduced here: the `interface` below supplies the type meaning and the `const`
 * supplies the value meaning, so `Java.Comparator<T>` and `Java.Comparator.comparing(f)` both resolve.
 *
 * NOTE: this is why the statics are an object rather than a re-exported module namespace. `export type
 * { Comparator }` alongside `export * as Comparator` is a duplicate-identifier error — the two re-export forms
 * do not merge, whereas an interface and a `const` sharing a name do.
 *
 * @module
 */

import {
  comparator,
  type Comparator as ComparatorFunction,
  comparing,
  naturalOrder,
  nullsFirst,
  nullsLast,
  reverseOrder,
} from "../fundamentals/Comparator.js";

/**
 * Java's `Comparator<T>`: a comparison function carrying `reversed`, `then` and `thenComparing`.
 *
 * Structurally identical to {@link ComparatorFunction}, which it is declared from — this adds nothing and
 * exists only to give the name a type meaning that can sit beside the value meaning below. The two are
 * mutually assignable, so a comparator built anywhere in this library satisfies `Java.Comparator<T>` and
 * vice versa.
 */
export interface Comparator<T> extends ComparatorFunction<T> {}

/**
 * Java's `Comparator` statics.
 *
 * The one addition is `of`, which has no Java counterpart because Java does not need one: there, a lambda is
 * already a `Comparator` and the compiler supplies the default methods. It is named for the `X.of(...)` idiom
 * the rest of this library already follows.
 *
 * The type is written out rather than inferred because `isolatedDeclarations` requires an exported `const` to
 * declare its own type, and `typeof` is what preserves the overloads on `comparing`.
 */
export const Comparator: {
  /** Lifts a plain `(a, b) => number` into a {@link Comparator}. */
  of: typeof comparator;
  comparing: typeof comparing;
  naturalOrder: typeof naturalOrder;
  reverseOrder: typeof reverseOrder;
  nullsFirst: typeof nullsFirst;
  nullsLast: typeof nullsLast;
} = { of: comparator, comparing, naturalOrder, reverseOrder, nullsFirst, nullsLast };
