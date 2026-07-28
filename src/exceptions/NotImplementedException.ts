import { TSJavaException } from "./TSJavaException.js";

/**
 * exception for when a method is not implemented in this package
 */
export class NotImplementedException extends TSJavaException {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NotImplementedException";
  }
}
