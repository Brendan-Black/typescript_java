import { equalsOf, hashCodeOf } from "../fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../fundamentals/Object.js";
import { Optional } from "../fundamentals/Optional.js";
import type { Serializable } from "../serialization/Serializable.js";
import { AbstractSet, Collection, unsupported } from "./Collection.js";
import { iteratorOver, type JavaIterator, mapIterator } from "./Iterator.js";

/**
 * One key/value pair, as handed out by {@link AbstractMap.entrySet}. Java's `Map.Entry`, minus `setValue` —
 * these are snapshots of a pair rather than a handle on the map, so writing through one would not do what it
 * looks like.
 */
export class MapEntry<K, V> extends JavaObject implements Serializable {
  readonly #key: K;
  readonly #value: V;

  constructor(key: K, value: V) {
    super();
    this.#key = key;
    this.#value = value;
  }

  public getKey(): K {
    return this.#key;
  }

  public getValue(): V {
    return this.#value;
  }

  public override equals(other: unknown): boolean {
    return boilerplateEqualityCheck<MapEntry<K, V>>({ obj1: this, obj2: other }, (o1, o2) => {
      if (!(#key in o2)) {
        return false;
      }
      return equalsOf(o1.#key, o2.#key) && equalsOf(o1.#value, o2.#value);
    });
  }

  /** Java's `Map.Entry.hashCode`: the key's hash XORed with the value's. */
  public override hashCode(): number {
    return hashCodeOf(this.#key) ^ hashCodeOf(this.#value);
  }

  public override toString(): string {
    return `${String(this.#key)}=${String(this.#value)}`;
  }

  public toJSON(): unknown {
    return { key: this.#key, value: this.#value };
  }
}

/**
 * Java's `AbstractMap`: everything a map can do once it can report its size, look a key up, store a pair, drop a
 * key, empty itself, and hand out an iterator over its entries.
 *
 * Subclasses implement those six; `putIfAbsent`, the `compute` family, `merge`, `replace`, the three collection
 * views, `equals`, `hashCode`, `toString` and `toJSON` come for free, written against the abstract methods so
 * they stay correct however the subclass stores things. {@link JavaMap} stores by hash, {@link TreeMap} stores in
 * sorted order, and neither has to restate any of what is below.
 *
 * NOTE: the derived operations reach the subclass through {@link put} and {@link removeKey}, which means a
 * subclass gets its own fail-fast and read-only checks applied to all of them for free. {@link requireMutable} is
 * called first regardless, so an unmodifiable map refuses a mutator even when the mutator would have changed
 * nothing.
 */
export abstract class AbstractMap<K, V> extends JavaObject implements Iterable<[K, V]>, Serializable {
  public abstract size(): number;

  public abstract containsKey(key: K): boolean;

  /**
   * @returns the value, or `null` if the key is absent. Java's signature, ambiguity included: a `null` here
   * cannot be told apart from a key mapped to `null`. Use {@link containsKey} or {@link find} when that matters.
   */
  public abstract get(key: K): V | null;

  /** @returns the value previously mapped to this key, or `null` if there was none. */
  public abstract put(key: K, value: V): V | null;

  public abstract clear(): void;

  /** Iterates `[key, value]` pairs, so a map round-trips through its own constructor. */
  public abstract [Symbol.iterator](): IterableIterator<[K, V]>;

  /**
   * The single-key removal both {@link remove} forms are built on. Protected because `remove` is the API; this
   * is the one operation a subclass has to supply to get both of its overloads.
   *
   * @returns the value that was removed, or `null` if the key was absent
   */
  protected abstract removeKey(key: K): V | null;

  /** Throws {@link UnsupportedOperationException} if this map is a read-only view. */
  protected abstract requireMutable(operation: string): void;

  /**
   * The count of structural changes this map has seen, which is what the iterators watch to fail fast. Replacing
   * the value under an existing key does not count; adding or removing a key does.
   */
  protected abstract modCount(): number;

  public isEmpty(): boolean {
    return this.size() === 0;
  }

  /** Linear, as Java's is — a map indexes keys, not values. */
  public containsValue(value: V): boolean {
    for (const [, candidate] of this) {
      // query first, as `AbstractMap.containsValue` does — see the note on argument order in `equalsOf`
      if (equalsOf(value, candidate)) {
        return true;
      }
    }
    return false;
  }

  /**
   * The unambiguous {@link get}, and the reason this library has an {@link Optional} at all. Not part of Java's
   * `JavaMap` interface — Java resolves the same ambiguity with `getOrDefault` and `containsKey`.
   *
   * NOTE: a key mapped to `null` still yields an empty Optional, because Optional cannot represent a present
   * null. Only {@link containsKey} distinguishes those two cases.
   */
  public find(key: K): Optional<V> {
    return Optional.ofNullable<V>(this.get(key));
  }

  public getOrDefault(key: K, defaultValue: V): V {
    return this.containsKey(key) ? (this.get(key) as V) : defaultValue;
  }

  public putAll(entries: Iterable<readonly [K, V]>): void {
    this.requireMutable("putAll");
    for (const [key, value] of [...entries]) {
      this.put(key, value);
    }
  }

  /**
   * @returns the existing value if the key was already mapped to a non-null one, `null` if the entry was written.
   */
  public putIfAbsent(key: K, value: V): V | null {
    this.requireMutable("putIfAbsent");
    const existing = this.get(key);
    if (existing !== null) {
      return existing;
    }
    this.put(key, value);
    return null;
  }

  /**
   * Looks the key up and, only if it is absent or mapped to `null`, calls the supplier and stores the result.
   * @returns the value now mapped to the key
   */
  public computeIfAbsent(key: K, supplier: (key: K) => V): V {
    this.requireMutable("computeIfAbsent");
    const existing = this.get(key);
    if (existing !== null) {
      return existing;
    }
    const value = supplier(key);
    this.put(key, value);
    return value;
  }

  /**
   * Recomputes the value for a key that is already mapped to a non-null one. Absent keys are left alone and the
   * remapper is not called.
   * @returns the new value, or `null` if the key was absent or the remapper asked for removal
   */
  public computeIfPresent(key: K, remapper: (key: K, value: V) => V | null | undefined): V | null {
    this.requireMutable("computeIfPresent");
    const existing = this.get(key);
    if (existing === null) {
      return null;
    }
    const newValue = remapper(key, existing);
    if (newValue === null || newValue === undefined) {
      this.removeKey(key);
      return null;
    }
    this.put(key, newValue);
    return newValue;
  }

  /**
   * Recomputes the value for a key whether or not it is present — the remapper receives `null` when it is not.
   *
   * Returning null (or undefined) from the remapper removes the entry, which is how Java's `compute` expresses
   * "on reflection, this key should not be here".
   *
   * @returns the new value, or `null` if the entry was removed or never created
   */
  public compute(key: K, remapper: (key: K, value: V | null) => V | null | undefined): V | null {
    this.requireMutable("compute");
    const present = this.containsKey(key);
    const newValue = remapper(key, this.get(key));
    if (newValue === null || newValue === undefined) {
      if (present) {
        this.removeKey(key);
      }
      return null;
    }
    this.put(key, newValue);
    return newValue;
  }

  /**
   * Java's `merge`: insert the value if the key is absent, otherwise combine the old and new values.
   *
   * The tidy way to accumulate. A word-frequency count is `counts.merge(word, 1, (a, b) => a + b)` rather than
   * a get, a null check and a put.
   *
   * @param value the value to insert if the key is absent, and the remapper's second argument if it is not
   * @param remapper receives (existing, value) and returns the combined value, or null to remove the entry
   * @returns the new value, or `null` if the entry was removed
   */
  public merge(key: K, value: V, remapper: (existing: V, value: V) => V | null | undefined): V | null {
    this.requireMutable("merge");
    const existing = this.get(key);
    const newValue = existing === null ? value : remapper(existing, value);
    if (newValue === null || newValue === undefined) {
      if (this.containsKey(key)) {
        this.removeKey(key);
      }
      return null;
    }
    this.put(key, newValue);
    return newValue;
  }

  /**
   * Replaces the value for a key that is already present. Unlike {@link put}, this never creates an entry.
   *
   * The three-argument form replaces only if the current value matches the one you expect — Java's
   * compare-and-set, useful when something else may have changed the entry since you looked.
   *
   * @returns the previous value (two-argument form), or whether the replacement happened (three-argument form)
   */
  public replace(key: K, value: V): V | null;
  public replace(key: K, expected: V, replacement: V): boolean;
  public replace(key: K, value: V, ...replacement: readonly [V] | readonly []): V | null | boolean {
    this.requireMutable("replace");
    const present = this.containsKey(key);
    if (replacement.length === 1) {
      if (!present || !equalsOf(this.get(key), value)) {
        return false;
      }
      this.put(key, replacement[0]);
      return true;
    }
    if (!present) {
      return null;
    }
    return this.put(key, value);
  }

  /**
   * Rewrites every value in place.
   *
   * NOTE: takes `(value, key)`, matching {@link forEach} and JavaScript, where Java's `replaceAll` takes
   * `(key, value)`.
   */
  public replaceAll(operator: (value: V, key: K) => V): void {
    this.requireMutable("replaceAll");
    // no snapshot: replacing the value under an existing key is not a structural change, so the iterator this
    // walks is not invalidated by the puts below. An operator that structurally modifies the map still trips
    // the fail-fast check, which is the outcome that deserves to be loud.
    for (const [key, value] of this) {
      this.put(key, operator(value, key));
    }
  }

  /**
   * Removes an entry, unconditionally or only when it holds the value you expect.
   *
   * @returns the value that was removed (one-argument form), or whether anything was removed (two-argument form)
   */
  public remove(key: K): V | null;
  public remove(key: K, value: V): boolean;
  public remove(key: K, ...expected: readonly [V] | readonly []): V | null | boolean {
    this.requireMutable("remove");
    if (expected.length === 0) {
      return this.removeKey(key);
    }
    if (!this.containsKey(key) || !equalsOf(this.get(key), expected[0])) {
      return false;
    }
    this.removeKey(key);
    return true;
  }

  /**
   * The keys, in this map's iteration order. Fail-fast, because it walks {@link Symbol.iterator}.
   */
  public *keys(): IterableIterator<K> {
    for (const [key] of this) {
      yield key;
    }
  }

  /** The values, in this map's iteration order. Fail-fast, like {@link keys}. */
  public *valueIterator(): IterableIterator<V> {
    for (const [, value] of this) {
      yield value;
    }
  }

  /** The entries, as {@link MapEntry} objects. Fail-fast, like {@link keys}. */
  public *entries(): IterableIterator<MapEntry<K, V>> {
    for (const [key, value] of this) {
      yield new MapEntry<K, V>(key, value);
    }
  }

  /**
   * The cursor behind `entrySet().iterator()`, and behind the key and value views' iterators too — a map has one
   * notion of position, and all three views share it.
   *
   * Java reaches this only through a view, and there is nothing wrong with going the same way. It is public here
   * because {@link JavaSet} and {@link TreeSet} are backed by a map they do not otherwise expose, and this is
   * where their own iterators come from.
   *
   * NOTE: removal takes the entry the cursor is on, without checking that the value still matches — unlike
   * `entrySet().remove(entry)`, which does check. Java draws the same line, and for the same reason: an iterator
   * knows which entry it means, where a caller holding an entry only has a description of one.
   */
  public entryIterator(): JavaIterator<MapEntry<K, V>> {
    return iteratorOver<MapEntry<K, V>>({
      elements: [...this.entries()],
      modCount: () => this.modCount(),
      removeAt: (entry) => {
        this.removeKey(entry.getKey());
      },
      beforeRemove: () => {
        this.requireMutable("remove");
      },
    });
  }

  /**
   * Java's `keySet()`: a live, write-through view of the keys.
   *
   * Removing from it removes from the map, and the map's own changes show through it. Adding is refused with
   * {@link UnsupportedOperationException} — there would be no value to map the new key to — which is exactly
   * what Java's view does.
   */
  public keySet(): AbstractSet<K> {
    return new KeySetView<K, V>(this);
  }

  /**
   * Java's `values()`: a live, write-through view of the values.
   *
   * A collection rather than a set, because values may repeat. Removing a value removes the first entry
   * holding it; adding is refused, since there would be no key to file it under.
   */
  public values(): Collection<V> {
    return new ValuesView<K, V>(this);
  }

  /**
   * Java's `entrySet()`: a live, write-through view of the entries.
   *
   * The {@link MapEntry} objects it yields are snapshots — Java's support `setValue`, these do not — but
   * the view itself tracks the map, and removing an entry from it removes that entry from the map, and only
   * if the value still matches.
   */
  public entrySet(): AbstractSet<MapEntry<K, V>> {
    return new EntrySetView<K, V>(this);
  }

  /**
   * NOTE: takes `(value, key, map)`, matching JavaScript's `Map.forEach`, where Java's `BiConsumer` takes
   * `(key, value)`. Following JavaScript here because getting the two backwards is silent when K and V are
   * both strings.
   */
  public forEach(consumer: (value: V, key: K, map: this) => void): void {
    for (const [key, value] of this) {
      consumer(value, key, this);
    }
  }

  /**
   * Java's `AbstractMap.equals`: same size, and every key maps to an equal value. Order is not part of it, so
   * two maps built by different insertion sequences are still equal.
   *
   * Written against any other map rather than against one class, as Java's is written against the `JavaMap`
   * interface — a {@link JavaMap} and a {@link TreeMap} holding the same entries are equal, the same way a hash
   * set and a `keySet()` view are. That comparison asks each map about the other's keys using its own notion of
   * sameness, so a key type whose `compareTo` disagrees with its `equals` can make the answer asymmetric. That
   * is the consistency-with-equals contract {@link Comparable} describes, and it is not enforced here any more
   * than it is on the JVM.
   */
  public override equals(other: unknown): boolean {
    if (this === other) {
      return true;
    }
    // isInstance, not instanceof: a prototype-only forgery would pass the latter and then throw a TypeError out
    // of the first method call below, and equals is required to answer rather than blow up.
    if (!JavaObject.isInstance(other) || !(other instanceof AbstractMap)) {
      return false;
    }
    const otherMap = other as AbstractMap<K, V>;
    if (this.size() !== otherMap.size()) {
      return false;
    }
    for (const [key, value] of this) {
      if (!otherMap.containsKey(key) || !equalsOf(value, otherMap.get(key))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Java's `AbstractMap.hashCode`: the sum of the entry hash codes. Summing is what makes it order-independent,
   * so it agrees with {@link equals}.
   *
   * IMPORTANT: this changes as the map does. A mutable collection used as a key in another hash-based collection
   * will go missing the moment it is modified — true on the JVM as well.
   */
  public override hashCode(): number {
    let hash = 0;
    for (const [key, value] of this) {
      hash = (hash + (hashCodeOf(key) ^ hashCodeOf(value))) | 0;
    }
    return hash;
  }

  /** Java's `AbstractMap.toString`: `{a=1, b=2}`. */
  public override toString(): string {
    const parts: string[] = [];
    for (const [key, value] of this) {
      parts.push(`${String(key)}=${String(value)}`);
    }
    return `{${parts.join(", ")}}`;
  }

  /**
   * Serialises as an array of `[key, value]` pairs — the same shape {@link Symbol.iterator} yields, so it round
   * trips back through the constructor.
   *
   * Deliberately not a JSON object: object keys can only be strings, and a map whose keys are numbers, nulls or
   * `Java.Object`s would either collide or lose information on the way out.
   */
  public toJSON(): unknown {
    return [...this];
  }
}

/**
 * Live view of a map's keys. Delegates everything to the map, holding no storage of its own, which is what
 * makes it track the map rather than snapshot it.
 */
class KeySetView<K, V> extends AbstractSet<K> {
  readonly #map: AbstractMap<K, V>;

  constructor(map: AbstractMap<K, V>) {
    super();
    this.#map = map;
  }

  public size(): number {
    return this.#map.size();
  }

  public contains(value: K): boolean {
    return this.#map.containsKey(value);
  }

  public add(_value: K): boolean {
    return unsupported("add", "a key set has no value to map the new key to; put on the map instead");
  }

  public remove(value: K): boolean {
    if (!this.#map.containsKey(value)) {
      return false;
    }
    this.#map.remove(value);
    return true;
  }

  public clear(): void {
    this.#map.clear();
  }

  public [Symbol.iterator](): IterableIterator<K> {
    return this.#map.keys();
  }

  public iterator(): JavaIterator<K> {
    return mapIterator(this.#map.entryIterator(), (entry) => entry.getKey());
  }
}

/** Live view of a map's values. A collection rather than a set, because values may repeat. */
class ValuesView<K, V> extends Collection<V> {
  readonly #map: AbstractMap<K, V>;

  constructor(map: AbstractMap<K, V>) {
    super();
    this.#map = map;
  }

  public size(): number {
    return this.#map.size();
  }

  public contains(value: V): boolean {
    return this.#map.containsValue(value);
  }

  public add(_value: V): boolean {
    return unsupported("add", "a values view has no key to file the new value under; put on the map instead");
  }

  /** Removes the first entry holding an equal value, matching Java's `values().remove(...)`. */
  public remove(value: V): boolean {
    for (const [key, candidate] of this.#map) {
      if (equalsOf(value, candidate)) {
        this.#map.remove(key);
        return true;
      }
    }
    return false;
  }

  public clear(): void {
    this.#map.clear();
  }

  public [Symbol.iterator](): IterableIterator<V> {
    return this.#map.valueIterator();
  }

  /**
   * Removal here drops the entry the cursor is on, where {@link remove} can only drop the first entry holding an
   * equal value. For a values view, where repeats are the whole reason it is a collection rather than a set,
   * that difference is the point of having an iterator at all.
   */
  public iterator(): JavaIterator<V> {
    return mapIterator(this.#map.entryIterator(), (entry) => entry.getValue());
  }
}

/** Live view of a map's entries. */
class EntrySetView<K, V> extends AbstractSet<MapEntry<K, V>> {
  readonly #map: AbstractMap<K, V>;

  constructor(map: AbstractMap<K, V>) {
    super();
    this.#map = map;
  }

  public size(): number {
    return this.#map.size();
  }

  public contains(value: MapEntry<K, V>): boolean {
    if (!JavaObject.isInstance(value) || !(value instanceof MapEntry)) {
      return false;
    }
    const key = value.getKey();
    return this.#map.containsKey(key) && equalsOf(value.getValue(), this.#map.get(key));
  }

  public add(_value: MapEntry<K, V>): boolean {
    return unsupported("add", "an entry set cannot introduce entries; put on the map instead");
  }

  /** Removes only if the entry's value still matches what the map holds, as Java's entry set does. */
  public remove(value: MapEntry<K, V>): boolean {
    if (!JavaObject.isInstance(value) || !(value instanceof MapEntry)) {
      return false;
    }
    return this.#map.remove(value.getKey(), value.getValue());
  }

  public clear(): void {
    this.#map.clear();
  }

  public [Symbol.iterator](): IterableIterator<MapEntry<K, V>> {
    return this.#map.entries();
  }

  public iterator(): JavaIterator<MapEntry<K, V>> {
    return this.#map.entryIterator();
  }
}
