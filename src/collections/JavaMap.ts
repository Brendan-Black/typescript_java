import { ConcurrentModificationException } from "../exceptions/ConcurrentModificationException.js";
import { checkCollisionChain, checkHashContract } from "../fundamentals/Contracts.js";
import { equalsOf, hashCodeOf } from "../fundamentals/Hashing.js";
import { elementAt } from "../fundamentals/Indexing.js";
import { boilerplateEqualityCheck, JavaObject } from "../fundamentals/Object.js";
import { Optional } from "../fundamentals/Optional.js";
import type { Serializable } from "../serialization/Serializable.js";
import { JavaAbstractSet, JavaCollection, unsupported } from "./JavaCollection.js";

/**
 * One key/value pair, as handed out by {@link JavaMap.entrySet}. Java's `Map.Entry`, minus `setValue` — these
 * are snapshots of a pair rather than a handle on the map, so writing through one would not do what it looks
 * like.
 */
export class JavaMapEntry<K, V> extends JavaObject implements Serializable {
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

  public override equals(other: any): boolean {
    return boilerplateEqualityCheck<JavaMapEntry<K, V>>({ obj1: this, obj2: other }, (o1, o2) => {
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
 * A bucket entry, doubly linked into the map's insertion order.
 *
 * `key` and `hash` are fixed for the node's lifetime — Java's `put` on an existing key replaces the value and
 * keeps the key that was already there, so there is never a reason to rewrite them.
 */
interface Node<K, V> {
  readonly hash: number;
  readonly key: K;
  value: V;
  before: Node<K, V> | null;
  after: Node<K, V> | null;
}

/**
 * The mutable innards, held behind one reference so an unmodifiable view can share them and stay live.
 * See {@link JavaMap.unmodifiable}.
 */
interface MapState<K, V> {
  /** hash code -> the nodes that landed on it. A JS Map, so any integer works as a bucket index. */
  buckets: Map<number, Node<K, V>[]>;
  head: Node<K, V> | null;
  tail: Node<K, V> | null;
  size: number;
  /**
   * Bumped on every *structural* change — an entry appearing or disappearing. Replacing the value under an
   * existing key is not structural and deliberately does not bump it, which is Java's rule too.
   */
  modCount: number;
}

/**
 * Java's `HashMap`, keyed on `hashCode()` and `equals()` rather than on reference identity.
 *
 * This is the thing JavaScript's built-in `Map` cannot do. `new Map()` compares keys with SameValueZero, so two
 * structurally equal objects are two different keys and the second one can never find the first. A `JavaMap`
 * buckets by {@link hashCodeOf} and resolves collisions with {@link equalsOf}, which means a value type that
 * overrides `equals`/`hashCode` behaves as a key exactly the way it would on the JVM.
 *
 * Keys may be anything: strings, numbers, `null`, or {@link JavaObject} instances. See {@link hashCodeOf} for
 * how each kind is hashed.
 *
 * Iteration is in insertion order, which makes it Java's `LinkedHashMap` rather than its `HashMap` — `HashMap`
 * leaves the order unspecified, and an unspecified order that happens to be stable is a trap waiting for the
 * first person who depends on it. Iterators are fail-fast: modifying the map mid-iteration throws
 * {@link ConcurrentModificationException} rather than quietly skipping entries.
 *
 * IMPORTANT: as in Java, a key whose `hashCode()` disagrees with its `equals()` will be lost in the map. If you
 * override `equals` on a {@link JavaObject}, you must override `hashCode` too — `hashAll` exists to make that a
 * one-liner, and the map warns once per class when it spots the mistake. Mutating a key after inserting it
 * moves its hash out from under the map, with the same result.
 */
export class JavaMap<K, V> extends JavaObject implements Iterable<[K, V]>, Serializable {
  #state: MapState<K, V>;
  #readOnly = false;

  /**
   * @param entries initial contents, as `[key, value]` pairs. Accepts anything iterable, including another
   * JavaMap (which iterates as pairs) and a plain JavaScript `Map`. Later pairs win over earlier ones.
   */
  constructor(entries?: Iterable<readonly [K, V]>) {
    super();
    this.#state = { buckets: new Map<number, Node<K, V>[]>(), head: null, tail: null, size: 0, modCount: 0 };
    if (entries) {
      for (const [key, value] of entries) {
        this.put(key, value);
      }
    }
  }

  /**
   * Java 9's `Map.of(...)`: an immutable map, refusing every mutator.
   *
   * A frozen copy rather than a view — the arguments are values, so there is nothing to stay live against.
   * Java's variadic form takes alternating keys and values, which TypeScript cannot type; these are pairs.
   */
  public static of<K, V>(...entries: readonly (readonly [K, V])[]): JavaMap<K, V> {
    const map = new JavaMap<K, V>(entries);
    map.#readOnly = true;
    return map;
  }

  /**
   * Java's `Collections.unmodifiableMap`: a read-only *view*, not a copy.
   *
   * The view shares the original's storage, so later changes to the original show through. That is Java's
   * behaviour and the usual source of surprise with it: handing out an unmodifiable view protects you from
   * your caller, not your caller from you. Use {@link JavaMap.of} or the copy constructor when you want a
   * snapshot nobody can move.
   */
  public static unmodifiable<K, V>(map: JavaMap<K, V>): JavaMap<K, V> {
    const view = new JavaMap<K, V>();
    view.#state = map.#state;
    view.#readOnly = true;
    return view;
  }

  #requireMutable(operation: string): void {
    if (this.#readOnly) {
      unsupported(operation, "this map is unmodifiable");
    }
  }

  #findNode(key: K): Node<K, V> | null {
    const bucket = this.#state.buckets.get(hashCodeOf(key));
    if (bucket === undefined) {
      return null;
    }
    for (const node of bucket) {
      // query first, as `HashMap.getNode` does — see the note on argument order in `equalsOf`
      if (equalsOf(key, node.key)) {
        return node;
      }
    }
    return null;
  }

  #unlink(node: Node<K, V>): void {
    const state = this.#state;
    if (node.before === null) {
      state.head = node.after;
    } else {
      node.before.after = node.after;
    }
    if (node.after === null) {
      state.tail = node.before;
    } else {
      node.after.before = node.before;
    }
    // `node.after` is deliberately left intact: an iterator parked on this node can still walk forward off it.
    node.before = null;
  }

  /** removes the node from its bucket and from the insertion-order chain, and counts the structural change */
  #deleteNode(hash: number, bucket: Node<K, V>[], index: number, node: Node<K, V>): void {
    bucket.splice(index, 1);
    if (bucket.length === 0) {
      this.#state.buckets.delete(hash);
    }
    this.#unlink(node);
    this.#state.size--;
    this.#state.modCount++;
  }

  public size(): number {
    return this.#state.size;
  }

  public isEmpty(): boolean {
    return this.#state.size === 0;
  }

  public containsKey(key: K): boolean {
    return this.#findNode(key) !== null;
  }

  /** Linear, as Java's is — the map indexes keys, not values. */
  public containsValue(value: V): boolean {
    for (let node = this.#state.head; node !== null; node = node.after) {
      if (equalsOf(value, node.value)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @returns the value, or `null` if the key is absent. Java's signature, ambiguity included: a `null` here
   * cannot be told apart from a key mapped to `null`. Use {@link containsKey} or {@link find} when that matters.
   */
  public get(key: K): V | null {
    const node = this.#findNode(key);
    return node === null ? null : node.value;
  }

  /**
   * The unambiguous `get`, and the reason this library has an {@link Optional} at all. Not part of Java's `Map`
   * interface — Java resolves the same ambiguity with `getOrDefault` and `containsKey`.
   *
   * NOTE: a key mapped to `null` still yields an empty Optional, because Optional cannot represent a present
   * null. Only {@link containsKey} distinguishes those two cases.
   */
  public find(key: K): Optional<V> {
    const node = this.#findNode(key);
    return Optional.ofNullable<V>(node === null ? null : node.value);
  }

  public getOrDefault(key: K, defaultValue: V): V {
    const node = this.#findNode(key);
    return node === null ? defaultValue : node.value;
  }

  /**
   * @returns the value previously mapped to this key, or `null` if there was none.
   */
  public put(key: K, value: V): V | null {
    this.#requireMutable("put");
    const hash = hashCodeOf(key);
    let bucket = this.#state.buckets.get(hash);
    if (bucket === undefined) {
      bucket = [];
      this.#state.buckets.set(hash, bucket);
    }
    for (const node of bucket) {
      if (equalsOf(key, node.key)) {
        const previous = node.value;
        node.value = value;
        // Java keeps the key already in the map and discards the one just passed in. They are `equals`, so it
        // makes no difference to lookups, but it does decide which one `keySet()` hands back. Not structural,
        // so modCount stays put and an in-flight iterator is undisturbed.
        return previous;
      }
    }
    checkHashContract(key);
    const node: Node<K, V> = { hash, key, value, before: this.#state.tail, after: null };
    if (this.#state.tail === null) {
      this.#state.head = node;
    } else {
      this.#state.tail.after = node;
    }
    this.#state.tail = node;
    bucket.push(node);
    this.#state.size++;
    this.#state.modCount++;
    checkCollisionChain(bucket.length, key);
    return null;
  }

  /**
   * @returns the existing value if the key was already mapped to a non-null one, `null` if the entry was written.
   */
  public putIfAbsent(key: K, value: V): V | null {
    this.#requireMutable("putIfAbsent");
    const node = this.#findNode(key);
    if (node !== null && node.value !== null) {
      return node.value;
    }
    this.put(key, value);
    return null;
  }

  public putAll(entries: Iterable<readonly [K, V]>): void {
    this.#requireMutable("putAll");
    for (const [key, value] of [...entries]) {
      this.put(key, value);
    }
  }

  /**
   * Looks the key up and, only if it is absent or mapped to `null`, calls the supplier and stores the result.
   * @returns the value now mapped to the key
   */
  public computeIfAbsent(key: K, supplier: (key: K) => V): V {
    this.#requireMutable("computeIfAbsent");
    const node = this.#findNode(key);
    if (node !== null && node.value !== null) {
      return node.value;
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
    this.#requireMutable("computeIfPresent");
    const node = this.#findNode(key);
    if (node === null || node.value === null) {
      return null;
    }
    const newValue = remapper(key, node.value);
    if (newValue === null || newValue === undefined) {
      this.remove(key);
      return null;
    }
    node.value = newValue;
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
    this.#requireMutable("compute");
    const node = this.#findNode(key);
    const newValue = remapper(key, node === null ? null : node.value);
    if (newValue === null || newValue === undefined) {
      if (node !== null) {
        this.remove(key);
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
    this.#requireMutable("merge");
    const node = this.#findNode(key);
    const newValue = node === null || node.value === null ? value : remapper(node.value, value);
    if (newValue === null || newValue === undefined) {
      if (node !== null) {
        this.remove(key);
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
    this.#requireMutable("replace");
    const node = this.#findNode(key);
    if (replacement.length === 1) {
      if (node === null || !equalsOf(node.value, value)) {
        return false;
      }
      node.value = replacement[0];
      return true;
    }
    if (node === null) {
      return null;
    }
    const previous = node.value;
    node.value = value;
    return previous;
  }

  /**
   * Rewrites every value in place.
   *
   * NOTE: takes `(value, key)`, matching {@link forEach} and JavaScript, where Java's `replaceAll` takes
   * `(key, value)`.
   */
  public replaceAll(operator: (value: V, key: K) => V): void {
    this.#requireMutable("replaceAll");
    for (let node = this.#state.head; node !== null; node = node.after) {
      node.value = operator(node.value, node.key);
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
    this.#requireMutable("remove");
    const hash = hashCodeOf(key);
    const bucket = this.#state.buckets.get(hash);
    if (bucket === undefined) {
      return expected.length === 1 ? false : null;
    }
    for (let i = 0; i < bucket.length; i++) {
      const node = elementAt(bucket, i, "JavaMap.remove");
      if (!equalsOf(key, node.key)) {
        continue;
      }
      if (expected.length === 1) {
        if (!equalsOf(node.value, expected[0])) {
          return false;
        }
        this.#deleteNode(hash, bucket, i, node);
        return true;
      }
      this.#deleteNode(hash, bucket, i, node);
      return node.value;
    }
    return expected.length === 1 ? false : null;
  }

  public clear(): void {
    this.#requireMutable("clear");
    if (this.#state.size === 0) {
      return;
    }
    this.#state.buckets.clear();
    this.#state.head = null;
    this.#state.tail = null;
    this.#state.size = 0;
    this.#state.modCount++;
  }

  /**
   * Java's `keySet()`: a live, write-through view of the keys.
   *
   * Removing from it removes from the map, and the map's own changes show through it. Adding is refused with
   * {@link UnsupportedOperationException} — there would be no value to map the new key to — which is exactly
   * what Java's view does.
   */
  public keySet(): JavaAbstractSet<K> {
    return new KeySetView<K, V>(this);
  }

  /**
   * Java's `values()`: a live, write-through view of the values.
   *
   * A collection rather than a set, because values may repeat. Removing a value removes the first entry
   * holding it; adding is refused, since there would be no key to file it under.
   */
  public values(): JavaCollection<V> {
    return new ValuesView<K, V>(this);
  }

  /**
   * Java's `entrySet()`: a live, write-through view of the entries.
   *
   * The {@link JavaMapEntry} objects it yields are snapshots — Java's support `setValue`, these do not — but
   * the view itself tracks the map, and removing an entry from it removes that entry from the map, and only
   * if the value still matches.
   */
  public entrySet(): JavaAbstractSet<JavaMapEntry<K, V>> {
    return new EntrySetView<K, V>(this);
  }

  /**
   * Fail-fast, as Java's iterators are: a structural change mid-iteration throws
   * {@link ConcurrentModificationException} rather than silently skipping entries or looping forever.
   * Replacing the value under an existing key is not structural and will not trip it.
   *
   * As in Java, modifying while consuming the *final* element goes unnoticed — the walk has already finished by
   * the time the change lands.
   */
  public *keys(): IterableIterator<K> {
    const expected = this.#state.modCount;
    for (let node = this.#state.head; node !== null; node = node.after) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      yield node.key;
    }
  }

  /** The values, in insertion order. Fail-fast, like {@link keys}. */
  public *valueIterator(): IterableIterator<V> {
    const expected = this.#state.modCount;
    for (let node = this.#state.head; node !== null; node = node.after) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      yield node.value;
    }
  }

  /** The entries, in insertion order, as {@link JavaMapEntry} objects. Fail-fast, like {@link keys}. */
  public *entries(): IterableIterator<JavaMapEntry<K, V>> {
    const expected = this.#state.modCount;
    for (let node = this.#state.head; node !== null; node = node.after) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      yield new JavaMapEntry<K, V>(node.key, node.value);
    }
  }

  /**
   * Iterates `[key, value]` pairs in insertion order, so a map round-trips through its own constructor and
   * spreads into a plain JavaScript `Map`. Fail-fast, like {@link keys}.
   */
  public *[Symbol.iterator](): IterableIterator<[K, V]> {
    const expected = this.#state.modCount;
    for (let node = this.#state.head; node !== null; node = node.after) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      yield [node.key, node.value];
    }
  }

  /**
   * NOTE: takes `(value, key, map)`, matching JavaScript's `Map.forEach`, where Java's `BiConsumer` takes
   * `(key, value)`. Following JavaScript here because getting the two backwards is silent when K and V are
   * both strings.
   */
  public forEach(consumer: (value: V, key: K, map: JavaMap<K, V>) => void): void {
    const expected = this.#state.modCount;
    for (let node = this.#state.head; node !== null; node = node.after) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      consumer(node.value, node.key, this);
    }
  }

  /**
   * Java's `AbstractMap.equals`: same size, and every key maps to an equal value. Order is not part of it, so
   * two maps built by different insertion sequences are still equal.
   */
  public override equals(other: any): boolean {
    return boilerplateEqualityCheck<JavaMap<K, V>>({ obj1: this, obj2: other }, (o1, o2) => {
      if (!(#state in o2) || o1.#state.size !== o2.#state.size) {
        return false;
      }
      for (let node = o1.#state.head; node !== null; node = node.after) {
        const otherNode = o2.#findNode(node.key);
        if (otherNode === null || !equalsOf(node.value, otherNode.value)) {
          return false;
        }
      }
      return true;
    });
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
    for (let node = this.#state.head; node !== null; node = node.after) {
      hash = (hash + (hashCodeOf(node.key) ^ hashCodeOf(node.value))) | 0;
    }
    return hash;
  }

  /** Java's `AbstractMap.toString`: `{a=1, b=2}`. */
  public override toString(): string {
    const parts: string[] = [];
    for (let node = this.#state.head; node !== null; node = node.after) {
      parts.push(`${String(node.key)}=${String(node.value)}`);
    }
    return `{${parts.join(", ")}}`;
  }

  /**
   * Serialises as an array of `[key, value]` pairs — the same shape {@link Symbol.iterator} yields, so it round
   * trips back through the constructor.
   *
   * Deliberately not a JSON object: object keys can only be strings, and a map whose keys are numbers, nulls or
   * JavaObjects would either collide or lose information on the way out.
   */
  public toJSON(): unknown {
    return [...this];
  }
}

/**
 * Live view of a map's keys. Delegates everything to the map, holding no storage of its own, which is what
 * makes it track the map rather than snapshot it.
 */
class KeySetView<K, V> extends JavaAbstractSet<K> {
  readonly #map: JavaMap<K, V>;

  constructor(map: JavaMap<K, V>) {
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
}

/** Live view of a map's values. A collection rather than a set, because values may repeat. */
class ValuesView<K, V> extends JavaCollection<V> {
  readonly #map: JavaMap<K, V>;

  constructor(map: JavaMap<K, V>) {
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
}

/** Live view of a map's entries. */
class EntrySetView<K, V> extends JavaAbstractSet<JavaMapEntry<K, V>> {
  readonly #map: JavaMap<K, V>;

  constructor(map: JavaMap<K, V>) {
    super();
    this.#map = map;
  }

  public size(): number {
    return this.#map.size();
  }

  public contains(value: JavaMapEntry<K, V>): boolean {
    if (!JavaObject.isInstance(value) || !(value instanceof JavaMapEntry)) {
      return false;
    }
    const key = value.getKey();
    return this.#map.containsKey(key) && equalsOf(value.getValue(), this.#map.get(key));
  }

  public add(_value: JavaMapEntry<K, V>): boolean {
    return unsupported("add", "an entry set cannot introduce entries; put on the map instead");
  }

  /** Removes only if the entry's value still matches what the map holds, as Java's entry set does. */
  public remove(value: JavaMapEntry<K, V>): boolean {
    if (!JavaObject.isInstance(value) || !(value instanceof JavaMapEntry)) {
      return false;
    }
    return this.#map.remove(value.getKey(), value.getValue());
  }

  public clear(): void {
    this.#map.clear();
  }

  public [Symbol.iterator](): IterableIterator<JavaMapEntry<K, V>> {
    return this.#map.entries();
  }
}
