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
export abstract class TSJavaException extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    // One spelling of the idea: the class, this string and the package name all say TSJava. Subclasses
    // overwrite it with their own name, so a caller reading `error.name` always gets the class they caught.
    this.name = "TSJavaException";
  }
}
