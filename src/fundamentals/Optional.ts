import { IllegalArgumentException } from "../exceptions/IllegalArgumentException.js";
import { IllegalStateException } from "../exceptions/IllegalStateException.js";
import { TSJavaException } from "../exceptions/TSJavaException.js";
import { hashCodeOf } from "./Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "./Object.js";

export class Optional<T> extends JavaObject {
  #value: T | null;

  /**
   * Java's `Optional.empty()` is a singleton, and so is this. Built lazily rather than in a static field
   * initialiser, which would run while the class binding is still in its temporal dead zone.
   */
  static #EMPTY: Optional<any> | undefined;

  /**
   * @param value your value!
   * @param internalArgs required, which is what keeps the factories the only way in. It previously defaulted to
   * undefined and the constructor scolded you on the console for omitting it — a check that could never fire,
   * since the constructor is private and TypeScript already rejects the call.
   */
  private constructor(value: T | null | undefined, internalArgs: { nullable: boolean; message?: string }) {
    super();
    // Java has no concept of `undefined`; null is the only absence Optional models, so the two fold together.
    const normalized = value === undefined ? null : value;
    if (normalized === null && !internalArgs.nullable) {
      throw new IllegalArgumentException(internalArgs.message ?? "Value cannot be null.");
    }
    this.#value = normalized;
  }

  /**
   * Constructs an Optional with a non-null value.
   * @param value
   * @returns
   */
  public static of<T>(value: T): Optional<T> {
    return new Optional<T>(value, { nullable: false });
  }

  /**
   * Constructs an Optional that can be null.
   * @param value
   * @returns
   */
  public static ofNullable<T>(value: T | null | undefined): Optional<T> {
    // Java's `ofNullable` returns `empty()` for null rather than a fresh instance, so this does too.
    return value === null || value === undefined ? Optional.empty<T>() : new Optional<T>(value, { nullable: true });
  }

  /**
   * The empty Optional. Java's `Optional.empty()`.
   *
   * Every call returns the same instance — the value is null regardless of `T`, so there is nothing for
   * separate instances to distinguish. That makes `Optional.empty() === Optional.empty()` true, which is
   * incidental; compare with {@link equals}, not `===`.
   */
  public static empty<T>(): Optional<T> {
    Optional.#EMPTY ??= new Optional<any>(null, { nullable: true });
    return Optional.#EMPTY as Optional<T>;
  }

  /**
   * uses the callback provided if the value is present.
   * @param callback
   */
  public ifPresent(consumer: (value: T) => void): void {
    if (this.#value !== null) {
      consumer(this.#value!);
    }
  }

  /**
   * executes the provided consumer if the value is present, otherwise executes the other function.
   * @param consumer
   * @param other
   */
  public ifPresentOrElse(consumer: (value: T) => void, other: () => void): void {
    if (this.#value !== null) {
      consumer(this.#value as T);
    } else {
      other();
    }
  }

  /**
   * used to convert the internal optional value to a different type.
   *
   * If the mapper returns null (or undefined), the result is an empty Optional rather than an error — matching
   * Java, where `map` is null-safe. The return type stays `Optional<U>`: letting null back into the type
   * parameter would just reintroduce the problem Optional exists to solve.
   * @param mapper
   */
  public map<U>(mapper: (value: T) => U | null | undefined): Optional<U> {
    if (this.#value === null) {
      return Optional.empty<U>();
    }
    return Optional.ofNullable<U>(mapper(this.#value));
  }

  /**
   * used to convert the internal optional value to a different type where the mapper itself returns an Optional,
   * yielding a single-layer result rather than an `Optional<Optional<U>>`.
   *
   * The mapper's Optional is returned as-is, empty or not. It is never unwrapped a second time: in Java the
   * mapper's type is `T -> Optional<U>`, so a nested Optional means the caller has a bug worth surfacing, not
   * something to silently flatten.
   * @param mapper
   */
  public flatMap<U>(mapper: (value: T) => Optional<U>): Optional<U> {
    if (this.#value === null) {
      return Optional.empty<U>();
    }
    const result = mapper(this.#value);
    if (!(result instanceof Optional)) {
      throw new IllegalArgumentException("The mapper passed to flatMap must return an Optional.");
    }
    return result;
  }

  /**
   * determines if the value is present and matches the predicate.
   * @param predicate
   */
  public filter(predicate: (value: T) => boolean): Optional<T> {
    if (this.#value === null || !predicate(this.#value as T)) {
      return Optional.empty<T>();
    }
    return this;
  }

  /**
   * Java's `Optional.or`: this Optional if it holds a value, otherwise whatever the supplier produces.
   *
   * The difference from {@link orElseGet} is what comes back — that one unwraps to a bare value, this one stays
   * an Optional, so a chain of fallbacks can each legitimately come up empty.
   *
   * @param supplier called only when this Optional is empty; must return an Optional
   * @throws {@link IllegalArgumentException} if the supplier returns something that is not an Optional
   */
  public or(supplier: () => Optional<T>): Optional<T> {
    if (this.#value !== null) {
      return this;
    }
    const result = supplier();
    if (!(result instanceof Optional)) {
      throw new IllegalArgumentException("The supplier passed to or must return an Optional.");
    }
    return result;
  }

  /**
   * Java's `Optional.stream()`: a sequence of either one element or none.
   *
   * There is no Stream type here, so this yields an iterator — the JavaScript equivalent, and the thing that
   * actually composes with the language. The point is the same one Java's makes: it turns a pile of Optionals
   * into a flat sequence of the values that were actually there.
   *
   * ```ts
   * const found = [maybeA, maybeB, maybeC].flatMap((o) => [...o]);
   * ```
   */
  public *stream(): IterableIterator<T> {
    if (this.#value !== null) {
      yield this.#value;
    }
  }

  /** Makes an Optional spreadable and usable in `for...of`, yielding either one value or none. See {@link stream}. */
  public [Symbol.iterator](): IterableIterator<T> {
    return this.stream();
  }

  /**
   * equality is defined as the contained value being equal to the other value.
   * @param other
   * @returns
   */

  public override equals(other: any): boolean {
    return boilerplateEqualityCheck<Optional<T>>({ obj1: this, obj2: other }, (o1, o2) => {
      // `Object.create(Optional.prototype)` passes the class check but carries no private state, and reading
      // `#value` off it would throw a TypeError. Java's contract says equals returns false for anything it
      // does not recognise, never throws, so brand-check before touching the field.
      if (!(#value in o2)) {
        return false;
      }
      return o1.#value === o2.#value;
    });
  }

  /**
   * Java's `Optional.hashCode()` is `Objects.hashCode(value)` — the contained value's hash, or 0 when empty.
   *
   * This has to override {@link JavaObject.hashCode}, which is identity-based. `equals` here compares the
   * contained value, so leaving the inherited identity hash in place would mean two equal Optionals with
   * different hash codes: a broken contract, and an Optional that could never be found again once used as a
   * `JavaMap` key.
   */
  public override hashCode(): number {
    return hashCodeOf(this.#value);
  }

  public override toString(): string {
    return `Optional[${this.#value === null ? "null" : this.#value}, typeof=${typeof this.#value}, hashcode=${this.hashCode()}]`;
  }

  /**
   * Checks if a value is present.
   * @returns {boolean} true if a value is present, false otherwise.
   */
  public isPresent(): boolean {
    return this.#value !== null;
  }

  /**
   * Java's `Optional.isEmpty()`, added in Java 11. The inverse of {@link isPresent}, and worth having for the
   * same reason Java added it: `if (!o.isPresent())` reads as a double negative at a glance.
   */
  public isEmpty(): boolean {
    return this.#value === null;
  }

  /**
   * Gets the value if not null, otherwise throws an error.
   * @returns the value if present, throws  {@link IllegalStateException} otherwise.
   */
  public get(): T {
    if (this.#value === null) {
      throw new IllegalStateException("No value present");
    }
    return this.#value as T;
  }

  /**
   * Gets the value if present, otherwise returns the provided value.
   * @param other the value to return if no value is present.
   */
  public orElse(other: T): T {
    if (this.#value !== null) {
      return this.#value;
    } else {
      return other;
    }
  }

  /**
   * Gets the value if present, otherwise calls the provided function to get a value.
   *
   * Useful for lazy evaluation.
   * @param other a function that returns a value to return if no value is present.
   */
  public orElseGet(other: () => T): T {
    if (this.#value !== null) {
      return this.#value;
    } else {
      return other();
    }
  }
  /**
   * This returns the value if present, otherwise throws an error.
   *
   * Exceptional for offensive programming.
   * @param errorSupplier a function that returns an error to throw if no value is present.
   */
  public orElseThrow<E extends TSJavaException>(errorSupplier?: () => E): T {
    if (this.#value !== null) {
      return this.#value as T;
    } else if (errorSupplier) {
      throw errorSupplier();
    } else {
      throw new IllegalStateException("No value present");
    }
  }

}
