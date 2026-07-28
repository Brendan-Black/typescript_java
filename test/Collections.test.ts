import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  emptyList,
  emptyMap,
  emptySet,
  singleton,
  singletonList,
  singletonMap,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSet,
} from "../src/collections/Collections.js";
import { JavaList } from "../src/collections/JavaList.js";
import { JavaMap } from "../src/collections/JavaMap.js";
import { JavaSet } from "../src/collections/JavaSet.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";

describe("immutable factories", () => {
  it("JavaMap.of holds its entries and refuses mutation", () => {
    const map = JavaMap.of<string, number>(["a", 1], ["b", 2]);
    assert.equal(map.get("a"), 1);
    assert.equal(map.size(), 2);
    assert.throws(() => map.put("c", 3), UnsupportedOperationException);
    assert.throws(() => map.remove("a"), UnsupportedOperationException);
    assert.throws(() => map.clear(), UnsupportedOperationException);
    assert.throws(() => map.putIfAbsent("c", 3), UnsupportedOperationException);
    assert.throws(() => map.computeIfAbsent("c", () => 3), UnsupportedOperationException);
    assert.throws(() => map.merge("a", 1, (x, y) => x + y), UnsupportedOperationException);
    assert.throws(() => map.replaceAll((v) => v), UnsupportedOperationException);
  });

  it("JavaSet.of holds its members and refuses mutation", () => {
    const set = JavaSet.of(1, 2, 3);
    assert.equal(set.contains(2), true);
    assert.throws(() => set.add(4), UnsupportedOperationException);
    assert.throws(() => set.remove(1), UnsupportedOperationException);
    assert.throws(() => set.clear(), UnsupportedOperationException);
    assert.throws(() => set.addAll([9]), UnsupportedOperationException);
    assert.throws(() => set.retainAll([1]), UnsupportedOperationException);
  });

  it("JavaSet.of collapses duplicate arguments rather than rejecting them", () => {
    // Java's Set.of throws on a duplicate; following the constructor here is the less surprising of the two
    assert.equal(JavaSet.of(1, 1, 2).size(), 2);
  });

  it("empty factories produce empty, immutable collections", () => {
    assert.equal(emptyMap<string, number>().isEmpty(), true);
    assert.equal(emptySet<number>().isEmpty(), true);
    assert.equal(emptyList<number>().isEmpty(), true);
    assert.throws(() => emptyMap<string, number>().put("a", 1), UnsupportedOperationException);
    assert.throws(() => emptySet<number>().add(1), UnsupportedOperationException);
    assert.throws(() => emptyList<number>().add(1), UnsupportedOperationException);
  });

  it("empty factories hand out independent instances", () => {
    // not a shared singleton, so nobody can be surprised by a shared identity
    assert.notEqual(emptySet<number>(), emptySet<number>());
    assert.equal(emptySet<number>().equals(emptySet<number>()), true);
  });

  it("singleton factories hold exactly one thing", () => {
    assert.equal(singletonMap("a", 1).size(), 1);
    assert.equal(singletonMap("a", 1).get("a"), 1);
    assert.deepEqual(singleton("x").toArray(), ["x"]);
    assert.deepEqual(singletonList("x").toArray(), ["x"]);
    assert.throws(() => singleton("x").add("y"), UnsupportedOperationException);
    assert.throws(() => singletonList("x").add("y"), UnsupportedOperationException);
    assert.throws(() => singletonMap("a", 1).put("b", 2), UnsupportedOperationException);
  });
});

describe("unmodifiable views", () => {
  it("read through to the original", () => {
    const base = new JavaMap<string, number>([["a", 1]]);
    const view = unmodifiableMap(base);
    assert.equal(view.get("a"), 1);
    assert.equal(view.size(), 1);
    assert.equal(view.equals(base), true);
  });

  it("stay live as the original changes", () => {
    // Java's behaviour, and the usual surprise with it: the wrapper protects you from your caller, not your
    // caller from you
    const base = new JavaMap<string, number>([["a", 1]]);
    const view = unmodifiableMap(base);
    base.put("b", 2);
    assert.equal(view.size(), 2);
    assert.equal(view.get("b"), 2);
    base.remove("a");
    assert.equal(view.containsKey("a"), false);
  });

  it("refuse mutation on maps, sets and lists alike", () => {
    assert.throws(() => unmodifiableMap(new JavaMap<string, number>()).put("a", 1), UnsupportedOperationException);
    assert.throws(() => unmodifiableSet(new JavaSet<number>()).add(1), UnsupportedOperationException);
    assert.throws(() => unmodifiableList(new JavaList<number>()).add(1), UnsupportedOperationException);
  });

  it("leave the original writable", () => {
    const base = new JavaSet<number>([1]);
    unmodifiableSet(base);
    assert.equal(base.add(2), true);
    assert.equal(base.size(), 2);
  });

  it("propagate the refusal through a map's views", () => {
    const view = unmodifiableMap(new JavaMap<string, number>([["a", 1]]));
    assert.throws(() => view.keySet().remove("a"), UnsupportedOperationException);
    assert.throws(() => view.values().remove(1), UnsupportedOperationException);
    assert.throws(() => view.keySet().clear(), UnsupportedOperationException);
    // reads still work
    assert.deepEqual(view.keySet().toArray(), ["a"]);
  });

  it("say why they refused", () => {
    assert.throws(() => unmodifiableList(new JavaList<number>()).add(1), {
      message: "add is not supported: this list is unmodifiable",
    });
  });

  it("are still equal to the collection they wrap", () => {
    const set = new JavaSet<number>([1, 2]);
    assert.equal(unmodifiableSet(set).equals(set), true);
    assert.equal(unmodifiableSet(set).hashCode(), set.hashCode());
  });
});
