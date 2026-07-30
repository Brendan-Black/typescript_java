import { NoSuchElementException } from "../exceptions/NoSuchElementException.js";
import type { NaturallyOrdered } from "../fundamentals/Comparable.js";
import { JavaAbstractSet, unsupported } from "./JavaCollection.js";
import { type JavaIterator, mapIterator } from "./JavaIterator.js";
import { TreeMap } from "./TreeMap.js";

/**
 * Java's `TreeSet`: a set that keeps its members in order rather than in buckets.
 *
 * ```ts
 * const names = new TreeSet<string>(["carol", "alice", "bob"]);
 * [...names];            // ["alice", "bob", "carol"] — iteration is in order, not insertion order
 * names.first();         // "alice"
 * names.ceiling("bd");   // "bob" is below it; "carol" is the least member at or above
 * names.headSet("bob");  // ["alice"]
 * ```
 *
 * Backed by a {@link TreeMap}, exactly as Java's `TreeSet` is backed by a `TreeMap`, so everything said there
 * applies here to members: the ordering rules, the constrained {@link TreeSet.of}, the O(n) insertion that a
 * sorted array buys, and — most importantly — that membership is decided by *comparing*, not by `equals`. Two
 * members that compare equal are one member here, whatever `equals` says.
 *
 * That last point is the one to watch when a `TreeSet` meets a {@link JavaSet}. `equals` on both is inherited
 * from {@link JavaAbstractSet} and is written in terms of `containsAll`, so each set answers using its own
 * notion of sameness. With a comparator consistent with `equals` — the contract {@link Comparable} asks for —
 * the two agree; without one, they can disagree in either direction.
 *
 * The bulk operations, `toArray`, `removeIf`, `forEach`, `toString`, `equals` and `hashCode` all come from
 * {@link JavaAbstractSet}; only the six primitives and the navigation below are implemented here.
 */
export class TreeSet<T> extends JavaAbstractSet<T> {
  /** the value is a placeholder; only the key carries meaning, as in Java's `TreeSet.PRESENT` */
  #map: TreeMap<T, boolean>;
  #readOnly = false;

  /**
   * @param comparator the order to keep the members in. Omit it for natural order.
   * @param values initial contents. Accepts anything iterable, including another set, an array, or a plain
   * JavaScript `Set`. Duplicates — by the comparator, not by reference — collapse into one member.
   */
  constructor(comparator: (a: T, b: T) => number, values?: Iterable<T>);
  constructor(values?: Iterable<T>);
  constructor(comparatorOrValues?: ((a: T, b: T) => number) | Iterable<T>, values?: Iterable<T>) {
    super();
    // a comparator is a function and an iterable is not, so the two arities cannot be confused at runtime
    let initial: Iterable<T> | undefined;
    if (typeof comparatorOrValues === "function") {
      this.#map = new TreeMap<T, boolean>(comparatorOrValues);
      initial = values;
    } else {
      this.#map = new TreeMap<T, boolean>();
      initial = comparatorOrValues;
    }
    if (initial !== undefined) {
      this.addAll(initial);
    }
  }

  /**
   * An immutable sorted set, refusing every mutator. Natural order only, and the member type is constrained to
   * prove it has one — see {@link TreeMap.of}.
   */
  public static of<T extends NaturallyOrdered>(...values: readonly T[]): TreeSet<T> {
    const set = new TreeSet<T>(values);
    set.#readOnly = true;
    return set;
  }

  /**
   * Java's `Collections.unmodifiableSortedSet`: a read-only *view*, not a copy.
   *
   * The view shares the original's storage, so later changes to the original show through — see
   * {@link JavaMap.unmodifiable} for why that is worth knowing before you hand one out.
   */
  public static unmodifiable<T>(set: TreeSet<T>): TreeSet<T> {
    const view = new TreeSet<T>();
    view.#map = TreeMap.unmodifiable(set.#map);
    view.#readOnly = true;
    return view;
  }

  #requireMutable(operation: string): void {
    if (this.#readOnly) {
      unsupported(operation, "this set is unmodifiable");
    }
  }

  /**
   * Java's `SortedSet.comparator()`.
   *
   * @returns the comparator this set was built with, or `null` if it keeps its members in natural order.
   */
  public comparator(): ((a: T, b: T) => number) | null {
    return this.#map.comparator();
  }

  public size(): number {
    return this.#map.size();
  }

  public contains(value: T): boolean {
    return this.#map.containsKey(value);
  }

  /**
   * @returns `true` if the set changed — i.e. if no member comparing equal was already present.
   */
  public add(value: T): boolean {
    this.#requireMutable("add");
    return this.#map.put(value, true) === null;
  }

  /** @returns `true` if a member comparing equal was present and has been removed. */
  public remove(value: T): boolean {
    this.#requireMutable("remove");
    return this.#map.remove(value) !== null;
  }

  public clear(): void {
    this.#requireMutable("clear");
    this.#map.clear();
  }

  /**
   * Overrides {@link JavaCollection.retainAll}, which decides what to keep with `equals`. This set decides
   * membership by comparing, so an inherited `retainAll` could drop a member that {@link contains} says is
   * present. Sorting the argument once also takes it from O(n*m) to O((n+m) log m).
   */
  public override retainAll(values: Iterable<T>): boolean {
    this.#requireMutable("retainAll");
    const ordering = this.comparator();
    const keep = ordering === null ? new TreeSet<T>(values) : new TreeSet<T>(ordering, values);
    // snapshot first: this removes from the very set it is scanning
    const doomed = this.toArray().filter((value) => !keep.contains(value));
    for (const value of doomed) {
      this.remove(value);
    }
    return doomed.length > 0;
  }

  /**
   * Java's `SortedSet.first`: the least member.
   *
   * @throws NoSuchElementException if the set is empty. {@link pollFirst} answers `null` instead, and the
   *   navigation methods below do too — that split is Java's, between `SortedSet` and the `NavigableSet` that
   *   came after it.
   */
  public first(): T {
    if (this.#map.isEmpty()) {
      throw new NoSuchElementException("TreeSet.first has no answer for an empty set.");
    }
    return this.#map.firstKey();
  }

  /**
   * Java's `SortedSet.last`: the greatest member.
   *
   * @throws NoSuchElementException if the set is empty. See {@link first}.
   */
  public last(): T {
    if (this.#map.isEmpty()) {
      throw new NoSuchElementException("TreeSet.last has no answer for an empty set.");
    }
    return this.#map.lastKey();
  }

  /**
   * Java's `NavigableSet.floor`: the greatest member at or below `value`, or `null` if every member is above it.
   *
   * The four of these — {@link floor}, {@link ceiling}, {@link lower}, {@link higher} — are the point of a
   * sorted set. `floor` and `lower` look downwards; `ceiling` and `higher` look upwards. `floor` and `ceiling`
   * accept an exact match; `lower` and `higher` insist on a strict inequality. The value need not be a member.
   */
  public floor(value: T): T | null {
    return this.#map.floorKey(value);
  }

  /** Java's `NavigableSet.ceiling`: the least member at or above `value`. See {@link floor}. */
  public ceiling(value: T): T | null {
    return this.#map.ceilingKey(value);
  }

  /** Java's `NavigableSet.lower`: the greatest member strictly below `value`. See {@link floor}. */
  public lower(value: T): T | null {
    return this.#map.lowerKey(value);
  }

  /** Java's `NavigableSet.higher`: the least member strictly above `value`. See {@link floor}. */
  public higher(value: T): T | null {
    return this.#map.higherKey(value);
  }

  /**
   * Java's `NavigableSet.pollFirst`: removes and returns the least member, or returns `null` if the set is
   * empty. This and {@link pollLast} are what make a sorted set usable as a priority queue.
   */
  public pollFirst(): T | null {
    this.#requireMutable("pollFirst");
    return this.#map.pollFirstEntry()?.getKey() ?? null;
  }

  /** Java's `NavigableSet.pollLast`: removes and returns the greatest member, or `null`. */
  public pollLast(): T | null {
    this.#requireMutable("pollLast");
    return this.#map.pollLastEntry()?.getKey() ?? null;
  }

  /**
   * Java's `SortedSet.headSet`: the members below `value`.
   *
   * A copy rather than a view, matching {@link TreeMap.headMap} — mutating the result leaves this set alone.
   *
   * @param inclusive whether `value` itself is included. Defaults to `false`, which is Java's one-argument form.
   */
  public headSet(value: T, inclusive: boolean = false): TreeSet<T> {
    return this.#copyOf(this.#map.headMap(value, inclusive));
  }

  /**
   * Java's `SortedSet.tailSet`: the members at or above `value`. A copy, like {@link headSet}.
   *
   * @param inclusive whether `value` itself is included. Defaults to `true` — the opposite of {@link headSet}'s
   *   default, so that `headSet(v)` and `tailSet(v)` partition the set between them.
   */
  public tailSet(value: T, inclusive: boolean = true): TreeSet<T> {
    return this.#copyOf(this.#map.tailMap(value, inclusive));
  }

  /**
   * Java's `SortedSet.subSet`: the members in a range, `[from, to)` by default. A copy, like {@link headSet}.
   *
   * NOTE: the two flags come last, where Java interleaves them. See {@link TreeMap.subMap} for why they cannot
   * be interleaved here.
   *
   * @throws IllegalArgumentException if the range runs backwards
   */
  public subSet(from: T, to: T, fromInclusive: boolean = true, toInclusive: boolean = false): TreeSet<T> {
    return this.#copyOf(this.#map.subMap(from, to, fromInclusive, toInclusive));
  }

  /**
   * Java's `NavigableSet.descendingSet`: the same members, greatest first.
   *
   * A copy ordered by the reverse of this set's comparator, so it is a `TreeSet` in its own right —
   * `first()` on it is this set's `last()`. For a walk rather than a set, {@link descendingIterator} avoids
   * the copy.
   */
  public descendingSet(): TreeSet<T> {
    return this.#copyOf(this.#map.descendingMap());
  }

  /** Java's `NavigableSet.descendingIterator`: the members, greatest first. Fail-fast, like the ascending one. */
  public descendingIterator(): IterableIterator<T> {
    return this.#map.descendingKeys();
  }

  /** Wraps a map produced by one of {@link TreeMap}'s range operations, keeping the order it already carries. */
  #copyOf(map: TreeMap<T, boolean>): TreeSet<T> {
    const set = new TreeSet<T>();
    set.#map = map;
    return set;
  }

  public [Symbol.iterator](): IterableIterator<T> {
    return this.#map.keys();
  }

  /**
   * The backing map's cursor, read as keys, so the walk is in order and removal takes the member it is standing
   * on. The read-only check belongs here for the same reason it does in {@link JavaSet.iterator}: {@link of}
   * marks the set unmodifiable, not the map.
   */
  public iterator(): JavaIterator<T> {
    return mapIterator(
      this.#map.entryIterator(),
      (entry) => entry.getKey(),
      () => {
        this.#requireMutable("remove");
      },
    );
  }
}
