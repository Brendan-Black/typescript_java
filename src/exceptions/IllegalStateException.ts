import { RuntimeException } from "./RuntimeException.js";

/**
 * Java's `IllegalStateException`: a method has been called at a time when the object cannot service it.
 *
 * The request is fine; the timing is not. When the argument is the problem, see {@link IllegalArgumentException}.
 */
export class IllegalStateException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IllegalStateException";
  }
}
