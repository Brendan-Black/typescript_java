import { UnsupportedOperationException } from "../exceptions/UnsupportedOperationException.js";
import { equalsOf, hashCodeOf } from "../fundamentals/Hashing.js";
import { JavaObject } from "../fundamentals/Object.js";
import type { Serializable } from "../serialization/Serializable.js";

/**
 * Java's `AbstractCollection`: everything a collection can do once it can report its size, answer `contains`,
 * add, remove, clear, and hand out an iterator.
 *
 * Subclasses implement those six; the bulk operations, `toArray`, `forEach` and `toString` come for free, and
 * are written against the abstract methods so they stay correct however the subclass stores things.
 *
 * NOTE: the bulk operations snapshot their argument before touching this collection. That makes
 * `a.removeAll(a)` and `a.addAll(a)` well-defined rather than a fail-fast iterator tripping over itself.
 */
export abstract class JavaCollection<T> extends JavaObject implements Iterable<T>, Serializable {
  public abstract size(): number;

  public abstract contains(value: T): boolean;

  /** @returns whether the collection changed as a result */
  public abstract add(value: T): boolean;

  /** @returns whether an equal element was present and has been removed */
  public abstract remove(value: T): boolean;

  public abstract clear(): void;

  public abstract [Symbol.iterator](): IterableIterator<T>;

  public isEmpty(): boolean {
    return this.size() === 0;
  }

  public containsAll(values: Iterable<T>): boolean {
    for (const value of values) {
      if (!this.contains(value)) {
        return false;
      }
    }
    return true;
  }

  /** @returns whether the collection changed as a result of any of the additions */
  public addAll(values: Iterable<T>): boolean {
    let changed = false;
    for (const value of [...values]) {
      // deliberately not `changed = changed || this.add(value)`: `||` short-circuits, so once one add succeeded
      // the rest would never run.
      if (this.add(value)) {
        changed = true;
      }
    }
    return changed;
  }

  /** @returns whether the collection changed */
  public removeAll(values: Iterable<T>): boolean {
    let changed = false;
    for (const value of [...values]) {
      if (this.remove(value)) {
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Drops every element not present in `values`, leaving the intersection.
   *
   * O(n*m), as Java's `AbstractCollection.retainAll` is — the argument is only an Iterable, so there is nothing
   * better than a scan to ask it about membership. Subclasses that can do better should override.
   *
   * @returns whether the collection changed
   */
  public retainAll(values: Iterable<T>): boolean {
    const keep = [...values];
    // query first, as `AbstractCollection.contains` does — the element under test is ours, not theirs
    const doomed = this.toArray().filter((value) => !keep.some((candidate) => equalsOf(value, candidate)));
    for (const value of doomed) {
      this.remove(value);
    }
    return doomed.length > 0;
  }

  /** NOTE: a snapshot, in iteration order. */
  public toArray(): T[] {
    return [...this];
  }

  public forEach(consumer: (value: T, collection: this) => void): void {
    for (const value of this) {
      consumer(value, this);
    }
  }

  /** Java's `AbstractCollection.toString`: `[a, b, c]`. */
  public override toString(): string {
    return `[${this.toArray().map((value) => String(value)).join(", ")}]`;
  }

  /** Serialises as a JSON array, so `JSON.stringify` produces something a caller would expect. */
  public toJSON(): unknown {
    return this.toArray();
  }
}

/**
 * The mutator refusal used by unmodifiable collections and by views that structurally cannot support an
 * operation — `keySet().add(k)` has no value to map the key to, so there is nothing sensible to do.
 */
export function unsupported(operation: string, reason: string): never {
  throw new UnsupportedOperationException(`${operation} is not supported: ${reason}`);
}

/**
 * Java's `AbstractSet`: a {@link JavaCollection} whose `equals` and `hashCode` are defined by its membership.
 *
 * Both are order-independent, which is what makes them agree with each other: summing element hashes gives the
 * same total whatever order the elements arrive in.
 *
 * `equals` compares against any other set, not just the same class — Java's is written against the `Set`
 * interface, and here that means anything descending from this class. A hash set and a map's `keySet()` view
 * holding the same members are equal, as they should be.
 */
export abstract class JavaAbstractSet<T> extends JavaCollection<T> {
  public override equals(other: any): boolean {
    if (this === other) {
      return true;
    }
    // isInstance, not instanceof: a prototype-only forgery would pass the latter and then throw a TypeError out
    // of the first method call below, and equals is required to answer rather than blow up.
    if (!JavaObject.isInstance(other) || !(other instanceof JavaAbstractSet)) {
      return false;
    }
    const otherSet = other as JavaAbstractSet<T>;
    if (this.size() !== otherSet.size()) {
      return false;
    }
    return this.containsAll(otherSet);
  }

  /** Java's `AbstractSet.hashCode`: the sum of the element hash codes. */
  public override hashCode(): number {
    let hash = 0;
    for (const value of this) {
      hash = (hash + hashCodeOf(value)) | 0;
    }
    return hash;
  }
}
