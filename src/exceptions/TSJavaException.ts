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
    // matches the class name. It previously read "TypeScriptJavaException", which made three spellings of the
    // same idea live at once — the class, this string, and the package name — and only this one was wrong.
    this.name = "TSJavaException";
  }
}
