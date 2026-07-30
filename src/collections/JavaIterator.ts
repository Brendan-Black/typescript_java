import { ConcurrentModificationException } from "../exceptions/ConcurrentModificationException.js";
import { IllegalStateException } from "../exceptions/IllegalStateException.js";
import { NoSuchElementException } from "../exceptions/NoSuchElementException.js";
import { elementAt } from "../fundamentals/Indexing.js";

/**
 * Java's `Iterator`: a cursor the caller drives, rather than a generator the language drives for you.
 *
 * `for...of` on a collection uses the generator and cannot remove anything — the collection is fail-fast, so a
 * `remove` inside the loop throws {@link ConcurrentModificationException}. This is the other way round: ask for
 * the iterator, walk it yourself, and {@link remove} takes the element you are standing on out of the underlying
 * collection without upsetting the walk.
 *
 * ```ts
 * const it = list.iterator();
 * while (it.hasNext()) {
 *   if (it.next() === "b") {
 *     it.remove();
 *   }
 * }
 * ```
 *
 * That is exact in a way {@link JavaCollection.removeIf} is not: `remove` drops *this* element, where `removeIf`
 * removes by value and so cannot tell two `equals` elements apart. Reach for `removeIf` when the predicate is a
 * function of the value — it is shorter and says what it means — and for this when position matters.
 *
 * NOTE: also `Iterable`, which Java's `Iterator` is not. Everything in this library that accepts a sequence
 * accepts an `Iterable`, and having to wrap a half-consumed iterator to hand it on would be a needless step.
 * `for (const value of it)` picks up wherever the cursor already is.
 */
export interface JavaIterator<T> extends Iterable<T> {
  /** Whether {@link next} has anything left to return. */
  hasNext(): boolean;

  /**
   * @returns the next element
   * @throws {@link NoSuchElementException} if the iterator is exhausted
   * @throws {@link ConcurrentModificationException} if the collection was structurally modified by anything
   * other than this iterator
   */
  next(): T;

  /**
   * Removes the element last returned by {@link next} from the underlying collection.
   *
   * @throws {@link IllegalStateException} if {@link next} has not been called, or if `remove` has already been
   * called for the element it returned
   * @throws {@link UnsupportedOperationException} if the collection is unmodifiable
   */
  remove(): void;
}

/**
 * What a collection tells {@link iteratorOver} about itself.
 *
 * Internal plumbing: a collection builds one of these from its own storage, which is why the fields reach for
 * things — a `modCount` field, a positional removal — that are nobody else's business.
 */
export interface IterationSource<T> {
  /** the elements to walk, snapshotted by the caller when the iterator is created */
  elements: readonly T[];
  /** the collection's structural-modification count, read afresh on every check */
  modCount: () => number;
  /**
   * Removes the element the iterator has just returned. `position` is where that element now sits in the
   * collection, already adjusted for everything this iterator has removed ahead of it — which is what makes
   * removal exact for a list holding duplicates, where removing by value would drop the wrong one.
   */
  removeAt: (value: T, position: number) => void;
  /**
   * Refuses removal outright if the collection is unmodifiable. Runs before the call-order check, so a read-only
   * collection answers the question it was actually asked rather than first complaining that `next` has not been
   * called. Java's `Collections.unmodifiableCollection` iterator does the same.
   */
  beforeRemove?: () => void;
}

/**
 * Walks a snapshot taken when the iterator was made, and removes against the live collection.
 *
 * Snapshotting is what lets {@link remove} work at all: the collection's own iteration is fail-fast, so an
 * iterator reading through it would trip over the very removal it just performed. Watching `modCount` keeps the
 * fail-fast guarantee for everyone *else* — a change made behind this iterator's back still throws.
 */
class SnapshotIterator<T> implements JavaIterator<T> {
  readonly #source: IterationSource<T>;
  #expectedModCount: number;
  /** how far through {@link IterationSource.elements} we are */
  #cursor = 0;
  /** how many elements this iterator has removed, which is the offset between snapshot and live positions */
  #removed = 0;
  /** whether {@link next} has been called and its element not yet removed */
  #removable = false;

  constructor(source: IterationSource<T>) {
    this.#source = source;
    this.#expectedModCount = source.modCount();
  }

  public hasNext(): boolean {
    return this.#cursor < this.#source.elements.length;
  }

  public next(): T {
    this.#checkForComodification();
    if (!this.hasNext()) {
      throw new NoSuchElementException("The iterator has no more elements.");
    }
    const value = elementAt(this.#source.elements, this.#cursor, "JavaIterator.next");
    this.#cursor++;
    this.#removable = true;
    return value;
  }

  public remove(): void {
    this.#source.beforeRemove?.();
    if (!this.#removable) {
      throw new IllegalStateException("remove() must follow a call to next(), and may only be called once for it.");
    }
    this.#checkForComodification();
    const at = this.#cursor - 1;
    this.#source.removeAt(elementAt(this.#source.elements, at, "JavaIterator.remove"), at - this.#removed);
    this.#removed++;
    this.#removable = false;
    // our own removal is not a comodification, so adopt the count it produced rather than tripping on it
    this.#expectedModCount = this.#source.modCount();
  }

  public *[Symbol.iterator](): IterableIterator<T> {
    while (this.hasNext()) {
      yield this.next();
    }
  }

  #checkForComodification(): void {
    if (this.#source.modCount() !== this.#expectedModCount) {
      throw new ConcurrentModificationException("The collection was modified while it was being iterated.");
    }
  }
}

/**
 * The same cursor seen through a transform: a map's entry iterator becomes its key or value iterator, and
 * removing through either still removes the whole entry, as Java's views do.
 */
class MappedIterator<T, R> implements JavaIterator<R> {
  readonly #source: JavaIterator<T>;
  readonly #transform: (value: T) => R;
  readonly #beforeRemove: (() => void) | undefined;

  constructor(source: JavaIterator<T>, transform: (value: T) => R, beforeRemove: (() => void) | undefined) {
    this.#source = source;
    this.#transform = transform;
    this.#beforeRemove = beforeRemove;
  }

  public hasNext(): boolean {
    return this.#source.hasNext();
  }

  public next(): R {
    return this.#transform(this.#source.next());
  }

  public remove(): void {
    // before delegating, for the same reason `IterationSource.beforeRemove` runs first
    this.#beforeRemove?.();
    this.#source.remove();
  }

  public *[Symbol.iterator](): IterableIterator<R> {
    while (this.hasNext()) {
      yield this.next();
    }
  }
}

/** Builds the iterator a collection hands out from {@link JavaCollection.iterator}. */
export function iteratorOver<T>(source: IterationSource<T>): JavaIterator<T> {
  return new SnapshotIterator<T>(source);
}

/**
 * Re-reads an existing iterator's elements through `transform`, leaving removal to it.
 *
 * @param beforeRemove runs before the underlying `remove`, for a collection that is unmodifiable in its own
 * right while the storage behind it is not — an unmodifiable set over a perfectly mutable map, say
 */
export function mapIterator<T, R>(
  source: JavaIterator<T>,
  transform: (value: T) => R,
  beforeRemove?: () => void,
): JavaIterator<R> {
  return new MappedIterator<T, R>(source, transform, beforeRemove);
}
