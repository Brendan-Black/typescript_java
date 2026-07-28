import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JavaList } from "../src/collections/JavaList.js";
import { JavaMap, JavaMapEntry } from "../src/collections/JavaMap.js";
import { JavaSet } from "../src/collections/JavaSet.js";
import { JavaObject } from "../src/fundamentals/Object.js";
import type { Deserializable } from "../src/serialization/Deserializable.js";
import type { Serializable } from "../src/serialization/Serializable.js";

class User extends JavaObject implements Serializable {
  constructor(public readonly name: string) {
    super();
  }
  public toJSON(): unknown {
    return { name: this.name };
  }
  public static fromJSON(json: string): User {
    return new User(JSON.parse(json).name);
  }
}

/**
 * The compile-time half of the test: `Deserializable` now constrains the static side, so this line fails to
 * typecheck if `fromJSON` is missing, misnamed, or returns the wrong type.
 */
const _userIsDeserializable = User satisfies Deserializable<User>;

describe("Deserializable", () => {
  it("is satisfied by a class with a conforming static fromJSON", () => {
    const user = User.fromJSON(JSON.stringify(new User("ada")));
    assert.equal(user.name, "ada");
    assert.ok(user instanceof User);
    assert.equal(_userIsDeserializable, User);
  });

  it("rejects a class without one", () => {
    // regression: the interface had its only member commented out, so it was structurally satisfied by every
    // value in the language — `42 satisfies Deserializable` used to compile
    class NotDeserializable extends JavaObject {}
    // @ts-expect-error missing the static fromJSON the interface requires
    const _check = NotDeserializable satisfies Deserializable<NotDeserializable>;
    assert.ok(_check);
  });

  it("rejects a plain value", () => {
    // @ts-expect-error a number has no fromJSON
    const _check: Deserializable<number> = 42;
    assert.equal(_check, 42);
  });
});

describe("collection serialization", () => {
  it("serialises a list as a JSON array", () => {
    assert.equal(JSON.stringify(new JavaList<number>([1, 2, 3])), "[1,2,3]");
  });

  it("serialises a set as a JSON array", () => {
    assert.equal(JSON.stringify(new JavaSet<string>(["a", "b"])), '["a","b"]');
  });

  it("serialises a map as key/value pairs rather than an object", () => {
    // an object would force keys to strings, and a map keyed on numbers, nulls or JavaObjects would either
    // collide or lose information on the way out
    assert.equal(JSON.stringify(new JavaMap<string, number>([["a", 1], ["b", 2]])), '[["a",1],["b",2]]');
  });

  it("round-trips a map through JSON and back into a map", () => {
    const original = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    const revived = new JavaMap<string, number>(JSON.parse(JSON.stringify(original)));
    assert.equal(revived.equals(original), true);
  });

  it("round-trips a list and a set", () => {
    const list = new JavaList<number>([1, 2, 3]);
    assert.equal(new JavaList<number>(JSON.parse(JSON.stringify(list))).equals(list), true);
    const set = new JavaSet<number>([1, 2, 3]);
    assert.equal(new JavaSet<number>(JSON.parse(JSON.stringify(set))).equals(set), true);
  });

  it("serialises an entry as a key/value object", () => {
    assert.equal(JSON.stringify(new JavaMapEntry("a", 1)), '{"key":"a","value":1}');
  });

  it("lets nested Serializable elements serialise themselves", () => {
    assert.equal(JSON.stringify(new JavaList<User>([new User("ada")])), '[{"name":"ada"}]');
  });

  it("survives a map nested in a map", () => {
    const inner = new JavaMap<string, number>([["x", 1]]);
    const outer = new JavaMap<string, JavaMap<string, number>>([["inner", inner]]);
    assert.equal(JSON.stringify(outer), '[["inner",[["x",1]]]]');
  });

  it("serialises an unmodifiable view the same as what it wraps", () => {
    const base = new JavaList<number>([1, 2]);
    assert.equal(JSON.stringify(JavaList.unmodifiable(base)), JSON.stringify(base));
  });
});
