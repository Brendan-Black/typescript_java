import { RuntimeException } from "./RuntimeException.js";

/**
 * Java's `NoSuchElementException`: something was asked for an element it does not have.
 *
 * In Java this is what an exhausted `Iterator.next()` throws, and — the case that matters here — what
 * `Optional.get()` and the no-argument `Optional.orElseThrow()` throw when the Optional is empty.
 *
 * The distinction from {@link IllegalStateException} is worth keeping rather than collapsing. An
 * `IllegalStateException` says the object is in the wrong state to service an otherwise reasonable request,
 * which implies the request could succeed at some other time. An empty Optional is not in a temporarily
 * awkward state: it is empty, permanently, because Optional is immutable. Asking it for a value is a request
 * that was never going to work, and Java names that case separately for exactly that reason.
 */
export class NoSuchElementException extends RuntimeException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NoSuchElementException";
  }
}
