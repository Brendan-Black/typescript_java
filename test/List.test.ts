import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Collection } from "../src/collections/Collection.js";
import { List } from "../src/collections/List.js";
import { JavaSet } from "../src/collections/Set.js";
import { ConcurrentModificationException } from "../src/exceptions/ConcurrentModificationException.js";
import { IndexOutOfBoundsException } from "../src/exceptions/IndexOutOfBoundsException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";
import { hashAll } from "../src/fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../src/fundamentals/Object.js";

class Point extends JavaObject {
  constructor(public readonly x: number, public readonly y: number) {
    super();
  }
  public override equals(other: any): boolean {
    return boilerplateEqualityCheck<Point>({ obj1: this, obj2: other }, (a, b) => a.x === b.x && a.y === b.y);
  }
  public override hashCode(): number {
    return hashAll(this.x, this.y);
  }
  public override toString(): string {
    return `(${this.x},${this.y})`;
  }
}

describe("List basics", () => {
  it("is a Collection", () => {
    assert.ok(new List<number>() instanceof Collection);
  });

  it("builds from anything iterable", () => {
    assert.deepEqual(new List<number>([1, 2, 3]).toArray(), [1, 2, 3]);
    assert.deepEqual(new List<number>(new Set([1, 2])).toArray(), [1, 2]);
    assert.deepEqual(new List<number>(new JavaSet<number>([4, 5])).toArray(), [4, 5]);
    assert.deepEqual(new List<number>().toArray(), []);
  });

  it("keeps duplicates, unlike a set", () => {
    assert.equal(new List<number>([1, 1, 1]).size(), 3);
  });

  it("appends with add, always reporting true", () => {
    const list = new List<number>();
    assert.equal(list.add(1), true);
    assert.equal(list.add(1), true);
    assert.deepEqual(list.toArray(), [1, 1]);
  });

  it("reports size and emptiness", () => {
    assert.equal(new List<number>().isEmpty(), true);
    assert.equal(new List<number>([1]).isEmpty(), false);
    assert.equal(new List<number>([1, 2]).size(), 2);
  });
});

describe("List index operations", () => {
  it("gets by index", () => {
    const list = new List<string>(["a", "b", "c"]);
    assert.equal(list.get(0), "a");
    assert.equal(list.get(2), "c");
  });

  it("throws IndexOutOfBoundsException rather than yielding undefined", () => {
    // the whole difference from a JavaScript array: `["a"][99]` is undefined, and travels a long way before
    // anyone notices
    const list = new List<string>(["a"]);
    assert.throws(() => list.get(1), IndexOutOfBoundsException);
    assert.throws(() => list.get(-1), IndexOutOfBoundsException);
    assert.throws(() => list.get(0.5), IndexOutOfBoundsException);
    assert.throws(() => list.get(NaN), IndexOutOfBoundsException);
  });

  it("names the offending index in the message", () => {
    assert.throws(() => new List<string>(["a"]).get(7), { message: "Index 7 out of bounds for length 1" });
  });

  it("offers find as the non-throwing read", () => {
    const list = new List<string>(["a"]);
    assert.equal(list.find(0).get(), "a");
    assert.equal(list.find(9).isEmpty(), true);
    assert.equal(list.find(-1).isEmpty(), true);
  });

  it("sets by index, returning the previous element", () => {
    const list = new List<string>(["a", "b"]);
    assert.equal(list.set(0, "z"), "a");
    assert.deepEqual(list.toArray(), ["z", "b"]);
    assert.throws(() => list.set(5, "x"), IndexOutOfBoundsException);
  });

  it("inserts with addAt, shifting the rest right", () => {
    const list = new List<string>(["a", "c"]);
    list.addAt(1, "b");
    assert.deepEqual(list.toArray(), ["a", "b", "c"]);
    list.addAt(0, "start");
    assert.deepEqual(list.toArray(), ["start", "a", "b", "c"]);
  });

  it("allows addAt exactly at the end, but not past it", () => {
    const list = new List<string>(["a"]);
    list.addAt(1, "b");
    assert.deepEqual(list.toArray(), ["a", "b"]);
    assert.throws(() => list.addAt(5, "x"), IndexOutOfBoundsException);
    assert.throws(() => list.addAt(-1, "x"), IndexOutOfBoundsException);
  });

  it("removes by index, returning what was there", () => {
    const list = new List<string>(["a", "b", "c"]);
    assert.equal(list.removeAt(1), "b");
    assert.deepEqual(list.toArray(), ["a", "c"]);
    assert.throws(() => list.removeAt(9), IndexOutOfBoundsException);
  });

  it("separates removal by index from removal by value", () => {
    // Java overloads remove(int) against remove(Object); TypeScript cannot, so they are two names
    const list = new List<number>([10, 20, 30]);
    assert.equal(list.removeAt(0), 10);
    assert.equal(list.remove(30), true);
    assert.deepEqual(list.toArray(), [20]);
  });
});

describe("List equality-based search", () => {
  it("finds a structurally equal element, where Array.indexOf would not", () => {
    const list = new List<Point>([new Point(1, 2), new Point(3, 4)]);
    assert.equal(list.indexOf(new Point(3, 4)), 1);
    assert.equal(list.contains(new Point(1, 2)), true);
    // the contrast
    assert.equal([new Point(1, 2)].indexOf(new Point(1, 2)), -1);
  });

  it("returns -1 for an absent element", () => {
    assert.equal(new List<Point>([new Point(1, 2)]).indexOf(new Point(9, 9)), -1);
  });

  it("distinguishes indexOf from lastIndexOf", () => {
    const list = new List<string>(["a", "b", "a"]);
    assert.equal(list.indexOf("a"), 0);
    assert.equal(list.lastIndexOf("a"), 2);
    assert.equal(list.lastIndexOf("z"), -1);
  });

  it("removes only the first equal element", () => {
    const list = new List<string>(["a", "b", "a"]);
    assert.equal(list.remove("a"), true);
    assert.deepEqual(list.toArray(), ["b", "a"]);
  });

  it("reports false when removing something absent", () => {
    assert.equal(new List<string>(["a"]).remove("z"), false);
  });

  it("handles null and NaN elements", () => {
    const list = new List<any>([null, NaN, 0]);
    assert.equal(list.contains(null), true);
    assert.equal(list.contains(NaN), true);
    assert.equal(list.contains(undefined), false);
    assert.equal(list.indexOf(NaN), 1);
  });
});

describe("List bulk operations", () => {
  it("inherits addAll, removeAll, retainAll and containsAll", () => {
    const list = new List<number>([1, 2, 3]);
    assert.equal(list.addAll([4, 5]), true);
    assert.deepEqual(list.toArray(), [1, 2, 3, 4, 5]);
    assert.equal(list.containsAll([2, 4]), true);
    assert.equal(list.removeAll([1, 5]), true);
    assert.deepEqual(list.toArray(), [2, 3, 4]);
    assert.equal(list.retainAll([3]), true);
    assert.deepEqual(list.toArray(), [3]);
  });

  it("survives being bulk-operated against itself", () => {
    const list = new List<number>([1, 2, 3]);
    assert.doesNotThrow(() => list.removeAll(list));
    assert.equal(list.isEmpty(), true);
  });

  it("clears", () => {
    const list = new List<number>([1, 2]);
    list.clear();
    assert.equal(list.size(), 0);
    list.add(3);
    assert.deepEqual(list.toArray(), [3]);
  });

  it("takes a subList as a copy", () => {
    const list = new List<number>([1, 2, 3, 4]);
    const sub = list.subList(1, 3);
    assert.deepEqual(sub.toArray(), [2, 3]);
    sub.add(99);
    assert.deepEqual(list.toArray(), [1, 2, 3, 4], "the sublist is a copy, so the original is untouched");
    assert.deepEqual(list.subList(2).toArray(), [3, 4], "the end defaults to the length");
    assert.throws(() => list.subList(3, 1), IndexOutOfBoundsException);
    assert.throws(() => list.subList(0, 9), IndexOutOfBoundsException);
  });

  it("sorts in place with the comparator it is given", () => {
    const list = new List<number>([3, 1, 2]);
    list.sort((a, b) => a - b);
    assert.deepEqual(list.toArray(), [1, 2, 3]);
  });

  it("replaces every element in place", () => {
    const list = new List<number>([1, 2, 3]);
    list.replaceAll((value, index) => value * 10 + index);
    assert.deepEqual(list.toArray(), [10, 21, 32]);
  });
});

describe("List iteration", () => {
  it("iterates in order and supports forEach", () => {
    const list = new List<number>([1, 2, 3]);
    assert.deepEqual([...list], [1, 2, 3]);
    const seen: number[] = [];
    list.forEach((value) => seen.push(value));
    assert.deepEqual(seen, [1, 2, 3]);
  });

  it("throws ConcurrentModificationException on structural modification mid-iteration", () => {
    const list = new List<number>([1, 2, 3, 4]);
    assert.throws(() => {
      for (const _value of list) {
        list.add(99);
      }
    }, ConcurrentModificationException);
  });

  it("does not trip on a non-structural set", () => {
    const list = new List<number>([1, 2, 3]);
    assert.doesNotThrow(() => {
      let i = 0;
      for (const _value of list) {
        list.set(i++, 0);
      }
    });
    assert.deepEqual(list.toArray(), [0, 0, 0]);
  });
});

describe("List.equals and hashCode", () => {
  it("is order-sensitive, unlike a set", () => {
    assert.equal(new List<number>([1, 2]).equals(new List<number>([1, 2])), true);
    assert.equal(new List<number>([1, 2]).equals(new List<number>([2, 1])), false);
    assert.notEqual(new List<number>([1, 2]).hashCode(), new List<number>([2, 1]).hashCode());
  });

  it("agrees with hashCode for equal lists", () => {
    assert.equal(new List<Point>([new Point(1, 2)]).hashCode(), new List<Point>([new Point(1, 2)]).hashCode());
  });

  it("compares elements with equals", () => {
    assert.equal(new List<Point>([new Point(1, 2)]).equals(new List<Point>([new Point(1, 2)])), true);
  });

  it("is unequal on differing length", () => {
    assert.equal(new List<number>([1]).equals(new List<number>([1, 2])), false);
  });

  it("is reflexive, and empty lists are equal", () => {
    const list = new List<number>();
    assert.equal(list.equals(list), true);
    assert.equal(list.equals(new List<number>()), true);
    assert.equal(list.hashCode(), 1, "Java's AbstractList seeds the hash at 1");
  });

  it("is not equal to a set holding the same elements", () => {
    assert.equal(new List<number>([1, 2]).equals(new JavaSet<number>([1, 2])), false);
  });

  it("returns false, and does not throw, for junk arguments", () => {
    const list = new List<number>([1]);
    // labelled rather than stringified: `String(forgery)` calls toString, which legitimately throws on an
    // object that never ran a constructor. equals is the one method required to answer anyway.
    const cases: [string, unknown][] = [
      ["null", null],
      ["undefined", undefined],
      ["number", 1],
      ["string", "1"],
      ["boolean", true],
      ["plain object", {}],
      ["array", [1]],
      ["prototype-only forgery", Object.create(List.prototype)],
    ];
    for (const [label, other] of cases) {
      assert.equal(list.equals(other), false, `expected false for ${label}`);
    }
  });
});

describe("List.toString", () => {
  it("matches Java's AbstractCollection format", () => {
    assert.equal(new List<number>().toString(), "[]");
    assert.equal(new List<number>([1, 2, 3]).toString(), "[1, 2, 3]");
    assert.equal(new List<Point>([new Point(1, 2)]).toString(), "[(1,2)]");
  });
});

describe("List immutability", () => {
  it("List.of refuses every mutator", () => {
    const list = List.of(1, 2, 3);
    assert.deepEqual(list.toArray(), [1, 2, 3]);
    assert.throws(() => list.add(4), UnsupportedOperationException);
    assert.throws(() => list.remove(1), UnsupportedOperationException);
    assert.throws(() => list.removeAt(0), UnsupportedOperationException);
    assert.throws(() => list.addAt(0, 9), UnsupportedOperationException);
    assert.throws(() => list.set(0, 9), UnsupportedOperationException);
    assert.throws(() => list.clear(), UnsupportedOperationException);
    assert.throws(() => list.sort((a, b) => a - b), UnsupportedOperationException);
    assert.throws(() => list.replaceAll((v) => v), UnsupportedOperationException);
  });

  it("still allows every read", () => {
    const list = List.of("a", "b");
    assert.equal(list.get(0), "a");
    assert.equal(list.size(), 2);
    assert.equal(list.contains("b"), true);
    assert.deepEqual([...list], ["a", "b"]);
  });

  it("unmodifiable is a live view, not a copy", () => {
    const base = new List<number>([1]);
    const view = List.unmodifiable(base);
    base.add(2);
    assert.deepEqual(view.toArray(), [1, 2]);
    assert.throws(() => view.add(3), UnsupportedOperationException);
    assert.deepEqual(base.toArray(), [1, 2]);
  });

  it("List.of is a frozen copy, with no original to track", () => {
    const source = [1, 2];
    const list = List.of(...source);
    source.push(3);
    assert.deepEqual(list.toArray(), [1, 2]);
  });
});
