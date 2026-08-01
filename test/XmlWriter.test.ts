import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { List } from "../src/collections/List.js";
import { JavaMap } from "../src/collections/Map.js";
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
  wrappedEntries,
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
  intoEntries,
  intoOptionalAttribute,
  intoOptionalChild,
  intoText,
  intoWrappedChildren,
  intoWrappedEntries,
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
  items: List<Item>;
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

/** A shape that can nest inside itself, which is the only way to reach the cycle guard. */
interface Node {
  name: string;
  children: List<Node>;
}

const node: XmlWriter<Node> = elementFrom<Node>({
  name: intoAttribute("name"),
  // the self-reference has to be deferred, since `node` is what is being declared
  children: intoChildren<Node>("child", {
    write: (value: Node, name: string, path?: string) => node.write(value, name, path),
  }),
});

function aNode(): Node {
  return { name: "root", children: new List<Node>() };
}

function anOrder(): Order {
  return {
    id: "A-1",
    priority: "high",
    total: { currency: "USD", amount: 19.99 },
    note: Optional.of("gift wrap"),
    items: new List<Item>([
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

  it("writes a carriage return as a reference, so it does not read back as a newline", () => {
    const written = writeXml("note", "one\rtwo", textElementFrom());
    assert.equal(written, "<note>one&#13;two</note>");
    assert.equal(textElement(rawText).read(parseXml(written)), "one\rtwo");
  });

  it("refuses a character XML cannot carry, naming it, rather than sending a document nothing can read", () => {
    assert.match(bindFailure("x\u0000y", textElementFrom()).message, /U\+0000 is not a character XML can carry/);
    assert.match(bindFailure("x\u001Fy", textElementFrom()).message, /U\+001F/);
    assert.match(bindFailure("\ud800", textElementFrom()).message, /U\+D800/);
    assert.throws(() => stringAsText.write("\u0000", "/a/@v"), XmlBindException);
  });

  it("names the slot the forbidden character sits in, wherever in the element it was", () => {
    const writer = elementFrom<{ body: string; note: string }>({
      body: intoText(),
      note: intoAttribute("note"),
    });
    assert.equal(bindFailure({ body: "\u0000", note: "fine" }, writer, "a").getPath(), "/a/text()");
    assert.equal(bindFailure({ body: "fine", note: "\u0000" }, writer, "a").getPath(), "/a/@note");
  });

  it("keeps writing the characters XML does allow, surrogate pairs and whitespace included", () => {
    assert.equal(writeXml("a", "\u{1F600}", textElementFrom()), "<a>\u{1F600}</a>");
    assert.equal(writeXml("a", "one\ttwo\nthree", textElementFrom()), "<a>one\ttwo\nthree</a>");
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
    assert.equal(writeXml("a", { sku: Optional.empty<string>(), note: Optional.empty<string>() }, writer), "<a/>");
    assert.equal(
      writeXml("a", { sku: Optional.of(""), note: Optional.of("x") }, writer),
      `<a sku=""><note>x</note></a>`,
    );
  });

  it("writes one child per value, and nothing for an empty collection", () => {
    const writer = elementFrom<{ tags: List<string> }>({ tags: intoChildren("tag", textElementFrom()) });
    assert.equal(writeXml("a", { tags: new List(["x", "y"]) }, writer), "<a><tag>x</tag><tag>y</tag></a>");
    assert.equal(writeXml("a", { tags: new List<string>() }, writer), "<a/>");
  });

  it("takes any iterable, not only a List", () => {
    const writer = elementFrom<{ tags: readonly string[] }>({ tags: intoChildren("tag", textElementFrom()) });
    assert.equal(writeXml("a", { tags: ["x"] }, writer), "<a><tag>x</tag></a>");
  });

  it("writes the wrapper even when the collection is empty, as JAXB does", () => {
    const writer = elementFrom<{ items: List<string> }>({
      items: intoWrappedChildren("items", "item", textElementFrom()),
    });
    assert.equal(writeXml("a", { items: new List<string>() }, writer), "<a><items/></a>");
    assert.equal(writeXml("a", { items: new List(["hat"]) }, writer), "<a><items><item>hat</item></items></a>");
  });

  it("writes one entry element per pair, and nothing for an empty map", () => {
    const writer = elementFrom<{ counts: JavaMap<string, number> }>({
      counts: intoEntries("entry", intoAttribute("key"), intoText(integerAsText)),
    });
    const counts = new JavaMap<string, number>([
      ["hat", 2],
      ["scarf", 1],
    ]);
    assert.equal(writeXml("a", { counts }, writer), `<a><entry key="hat">2</entry><entry key="scarf">1</entry></a>`);
    assert.equal(writeXml("a", { counts: new JavaMap<string, number>() }, writer), "<a/>");
  });

  it("puts the key and the value wherever in the entry the contract points", () => {
    const writer = elementFrom<{ counts: ReadonlyMap<string, number> }>({
      counts: intoEntries("entry", intoChildText("k"), intoChildText("v", integerAsText)),
    });
    const written = writeXml("a", { counts: new Map([["hat", 2]]) }, writer);
    assert.equal(written, "<a><entry><k>hat</k><v>2</v></entry></a>");
  });

  it("writes the wrapper of a map even when it is empty, as it does for a collection", () => {
    const writer = elementFrom<{ counts: ReadonlyMap<string, number> }>({
      counts: intoWrappedEntries("counts", "entry", intoAttribute("key"), intoText(integerAsText)),
    });
    assert.equal(writeXml("a", { counts: new Map<string, number>() }, writer), "<a><counts/></a>");
    const written = writeXml("a", { counts: new Map([["hat", 2]]) }, writer);
    assert.equal(written, `<a><counts><entry key="hat">2</entry></counts></a>`);
  });

  it("indexes the entry that could not be written, key and value alike", () => {
    const writer = elementFrom<{ counts: ReadonlyMap<string, number> }>({
      counts: intoEntries("entry", intoAttribute("key"), intoText(integerAsText)),
    });
    const value = {
      counts: new Map([
        ["hat", 2],
        ["scarf", 1.5],
      ]),
    };
    assert.equal(bindFailure(value, writer, "a").getPath(), "/a/entry[2]/text()");
  });

  it("refuses two parts aimed at one slot inside an entry, rather than losing one", () => {
    const writer = elementFrom<{ counts: ReadonlyMap<string, string> }>({
      counts: intoEntries("entry", intoText(), intoText()),
    });
    assert.throws(() => writeXml("a", { counts: new Map([["hat", "2"]]) }, writer), IllegalStateException);
  });

  it("round-trips a map through both directions of the contract", () => {
    const writer = elementFrom<{ counts: JavaMap<string, number> }>({
      counts: intoWrappedEntries("counts", "entry", intoAttribute("key"), intoText(integerAsText)),
    });
    const reader = elementOf<{ counts: JavaMap<string, number> }>({
      counts: wrappedEntries("counts", "entry", attribute("key"), textContent(integerText)),
    });
    const counts = new JavaMap<string, number>([
      ["hat", 2],
      ["scarf", 1],
    ]);
    assert.ok(readXml(writeXml("a", { counts }, writer), reader).counts.equals(counts));
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

  it("refuses a property missing at runtime, rather than handing nothing to its part", () => {
    // the one case where a T can lie: cast from a parsed document, or built against an older version of the type
    const partial = { id: "A-1", priority: "high", note: Optional.empty<string>() } as unknown as Order;
    const failure = bindFailure(partial, order, "order");
    assert.equal(failure.getPath(), "/order");
    assert.match(failure.message, /expected a value for total, got nothing/);
  });

  it("refuses it whichever kind of part was waiting for it", () => {
    // left to reach the part, each of these failed differently and only one of them said so: an attribute threw
    // out of the escaper, a run of children threw on iterating, and text was dropped in silence
    const absent = {} as unknown as { value: never };
    const asAttribute = elementFrom<{ value: never }>({ value: intoAttribute("value") });
    const asText = elementFrom<{ value: never }>({ value: intoText() });
    const asChildren = elementFrom<{ value: never }>({ value: intoChildren("value", textElementFrom()) });
    for (const writer of [asAttribute, asText, asChildren]) {
      assert.throws(() => writeXml("holder", absent, writer), XmlBindException);
    }
  });

  it("refuses a value that lied about its type, instead of writing something well-formed and wrong", () => {
    // booleanAsText answered "true" to anything truthy, which is a document that parses and says the opposite
    assert.throws(() => booleanAsText.write(42 as unknown as boolean, "/x"), /\/x: expected a boolean, got number 42/);
    assert.throws(() => numberAsText.write("1" as unknown as number, "/x"), /\/x: expected a number, got a string/);
    assert.throws(() => integerAsText.write(null as unknown as number, "/x"), /\/x: expected a number, got null/);
    // and a string reaching the escaper as a number threw a bare TypeError from inside it
    assert.throws(() => stringAsText.write(42 as unknown as string, "/x"), XmlBindException);
  });

  it("names the element where a value closes a loop, where recursing would exhaust the stack", () => {
    const cyclic = aNode();
    cyclic.children.add(cyclic);
    const failure = bindFailure(cyclic, node, "node");
    assert.equal(failure.getPath(), "/node/child[1]");
    assert.match(failure.message, /a value contains itself/);
  });

  it("forgets a value once it is written, so a refused document does not poison the next one", () => {
    const cyclic = aNode();
    cyclic.children.add(cyclic);
    assert.throws(() => writeXml("node", cyclic, node), XmlBindException);
    cyclic.children.clear();
    assert.equal(writeXml("node", cyclic, node), `<node name="root"/>`);
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
