import { hashCodeOf } from "../fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../fundamentals/Object.js";
import { JavaMap } from "./JavaMap.js";

/**
 * Java's `HashSet`, keyed on `hashCode()` and `equals()` rather than on reference identity.
 *
 * Where JavaScript's `Set` would hold two structurally equal objects as two separate members, this holds one.
 * Everything said about keys in {@link JavaMap} applies here to elements — including the warning that an
 * `equals` override without a matching `hashCode` override will lose the element.
 *
 * Backed by a {@link JavaMap}, exactly as Java's `HashSet` is backed by a `HashMap`, so iteration is likewise
 * in insertion order.
 */
export class JavaSet<T> extends JavaObject {
  /** the value is a placeholder; only the key carries meaning, as in Java's `HashSet.PRESENT` */
  readonly #map: JavaMap<T, boolean>;

  /**
   * @param values initial contents. Accepts anything iterable, including another JavaSet, an array, or a plain
   * JavaScript `Set`. Duplicates — by `equals`, not by reference — collapse into one member.
   */
  constructor(values?: Iterable<T>) {
    super();
    this.#map = new JavaMap<T, boolean>();
    if (values) {
      this.addAll(values);
    }
  }

  public size(): number {
    return this.#map.size();
  }

  public isEmpty(): boolean {
    return this.#map.isEmpty();
  }

  public contains(value: T): boolean {
    return this.#map.containsKey(value);
  }

  public containsAll(values: Iterable<T>): boolean {
    for (const value of values) {
      if (!this.#map.containsKey(value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * @returns `true` if the set changed — i.e. if no equal element was already present. Java's return value, and
   * the reason `add` is worth calling for its result rather than just its effect.
   */
  public add(value: T): boolean {
    return this.#map.put(value, true) === null;
  }

  /** @returns `true` if the set changed as a result of any of the additions. */
  public addAll(values: Iterable<T>): boolean {
    let changed = false;
    for (const value of values) {
      // deliberately not `changed = changed || this.add(value)`: `||` short-circuits, so once one add succeeded
      // the rest would never run.
      if (this.add(value)) {
        changed = true;
      }
    }
    return changed;
  }

  /** @returns `true` if an equal element was present and has been removed. */
  public remove(value: T): boolean {
    return this.#map.remove(value) !== null;
  }

  /** @returns `true` if the set changed. */
  public removeAll(values: Iterable<T>): boolean {
    let changed = false;
    for (const value of values) {
      if (this.remove(value)) {
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Drops every element not present in `values`, leaving the intersection.
   * @returns `true` if the set changed.
   */
  public retainAll(values: Iterable<T>): boolean {
    const keep = values instanceof JavaSet ? (values as JavaSet<T>) : new JavaSet<T>(values);
    // snapshot first: this removes from the very set it is scanning
    const doomed = this.toArray().filter((value) => !keep.contains(value));
    for (const value of doomed) {
      this.remove(value);
    }
    return doomed.length > 0;
  }

  public clear(): void {
    this.#map.clear();
  }

  /** NOTE: a snapshot, in insertion order. */
  public toArray(): T[] {
    return [...this.#map.keys()];
  }

  public [Symbol.iterator](): IterableIterator<T> {
    return this.#map.keys();
  }

  public forEach(consumer: (value: T, set: JavaSet<T>) => void): void {
    for (const value of this.#map.keys()) {
      consumer(value, this);
    }
  }

  /** Java's `AbstractSet.equals`: same size, same members. Order plays no part. */
  public equals(other: any): boolean {
    return boilerplateEqualityCheck<JavaSet<T>>({ obj1: this, obj2: other }, (o1, o2) => {
      if (!(#map in o2) || o1.size() !== o2.size()) {
        return false;
      }
      return o1.containsAll(o2);
    });
  }

  /**
   * Java's `AbstractSet.hashCode`: the sum of the element hash codes, which is order-independent and so agrees
   * with {@link equals}.
   *
   * IMPORTANT: like {@link JavaMap.hashCode}, this moves as the set is modified.
   */
  public hashCode(): number {
    let hash = 0;
    for (const value of this.#map.keys()) {
      hash = (hash + hashCodeOf(value)) | 0;
    }
    return hash;
  }

  /** Java's `AbstractCollection.toString`: `[a, b, c]`. */
  public toString(): string {
    return `[${this.toArray().map((value) => String(value)).join(", ")}]`;
  }
}
