import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { XmlParseException } from "../src/exceptions/XmlParseException.js";
import { IllegalArgumentException } from "../src/exceptions/IllegalArgumentException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";
import { XmlElement, isXmlName, parseXml } from "../src/serialization/XmlParser.js";

/** The failure a malformed document produces, so a test can say where it landed rather than only that it did. */
function parseFailure(text: string): XmlParseException {
  try {
    parseXml(text);
  } catch (error) {
    assert.ok(error instanceof XmlParseException, `expected an XmlParseException, got ${String(error)}`);
    return error;
  }
  throw new Error(`expected ${text} to be refused`);
}

describe("parseXml structure", () => {
  it("reads a name, its text and its attributes", () => {
    const root = parseXml(`<order id="A-1" priority='high'>pending</order>`);
    assert.equal(root.getName(), "order");
    assert.equal(root.getText(), "pending");
    assert.equal(root.getAttribute("id").get(), "A-1");
    assert.equal(root.getAttribute("priority").get(), "high");
    assert.ok(root.getAttribute("missing").isEmpty());
  });

  it("keeps attributes in document order", () => {
    const root = parseXml(`<a z="1" m="2" b="3"/>`);
    assert.deepEqual([...root.getAttributes()], [
      ["z", "1"],
      ["m", "2"],
      ["b", "3"],
    ]);
  });

  it("hands out attributes and children that refuse writes", () => {
    const root = parseXml("<a x='1'><b/></a>");
    assert.throws(() => root.getAttributes().put("y", "2"), UnsupportedOperationException);
    assert.throws(() => root.getChildren().add(new XmlElement("c")), UnsupportedOperationException);
  });

  it("treats a self-closing element as an empty one", () => {
    const root = parseXml("<order/>");
    assert.equal(root.getText(), "");
    assert.equal(root.getChildren().size(), 0);
  });

  it("nests children in document order", () => {
    const root = parseXml("<order><item>hat</item><item>scarf</item><note>gift</note></order>");
    assert.equal(root.getChildren().size(), 3);
    assert.deepEqual([...root.getChildrenNamed("item")].map((item) => item.getText()), ["hat", "scarf"]);
    assert.equal(root.getChild("note").get().getText(), "gift");
    assert.ok(root.getChild("absent").isEmpty());
  });

  it("gives the first match when a name repeats, and nothing when it does not", () => {
    const root = parseXml("<order><item>hat</item><item>scarf</item></order>");
    assert.equal(root.getChild("item").get().getText(), "hat");
    assert.equal(root.getChildrenNamed("item").size(), 2);
    assert.equal(root.getChildrenNamed("shipment").size(), 0);
  });

  it("gives a child no text of its parent's", () => {
    const root = parseXml("<order><note>x</note></order>");
    assert.equal(root.getText(), "");
    assert.equal(root.getChild("note").get().getText(), "x");
  });
});

describe("parseXml whitespace", () => {
  it("drops the whitespace between child elements", () => {
    const root = parseXml("<order>\n  <note>x</note>\n</order>");
    assert.equal(root.getText(), "");
  });

  it("keeps the whitespace inside a leaf, because there it is the value", () => {
    assert.equal(parseXml("<name> Ada </name>").getText(), " Ada ");
    assert.equal(parseXml("<name>   </name>").getText(), "   ");
  });

  it("keeps the text around a child, without recording where the child sat", () => {
    const root = parseXml("<p>hello <b>world</b> again</p>");
    assert.equal(root.getText(), "hello  again");
    assert.equal(root.getChild("b").get().getText(), "world");
  });

  it("keeps CDATA whitespace even between elements, since writing it was deliberate", () => {
    const root = parseXml("<a><![CDATA[   ]]><b/></a>");
    assert.equal(root.getText(), "   ");
  });
});

describe("parseXml text", () => {
  it("resolves the five built-in entities", () => {
    assert.equal(parseXml("<a>&lt;&gt;&amp;&quot;&apos;</a>").getText(), `<>&"'`);
  });

  it("resolves decimal and hexadecimal character references", () => {
    assert.equal(parseXml("<a>&#65;&#x42;&#x1F600;</a>").getText(), "AB\u{1F600}");
  });

  it("takes CDATA verbatim, markup and all", () => {
    assert.equal(parseXml("<a><![CDATA[<b> & </b>]]></a>").getText(), "<b> & </b>");
    assert.equal(parseXml("<a><![CDATA[]]></a>").getText(), "");
  });

  it("joins text split by a CDATA section or a comment", () => {
    assert.equal(parseXml("<a>one <![CDATA[two]]> three</a>").getText(), "one two three");
    assert.equal(parseXml("<a>one<!-- gap -->two</a>").getText(), "onetwo");
  });

  it("resolves references in attributes and folds their newlines into spaces", () => {
    assert.equal(parseXml(`<a t="&lt;&#65;"/>`).getAttribute("t").get(), "<A");
    assert.equal(parseXml('<a t="one\ntwo\tthree"/>').getAttribute("t").get(), "one two three");
    assert.equal(parseXml('<a t="one&#10;two"/>').getAttribute("t").get(), "one\ntwo");
  });

  it("distinguishes an empty attribute from an absent one", () => {
    const root = parseXml(`<a t=""/>`);
    assert.equal(root.getAttribute("t").get(), "");
    assert.ok(root.getAttribute("u").isEmpty());
  });

  it("reads every spelling of a line ending as a newline, whichever machine wrote the document", () => {
    assert.equal(parseXml("<a>one\r\ntwo</a>").getText(), "one\ntwo");
    assert.equal(parseXml("<a>one\rtwo</a>").getText(), "one\ntwo");
    assert.equal(parseXml("<a>one\ntwo</a>").getText(), "one\ntwo");
    assert.equal(parseXml("<a><![CDATA[one\r\ntwo]]></a>").getText(), "one\ntwo");
  });

  it("folds a normalised line ending in an attribute into one space, not two", () => {
    assert.equal(parseXml('<a t="one\r\ntwo"/>').getAttribute("t").get(), "one two");
    assert.equal(parseXml('<a t="one\rtwo"/>').getAttribute("t").get(), "one two");
  });

  it("keeps a carriage return that was written as a reference, which is what asks for one", () => {
    assert.equal(parseXml("<a>one&#13;two</a>").getText(), "one\rtwo");
    assert.equal(parseXml('<a t="one&#13;two"/>').getAttribute("t").get(), "one\rtwo");
  });

  it("counts a CRLF as the one line break a reader of the document would count", () => {
    assert.equal(parseFailure("<a>\r\n\r\n<b></c></a>").getLine(), 3);
  });
});

describe("parseXml prolog", () => {
  it("skips the declaration, comments, processing instructions and a doctype", () => {
    const document = `<?xml version="1.0" encoding="UTF-8"?>
      <!-- a note -->
      <?target instruction?>
      <!DOCTYPE order SYSTEM "order.dtd">
      <order/>
      <!-- and one after -->`;
    assert.equal(parseXml(document).getName(), "order");
  });

  it("skips a doctype carrying an internal subset", () => {
    assert.equal(parseXml(`<!DOCTYPE a [ <!ENTITY x "y"> ]><a/>`).getName(), "a");
  });

  it("strips a byte-order mark", () => {
    // Spelled out rather than written into the literal, where it would be an invisible character in the source.
    const mark = String.fromCharCode(0xfeff);
    assert.equal(parseXml(`${mark}<a/>`).getName(), "a");
  });
});

describe("parseXml namespaces", () => {
  it("leaves prefixes on names and treats xmlns as an ordinary attribute", () => {
    const namespace = "http://schemas.xmlsoap.org/soap/envelope/";
    const root = parseXml(`<soap:Envelope xmlns:soap="${namespace}"><soap:Body/></soap:Envelope>`);
    assert.equal(root.getName(), "soap:Envelope");
    assert.equal(root.getLocalName(), "Envelope");
    assert.equal(root.getPrefix().get(), "soap");
    assert.equal(root.getAttribute("xmlns:soap").get(), "http://schemas.xmlsoap.org/soap/envelope/");
    assert.equal(root.getChild("soap:Body").get().getLocalName(), "Body");
  });

  it("gives an unprefixed name no prefix and itself as its local name", () => {
    const root = parseXml("<Envelope/>");
    assert.ok(root.getPrefix().isEmpty());
    assert.equal(root.getLocalName(), "Envelope");
  });
});

describe("XmlElement rendering and equality", () => {
  it("writes an element back out, escaping what has to be escaped", () => {
    const root = new XmlElement("note", [["for", 'a "friend" & co']], [], "1 < 2");
    assert.equal(root.toXml(), `<note for="a &quot;friend&quot; &amp; co">1 &lt; 2</note>`);
    assert.equal(root.toString(), root.toXml());
  });

  it("writes an empty element in the self-closing form", () => {
    assert.equal(new XmlElement("br").toXml(), "<br/>");
    assert.equal(new XmlElement("a", [["x", "1"]]).toXml(), `<a x="1"/>`);
  });

  it("round-trips a document through its own output", () => {
    const document = `<order id="A-1"><total>19.99</total><items><item sku="hat"/></items></order>`;
    assert.equal(parseXml(document).toXml(), document);
    assert.ok(parseXml(parseXml(document).toXml()).equals(parseXml(document)));
  });

  it("writes an attribute newline as a reference, so reading it back gives the same string", () => {
    const written = new XmlElement("a", [["t", "one\ntwo"]]).toXml();
    assert.equal(written, `<a t="one&#10;two"/>`);
    assert.equal(parseXml(written).getAttribute("t").get(), "one\ntwo");
  });

  it("writes a carriage return as a reference, which is the only way one survives being read back", () => {
    const written = new XmlElement("a", [["t", "one\rtwo"]], [], "three\rfour").toXml();
    assert.equal(written, `<a t="one&#13;two">three&#13;four</a>`);
    assert.equal(parseXml(written).getAttribute("t").get(), "one\rtwo");
    assert.equal(parseXml(written).getText(), "three\rfour");
  });

  it("indents child elements, one to a line", () => {
    const root = parseXml("<order id='A-1'><items><item sku='hat'/></items><paid>true</paid></order>");
    assert.equal(
      root.toIndentedXml(),
      [
        `<order id="A-1">`,
        "  <items>",
        `    <item sku="hat"/>`,
        "  </items>",
        "  <paid>true</paid>",
        "</order>",
      ].join("\n"),
    );
    assert.equal(parseXml("<a><b/></a>").toIndentedXml("\t"), "<a>\n\t<b/>\n</a>");
  });

  it("leaves an element carrying text alone, since whitespace there is its value", () => {
    assert.equal(parseXml("<name> Ada </name>").toIndentedXml(), "<name> Ada </name>");
    assert.equal(parseXml("<p>hi<b>x</b></p>").toIndentedXml(), "<p>hi<b>x</b></p>");
  });

  it("indents to a document that reads back the same", () => {
    const root = parseXml("<a x='1'><b><c>t</c></b><d/></a>");
    assert.ok(parseXml(root.toIndentedXml()).equals(root));
  });

  it("is equal on name, attributes, children and text", () => {
    const one = parseXml("<a x='1'><b>t</b></a>");
    const same = parseXml("<a x='1'>\n  <b>t</b>\n</a>");
    assert.ok(one.equals(same));
    assert.equal(one.hashCode(), same.hashCode());
    assert.ok(!one.equals(parseXml("<a x='2'><b>t</b></a>")));
    assert.ok(!one.equals(parseXml("<a x='1'><b>u</b></a>")));
    assert.ok(!one.equals(parseXml("<a x='1'/>")));
  });

  it("counts the order of children", () => {
    assert.ok(!parseXml("<a><b/><c/></a>").equals(parseXml("<a><c/><b/></a>")));
  });
});

describe("isXmlName", () => {
  it("accepts the names a document can carry, prefixes included", () => {
    assert.ok(isXmlName("order"));
    assert.ok(isXmlName("soap:Envelope"));
    assert.ok(isXmlName("_private"));
    assert.ok(isXmlName("order-2.a"));
  });

  it("refuses what a parser would not read back as a name", () => {
    assert.ok(!isXmlName(""));
    assert.ok(!isXmlName("1st"));
    assert.ok(!isXmlName("order id"));
    assert.ok(!isXmlName("order<"));
  });
});

describe("parseXml failures", () => {
  it("names the line and column of a mismatched closing tag", () => {
    const error = parseFailure("<order>\n  <total>1</wrong>\n</order>");
    assert.equal(error.getLine(), 2);
    assert.equal(error.getColumn(), 11);
    assert.match(error.message, /<total> is closed by <\/wrong>/);
  });

  it("refuses an element that is never closed", () => {
    assert.match(parseFailure("<order><total>1</total>").message, /<order> is never closed/);
  });

  it("refuses a start tag that is never closed", () => {
    assert.match(parseFailure("<order id='A-1'").message, /<order> is never closed/);
  });

  it("refuses a document with no root element, and one with two", () => {
    assert.match(parseFailure("   ").message, /no root element/);
    assert.match(parseFailure("<a/><b/>").message, /after the root element/);
    assert.match(parseFailure("<!-- only a comment -->").message, /no root element/);
  });

  it("refuses an undeclared entity, saying why it cannot be resolved", () => {
    assert.match(parseFailure("<a>&nbsp;</a>").message, /unknown entity &nbsp;.*no DTD/);
    assert.match(parseFailure("<a>&broken</a>").message, /missing its ';'/);
  });

  it("refuses a character reference that is not one, or that XML does not allow", () => {
    assert.match(parseFailure("<a>&#zz;</a>").message, /not a character reference/);
    assert.match(parseFailure("<a>&#0;</a>").message, /not a character XML allows/);
  });

  it("refuses a duplicated attribute", () => {
    assert.match(parseFailure(`<a x="1" x="2"/>`).message, /attribute x appears twice on <a>/);
  });

  it("refuses attribute syntax it cannot make sense of", () => {
    assert.match(parseFailure("<a x/>").message, /expected '=' after attribute x/);
    assert.match(parseFailure("<a x=1/>").message, /expected a quoted value for attribute x/);
    assert.match(parseFailure(`<a x="1/>`).message, /the value of attribute x is never closed/);
    assert.match(parseFailure(`<a x="<"/>`).message, /'<' cannot appear in attribute x/);
  });

  it("refuses unterminated comments, CDATA and processing instructions", () => {
    assert.match(parseFailure("<!-- open <a/>").message, /a comment is never closed/);
    assert.match(parseFailure("<a><![CDATA[open</a>").message, /a CDATA section is never closed/);
    assert.match(parseFailure("<?target <a/>").message, /a processing instruction is never closed/);
    assert.match(parseFailure("<!DOCTYPE a [<a/>").message, /the doctype declaration is never closed/);
  });

  it("refuses a declaration inside an element", () => {
    assert.match(parseFailure("<a><!DOCTYPE b></a>").message, /a declaration cannot appear inside an element/);
  });

  it("refuses a name that does not start like one", () => {
    assert.match(parseFailure("<1a/>").message, /expected an element name/);
  });

  it("is an IllegalArgumentException, so one catch covers a bad payload", () => {
    assert.throws(() => parseXml("<a>"), IllegalArgumentException);
  });
});
