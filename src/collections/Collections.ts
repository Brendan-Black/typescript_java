import { NoSuchElementException } from "../exceptions/NoSuchElementException.js";
import { compareOf, type NaturallyOrdered } from "../fundamentals/Comparable.js";
import { elementAt } from "../fundamentals/Indexing.js";
import type { AbstractMap } from "./AbstractMap.js";
import type { AbstractSet } from "./Collection.js";
import { List } from "./List.js";
import { Map } from "./Map.js";
import { Set } from "./Set.js";
import { TreeMap } from "./TreeMap.js";
import { TreeSet } from "./TreeSet.js";

/**
 * Java's `java.util.Collections`: the static helpers that wrap or manufacture collections, and the algorithms
 * that run over them.
 *
 * The `unmodifiable*` functions return read-only *views* that share the original's storage, so changes to the
 * original show through. The `empty*` and `singleton*` functions return frozen values with no original to
 * track. Both refuse mutators with `UnsupportedOperationException`, which is Java's approach: the read-only
 * wrappers still expose `add` and `remove`, and still throw when you call them.
 *
 * The algorithms — {@link sort}, {@link max}, {@link min}, {@link binarySearch}, {@link reverse}, {@link swap} —
 * each come in two forms, as Java's do: one that takes an explicit comparator, and one that takes none and uses
 * {@link compareOf}. The comparator-free form constrains its element type to {@link NaturallyOrdered}, so
 * `sort(listOfPoints)` is a compile error rather than a `ClassCastException` partway through the sort.
 *
 * @module
 */

/**
 * Java's `Collections.unmodifiableMap`: a read-only view of a map. See {@link Map.unmodifiable}.
 *
 * Overloaded rather than written against {@link AbstractMap}, so the sorted map keeps its type: Java's
 * `unmodifiableSortedMap` is a separate method for the same reason, since a view typed as a plain `Map` would
 * have lost `firstKey` and the rest of the navigation on the way through.
 */
export function unmodifiableMap<K, V>(map: TreeMap<K, V>): TreeMap<K, V>;
export function unmodifiableMap<K, V>(map: Map<K, V>): Map<K, V>;
export function unmodifiableMap<K, V>(map: Map<K, V> | TreeMap<K, V>): AbstractMap<K, V> {
  return map instanceof TreeMap ? TreeMap.unmodifiable(map) : Map.unmodifiable(map);
}

/** Java's `Collections.unmodifiableSet`: a read-only view of a set. See {@link Set.unmodifiable}. */
export function unmodifiableSet<T>(set: TreeSet<T>): TreeSet<T>;
export function unmodifiableSet<T>(set: Set<T>): Set<T>;
export function unmodifiableSet<T>(set: Set<T> | TreeSet<T>): AbstractSet<T> {
  return set instanceof TreeSet ? TreeSet.unmodifiable(set) : Set.unmodifiable(set);
}

/** Java's `Collections.unmodifiableList`: a read-only view of a list. See {@link List.unmodifiable}. */
export function unmodifiableList<T>(list: List<T>): List<T> {
  return List.unmodifiable(list);
}

/** Java's `Collections.emptyMap`. Immutable, and a fresh instance each call rather than a shared singleton. */
export function emptyMap<K, V>(): Map<K, V> {
  return Map.of<K, V>();
}

/** Java's `Collections.emptySet`. */
export function emptySet<T>(): Set<T> {
  return Set.of<T>();
}

/** Java's `Collections.emptyList`. */
export function emptyList<T>(): List<T> {
  return List.of<T>();
}

/** Java's `Collections.singletonMap`: an immutable map holding exactly one entry. */
export function singletonMap<K, V>(key: K, value: V): Map<K, V> {
  return Map.of<K, V>([key, value]);
}

/** Java's `Collections.singleton`: an immutable set holding exactly one element. */
export function singleton<T>(value: T): Set<T> {
  return Set.of<T>(value);
}

/** Java's `Collections.singletonList`: an immutable list holding exactly one element. */
export function singletonList<T>(value: T): List<T> {
  return List.of<T>(value);
}

/**
 * Java's `Collections.sort`: sorts a list in place, stably.
 *
 * ```ts
 * sort(names);                                  // natural order
 * sort(users, comparing<User, number>((u) => u.age));
 * ```
 *
 * Java has kept both this and `List.sort` since Java 8 — this one delegates to {@link List.sort}, exactly as
 * Java's does. The reason to reach for it is the one-argument form: `sort(names)` says "natural order" without
 * naming a comparator, which is the sort you most often want and the one `names.sort()` cannot mean here.
 *
 * @throws UnsupportedOperationException if the list is unmodifiable
 * @throws ClassCastException from {@link compareOf}, if no comparator was given and the elements have no order
 *   in common
 */
export function sort<T>(list: List<T>, comparator: (a: T, b: T) => number): void;
export function sort<T extends NaturallyOrdered>(list: List<T>): void;
export function sort<T>(list: List<T>, comparator?: (a: T, b: T) => number): void {
  list.sort(comparator ?? compareOf);
}

/**
 * Java's `Collections.max`: the greatest element, by natural order or by the comparator given.
 *
 * Takes any iterable rather than only a collection, so an array or a plain `Set` works too. Ties go to the
 * element seen first, matching Java — the comparison is strict, so a later equal element does not displace an
 * earlier one.
 *
 * @throws NoSuchElementException if there are no elements, as Java's does
 */
export function max<T>(values: Iterable<T>, comparator: (a: T, b: T) => number): T;
export function max<T extends NaturallyOrdered>(values: Iterable<T>): T;
export function max<T>(values: Iterable<T>, comparator?: (a: T, b: T) => number): T {
  return extreme(values, comparator ?? compareOf, 1, "max");
}

/** Java's `Collections.min`: the least element. See {@link max} for the shared details. */
export function min<T>(values: Iterable<T>, comparator: (a: T, b: T) => number): T;
export function min<T extends NaturallyOrdered>(values: Iterable<T>): T;
export function min<T>(values: Iterable<T>, comparator?: (a: T, b: T) => number): T {
  return extreme(values, comparator ?? compareOf, -1, "min");
}

/**
 * The shared body of {@link max} and {@link min}, which differ only in the direction they keep.
 *
 * @param keep `1` to keep the greater element, `-1` to keep the lesser. Multiplying the comparison by it turns
 *   both cases into the same test, and leaves a `NaN` comparison failing that test rather than winning it.
 */
function extreme<T>(values: Iterable<T>, comparator: (a: T, b: T) => number, keep: 1 | -1, operation: string): T {
  // snapshotting, as the bulk operations on Collection do — see the note on that class
  const items = [...values];
  if (items.length === 0) {
    throw new NoSuchElementException(`Collections.${operation} has no answer for an empty collection.`);
  }
  let best = elementAt(items, 0, `Collections.${operation}`);
  for (let i = 1; i < items.length; i++) {
    const candidate = elementAt(items, i, `Collections.${operation}`);
    if (comparator(candidate, best) * keep > 0) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Java's `Collections.binarySearch`: finds an element in a list that is *already sorted* by the same order.
 *
 * The return value is Java's, and the negative half of it is the part worth knowing:
 *
 * - found: the index the element sits at
 * - not found: `-(insertionPoint) - 1`, where `insertionPoint` is where the element would go to keep the list
 *   sorted
 *
 * The offset by one is what makes the miss usable. Without it an insertion point of `0` would encode as `-0`,
 * which is `>= 0` and so indistinguishable from a hit at index `0`; with it, every miss is strictly negative and
 * `-(result + 1)` recovers the insertion point:
 *
 * ```ts
 * const at = binarySearch(sorted, key);
 * if (at < 0) {
 *   sorted.addAt(-(at + 1), key);   // keeps it sorted
 * }
 * ```
 *
 * A list that is not sorted by this order gives an unspecified result rather than an error — the search has no
 * way to tell a wrong answer from a right one. That is Java's contract too.
 *
 * @returns the index of the element, or `-(insertionPoint) - 1` if it is absent
 */
export function binarySearch<T>(list: List<T>, key: T, comparator: (a: T, b: T) => number): number;
export function binarySearch<T extends NaturallyOrdered>(list: List<T>, key: T): number;
export function binarySearch<T>(list: List<T>, key: T, comparator?: (a: T, b: T) => number): number {
  const compare = comparator ?? compareOf;
  let low = 0;
  let high = list.size() - 1;
  while (low <= high) {
    // >>> 1 rather than / 2, as Java's does: it floors, and cannot land on a fractional index
    const mid = (low + high) >>> 1;
    // element against key, in that order — the sign convention has to match the comparator the list was sorted by
    const result = compare(list.get(mid), key);
    if (result < 0) {
      low = mid + 1;
    } else if (result > 0) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  return -(low + 1);
}

/** Java's `Collections.reverse`: reverses a list in place. */
export function reverse<T>(list: List<T>): void {
  for (let i = 0, j = list.size() - 1; i < j; i++, j--) {
    swap(list, i, j);
  }
}

/**
 * Java's `Collections.swap`: exchanges the elements at two positions.
 *
 * Written as Java writes it, and the nesting is the point rather than showing off: {@link List.set} returns
 * the element it displaced, so the inner call both stores and yields the value the outer call needs.
 *
 * @throws IndexOutOfBoundsException if either index is out of range
 */
export function swap<T>(list: List<T>, i: number, j: number): void {
  list.set(i, list.set(j, list.get(i)));
}
