import { NullPointerException } from "../exceptions/NullPointerException.js";

/**
 * The null-checking half of Java's `java.util.Objects`. The hashing half lives in `Hashing.ts`.
 *
 * @module
 */

/**
 * Java's `Objects.requireNonNull`: returns the value, or throws if it is absent.
 *
 * This is offensive programming — it converts a null that would have caused trouble somewhere downstream into a
 * failure at the point the bad value arrived, with a message you chose.
 *
 * ```ts
 * function greet(name: string | null) {
 *   const checked = requireNonNull(name, "name"); // checked: string
 *   return `hello ${checked.toUpperCase()}`;
 * }
 * ```
 *
 * NOTE: this replaces `Optional.requireNonNull`, which had two problems. Its parameter was typed `any | null` —
 * which TypeScript collapses to plain `any`, erasing the caller's type — and it returned an `Optional`, where
 * Java returns the value itself. An `Optional` that is guaranteed non-empty is just a value wearing a box.
 *
 * @param value the value to check; `undefined` counts as absent, as it does everywhere else in this library
 * @param message included in the exception. Java treats a bare string as the message, so this does too.
 * @returns the value, with null and undefined removed from its type
 * @throws {@link NullPointerException} if the value is null or undefined
 */
export function requireNonNull<T>(value: T, message?: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new NullPointerException(message ?? "Value cannot be null.");
  }
  return value as NonNullable<T>;
}

/**
 * Java's `Objects.requireNonNullElse`: the value if present, otherwise the fallback.
 * @throws {@link NullPointerException} if the fallback is itself absent
 */
export function requireNonNullElse<T>(value: T | null | undefined, fallback: T): NonNullable<T> {
  if (value === null || value === undefined) {
    return requireNonNull(fallback, "The fallback passed to requireNonNullElse cannot be null.");
  }
  return value as NonNullable<T>;
}

/**
 * Java's `Objects.requireNonNullElseGet`: as {@link requireNonNullElse}, but the fallback is only built if it
 * is actually needed.
 * @throws {@link NullPointerException} if the supplier produces an absent value
 */
export function requireNonNullElseGet<T>(value: T | null | undefined, supplier: () => T): NonNullable<T> {
  if (value === null || value === undefined) {
    return requireNonNull(supplier(), "The supplier passed to requireNonNullElseGet cannot produce null.");
  }
  return value as NonNullable<T>;
}

/** Java's `Objects.isNull`, narrowing in the process. `undefined` counts, as it does throughout this library. */
export function isNull(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/** Java's `Objects.nonNull`, narrowing in the process. */
export function nonNull<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}
