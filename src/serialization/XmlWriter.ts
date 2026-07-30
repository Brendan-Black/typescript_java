import { IllegalArgumentException } from "../exceptions/IllegalArgumentException.js";
import { IllegalStateException } from "../exceptions/IllegalStateException.js";
import { XmlBindException } from "../exceptions/XmlBindException.js";
import { Optional } from "../fundamentals/Optional.js";
import { isXmlName, XmlElement } from "./XmlParser.js";

/**
 * Turns a `T` into an element — the other direction of `XmlReader`, and JAXB's marshaller in the role it plays
 * on a DTO.
 *
 * The three layers are the reader's three, reversed, because an element still has three places a value can sit:
 *
 * - an {@link XmlTextWriter} turns a value into character data — {@link stringAsText}, {@link numberAsText};
 * - an {@link XmlPart} writes one value *into* an element — {@link intoAttribute}, {@link intoChild},
 *   {@link intoChildren}, {@link intoText};
 * - an `XmlWriter` turns a `T` into a whole element — {@link elementFrom} over a set of parts, or
 *   {@link textElementFrom} for an element that is just a value.
 *
 * The contract mirrors the reading one line for line:
 *
 * ```ts
 * const item: XmlWriter<Item> = elementFrom<Item>({
 *   sku: intoAttribute("sku"),
 *   quantity: intoChildText("quantity", integerAsText),
 * });
 *
 * const order: XmlWriter<Order> = elementFrom<Order>({
 *   id: intoAttribute("id"),
 *   total: intoChildText("total", numberAsText),
 *   note: intoOptionalChild("note", textElementFrom()),
 *   items: intoWrappedChildren("items", "item", item),
 * });
 *
 * writeXml("order", value, order);
 * ```
 *
 * Where a reader takes the path it is reading at, a writer takes the name it is writing under. Neither is
 * something the layer itself can know: an element's name belongs to whatever holds it, which is why the same
 * `item` writer above serves under `<item>` here and under any other name elsewhere.
 */
export interface XmlWriter<T> {
  /**
   * @param value the value to write
   * @param name the tag name to write it under, supplied by whatever holds this element
   * @param path where the element sits in the document, as an XPath, for anything that fails on the way down.
   *   Supplied by the composing writers; a caller writing a whole document can leave it alone.
   * @throws {@link XmlBindException} if some value in `T` has no XML representation
   */
  write(value: T, name: string, path?: string): XmlElement;
}

/**
 * Turns a value into character data, for the text of an element or the value of an attribute.
 *
 * Text is all XML has, so every scalar in a document goes out through one of these. The path is required for
 * the reason it is required when reading: character data has no name of its own, and only the caller knows
 * where the text is headed.
 */
export interface XmlTextWriter<T> {
  /** @throws {@link XmlBindException} if the value has no XML representation */
  write(value: T, path: string): string;
}

/**
 * Writes one value into an element being built: an attribute, a child, a run of children, or the text.
 *
 * The counterpart of an `XmlField`, and the piece JSON has no need of. A JSON field is a key with a value under
 * it; an XML one has to say *where* the value goes before it can say what it looks like, and `@id` and `<id>`
 * are different places.
 */
export interface XmlPart<T> {
  /**
   * @param value the value to write
   * @param into the element being assembled
   * @param path the XPath of the element being assembled — this part appends its own step to it
   * @throws {@link XmlBindException} if the value has no XML representation
   */
  write(value: T, into: XmlDraft, path: string): void;
}

/** A part per property of `T`, which is what {@link elementFrom} needs to build one. */
export type XmlParts<T> = {
  readonly [K in keyof T]: XmlPart<T[K]>;
};

/**
 * An element part-way through being assembled, which is what an {@link XmlPart} writes into.
 *
 * A parsed {@link XmlElement} is immutable — it is a record of what a document said — so building one a field
 * at a time needs somewhere to put the pieces until they are all in. Attributes and children keep the order
 * they were written in, which is the order the parts were declared in.
 */
export class XmlDraft {
  readonly #attributes: [string, string][] = [];
  readonly #children: XmlElement[] = [];
  #text: string = "";
  #hasText: boolean = false;

  /**
   * @throws {@link IllegalStateException} if the attribute has already been written — two parts aimed at one
   *   attribute means the contract has two properties sharing a slot, and one of them would vanish silently
   */
  public putAttribute(name: string, value: string): void {
    for (const [existing] of this.#attributes) {
      if (existing === name) {
        throw new IllegalStateException(`the ${name} attribute is written twice`);
      }
    }
    this.#attributes.push([name, value]);
  }

  /** Appends a child element. Repeats are what a collection looks like, so this never refuses one. */
  public addChild(child: XmlElement): void {
    this.#children.push(child);
  }

  /** @throws {@link IllegalStateException} if the text has already been written, for the reason above */
  public setText(text: string): void {
    if (this.#hasText) {
      throw new IllegalStateException("the element's text is written twice");
    }
    this.#hasText = true;
    this.#text = text;
  }

  /** The finished element, under the name whatever holds it chose. */
  public build(name: string): XmlElement {
    return new XmlElement(name, this.#attributes, this.#children, this.#text);
  }
}

const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/** The XPath of a root element, used when a caller writes a document without supplying a path. */
function rootPath(name: string): string {
  return `/${name}`;
}

/** @throws {@link IllegalArgumentException} if the name would not survive being written and read back */
function requireName(name: string, what: string): string {
  if (!isXmlName(name)) {
    throw new IllegalArgumentException(`"${name}" cannot be used as ${what}: it is not an XML name`);
  }
  return name;
}

/**
 * A string as it stands, character for character.
 *
 * There is one of these where reading has two. `stringText` trims and `rawText` does not, because a reader has
 * to decide what to make of the indentation a sender chose; a writer is handed the exact string that was meant
 * and has no such choice to make. Anything that needs escaping is escaped on the way out, so a value carrying
 * `<`, `&` or a newline arrives as itself.
 *
 * A union of string literals needs nothing more than this — `Priority` is a `string`, and so writes as one.
 */
export const stringAsText: XmlTextWriter<string> = {
  write(value: string): string {
    return value;
  },
};

/**
 * A number in the form XML Schema writes one.
 *
 * `NaN` and the infinities are refused rather than written. XML Schema spells them `NaN` and `INF`, but only
 * for the floating-point types, and nothing that reads this document back would take them for numbers — a
 * failure here beats a payload the receiver rejects.
 */
export const numberAsText: XmlTextWriter<number> = {
  write(value: number, path: string): string {
    if (!Number.isFinite(value)) {
      throw new XmlBindException(path, `${String(value)} cannot be written as a number`);
    }
    return String(value);
  },
};

/** Java's `int` and `long`: digits and an optional sign. Refuses anything JavaScript was not holding exactly. */
export const integerAsText: XmlTextWriter<number> = {
  write(value: number, path: string): string {
    if (!Number.isSafeInteger(value)) {
      throw new XmlBindException(path, `${String(value)} is not an integer that can be written exactly`);
    }
    return String(value);
  },
};

/** `true` or `false` — the two spellings of `xs:boolean` that a person reading the document will expect. */
export const booleanAsText: XmlTextWriter<boolean> = {
  write(value: boolean): string {
    return value ? "true" : "false";
  },
};

/**
 * Converts a value and then writes it — the hinge between the type a caller holds and its lexical form, and the
 * mirror of `mappingText`.
 *
 * ```ts
 * const isoDate = mappingAsText(stringAsText, (date: Date) => date.toISOString());
 * ```
 */
export function mappingAsText<T, R>(text: XmlTextWriter<T>, transform: (value: R) => T): XmlTextWriter<R> {
  return {
    write(value: R, path: string): string {
      return text.write(transform(value), path);
    },
  };
}

/** The element-level counterpart of {@link mappingAsText}: take the value apart, then write what comes out. */
export function mappingElementFrom<T, R>(writer: XmlWriter<T>, transform: (value: R) => T): XmlWriter<R> {
  return {
    write(value: R, name: string, path: string = rootPath(name)): XmlElement {
      return writer.write(transform(value), name, path);
    },
  };
}

/**
 * A DTO: one part per property, assembled into an element.
 *
 * ```ts
 * const item = elementFrom<Item>({ sku: intoAttribute("sku"), quantity: intoChildText("quantity", integerAsText) });
 * ```
 *
 * Every property gets written — {@link intoOptionalAttribute}, {@link intoOptionalChild} and
 * {@link intoChildren} are the three that write nothing when there is nothing to say. Attributes and children
 * come out in the order the parts are declared here, so the document's shape is readable off the contract.
 *
 * Pass the source type explicitly, `elementFrom<Order>({...})`, so a forgotten property is a compile error
 * rather than a field quietly missing from everything this sends.
 */
export function elementFrom<T extends object>(parts: XmlParts<T>): XmlWriter<T> {
  // Same widening as elementOf in XmlReader, for the same reason: XmlParts<T> is a mapped type over an
  // unresolved T, which nothing built in describes as an ordinary record. Each part is handed back exactly the
  // property it was declared against, so the cast is sound.
  const widened = parts as unknown as Readonly<Record<string, XmlPart<unknown>>>;
  const writers: readonly (readonly [string, XmlPart<unknown>])[] = Object.entries(widened);
  return {
    write(value: T, name: string, path: string = rootPath(name)): XmlElement {
      const source = value as unknown as Readonly<Record<string, unknown>>;
      const draft = new XmlDraft();
      for (const [property, part] of writers) {
        part.write(source[property], draft, path);
      }
      return draft.build(name);
    },
  };
}

/**
 * An element whose value is its character data: `<total>19.99</total>`.
 *
 * The whole element, so it composes as the writer inside {@link intoChild} or {@link intoChildren}. For the
 * text of an element that also carries attributes, {@link intoText} is the part to reach for.
 */
export function textElementFrom(): XmlWriter<string>;
export function textElementFrom<T>(text: XmlTextWriter<T>): XmlWriter<T>;
export function textElementFrom<T>(text?: XmlTextWriter<T>): XmlWriter<T> | XmlWriter<string> {
  return text === undefined ? textElementOf(stringAsText) : textElementOf(text);
}

/**
 * The body behind the overloads above.
 *
 * Every writer that takes character data may be called without one, meaning {@link stringAsText}. A default
 * parameter cannot express that: `stringAsText` is an `XmlTextWriter<string>`, and no cast makes it an
 * `XmlTextWriter<T>` for a `T` the caller is free to name — `textElementFrom<number>()` would type-check and
 * then hand a number to something that only knows strings. So the arity is a pair of overloads, exactly as it
 * is on the reading side, and the work lives in functions that take the writer as an ordinary argument.
 */
function textElementOf<T>(text: XmlTextWriter<T>): XmlWriter<T> {
  return {
    write(value: T, name: string, path: string = rootPath(name)): XmlElement {
      return new XmlElement(name, [], [], text.write(value, path));
    },
  };
}

/** An attribute on the element being built. Always written; see {@link intoOptionalAttribute} for the other case. */
export function intoAttribute(name: string): XmlPart<string>;
export function intoAttribute<T>(name: string, text: XmlTextWriter<T>): XmlPart<T>;
export function intoAttribute<T>(name: string, text?: XmlTextWriter<T>): XmlPart<T> | XmlPart<string> {
  return text === undefined ? attributeOf(name, stringAsText) : attributeOf(name, text);
}

function attributeOf<T>(name: string, text: XmlTextWriter<T>): XmlPart<T> {
  requireName(name, "an attribute name");
  return {
    write(value: T, into: XmlDraft, path: string): void {
      into.putAttribute(name, text.write(value, `${path}/@${name}`));
    },
  };
}

/**
 * An attribute written only when the value is there.
 *
 * An empty `Optional` leaves the attribute off the element entirely, which is the absence the reader's
 * `optionalAttribute` gives back an empty `Optional` for. A present empty string is still written — `sku=""` is
 * a different statement from no `sku` at all, and the round trip keeps them apart.
 */
export function intoOptionalAttribute(name: string): XmlPart<Optional<string>>;
export function intoOptionalAttribute<T>(name: string, text: XmlTextWriter<T>): XmlPart<Optional<T>>;
export function intoOptionalAttribute<T>(
  name: string,
  text?: XmlTextWriter<T>,
): XmlPart<Optional<T>> | XmlPart<Optional<string>> {
  return text === undefined ? optionalAttributeOf(name, stringAsText) : optionalAttributeOf(name, text);
}

function optionalAttributeOf<T>(name: string, text: XmlTextWriter<T>): XmlPart<Optional<T>> {
  const inner = attributeOf(name, text);
  return {
    write(value: Optional<T>, into: XmlDraft, path: string): void {
      value.ifPresent((present) => inner.write(present, into, path));
    },
  };
}

/**
 * The element's own character data, as a property of the DTO being written.
 *
 * For the element that carries both — `<total currency="USD">19.99</total>` writes `currency` with
 * {@link intoAttribute} and the amount with this. An element that is *only* text does not need a DTO around it
 * at all; that is {@link textElementFrom}.
 *
 * Text alongside children is written before them, and reads back that way, which is all the model records. The
 * one string that does not survive the round trip is whitespace-only text on an element that also has children:
 * a parser cannot tell it from the indentation it is required to drop.
 */
export function intoText(): XmlPart<string>;
export function intoText<T>(text: XmlTextWriter<T>): XmlPart<T>;
export function intoText<T>(text?: XmlTextWriter<T>): XmlPart<T> | XmlPart<string> {
  return text === undefined ? textOf(stringAsText) : textOf(text);
}

function textOf<T>(text: XmlTextWriter<T>): XmlPart<T> {
  return {
    write(value: T, into: XmlDraft, path: string): void {
      into.setText(text.write(value, `${path}/text()`));
    },
  };
}

/** One child element with this name, written with the given writer. */
export function intoChild<T>(name: string, writer: XmlWriter<T>): XmlPart<T> {
  requireName(name, "an element name");
  return {
    write(value: T, into: XmlDraft, path: string): void {
      into.addChild(writer.write(value, name, `${path}/${name}`));
    },
  };
}

/**
 * A child element written only when the value is there, the mirror of the reader's `optionalChild`.
 *
 * Composes with the rest: an optional string is `intoOptionalChild("note", textElementFrom())`, and an optional
 * nested DTO is the same line with its own writer in place of the text one.
 */
export function intoOptionalChild<T>(name: string, writer: XmlWriter<T>): XmlPart<Optional<T>> {
  const inner = intoChild(name, writer);
  return {
    write(value: Optional<T>, into: XmlDraft, path: string): void {
      value.ifPresent((present) => inner.write(present, into, path));
    },
  };
}

/**
 * A child element holding nothing but text — the commonest shape in any document.
 *
 * `intoChildText("total", numberAsText)` is `intoChild("total", textElementFrom(numberAsText))`.
 */
export function intoChildText(name: string): XmlPart<string>;
export function intoChildText<T>(name: string, text: XmlTextWriter<T>): XmlPart<T>;
export function intoChildText<T>(name: string, text?: XmlTextWriter<T>): XmlPart<T> | XmlPart<string> {
  return text === undefined ? intoChild(name, textElementOf(stringAsText)) : intoChild(name, textElementOf(text));
}

/**
 * One child element per value, all under the same name, in order.
 *
 * A repeated element is how XML writes a collection and none of them is how it writes an empty one, so an empty
 * source writes nothing at all. Anything iterable will do — a {@link JavaList} read out of a document, or the
 * array a caller happened to have. Each element gets its own XPath index, 1-based: `/order/item[2]`.
 */
export function intoChildren<T>(name: string, writer: XmlWriter<T>): XmlPart<Iterable<T>> {
  requireName(name, "an element name");
  return {
    write(values: Iterable<T>, into: XmlDraft, path: string): void {
      let index = 1;
      for (const value of values) {
        into.addChild(writer.write(value, name, `${path}/${name}[${index}]`));
        index++;
      }
    },
  };
}

/**
 * A collection inside a container element: JAXB's `@XmlElementWrapper`, which is how a Java service writes a
 * `List<Item>` by default.
 *
 * ```xml
 * <items><item sku="hat"/><item sku="scarf"/></items>
 * ```
 *
 * The wrapper is written even when the collection is empty, giving `<items/>`, which is what JAXB does and what
 * a schema expecting the container will accept. The reader treats that and a missing wrapper alike, so both
 * spellings of "no items" survive a round trip either way round.
 */
export function intoWrappedChildren<T>(wrapper: string, name: string, writer: XmlWriter<T>): XmlPart<Iterable<T>> {
  requireName(wrapper, "an element name");
  const inner = intoChildren(name, writer);
  return {
    write(values: Iterable<T>, into: XmlDraft, path: string): void {
      const draft = new XmlDraft();
      inner.write(values, draft, `${path}/${wrapper}`);
      into.addChild(draft.build(wrapper));
    },
  };
}

/** How a document is laid out on the way out. Neither choice changes what reads back from it. */
export interface XmlFormat {
  /** Whether to head the document with `<?xml version="1.0" encoding="UTF-8"?>`, on its own line. Off by default. */
  readonly declaration?: boolean;
  /** The string to indent one level of nesting with. Left out, the document is a single line. */
  readonly indent?: string;
}

/**
 * Writes a value out as an XML document.
 *
 * The mirror of `readXml`, and the same contract read backwards: whatever this produces, `parseXml` reads back
 * as an equal element, and a matching reader reads back as an equal value. The root name is given here because
 * nothing below the outermost element ever knew it.
 *
 * ```ts
 * writeXml("order", value, order, { declaration: true, indent: "  " });
 * ```
 *
 * For the element rather than the text of it — to nest it in a document being built by hand, or to look at what
 * a contract produces — call `order.write(value, "order")` and keep the {@link XmlElement}.
 *
 * @throws {@link IllegalArgumentException} if `name` is not a usable XML name
 * @throws {@link XmlBindException} if some value has no XML representation, naming the slot as an XPath
 */
export function writeXml<T>(name: string, value: T, writer: XmlWriter<T>, format: XmlFormat = {}): string {
  requireName(name, "an element name");
  const root = writer.write(value, name);
  const body = format.indent === undefined ? root.toXml() : root.toIndentedXml(format.indent);
  return format.declaration === true ? `${DECLARATION}\n${body}` : body;
}
