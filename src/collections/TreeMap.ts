import { ConcurrentModificationException } from "../exceptions/ConcurrentModificationException.js";
import { IllegalArgumentException } from "../exceptions/IllegalArgumentException.js";
import { NoSuchElementException } from "../exceptions/NoSuchElementException.js";
import { compareOf, type NaturallyOrdered } from "../fundamentals/Comparable.js";
import { elementAt } from "../fundamentals/Indexing.js";
import { JavaAbstractMap, JavaMapEntry } from "./JavaAbstractMap.js";
import { unsupported } from "./JavaCollection.js";

/** One key/value pair in sorted position. The key is fixed for the entry's lifetime, as it is in {@link JavaMap}. */
interface TreeEntry<K, V> {
  readonly key: K;
  value: V;
}

/**
 * The mutable innards, held behind one reference so an unmodifiable view can share them and stay live.
 * See {@link TreeMap.unmodifiable}.
 */
interface TreeMapState<K, V> {
  /** kept in ascending key order at all times — every read below depends on that being true */
  entries: TreeEntry<K, V>[];
  /**
   * Bumped on every *structural* change — an entry appearing or disappearing. Replacing the value under an
   * existing key is not structural and deliberately does not bump it, which is Java's rule too.
   */
  modCount: number;
}

/**
 * Java's `TreeMap`: a map that keeps its keys in order rather than in buckets.
 *
 * Where {@link JavaMap} asks a key for its `hashCode`, this asks how it compares — which is what you want when
 * the key type has a sensible order but no trustworthy hash, and it is the only way to ask a map the questions
 * below:
 *
 * ```ts
 * const scores = new TreeMap<string, number>([["carol", 3], ["alice", 1], ["bob", 2]]);
 * scores.firstKey();          // "alice" — iteration is in key order, not insertion order
 * scores.floorKey("bib");     // "bob" is above it; "alice" is the greatest key at or below
 * scores.headMap("bob");      // {alice=1}
 * ```
 *
 * With no comparator the keys are ordered by {@link compareOf}, exactly as Java orders them by `Comparable`.
 * TypeScript cannot constrain a class's type parameter differently per constructor, so `new TreeMap<Point, V>()`
 * compiles here just as `new TreeMap<Point, V>()` compiles in Java — and, as in Java, fails at the first
 * comparison rather than at the declaration. Pass `naturalOrder<K>()` explicitly to get the check back: that
 * function *is* constrained, so an unorderable key type stops compiling. {@link TreeMap.of} is constrained too.
 *
 * NOTE: this stores its entries in one sorted array, where Java's `TreeMap` is a red-black tree. Lookups are
 * O(log n) either way — the same binary search {@link binarySearch} runs — but insertion and removal are O(n)
 * here, because they splice an array rather than relink a few nodes. In exchange, every navigation and range
 * question is an index arithmetic problem rather than a tree walk, which is why they are all present and all
 * obviously correct. If you are inserting into a very large map in random order, that trade is against you.
 *
 * IMPORTANT: a `TreeMap` decides what counts as the same key by comparing, not by `equals`. Two keys that
 * compare equal are one entry here even if `equals` says otherwise, and Java behaves the same way — which is
 * what the consistency-with-equals contract on {@link Comparable} is asking you to avoid.
 */
export class TreeMap<K, V> extends JavaAbstractMap<K, V> {
  #state: TreeMapState<K, V>;
  /** `null` means natural order, so {@link comparator} can report that the way Java's `SortedMap` does */
  #comparator: ((a: K, b: K) => number) | null;
  #readOnly = false;

  /**
   * @param comparator the order to keep the keys in. Omit it for natural order.
   * @param entries initial contents, as `[key, value]` pairs. Accepts anything iterable, including another map
   * (which iterates as pairs) and a plain JavaScript `Map`. Later pairs win over earlier ones.
   */
  constructor(comparator: (a: K, b: K) => number, entries?: Iterable<readonly [K, V]>);
  constructor(entries?: Iterable<readonly [K, V]>);
  constructor(
    comparatorOrEntries?: ((a: K, b: K) => number) | Iterable<readonly [K, V]>,
    entries?: Iterable<readonly [K, V]>,
  ) {
    super();
    this.#state = { entries: [], modCount: 0 };
    // a comparator is a function and an iterable is not, so the two arities cannot be confused at runtime
    let initial: Iterable<readonly [K, V]> | undefined;
    if (typeof comparatorOrEntries === "function") {
      this.#comparator = comparatorOrEntries;
      initial = entries;
    } else {
      this.#comparator = null;
      initial = comparatorOrEntries;
    }
    if (initial !== undefined) {
      for (const [key, value] of initial) {
        this.put(key, value);
      }
    }
  }

  /**
   * An immutable sorted map, refusing every mutator. There is no `Map.of` in Java that sorts; this is the
   * `TreeMap` analogue of {@link JavaMap.of}.
   *
   * Natural order only, and the key type is constrained to prove it has one — a compile error rather than a
   * `ClassCastException` on the first insertion.
   */
  public static of<K extends NaturallyOrdered, V>(...entries: readonly (readonly [K, V])[]): TreeMap<K, V> {
    const map = new TreeMap<K, V>(entries);
    map.#readOnly = true;
    return map;
  }

  /**
   * Java's `Collections.unmodifiableSortedMap`: a read-only *view*, not a copy.
   *
   * The view shares the original's storage and its comparator, so later changes to the original show through —
   * see {@link JavaMap.unmodifiable} for why that is worth knowing before you hand one out.
   */
  public static unmodifiable<K, V>(map: TreeMap<K, V>): TreeMap<K, V> {
    const view = new TreeMap<K, V>();
    view.#state = map.#state;
    view.#comparator = map.#comparator;
    view.#readOnly = true;
    return view;
  }

  protected override requireMutable(operation: string): void {
    if (this.#readOnly) {
      unsupported(operation, "this map is unmodifiable");
    }
  }

  protected override modCount(): number {
    return this.#state.modCount;
  }

  #compare(a: K, b: K): number {
    return this.#comparator === null ? compareOf(a, b) : this.#comparator(a, b);
  }

  #entryAt(index: number, context: string): TreeEntry<K, V> {
    return elementAt(this.#state.entries, index, context);
  }

  /**
   * Binary search over the sorted entries.
   *
   * @returns the index of the key, or `-(insertionPoint) - 1` if it is absent — the same encoding
   *   {@link binarySearch} returns, and for the same reason: it keeps a miss at position 0 distinguishable from
   *   a hit at index 0.
   */
  #indexOf(key: K): number {
    let low = 0;
    let high = this.#state.entries.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      // entry against key, in that order — the sign convention has to match the order the entries are kept in
      const result = this.#compare(this.#entryAt(mid, "TreeMap lookup").key, key);
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

  /** The index of the first entry at (or, exclusively, after) `key`. Equal to the size when there is none. */
  #lowerBound(key: K, inclusive: boolean): number {
    const at = this.#indexOf(key);
    return at >= 0 ? (inclusive ? at : at + 1) : -(at + 1);
  }

  /** The index one past the last entry at (or, exclusively, before) `key`. Zero when there is none. */
  #upperBound(key: K, inclusive: boolean): number {
    const at = this.#indexOf(key);
    return at >= 0 ? (inclusive ? at + 1 : at) : -(at + 1);
  }

  /** Whether an index landed on an actual entry rather than off either end of the map. */
  #inRange(index: number): boolean {
    return index >= 0 && index < this.#state.entries.length;
  }

  /** The key at a position, or `null` if the position is off either end. */
  #keyAt(index: number): K | null {
    return this.#inRange(index) ? this.#entryAt(index, "TreeMap navigation").key : null;
  }

  /** A {@link JavaMapEntry} snapshot of a position, or `null` if the position is off either end. */
  #snapshot(index: number): JavaMapEntry<K, V> | null {
    if (!this.#inRange(index)) {
      return null;
    }
    const entry = this.#entryAt(index, "TreeMap navigation");
    return new JavaMapEntry<K, V>(entry.key, entry.value);
  }

  /** A new map over a run of these entries, ordered the same way. The entries are copied, so it is not a view. */
  #copyOfRange(from: number, to: number): TreeMap<K, V> {
    const copy = new TreeMap<K, V>();
    copy.#comparator = this.#comparator;
    copy.#state = {
      entries: this.#state.entries.slice(from, to).map((entry) => ({ key: entry.key, value: entry.value })),
      modCount: 0,
    };
    return copy;
  }

  /**
   * Java's `SortedMap.comparator()`.
   *
   * @returns the comparator this map was built with, or `null` if it keeps its keys in natural order. The `null`
   *   is Java's, and it is why the comparator is not simply stored as {@link compareOf} when none was given.
   */
  public comparator(): ((a: K, b: K) => number) | null {
    return this.#comparator;
  }

  public override size(): number {
    return this.#state.entries.length;
  }

  public override containsKey(key: K): boolean {
    return this.#indexOf(key) >= 0;
  }

  public override get(key: K): V | null {
    const at = this.#indexOf(key);
    return at < 0 ? null : this.#entryAt(at, "TreeMap.get").value;
  }

  public override put(key: K, value: V): V | null {
    this.requireMutable("put");
    const at = this.#indexOf(key);
    if (at >= 0) {
      const entry = this.#entryAt(at, "TreeMap.put");
      const previous = entry.value;
      entry.value = value;
      // the key already in the map is kept, as Java does, and replacement is not structural — so modCount stays
      // put and an in-flight iterator is undisturbed
      return previous;
    }
    if (this.#state.entries.length === 0) {
      // Java's TreeMap compares the first key against itself for exactly this reason: with nothing else in the
      // map, that is the only way to reject a null or unorderable key at the point it was inserted rather than
      // when the second one arrives.
      this.#compare(key, key);
    }
    this.#state.entries.splice(-(at + 1), 0, { key, value });
    this.#state.modCount++;
    return null;
  }

  protected override removeKey(key: K): V | null {
    this.requireMutable("remove");
    const at = this.#indexOf(key);
    if (at < 0) {
      return null;
    }
    const removed = elementAt(this.#state.entries.splice(at, 1), 0, "TreeMap.remove");
    this.#state.modCount++;
    return removed.value;
  }

  public override clear(): void {
    this.requireMutable("clear");
    if (this.#state.entries.length === 0) {
      return;
    }
    this.#state.entries = [];
    this.#state.modCount++;
  }

  /**
   * Java's `SortedMap.firstKey`: the least key.
   *
   * @throws NoSuchElementException if the map is empty. {@link firstEntry} answers `null` instead — that
   *   difference is Java's, between the older `SortedMap` and the `NavigableMap` that came after it.
   */
  public firstKey(): K {
    if (this.#state.entries.length === 0) {
      throw new NoSuchElementException("TreeMap.firstKey has no answer for an empty map.");
    }
    return this.#entryAt(0, "TreeMap.firstKey").key;
  }

  /**
   * Java's `SortedMap.lastKey`: the greatest key.
   *
   * @throws NoSuchElementException if the map is empty. See {@link firstKey}.
   */
  public lastKey(): K {
    if (this.#state.entries.length === 0) {
      throw new NoSuchElementException("TreeMap.lastKey has no answer for an empty map.");
    }
    return this.#entryAt(this.#state.entries.length - 1, "TreeMap.lastKey").key;
  }

  /** Java's `NavigableMap.firstEntry`: the least entry, or `null` if the map is empty. */
  public firstEntry(): JavaMapEntry<K, V> | null {
    return this.#snapshot(0);
  }

  /** Java's `NavigableMap.lastEntry`: the greatest entry, or `null` if the map is empty. */
  public lastEntry(): JavaMapEntry<K, V> | null {
    return this.#snapshot(this.#state.entries.length - 1);
  }

  /**
   * Java's `NavigableMap.floorKey`: the greatest key at or below `key`, or `null` if every key is above it.
   *
   * The four of these — {@link floorKey}, {@link ceilingKey}, {@link lowerKey}, {@link higherKey} — are the
   * point of a sorted map, and the two axes are worth reading off the names. `floor` and `lower` look
   * downwards; `ceiling` and `higher` look upwards. `floor` and `ceiling` accept an exact match; `lower` and
   * `higher` insist on a strict inequality. The key does not have to be present in the map.
   */
  public floorKey(key: K): K | null {
    return this.#keyAt(this.#upperBound(key, true) - 1);
  }

  /** Java's `NavigableMap.ceilingKey`: the least key at or above `key`. See {@link floorKey}. */
  public ceilingKey(key: K): K | null {
    return this.#keyAt(this.#lowerBound(key, true));
  }

  /** Java's `NavigableMap.lowerKey`: the greatest key strictly below `key`. See {@link floorKey}. */
  public lowerKey(key: K): K | null {
    return this.#keyAt(this.#upperBound(key, false) - 1);
  }

  /** Java's `NavigableMap.higherKey`: the least key strictly above `key`. See {@link floorKey}. */
  public higherKey(key: K): K | null {
    return this.#keyAt(this.#lowerBound(key, false));
  }

  /** Java's `NavigableMap.floorEntry`: the whole entry {@link floorKey} names, or `null`. */
  public floorEntry(key: K): JavaMapEntry<K, V> | null {
    return this.#snapshot(this.#upperBound(key, true) - 1);
  }

  /** Java's `NavigableMap.ceilingEntry`. See {@link floorKey}. */
  public ceilingEntry(key: K): JavaMapEntry<K, V> | null {
    return this.#snapshot(this.#lowerBound(key, true));
  }

  /** Java's `NavigableMap.lowerEntry`. See {@link floorKey}. */
  public lowerEntry(key: K): JavaMapEntry<K, V> | null {
    return this.#snapshot(this.#upperBound(key, false) - 1);
  }

  /** Java's `NavigableMap.higherEntry`. See {@link floorKey}. */
  public higherEntry(key: K): JavaMapEntry<K, V> | null {
    return this.#snapshot(this.#lowerBound(key, false));
  }

  /**
   * Java's `NavigableMap.pollFirstEntry`: removes and returns the least entry, or returns `null` if the map is
   * empty. The queue-like half of a sorted map — this and {@link pollLastEntry} are what make one usable as a
   * priority queue.
   */
  public pollFirstEntry(): JavaMapEntry<K, V> | null {
    return this.#poll(0, "pollFirstEntry");
  }

  /** Java's `NavigableMap.pollLastEntry`: removes and returns the greatest entry, or `null`. */
  public pollLastEntry(): JavaMapEntry<K, V> | null {
    return this.#poll(this.#state.entries.length - 1, "pollLastEntry");
  }

  #poll(index: number, operation: string): JavaMapEntry<K, V> | null {
    this.requireMutable(operation);
    const snapshot = this.#snapshot(index);
    if (snapshot === null) {
      return null;
    }
    this.#state.entries.splice(index, 1);
    this.#state.modCount++;
    return snapshot;
  }

  /**
   * Java's `SortedMap.headMap`: the entries whose keys are below `toKey`.
   *
   * A copy rather than a view, which is where this departs from Java. A live range view has to write through to
   * its parent and reject keys that fall outside its bounds, and {@link JavaList.subList} already made the same
   * call for the same reason. Mutating the result here leaves this map alone.
   *
   * @param inclusive whether `toKey` itself is included. Defaults to `false`, which is Java's two-argument form.
   */
  public headMap(toKey: K, inclusive: boolean = false): TreeMap<K, V> {
    return this.#copyOfRange(0, this.#upperBound(toKey, inclusive));
  }

  /**
   * Java's `SortedMap.tailMap`: the entries whose keys are at or above `fromKey`. A copy, like {@link headMap}.
   *
   * @param inclusive whether `fromKey` itself is included. Defaults to `true`, which is Java's two-argument form
   *   — note that this default is the opposite of {@link headMap}'s, so that `headMap(k)` and `tailMap(k)`
   *   partition the map between them without overlapping or dropping `k`.
   */
  public tailMap(fromKey: K, inclusive: boolean = true): TreeMap<K, V> {
    return this.#copyOfRange(this.#lowerBound(fromKey, inclusive), this.#state.entries.length);
  }

  /**
   * Java's `SortedMap.subMap`: the entries whose keys fall in a range. A copy, like {@link headMap}.
   *
   * Defaults to `[fromKey, toKey)` — inclusive at the bottom, exclusive at the top — matching Java's
   * two-argument form and the half-open convention everything else here uses.
   *
   * NOTE: the two flags come last, where Java interleaves them as `(from, fromInclusive, to, toInclusive)`.
   * They cannot be interleaved here: a `TreeMap<boolean, V>` would make the second argument a key and a flag at
   * the same time, with nothing at runtime able to tell which was meant. Same reason
   * {@link JavaList.removeAt} exists.
   *
   * @throws IllegalArgumentException if the range runs backwards, as Java's does
   */
  public subMap(fromKey: K, toKey: K, fromInclusive: boolean = true, toInclusive: boolean = false): TreeMap<K, V> {
    if (this.#compare(fromKey, toKey) > 0) {
      throw new IllegalArgumentException(`subMap range is inverted: ${String(fromKey)} is above ${String(toKey)}.`);
    }
    return this.#copyOfRange(this.#lowerBound(fromKey, fromInclusive), this.#upperBound(toKey, toInclusive));
  }

  /**
   * Java's `NavigableMap.descendingMap`: the same entries, greatest first.
   *
   * A copy ordered by the reverse of this map's comparator, so it is a `TreeMap` in its own right rather than a
   * reversed reading of this one — `firstKey()` on it is this map's `lastKey()`, and inserting into it keeps
   * descending order. For a walk rather than a map, {@link descendingKeys} avoids the copy.
   */
  public descendingMap(): TreeMap<K, V> {
    const ascending = (a: K, b: K): number => this.#compare(a, b);
    const descending = new TreeMap<K, V>((a, b) => ascending(b, a));
    descending.#state = {
      entries: this.#state.entries.map((entry) => ({ key: entry.key, value: entry.value })).reverse(),
      modCount: 0,
    };
    return descending;
  }

  /**
   * The keys, greatest first. Java spells this `descendingKeySet()` and hands back a live `NavigableSet`; this
   * is an iterator, which is what that view is almost always immediately used as. Fail-fast, like
   * {@link Symbol.iterator}.
   */
  public *descendingKeys(): IterableIterator<K> {
    const expected = this.#state.modCount;
    for (let i = this.#state.entries.length - 1; i >= 0; i--) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      yield this.#entryAt(i, "TreeMap descending iterator").key;
    }
  }

  /** The entries, greatest first, as {@link JavaMapEntry} snapshots. Fail-fast, like {@link Symbol.iterator}. */
  public *descendingEntries(): IterableIterator<JavaMapEntry<K, V>> {
    const expected = this.#state.modCount;
    for (let i = this.#state.entries.length - 1; i >= 0; i--) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      const entry = this.#entryAt(i, "TreeMap descending iterator");
      yield new JavaMapEntry<K, V>(entry.key, entry.value);
    }
  }

  /**
   * Iterates `[key, value]` pairs in key order, so a map round-trips through its own constructor and spreads
   * into a plain JavaScript `Map`.
   *
   * Fail-fast, as Java's iterators are: a structural change mid-iteration throws
   * {@link ConcurrentModificationException}. Replacing the value under an existing key is not structural and
   * will not trip it. Every other walk over this map is built on this one and inherits both properties.
   */
  public override *[Symbol.iterator](): IterableIterator<[K, V]> {
    const expected = this.#state.modCount;
    for (let i = 0; i < this.#state.entries.length; i++) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      const entry = this.#entryAt(i, "TreeMap iterator");
      yield [entry.key, entry.value];
    }
  }
}
