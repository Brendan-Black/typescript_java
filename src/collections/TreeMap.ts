import { ConcurrentModificationException } from "../exceptions/ConcurrentModificationException.js";
import { IllegalArgumentException } from "../exceptions/IllegalArgumentException.js";
import { NoSuchElementException } from "../exceptions/NoSuchElementException.js";
import { compareOf, type NaturallyOrdered } from "../fundamentals/Comparable.js";
import { elementAt } from "../fundamentals/Indexing.js";
import { AbstractMap, MapEntry } from "./AbstractMap.js";
import { unsupported } from "./Collection.js";

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

/** One end of a range view: the key it is cut at, and whether that key is on the inside of the cut. */
interface RangeBound<K> {
  readonly key: K;
  readonly inclusive: boolean;
}

/**
 * The window a range view can see, as a pair of key bounds rather than a pair of indices. Keys, because the
 * entries behind them move: an insertion into the parent shifts every index after it, where a bound expressed as
 * a key still names the same place afterwards. See {@link TreeMap.subMap}.
 *
 * A `null` on either side means that side is open — {@link TreeMap.headMap} has no lower bound and
 * {@link TreeMap.tailMap} no upper.
 */
interface RangeBounds<K> {
  readonly from: RangeBound<K> | null;
  readonly to: RangeBound<K> | null;
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
export class TreeMap<K, V> extends AbstractMap<K, V> {
  #state: TreeMapState<K, V>;
  /** `null` means natural order, so {@link comparator} can report that the way Java's `SortedMap` does */
  #comparator: ((a: K, b: K) => number) | null;
  #readOnly = false;
  /** `null` for a map that is the whole map; a pair of bounds for one that is a range view of another */
  #bounds: RangeBounds<K> | null = null;

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
   * An immutable sorted map, refusing every mutator. There is no `JavaMap.of` in Java that sorts; this is the
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
   *
   * Wrapping a range view keeps its bounds, so an unmodifiable `subMap` sees exactly what the `subMap` did.
   */
  public static unmodifiable<K, V>(map: TreeMap<K, V>): TreeMap<K, V> {
    const view = new TreeMap<K, V>();
    view.#state = map.#state;
    view.#comparator = map.#comparator;
    view.#bounds = map.#bounds;
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
   * Binary search over every entry in the shared storage, bounds ignored.
   *
   * @returns the index of the key, or `-(insertionPoint) - 1` if it is absent — the same encoding
   *   {@link binarySearch} returns, and for the same reason: it keeps a miss at position 0 distinguishable from
   *   a hit at index 0.
   */
  #search(key: K): number {
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

  /**
   * The index of the first entry this map can see: zero for a whole map, and wherever the lower bound falls for
   * a range view.
   *
   * Recomputed on every call rather than stored, which is what keeps a range view live: the parent may have
   * inserted or removed entries since the view was taken, and a stored index would be pointing at the wrong one.
   */
  #start(): number {
    const from = this.#bounds?.from ?? null;
    if (from === null) {
      return 0;
    }
    const at = this.#search(from.key);
    return at >= 0 ? (from.inclusive ? at : at + 1) : -(at + 1);
  }

  /** The index one past the last entry this map can see. See {@link #start}. */
  #end(): number {
    const to = this.#bounds?.to ?? null;
    if (to === null) {
      return this.#state.entries.length;
    }
    const at = this.#search(to.key);
    return at >= 0 ? (to.inclusive ? at + 1 : at) : -(at + 1);
  }

  /**
   * {@link #search}, restricted to what this map can see.
   *
   * A key outside the bounds reads as absent rather than as found elsewhere in the shared storage, and its
   * insertion point is pulled to the nearer edge of the window — so every caller below sees a map that stops at
   * its bounds, whatever the parent holds beyond them.
   */
  #indexOf(key: K): number {
    const at = this.#search(key);
    if (this.#bounds === null) {
      return at;
    }
    const start = this.#start();
    const end = this.#end();
    if (at >= 0 && at >= start && at < end) {
      return at;
    }
    const insertion = at >= 0 ? at : -(at + 1);
    return -(Math.min(Math.max(insertion, start), end) + 1);
  }

  /** The index of the first entry at (or, exclusively, after) `key`. Equal to {@link #end} when there is none. */
  #lowerBound(key: K, inclusive: boolean): number {
    const at = this.#indexOf(key);
    return at >= 0 ? (inclusive ? at : at + 1) : -(at + 1);
  }

  /** The index one past the last entry at (or, exclusively, before) `key`. Equal to {@link #start} when none. */
  #upperBound(key: K, inclusive: boolean): number {
    const at = this.#indexOf(key);
    return at >= 0 ? (inclusive ? at + 1 : at) : -(at + 1);
  }

  /** Whether an index landed on an entry this map can see, rather than off either end of its window. */
  #visible(index: number): boolean {
    return index >= this.#start() && index < this.#end();
  }

  /** The key at a position, or `null` if the position is off either end. */
  #keyAt(index: number): K | null {
    return this.#visible(index) ? this.#entryAt(index, "TreeMap navigation").key : null;
  }

  /** A {@link MapEntry} snapshot of a position, or `null` if the position is off either end. */
  #snapshot(index: number): MapEntry<K, V> | null {
    if (!this.#visible(index)) {
      return null;
    }
    const entry = this.#entryAt(index, "TreeMap navigation");
    return new MapEntry<K, V>(entry.key, entry.value);
  }

  /**
   * Whether a key falls inside this map's bounds. Always true for a map that is not a range view, which is what
   * makes the checks below cost nothing on a whole map.
   */
  #withinBounds(key: K): boolean {
    const from = this.#bounds?.from ?? null;
    if (from !== null) {
      const against = this.#compare(key, from.key);
      if (against < 0 || (against === 0 && !from.inclusive)) {
        return false;
      }
    }
    const to = this.#bounds?.to ?? null;
    if (to !== null) {
      const against = this.#compare(key, to.key);
      if (against > 0 || (against === 0 && !to.inclusive)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Whether a key may serve as the *bound* of a narrower range, which is the closed interval rather than the
   * half-open one {@link #withinBounds} tests.
   *
   * An excluded endpoint still names a legal edge: `tailMap(30, false)` cannot contain 30, but
   * `.headMap(30, false)` is a perfectly sensible empty range cut at the same place. Only an exclusive bound
   * asking to *include* that key is a contradiction, and that is the case {@link #withinBounds} catches.
   */
  #withinClosedBounds(key: K): boolean {
    const from = this.#bounds?.from ?? null;
    if (from !== null && this.#compare(key, from.key) < 0) {
      return false;
    }
    const to = this.#bounds?.to ?? null;
    if (to !== null && this.#compare(key, to.key) > 0) {
      return false;
    }
    return true;
  }

  #requireBoundWithin(key: K, inclusive: boolean, name: string): void {
    if (!(inclusive ? this.#withinBounds(key) : this.#withinClosedBounds(key))) {
      throw new IllegalArgumentException(`${name} ${String(key)} falls outside the bounds of this range.`);
    }
  }

  /** A narrower window onto the same entries: live against them, and read-only if this map is. */
  #rangeView(from: RangeBound<K> | null, to: RangeBound<K> | null): TreeMap<K, V> {
    const view = new TreeMap<K, V>();
    view.#state = this.#state;
    view.#comparator = this.#comparator;
    view.#readOnly = this.#readOnly;
    view.#bounds = { from, to };
    return view;
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
    return Math.max(0, this.#end() - this.#start());
  }

  public override containsKey(key: K): boolean {
    return this.#indexOf(key) >= 0;
  }

  public override get(key: K): V | null {
    const at = this.#indexOf(key);
    return at < 0 ? null : this.#entryAt(at, "TreeMap.get").value;
  }

  /**
   * @throws IllegalArgumentException if this map is a range view and the key falls outside its bounds. A range
   *   writes through to the entries it is a window onto, so accepting a key it could not then see would put the
   *   entry somewhere the caller cannot reach — Java's submaps refuse for the same reason.
   */
  public override put(key: K, value: V): V | null {
    this.requireMutable("put");
    if (!this.#withinBounds(key)) {
      throw new IllegalArgumentException(`Key ${String(key)} falls outside the bounds of this range.`);
    }
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

  /**
   * A key outside a range view's bounds reads as absent here rather than throwing, which is the asymmetry Java's
   * submaps have too: removing something a range cannot see is already a no-op, where {@link put} would have had
   * to invent a place to put it.
   */
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

  /** On a range view this empties the range, leaving everything the range cannot see where it was. */
  public override clear(): void {
    this.requireMutable("clear");
    const start = this.#start();
    const end = this.#end();
    if (start >= end) {
      return;
    }
    this.#state.entries.splice(start, end - start);
    this.#state.modCount++;
  }

  /**
   * Java's `SortedMap.firstKey`: the least key.
   *
   * @throws NoSuchElementException if the map is empty. {@link firstEntry} answers `null` instead — that
   *   difference is Java's, between the older `SortedMap` and the `NavigableMap` that came after it.
   */
  public firstKey(): K {
    if (this.isEmpty()) {
      throw new NoSuchElementException("TreeMap.firstKey has no answer for an empty map.");
    }
    return this.#entryAt(this.#start(), "TreeMap.firstKey").key;
  }

  /**
   * Java's `SortedMap.lastKey`: the greatest key.
   *
   * @throws NoSuchElementException if the map is empty. See {@link firstKey}.
   */
  public lastKey(): K {
    if (this.isEmpty()) {
      throw new NoSuchElementException("TreeMap.lastKey has no answer for an empty map.");
    }
    return this.#entryAt(this.#end() - 1, "TreeMap.lastKey").key;
  }

  /** Java's `NavigableMap.firstEntry`: the least entry, or `null` if the map is empty. */
  public firstEntry(): MapEntry<K, V> | null {
    return this.#snapshot(this.#start());
  }

  /** Java's `NavigableMap.lastEntry`: the greatest entry, or `null` if the map is empty. */
  public lastEntry(): MapEntry<K, V> | null {
    return this.#snapshot(this.#end() - 1);
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
  public floorEntry(key: K): MapEntry<K, V> | null {
    return this.#snapshot(this.#upperBound(key, true) - 1);
  }

  /** Java's `NavigableMap.ceilingEntry`. See {@link floorKey}. */
  public ceilingEntry(key: K): MapEntry<K, V> | null {
    return this.#snapshot(this.#lowerBound(key, true));
  }

  /** Java's `NavigableMap.lowerEntry`. See {@link floorKey}. */
  public lowerEntry(key: K): MapEntry<K, V> | null {
    return this.#snapshot(this.#upperBound(key, false) - 1);
  }

  /** Java's `NavigableMap.higherEntry`. See {@link floorKey}. */
  public higherEntry(key: K): MapEntry<K, V> | null {
    return this.#snapshot(this.#lowerBound(key, false));
  }

  /**
   * Java's `NavigableMap.pollFirstEntry`: removes and returns the least entry, or returns `null` if the map is
   * empty. The queue-like half of a sorted map — this and {@link pollLastEntry} are what make one usable as a
   * priority queue.
   */
  public pollFirstEntry(): MapEntry<K, V> | null {
    return this.#poll(this.#start(), "pollFirstEntry");
  }

  /** Java's `NavigableMap.pollLastEntry`: removes and returns the greatest entry, or `null`. */
  public pollLastEntry(): MapEntry<K, V> | null {
    return this.#poll(this.#end() - 1, "pollLastEntry");
  }

  #poll(index: number, operation: string): MapEntry<K, V> | null {
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
   * A live view, as Java's is. It reads and writes the same entries this map holds, so changes go both ways:
   * putting through the range puts into this map, and putting into this map inside the range shows up through
   * it. What the range cannot do is reach outside its bounds — {@link put} refuses a key it could not then see.
   *
   * The bound is a key rather than a position, so it keeps its meaning as entries come and go around it. A
   * `headMap(30)` taken before 25 is inserted contains 25 afterwards.
   *
   * @param inclusive whether `toKey` itself is included. Defaults to `false`, which is Java's two-argument form.
   * @throws IllegalArgumentException if this map is itself a range view and `toKey` falls outside its bounds
   */
  public headMap(toKey: K, inclusive: boolean = false): TreeMap<K, V> {
    this.#requireBoundWithin(toKey, inclusive, "toKey");
    return this.#rangeView(this.#bounds?.from ?? null, { key: toKey, inclusive });
  }

  /**
   * Java's `SortedMap.tailMap`: the entries whose keys are at or above `fromKey`. A live view, like
   * {@link headMap}.
   *
   * @param inclusive whether `fromKey` itself is included. Defaults to `true`, which is Java's two-argument form
   *   — note that this default is the opposite of {@link headMap}'s, so that `headMap(k)` and `tailMap(k)`
   *   partition the map between them without overlapping or dropping `k`.
   * @throws IllegalArgumentException if this map is itself a range view and `fromKey` falls outside its bounds
   */
  public tailMap(fromKey: K, inclusive: boolean = true): TreeMap<K, V> {
    this.#requireBoundWithin(fromKey, inclusive, "fromKey");
    return this.#rangeView({ key: fromKey, inclusive }, this.#bounds?.to ?? null);
  }

  /**
   * Java's `SortedMap.subMap`: the entries whose keys fall in a range. A live view, like {@link headMap}.
   *
   * Defaults to `[fromKey, toKey)` — inclusive at the bottom, exclusive at the top — matching Java's
   * two-argument form and the half-open convention everything else here uses.
   *
   * NOTE: the two flags come last, where Java interleaves them as `(from, fromInclusive, to, toInclusive)`.
   * They cannot be interleaved here: a `TreeMap<boolean, V>` would make the second argument a key and a flag at
   * the same time, with nothing at runtime able to tell which was meant. Same reason
   * {@link List.removeAt} exists.
   *
   * @throws IllegalArgumentException if the range runs backwards, as Java's does, or if this map is itself a
   *   range view and either bound falls outside it — which is also what stops a range being widened by
   *   narrowing it twice
   */
  public subMap(fromKey: K, toKey: K, fromInclusive: boolean = true, toInclusive: boolean = false): TreeMap<K, V> {
    if (this.#compare(fromKey, toKey) > 0) {
      throw new IllegalArgumentException(`subMap range is inverted: ${String(fromKey)} is above ${String(toKey)}.`);
    }
    this.#requireBoundWithin(fromKey, fromInclusive, "fromKey");
    this.#requireBoundWithin(toKey, toInclusive, "toKey");
    return this.#rangeView({ key: fromKey, inclusive: fromInclusive }, { key: toKey, inclusive: toInclusive });
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
      entries: this.#state.entries
        .slice(this.#start(), this.#end())
        .map((entry) => ({ key: entry.key, value: entry.value }))
        .reverse(),
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
    const start = this.#start();
    for (let i = this.#end() - 1; i >= start; i--) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      yield this.#entryAt(i, "TreeMap descending iterator").key;
    }
  }

  /** The entries, greatest first, as {@link MapEntry} snapshots. Fail-fast, like {@link Symbol.iterator}. */
  public *descendingEntries(): IterableIterator<MapEntry<K, V>> {
    const expected = this.#state.modCount;
    const start = this.#start();
    for (let i = this.#end() - 1; i >= start; i--) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      const entry = this.#entryAt(i, "TreeMap descending iterator");
      yield new MapEntry<K, V>(entry.key, entry.value);
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
    const end = this.#end();
    for (let i = this.#start(); i < end; i++) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      const entry = this.#entryAt(i, "TreeMap iterator");
      yield [entry.key, entry.value];
    }
  }
}
