import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JavaList } from "../src/collections/JavaList.js";
import { IllegalArgumentException } from "../src/exceptions/IllegalArgumentException.js";
import { IllegalStateException } from "../src/exceptions/IllegalStateException.js";
import { XmlBindException } from "../src/exceptions/XmlBindException.js";
import { Optional } from "../src/fundamentals/Optional.js";
import { parseXml } from "../src/serialization/XmlParser.js";
import {
  attribute,
  childText,
  elementNamed,
  elementOf,
  enumText,
  integerText,
  numberText,
  optionalChild,
  rawText,
  readXml,
  textContent,
  textElement,
  wrappedChildren,
  booleanText,
  child,
  type XmlReader,
} from "../src/serialization/XmlReader.js";
import {
  booleanAsText,
  elementFrom,
  integerAsText,
  intoAttribute,
  intoChild,
  intoChildText,
  intoChildren,
  intoOptionalAttribute,
  intoOptionalChild,
  intoText,
  intoWrappedChildren,
  mappingAsText,
  mappingElementFrom,
  numberAsText,
  stringAsText,
  textElementFrom,
  writeXml,
  XmlDraft,
  type XmlWriter,
} from "../src/serialization/XmlWriter.js";

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
  items: JavaList<Item>;
  paid: boolean;
}

const money: XmlWriter<Money> = elementFrom<Money>({
  currency: intoAttribute("currency"),
  amount: intoText(numberAsText),
});

const item: XmlWriter<Item> = elementFrom<Item>({
  sku: intoAttribute("sku"),
  quantity: intoChildText("quantity", integerAsText),
});

const order: XmlWriter<Order> = elementFrom<Order>({
  id: intoAttribute("id"),
  priority: intoAttribute("priority"),
  total: intoChild("total", money),
  note: intoOptionalChild("note", textElementFrom()),
  items: intoWrappedChildren("items", "item", item),
  paid: intoChildText("paid", booleanAsText),
});

/** The same contract read backwards, so a round trip can be checked rather than only asserted about. */
const orderReader: XmlReader<Order> = elementOf<Order>({
  id: attribute("id"),
  priority: attribute("priority", enumText<Priority>("high", "normal")),
  total: child(
    "total",
    elementOf<Money>({ currency: attribute("currency"), amount: textContent(numberText) }),
  ),
  note: optionalChild("note", textElement()),
  items: wrappedChildren(
    "items",
    "item",
    elementOf<Item>({ sku: attribute("sku"), quantity: childText("quantity", integerText) }),
  ),
  paid: childText("paid", booleanText),
});

function anOrder(): Order {
  return {
    id: "A-1",
    priority: "high",
    total: { currency: "USD", amount: 19.99 },
    note: Optional.of("gift wrap"),
    items: new JavaList<Item>([
      { sku: "hat", quantity: 2 },
      { sku: "scarf", quantity: 1 },
    ]),
    paid: true,
  };
}

/** The failure a value produces against a writer, so a test can pin the path it names. */
function bindFailure<T>(value: T, writer: XmlWriter<T>, name: string = "root"): XmlBindException {
  try {
    writeXml(name, value, writer);
  } catch (error) {
    assert.ok(error instanceof XmlBindException, `expected an XmlBindException, got ${String(error)}`);
    return error;
  }
  throw new Error(`expected ${String(value)} to be refused`);
}

describe("XmlWriter text", () => {
  it("writes a string exactly as it stands, indentation and all", () => {
    assert.equal(stringAsText.write(" Ada ", "/name"), " Ada ");
    assert.equal(writeXml("name", " Ada ", textElementFrom()), "<name> Ada </name>");
    assert.equal(textElement(rawText).read(parseXml("<name> Ada </name>")), " Ada ");
  });

  it("writes numbers, integers and booleans in the forms the readers accept", () => {
    assert.equal(numberAsText.write(19.99, "/x"), "19.99");
    assert.equal(numberAsText.write(-2000, "/x"), "-2000");
    assert.equal(integerAsText.write(-42, "/x"), "-42");
    assert.equal(booleanAsText.write(true, "/x"), "true");
    assert.equal(booleanAsText.write(false, "/x"), "false");
    assert.equal(numberText.read(numberAsText.write(1e21, "/x"), "/x"), 1e21);
  });

  it("refuses the numbers XML has no form for", () => {
    assert.throws(() => numberAsText.write(Number.NaN, "/x/text()"), XmlBindException);
    assert.match(bindFailure(Number.POSITIVE_INFINITY, textElementFrom(numberAsText)).message, /Infinity/);
    assert.match(bindFailure(1.5, textElementFrom(integerAsText)).message, /not an integer/);
    assert.match(bindFailure(2 ** 53, textElementFrom(integerAsText)).message, /exactly/);
  });

  it("converts before writing", () => {
    const upper = mappingAsText(stringAsText, (value: string) => value.toUpperCase());
    assert.equal(writeXml("name", "ada", textElementFrom(upper)), "<name>ADA</name>");
  });

  it("escapes what has to be escaped, so the text reads back as itself", () => {
    const writer = elementFrom<{ body: string; note: string }>({
      body: intoText(),
      note: intoAttribute("note"),
    });
    const written = writeXml("a", { body: "1 < 2 & 3", note: 'a "friend"\nnext' }, writer);
    assert.equal(written, `<a note="a &quot;friend&quot;&#10;next">1 &lt; 2 &amp; 3</a>`);
    const back = parseXml(written);
    assert.equal(back.getText(), "1 < 2 & 3");
    assert.equal(back.getAttribute("note").get(), 'a "friend"\nnext');
  });
});

describe("XmlWriter parts", () => {
  it("writes attributes and children in the order the parts are declared", () => {
    const writer = elementFrom<{ z: string; m: string; first: string; second: string }>({
      z: intoAttribute("z"),
      m: intoAttribute("m"),
      first: intoChildText("first"),
      second: intoChildText("second"),
    });
    const written = writeXml("a", { z: "1", m: "2", first: "x", second: "y" }, writer);
    assert.equal(written, `<a z="1" m="2"><first>x</first><second>y</second></a>`);
  });

  it("leaves an absent optional out, and keeps a present empty one", () => {
    const writer = elementFrom<{ sku: Optional<string>; note: Optional<string> }>({
      sku: intoOptionalAttribute("sku"),
      note: intoOptionalChild("note", textElementFrom()),
    });
    assert.equal(writeXml("a", { sku: Optional.empty(), note: Optional.empty() }, writer), "<a/>");
    assert.equal(
      writeXml("a", { sku: Optional.of(""), note: Optional.of("x") }, writer),
      `<a sku=""><note>x</note></a>`,
    );
  });

  it("writes one child per value, and nothing for an empty collection", () => {
    const writer = elementFrom<{ tags: JavaList<string> }>({ tags: intoChildren("tag", textElementFrom()) });
    assert.equal(writeXml("a", { tags: new JavaList(["x", "y"]) }, writer), "<a><tag>x</tag><tag>y</tag></a>");
    assert.equal(writeXml("a", { tags: new JavaList<string>() }, writer), "<a/>");
  });

  it("takes any iterable, not only a JavaList", () => {
    const writer = elementFrom<{ tags: readonly string[] }>({ tags: intoChildren("tag", textElementFrom()) });
    assert.equal(writeXml("a", { tags: ["x"] }, writer), "<a><tag>x</tag></a>");
  });

  it("writes the wrapper even when the collection is empty, as JAXB does", () => {
    const writer = elementFrom<{ items: JavaList<string> }>({
      items: intoWrappedChildren("items", "item", textElementFrom()),
    });
    assert.equal(writeXml("a", { items: new JavaList<string>() }, writer), "<a><items/></a>");
    assert.equal(writeXml("a", { items: new JavaList(["hat"]) }, writer), "<a><items><item>hat</item></items></a>");
  });

  it("writes text alongside attributes and children", () => {
    const writer = elementFrom<{ amount: number; currency: string }>({
      amount: intoText(numberAsText),
      currency: intoAttribute("currency"),
    });
    assert.equal(writeXml("total", { amount: 19.99, currency: "USD" }, writer), `<total currency="USD">19.99</total>`);
  });

  it("builds a value with mappingElementFrom", () => {
    const point = elementFrom<{ x: number; y: number }>({
      x: intoAttribute("x", integerAsText),
      y: intoAttribute("y", integerAsText),
    });
    const writer = mappingElementFrom(point, (pair: readonly [number, number]) => ({ x: pair[0], y: pair[1] }));
    assert.equal(writeXml("point", [3, 4] as const, writer), `<point x="3" y="4"/>`);
  });
});

describe("XmlWriter failures", () => {
  it("names the slot that could not be written, as an XPath", () => {
    const value = anOrder();
    value.total.amount = Number.NaN;
    assert.equal(bindFailure(value, order, "order").getPath(), "/order/total/text()");
  });

  it("indexes a repeated element from one, as XPath does", () => {
    const value = anOrder();
    value.items.get(1).quantity = 1.5;
    assert.equal(bindFailure(value, order, "order").getPath(), "/order/items/item[2]/quantity");
  });

  it("refuses a name no document could carry", () => {
    assert.throws(() => intoAttribute("order id"), IllegalArgumentException);
    assert.throws(() => intoChild("1st", textElementFrom()), IllegalArgumentException);
    assert.throws(() => intoWrappedChildren("items<", "item", textElementFrom()), IllegalArgumentException);
    assert.throws(() => writeXml("", "x", textElementFrom()), IllegalArgumentException);
  });

  it("refuses two parts aimed at one slot, rather than losing one of them", () => {
    const clash = elementFrom<{ a: string; b: string }>({ a: intoAttribute("x"), b: intoAttribute("x") });
    assert.throws(() => writeXml("a", { a: "1", b: "2" }, clash), IllegalStateException);
    const twice = elementFrom<{ a: string; b: string }>({ a: intoText(), b: intoText() });
    assert.throws(() => writeXml("a", { a: "1", b: "2" }, twice), IllegalStateException);
  });

  it("lets a draft be filled by hand, for a part of one's own", () => {
    const draft = new XmlDraft();
    draft.putAttribute("x", "1");
    draft.addChild(new XmlDraft().build("b"));
    draft.setText("t");
    assert.equal(draft.build("a").toXml(), `<a x="1">t<b/></a>`);
    assert.throws(() => draft.setText("u"), IllegalStateException);
  });
});

describe("writeXml", () => {
  it("writes the whole contract out on one line", () => {
    assert.equal(
      writeXml("order", anOrder(), order),
      `<order id="A-1" priority="high"><total currency="USD">19.99</total><note>gift wrap</note>` +
        `<items><item sku="hat"><quantity>2</quantity></item><item sku="scarf"><quantity>1</quantity></item></items>` +
        `<paid>true</paid></order>`,
    );
  });

  it("heads the document with a declaration when asked", () => {
    const written = writeXml("a", "x", textElementFrom(), { declaration: true });
    assert.equal(written, `<?xml version="1.0" encoding="UTF-8"?>\n<a>x</a>`);
    assert.equal(parseXml(written).getText(), "x");
  });

  it("indents child elements, and only those", () => {
    const written = writeXml("order", anOrder(), order, { indent: "  " });
    assert.equal(
      written,
      [
        `<order id="A-1" priority="high">`,
        `  <total currency="USD">19.99</total>`,
        "  <note>gift wrap</note>",
        "  <items>",
        `    <item sku="hat">`,
        "      <quantity>2</quantity>",
        "    </item>",
        `    <item sku="scarf">`,
        "      <quantity>1</quantity>",
        "    </item>",
        "  </items>",
        "  <paid>true</paid>",
        "</order>",
      ].join("\n"),
    );
  });

  it("leaves an element carrying text on one line, where a break would change its value", () => {
    const mixed = elementFrom<{ body: string; item: string }>({ body: intoText(), item: intoChildText("item") });
    assert.equal(writeXml("a", { body: "note", item: "x" }, mixed, { indent: "  " }), "<a>note<item>x</item></a>");
    assert.equal(writeXml("name", " Ada ", textElementFrom(), { indent: "  " }), "<name> Ada </name>");
  });

  it("produces the same document indented as it does flat", () => {
    const flat = writeXml("order", anOrder(), order);
    const indented = writeXml("order", anOrder(), order, { indent: "\t", declaration: true });
    assert.ok(parseXml(indented).equals(parseXml(flat)));
  });

  it("round-trips a value through the reading contract and back", () => {
    const written = writeXml("order", anOrder(), order);
    const read = readXml(written, elementNamed("order", orderReader));
    assert.equal(writeXml("order", read, order), written);
    assert.equal(read.id, "A-1");
    assert.equal(read.total.amount, 19.99);
    assert.ok(read.note.equals(Optional.of("gift wrap")));
    assert.equal(read.items.size(), 2);
    assert.equal(read.items.get(1).sku, "scarf");
    assert.equal(read.paid, true);
  });

  it("hands back the element instead, for a document being built by hand", () => {
    const element = order.write(anOrder(), "order");
    assert.equal(element.getName(), "order");
    assert.equal(element.getChild("total").get().getAttribute("currency").get(), "USD");
  });
});
