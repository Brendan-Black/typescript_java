import { IllegalArgumentException } from "../exceptions/IllegalArgumentException.js";
import { IllegalStateException } from "../exceptions/IllegalStateException.js";
import { TSJavaException } from "../exceptions/TSJavaException.js";
import { boilerplateEqualityCheck, JavaObject } from "./Object.js";

export class Optional<T> extends JavaObject {
  #value: T | null;

  /**
   *
   * @param value your value!
   */
  constructor(value: T | null | undefined, internalArgs?: { nullable: boolean; mssg?: string }) {
    super();
    if (value === undefined) {
      console.warn("undefined value passed to Optional, treating it as null");
      value = null; // Java does not have a concept of "undefined" in the same way JavaScript does, so we treat it as null.
    }
    !internalArgs &&
      console.error(
        "you should not use this constructor directly, JavaScript demands for it to exist, but to properly mimic Java, please use `Optional.of(value)` or `Optional.ofNullable(value)` instead"
      );
    if (value === null && !internalArgs?.nullable) {
      throw new IllegalArgumentException(internalArgs?.mssg ? internalArgs.mssg : "Value cannot be null.");
    }
    this.#value = value;
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
  public static ofNullable<T>(value: T | null): Optional<T> {
    return new Optional<T>(value, { nullable: true });
  }

  /**
   * Constructs an Optional that requires a non-null value.
   * Throws an error if the value is null.
   * This is similar to `Optional.of(value)` but allows for a custom message.
   * @param value
   * @param mssg
   * @returns
   */
  public static requireNonNull(value: any | null, mssg?: string): Optional<typeof value> {
    return new Optional<typeof value>(value, { nullable: false, mssg });
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
      return Optional.ofNullable<U>(null);
    }
    return Optional.ofNullable<U>(mapper(this.#value) ?? null);
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
      return Optional.ofNullable<U>(null);
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
      return Optional.ofNullable<T>(null);
    }
    return this;
  }
  /**
   * equality is defined as the contained value being equal to the other value.
   * @param other
   * @returns
   */

  public equals(other: any): boolean {
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

  public toString(): string {
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
