import { RuntimeException } from "./RuntimeException.js";

/**
 * Java's `ConcurrentModificationException`: a collection was structurally modified while something was
 * iterating it.
 *
 * "Concurrent" is misleading — this has nothing to do with threads, and the usual cause is a single-threaded
 * loop removing from the very collection it is walking. The iterators here are fail-fast, as Java's are: they
 * detect the modification and throw rather than quietly skipping elements or looping forever.
 *
 * Replacing the value under an existing key is not a structural modification and will not trigger this.
 */
export class ConcurrentModificationException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConcurrentModificationException";
  }
}
