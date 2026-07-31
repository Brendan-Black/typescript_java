import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { boilerplateEqualityCheck, JavaObject } from "../src/fundamentals/Object.js";

class Alpha extends JavaObject {}
class Beta extends JavaObject {}

/** a value type, comparing by field the way a real subclass would */
class Point extends JavaObject {
  constructor(public readonly x: number, public readonly y: number) {
    super();
  }
  public override equals(other: any): boolean {
    return boilerplateEqualityCheck<Point>({ obj1: this, obj2: other }, (a, b) => a.x === b.x && a.y === b.y);
  }
}

describe("JavaObject.equals (no override — Java's reference equality)", () => {
  it("returns exactly `true` for the same reference, not the object itself", () => {
    const a = new Alpha();
    const result = a.equals(a);
    // regression: the identity branch used to `return obj2`, so this was `{}` — truthy, but not a boolean
    assert.equal(typeof result, "boolean");
    assert.equal(result, true);
  });

  it("returns false for two distinct instances of the same class", () => {
    assert.equal(new Alpha().equals(new Alpha()), false);
  });

  it("returns false across different JavaObject subclasses", () => {
    assert.equal(new Alpha().equals(new Beta()), false);
  });

  it("returns false, and does not throw, for non-`Java.Object` arguments", () => {
    const a = new Alpha();
    for (const other of [null, undefined, 0, 1, "", "Alpha", true, {}, [], Symbol("s"), () => {}]) {
      assert.equal(a.equals(other), false, `expected false for ${String(other)}`);
    }
  });
});

describe("boilerplateEqualityCheck with a callback", () => {
  it("compares two structurally equal instances as equal despite differing hash codes", () => {
    const a = new Point(1, 2);
    const b = new Point(1, 2);
    // regression: the helper gated the callback behind `a.hashCode() === b.hashCode()`, and hash codes are
    // random per instance, so the callback never ran and this was always false
    assert.notEqual(a.hashCode(), b.hashCode());
    assert.equal(a.equals(b), true);
  });

  it("compares structurally different instances as unequal", () => {
    assert.equal(new Point(1, 2).equals(new Point(1, 3)), false);
  });

  it("is symmetric and reflexive", () => {
    const a = new Point(4, 5);
    const b = new Point(4, 5);
    assert.equal(a.equals(b), b.equals(a));
    assert.equal(a.equals(a), true);
  });

  it("rejects a forged object that only borrows the prototype", () => {
    const forged: any = Object.create(Point.prototype);
    forged.x = 1;
    forged.y = 2;
    // the class check passes here (real prototype), so the callback runs against a half-built object;
    // it must still answer rather than blow up
    assert.doesNotThrow(() => new Point(1, 2).equals(forged));
  });

  it("does not treat a same-named class from elsewhere as the same type", () => {
    // stands in for minification, where unrelated classes can collapse to the same `constructor.name`
    const Impostor = class Point extends JavaObject {};
    assert.equal(new Impostor().constructor.name, "Point");
    assert.equal(new Point(1, 2).equals(new Impostor()), false);
  });
});

describe("JavaObject.hashCode", () => {
  it("is stable across calls on one instance", () => {
    const a = new Alpha();
    assert.equal(a.hashCode(), a.hashCode());
  });

  it("is a non-negative signed-32-bit integer", () => {
    const h = new Alpha().hashCode();
    assert.ok(Number.isInteger(h));
    assert.ok(h >= 0 && h <= 0x7fffffff);
  });
});

describe("JavaObject.isInstance", () => {
  it("accepts a properly constructed JavaObject", () => {
    assert.equal(JavaObject.isInstance(new Alpha()), true);
    assert.equal(JavaObject.isInstance(new Point(1, 2)), true);
  });

  it("rejects a prototype-only forgery that instanceof would accept", () => {
    const forged = Object.create(Point.prototype);
    assert.ok(forged instanceof JavaObject, "instanceof is fooled by this");
    assert.equal(JavaObject.isInstance(forged), false, "the private-field check is not");
  });

  it("rejects everything that is not a `Java.Object` at all", () => {
    for (const other of [null, undefined, 0, "", {}, [], Symbol("s"), () => {}]) {
      assert.equal(JavaObject.isInstance(other), false, `accepted ${String(other)}`);
    }
  });
});

describe("JavaObject inheritance", () => {
  it("no longer extends Object, which did nothing", () => {
    // every JavaScript object already inherits from Object.prototype; naming it only made the declaration look
    // like it meant something
    assert.equal(Object.getPrototypeOf(JavaObject), Function.prototype);
    // the inherited behaviour is unchanged either way
    assert.equal(Object.prototype.hasOwnProperty.call(new Alpha(), "x"), false);
    assert.ok(new Alpha() instanceof Object);
  });
});

describe("JavaObject.toString", () => {
  it("is stable across calls", () => {
    const a = new Alpha();
    // regression: this used `Math.random()`, giving a different string every call
    assert.equal(a.toString(), a.toString());
  });

  it("matches Java's ClassName@hexHashCode format", () => {
    const a = new Alpha();
    assert.equal(a.toString(), "Alpha@" + a.hashCode().toString(16));
    assert.match(a.toString(), /^Alpha@[0-9a-f]+$/);
  });
});
