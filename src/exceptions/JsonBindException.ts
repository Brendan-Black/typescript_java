import { IllegalArgumentException } from "./IllegalArgumentException.js";

/**
 * A JSON document does not match the contract that was read against it — Jackson's `JsonMappingException`, which
 * is the error a Spring controller produces when a request body will not bind.
 *
 * An {@link IllegalArgumentException} underneath, because that is what a payload of the wrong shape is: an
 * argument the reader cannot accept. Catching either works.
 *
 * The distinguishing feature is {@link getPath}. A DTO of any depth produces a message naming the exact slot that
 * failed — `$.orders[2].total: expected a number, got a string` — which is the difference between a bug report
 * you can act on and one that says the payload was wrong somewhere.
 */
export class JsonBindException extends IllegalArgumentException {
  readonly #path: string;

  /**
   * @param path where in the document the failure sits, in the `$.field[0]` notation the readers build up
   * @param problem what was wrong there, without the path — the two are joined for {@link Error.message}
   */
  constructor(path: string, problem: string, options?: ErrorOptions) {
    super(`${path}: ${problem}`, options);
    this.name = "JsonBindException";
    this.#path = path;
  }

  /** The slot that failed, as a path from the root of the document. `$` is the document itself. */
  public getPath(): string {
    return this.#path;
  }
}
