import { TSJavaException } from "./TSJavaException.js";

/**
 * Java's `RuntimeException`: the parent of every unchecked exception in the language, and so the parent of
 * every exception this library throws.
 *
 * Catch this to catch anything the library raises without also catching an unrelated failure from elsewhere
 * in your program.
 *
 * NOTE: this was spelled `RunTimeException` until it was corrected here. Java has no capital T, and neither
 * does this any more.
 */
export class RuntimeException extends TSJavaException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RuntimeException";
  }
}
