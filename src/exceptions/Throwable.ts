/**
 * Basic exception class.
 * Its not much other than a wrapper for the standard Error class, however
 * its value here is to distinguish runtime exceptions originating from this library
 *
 * by design, all exception classes will extend this.
 *
 * The hierarchy below it mirrors Java's: this stands in for `java.lang.Throwable`, and everything a caller is
 * realistically going to catch descends from {@link RuntimeException} rather than from here directly.
 */
export abstract class Throwable extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    // Subclasses overwrite this with their own name, so a caller reading `error.name` always gets the class
    // they caught rather than the root of the hierarchy.
    this.name = "Throwable";
  }
}
