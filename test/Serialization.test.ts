import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { List } from "../src/collections/List.js";
import { Map, MapEntry } from "../src/collections/Map.js";
import { Set } from "../src/collections/Set.js";
import { _Object } from "../src/fundamentals/Object.js";
import type { Serializable } from "../src/serialization/Serializable.js";

class User extends _Object implements Serializable {
  constructor(public readonly name: string) {
    super();
  }
  public toJSON(): unknown {
    return { name: this.name };
  }
}

describe("collection serialization", () => {
  it("serialises a list as a JSON array", () => {
    assert.equal(JSON.stringify(new List<number>([1, 2, 3])), "[1,2,3]");
  });

  it("serialises a set as a JSON array", () => {
    assert.equal(JSON.stringify(new Set<string>(["a", "b"])), '["a","b"]');
  });

  it("serialises a map as key/value pairs rather than an object", () => {
    // an object would force keys to strings, and a map keyed on numbers, nulls or `Java.Object`s would either
    // collide or lose information on the way out
    assert.equal(JSON.stringify(new Map<string, number>([["a", 1], ["b", 2]])), '[["a",1],["b",2]]');
  });

  it("round-trips a map through JSON and back into a map", () => {
    const original = new Map<string, number>([["a", 1], ["b", 2]]);
    const revived = new Map<string, number>(JSON.parse(JSON.stringify(original)));
    assert.equal(revived.equals(original), true);
  });

  it("round-trips a list and a set", () => {
    const list = new List<number>([1, 2, 3]);
    assert.equal(new List<number>(JSON.parse(JSON.stringify(list))).equals(list), true);
    const set = new Set<number>([1, 2, 3]);
    assert.equal(new Set<number>(JSON.parse(JSON.stringify(set))).equals(set), true);
  });

  it("serialises an entry as a key/value object", () => {
    assert.equal(JSON.stringify(new MapEntry("a", 1)), '{"key":"a","value":1}');
  });

  it("lets nested Serializable elements serialise themselves", () => {
    assert.equal(JSON.stringify(new List<User>([new User("ada")])), '[{"name":"ada"}]');
  });

  it("survives a map nested in a map", () => {
    const inner = new Map<string, number>([["x", 1]]);
    const outer = new Map<string, Map<string, number>>([["inner", inner]]);
    assert.equal(JSON.stringify(outer), '[["inner",[["x",1]]]]');
  });

  it("serialises an unmodifiable view the same as what it wraps", () => {
    const base = new List<number>([1, 2]);
    assert.equal(JSON.stringify(List.unmodifiable(base)), JSON.stringify(base));
  });
});
