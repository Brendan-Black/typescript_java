import { JavaAbstractSet, unsupported } from "./JavaCollection.js";
import { type JavaIterator, mapIterator } from "./JavaIterator.js";
import { JavaMap } from "./JavaMap.js";

/**
 * Java's `HashSet`, keyed on `hashCode()` and `equals()` rather than on reference identity.
 *
 * Where JavaScript's `Set` would hold two structurally equal objects as two separate members, this holds one.
 * Everything said about keys in {@link JavaMap} applies here to elements — including the warning that an
 * `equals` override without a matching `hashCode` override will lose the element.
 *
 * Backed by a {@link JavaMap}, exactly as Java's `HashSet` is backed by a `HashMap`, so iteration is likewise
 * in insertion order and likewise fail-fast.
 *
 * The bulk operations, `toArray`, `forEach`, `toString`, `equals` and `hashCode` all come from
 * {@link JavaAbstractSet}; only the six primitives are implemented here.
 */
export class JavaSet<T> extends JavaAbstractSet<T> {
  /** the value is a placeholder; only the key carries meaning, as in Java's `HashSet.PRESENT` */
  #map: JavaMap<T, boolean>;
  #readOnly = false;

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

  /**
   * Java 9's `Set.of(...)`: an immutable set, refusing every mutator.
   *
   * A frozen copy rather than a view. Java's `Set.of` additionally rejects duplicate arguments outright; this
   * follows the constructor instead and collapses them, which is the less surprising of the two.
   */
  public static of<T>(...values: readonly T[]): JavaSet<T> {
    const set = new JavaSet<T>(values);
    set.#readOnly = true;
    return set;
  }

  /**
   * Java's `Collections.unmodifiableSet`: a read-only *view*, not a copy.
   *
   * The view shares the original's storage, so later changes to the original show through — see
   * {@link JavaMap.unmodifiable} for why that is worth knowing before you hand one out.
   */
  public static unmodifiable<T>(set: JavaSet<T>): JavaSet<T> {
    const view = new JavaSet<T>();
    view.#map = set.#map;
    view.#readOnly = true;
    return view;
  }

  #requireMutable(operation: string): void {
    if (this.#readOnly) {
      unsupported(operation, "this set is unmodifiable");
    }
  }

  public size(): number {
    return this.#map.size();
  }

  public contains(value: T): boolean {
    return this.#map.containsKey(value);
  }

  /**
   * @returns `true` if the set changed — i.e. if no equal element was already present. Java's return value, and
   * the reason `add` is worth calling for its result rather than just its effect.
   */
  public add(value: T): boolean {
    this.#requireMutable("add");
    return this.#map.put(value, true) === null;
  }

  /** @returns `true` if an equal element was present and has been removed. */
  public remove(value: T): boolean {
    this.#requireMutable("remove");
    return this.#map.remove(value) !== null;
  }

  public clear(): void {
    this.#requireMutable("clear");
    this.#map.clear();
  }

  /**
   * Overrides {@link JavaAbstractSet.retainAll}, which is O(n*m) because it can only scan its argument. Hashing
   * the argument once makes this O(n+m), and hashing is the one thing this class is already good at.
   */
  public override retainAll(values: Iterable<T>): boolean {
    this.#requireMutable("retainAll");
    const keep = values instanceof JavaSet ? (values as JavaSet<T>) : new JavaSet<T>(values);
    // snapshot first: this removes from the very set it is scanning
    const doomed = this.toArray().filter((value) => !keep.contains(value));
    for (const value of doomed) {
      this.remove(value);
    }
    return doomed.length > 0;
  }

  public [Symbol.iterator](): IterableIterator<T> {
    return this.#map.keys();
  }

  /**
   * The backing map's cursor, read as keys. The read-only check has to be made here rather than left to the map:
   * {@link of} marks this set unmodifiable without touching the map underneath it, which is free to be shared
   * with something mutable.
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
