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
 * Java's `ListIterator`: a cursor that also goes backwards, reports where it is, and can write.
 *
 * The cursor sits *between* elements rather than on one, which is what makes {@link nextIndex} and
 * {@link previousIndex} the two halves of one position and why the same element comes back from a {@link next}
 * followed by a {@link previous}. Starting at index `i` means the next {@link next} returns element `i` and the
 * next {@link previous} returns element `i - 1`.
 *
 * ```ts
 * const it = list.listIterator(list.size());
 * while (it.hasPrevious()) {
 *   const value = it.previous();  // walking back to front
 *   if (value === "b") {
 *     it.set("B");                // in place, without disturbing the walk
 *   }
 * }
 * ```
 */
export interface JavaListIterator<T> extends JavaIterator<T> {
  /** Whether {@link previous} has anything left to return. */
  hasPrevious(): boolean;

  /**
   * @returns the element before the cursor, moving the cursor back over it
   * @throws {@link NoSuchElementException} if the cursor is at the start
   */
  previous(): T;

  /** The index {@link next} would return, which is the size of the list once the cursor is past the end. */
  nextIndex(): number;

  /** The index {@link previous} would return, which is `-1` when the cursor is at the start. */
  previousIndex(): number;

  /**
   * Replaces the element last returned by {@link next} or {@link previous}.
   *
   * Not a structural change, so it disturbs neither this cursor nor any other iterator over the same list, and
   * may be called more than once for the same element.
   *
   * @throws {@link IllegalStateException} if neither `next` nor `previous` has been called, or if {@link add} or
   * {@link remove} has been called since
   * @throws {@link UnsupportedOperationException} if the list is unmodifiable
   */
  set(value: T): void;

  /**
   * Inserts an element at the cursor, leaving the cursor after it.
   *
   * A following {@link next} is unaffected, and a following {@link previous} returns what was just added. Both
   * {@link remove} and {@link set} then need a fresh `next` or `previous` before they will work again — an
   * inserted element is not one the cursor has *returned*.
   *
   * @throws {@link UnsupportedOperationException} if the list is unmodifiable
   */
  add(value: T): void;
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

/**
 * What a list tells {@link listIteratorOver} about itself.
 *
 * Everything here is addressed by index, because a list iterator moves in both directions and writes at
 * positions — there is nothing a snapshot could do for it. Internal plumbing, like {@link IterationSource}.
 */
export interface ListIterationSource<T> {
  size: () => number;
  get: (index: number) => T;
  /** replaces in place, which is not a structural change and must not touch the modification count */
  replace: (index: number, value: T) => void;
  insert: (index: number, value: T) => void;
  removeAt: (index: number) => void;
  /** the list's structural-modification count, read afresh on every check */
  modCount: () => number;
  /** refuses the write outright if the list is unmodifiable, before the call-order check — see {@link IterationSource.beforeRemove} */
  beforeMutate?: (operation: "remove" | "set" | "add") => void;
}

/**
 * Walks the list itself rather than a snapshot of it, which is what lets {@link add} take effect mid-walk and
 * what keeps {@link previous} honest after a write.
 *
 * That is safe here — and not in {@link SnapshotIterator} — because a list is addressed by index. This cursor is
 * a pair of indices into live storage, so it can put itself back where it belongs after each of its own writes;
 * it cannot for a collection whose position is not a number.
 */
class LiveListIterator<T> implements JavaListIterator<T> {
  readonly #source: ListIterationSource<T>;
  /** sits between elements: the index {@link next} would return, and one past the one {@link previous} would */
  #cursor: number;
  /** where the element last returned now lives, or `-1` when there is nothing to write over */
  #lastReturned = -1;
  #expectedModCount: number;

  constructor(source: ListIterationSource<T>, index: number) {
    this.#source = source;
    this.#cursor = index;
    this.#expectedModCount = source.modCount();
  }

  public hasNext(): boolean {
    return this.#cursor < this.#source.size();
  }

  public next(): T {
    this.#checkForComodification();
    if (!this.hasNext()) {
      throw new NoSuchElementException("The iterator is at the end of the list.");
    }
    this.#lastReturned = this.#cursor;
    this.#cursor++;
    return this.#source.get(this.#lastReturned);
  }

  public hasPrevious(): boolean {
    return this.#cursor > 0;
  }

  public previous(): T {
    this.#checkForComodification();
    if (!this.hasPrevious()) {
      throw new NoSuchElementException("The iterator is at the start of the list.");
    }
    this.#cursor--;
    this.#lastReturned = this.#cursor;
    return this.#source.get(this.#lastReturned);
  }

  public nextIndex(): number {
    return this.#cursor;
  }

  public previousIndex(): number {
    return this.#cursor - 1;
  }

  public remove(): void {
    this.#source.beforeMutate?.("remove");
    this.#requireReturnedElement("remove");
    this.#checkForComodification();
    this.#source.removeAt(this.#lastReturned);
    // walking forwards the cursor sits after what was removed and has to come back a place; walking backwards it
    // sits on it already, and everything behind shifts down to meet it
    if (this.#lastReturned < this.#cursor) {
      this.#cursor--;
    }
    this.#lastReturned = -1;
    this.#expectedModCount = this.#source.modCount();
  }

  public set(value: T): void {
    this.#source.beforeMutate?.("set");
    this.#requireReturnedElement("set");
    this.#checkForComodification();
    // no modCount to adopt afterwards: replacement is not structural, so nothing else is disturbed either
    this.#source.replace(this.#lastReturned, value);
  }

  public add(value: T): void {
    this.#source.beforeMutate?.("add");
    this.#checkForComodification();
    this.#source.insert(this.#cursor, value);
    this.#cursor++;
    this.#lastReturned = -1;
    this.#expectedModCount = this.#source.modCount();
  }

  public *[Symbol.iterator](): IterableIterator<T> {
    while (this.hasNext()) {
      yield this.next();
    }
  }

  #requireReturnedElement(operation: string): void {
    if (this.#lastReturned < 0) {
      throw new IllegalStateException(
        `${operation}() must follow a call to next() or previous(), with no add() or remove() in between.`,
      );
    }
  }

  #checkForComodification(): void {
    if (this.#source.modCount() !== this.#expectedModCount) {
      throw new ConcurrentModificationException("The list was modified while it was being iterated.");
    }
  }
}

/** Builds the iterator a collection hands out from {@link JavaCollection.iterator}. */
export function iteratorOver<T>(source: IterationSource<T>): JavaIterator<T> {
  return new SnapshotIterator<T>(source);
}

/**
 * Builds the cursor a list hands out from `listIterator`.
 *
 * @param index where the cursor starts, between elements. The caller is expected to have bounds-checked it.
 */
export function listIteratorOver<T>(source: ListIterationSource<T>, index: number): JavaListIterator<T> {
  return new LiveListIterator<T>(source, index);
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
