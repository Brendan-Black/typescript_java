import { TSJavaException } from "./TSJavaException.js";

/**
 * exception for when a method finds itself in a bad state.
 */
export class IllegalStateException extends TSJavaException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IllegalStateException";
  }
}
