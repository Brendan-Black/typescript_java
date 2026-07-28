import { TSJavaException } from "./TSJavaException.js";

/**
 * basic implementa of a package level exception.
 */
export class RunTimeException extends TSJavaException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RunTimeException";
  }
}
