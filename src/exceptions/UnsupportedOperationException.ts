import { RuntimeException } from "./RuntimeException.js";

/**
 * Java's `UnsupportedOperationException`: a type implements an operation only to refuse it.
 *
 * Thrown by every mutator on an unmodifiable collection. Java takes the same approach — the read-only wrappers
 * in `java.util.Collections` still expose `add` and `remove`, and still throw this when you call them.
 */
export class UnsupportedOperationException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnsupportedOperationException";
  }
}
