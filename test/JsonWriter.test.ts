import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { MapEntry } from "../src/collections/AbstractMap.js";
import { List } from "../src/collections/List.js";
import { JavaMap } from "../src/collections/Map.js";
import { JavaSet } from "../src/collections/Set.js";
import { TreeMap } from "../src/collections/TreeMap.js";
import { TreeSet } from "../src/collections/TreeSet.js";
import { IllegalArgumentException } from "../src/exceptions/IllegalArgumentException.js";
import { JsonBindException } from "../src/exceptions/JsonBindException.js";
import { hashAll } from "../src/fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../src/fundamentals/Object.js";
import { Optional } from "../src/fundamentals/Optional.js";
import {
  booleanValue,
  entryOf,
  integerValue,
  type JsonReader,
  listOf,
  mapOf,
  mapping,
  numberValue,
  objectAsMap,
  objectOf,
  optionalValue,
  readJson,
  setOf,
  stringValue,
  treeMapOf,
  treeSetOf,
} from "../src/serialization/JsonReader.js";
import {
  arrayFrom,
  booleanAsJson,
  entryFrom,
  integerAsJson,
  type JsonValue,
  type JsonWriter,
  mapAsObject,
  mapFrom,
  mappingAsJson,
  nullableAsJson,
  numberAsJson,
  objectFrom,
  omitWhenEmpty,
  optionalAsJson,
  rawJson,
  stringAsJson,
  writeJson,
} from "../src/serialization/JsonWriter.js";

interface Item {
  sku: string;
  quantity: number;
}

interface Order {
  id: string;
  total: number;
  note: Optional<string>;
  items: List<Item>;
  paid: boolean;
}

const item: JsonWriter<Item> = objectFrom<Item>({
  sku: stringAsJson,
  quantity: integerAsJson,
});

const order: JsonWriter<Order> = objectFrom<Order>({
  id: stringAsJson,
  total: numberAsJson,
  note: optionalAsJson(stringAsJson),
  items: arrayFrom(item),
  paid: booleanAsJson,
});

const orderReader: JsonReader<Order> = objectOf<Order>({
  id: stringValue,
  total: numberValue,
  note: optionalValue(stringValue),
  items: listOf(objectOf<Item>({ sku: stringValue, quantity: integerValue })),
  paid: booleanValue,
});

/** A shape that can nest inside itself, which is the only way to reach the cycle guard. */
interface Tree {
  name: string;
  children: List<Tree>;
}

const tree: JsonWriter<Tree> = objectFrom<Tree>({
  name: stringAsJson,
  // the self-reference has to be deferred, since `tree` is what is being declared
  children: arrayFrom<Tree>({ write: (value: Tree, path?: string): JsonValue => tree.write(value, path) }),
});

function aTree(): Tree {
  return { name: "root", children: new List<Tree>() };
}

/** Fresh every time, so a test that breaks one field does not leak into the next. */
function anOrder(): Order {
  return {
    id: "A-1",
    total: 19.99,
    note: Optional.of("gift wrap"),
    items: new List<Item>([
      { sku: "hat", quantity: 2 },
      { sku: "scarf", quantity: 1 },
    ]),
    paid: true,
  };
}

describe("JsonWriter scalars", () => {
  it("writes the JSON primitives", () => {
    assert.equal(stringAsJson.write("hello"), "hello");
    assert.equal(numberAsJson.write(1.5), 1.5);
    assert.equal(integerAsJson.write(3), 3);
    assert.equal(booleanAsJson.write(false), false);
  });

  it("refuses the non-finite numbers, which JSON.stringify would quietly write as null", () => {
    assert.equal(JSON.stringify(Number.NaN), "null");
    assert.throws(() => numberAsJson.write(Number.NaN), /NaN cannot be written as a number/);
    assert.throws(() => numberAsJson.write(Number.POSITIVE_INFINITY), /Infinity cannot be written as a number/);
    assert.throws(() => numberAsJson.write(Number.NaN), JsonBindException);
  });

  it("refuses an integer JavaScript was not holding exactly", () => {
    assert.equal(integerAsJson.write(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    assert.throws(() => integerAsJson.write(2 ** 53), /9007199254740992 is not an integer that can be written/);
    assert.throws(() => integerAsJson.write(1.5), /1.5 is not an integer/);
  });

  it("writes a union of string literals as the string it is", () => {
    const status: JsonWriter<"PENDING" | "SHIPPED"> = stringAsJson;
    assert.equal(status.write("SHIPPED"), "SHIPPED");
  });

  it("passes a value that is already JSON through unread", () => {
    const payload = { anything: true };
    assert.equal(rawJson.write(payload), payload);
  });

  it("refuses a value that lied about its type, rather than sending one the reader rejects", () => {
    // same premise objectFrom refuses an absent property on: a T cast from JSON.parse can be wrong either way
    assert.throws(() => stringAsJson.write(42 as unknown as string), /\$: expected a string, got number 42/);
    assert.throws(() => numberAsJson.write("1" as unknown as number), /\$: expected a number, got a string/);
    assert.throws(() => integerAsJson.write(null as unknown as number), /\$: expected a number, got null/);
    assert.throws(() => booleanAsJson.write("yes" as unknown as boolean), /\$: expected a boolean, got a string/);
    assert.throws(() => stringAsJson.write(42 as unknown as string), JsonBindException);
  });

  it("names the slot the lie sat in, not just the value", () => {
    const lying = { sku: 42, quantity: 2 } as unknown as Item;
    assert.throws(() => item.write(lying), /\$\.sku: expected a string, got number 42/);
  });
});

describe("JsonWriter absence", () => {
  it("writes null for null, and the value otherwise", () => {
    assert.equal(nullableAsJson(stringAsJson).write(null), null);
    assert.equal(nullableAsJson(stringAsJson).write("x"), "x");
  });

  it("writes an Optional as its value, or as null when empty", () => {
    assert.equal(optionalAsJson(stringAsJson).write(Optional.of("addie")), "addie");
    assert.equal(optionalAsJson(stringAsJson).write(Optional.empty<string>()), null);
  });

  it("keeps the key an empty Optional sits under, rather than dropping it", () => {
    const dto = { nickname: Optional.empty<string>() };
    const writer = objectFrom<typeof dto>({ nickname: optionalAsJson(stringAsJson) });
    assert.equal(writeJson(dto, writer), '{"nickname":null}');
  });

  it("leaves the key off entirely when the contract says omitWhenEmpty", () => {
    const dto = { nickname: Optional.empty<string>() };
    const writer = objectFrom<typeof dto>({ nickname: omitWhenEmpty(stringAsJson) });
    assert.equal(writeJson(dto, writer), "{}");
    assert.equal(writeJson({ nickname: Optional.of("addie") }, writer), '{"nickname":"addie"}');
  });

  it("reads an omitted key back as the empty Optional it was written from", () => {
    const dto = { nickname: Optional.empty<string>() };
    const writer = objectFrom<typeof dto>({ nickname: omitWhenEmpty(stringAsJson) });
    const reader = objectOf<typeof dto>({ nickname: optionalValue(stringValue) });
    assert.ok(readJson(writeJson(dto, writer), reader).nickname.isEmpty());
  });

  it("says all three things a merge patch can say, from the pieces already here", () => {
    // RFC 7396: a null deletes the field and a missing key leaves it alone, which are opposite instructions.
    // Two absences, so two Optionals: was the field mentioned, and if so does it have a value.
    interface Patch {
      note: Optional<Optional<string>>;
    }
    const patch = objectFrom<Patch>({ note: omitWhenEmpty(optionalAsJson(stringAsJson)) });
    assert.equal(writeJson({ note: Optional.of(Optional.of("gift wrap")) }, patch), '{"note":"gift wrap"}');
    assert.equal(writeJson({ note: Optional.of(Optional.empty<string>()) }, patch), '{"note":null}');
    assert.equal(writeJson({ note: Optional.empty<Optional<string>>() }, patch), "{}");
    // and Optional<string | null> is not an alternative: this Optional will not hold a present null
    assert.throws(() => Optional.of<string | null>(null), /Value cannot be null/);
  });

  it("still refuses a property missing at runtime, omittable or not", () => {
    const writer = objectFrom<{ nickname: Optional<string> }>({ nickname: omitWhenEmpty(stringAsJson) });
    // an empty Optional is a value that says nothing; no property at all is a value that is not there
    const missing = {} as unknown as { nickname: Optional<string> };
    assert.throws(() => writer.write(missing), /\$\.nickname: expected a value, got nothing/);
  });

  it("refuses a property that is absent, where JSON.stringify would drop the key", () => {
    // the value lies about its type, which is the only way to arrive here: a cast from JSON.parse, or a value
    // built against a version of Order that predates the field
    const missing = { id: "A-1", total: 1 } as unknown as Order;
    assert.equal(JSON.stringify({ id: "A-1", note: undefined }), '{"id":"A-1"}');
    assert.throws(() => order.write(missing), /\$\.note: expected a value, got nothing/);
    assert.throws(() => order.write(missing), JsonBindException);
  });
});

describe("JsonWriter collections", () => {
  it("writes every collection that reads back as an array through one writer", () => {
    const numbers = arrayFrom(numberAsJson);
    assert.deepEqual(numbers.write([1, 2]), [1, 2]);
    assert.deepEqual(numbers.write(new List<number>([1, 2])), [1, 2]);
    assert.deepEqual(numbers.write(new TreeSet<number>([3, 1, 2])), [1, 2, 3]);
    assert.deepEqual(arrayFrom(stringAsJson).write(new JavaSet<string>(["a", "b"])), ["a", "b"]);
  });

  it("writes a map as the pair form a map reads", () => {
    const counts = mapFrom(stringAsJson, integerAsJson);
    assert.deepEqual(counts.write(new JavaMap<string, number>([["a", 1], ["b", 2]])), [["a", 1], ["b", 2]]);
    assert.deepEqual(counts.write(new TreeMap<string, number>([["b", 2], ["a", 1]])), [["a", 1], ["b", 2]]);
    // any iterable of pairs, so a plain JavaScript Map and a bare array of pairs serve too
    assert.deepEqual(counts.write(new Map<string, number>([["a", 1]])), [["a", 1]]);
    assert.deepEqual(counts.write([["a", 1]]), [["a", 1]]);
  });

  it("writes a string-keyed map as the object form Jackson sends", () => {
    const written = mapAsObject(integerAsJson).write(new JavaMap<string, number>([["a", 1], ["b", 2]]));
    assert.deepEqual(written, { a: 1, b: 2 });
  });

  it("keeps a key named __proto__ as a key, rather than setting a prototype with it", () => {
    const written = writeJson(new JavaMap<string, number>([["__proto__", 1]]), mapAsObject(integerAsJson));
    assert.equal(written, '{"__proto__":1}');
    assert.equal(readJson(written, objectAsMap(integerValue)).get("__proto__"), 1);
  });

  it("refuses a key that is not a string, rather than coercing one into a property name", () => {
    const writer = mapAsObject(integerAsJson) as unknown as JsonWriter<Iterable<readonly [unknown, number]>>;
    assert.throws(() => writer.write([[7, 1]]), (error: unknown) => {
      assert.ok(error instanceof JsonBindException);
      assert.match(error.message, /expected a string key, got number 7/);
      return true;
    });
    // A symbol is the case that fails as a bare TypeError if the check comes after the path is built.
    assert.throws(() => writer.write([[Symbol("s"), 1]]), JsonBindException);
  });

  it("writes a map entry as the object form one reads", () => {
    assert.deepEqual(entryFrom(stringAsJson, integerAsJson).write(new MapEntry<string, number>("a", 1)), {
      key: "a",
      value: 1,
    });
  });
});

describe("JsonWriter objects", () => {
  it("writes a DTO in the order the contract declares its properties", () => {
    assert.equal(
      writeJson(anOrder(), order),
      '{"id":"A-1","total":19.99,"note":"gift wrap",' +
        '"items":[{"sku":"hat","quantity":2},{"sku":"scarf","quantity":1}],"paid":true}',
    );
  });

  it("writes a class through mappingAsJson, rather than objectFrom knowing about its fields", () => {
    const point: JsonWriter<Point> = mappingAsJson(
      objectFrom<{ x: number; y: number }>({ x: numberAsJson, y: numberAsJson }),
      (value: Point) => ({ x: value.x, y: value.y }),
    );
    assert.equal(writeJson(new Point(1, 2), point), '{"x":1,"y":2}');
  });

  it("closes the loop mapping opened: a type of one's own crosses in both directions", () => {
    const reader = mapping(objectOf({ x: numberValue, y: numberValue }), ({ x, y }) => new Point(x, y));
    const writer: JsonWriter<Point> = mappingAsJson(
      objectFrom<{ x: number; y: number }>({ x: numberAsJson, y: numberAsJson }),
      (value: Point) => ({ x: value.x, y: value.y }),
    );
    // Point has no toJSON, so before there was a writer this direction had nothing to it
    assert.equal(readJson(writeJson(new Point(1, 2), writer), reader).equals(new Point(1, 2)), true);
  });
});

describe("JsonWriter failure paths", () => {
  it("names the exact slot inside a nested document", () => {
    const value = anOrder();
    value.items.get(1).quantity = 1.5;
    assert.throws(() => order.write(value), /\$\.items\[1\]\.quantity: 1.5 is not an integer/);
  });

  it("carries the path as data, not only in the message", () => {
    const value = anOrder();
    value.total = Number.NaN;
    try {
      writeJson(value, order);
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof JsonBindException);
      assert.equal(error.getPath(), "$.total");
    }
  });

  it("names the map key or value that failed", () => {
    const counts = mapFrom(stringAsJson, integerAsJson);
    assert.throws(() => counts.write([["a", 1.5]]), /\$\[0\]\[1\]: 1.5 is not an integer/);
    assert.throws(() => mapAsObject(integerAsJson).write([["a", 1.5]]), /\$\.a: 1.5 is not an integer/);
    assert.throws(
      () => entryFrom(stringAsJson, integerAsJson).write(new MapEntry<string, number>("a", 1.5)),
      /\$\.value: 1.5 is not an integer/,
    );
  });

  it("is an IllegalArgumentException, so either type catches it", () => {
    assert.throws(() => numberAsJson.write(Number.NaN), IllegalArgumentException);
  });

  it("names the slot where a value closes a loop, where recursing would exhaust the stack", () => {
    const cyclic = aTree();
    cyclic.children.add(cyclic);
    assert.throws(() => writeJson(cyclic, tree), /\$\.children\[0\]: a value contains itself/);
    assert.throws(() => writeJson(cyclic, tree), JsonBindException);
    // JSON.stringify catches this too, but says only that it happened
    assert.throws(() => JSON.stringify(cyclic), TypeError);
  });

  it("lets the same value appear twice in different branches, which is a tree and not a loop", () => {
    const shared: Item = { sku: "hat", quantity: 1 };
    assert.equal(
      writeJson([shared, shared], arrayFrom(item)),
      '[{"sku":"hat","quantity":1},{"sku":"hat","quantity":1}]',
    );
  });

  it("forgets a value once it is written, so a refused document does not poison the next one", () => {
    const cyclic = aTree();
    cyclic.children.add(cyclic);
    assert.throws(() => writeJson(cyclic, tree), JsonBindException);
    cyclic.children.clear();
    assert.equal(writeJson(cyclic, tree), '{"name":"root","children":[]}');
  });
});

describe("writeJson", () => {
  it("writes the whole contract out on one line", () => {
    assert.doesNotMatch(writeJson(anOrder(), order), /\n/);
  });

  it("indents when asked, taking what JSON.stringify takes", () => {
    const one = objectFrom<{ a: number }>({ a: integerAsJson });
    assert.equal(writeJson({ a: 1 }, one, "  "), '{\n  "a": 1\n}');
    assert.equal(writeJson({ a: 1 }, one, 2), '{\n  "a": 1\n}');
  });

  it("produces the same document indented as it does flat", () => {
    const flat = readJson(writeJson(anOrder(), order), orderReader);
    const indented = readJson(writeJson(anOrder(), order, "\t"), orderReader);
    assert.equal(writeJson(flat, order), writeJson(indented, order));
  });

  it("hands back the tree instead, for a document being built by hand", () => {
    const tree = order.write(anOrder());
    assert.equal(JSON.stringify({ payload: tree }), `{"payload":${writeJson(anOrder(), order)}}`);
  });

  it("round-trips a value through the reading contract and back", () => {
    const written = writeJson(anOrder(), order);
    const read = readJson(written, orderReader);
    assert.equal(writeJson(read, order), written);
    assert.equal(read.id, "A-1");
    assert.equal(read.total, 19.99);
    assert.ok(read.note.equals(Optional.of("gift wrap")));
    assert.equal(read.items.size(), 2);
    assert.equal(read.items.get(1).sku, "scarf");
    assert.equal(read.paid, true);
  });
});

describe("JsonWriter agrees with what this library's own toJSON writes", () => {
  it("writes every collection the way Serializable does", () => {
    const list = new List<number>([1, 2, 3]);
    const set = new JavaSet<string>(["a", "b"]);
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    const treeSet = new TreeSet<number>([3, 1, 2]);
    const treeMap = new TreeMap<string, number>([["b", 2], ["a", 1]]);
    const entry = new MapEntry<string, number>("a", 1);

    assert.equal(writeJson(list, arrayFrom(integerAsJson)), JSON.stringify(list));
    assert.equal(writeJson(set, arrayFrom(stringAsJson)), JSON.stringify(set));
    assert.equal(writeJson(map, mapFrom(stringAsJson, integerAsJson)), JSON.stringify(map));
    assert.equal(writeJson(treeSet, arrayFrom(integerAsJson)), JSON.stringify(treeSet));
    assert.equal(writeJson(treeMap, mapFrom(stringAsJson, integerAsJson)), JSON.stringify(treeMap));
    assert.equal(writeJson(entry, entryFrom(stringAsJson, integerAsJson)), JSON.stringify(entry));
    assert.equal(writeJson(Optional.of("x"), optionalAsJson(stringAsJson)), JSON.stringify(Optional.of("x")));
  });

  it("reads back through the reader for the shape it wrote", () => {
    const list = new List<number>([1, 2, 3]);
    const set = new JavaSet<string>(["a", "b"]);
    const map = new JavaMap<string, number>([["a", 1]]);
    const treeSet = new TreeSet<number>([3, 1, 2]);
    const treeMap = new TreeMap<string, number>([["b", 2], ["a", 1]]);
    const entry = new MapEntry<string, number>("a", 1);

    assert.equal(rewrite(list, arrayFrom(integerAsJson), listOf(integerValue)).equals(list), true);
    assert.equal(rewrite(set, arrayFrom(stringAsJson), setOf(stringValue)).equals(set), true);
    assert.equal(rewrite(treeSet, arrayFrom(integerAsJson), treeSetOf(integerValue)).equals(treeSet), true);
    assert.equal(
      rewrite(map, mapFrom(stringAsJson, integerAsJson), mapOf(stringValue, integerValue)).equals(map),
      true,
    );
    assert.equal(
      rewrite(treeMap, mapFrom(stringAsJson, integerAsJson), treeMapOf(stringValue, integerValue)).equals(treeMap),
      true,
    );
    assert.equal(
      rewrite(entry, entryFrom(stringAsJson, integerAsJson), entryOf(stringValue, integerValue)).equals(entry),
      true,
    );
  });
});

/** Writes a value through the contract and reads it straight back — the guarantee the two make together. */
function rewrite<T, R>(value: T, writer: JsonWriter<T>, reader: JsonReader<R>): R {
  return readJson(writeJson(value, writer), reader);
}

class Point extends JavaObject {
  constructor(public readonly x: number, public readonly y: number) {
    super();
  }

  public override equals(other: unknown): boolean {
    return boilerplateEqualityCheck<Point>({ obj1: this, obj2: other }, (a, b) => a.x === b.x && a.y === b.y);
  }

  public override hashCode(): number {
    return hashAll(this.x, this.y);
  }
}
