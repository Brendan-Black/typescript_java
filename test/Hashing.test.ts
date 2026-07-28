import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { equalsOf, hashAll, hashCodeOf } from "../src/fundamentals/Hashing.js";
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
}

describe("hashCodeOf", () => {
  it("hashes null and undefined to 0, as Objects.hashCode(null) does", () => {
    assert.equal(hashCodeOf(null), 0);
    assert.equal(hashCodeOf(undefined), 0);
  });

  it("reproduces Java's String.hashCode exactly", () => {
    // the values the JVM produces for these strings
    assert.equal(hashCodeOf(""), 0);
    assert.equal(hashCodeOf("a"), 97);
    assert.equal(hashCodeOf("abc"), 96354);
    assert.equal(hashCodeOf("Hello"), 69609650);
    assert.equal(hashCodeOf("hello world"), 1794106052);
  });

  it("reproduces Java's Boolean.hashCode", () => {
    assert.equal(hashCodeOf(true), 1231);
    assert.equal(hashCodeOf(false), 1237);
  });

  it("hashes an int-range integer to itself, as Integer.hashCode does", () => {
    assert.equal(hashCodeOf(0), 0);
    assert.equal(hashCodeOf(42), 42);
    assert.equal(hashCodeOf(-7), -7);
    assert.equal(hashCodeOf(0x7fffffff), 0x7fffffff);
  });

  it("gives -0 and 0 the same hash, matching SameValueZero", () => {
    assert.equal(hashCodeOf(-0), hashCodeOf(0));
  });

  it("hashes non-int-range numbers stably", () => {
    for (const value of [1.5, -1.5, 1e300, Number.MAX_SAFE_INTEGER, Infinity, -Infinity, NaN]) {
      assert.equal(hashCodeOf(value), hashCodeOf(value), `unstable for ${String(value)}`);
      assert.ok(Number.isInteger(hashCodeOf(value)), `not an integer for ${String(value)}`);
    }
    assert.notEqual(hashCodeOf(1.5), hashCodeOf(2.5));
  });

  it("always returns a signed 32-bit integer", () => {
    for (const value of [null, "a much longer string than the others here", 1.25, true, 9007199254740993n, {}, Point]) {
      const hash = hashCodeOf(value);
      assert.ok(Number.isInteger(hash), `not an integer for ${String(value)}`);
      assert.ok(hash >= -0x80000000 && hash <= 0x7fffffff, `out of range for ${String(value)}`);
    }
  });

  it("distinguishes a number from its string form", () => {
    // "1".hashCode() is 49; 1 hashes to 1. A map keyed on one must not be found by the other.
    assert.notEqual(hashCodeOf(1), hashCodeOf("1"));
  });

  it("hashes bigints by value", () => {
    assert.equal(hashCodeOf(123n), hashCodeOf(123n));
    assert.notEqual(hashCodeOf(123n), hashCodeOf(124n));
  });

  it("defers to a JavaObject's own hashCode", () => {
    const point = new Point(3, 4);
    assert.equal(hashCodeOf(point), point.hashCode());
    assert.equal(hashCodeOf(new Point(3, 4)), hashCodeOf(new Point(3, 4)));
  });

  it("gives plain objects a stable identity hash, distinct per instance", () => {
    const a = {};
    const b = {};
    assert.equal(hashCodeOf(a), hashCodeOf(a));
    assert.notEqual(hashCodeOf(a), hashCodeOf(b));
    // structurally identical, but Java's Object.hashCode is identity-based too
    assert.notEqual(hashCodeOf({ id: 1 }), hashCodeOf({ id: 1 }));
  });

  it("gives arrays and functions stable identity hashes", () => {
    const array = [1, 2, 3];
    const fn = () => {};
    assert.equal(hashCodeOf(array), hashCodeOf(array));
    assert.equal(hashCodeOf(fn), hashCodeOf(fn));
  });

  it("hashes registered symbols by their key, and unregistered ones by identity", () => {
    assert.equal(hashCodeOf(Symbol.for("shared")), hashCodeOf(Symbol.for("shared")));
    assert.notEqual(hashCodeOf(Symbol("local")), hashCodeOf(Symbol("local")));
  });

  it("does not duck-type a plain object that happens to have a hashCode method", () => {
    // an unrelated object carrying this property name is far more likely than one honouring Java's contract
    const impostor = { hashCode: () => 12345 };
    assert.notEqual(hashCodeOf(impostor), 12345);
  });
});

describe("equalsOf", () => {
  it("is true for identical references and primitives", () => {
    const shared = {};
    assert.equal(equalsOf(shared, shared), true);
    assert.equal(equalsOf("a", "a"), true);
    assert.equal(equalsOf(1, 1), true);
    assert.equal(equalsOf(null, null), true);
  });

  it("treats NaN as equal to itself, as JS Map and Set do", () => {
    assert.equal(equalsOf(NaN, NaN), true);
  });

  it("treats -0 and 0 as equal", () => {
    assert.equal(equalsOf(-0, 0), true);
  });

  it("keeps null and undefined as distinct values", () => {
    assert.equal(equalsOf(null, undefined), false);
    assert.equal(equalsOf(undefined, null), false);
  });

  it("defers to a JavaObject's own equals", () => {
    assert.equal(equalsOf(new Point(1, 2), new Point(1, 2)), true);
    assert.equal(equalsOf(new Point(1, 2), new Point(1, 3)), false);
  });

  it("compares plain objects by reference", () => {
    assert.equal(equalsOf({ id: 1 }, { id: 1 }), false);
  });

  it("does not cross types", () => {
    assert.equal(equalsOf(1, "1"), false);
    assert.equal(equalsOf(0, false), false);
    assert.equal(equalsOf("", null), false);
  });
});

describe("hashAll", () => {
  it("is stable and order-sensitive", () => {
    assert.equal(hashAll(1, 2), hashAll(1, 2));
    assert.notEqual(hashAll(1, 2), hashAll(2, 1));
  });

  it("distinguishes arity", () => {
    assert.notEqual(hashAll(), hashAll(null));
    assert.notEqual(hashAll(1), hashAll(1, null));
  });

  it("returns a signed 32-bit integer even for long argument lists", () => {
    const hash = hashAll(...Array.from({ length: 100 }, (_, i) => `field-${i}`));
    assert.ok(Number.isInteger(hash));
    assert.ok(hash >= -0x80000000 && hash <= 0x7fffffff);
  });

  it("keeps equals and hashCode in agreement for a value class", () => {
    const a = new Point(1, 2);
    const b = new Point(1, 2);
    assert.equal(a.equals(b), true);
    assert.equal(a.hashCode(), b.hashCode());
  });
});
