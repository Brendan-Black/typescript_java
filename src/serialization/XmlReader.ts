import { List } from "../collections/List.js";
import { JavaMap } from "../collections/Map.js";
import { XmlBindException } from "../exceptions/XmlBindException.js";
import { Optional } from "../fundamentals/Optional.js";
import { parseXml, XmlElement } from "./XmlParser.js";

/**
 * Reads a whole element into a `T` — the XML counterpart of a `JsonReader`, and JAXB's unmarshaller in the role
 * it actually plays on a DTO.
 *
 * XML binding needs one more layer than JSON does, because an XML element has three places a value can hide:
 * its attributes, its child elements, and its own text. So there are three kinds of reader here rather than one,
 * and they stack:
 *
 * - an {@link XmlTextReader} turns character data into a value — {@link stringText}, {@link numberText};
 * - an {@link XmlField} pulls one value *out of* an element — {@link attribute}, {@link child},
 *   {@link children}, {@link entries}, {@link textContent};
 * - an `XmlReader` turns an element into a `T` — {@link elementOf} over a set of fields, or
 *   {@link textElement} for an element that is just a value.
 *
 * Put together, a JAXB-shaped document reads as one declaration:
 *
 * ```ts
 * interface Item { sku: string; quantity: number; }
 * interface Order { id: string; total: number; note: Optional<string>; items: List<Item>; }
 *
 * const item: XmlReader<Item> = elementOf<Item>({
 *   sku: attribute("sku"),
 *   quantity: childText("quantity", integerText),
 * });
 *
 * const order: XmlReader<Order> = elementOf<Order>({
 *   id: attribute("id"),
 *   total: childText("total", numberText),
 *   note: optionalChild("note", textElement()),
 *   items: wrappedChildren("items", "item", item),
 * });
 *
 * readXml(body, elementNamed("order", order));
 * ```
 *
 * Failures carry an XPath to the exact slot — see {@link XmlBindException}.
 */
export interface XmlReader<T> {
  /**
   * @param element the element to read
   * @param path where this element sits in the document, as an XPath. Supplied by the composing readers;
   *   a caller reading a whole document can leave it alone and get `/root-element-name`.
   * @throws {@link XmlBindException} if the element does not match this contract
   */
  read(element: XmlElement, path?: string): T;
}

/**
 * Turns character data into a value: the contents of an element, or of an attribute.
 *
 * Text is all XML has — there are no types on the wire, only strings — so every scalar in a document goes
 * through one of these. The path is required rather than defaulted, because character data has no name of its
 * own and cannot invent a sensible one; whoever holds the text knows where it came from.
 */
export interface XmlTextReader<T> {
  /** @throws {@link XmlBindException} if the text is not a value this reader accepts */
  read(text: string, path: string): T;
}

/**
 * Pulls one value out of an element: an attribute, a child, a run of children, or the element's own text.
 *
 * This is the piece JSON does not need. `objectOf` can name a field and index the object with it, but an XML
 * field has to say *where* to look before it can say what to read, and `@id` and `<id>` are different places.
 */
export interface XmlField<T> {
  /**
   * @param parent the element the value is being taken out of
   * @param path the XPath of `parent` — this field appends its own step to it
   * @throws {@link XmlBindException} if the value is missing or does not match
   */
  read(parent: XmlElement, path: string): T;
}

/** A field per property of `T`, which is what {@link elementOf} needs to build one. */
export type XmlFields<T> = {
  readonly [K in keyof T]: XmlField<T[K]>;
};

/** The XPath of a root element, used when a caller reads a document without supplying a path. */
function rootPath(element: XmlElement): string {
  return `/${element.getName()}`;
}

/** Text in a message: quoted, and cut short so a failure on a large document stays readable. */
function quote(text: string): string {
  const shown = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return `"${shown}"`;
}

function fail(path: string, expected: string, text: string): never {
  throw new XmlBindException(path, `expected ${expected}, got ${text === "" ? "nothing" : quote(text)}`);
}

/**
 * Character data as a string, with the surrounding whitespace trimmed.
 *
 * Trimming is the default because indentation is not content: a value written as `<name>Ada</name>` on one line
 * and across three should read the same, and every document that pretty-prints itself would otherwise deliver
 * strings with newlines glued to them. XML Schema's own `xs:token` does the same. When the whitespace is the
 * point — a fixed-width record, a chunk of source code — use {@link rawText}, which keeps every character.
 */
export const stringText: XmlTextReader<string> = {
  read(text: string): string {
    return text.trim();
  },
};

/** Character data exactly as it was written, whitespace and all. The counterpart to {@link stringText}. */
export const rawText: XmlTextReader<string> = {
  read(text: string): string {
    return text;
  },
};

/**
 * Java's numeric types as XML Schema writes them: an optional sign, digits, an optional fraction and exponent.
 *
 * The format is checked rather than handed to `Number`, which would otherwise accept `0x1f`, `Infinity` and the
 * empty string — none of which any Java service will have written, and all of which would arrive as a plausible
 * looking number rather than as the mismatch they are.
 *
 * A literal too large for a `double` is refused as well, because the format alone does not catch it: `1e400` is
 * spelled exactly as XML Schema requires and overflows to `Infinity`, which is not a number the document said.
 */
export const numberText: XmlTextReader<number> = {
  read(text: string, path: string): number {
    const trimmed = text.trim();
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
      return fail(path, "a number", trimmed);
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      throw new XmlBindException(path, `${trimmed} is too large to read as a number`);
    }
    return value;
  },
};

/** Java's `int` and `long`: digits and an optional sign, nothing else. Refuses anything JavaScript cannot hold. */
export const integerText: XmlTextReader<number> = {
  read(text: string, path: string): number {
    const trimmed = text.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) {
      return fail(path, "an integer", trimmed);
    }
    const value = Number(trimmed);
    if (!Number.isSafeInteger(value)) {
      throw new XmlBindException(path, `${trimmed} is too large to read exactly as a number`);
    }
    return value;
  },
};

/**
 * XML Schema's `xs:boolean`, which is four spellings rather than two: `true`, `false`, `1` and `0`.
 *
 * Java's own `Boolean.parseBoolean` is looser still — it answers `false` to anything that is not `"true"`, so a
 * typo reads as a deliberate no. That is the wrong end of the trade for a wire contract, and this refuses it.
 */
export const booleanText: XmlTextReader<boolean> = {
  read(text: string, path: string): boolean {
    const trimmed = text.trim();
    if (trimmed === "true" || trimmed === "1") {
      return true;
    }
    if (trimmed === "false" || trimmed === "0") {
      return false;
    }
    return fail(path, "true or false", trimmed);
  },
};

/** Java's `Enum.valueOf`: one of a fixed set of strings, or a bind failure naming the ones that were allowed. */
export function enumText<T extends string>(...values: readonly T[]): XmlTextReader<T> {
  const allowed = new Set<string>(values);
  return {
    read(text: string, path: string): T {
      const trimmed = text.trim();
      if (!allowed.has(trimmed)) {
        throw new XmlBindException(path, `expected one of ${values.join(", ")}, got ${quote(trimmed)}`);
      }
      return trimmed as T;
    },
  };
}

/**
 * Reads text and then converts it — the hinge between a lexical form and the type a caller wants.
 *
 * ```ts
 * const isoDate = mappingText(stringText, (text) => new Date(text));
 * ```
 */
export function mappingText<T, R>(text: XmlTextReader<T>, transform: (value: T) => R): XmlTextReader<R> {
  return {
    read(value: string, path: string): R {
      return transform(text.read(value, path));
    },
  };
}

/** The element-level counterpart of {@link mappingText}: read the element, then build something from it. */
export function mappingElement<T, R>(reader: XmlReader<T>, transform: (value: T) => R): XmlReader<R> {
  return {
    read(element: XmlElement, path: string = rootPath(element)): R {
      return transform(reader.read(element, path));
    },
  };
}

/**
 * Requires the element to carry a particular tag name before reading it.
 *
 * Mostly for the root: nothing above a document's outermost element ever checked its name, so a contract that
 * does not say it will happily read a `<error>` envelope as the `<order>` it was hoping for.
 *
 * The name is compared as written, prefix included. To match regardless of prefix, compare
 * `XmlElement.getLocalName` yourself — this reader does not guess which of the two you meant.
 */
export function elementNamed<T>(name: string, reader: XmlReader<T>): XmlReader<T> {
  return {
    read(element: XmlElement, path: string = rootPath(element)): T {
      if (element.getName() !== name) {
        throw new XmlBindException(path, `expected <${name}>, got <${element.getName()}>`);
      }
      return reader.read(element, path);
    },
  };
}

/**
 * An element whose value is its character data: `<total>19.99</total>`.
 *
 * Attributes and children on such an element are ignored, which is Jackson's and JAXB's rule about anything the
 * contract does not mention — a document that grows a field should not break a reader that never wanted it.
 */
export function textElement(): XmlReader<string>;
export function textElement<T>(text: XmlTextReader<T>): XmlReader<T>;
export function textElement<T>(text?: XmlTextReader<T>): XmlReader<T | string> {
  return textElementOf<T | string>(orString(text));
}

/**
 * The bodies behind the overloads above.
 *
 * Every reader that takes character data may be called without one, meaning {@link stringText}. A default
 * parameter cannot express that — `stringText` is an `XmlTextReader<string>`, and no cast makes it an
 * `XmlTextReader<T>` for a `T` the caller is free to name. So the arity is a pair of overloads, and the work
 * lives in these unexported functions, which take the reader as an ordinary required argument.
 */
function textElementOf<T>(text: XmlTextReader<T>): XmlReader<T> {
  return {
    read(element: XmlElement, path: string = rootPath(element)): T {
      return text.read(element.getText(), path);
    },
  };
}

/** {@link stringText} when a text reader was left out, and the caller's when it was not. */
function orString<T>(text: XmlTextReader<T> | undefined): XmlTextReader<T | string> {
  return text ?? stringText;
}

/**
 * A DTO: one field per property, applied to an element.
 *
 * ```ts
 * const item = elementOf<Item>({ sku: attribute("sku"), quantity: childText("quantity", integerText) });
 * ```
 *
 * Properties are required unless their own field says otherwise — {@link optionalAttribute},
 * {@link optionalChild} and {@link children} are the three ways to say it — so a slot going missing is a
 * failure at the slot rather than an `undefined` that travels. Anything in the document the contract does not
 * mention is ignored.
 *
 * Pass the target type explicitly, `elementOf<Order>({...})`, so a forgotten property is a compile error rather
 * than a shape TypeScript infers around. A property declared optional — `note?: string` — is the exception:
 * {@link XmlFields} keeps the `?`, so such a property may be left out of the contract, and is then never read.
 */
export function elementOf<T extends object>(fields: XmlFields<T>): XmlReader<T> {
  // Same widening as objectOf in JsonReader, for the same reason: XmlFields<T> is a mapped type over an
  // unresolved T, which nothing built in describes as an ordinary record. The pairs it yields are read back
  // into exactly the keys T declares, so the cast on the way out is sound.
  const widened = fields as unknown as Readonly<Record<string, XmlField<unknown>>>;
  const readers: readonly (readonly [string, XmlField<unknown>])[] = Object.entries(widened);
  return {
    read(element: XmlElement, path: string = rootPath(element)): T {
      // Built with `fromEntries` rather than assigned into, as `objectOf` is: assigning a property named
      // `__proto__` sets the result's prototype instead of giving it that property, so a contract declaring one
      // would produce an object missing it. `fromEntries` defines every key as a plain one, whatever it is
      // called. Nothing is read through a prototype here — the source is an element, not an object.
      const read = readers.map(([property, field]) => [property, field.read(element, path)] as const);
      return Object.fromEntries(read) as T;
    },
  };
}

/** An attribute of the element being read. Missing is a failure; see {@link optionalAttribute} for the other case. */
export function attribute(name: string): XmlField<string>;
export function attribute<T>(name: string, text: XmlTextReader<T>): XmlField<T>;
export function attribute<T>(name: string, text?: XmlTextReader<T>): XmlField<T | string> {
  return attributeOf<T | string>(name, orString(text));
}

function attributeOf<T>(name: string, text: XmlTextReader<T>): XmlField<T> {
  return {
    read(parent: XmlElement, path: string): T {
      const at = `${path}/@${name}`;
      const value = parent.getAttribute(name);
      if (value.isEmpty()) {
        throw new XmlBindException(at, `<${parent.getName()}> has no ${name} attribute`);
      }
      return text.read(value.get(), at);
    },
  };
}

/**
 * An attribute that need not be there.
 *
 * An attribute written as empty — `sku=""` — is present, and reads as a present empty string. XML draws that
 * line where JSON draws the one between `null` and a missing key.
 */
export function optionalAttribute(name: string): XmlField<Optional<string>>;
export function optionalAttribute<T>(name: string, text: XmlTextReader<T>): XmlField<Optional<T>>;
export function optionalAttribute<T>(name: string, text?: XmlTextReader<T>): XmlField<Optional<T | string>> {
  return optionalAttributeOf<T | string>(name, orString(text));
}

function optionalAttributeOf<T>(name: string, text: XmlTextReader<T>): XmlField<Optional<T>> {
  return {
    read(parent: XmlElement, path: string): Optional<T> {
      return parent.getAttribute(name).map((value) => text.read(value, `${path}/@${name}`));
    },
  };
}

/**
 * The element's own character data, as a property of the DTO being built.
 *
 * For the element that carries both — `<total currency="USD">19.99</total>` binds `currency` with
 * {@link attribute} and the amount with this. An element that is *only* text does not need a DTO around it at
 * all; that is {@link textElement}.
 */
export function textContent(): XmlField<string>;
export function textContent<T>(text: XmlTextReader<T>): XmlField<T>;
export function textContent<T>(text?: XmlTextReader<T>): XmlField<T | string> {
  return textContentOf<T | string>(orString(text));
}

function textContentOf<T>(text: XmlTextReader<T>): XmlField<T> {
  return {
    read(parent: XmlElement, path: string): T {
      return text.read(parent.getText(), `${path}/text()`);
    },
  };
}

/**
 * Exactly one child element with this name, read with the given reader.
 *
 * Both failure modes are real: none means the document is missing something the contract requires, and more
 * than one means it is saying something the contract has no room for — a repeated element bound to a single
 * property is how data silently disappears in hand-written XML handling. Use {@link children} when repetition
 * is expected, {@link optionalChild} when absence is.
 */
export function child<T>(name: string, reader: XmlReader<T>): XmlField<T> {
  return {
    read(parent: XmlElement, path: string): T {
      const at = `${path}/${name}`;
      const found = parent.getChildrenNamed(name);
      if (found.size() === 0) {
        throw new XmlBindException(at, `<${parent.getName()}> has no <${name}> child`);
      }
      if (found.size() > 1) {
        throw new XmlBindException(at, `expected one <${name}>, got ${found.size()}`);
      }
      return reader.read(found.get(0), at);
    },
  };
}

/**
 * A child element that need not be there, as an `Optional`.
 *
 * Composes with the rest: an optional string field is `optionalChild("note", textElement())`, and an optional
 * nested DTO is the same line with its own reader in place of the text one. More than one match is still a
 * failure, for the reason {@link child} gives.
 */
export function optionalChild<T>(name: string, reader: XmlReader<T>): XmlField<Optional<T>> {
  return {
    read(parent: XmlElement, path: string): Optional<T> {
      const at = `${path}/${name}`;
      const found = parent.getChildrenNamed(name);
      if (found.size() > 1) {
        throw new XmlBindException(at, `expected at most one <${name}>, got ${found.size()}`);
      }
      return found.size() === 0 ? Optional.empty<T>() : Optional.of(reader.read(found.get(0), at));
    },
  };
}

/**
 * A child element holding nothing but text — the commonest shape in any document, short enough to deserve its
 * own name.
 *
 * `childText("total", numberText)` is `child("total", textElement(numberText))`.
 */
export function childText(name: string): XmlField<string>;
export function childText<T>(name: string, text: XmlTextReader<T>): XmlField<T>;
export function childText<T>(name: string, text?: XmlTextReader<T>): XmlField<T | string> {
  return child(name, textElementOf<T | string>(orString(text)));
}

/**
 * Every child element with this name, as a {@link List}, in document order.
 *
 * A repeated element is how XML writes a collection, and none of them is how it writes an empty one — so this
 * never fails for absence. Each element gets its own XPath index, 1-based: `/order/item[2]`.
 */
export function children<T>(name: string, reader: XmlReader<T>): XmlField<List<T>> {
  return {
    read(parent: XmlElement, path: string): List<T> {
      const found = parent.getChildrenNamed(name);
      const values = new List<T>();
      let index = 1;
      for (const element of found) {
        values.add(reader.read(element, `${path}/${name}[${index}]`));
        index++;
      }
      return values;
    },
  };
}

/**
 * A collection inside a container element: JAXB's `@XmlElementWrapper`, which is how a Java service writes
 * `List<Item> items` by default.
 *
 * ```xml
 * <items><item sku="hat"/><item sku="scarf"/></items>
 * ```
 *
 * An absent wrapper reads as an empty list rather than as a failure. The alternative — insisting on the
 * container — makes "no items" unwriteable for every sender that omits an empty list, and a caller who does
 * need to tell "no items" from "never said" can reach for `optionalChild` over the wrapper instead. Two
 * wrappers is still a failure: that is a document contradicting itself, not a shorthand.
 */
export function wrappedChildren<T>(wrapper: string, name: string, reader: XmlReader<T>): XmlField<List<T>> {
  const inner = children(name, reader);
  return {
    read(parent: XmlElement, path: string): List<T> {
      const at = `${path}/${wrapper}`;
      const found = parent.getChildrenNamed(wrapper);
      if (found.size() > 1) {
        throw new XmlBindException(at, `expected at most one <${wrapper}>, got ${found.size()}`);
      }
      return found.size() === 0 ? new List<T>() : inner.read(found.get(0), at);
    },
  };
}

/**
 * A {@link JavaMap} from repeated entry elements, one pair per element.
 *
 * ```xml
 * <counts><entry key="hat">2</entry><entry key="scarf">1</entry></counts>
 * ```
 *
 * ```ts
 * entries("entry", attribute("key"), textContent(integerText));
 * ```
 *
 * Where the key and the value sit inside each entry is the document's business, not this function's, so both
 * are ordinary {@link XmlField}s applied to the entry element. That covers every shape a map is written in: a
 * key attribute over the value as text, as above; `child("key", …)` and `child("value", …)` for the form JAXB's
 * `@XmlJavaTypeAdapter` examples produce; two attributes for a document that keeps both short.
 *
 * A repeated element is how XML writes a collection and none of them is how it writes an empty one, so this
 * never fails for absence. A document repeating a key keeps the last entry, which is what `mapOf` does with the
 * JSON form of the same contradiction. For a `TreeMap` rather than a hash one, `new TreeMap(map)` over
 * the result — the ordering is the caller's choice and nothing in the document says it.
 */
export function entries<K, V>(name: string, key: XmlField<K>, value: XmlField<V>): XmlField<JavaMap<K, V>> {
  return {
    read(parent: XmlElement, path: string): JavaMap<K, V> {
      const map = new JavaMap<K, V>();
      let index = 1;
      for (const element of parent.getChildrenNamed(name)) {
        // Both fields read the same element and share its path, because both values are inside the one entry.
        const at = `${path}/${name}[${index}]`;
        map.put(key.read(element, at), value.read(element, at));
        index++;
      }
      return map;
    },
  };
}

/**
 * The same entries inside a container element, which is how a map most often arrives.
 *
 * ```xml
 * <counts><entry key="hat">2</entry></counts>
 * ```
 *
 * ```ts
 * wrappedEntries("counts", "entry", attribute("key"), textContent(integerText));
 * ```
 *
 * {@link wrappedChildren} for a map, and absent and empty are treated the same way for the same reason: a
 * missing container reads as an empty map rather than as a failure, and two containers is still a document
 * contradicting itself.
 */
export function wrappedEntries<K, V>(
  wrapper: string,
  name: string,
  key: XmlField<K>,
  value: XmlField<V>,
): XmlField<JavaMap<K, V>> {
  const inner = entries(name, key, value);
  return {
    read(parent: XmlElement, path: string): JavaMap<K, V> {
      const at = `${path}/${wrapper}`;
      const found = parent.getChildrenNamed(wrapper);
      if (found.size() > 1) {
        throw new XmlBindException(at, `expected at most one <${wrapper}>, got ${found.size()}`);
      }
      return found.size() === 0 ? new JavaMap<K, V>() : inner.read(found.get(0), at);
    },
  };
}

/**
 * Parses an XML document and reads it in one step.
 *
 * The two failure types stay distinct — {@link XmlParseException} for a document that is not XML,
 * {@link XmlBindException} for one that is XML but not the agreed contract — because the sender has to do
 * something different about each. Both are `IllegalArgumentException`s if a caller only wants one `catch`.
 */
export function readXml<T>(text: string, reader: XmlReader<T>): T {
  const root = parseXml(text);
  return reader.read(root, rootPath(root));
}
