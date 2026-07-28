import { RuntimeException } from "./RuntimeException.js";

/**
 * exception for when a method is not implemented in this package.
 *
 * Java has no equivalent — its nearest relative is {@link UnsupportedOperationException}, which is about an
 * operation a type deliberately refuses rather than one nobody has written yet. Use that one for a collection
 * that cannot be modified; use this one for a genuine gap.
 */
export class NotImplementedException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NotImplementedException";
  }
}
