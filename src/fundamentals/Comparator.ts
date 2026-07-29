import { compareOf, type NaturallyOrdered } from "./Comparable.js";

/**
 * Java's `Comparator<T>`: an order imposed on a type from outside, rather than one the type carries itself.
 *
 * A `Comparator` here *is* a comparison function — it can be passed straight to {@link JavaList.sort} or to
 * `Array.prototype.sort` — that additionally carries Java's default methods on it:
 *
 * ```ts
 * const byName = comparing<User, string>((u) => u.surname).thenComparing((u) => u.forename);
 * users.sort(byName.reversed());
 * ```
 *
 * Java's `thenComparing` is overloaded on `Comparator` and on a key extractor, and that overload is a well-known
 * trap even there — a lambda is ambiguous between the two and the compiler needs a cast to break the tie. It is
 * worse in TypeScript, where a `(a, b) => number` comparator is *structurally* a key extractor returning a number
 * and the ambiguity would be resolved silently and wrongly. So the two are split by name, the way `remove` and
 * `removeAt` are: {@link thenComparing} takes a key extractor, {@link then} takes another comparator.
 *
 * Every position that *accepts* an order asks for a bare `(a, b) => number` rather than a `Comparator`. That is
 * this library's `Comparator<? super T>`: a `Comparator<T>` is one already, and so is a raw arrow function, but
 * a `Comparator<T>` parameter would make the type invariant in `T` and reject a comparator over a wider type —
 * which is exactly what `nullsLast(naturalOrder<number>())` is when the keys it orders may be absent.
 */
export interface Comparator<T> {
  (a: T, b: T): number;

  /** Java's `reversed()`. The result is a new comparator; this one is unchanged. */
  reversed(): Comparator<T>;

  /**
   * Java's `thenComparing(Comparator)`, under a name that cannot be confused with the key-extractor form.
   *
   * The next comparator is consulted only where this one calls it a tie, which is what makes a chain of them a
   * multi-column sort rather than a last-one-wins.
   */
  then(other: (a: T, b: T) => number): Comparator<T>;

  /** Java's `thenComparing(Function, Comparator)`: break ties on an extracted key, ordered however you say. */
  thenComparing<U>(keyExtractor: (value: T) => U, keyComparator: (a: U, b: U) => number): Comparator<T>;

  /** Java's `thenComparing(Function)`: break ties on an extracted key, in that key's natural order. */
  thenComparing<U extends NaturallyOrdered>(keyExtractor: (value: T) => U): Comparator<T>;
}

/** the shared body of the two {@link comparing} overloads, with the optionality the public signatures hide */
function comparingBy<T, U>(
  keyExtractor: (value: T) => U,
  keyComparator: ((a: U, b: U) => number) | undefined,
): Comparator<T> {
  return keyComparator === undefined
    ? comparator<T>((a, b) => compareOf(keyExtractor(a), keyExtractor(b)))
    : comparator<T>((a, b) => keyComparator(keyExtractor(a), keyExtractor(b)));
}

/**
 * Lifts a plain comparison function into a {@link Comparator}, giving it `reversed`, `then` and `thenComparing`.
 *
 * In Java a lambda is already a `Comparator`, because `Comparator` is an interface with default methods and the
 * compiler writes the rest. JavaScript has no such step, so a raw arrow function needs this to gain them:
 *
 * ```ts
 * const byLength = comparator<string>((a, b) => a.length - b.length);
 * ```
 *
 * Only the *sign* of the result is used, so a subtraction is a legal body. Note that a subtraction is the wrong
 * body for a general pair of numbers — see {@link compareOf} for the two cases it gets wrong — but for lengths,
 * which are small non-negative integers, it cannot go astray.
 */
export function comparator<T>(compare: (a: T, b: T) => number): Comparator<T> {
  const reversed = (): Comparator<T> => comparator<T>((a, b) => compare(b, a));

  const then = (other: (a: T, b: T) => number): Comparator<T> =>
    comparator<T>((a, b) => {
      const first = compare(a, b);
      return first !== 0 ? first : other(a, b);
    });

  const thenComparing = <U>(
    keyExtractor: (value: T) => U,
    keyComparator?: (a: U, b: U) => number,
  ): Comparator<T> =>
    then(comparingBy<T, U>(keyExtractor, keyComparator));

  return Object.assign((a: T, b: T): number => compare(a, b), { reversed, then, thenComparing });
}

/**
 * Java's `Comparator.comparing`: order by something derived from the value rather than by the value itself.
 *
 * ```ts
 * users.sort(comparing<User, number>((u) => u.age));
 * users.sort(comparing<User, string>((u) => u.name, caseInsensitive));
 * ```
 *
 * With no key comparator the key is ordered by {@link compareOf}, which is why the one-argument form constrains
 * the key to {@link NaturallyOrdered} — a key with no natural order is a compile error here rather than a
 * `ClassCastException` on the first comparison.
 *
 * The extractor runs on both operands of every comparison, so an expensive one is worth hoisting into a field
 * before the sort. Java's docs make the same point about `comparing`.
 */
export function comparing<T, U>(keyExtractor: (value: T) => U, keyComparator: (a: U, b: U) => number): Comparator<T>;
export function comparing<T, U extends NaturallyOrdered>(keyExtractor: (value: T) => U): Comparator<T>;
export function comparing<T, U>(
  keyExtractor: (value: T) => U,
  keyComparator?: (a: U, b: U) => number,
): Comparator<T> {
  return comparingBy<T, U>(keyExtractor, keyComparator);
}

/**
 * Java's `Comparator.naturalOrder()`: {@link compareOf} as a comparator.
 *
 * ```ts
 * names.sort(naturalOrder<string>());
 * ```
 *
 * The type argument is what makes this safe — `naturalOrder<Point>()` will not compile unless `Point` implements
 * {@link Comparable}. Java gets the same guarantee from `<T extends Comparable<? super T>>`.
 */
export function naturalOrder<T extends NaturallyOrdered>(): Comparator<T> {
  return comparator<T>(compareOf);
}

/** Java's `Comparator.reverseOrder()`: descending natural order, and the exact reverse of {@link naturalOrder}. */
export function reverseOrder<T extends NaturallyOrdered>(): Comparator<T> {
  return comparator<T>((a, b) => compareOf(b, a));
}

/**
 * Java's `Comparator.nullsFirst`: an order that tolerates absent values, placing them before everything else.
 *
 * {@link compareOf} throws on `null` rather than guessing where it belongs, so this is how an ordering acquires
 * an opinion about absence:
 *
 * ```ts
 * rows.sort(nullsFirst(naturalOrder<string>()));
 * ```
 *
 * `undefined` counts as absent alongside `null`, and the two sort as equal to each other — the same folding the
 * rest of the library does, and for the same reason: Java has one concept here and JavaScript has two.
 */
export function nullsFirst<T>(comparatorForPresent: (a: T, b: T) => number): Comparator<T | null | undefined> {
  return nullsAt(comparatorForPresent, -1);
}

/** Java's `Comparator.nullsLast`: as {@link nullsFirst}, but absent values sort after everything else. */
export function nullsLast<T>(comparatorForPresent: (a: T, b: T) => number): Comparator<T | null | undefined> {
  return nullsAt(comparatorForPresent, 1);
}

/** @param absentGoes the result to report when only the left operand is absent; the right is its negation */
function nullsAt<T>(
  comparatorForPresent: (a: T, b: T) => number,
  absentGoes: number,
): Comparator<T | null | undefined> {
  return comparator<T | null | undefined>((a, b) => {
    const aAbsent = a === null || a === undefined;
    const bAbsent = b === null || b === undefined;
    if (aAbsent || bAbsent) {
      return aAbsent && bAbsent ? 0 : aAbsent ? absentGoes : -absentGoes;
    }
    return comparatorForPresent(a, b);
  });
}
