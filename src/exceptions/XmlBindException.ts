import { IllegalArgumentException } from "./IllegalArgumentException.js";

/**
 * A well-formed XML document does not match the contract that was read against it — JAXB's `UnmarshalException`,
 * and the XML half of what `JsonBindException` says about a JSON body.
 *
 * The path is an XPath rather than the `$.field[0]` notation the JSON readers use, because that is the notation
 * everything else in the XML world already speaks: `/order/items/item[2]/@sku` names an attribute of the second
 * item, and can be pasted straight into any tool that queries the document.
 */
export class XmlBindException extends IllegalArgumentException {
  readonly #path: string;

  /**
   * @param path where in the document the failure sits, as an XPath. `[n]` indices are 1-based, as XPath's are.
   * @param problem what was wrong there, without the path — the two are joined for {@link Error.message}
   */
  constructor(path: string, problem: string, options?: ErrorOptions) {
    super(`${path}: ${problem}`, options);
    this.name = "XmlBindException";
    this.#path = path;
  }

  /** The slot that failed, as an XPath from the root of the document. */
  public getPath(): string {
    return this.#path;
  }
}
