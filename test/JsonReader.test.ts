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
import { reverseOrder } from "../src/fundamentals/Comparator.js";
import { boilerplateEqualityCheck, JavaObject } from "../src/fundamentals/Object.js";
import { Optional } from "../src/fundamentals/Optional.js";
import { hashAll } from "../src/fundamentals/Hashing.js";
import {
  arrayOf,
  booleanValue,
  entryOf,
  enumOf,
  integerValue,
  type JsonReader,
  listOf,
  mapOf,
  mapping,
  nullable,
  numberValue,
  objectAsMap,
  objectOf,
  optionalValue,
  readJson,
  setOf,
  stringValue,
  treeMapOf,
  treeSetOf,
  unknownValue,
  withDefault,
} from "../src/serialization/JsonReader.js";

interface User {
  id: number;
  email: string;
  nickname: Optional<string>;
}

const user: JsonReader<User> = objectOf<User>({
  id: integerValue,
  email: stringValue,
  nickname: optionalValue(stringValue),
});

describe("JsonReader scalars", () => {
  it("reads the JSON primitives", () => {
    assert.equal(stringValue.read("hello"), "hello");
    assert.equal(numberValue.read(1.5), 1.5);
    assert.equal(integerValue.read(3), 3);
    assert.equal(booleanValue.read(false), false);
  });

  it("refuses the wrong type, naming what it got", () => {
    assert.throws(() => stringValue.read(7), JsonBindException);
    assert.throws(() => stringValue.read(7), /expected a string, got number 7/);
    assert.throws(() => numberValue.read("7"), /expected a number, got a string/);
    assert.throws(() => booleanValue.read(null), /expected a boolean, got null/);
    assert.throws(() => stringValue.read(undefined), /expected a string, got nothing/);
  });

  it("refuses a fractional value where an integer was promised", () => {
    assert.throws(() => integerValue.read(1.5), /expected an integer, got 1.5/);
  });

  it("refuses the non-finite numbers, which no JSON document can contain", () => {
    assert.throws(() => numberValue.read(Number.NaN), /expected a finite number/);
    assert.throws(() => numberValue.read(Number.POSITIVE_INFINITY), /expected a finite number/);
  });

  it("passes an unread slot through as unknown", () => {
    const payload = { anything: true };
    assert.equal(unknownValue.read(payload), payload);
    assert.equal(unknownValue.read(undefined), undefined);
  });

  it("reads a fixed set of strings, and says which were allowed", () => {
    const status = enumOf("PENDING", "SHIPPED");
    assert.equal(status.read("SHIPPED"), "SHIPPED");
    assert.throws(() => status.read("LOST"), /expected one of PENDING, SHIPPED, got LOST/);
  });
});

describe("JsonReader absence", () => {
  it("nullable admits an explicit null but not a missing slot", () => {
    assert.equal(nullable(stringValue).read(null), null);
    assert.equal(nullable(stringValue).read("x"), "x");
    assert.throws(() => nullable(stringValue).read(undefined), JsonBindException);
  });

  it("optionalValue folds both null and absent into an empty Optional", () => {
    const reader = optionalValue(stringValue);
    assert.equal(reader.read("x").get(), "x");
    assert.equal(reader.read(null).isEmpty(), true);
    assert.equal(reader.read(undefined).isEmpty(), true);
  });

  it("withDefault substitutes for null and absent, and calls the supplier per read", () => {
    const reader = withDefault(listOf(stringValue), () => new List<string>());
    const first = reader.read(undefined);
    const second = reader.read(null);
    first.add("mine");
    // a captured default would have been shared between the two
    assert.deepEqual(second.toArray(), []);
    assert.deepEqual(reader.read(["given"]).toArray(), ["given"]);
  });

  it("a field is required unless its own reader says otherwise", () => {
    assert.throws(() => user.read({ id: 1, nickname: null }), /\$\.email: expected a string, got nothing/);
    assert.equal(user.read({ id: 1, email: "a@b.c" }).nickname.isEmpty(), true);
  });
});

describe("JsonReader collections", () => {
  it("reads arrays, lists and sets", () => {
    assert.deepEqual(arrayOf(numberValue).read([1, 2]), [1, 2]);
    assert.deepEqual(listOf(numberValue).read([1, 2]).toArray(), [1, 2]);
    assert.deepEqual(setOf(stringValue).read(["a", "b"]).toArray(), ["a", "b"]);
  });

  it("collapses equal members into one, as a set does", () => {
    assert.equal(setOf(stringValue).read(["a", "a"]).size(), 1);
  });

  it("reads a map from the pair form a map writes", () => {
    const map = mapOf(stringValue, numberValue).read([["a", 1], ["b", 2]]);
    assert.equal(map.equals(new JavaMap<string, number>([["a", 1], ["b", 2]])), true);
  });

  it("keeps the last of a repeated key, as the constructor does", () => {
    const map = mapOf(stringValue, numberValue).read([["a", 1], ["a", 2]]);
    assert.equal(map.get("a"), 2);
  });

  it("refuses a pair that is not a pair", () => {
    const pairs = mapOf(stringValue, numberValue);
    assert.throws(() => pairs.read([["a"]]), /expected a \[key, value\] pair, got an array of 1/);
    assert.throws(() => mapOf(stringValue, numberValue).read(["a"]), /\$\[0\]: expected an array, got a string/);
  });

  it("reads a JSON object as a string-keyed map, which is what Jackson sends for one", () => {
    const map = objectAsMap(numberValue).read({ a: 1, b: 2 });
    assert.equal(map.equals(new JavaMap<string, number>([["a", 1], ["b", 2]])), true);
  });

  it("reads the sorted collections, in natural order or in a given one", () => {
    assert.deepEqual(treeSetOf(numberValue).read([3, 1, 2]).toArray(), [1, 2, 3]);
    assert.deepEqual(treeSetOf(numberValue, reverseOrder<number>()).read([3, 1, 2]).toArray(), [3, 2, 1]);
    assert.deepEqual([...treeMapOf(stringValue, numberValue).read([["b", 2], ["a", 1]]).keys()], ["a", "b"]);
    assert.deepEqual(
      [...treeMapOf(stringValue, numberValue, reverseOrder<string>()).read([["a", 1], ["b", 2]]).keys()],
      ["b", "a"],
    );
  });

  it("reads a map entry from the object form one writes", () => {
    const entry = entryOf(stringValue, numberValue).read({ key: "a", value: 1 });
    assert.equal(entry.equals(new MapEntry<string, number>("a", 1)), true);
  });
});

describe("JsonReader objects", () => {
  it("reads a DTO", () => {
    const read = user.read({ id: 7, email: "ada@example.com", nickname: "addie" });
    assert.equal(read.id, 7);
    assert.equal(read.email, "ada@example.com");
    assert.equal(read.nickname.get(), "addie");
  });

  it("ignores keys the contract does not mention, as Jackson does by default", () => {
    assert.doesNotThrow(() => user.read({ id: 1, email: "a@b.c", nickname: null, addedLastTuesday: true }));
  });

  it("refuses anything that is not an object", () => {
    assert.throws(() => user.read([]), /\$: expected an object, got an array/);
    assert.throws(() => user.read(null), /\$: expected an object, got null/);
    assert.throws(() => user.read("{}"), /\$: expected an object, got a string/);
  });

  it("reads a field the document does not have as absent, even when Object.prototype has one", () => {
    const reader = objectOf<{ toString: Optional<string>; constructor: Optional<string> }>({
      toString: optionalValue(stringValue),
      constructor: optionalValue(stringValue),
    });
    const read = reader.read({});
    assert.ok(read.toString.isEmpty());
    assert.ok(read.constructor.isEmpty());
    assert.equal(reader.read({ toString: "x" }).toString.get(), "x");
  });

  it("gives back a field named __proto__ rather than setting the result's prototype", () => {
    // The contract needs a computed key, because `{ __proto__: … }` in an object literal is JavaScript's
    // prototype setter rather than a property, and would declare no field at all.
    const reader = objectOf<Record<"__proto__", string>>({ ["__proto__"]: stringValue });
    const read = reader.read(JSON.parse(`{"__proto__":"x"}`));
    assert.equal(Object.hasOwn(read, "__proto__"), true);
    assert.equal(read["__proto__"], "x");
    assert.equal(Object.getPrototypeOf(read), Object.prototype);
  });

  it("builds a class through mapping, rather than objectOf knowing about constructors", () => {
    const point = mapping(objectOf({ x: numberValue, y: numberValue }), ({ x, y }) => new Point(x, y));
    assert.equal(point.read({ x: 1, y: 2 }).equals(new Point(1, 2)), true);
  });
});

describe("JsonReader failure paths", () => {
  it("names the exact slot inside a nested document", () => {
    const orders = objectOf({ users: listOf(user) });
    assert.throws(
      () => orders.read({ users: [{ id: 1, email: "a@b.c" }, { id: 2, email: 3 }] }),
      /\$\.users\[1\]\.email: expected a string, got number 3/,
    );
  });

  it("carries the path as data, not only in the message", () => {
    try {
      objectOf({ totals: arrayOf(numberValue) }).read({ totals: [1, "two"] });
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof JsonBindException);
      assert.equal(error.getPath(), "$.totals[1]");
    }
  });

  it("is an IllegalArgumentException, so either type catches it", () => {
    assert.throws(() => stringValue.read(1), IllegalArgumentException);
    assert.equal(new JsonBindException("$", "nope").name, "JsonBindException");
  });

  it("names the map key or value that failed", () => {
    assert.throws(() => mapOf(stringValue, numberValue).read([["a", "1"]]), /\$\[0\]\[1\]: expected a number/);
    assert.throws(() => objectAsMap(numberValue).read({ a: "1" }), /\$\.a: expected a number/);
    assert.throws(() => entryOf(stringValue, numberValue).read({ key: 1, value: 1 }), /\$\.key: expected a string/);
  });
});

describe("readJson", () => {
  it("parses and reads in one step", () => {
    const read = readJson('{"id":1,"email":"a@b.c","nickname":null}', user);
    assert.equal(read.id, 1);
    assert.equal(read.nickname.isEmpty(), true);
  });

  it("reports malformed JSON as a bind failure at the root, keeping the cause", () => {
    try {
      readJson("{not json", user);
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof JsonBindException);
      assert.equal(error.getPath(), "$");
      assert.match(error.message, /not valid JSON/);
      assert.ok(error.cause instanceof SyntaxError);
    }
  });
});

describe("JsonReader round trips what this library writes", () => {
  it("round-trips every collection through its own toJSON", () => {
    const list = new List<number>([1, 2, 3]);
    const set = new JavaSet<string>(["a", "b"]);
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    const treeSet = new TreeSet<number>([3, 1, 2]);
    const treeMap = new TreeMap<string, number>([["b", 2], ["a", 1]]);
    const entry = new MapEntry<string, number>("a", 1);

    assert.equal(reread(list, listOf(numberValue)).equals(list), true);
    assert.equal(reread(set, setOf(stringValue)).equals(set), true);
    assert.equal(reread(map, mapOf(stringValue, numberValue)).equals(map), true);
    assert.equal(reread(treeSet, treeSetOf(numberValue)).equals(treeSet), true);
    assert.equal(reread(treeMap, treeMapOf(stringValue, numberValue)).equals(treeMap), true);
    assert.equal(reread(entry, entryOf(stringValue, numberValue)).equals(entry), true);
  });

  it("round-trips an Optional in both of its states, keeping the key", () => {
    const dto = { nickname: Optional.of("addie"), pseudonym: Optional.empty<string>() };
    const reader = objectOf({ nickname: optionalValue(stringValue), pseudonym: optionalValue(stringValue) });
    const read = reread(dto, reader);
    assert.equal(read.nickname.get(), "addie");
    assert.equal(read.pseudonym.isEmpty(), true);
  });

  it("round-trips a map nested inside a DTO", () => {
    const dto = { counts: new JavaMap<string, number>([["a", 1]]), tags: new JavaSet<string>(["x"]) };
    const read = reread(dto, objectOf({ counts: mapOf(stringValue, numberValue), tags: setOf(stringValue) }));
    assert.equal(read.counts.equals(dto.counts), true);
    assert.equal(read.tags.equals(dto.tags), true);
  });
});

/** Writes a value the way a caller would put it on a wire, then reads it back through the contract. */
function reread<T>(value: unknown, reader: JsonReader<T>): T {
  return readJson(JSON.stringify(value), reader);
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
