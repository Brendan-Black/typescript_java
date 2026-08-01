import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { List } from "../src/collections/List.js";
import { JavaMap } from "../src/collections/Map.js";
import { IllegalArgumentException } from "../src/exceptions/IllegalArgumentException.js";
import { XmlBindException } from "../src/exceptions/XmlBindException.js";
import { XmlParseException } from "../src/exceptions/XmlParseException.js";
import { boilerplateEqualityCheck, JavaObject } from "../src/fundamentals/Object.js";
import { hashAll } from "../src/fundamentals/Hashing.js";
import { Optional } from "../src/fundamentals/Optional.js";
import { parseXml, XmlElement } from "../src/serialization/XmlParser.js";
import {
  attribute,
  booleanText,
  child,
  childText,
  children,
  elementNamed,
  elementOf,
  entries,
  enumText,
  integerText,
  mappingElement,
  mappingText,
  numberText,
  optionalAttribute,
  optionalChild,
  rawText,
  readXml,
  stringText,
  textContent,
  textElement,
  wrappedChildren,
  wrappedEntries,
  type XmlReader,
} from "../src/serialization/XmlReader.js";

interface Money {
  currency: string;
  amount: number;
}

interface Item {
  sku: string;
  quantity: number;
}

type Priority = "high" | "normal";

interface Order {
  id: string;
  priority: Priority;
  total: Money;
  note: Optional<string>;
  items: List<Item>;
  paid: boolean;
}

const money: XmlReader<Money> = elementOf<Money>({
  currency: attribute("currency"),
  amount: textContent(numberText),
});

const item: XmlReader<Item> = elementOf<Item>({
  sku: attribute("sku"),
  quantity: childText("quantity", integerText),
});

const order: XmlReader<Order> = elementOf<Order>({
  id: attribute("id"),
  priority: attribute("priority", enumText<Priority>("high", "normal")),
  total: child("total", money),
  note: optionalChild("note", textElement()),
  items: wrappedChildren("items", "item", item),
  paid: childText("paid", booleanText),
});

const document = `<?xml version="1.0" encoding="UTF-8"?>
<order id="A-1" priority="high">
  <total currency="USD">19.99</total>
  <note>gift wrap</note>
  <items>
    <item sku="hat"><quantity>2</quantity></item>
    <item sku="scarf"><quantity>1</quantity></item>
  </items>
  <paid>true</paid>
</order>`;

/** The failure a document produces against a reader, so a test can pin the path it names. */
function bindFailure<T>(text: string, reader: XmlReader<T>): XmlBindException {
  try {
    readXml(text, reader);
  } catch (error) {
    assert.ok(error instanceof XmlBindException, `expected an XmlBindException, got ${String(error)}`);
    return error;
  }
  throw new Error(`expected ${text} to be refused`);
}

describe("XmlReader text", () => {
  it("trims by default, because indentation is not content", () => {
    assert.equal(textElement().read(parseXml("<name>\n  Ada\n</name>")), "Ada");
    assert.equal(stringText.read("  Ada  ", "/name"), "Ada");
  });

  it("keeps every character when asked to", () => {
    assert.equal(textElement(rawText).read(parseXml("<name> Ada </name>")), " Ada ");
  });

  it("reads numbers, integers and booleans in their XML Schema forms", () => {
    assert.equal(numberText.read(" 19.99 ", "/x"), 19.99);
    assert.equal(numberText.read("-2e3", "/x"), -2000);
    assert.equal(numberText.read("+.5", "/x"), 0.5);
    assert.equal(integerText.read("-42", "/x"), -42);
    assert.equal(booleanText.read("true", "/x"), true);
    assert.equal(booleanText.read("1", "/x"), true);
    assert.equal(booleanText.read("false", "/x"), false);
    assert.equal(booleanText.read("0", "/x"), false);
  });

  it("refuses the shapes a bare Number() would have accepted", () => {
    assert.throws(() => numberText.read("0x1f", "/x"), XmlBindException);
    assert.throws(() => numberText.read("Infinity", "/x"), XmlBindException);
    assert.throws(() => numberText.read("", "/x"), XmlBindException);
    assert.throws(() => numberText.read("12 apples", "/x"), XmlBindException);
  });

  it("refuses a fraction where an integer was promised, and a value too large to hold", () => {
    assert.throws(() => integerText.read("1.5", "/x"), XmlBindException);
    assert.match(bindFailure("<x>9007199254740993</x>", textElement(integerText)).message, /too large/);
  });

  it("refuses a literal that overflows, rather than reading it as Infinity", () => {
    assert.match(bindFailure("<total>1e400</total>", textElement(numberText)).message, /too large/);
    assert.throws(() => numberText.read("-1e400", "/x"), XmlBindException);
    assert.equal(numberText.read("1e308", "/x"), 1e308);
  });

  it("refuses a boolean Java's own parseBoolean would have called false", () => {
    const error = bindFailure("<paid>yes</paid>", textElement(booleanText));
    assert.match(error.message, /expected true or false, got "yes"/);
  });

  it("names the alternatives when an enumerated value is not one of them", () => {
    const priority = textElement(enumText("high", "normal"));
    assert.equal(priority.read(parseXml("<priority>high</priority>")), "high");
    assert.match(bindFailure("<priority>urgent</priority>", priority).message, /one of high, normal, got "urgent"/);
  });

  it("says nothing rather than an empty pair of quotes when the text is missing", () => {
    assert.match(bindFailure("<total/>", textElement(numberText)).message, /expected a number, got nothing/);
  });

  it("cuts a long value short so the message stays readable", () => {
    const error = bindFailure(`<total>${"9".repeat(80)}x</total>`, textElement(numberText));
    assert.match(error.message, /9{40}…/);
    assert.ok(error.message.length < 100);
  });

  it("converts after reading, so a transform never has to defend itself", () => {
    const millis = mappingText(integerText, (seconds) => seconds * 1000);
    assert.equal(textElement(millis).read(parseXml("<age>3</age>")), 3000);
    assert.throws(() => textElement(millis).read(parseXml("<age>later</age>")), XmlBindException);
  });
});

describe("XmlReader fields", () => {
  it("reads an attribute, and refuses one that is not there", () => {
    assert.equal(attribute("sku").read(parseXml(`<item sku="hat"/>`), "/item"), "hat");
    const error = bindFailure("<item/>", elementOf<{ sku: string }>({ sku: attribute("sku") }));
    assert.equal(error.getPath(), "/item/@sku");
    assert.match(error.message, /<item> has no sku attribute/);
  });

  it("treats an empty attribute as present", () => {
    const reader = elementOf<{ sku: Optional<string> }>({ sku: optionalAttribute("sku") });
    assert.equal(readXml(`<item sku=""/>`, reader).sku.get(), "");
    assert.ok(readXml("<item/>", reader).sku.isEmpty());
  });

  it("reads one child, refusing both none and several", () => {
    const reader = elementOf<{ total: number }>({ total: childText("total", numberText) });
    assert.equal(readXml("<order><total>2</total></order>", reader).total, 2);
    assert.match(bindFailure("<order/>", reader).message, /<order> has no <total> child/);
    const repeated = bindFailure("<order><total>1</total><total>2</total></order>", reader);
    assert.match(repeated.message, /expected one <total>, got 2/);
  });

  it("reads an optional child, refusing only the repeated case", () => {
    const reader = elementOf<{ note: Optional<string> }>({ note: optionalChild("note", textElement()) });
    assert.equal(readXml("<order><note>x</note></order>", reader).note.get(), "x");
    assert.ok(readXml("<order/>", reader).note.isEmpty());
    const repeated = bindFailure("<order><note>x</note><note>y</note></order>", reader);
    assert.match(repeated.message, /expected at most one <note>, got 2/);
  });

  it("reads repeated children, in order, and none as an empty list", () => {
    const reader = elementOf<{ skus: List<string> }>({ skus: children("item", textElement()) });
    assert.deepEqual([...readXml("<order><item>hat</item><item>scarf</item></order>", reader).skus], [
      "hat",
      "scarf",
    ]);
    assert.equal(readXml("<order/>", reader).skus.size(), 0);
  });

  it("reads a wrapped collection, and an absent wrapper as empty", () => {
    const reader = elementOf<{ skus: List<string> }>({ skus: wrappedChildren("items", "item", textElement()) });
    assert.deepEqual([...readXml("<order><items><item>hat</item></items></order>", reader).skus], ["hat"]);
    assert.equal(readXml("<order/>", reader).skus.size(), 0);
    assert.equal(readXml("<order><items/></order>", reader).skus.size(), 0);
    const repeated = bindFailure("<order><items/><items/></order>", reader);
    assert.match(repeated.message, /expected at most one <items>, got 2/);
  });

  it("reads entry elements as a map, keyed however the document keys them", () => {
    const reader = elementOf<{ counts: JavaMap<string, number> }>({
      counts: entries("entry", attribute("key"), textContent(integerText)),
    });
    const counts = readXml(`<order><entry key="hat">2</entry><entry key="scarf">1</entry></order>`, reader).counts;
    assert.equal(counts.size(), 2);
    assert.equal(counts.get("hat"), 2);
    assert.equal(counts.get("scarf"), 1);
    assert.equal(readXml("<order/>", reader).counts.size(), 0);
  });

  it("takes the key and the value from wherever in the entry the contract points", () => {
    const reader = elementOf<{ counts: JavaMap<string, number> }>({
      counts: entries("entry", childText("k"), childText("v", integerText)),
    });
    const counts = readXml("<order><entry><k>hat</k><v>2</v></entry></order>", reader).counts;
    assert.equal(counts.get("hat"), 2);
  });

  it("keeps the last of a repeated key, as the JSON pair form does", () => {
    const reader = elementOf<{ counts: JavaMap<string, number> }>({
      counts: entries("entry", attribute("key"), textContent(integerText)),
    });
    const counts = readXml(`<order><entry key="hat">2</entry><entry key="hat">5</entry></order>`, reader).counts;
    assert.equal(counts.size(), 1);
    assert.equal(counts.get("hat"), 5);
  });

  it("indexes an entry that fails by its position, key and value alike", () => {
    const reader = elementOf<{ counts: JavaMap<string, number> }>({
      counts: entries("entry", attribute("key"), textContent(integerText)),
    });
    const bad = bindFailure(`<order><entry key="hat">2</entry><entry key="scarf">x</entry></order>`, reader);
    assert.equal(bad.getPath(), "/order/entry[2]/text()");
    assert.equal(bindFailure(`<order><entry>2</entry></order>`, reader).getPath(), "/order/entry[1]/@key");
  });

  it("reads a wrapped map, and an absent wrapper as empty", () => {
    const reader = elementOf<{ counts: JavaMap<string, number> }>({
      counts: wrappedEntries("counts", "entry", attribute("key"), textContent(integerText)),
    });
    const found = readXml(`<order><counts><entry key="hat">2</entry></counts></order>`, reader).counts;
    assert.equal(found.get("hat"), 2);
    assert.equal(readXml("<order/>", reader).counts.size(), 0);
    assert.equal(readXml("<order><counts/></order>", reader).counts.size(), 0);
    const repeated = bindFailure("<order><counts/><counts/></order>", reader);
    assert.match(repeated.message, /expected at most one <counts>, got 2/);
    assert.equal(repeated.getPath(), "/order/counts");
  });

  it("reads an element carrying both an attribute and a value", () => {
    const total = readXml(`<total currency="USD">19.99</total>`, money);
    assert.equal(total.currency, "USD");
    assert.equal(total.amount, 19.99);
  });

  it("ignores anything the contract does not mention", () => {
    const reader = elementOf<{ id: string }>({ id: attribute("id") });
    assert.equal(readXml(`<order id="A-1" tracking="Z"><extra>x</extra></order>`, reader).id, "A-1");
  });
});

describe("XmlReader elements", () => {
  it("checks the root's name when the contract says one", () => {
    const reader = elementNamed("order", elementOf<{ id: string }>({ id: attribute("id") }));
    assert.equal(readXml(`<order id="A-1"/>`, reader).id, "A-1");
    const error = bindFailure(`<error id="A-1"/>`, reader);
    assert.equal(error.getPath(), "/error");
    assert.match(error.message, /expected <order>, got <error>/);
  });

  it("compares the name as written, prefix included", () => {
    assert.throws(() => readXml("<soap:Body/>", elementNamed("Body", textElement())), XmlBindException);
    assert.equal(readXml("<soap:Body>x</soap:Body>", elementNamed("soap:Body", textElement())), "x");
  });

  it("builds a class through mappingElement rather than knowing about constructors", () => {
    class Point extends JavaObject {
      constructor(
        public readonly x: number,
        public readonly y: number,
      ) {
        super();
      }

      public override equals(other: unknown): boolean {
        return boilerplateEqualityCheck<Point>({ obj1: this, obj2: other }, (a, b) => a.x === b.x && a.y === b.y);
      }

      public override hashCode(): number {
        return hashAll(this.x, this.y);
      }
    }

    const point = mappingElement(
      elementOf<{ x: number; y: number }>({ x: attribute("x", numberText), y: attribute("y", numberText) }),
      ({ x, y }) => new Point(x, y),
    );
    assert.ok(readXml(`<point x="1" y="2"/>`, point).equals(new Point(1, 2)));
  });

  it("reads an element handed to it directly, with no document around it", () => {
    const element = new XmlElement("item", [["sku", "hat"]], [new XmlElement("quantity", [], [], "3")]);
    assert.deepEqual(item.read(element), { sku: "hat", quantity: 3 });
  });
});

describe("readXml", () => {
  it("binds a JAXB-shaped document end to end", () => {
    const bound = readXml(document, elementNamed("order", order));
    assert.equal(bound.id, "A-1");
    assert.equal(bound.priority, "high");
    assert.deepEqual(bound.total, { currency: "USD", amount: 19.99 });
    assert.equal(bound.note.get(), "gift wrap");
    assert.equal(bound.paid, true);
    assert.equal(bound.items.size(), 2);
    assert.deepEqual(bound.items.get(0), { sku: "hat", quantity: 2 });
    assert.deepEqual(bound.items.get(1), { sku: "scarf", quantity: 1 });
  });

  it("keeps the two failure kinds apart", () => {
    assert.throws(() => readXml("<order", order), XmlParseException);
    assert.throws(() => readXml("<order/>", order), XmlBindException);
    // and both are the one thing a caller who does not care can catch
    assert.throws(() => readXml("<order", order), IllegalArgumentException);
    assert.throws(() => readXml("<order/>", order), IllegalArgumentException);
  });

  it("points an XPath at the exact slot that failed", () => {
    const broken = document.replace("<quantity>1</quantity>", "<quantity>one</quantity>");
    const error = bindFailure(broken, elementNamed("order", order));
    assert.equal(error.getPath(), "/order/items/item[2]/quantity");
    assert.match(error.message, /expected an integer, got "one"/);
  });

  it("indexes repeated elements from one, as XPath does", () => {
    const reader = elementOf<{ items: List<number> }>({ items: children("item", textElement(integerText)) });
    const error = bindFailure("<order><item>1</item><item>x</item></order>", reader);
    assert.equal(error.getPath(), "/order/item[2]");
  });

  it("names an attribute with an @, and text content with text()", () => {
    assert.equal(bindFailure(`<total currency="USD">x</total>`, money).getPath(), "/total/text()");
    const reader = elementOf<{ amount: number }>({ amount: attribute("amount", numberText) });
    assert.equal(bindFailure(`<total amount="x"/>`, reader).getPath(), "/total/@amount");
  });

  it("defaults the path to the root element's own name", () => {
    assert.equal(bindFailure("<total>x</total>", textElement(numberText)).getPath(), "/total");
    assert.equal(textElement(rawText).read(new XmlElement("total", [], [], " 1 ")), " 1 ");
  });

  it("reads a document this library's own writer produced", () => {
    const written = parseXml(document).toXml();
    assert.deepEqual(readXml(written, elementNamed("order", order)), readXml(document, elementNamed("order", order)));
  });
});
