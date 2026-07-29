import { RuntimeException } from "./RuntimeException.js";

/**
 * Java's `ClassCastException`: a value has been used as a type it is not.
 *
 * On the JVM this is thrown by the cast itself. Here there is no cast to throw from, so it stands for the runtime
 * half of a type claim the compiler could not check — chiefly a natural-order comparison on a value that has no
 * natural order. See {@link compareOf}.
 */
export class ClassCastException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClassCastException";
  }
}
