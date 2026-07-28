import { RuntimeException } from "./RuntimeException.js";

/**
 * Java's `IndexOutOfBoundsException`: an index was outside the range a list will accept.
 *
 * This is the one place a Java collection is markedly stricter than a JavaScript array. `array[99]` on a
 * three-element array quietly yields `undefined`, and that `undefined` then travels a long way before anything
 * notices. A list throws at the point of the mistake instead.
 */
export class IndexOutOfBoundsException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IndexOutOfBoundsException";
  }
}
