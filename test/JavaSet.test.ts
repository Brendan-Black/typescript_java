import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JavaMap } from "../src/collections/JavaMap.js";
import { JavaSet } from "../src/collections/JavaSet.js";
import { hashAll } from "../src/fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../src/fundamentals/Object.js";
import { Optional } from "../src/fundamentals/Optional.js";

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

describe("JavaSet membership", () => {
  it("collapses structurally equal members into one", () => {
    const set = new JavaSet<Point>();
    set.add(new Point(1, 2));
    set.add(new Point(1, 2));
    assert.equal(set.size(), 1);
    assert.equal(set.contains(new Point(1, 2)), true);
  });

  it("does what a plain JavaScript Set cannot", () => {
    const native = new Set<Point>();
    native.add(new Point(1, 2));
    native.add(new Point(1, 2));
    assert.equal(native.size, 2);
  });

  it("keeps members that are not equal", () => {
    const set = new JavaSet<Point>([new Point(1, 2), new Point(3, 4)]);
    assert.equal(set.size(), 2);
    assert.equal(set.contains(new Point(3, 4)), true);
    assert.equal(set.contains(new Point(9, 9)), false);
  });

  it("add reports whether the set changed", () => {
    const set = new JavaSet<Point>();
    assert.equal(set.add(new Point(1, 2)), true);
    assert.equal(set.add(new Point(1, 2)), false);
  });

  it("remove reports whether the set changed", () => {
    const set = new JavaSet<Point>([new Point(1, 2)]);
    assert.equal(set.remove(new Point(1, 2)), true);
    assert.equal(set.remove(new Point(1, 2)), false);
    assert.equal(set.isEmpty(), true);
  });

  it("handles primitives, null and NaN", () => {
    const set = new JavaSet<any>(["a", 1, null, NaN, true]);
    assert.equal(set.size(), 5);
    assert.equal(set.contains(null), true);
    assert.equal(set.contains(NaN), true);
    assert.equal(set.contains(undefined), false);
    assert.equal(set.contains("1"), false);
  });

  it("accepts Optionals as members", () => {
    const set = new JavaSet<Optional<number>>();
    set.add(Optional.of(5));
    set.add(Optional.of(5));
    assert.equal(set.size(), 1);
    assert.equal(set.contains(Optional.of(5)), true);
    assert.equal(set.contains(Optional.of(6)), false);
  });

  it("dedupes the values it is constructed from", () => {
    const set = new JavaSet<Point>([new Point(1, 2), new Point(1, 2), new Point(3, 4)]);
    assert.equal(set.size(), 2);
  });
});

describe("JavaSet bulk operations", () => {
  it("addAll reports whether anything was new", () => {
    const set = new JavaSet<number>([1, 2]);
    assert.equal(set.addAll([2, 3]), true);
    assert.equal(set.addAll([1, 2, 3]), false);
    assert.deepEqual(set.toArray(), [1, 2, 3]);
  });

  it("addAll does not stop at the first successful add", () => {
    // regression guard: `changed = changed || this.add(v)` would short-circuit and skip the rest
    const set = new JavaSet<number>();
    set.addAll([1, 2, 3]);
    assert.equal(set.size(), 3);
  });

  it("containsAll checks every element", () => {
    const set = new JavaSet<number>([1, 2, 3]);
    assert.equal(set.containsAll([1, 3]), true);
    assert.equal(set.containsAll([1, 4]), false);
    assert.equal(set.containsAll([]), true);
  });

  it("removeAll drops the intersection and reports change", () => {
    const set = new JavaSet<number>([1, 2, 3]);
    assert.equal(set.removeAll([2, 9]), true);
    assert.deepEqual(set.toArray(), [1, 3]);
    assert.equal(set.removeAll([9]), false);
  });

  it("retainAll keeps only the intersection", () => {
    const set = new JavaSet<number>([1, 2, 3, 4]);
    assert.equal(set.retainAll([2, 4, 6]), true);
    assert.deepEqual(set.toArray(), [2, 4]);
    assert.equal(set.retainAll([2, 4]), false);
  });

  it("retainAll on a disjoint collection empties the set", () => {
    const set = new JavaSet<number>([1, 2]);
    assert.equal(set.retainAll([9]), true);
    assert.equal(set.isEmpty(), true);
  });

  it("bulk operations respect equality, not identity", () => {
    const set = new JavaSet<Point>([new Point(1, 2), new Point(3, 4)]);
    assert.equal(set.containsAll([new Point(1, 2)]), true);
    set.removeAll([new Point(1, 2)]);
    assert.deepEqual(set.toArray().map(String), ["(3,4)"]);
  });

  it("clear empties the set, and it still works afterwards", () => {
    const set = new JavaSet<number>([1, 2]);
    set.clear();
    assert.equal(set.size(), 0);
    assert.equal(set.contains(1), false);
    set.add(3);
    assert.deepEqual(set.toArray(), [3]);
  });
});

describe("JavaSet iteration", () => {
  it("iterates in insertion order", () => {
    const set = new JavaSet<string>(["z", "a", "m"]);
    assert.deepEqual([...set], ["z", "a", "m"]);
    assert.deepEqual(set.toArray(), ["z", "a", "m"]);
  });

  it("does not reorder when an existing member is re-added", () => {
    const set = new JavaSet<string>(["a", "b", "c"]);
    set.add("a");
    assert.deepEqual(set.toArray(), ["a", "b", "c"]);
  });

  it("round-trips through its own constructor", () => {
    const set = new JavaSet<Point>([new Point(1, 2), new Point(3, 4)]);
    const copy = new JavaSet<Point>(set);
    assert.equal(copy.equals(set), true);
  });

  it("builds from a plain JavaScript Set", () => {
    const set = new JavaSet<number>(new Set([1, 2, 2, 3]));
    assert.equal(set.size(), 3);
  });

  it("forEach visits every member", () => {
    const set = new JavaSet<number>([1, 2, 3]);
    const seen: number[] = [];
    let sawSelf = false;
    set.forEach((value, self) => {
      seen.push(value);
      sawSelf = self === set;
    });
    assert.deepEqual(seen, [1, 2, 3]);
    assert.equal(sawSelf, true);
  });

  it("iterating an empty set yields nothing", () => {
    assert.deepEqual([...new JavaSet<number>()], []);
  });
});

describe("JavaSet.equals and hashCode", () => {
  it("compares by content, independent of insertion order", () => {
    const a = new JavaSet<number>([1, 2, 3]);
    const b = new JavaSet<number>([3, 1, 2]);
    assert.equal(a.equals(b), true);
    assert.equal(b.equals(a), true);
    assert.equal(a.hashCode(), b.hashCode());
  });

  it("is unequal on differing size or members", () => {
    const base = new JavaSet<number>([1, 2]);
    assert.equal(base.equals(new JavaSet<number>([1])), false);
    assert.equal(base.equals(new JavaSet<number>([1, 2, 3])), false);
    assert.equal(base.equals(new JavaSet<number>([1, 3])), false);
  });

  it("is reflexive, and empty sets are equal", () => {
    const a = new JavaSet<number>();
    assert.equal(a.equals(a), true);
    assert.equal(a.equals(new JavaSet<number>()), true);
    assert.equal(a.hashCode(), 0);
  });

  it("compares members by equality", () => {
    const a = new JavaSet<Point>([new Point(1, 2)]);
    const b = new JavaSet<Point>([new Point(1, 2)]);
    assert.equal(a.equals(b), true);
    assert.equal(a.hashCode(), b.hashCode());
  });

  it("returns false, and does not throw, for non-set arguments", () => {
    const set = new JavaSet<number>([1]);
    for (const other of [null, undefined, 1, "1", true, {}, [1], new Set([1]), new JavaMap([[1, true]])]) {
      assert.equal(set.equals(other), false, `expected false for ${String(other)}`);
    }
  });

  it("returns false, and does not throw, for a forged set carrying no private state", () => {
    const forged = Object.create(JavaSet.prototype);
    let result: boolean | undefined;
    assert.doesNotThrow(() => {
      result = new JavaSet<number>([1]).equals(forged);
    });
    assert.equal(result, false);
  });

  it("works as a member of another JavaSet", () => {
    const outer = new JavaSet<JavaSet<number>>();
    outer.add(new JavaSet<number>([1, 2]));
    outer.add(new JavaSet<number>([2, 1]));
    assert.equal(outer.size(), 1);
    assert.equal(outer.contains(new JavaSet<number>([1, 2])), true);
  });

  it("works as a JavaMap key", () => {
    const map = new JavaMap<JavaSet<number>, string>();
    map.put(new JavaSet<number>([1, 2]), "pair");
    assert.equal(map.get(new JavaSet<number>([2, 1])), "pair");
  });
});

describe("JavaSet.toString", () => {
  it("matches Java's AbstractCollection format", () => {
    assert.equal(new JavaSet<number>().toString(), "[]");
    assert.equal(new JavaSet<number>([1, 2, 3]).toString(), "[1, 2, 3]");
  });

  it("uses the member's own toString", () => {
    assert.equal(new JavaSet<Point>([new Point(1, 2)]).toString(), "[(1,2)]");
  });
});
