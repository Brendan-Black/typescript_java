import { ConcurrentModificationException } from "../exceptions/ConcurrentModificationException.js";
import { IndexOutOfBoundsException } from "../exceptions/IndexOutOfBoundsException.js";
import { equalsOf, hashCodeOf } from "../fundamentals/Hashing.js";
import { elementAt } from "../fundamentals/Indexing.js";
import { JavaObject } from "../fundamentals/Object.js";
import { Optional } from "../fundamentals/Optional.js";
import { JavaCollection, unsupported } from "./JavaCollection.js";

/**
 * The mutable innards, held behind one reference so an unmodifiable view can share them and stay live.
 * See {@link JavaList.unmodifiable}.
 */
interface ListState<T> {
  items: T[];
  /** bumped on every structural change, so iterators can fail fast — see {@link ConcurrentModificationException} */
  modCount: number;
}

/**
 * Java's `ArrayList`: an ordered collection, addressed by index, that compares its contents with `equals`.
 *
 * A JavaScript array already does most of this. What it does not do is use `equals` — `[p1].includes(p2)` is
 * false for two structurally equal objects, and `indexOf` has the same blind spot. It also does not complain
 * about `list[99]` on a three-element list; it hands back `undefined`, which then travels a long way before
 * anyone notices. This throws {@link IndexOutOfBoundsException} at the mistake instead.
 *
 * NOTE: Java distinguishes `remove(int)` from `remove(Object)` by overload. TypeScript cannot — the two
 * collapse the moment `T` is `number` — so removal by position is {@link removeAt} and removal by value is
 * {@link remove}. Same split for {@link addAt} and {@link add}.
 */
export class JavaList<T> extends JavaCollection<T> {
  #state: ListState<T>;
  #readOnly = false;

  /**
   * @param values initial contents, in order. Accepts anything iterable — an array, another JavaList, a
   * JavaSet, a plain JavaScript Set.
   */
  constructor(values?: Iterable<T>) {
    super();
    this.#state = { items: values === undefined ? [] : [...values], modCount: 0 };
  }

  /**
   * Java 9's `List.of(...)`: an immutable list, refusing every mutator.
   *
   * A frozen copy rather than a view — the arguments are values, so there is nothing to stay live against.
   */
  public static of<T>(...values: readonly T[]): JavaList<T> {
    const list = new JavaList<T>(values);
    list.#readOnly = true;
    return list;
  }

  /**
   * Java's `Collections.unmodifiableList`: a read-only *view*, not a copy.
   *
   * The view shares the original's storage, so later changes to the original show through. That is Java's
   * behaviour and the usual source of surprise with it: handing out an unmodifiable view protects you from
   * your caller, not your caller from you.
   */
  public static unmodifiable<T>(list: JavaList<T>): JavaList<T> {
    const view = new JavaList<T>();
    view.#state = list.#state;
    view.#readOnly = true;
    return view;
  }

  #requireMutable(operation: string): void {
    if (this.#readOnly) {
      unsupported(operation, "this list is unmodifiable");
    }
  }

  /** Java's bounds check for reads: `0 <= index < size`. */
  #requireInRange(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.#state.items.length) {
      throw new IndexOutOfBoundsException(`Index ${index} out of bounds for length ${this.#state.items.length}`);
    }
  }

  public size(): number {
    return this.#state.items.length;
  }

  /**
   * @throws {@link IndexOutOfBoundsException} if the index is negative, fractional, or at or past the end
   */
  public get(index: number): T {
    this.#requireInRange(index);
    return elementAt(this.#state.items, index, "JavaList.get");
  }

  /** The bounds-checked read as an Optional, for when an absent index is an ordinary outcome rather than a bug. */
  public find(index: number): Optional<T> {
    if (!Number.isInteger(index) || index < 0 || index >= this.#state.items.length) {
      return Optional.empty<T>();
    }
    return Optional.ofNullable<T>(this.#state.items[index]);
  }

  /**
   * @returns the element previously at that index
   * @throws {@link IndexOutOfBoundsException} if the index is out of range
   */
  public set(index: number, value: T): T {
    this.#requireMutable("set");
    this.#requireInRange(index);
    const previous = elementAt(this.#state.items, index, "JavaList.set");
    // not a structural change, so modCount is deliberately left alone — Java treats replacement the same way
    this.#state.items[index] = value;
    return previous;
  }

  /** Appends. Always returns true, which is Java's contract for a list rather than a claim worth checking. */
  public add(value: T): boolean {
    this.#requireMutable("add");
    this.#state.items.push(value);
    this.#state.modCount++;
    return true;
  }

  /**
   * Inserts at a position, shifting everything after it right.
   * @throws {@link IndexOutOfBoundsException} unless `0 <= index <= size` — inserting *at* the end is allowed
   */
  public addAt(index: number, value: T): void {
    this.#requireMutable("addAt");
    if (!Number.isInteger(index) || index < 0 || index > this.#state.items.length) {
      throw new IndexOutOfBoundsException(`Index ${index} out of bounds for length ${this.#state.items.length}`);
    }
    this.#state.items.splice(index, 0, value);
    this.#state.modCount++;
  }

  /**
   * Removes by position.
   * @returns the element that was removed
   * @throws {@link IndexOutOfBoundsException} if the index is out of range
   */
  public removeAt(index: number): T {
    this.#requireMutable("removeAt");
    this.#requireInRange(index);
    this.#state.modCount++;
    return elementAt(this.#state.items.splice(index, 1), 0, "JavaList.removeAt");
  }

  /**
   * Removes the first element equal to the argument.
   * @returns whether the list changed
   */
  public remove(value: T): boolean {
    this.#requireMutable("remove");
    const index = this.indexOf(value);
    if (index < 0) {
      return false;
    }
    this.#state.items.splice(index, 1);
    this.#state.modCount++;
    return true;
  }

  public clear(): void {
    this.#requireMutable("clear");
    if (this.#state.items.length > 0) {
      this.#state.items.length = 0;
      this.#state.modCount++;
    }
  }

  /** @returns the first index holding an equal element, or -1. Uses `equals`, unlike `Array.indexOf`. */
  public indexOf(value: T): number {
    for (let i = 0; i < this.#state.items.length; i++) {
      // query first, as Java's `indexOf` does
      if (equalsOf(value, this.#state.items[i])) {
        return i;
      }
    }
    return -1;
  }

  /** @returns the last index holding an equal element, or -1. */
  public lastIndexOf(value: T): number {
    for (let i = this.#state.items.length - 1; i >= 0; i--) {
      if (equalsOf(value, this.#state.items[i])) {
        return i;
      }
    }
    return -1;
  }

  public contains(value: T): boolean {
    return this.indexOf(value) >= 0;
  }

  /**
   * Java's `List.subList`, as a copy rather than a view — a live sublist has to track index shifts in its
   * parent, and Java's own documentation spends a paragraph on the ways that goes wrong.
   *
   * @param from inclusive
   * @param to exclusive, defaulting to the end
   */
  public subList(from: number, to: number = this.#state.items.length): JavaList<T> {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > this.#state.items.length || from > to) {
      throw new IndexOutOfBoundsException(`Range [${from}, ${to}) out of bounds for length ${this.#state.items.length}`);
    }
    return new JavaList<T>(this.#state.items.slice(from, to));
  }

  /** Sorts in place. Unlike `Array.sort`, there is no default comparator — sorting by stringified value is a trap. */
  public sort(comparator: (a: T, b: T) => number): void {
    this.#requireMutable("sort");
    this.#state.items.sort(comparator);
    this.#state.modCount++;
  }

  public replaceAll(operator: (value: T, index: number) => T): void {
    this.#requireMutable("replaceAll");
    for (let i = 0; i < this.#state.items.length; i++) {
      this.#state.items[i] = operator(elementAt(this.#state.items, i, "JavaList.replaceAll"), i);
    }
  }

  /**
   * Fail-fast, as Java's is: structurally modifying the list mid-iteration throws rather than silently
   * skipping elements. Replacing an element via {@link set} is not structural and will not trip it.
   */
  public *[Symbol.iterator](): IterableIterator<T> {
    const expected = this.#state.modCount;
    for (let i = 0; i < this.#state.items.length; i++) {
      if (this.#state.modCount !== expected) {
        throw new ConcurrentModificationException("The list was modified while it was being iterated.");
      }
      yield elementAt(this.#state.items, i, "JavaList iterator");
    }
  }

  /**
   * Java's `AbstractList.equals`: same length, equal elements, in the same order. Order matters here and does
   * not for a set, which is the whole difference between the two.
   */
  public override equals(other: unknown): boolean {
    if (this === other) {
      return true;
    }
    if (!JavaObject.isInstance(other) || !(other instanceof JavaList)) {
      return false;
    }
    const otherList = other as JavaList<T>;
    if (this.size() !== otherList.size()) {
      return false;
    }
    for (let i = 0; i < this.#state.items.length; i++) {
      if (!equalsOf(this.#state.items[i], otherList.#state.items[i])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Java's `AbstractList.hashCode`. Order-sensitive, matching {@link equals} — the multiply-and-add means
   * moving an element changes the result, which summing (as a set does) would not.
   */
  public override hashCode(): number {
    let hash = 1;
    for (const value of this.#state.items) {
      hash = (Math.imul(31, hash) + hashCodeOf(value)) | 0;
    }
    return hash;
  }
}
