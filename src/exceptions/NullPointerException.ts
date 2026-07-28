import { RuntimeException } from "./RuntimeException.js";

/**
 * Java's `NullPointerException`, thrown by {@link requireNonNull} when a value that must not be null is.
 *
 * The name is Java's, kept for recognisability, and is a small lie here: JavaScript has no pointers, and the
 * value that triggered it may equally have been `undefined`.
 */
export class NullPointerException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NullPointerException";
  }
}
