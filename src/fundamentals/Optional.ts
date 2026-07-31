import { IllegalArgumentException } from "../exceptions/IllegalArgumentException.js";
import { NoSuchElementException } from "../exceptions/NoSuchElementException.js";
import { NullPointerException } from "../exceptions/NullPointerException.js";
import type { Serializable } from "../serialization/Serializable.js";
import { hashCodeOf } from "./Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "./Object.js";

export class Optional<T> extends JavaObject implements Serializable {
  #value: T | null;

  /**
   * Java's `Optional.empty()` is a singleton, and so is this. Built lazily rather than in a static field
   * initialiser, which would run while the class binding is still in its temporal dead zone.
   *
   * `never` rather than `any` as the element type: an empty Optional holds nothing, so there is no value whose
   * type it could be. That is not pedantry — `Optional<any>` would let the singleton be handed out as any
   * `Optional<T>` *and* would erase the caller's type on the way through, whereas `never` makes the widening
   * cast in {@link empty} the one place the conversion happens.
   */
  static #EMPTY: Optional<never> | undefined;

  /**
   * @param value your value!
   * @param internalArgs required rather than defaulted, which is what keeps the factories the only way in.
   */
  private constructor(value: T | null | undefined, internalArgs: { nullable: boolean; message?: string }) {
    super();
    // Java has no concept of `undefined`; null is the only absence Optional models, so the two fold together.
    const normalized = value === undefined ? null : value;
    if (normalized === null && !internalArgs.nullable) {
      // NullPointerException rather than IllegalArgumentException: Java's `Optional.of` is a one-liner around
      // `Objects.requireNonNull(value)`, so a null there surfaces as an NPE. This is the only path that reaches
      // here — `ofNullable` short-circuits to `empty()` and `empty()` passes `nullable: true` — so the whole
      // check exists to serve `of`, and it should throw what `of` throws.
      throw new NullPointerException(internalArgs.message ?? "Value cannot be null.");
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
    Optional.#EMPTY ??= new Optional<never>(null, { nullable: true });
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

  public override equals(other: unknown): boolean {
    return boilerplateEqualityCheck<Optional<T>>({ obj1: this, obj2: other }, (o1, o2) => {
      // `Reflect.construct(JavaObject, [], Optional)` runs JavaObject's constructor against this prototype, so
      // it clears both of boilerplateEqualityCheck's gates — `#hash` is present, the prototype matches — while
      // never installing `#value`. Reading that field off it would throw a TypeError. Java's contract says
      // equals returns false for anything it does not recognise, never throws, so brand-check first.
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
   * Serialises as the contained value, or as `null` when empty — the Optional itself leaves no trace on the
   * wire.
   *
   * ```ts
   * JSON.stringify({ nickname: Optional.of("ada") }); // {"nickname":"ada"}
   * JSON.stringify({ nickname: Optional.empty() });   // {"nickname":null}
   * ```
   *
   * This is the shape Jackson's `Jdk8Module` produces for a Java DTO, and it is the only shape that makes
   * Optional usable on a wire contract: a field's type is a property of the server's code, not of the JSON, so
   * a consumer in another language must not have to know that this end wrapped it. Wrapping instead — some
   * `{"present":false}` envelope — would leak the implementation into every client.
   *
   * The encoding is unambiguous in both directions because `null` is the one value an Optional cannot hold:
   * {@link of} rejects it and {@link ofNullable} folds it to {@link empty}. So `null` on the wire always means
   * empty, never "a present null", and `Optional.ofNullable(JSON.parse(json))` reconstructs the original —
   * exactly, for any value JSON can represent on its own.
   *
   * An empty Optional serialises to `null` rather than vanishing from its parent object. Omitting the key is
   * `JSON.stringify`'s behaviour for `undefined`, and it is the wrong default here: it collapses "the server
   * says there is no nickname" into "the server did not mention nicknames", which a client cannot distinguish
   * from a version skew. Callers who do want the key dropped can filter before serialising.
   *
   * A contained value that is itself serialisable has its own `toJSON` called here rather than being handed
   * back raw. `JSON.stringify` consults `toJSON` once per slot: having taken this one, it serialises whatever
   * comes back by its own rules and does not look for a second hook on it. Returning the value unexamined
   * would therefore drop the value's encoding entirely — an `Optional<JavaMap>` would come out as `{}`, since
   * a map keeps its contents in private fields. Nesting one slot deeper is safe without this, because the
   * engine does re-check `toJSON` on each *property* of what it gets back.
   */
  public toJSON(): unknown {
    const value: unknown = this.#value;
    if (typeof value === "object" && value !== null && "toJSON" in value && typeof value.toJSON === "function") {
      return (value as Serializable).toJSON();
    }
    return value;
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
   * Gets the value if not null, otherwise throws.
   *
   * @returns the value if present
   * @throws {@link NoSuchElementException} if the Optional is empty
   */
  public get(): T {
    if (this.#value === null) {
      throw new NoSuchElementException("No value present");
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
   *
   * The supplier may return any `Error`, matching Java's bound of `Throwable` — the root of everything
   * throwable, not the subset this library happens to own. An application throws its own domain error out of an
   * empty Optional without reparenting it onto this hierarchy.
   *
   * `Error` rather than no bound at all: JavaScript will throw any value, but Java cannot throw a String and
   * neither should anything written in this style. A non-Error throw also loses the stack trace, which is the
   * one thing that makes the failure traceable.
   *
   * @param errorSupplier a function returning the error to throw if no value is present. Omit it to get the
   * same {@link NoSuchElementException} {@link get} throws, which is what Java's no-argument overload does.
   * @throws {@link NoSuchElementException} if the Optional is empty and no supplier was given
   */
  public orElseThrow(errorSupplier?: () => Error): T {
    if (this.#value !== null) {
      return this.#value as T;
    } else if (errorSupplier) {
      throw errorSupplier();
    } else {
      throw new NoSuchElementException("No value present");
    }
  }

}
