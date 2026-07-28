import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JavaMap } from "../src/collections/JavaMap.js";
import {
  hashContractChecksEnabled,
  overridesEqualsWithoutHashCode,
  setHashContractChecks,
} from "../src/fundamentals/Contracts.js";
import { hashAll } from "../src/fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../src/fundamentals/Object.js";

/** captures whatever the block writes to console.warn, and always puts the real one back */
function captureWarnings(block: () => void): string[] {
  const captured: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    block();
  } finally {
    console.warn = original;
  }
  return captured;
}

/**
 * Every test needs its own class: the warnings fire once per class and are remembered process-wide, so a
 * shared fixture would make the tests depend on their running order.
 */
function makeBrokenKeyClass(): new (id: number) => JavaObject {
  return class BrokenKey extends JavaObject {
    constructor(public readonly id: number) {
      super();
    }
    public override equals(other: any): boolean {
      return boilerplateEqualityCheck<any>({ obj1: this, obj2: other }, (a, b) => a.id === b.id);
    }
    // deliberately no hashCode override
  };
}

describe("overridesEqualsWithoutHashCode", () => {
  it("spots a class that overrides equals and leaves hashCode identity-based", () => {
    const BrokenKey = makeBrokenKeyClass();
    assert.equal(overridesEqualsWithoutHashCode(new BrokenKey(1)), true);
  });

  it("accepts a class that overrides both", () => {
    class Good extends JavaObject {
      constructor(public readonly id: number) {
        super();
      }
      public override equals(other: any): boolean {
        return boilerplateEqualityCheck<Good>({ obj1: this, obj2: other }, (a, b) => a.id === b.id);
      }
      public override hashCode(): number {
        return hashAll(this.id);
      }
    }
    assert.equal(overridesEqualsWithoutHashCode(new Good(1)), false);
  });

  it("accepts a class that overrides neither", () => {
    class Plain extends JavaObject {}
    assert.equal(overridesEqualsWithoutHashCode(new Plain()), false);
  });

  it("credits an override inherited from a parent class", () => {
    class Base extends JavaObject {
      public override equals(other: any): boolean {
        return this === other;
      }
      public override hashCode(): number {
        return 1;
      }
    }
    class Child extends Base {}
    assert.equal(overridesEqualsWithoutHashCode(new Child()), false);
  });

  it("still flags a subclass that overrides only equals on top of a compliant parent", () => {
    class Base extends JavaObject {}
    class Child extends Base {
      public override equals(other: any): boolean {
        return this === other;
      }
    }
    assert.equal(overridesEqualsWithoutHashCode(new Child()), true);
  });

  it("ignores values that are not JavaObjects", () => {
    for (const value of [null, undefined, 1, "a", {}, [], () => {}]) {
      assert.equal(overridesEqualsWithoutHashCode(value), false, `flagged ${String(value)}`);
    }
  });
});

describe("hash contract warnings", () => {
  it("warns when a broken key is put into a map", () => {
    const BrokenKey = makeBrokenKeyClass();
    const warnings = captureWarnings(() => {
      new JavaMap<JavaObject, string>().put(new BrokenKey(1), "a");
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /BrokenKey/);
    assert.match(warnings[0], /hashCode/);
  });

  it("warns once per class, not once per insertion", () => {
    const BrokenKey = makeBrokenKeyClass();
    const warnings = captureWarnings(() => {
      const map = new JavaMap<JavaObject, string>();
      for (let i = 0; i < 10; i++) {
        map.put(new BrokenKey(i), "x");
      }
    });
    assert.equal(warnings.length, 1);
  });

  it("says nothing for a well-behaved key", () => {
    class Good extends JavaObject {
      constructor(public readonly id: number) {
        super();
      }
      public override equals(other: any): boolean {
        return boilerplateEqualityCheck<Good>({ obj1: this, obj2: other }, (a, b) => a.id === b.id);
      }
      public override hashCode(): number {
        return hashAll(this.id);
      }
    }
    const warnings = captureWarnings(() => {
      const map = new JavaMap<Good, string>();
      for (let i = 0; i < 20; i++) {
        map.put(new Good(i), "x");
      }
    });
    assert.deepEqual(warnings, []);
  });

  it("says nothing for primitive keys", () => {
    const warnings = captureWarnings(() => {
      const map = new JavaMap<string, number>();
      for (let i = 0; i < 20; i++) {
        map.put(`key-${i}`, i);
      }
    });
    assert.deepEqual(warnings, []);
  });

  it("demonstrates the bug it is warning about", () => {
    const BrokenKey = makeBrokenKeyClass();
    captureWarnings(() => {
      const map = new JavaMap<JavaObject, string>();
      map.put(new BrokenKey(1), "a");
      // equal by equals(), but bucketed by an identity hash, so the lookup goes to the wrong bucket
      assert.equal(new BrokenKey(1).equals(new BrokenKey(1)), true);
      assert.equal(map.get(new BrokenKey(1)), null);
    });
  });

  it("warns about a long collision chain", () => {
    class Clustered extends JavaObject {
      constructor(public readonly id: number) {
        super();
      }
      public override equals(other: any): boolean {
        return boilerplateEqualityCheck<Clustered>({ obj1: this, obj2: other }, (a, b) => a.id === b.id);
      }
      public override hashCode(): number {
        return 7; // every instance in one bucket
      }
    }
    const warnings = captureWarnings(() => {
      const map = new JavaMap<Clustered, number>();
      for (let i = 0; i < 12; i++) {
        map.put(new Clustered(i), i);
      }
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Clustered/);
    assert.match(warnings[0], /hash code/);
  });

  it("tolerates a short collision chain in silence", () => {
    class SlightlyClustered extends JavaObject {
      constructor(public readonly id: number) {
        super();
      }
      public override equals(other: any): boolean {
        return boilerplateEqualityCheck<SlightlyClustered>({ obj1: this, obj2: other }, (a, b) => a.id === b.id);
      }
      public override hashCode(): number {
        return 9;
      }
    }
    const warnings = captureWarnings(() => {
      const map = new JavaMap<SlightlyClustered, number>();
      for (let i = 0; i < 5; i++) {
        map.put(new SlightlyClustered(i), i);
      }
    });
    assert.deepEqual(warnings, []);
  });
});

describe("setHashContractChecks", () => {
  it("silences the warnings, and reports its own state", () => {
    const BrokenKey = makeBrokenKeyClass();
    assert.equal(hashContractChecksEnabled(), true);
    const warnings = captureWarnings(() => {
      setHashContractChecks(false);
      try {
        assert.equal(hashContractChecksEnabled(), false);
        new JavaMap<JavaObject, string>().put(new BrokenKey(1), "a");
      } finally {
        setHashContractChecks(true);
      }
    });
    assert.deepEqual(warnings, []);
    assert.equal(hashContractChecksEnabled(), true);
  });
});
