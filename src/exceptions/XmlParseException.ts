import { IllegalArgumentException } from "./IllegalArgumentException.js";

/**
 * A document is not well-formed XML — Java's `SAXParseException`, thrown before any binding is attempted.
 *
 * Distinct from `XmlBindException`, and the split is the useful one: this says the bytes are not XML, while a
 * bind failure says the XML is fine but is not the document that was agreed on. The first is the sender's
 * transport being broken, the second is the two ends disagreeing about a contract.
 *
 * An {@link IllegalArgumentException} underneath, matching `JsonBindException`, so one `catch` still covers
 * "this payload was not acceptable" when a caller does not care which half went wrong.
 */
export class XmlParseException extends IllegalArgumentException {
  readonly #line: number;
  readonly #column: number;

  /**
   * @param line 1-based line the failure sits on
   * @param column 1-based character offset within that line
   * @param problem what was wrong there, without the position — the two are joined for {@link Error.message}
   */
  constructor(line: number, column: number, problem: string, options?: ErrorOptions) {
    super(`line ${line}, column ${column}: ${problem}`, options);
    this.name = "XmlParseException";
    this.#line = line;
    this.#column = column;
  }

  /** The 1-based line the failure sits on, as `SAXParseException.getLineNumber` reports it. */
  public getLine(): number {
    return this.#line;
  }

  /** The 1-based character offset within {@link getLine}, counting a tab as one character. */
  public getColumn(): number {
    return this.#column;
  }
}
