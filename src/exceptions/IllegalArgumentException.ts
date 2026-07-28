import { RuntimeException } from "./RuntimeException.js";

/**
 * Java's `IllegalArgumentException`: a method has been passed an argument it cannot accept.
 *
 * Reach for this when the caller handed you something wrong. When the object itself is in the wrong state to
 * service an otherwise fine request, {@link IllegalStateException} is the one you want.
 */
export class IllegalArgumentException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IllegalArgumentException";
  }
}
