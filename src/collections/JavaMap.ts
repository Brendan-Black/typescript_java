import { equalsOf, hashCodeOf } from "../fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../fundamentals/Object.js";
import { Optional } from "../fundamentals/Optional.js";
import { JavaSet } from "./JavaSet.js";

/**
 * One key/value pair, as handed out by {@link JavaMap.entrySet}. Java's `Map.Entry`, minus `setValue` — these
 * are snapshots rather than live views into the map, so writing through one would not do what it looks like.
 */
export class JavaMapEntry<K, V> extends JavaObject {
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

  public equals(other: any): boolean {
    return boilerplateEqualityCheck<JavaMapEntry<K, V>>({ obj1: this, obj2: other }, (o1, o2) => {
      if (!(#key in o2)) {
        return false;
      }
      return equalsOf(o1.#key, o2.#key) && equalsOf(o1.#value, o2.#value);
    });
  }

  /** Java's `Map.Entry.hashCode`: the key's hash XORed with the value's. */
  public hashCode(): number {
    return hashCodeOf(this.#key) ^ hashCodeOf(this.#value);
  }

  public toString(): string {
    return `${String(this.#key)}=${String(this.#value)}`;
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
 * first person who depends on it.
 *
 * IMPORTANT: as in Java, a key whose `hashCode()` disagrees with its `equals()` will be lost in the map. If you
 * override `equals` on a {@link JavaObject}, you must override `hashCode` too — {@link hashAll} exists to make
 * that a one-liner. Mutating a key after inserting it moves its hash out from under the map, with the same
 * result.
 */
export class JavaMap<K, V> extends JavaObject {
  /** hash code -> the nodes that landed on it. A JS Map, so any integer works as a bucket index. */
  readonly #buckets = new Map<number, Node<K, V>[]>();
  #head: Node<K, V> | null = null;
  #tail: Node<K, V> | null = null;
  #size = 0;

  /**
   * @param entries initial contents, as `[key, value]` pairs. Accepts anything iterable, including another
   * JavaMap (which iterates as pairs) and a plain JavaScript `Map`. Later pairs win over earlier ones.
   */
  constructor(entries?: Iterable<readonly [K, V]>) {
    super();
    if (entries) {
      for (const [key, value] of entries) {
        this.put(key, value);
      }
    }
  }

  #findNode(key: K): Node<K, V> | null {
    const bucket = this.#buckets.get(hashCodeOf(key));
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
    if (node.before === null) {
      this.#head = node.after;
    } else {
      node.before.after = node.after;
    }
    if (node.after === null) {
      this.#tail = node.before;
    } else {
      node.after.before = node.before;
    }
    // `node.after` is deliberately left intact: an iterator parked on this node can still walk forward off it.
    node.before = null;
  }

  public size(): number {
    return this.#size;
  }

  public isEmpty(): boolean {
    return this.#size === 0;
  }

  public containsKey(key: K): boolean {
    return this.#findNode(key) !== null;
  }

  /** Linear, as Java's is — the map indexes keys, not values. */
  public containsValue(value: V): boolean {
    for (let node = this.#head; node !== null; node = node.after) {
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
    const hash = hashCodeOf(key);
    let bucket = this.#buckets.get(hash);
    if (bucket === undefined) {
      bucket = [];
      this.#buckets.set(hash, bucket);
    }
    for (const node of bucket) {
      if (equalsOf(key, node.key)) {
        const previous = node.value;
        node.value = value;
        // Java keeps the key already in the map and discards the one just passed in. They are `equals`, so it
        // makes no difference to lookups, but it does decide which one `keySet()` hands back.
        return previous;
      }
    }
    const node: Node<K, V> = { hash, key, value, before: this.#tail, after: null };
    if (this.#tail === null) {
      this.#head = node;
    } else {
      this.#tail.after = node;
    }
    this.#tail = node;
    bucket.push(node);
    this.#size++;
    return null;
  }

  /**
   * @returns the existing value if the key was already mapped to a non-null one, `null` if the entry was written.
   */
  public putIfAbsent(key: K, value: V): V | null {
    const node = this.#findNode(key);
    if (node !== null && node.value !== null) {
      return node.value;
    }
    this.put(key, value);
    return null;
  }

  public putAll(entries: Iterable<readonly [K, V]>): void {
    for (const [key, value] of entries) {
      this.put(key, value);
    }
  }

  /**
   * Looks the key up and, only if it is absent or mapped to `null`, calls the supplier and stores the result.
   * @returns the value now mapped to the key
   */
  public computeIfAbsent(key: K, supplier: (key: K) => V): V {
    const node = this.#findNode(key);
    if (node !== null && node.value !== null) {
      return node.value;
    }
    const value = supplier(key);
    this.put(key, value);
    return value;
  }

  /**
   * @returns the value that was removed, or `null` if the key was absent.
   */
  public remove(key: K): V | null {
    const hash = hashCodeOf(key);
    const bucket = this.#buckets.get(hash);
    if (bucket === undefined) {
      return null;
    }
    for (let i = 0; i < bucket.length; i++) {
      const node = bucket[i];
      if (!equalsOf(key, node.key)) {
        continue;
      }
      bucket.splice(i, 1);
      if (bucket.length === 0) {
        this.#buckets.delete(hash);
      }
      this.#unlink(node);
      this.#size--;
      return node.value;
    }
    return null;
  }

  public clear(): void {
    this.#buckets.clear();
    this.#head = null;
    this.#tail = null;
    this.#size = 0;
  }

  /**
   * NOTE: a snapshot, not Java's live view. Adding to the returned set does not touch this map, and removing a
   * key from this map does not shrink a set already handed out.
   */
  public keySet(): JavaSet<K> {
    return new JavaSet<K>(this.keys());
  }

  /** NOTE: a snapshot, and an array rather than Java's `Collection<V>` — there is no JavaList to return yet. */
  public values(): V[] {
    return [...this.valueIterator()];
  }

  /** NOTE: a snapshot, not Java's live view. See {@link JavaMapEntry}. */
  public entrySet(): JavaSet<JavaMapEntry<K, V>> {
    const entries = new JavaSet<JavaMapEntry<K, V>>();
    for (let node = this.#head; node !== null; node = node.after) {
      entries.add(new JavaMapEntry<K, V>(node.key, node.value));
    }
    return entries;
  }

  public *keys(): IterableIterator<K> {
    for (let node = this.#head; node !== null; node = node.after) {
      yield node.key;
    }
  }

  public *valueIterator(): IterableIterator<V> {
    for (let node = this.#head; node !== null; node = node.after) {
      yield node.value;
    }
  }

  /**
   * Iterates `[key, value]` pairs in insertion order, so a map round-trips through its own constructor and
   * spreads into a plain JavaScript `Map`.
   *
   * NOTE: unlike Java, modifying the map mid-iteration does not throw a `ConcurrentModificationException`;
   * there is no such exception in this library yet. Removing the current entry is safe — the walk resumes from
   * where that entry pointed — but anything beyond that has unspecified results.
   */
  public *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (let node = this.#head; node !== null; node = node.after) {
      yield [node.key, node.value];
    }
  }

  public forEach(consumer: (value: V, key: K, map: JavaMap<K, V>) => void): void {
    for (let node = this.#head; node !== null; node = node.after) {
      // Java's `BiConsumer` takes (key, value); JavaScript's `Map.forEach` takes (value, key, map). This follows
      // JavaScript, because getting the two backwards is silent when K and V are both strings.
      consumer(node.value, node.key, this);
    }
  }

  /**
   * Java's `AbstractMap.equals`: same size, and every key maps to an equal value. Order is not part of it, so
   * two maps built by different insertion sequences are still equal.
   */
  public equals(other: any): boolean {
    return boilerplateEqualityCheck<JavaMap<K, V>>({ obj1: this, obj2: other }, (o1, o2) => {
      if (!(#size in o2) || o1.#size !== o2.#size) {
        return false;
      }
      for (let node = o1.#head; node !== null; node = node.after) {
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
  public hashCode(): number {
    let hash = 0;
    for (let node = this.#head; node !== null; node = node.after) {
      hash = (hash + (hashCodeOf(node.key) ^ hashCodeOf(node.value))) | 0;
    }
    return hash;
  }

  /** Java's `AbstractMap.toString`: `{a=1, b=2}`. */
  public toString(): string {
    const parts: string[] = [];
    for (let node = this.#head; node !== null; node = node.after) {
      parts.push(`${String(node.key)}=${String(node.value)}`);
    }
    return `{${parts.join(", ")}}`;
  }
}
