import { List } from "../collections/List.js";
import { JavaMap } from "../collections/Map.js";
import { XmlParseException } from "../exceptions/XmlParseException.js";
import { hashAll } from "../fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../fundamentals/Object.js";
import { Optional } from "../fundamentals/Optional.js";

/**
 * A parsed XML element: its name, its attributes, the elements inside it, and its character data.
 *
 * This is a document model rather than a DOM. There are no text nodes, no parent pointers and no node types —
 * an element holds its own character data as one string and its children as a list, which is the shape a
 * JavaBean unmarshals from and the only shape the readers in `XmlReader` need. What that model deliberately
 * cannot represent is *mixed content*: `<p>hello <b>world</b> again</p>` keeps `hello  again` and the `<b>`,
 * but not the fact that the `<b>` sat between them. XML for data interchange — which is what a Java service
 * emits — never relies on that ordering, and paying for it everywhere to serve documents this library is not
 * for would be the wrong trade.
 *
 * Whitespace between child elements is discarded, so a pretty-printed document reads the same as a compact one.
 * Whitespace is kept when an element has no child elements, because there it is the value: `<name> Ada </name>`
 * holds `" Ada "`, and it is the reader's business to decide whether to trim. Text inside `CDATA` is always kept
 * verbatim — writing it out at all is a statement that its contents are deliberate.
 *
 * Line endings arrive normalised, as XML requires of every parser: a `\r\n` and a lone `\r` both read as `\n`,
 * whichever machine wrote the document. A carriage return that is genuinely part of a value is written `&#13;`,
 * which survives, and {@link toXml} writes one that way for exactly that reason.
 *
 * Namespaces are left as written. A prefixed name stays prefixed, `xmlns` declarations are ordinary attributes,
 * and {@link getLocalName} is there for a caller who wants to match without the prefix. Resolving prefixes to
 * URIs is a separate job that no document this parser is aimed at needs done for it.
 */
export class XmlElement extends JavaObject {
  readonly #name: string;
  readonly #attributes: JavaMap<string, string>;
  readonly #children: List<XmlElement>;
  readonly #text: string;

  /**
   * @param name the tag name, prefix included
   * @param attributes `[name, value]` pairs, in document order. Iteration keeps that order.
   * @param children the elements directly inside this one, in document order
   * @param text this element's own character data, with entities already resolved
   */
  constructor(
    name: string,
    attributes: Iterable<readonly [string, string]> = [],
    children: Iterable<XmlElement> = [],
    text: string = "",
  ) {
    super();
    this.#name = name;
    this.#attributes = new JavaMap<string, string>(attributes);
    this.#children = new List<XmlElement>(children);
    this.#text = text;
  }

  /** The tag name exactly as written, prefix and all — `soap:Envelope`, not `Envelope`. */
  public getName(): string {
    return this.#name;
  }

  /** The name with any namespace prefix stripped. `soap:Envelope` is `Envelope`; an unprefixed name is itself. */
  public getLocalName(): string {
    const colon = this.#name.indexOf(":");
    return colon < 0 ? this.#name : this.#name.slice(colon + 1);
  }

  /** The namespace prefix, if the name carries one. `soap:Envelope` is `soap`; `Envelope` is empty. */
  public getPrefix(): Optional<string> {
    const colon = this.#name.indexOf(":");
    return colon < 0 ? Optional.empty<string>() : Optional.of(this.#name.slice(0, colon));
  }

  /** One attribute by name, or empty when the element does not carry it. Absent and empty-valued differ. */
  public getAttribute(name: string): Optional<string> {
    return Optional.ofNullable(this.#attributes.get(name));
  }

  /** Every attribute, in document order. Unmodifiable: an element is a record of what was parsed. */
  public getAttributes(): JavaMap<string, string> {
    return JavaMap.unmodifiable(this.#attributes);
  }

  /** The elements directly inside this one, in document order. Unmodifiable, for the same reason. */
  public getChildren(): List<XmlElement> {
    return List.unmodifiable(this.#children);
  }

  /** The direct children with this tag name, in document order. Empty when there are none. */
  public getChildrenNamed(name: string): List<XmlElement> {
    const found = new List<XmlElement>();
    for (const child of this.#children) {
      if (child.#name === name) {
        found.add(child);
      }
    }
    return List.unmodifiable(found);
  }

  /**
   * The first direct child with this tag name.
   *
   * Deliberately silent about there being others — this is the convenience for walking a document by hand. The
   * reader that binds a DTO field refuses a repeated element instead, because there the count is part of the
   * contract.
   */
  public getChild(name: string): Optional<XmlElement> {
    for (const child of this.#children) {
      if (child.#name === name) {
        return Optional.of(child);
      }
    }
    return Optional.empty<XmlElement>();
  }

  /**
   * This element's own character data, entities resolved, exactly as the rules on {@link XmlElement} describe.
   *
   * Only this element's. Text inside a child belongs to the child, so `<order><note>x</note></order>` has no
   * text of its own.
   */
  public getText(): string {
    return this.#text;
  }

  /**
   * Writes the element back out as XML.
   *
   * A faithful round trip of the *model*, not of the source: attributes keep their order and text keeps its
   * content, but this element's text is written before its children — the model does not record how the two
   * were interleaved — and comments, processing instructions and the choice between `CDATA` and escaping are
   * all gone by the time an element exists. An empty element is written in the self-closing form.
   */
  public toXml(): string {
    const attributes = this.#attributesXml();
    if (this.#text === "" && this.#children.size() === 0) {
      return `<${this.#name}${attributes}/>`;
    }
    let body = escapeText(this.#text);
    for (const child of this.#children) {
      body += child.toXml();
    }
    return `<${this.#name}${attributes}>${body}</${this.#name}>`;
  }

  /**
   * Writes the element back out with one child element per line, for output a person is going to read.
   *
   * The only whitespace added is between child elements, which is the only whitespace a parser is entitled to
   * throw away — see the rules on {@link XmlElement}. So an element holding text stays on its own line, and so
   * does one holding both text and children, because breaking either apart would change the value that reads
   * back. Whatever this produces, {@link parseXml} returns an equal element for.
   *
   * @param indent the string to repeat per level of nesting
   */
  public toIndentedXml(indent: string = "  "): string {
    return this.#indent(indent, "");
  }

  #indent(indent: string, prefix: string): string {
    if (this.#children.size() === 0 || this.#text !== "") {
      return prefix + this.toXml();
    }
    let body = "";
    for (const child of this.#children) {
      body += `${child.#indent(indent, prefix + indent)}\n`;
    }
    return `${prefix}<${this.#name}${this.#attributesXml()}>\n${body}${prefix}</${this.#name}>`;
  }

  #attributesXml(): string {
    let attributes = "";
    for (const [name, value] of this.#attributes) {
      attributes += ` ${name}="${escapeAttribute(value)}"`;
    }
    return attributes;
  }

  /** The element as XML — see {@link toXml}. Diagnostic output should say what was parsed, not where it lives. */
  public override toString(): string {
    return this.toXml();
  }

  /** Two elements are equal when their names, attributes, children and text all are. Order of children counts. */
  public override equals(other: unknown): boolean {
    return boilerplateEqualityCheck<XmlElement>({ obj1: this, obj2: other }, (a, b) => {
      return (
        a.#name === b.#name &&
        a.#text === b.#text &&
        a.#attributes.equals(b.#attributes) &&
        a.#children.equals(b.#children)
      );
    });
  }

  public override hashCode(): number {
    return hashAll(this.#name, this.#text, this.#attributes.hashCode(), this.#children.hashCode());
  }
}

/** The five entities XML defines without a DTD. Everything else needs a declaration this parser cannot read. */
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map<string, string>([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

/** XML's `NameStartChar`, near enough: a letter, an underscore or a colon. */
const NAME_START = /[\p{L}_:]/u;

/** XML's `NameChar`: the above, plus digits, combining marks and the three joining punctuation characters. */
const NAME_CHAR = /[\p{L}\p{N}\p{M}._:·-]/u;

const WHITESPACE = /[ \t\r\n]/;

/**
 * Whether a string is an XML `Name`, and so usable as a tag or an attribute name.
 *
 * The writers check the names in a contract with this, because a name is the one part of an element that no
 * amount of escaping can rescue: text and attribute values can carry anything, but `<order id>` is not a
 * document at all, and a writer that emitted one would produce output nothing could read back.
 */
export function isXmlName(text: string): boolean {
  if (text === "" || !NAME_START.test(text.charAt(0))) {
    return false;
  }
  for (let index = 1; index < text.length; index++) {
    if (!NAME_CHAR.test(text.charAt(index))) {
      return false;
    }
  }
  return true;
}

function escapeText(text: string): string {
  // A carriage return goes out as a reference because a parser reading this back is required to fold it into a
  // newline otherwise — see the note on line-end handling in the parser below. It is the one character that
  // survives being written literally and comes back as something else.
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#13;");
}

function escapeAttribute(value: string): string {
  // Newlines and tabs go out as references for the same kind of reason: a parser reading this back is required
  // to fold them into spaces — see the note on attribute-value normalisation in the reader below.
  return escapeText(value).replaceAll('"', "&quot;").replaceAll("\n", "&#10;").replaceAll("\t", "&#9;");
}

/**
 * The first character in a string that XML cannot carry, as a code point, or -1 when every one of them is fine.
 *
 * The writers check the values in a contract with this, because these are the characters no amount of escaping
 * rescues: `&#0;` is as illegal as a literal NUL, so a document carrying one is not a document at all and
 * nothing on the far end will read it back. It is {@link isXmlName}'s counterpart for the other half of what an
 * element holds — a name has to be a `Name`, and everything else has only to be characters that exist.
 *
 * The character rather than a yes or no, because a value that fails this is usually a long one that picked up a
 * stray byte somewhere, and `U+0000` in the message is the difference between a failure a caller can go and
 * find and one they can only stare at.
 *
 * Iteration is by code point, so a surrogate pair is judged as the character it spells while an unpaired
 * surrogate is judged as itself, which is what makes the second one fail.
 */
export function findForbiddenCharacter(text: string): number {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (!isAllowedCharacter(code)) {
      return code;
    }
  }
  return -1;
}

/** The characters XML allows at all. Everything else is refused even when written as a character reference. */
function isAllowedCharacter(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/** A run of character data, and whether it was written as `CDATA` — which decides if whitespace survives. */
interface Segment {
  readonly text: string;
  readonly literal: boolean;
}

/**
 * A recursive-descent parser over the document text.
 *
 * Hand-written because there is nothing to reach for: Node has no `DOMParser`, this package has no runtime
 * dependencies, and the subset of XML that data interchange actually uses is small enough to read in one sitting.
 * What is *not* here is the part of the specification that stops being small: no DTDs, so no entity declarations
 * or defaulted attributes; no `xml:space`; no namespace resolution. Each of those is refused or ignored
 * explicitly rather than half-implemented.
 */
class Parser {
  readonly #text: string;
  #at: number = 0;

  constructor(text: string) {
    // A byte-order mark is a fact about the encoding, not about the document, and it is only ever a nuisance
    // once the bytes are already a JavaScript string.
    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    // XML's line-end handling, which the specification requires before anything else looks at the document:
    // every `\r\n` and every lone `\r` is a `\n`. It happens here rather than in the text and attribute readers
    // because it applies to all of them at once — content, CDATA and attribute values alike — and because a
    // failure's line and column should count the line breaks a reader of the document would count, which is one
    // per `\r\n` rather than two. A carriage return that is meant survives as `&#13;`, resolved after this and
    // therefore untouched by it, which is how {@link XmlElement.toXml} writes one.
    this.#text = body.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  }

  /** The whole document: optional prolog, exactly one root element, nothing of substance after it. */
  public parse(): XmlElement {
    this.#skipMisc();
    if (this.#done()) {
      this.#fail("the document contains no root element");
    }
    if (!this.#looking("<")) {
      this.#fail("expected the root element");
    }
    const root = this.#parseElement();
    this.#skipMisc();
    if (!this.#done()) {
      this.#fail(`unexpected content after the root element </${root.getName()}>`);
    }
    return root;
  }

  #done(): boolean {
    return this.#at >= this.#text.length;
  }

  /** `charAt` rather than an index read: past the end it gives `""`, which every comparison below wants. */
  #peek(offset: number = 0): string {
    return this.#text.charAt(this.#at + offset);
  }

  #looking(prefix: string): boolean {
    return this.#text.startsWith(prefix, this.#at);
  }

  #fail(problem: string, at: number = this.#at): never {
    let line = 1;
    let lineStart = 0;
    for (let index = 0; index < at; index++) {
      if (this.#text.charAt(index) === "\n") {
        line++;
        lineStart = index + 1;
      }
    }
    throw new XmlParseException(line, at - lineStart + 1, problem);
  }

  #expect(prefix: string, what: string): void {
    if (!this.#looking(prefix)) {
      this.#fail(`expected ${what}`);
    }
    this.#at += prefix.length;
  }

  #skipWhitespace(): void {
    while (!this.#done() && WHITESPACE.test(this.#peek())) {
      this.#at++;
    }
  }

  /** The prolog and the epilog: whitespace, comments, processing instructions and a doctype, in any order. */
  #skipMisc(): void {
    for (;;) {
      this.#skipWhitespace();
      if (this.#looking("<!--")) {
        this.#skipComment();
      } else if (this.#looking("<?")) {
        this.#skipProcessingInstruction();
      } else if (this.#looking("<!DOCTYPE")) {
        this.#skipDoctype();
      } else {
        return;
      }
    }
  }

  #skipDelimited(open: string, close: string, what: string): void {
    const start = this.#at;
    this.#at += open.length;
    const end = this.#text.indexOf(close, this.#at);
    if (end < 0) {
      this.#fail(`${what} is never closed`, start);
    }
    this.#at = end + close.length;
  }

  #skipComment(): void {
    this.#skipDelimited("<!--", "-->", "a comment");
  }

  #skipProcessingInstruction(): void {
    // The XML declaration is one of these. Its version and encoding say nothing this parser can act on: the
    // text has already been decoded by whoever read the bytes, and 1.0 and 1.1 differ only in ways the subset
    // handled here does not reach.
    this.#skipDelimited("<?", "?>", "a processing instruction");
  }

  /**
   * Skips a doctype, internal subset and all.
   *
   * Skipping rather than reading: honouring a DTD means entity declarations and defaulted attributes, and a
   * parser that reads one and applies neither would be lying about the document it produced. Ignoring it
   * outright means an undeclared entity fails loudly instead.
   */
  #skipDoctype(): void {
    const start = this.#at;
    this.#at += "<!DOCTYPE".length;
    let depth = 0;
    while (!this.#done()) {
      const character = this.#peek();
      if (character === '"' || character === "'") {
        this.#skipQuoted(character);
        continue;
      }
      this.#at++;
      if (character === "[") {
        depth++;
      } else if (character === "]") {
        depth--;
      } else if (character === ">" && depth <= 0) {
        return;
      }
    }
    this.#fail("the doctype declaration is never closed", start);
  }

  #skipQuoted(quote: string): void {
    const start = this.#at;
    this.#at++;
    const end = this.#text.indexOf(quote, this.#at);
    if (end < 0) {
      this.#fail("a quoted value is never closed", start);
    }
    this.#at = end + 1;
  }

  #readName(what: string): string {
    const start = this.#at;
    if (this.#done() || !NAME_START.test(this.#peek())) {
      this.#fail(`expected ${what}`);
    }
    this.#at++;
    while (!this.#done() && NAME_CHAR.test(this.#peek())) {
      this.#at++;
    }
    return this.#text.slice(start, this.#at);
  }

  /** An element and everything under it, from its `<` to the end of its closing tag. */
  #parseElement(): XmlElement {
    const start = this.#at;
    this.#expect("<", "an element");
    const name = this.#readName("an element name");
    const attributes: [string, string][] = [];
    const seen = new Set<string>();
    for (;;) {
      this.#skipWhitespace();
      if (this.#looking("/>")) {
        this.#at += 2;
        return new XmlElement(name, attributes);
      }
      if (this.#looking(">")) {
        this.#at++;
        break;
      }
      if (this.#done()) {
        this.#fail(`the start tag <${name}> is never closed`, start);
      }
      const attributeAt = this.#at;
      const attribute = this.#readName(`an attribute name or the end of <${name}>`);
      this.#skipWhitespace();
      this.#expect("=", `'=' after attribute ${attribute}`);
      this.#skipWhitespace();
      const value = this.#readAttributeValue(attribute);
      if (seen.has(attribute)) {
        this.#fail(`attribute ${attribute} appears twice on <${name}>`, attributeAt);
      }
      seen.add(attribute);
      attributes.push([attribute, value]);
    }
    const [children, text] = this.#parseContent(name, start);
    return new XmlElement(name, attributes, children, text);
  }

  /**
   * A quoted attribute value.
   *
   * Tabs and newlines become spaces, which is XML's attribute-value normalisation: an attribute is a value on
   * one line by definition, and how the sender chose to wrap the source should not change what it reads as.
   * Write `&#10;` to mean an actual newline — which is what {@link XmlElement.toXml} does.
   */
  #readAttributeValue(attribute: string): string {
    const quote = this.#peek();
    if (quote !== '"' && quote !== "'") {
      this.#fail(`expected a quoted value for attribute ${attribute}`);
    }
    const start = this.#at;
    this.#at++;
    let value = "";
    for (;;) {
      if (this.#done()) {
        this.#fail(`the value of attribute ${attribute} is never closed`, start);
      }
      const character = this.#peek();
      if (character === quote) {
        this.#at++;
        return value;
      }
      if (character === "<") {
        this.#fail(`'<' cannot appear in attribute ${attribute}; write &lt;`);
      }
      if (character === "&") {
        value += this.#readReference();
        continue;
      }
      value += WHITESPACE.test(character) ? " " : character;
      this.#at++;
    }
  }

  /** Everything between a start tag and its matching close: child elements, text, and the noise in between. */
  #parseContent(name: string, start: number): [XmlElement[], string] {
    const children: XmlElement[] = [];
    const segments: Segment[] = [];
    for (;;) {
      if (this.#done()) {
        this.#fail(`the element <${name}> is never closed`, start);
      }
      if (this.#looking("</")) {
        const closeAt = this.#at;
        this.#at += 2;
        const closing = this.#readName("a closing tag name");
        this.#skipWhitespace();
        this.#expect(">", `'>' at the end of </${closing}>`);
        if (closing !== name) {
          this.#fail(`<${name}> is closed by </${closing}>`, closeAt);
        }
        return [children, joinSegments(segments, children.length > 0)];
      }
      if (this.#looking("<!--")) {
        this.#skipComment();
      } else if (this.#looking("<![CDATA[")) {
        segments.push({ text: this.#readCData(), literal: true });
      } else if (this.#looking("<?")) {
        this.#skipProcessingInstruction();
      } else if (this.#looking("<!")) {
        this.#fail("a declaration cannot appear inside an element");
      } else if (this.#looking("<")) {
        children.push(this.#parseElement());
      } else {
        segments.push({ text: this.#readText(), literal: false });
      }
    }
  }

  #readCData(): string {
    const start = this.#at;
    this.#at += "<![CDATA[".length;
    const end = this.#text.indexOf("]]>", this.#at);
    if (end < 0) {
      this.#fail("a CDATA section is never closed", start);
    }
    const text = this.#text.slice(this.#at, end);
    this.#at = end + "]]>".length;
    return text;
  }

  /** Character data up to the next tag, with references resolved. Never empty: the caller only calls it on text. */
  #readText(): string {
    let value = "";
    for (;;) {
      const stop = this.#nextStop();
      value += this.#text.slice(this.#at, stop);
      this.#at = stop;
      if (this.#done() || this.#peek() === "<") {
        return value;
      }
      value += this.#readReference();
    }
  }

  /** The next `<` or `&`, whichever comes first, or the end of the document. */
  #nextStop(): number {
    const tag = this.#text.indexOf("<", this.#at);
    const reference = this.#text.indexOf("&", this.#at);
    if (tag < 0) {
      return reference < 0 ? this.#text.length : reference;
    }
    return reference < 0 ? tag : Math.min(tag, reference);
  }

  /** One `&…;`: the five built-in entities, or a decimal or hexadecimal character reference. */
  #readReference(): string {
    const start = this.#at;
    this.#at++;
    const end = this.#text.indexOf(";", this.#at);
    if (end < 0) {
      this.#fail("a reference is missing its ';'", start);
    }
    const body = this.#text.slice(this.#at, end);
    this.#at = end + 1;
    if (body.startsWith("#")) {
      const hexadecimal = body.charAt(1) === "x" || body.charAt(1) === "X";
      const digits = body.slice(hexadecimal ? 2 : 1);
      const allowed = hexadecimal ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/;
      if (!allowed.test(digits)) {
        this.#fail(`&${body}; is not a character reference`, start);
      }
      const code = Number.parseInt(digits, hexadecimal ? 16 : 10);
      if (!isAllowedCharacter(code)) {
        this.#fail(`&${body}; is not a character XML allows`, start);
      }
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES.get(body);
    if (named === undefined) {
      this.#fail(`unknown entity &${body};, and no DTD is read to declare one`, start);
    }
    return named;
  }
}

/**
 * Folds an element's text segments into one string, dropping the whitespace that was only ever indentation.
 *
 * @param nested whether the element has child elements, which is what makes whitespace between them formatting
 *   rather than content
 */
function joinSegments(segments: readonly Segment[], nested: boolean): string {
  let text = "";
  for (const segment of segments) {
    if (nested && !segment.literal && segment.text.trim() === "") {
      continue;
    }
    text += segment.text;
  }
  return text;
}

/**
 * Parses an XML document and hands back its root element.
 *
 * ```ts
 * const root = parseXml("<order id='A-1'><total>19.99</total></order>");
 * root.getAttribute("id");          // Optional[A-1]
 * root.getChild("total").get().getText(); // "19.99"
 * ```
 *
 * See {@link XmlElement} for what the model keeps and what it deliberately drops, and `XmlReader` for binding a
 * document to a DTO rather than walking it by hand.
 *
 * @throws {@link XmlParseException} if the document is not well-formed, naming the line and column
 */
export function parseXml(text: string): XmlElement {
  return new Parser(text).parse();
}
