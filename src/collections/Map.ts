import { ConcurrentModificationException } from "../exceptions/ConcurrentModificationException.js";
import { checkCollisionChain, checkHashContract } from "../fundamentals/Contracts.js";
import { equalsOf, hashCodeOf } from "../fundamentals/Hashing.js";
import { elementAt } from "../fundamentals/Indexing.js";
import { AbstractMap } from "./AbstractMap.js";
import { unsupported } from "./Collection.js";

export { MapEntry } from "./AbstractMap.js";

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
 * See {@link Map.unmodifiable}.
 */
interface MapState<K, V> {
  /** hash code -> the nodes that landed on it. A JS Map, so any integer works as a bucket index. */
  buckets: globalThis.Map<number, Node<K, V>[]>;
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
 * structurally equal objects are two different keys and the second one can never find the first. A `Map`
 * buckets by {@link hashCodeOf} and resolves collisions with {@link equalsOf}, which means a value type that
 * overrides `equals`/`hashCode` behaves as a key exactly the way it would on the JVM.
 *
 * Keys may be anything: strings, numbers, `null`, or {@link _Object} instances. See {@link hashCodeOf} for
 * how each kind is hashed.
 *
 * Iteration is in insertion order, which makes it Java's `LinkedHashMap` rather than its `HashMap` — `HashMap`
 * leaves the order unspecified, and an unspecified order that happens to be stable is a trap waiting for the
 * first person who depends on it. Iterators are fail-fast: modifying the map mid-iteration throws
 * {@link ConcurrentModificationException} rather than quietly skipping entries.
 *
 * Everything beyond the six primitives below — `putIfAbsent`, the `compute` family, `merge`, `replace`, the
 * three collection views, `equals`, `hashCode`, `toString` — comes from {@link AbstractMap}.
 *
 * IMPORTANT: as in Java, a key whose `hashCode()` disagrees with its `equals()` will be lost in the map. If you
 * override `equals` on an {@link _Object}, you must override `hashCode` too — `hashAll` exists to make that a
 * one-liner, and the map warns once per class when it spots the mistake. Mutating a key after inserting it
 * moves its hash out from under the map, with the same result. {@link TreeMap} is the alternative when the key
 * type has an order but no trustworthy hash.
 */
export class Map<K, V> extends AbstractMap<K, V> {
  #state: MapState<K, V>;
  #readOnly = false;

  /**
   * @param entries initial contents, as `[key, value]` pairs. Accepts anything iterable, including another
   * Map (which iterates as pairs) and a plain JavaScript `Map`. Later pairs win over earlier ones.
   */
  constructor(entries?: Iterable<readonly [K, V]>) {
    super();
    this.#state = {
      buckets: new globalThis.Map<number, Node<K, V>[]>(),
      head: null,
      tail: null,
      size: 0,
      modCount: 0,
    };
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
  public static of<K, V>(...entries: readonly (readonly [K, V])[]): Map<K, V> {
    const map = new Map<K, V>(entries);
    map.#readOnly = true;
    return map;
  }

  /**
   * Java's `Collections.unmodifiableMap`: a read-only *view*, not a copy.
   *
   * The view shares the original's storage, so later changes to the original show through. That is Java's
   * behaviour and the usual source of surprise with it: handing out an unmodifiable view protects you from
   * your caller, not your caller from you. Use {@link Map.of} or the copy constructor when you want a
   * snapshot nobody can move.
   */
  public static unmodifiable<K, V>(map: Map<K, V>): Map<K, V> {
    const view = new Map<K, V>();
    view.#state = map.#state;
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

  public override size(): number {
    return this.#state.size;
  }

  public override containsKey(key: K): boolean {
    return this.#findNode(key) !== null;
  }

  /** Linear, as Java's is — the map indexes keys, not values. Overridden to walk the nodes directly. */
  public override containsValue(value: V): boolean {
    for (let node = this.#state.head; node !== null; node = node.after) {
      if (equalsOf(value, node.value)) {
        return true;
      }
    }
    return false;
  }

  public override get(key: K): V | null {
    const node = this.#findNode(key);
    return node === null ? null : node.value;
  }

  public override getOrDefault(key: K, defaultValue: V): V {
    const node = this.#findNode(key);
    return node === null ? defaultValue : node.value;
  }

  public override put(key: K, value: V): V | null {
    this.requireMutable("put");
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

  protected override removeKey(key: K): V | null {
    this.requireMutable("remove");
    const hash = hashCodeOf(key);
    const bucket = this.#state.buckets.get(hash);
    if (bucket === undefined) {
      return null;
    }
    for (let i = 0; i < bucket.length; i++) {
      const node = elementAt(bucket, i, "Map.remove");
      if (!equalsOf(key, node.key)) {
        continue;
      }
      this.#deleteNode(hash, bucket, i, node);
      return node.value;
    }
    return null;
  }

  /** Overridden to rewrite the nodes in place, which neither re-hashes a key nor allocates a pair per entry. */
  public override replaceAll(operator: (value: V, key: K) => V): void {
    this.requireMutable("replaceAll");
    for (let node = this.#state.head; node !== null; node = node.after) {
      node.value = operator(node.value, node.key);
    }
  }

  public override clear(): void {
    this.requireMutable("clear");
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
   * Iterates `[key, value]` pairs in insertion order, so a map round-trips through its own constructor and
   * spreads into a plain JavaScript `Map`.
   *
   * Fail-fast, as Java's iterators are: a structural change mid-iteration throws
   * {@link ConcurrentModificationException} rather than silently skipping entries or looping forever.
   * Replacing the value under an existing key is not structural and will not trip it. Every other walk over
   * this map — `keys()`, `values()`, `entrySet()`, `forEach` — is built on this one and inherits that.
   *
   * As in Java, modifying while consuming the *final* element goes unnoticed — the walk has already finished by
   * the time the change lands.
   */
  public override *[Symbol.iterator](): IterableIterator<[K, V]> {
    const expected = this.#state.modCount;
    for (let node = this.#state.head; node !== null; node = node.after) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The map was modified while it was being iterated.");
      }
      yield [node.key, node.value];
    }
  }
}
