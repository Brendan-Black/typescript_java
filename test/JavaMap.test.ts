import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JavaAbstractSet } from "../src/collections/JavaCollection.js";
import { JavaMap, JavaMapEntry } from "../src/collections/JavaMap.js";
import { JavaSet } from "../src/collections/JavaSet.js";
import { ConcurrentModificationException } from "../src/exceptions/ConcurrentModificationException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";
import { hashAll } from "../src/fundamentals/Hashing.js";
import { boilerplateEqualityCheck, JavaObject } from "../src/fundamentals/Object.js";
import { Optional } from "../src/fundamentals/Optional.js";

/** a well-behaved value class: equals and hashCode derived from the same fields */
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

/** every instance lands in the same bucket, so the collision path is what gets exercised */
class Collider extends JavaObject {
  constructor(public readonly id: number) {
    super();
  }
  public override equals(other: any): boolean {
    return boilerplateEqualityCheck<Collider>({ obj1: this, obj2: other }, (a, b) => a.id === b.id);
  }
  public override hashCode(): number {
    return 42;
  }
}

describe("JavaMap keying", () => {
  it("finds a value under a structurally equal key — the whole point of the class", () => {
    const map = new JavaMap<Point, string>();
    map.put(new Point(1, 2), "origin-ish");
    assert.equal(map.get(new Point(1, 2)), "origin-ish");
    assert.equal(map.containsKey(new Point(1, 2)), true);
    assert.equal(map.size(), 1);
  });

  it("does what a plain JavaScript Map cannot", () => {
    const native = new Map<Point, string>();
    native.set(new Point(1, 2), "origin-ish");
    // SameValueZero: a second, equal key is simply a different key
    assert.equal(native.get(new Point(1, 2)), undefined);
  });

  it("overwrites rather than duplicating when an equal key is put again", () => {
    const map = new JavaMap<Point, string>();
    assert.equal(map.put(new Point(1, 2), "first"), null);
    assert.equal(map.put(new Point(1, 2), "second"), "first");
    assert.equal(map.size(), 1);
    assert.equal(map.get(new Point(1, 2)), "second");
  });

  it("keeps the key already in the map, as Java's put does", () => {
    const original = new Point(1, 2);
    const replacement = new Point(1, 2);
    const map = new JavaMap<Point, string>();
    map.put(original, "first");
    map.put(replacement, "second");
    assert.equal(map.keySet().toArray()[0], original);
  });

  it("separates keys that collide on hash but are not equal", () => {
    const map = new JavaMap<Collider, string>();
    map.put(new Collider(1), "one");
    map.put(new Collider(2), "two");
    assert.equal(new Collider(1).hashCode(), new Collider(2).hashCode());
    assert.equal(map.size(), 2);
    assert.equal(map.get(new Collider(1)), "one");
    assert.equal(map.get(new Collider(2)), "two");
  });

  it("removes the right entry out of a shared bucket", () => {
    const map = new JavaMap<Collider, string>();
    map.put(new Collider(1), "one");
    map.put(new Collider(2), "two");
    assert.equal(map.remove(new Collider(1)), "one");
    assert.equal(map.size(), 1);
    assert.equal(map.get(new Collider(1)), null);
    assert.equal(map.get(new Collider(2)), "two");
  });

  it("accepts an Optional as a key", () => {
    // regression: Optional's equals is value-based but its hashCode was inherited identity-based, so an
    // Optional key was bucketed by identity and could never be found again
    const map = new JavaMap<Optional<number>, string>();
    map.put(Optional.of(5), "five");
    assert.equal(map.get(Optional.of(5)), "five");
    assert.equal(map.get(Optional.of(6)), null);
    assert.equal(map.get(Optional.ofNullable<number>(null)), null);
  });

  it("handles primitive keys by value", () => {
    const map = new JavaMap<string, number>();
    map.put("a", 1);
    assert.equal(map.get("a"), 1);
    assert.equal(map.get("b"), null);
  });

  it("does not conflate a number key with its string form", () => {
    const map = new JavaMap<any, string>();
    map.put(1, "number");
    map.put("1", "string");
    assert.equal(map.size(), 2);
    assert.equal(map.get(1), "number");
    assert.equal(map.get("1"), "string");
  });

  it("supports a null key, as Java's HashMap does", () => {
    const map = new JavaMap<string | null, number>();
    map.put(null, 1);
    assert.equal(map.get(null), 1);
    assert.equal(map.containsKey(null), true);
    assert.equal(map.size(), 1);
  });

  it("keeps null and undefined as separate keys", () => {
    const map = new JavaMap<any, string>();
    map.put(null, "null");
    map.put(undefined, "undefined");
    assert.equal(map.size(), 2);
    assert.equal(map.get(null), "null");
    assert.equal(map.get(undefined), "undefined");
  });

  it("can find a NaN key again", () => {
    const map = new JavaMap<number, string>();
    map.put(NaN, "not a number");
    assert.equal(map.get(NaN), "not a number");
  });

  it("keys plain objects by identity, as Java keys a class with no overrides", () => {
    const map = new JavaMap<object, string>();
    const key = { id: 1 };
    map.put(key, "held");
    assert.equal(map.get(key), "held");
    assert.equal(map.get({ id: 1 }), null);
  });
});

describe("JavaMap lookups", () => {
  it("get returns null for an absent key, ambiguously with a null value", () => {
    const map = new JavaMap<string, number | null>();
    map.put("present", null);
    assert.equal(map.get("present"), null);
    assert.equal(map.get("absent"), null);
    // containsKey is the only thing that tells those two apart
    assert.equal(map.containsKey("present"), true);
    assert.equal(map.containsKey("absent"), false);
  });

  it("find returns an Optional", () => {
    const map = new JavaMap<string, number>();
    map.put("a", 1);
    assert.equal(map.find("a").get(), 1);
    assert.equal(map.find("b").isPresent(), false);
    assert.equal(map.find("b").orElse(0), 0);
  });

  it("getOrDefault falls back only when the key is absent", () => {
    const map = new JavaMap<string, number>();
    map.put("a", 0);
    assert.equal(map.getOrDefault("a", 99), 0);
    assert.equal(map.getOrDefault("b", 99), 99);
  });

  it("containsValue scans by equality", () => {
    const map = new JavaMap<string, Point>();
    map.put("a", new Point(1, 2));
    assert.equal(map.containsValue(new Point(1, 2)), true);
    assert.equal(map.containsValue(new Point(9, 9)), false);
  });
});

describe("JavaMap mutation", () => {
  it("putIfAbsent writes only when the key is absent or mapped to null", () => {
    const map = new JavaMap<string, number | null>();
    assert.equal(map.putIfAbsent("a", 1), null);
    assert.equal(map.putIfAbsent("a", 2), 1);
    assert.equal(map.get("a"), 1);

    map.put("b", null);
    assert.equal(map.putIfAbsent("b", 3), null);
    assert.equal(map.get("b"), 3);
  });

  it("computeIfAbsent calls the supplier at most once per key", () => {
    const map = new JavaMap<string, number>();
    let calls = 0;
    const supplier = () => ++calls;
    assert.equal(map.computeIfAbsent("a", supplier), 1);
    assert.equal(map.computeIfAbsent("a", supplier), 1);
    assert.equal(calls, 1);
  });

  it("computeIfAbsent passes the key to the supplier", () => {
    const map = new JavaMap<string, string>();
    assert.equal(map.computeIfAbsent("a", (key) => key.toUpperCase()), "A");
  });

  it("putAll merges, with the incoming entries winning", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    map.putAll([["b", 20], ["c", 3]]);
    assert.deepEqual([...map], [["a", 1], ["b", 20], ["c", 3]]);
  });

  it("remove returns null for an absent key and leaves the map alone", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(map.remove("z"), null);
    assert.equal(map.size(), 1);
  });

  it("clear empties the map, and it still works afterwards", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    map.clear();
    assert.equal(map.size(), 0);
    assert.equal(map.isEmpty(), true);
    assert.equal(map.get("a"), null);
    map.put("c", 3);
    assert.equal(map.get("c"), 3);
    assert.equal(map.size(), 1);
  });

  it("re-adds a removed key cleanly", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2], ["c", 3]]);
    map.remove("b");
    map.put("b", 20);
    assert.deepEqual([...map], [["a", 1], ["c", 3], ["b", 20]]);
    assert.equal(map.size(), 3);
  });

  it("survives removing every entry from the middle outwards", () => {
    const map = new JavaMap<number, number>();
    for (let i = 0; i < 10; i++) {
      map.put(i, i * i);
    }
    for (const key of [5, 0, 9, 3, 7, 1, 2, 4, 6, 8]) {
      assert.equal(map.remove(key), key * key);
    }
    assert.equal(map.size(), 0);
    assert.deepEqual([...map], []);
  });
});

describe("JavaMap iteration", () => {
  it("iterates in insertion order", () => {
    const map = new JavaMap<string, number>();
    map.put("z", 1);
    map.put("a", 2);
    map.put("m", 3);
    assert.deepEqual([...map.keys()], ["z", "a", "m"]);
    assert.deepEqual(map.values().toArray(), [1, 2, 3]);
  });

  it("does not reorder when an existing key is overwritten", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2], ["c", 3]]);
    map.put("a", 10);
    assert.deepEqual([...map.keys()], ["a", "b", "c"]);
  });

  it("round-trips through its own constructor", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    const copy = new JavaMap<string, number>(map);
    assert.equal(copy.equals(map), true);
    assert.deepEqual([...copy], [...map]);
  });

  it("builds from a plain JavaScript Map", () => {
    const map = new JavaMap<string, number>(new Map([["a", 1], ["b", 2]]));
    assert.equal(map.get("a"), 1);
    assert.equal(map.size(), 2);
  });

  it("forEach takes (value, key, map), matching JavaScript rather than Java", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    const seen: unknown[] = [];
    map.forEach((value, key, self) => seen.push(value, key, self === map));
    assert.deepEqual(seen, [1, "a", true]);
  });

  it("keySet, values and entrySet are live views of the map", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    const keys = map.keySet();
    const values = map.values();
    const entries = map.entrySet();
    map.put("b", 2);
    assert.equal(keys.size(), 2);
    assert.equal(values.size(), 2);
    assert.equal(entries.size(), 2);
    assert.deepEqual(keys.toArray(), ["a", "b"]);
    assert.deepEqual(values.toArray(), [1, 2]);
  });

  it("entrySet yields comparable entries", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    const entries = map.entrySet().toArray();
    const [entry] = entries;
    assert.equal(entries.length, 1);
    assert.ok(entry);
    assert.equal(entry.getKey(), "a");
    assert.equal(entry.getValue(), 1);
    assert.equal(entry.equals(new JavaMapEntry("a", 1)), true);
    assert.equal(entry.equals(new JavaMapEntry("a", 2)), false);
    assert.equal(new JavaMapEntry("a", 1).hashCode(), new JavaMapEntry("a", 1).hashCode());
  });

  it("keySet returns a set that itself keys by equality", () => {
    const map = new JavaMap<Point, string>([[new Point(1, 2), "a"]]);
    const keys = map.keySet();
    assert.ok(keys instanceof JavaAbstractSet);
    assert.equal(keys.contains(new Point(1, 2)), true);
  });

  it("iterating an empty map yields nothing", () => {
    const map = new JavaMap<string, number>();
    assert.deepEqual([...map], []);
    assert.deepEqual([...map.keys()], []);
    assert.deepEqual(map.values().toArray(), []);
  });
});

describe("JavaMap.equals and hashCode", () => {
  it("compares by content, independent of insertion order", () => {
    const a = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    const b = new JavaMap<string, number>([["b", 2], ["a", 1]]);
    assert.equal(a.equals(b), true);
    assert.equal(b.equals(a), true);
    assert.equal(a.hashCode(), b.hashCode());
  });

  it("is unequal on differing size, key, or value", () => {
    const base = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    assert.equal(base.equals(new JavaMap<string, number>([["a", 1]])), false);
    assert.equal(base.equals(new JavaMap<string, number>([["a", 1], ["c", 2]])), false);
    assert.equal(base.equals(new JavaMap<string, number>([["a", 1], ["b", 3]])), false);
  });

  it("is reflexive, and empty maps are equal", () => {
    const a = new JavaMap<string, number>();
    assert.equal(a.equals(a), true);
    assert.equal(a.equals(new JavaMap<string, number>()), true);
    assert.equal(a.hashCode(), 0);
  });

  it("returns false, and does not throw, for non-map arguments", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    for (const other of [null, undefined, 1, "a", true, {}, [], new Map([["a", 1]]), new JavaSet(["a"])]) {
      assert.equal(map.equals(other), false, `expected false for ${String(other)}`);
    }
  });

  it("returns false, and does not throw, for a forged map carrying no private state", () => {
    const forged = Object.create(JavaMap.prototype);
    let result: boolean | undefined;
    assert.doesNotThrow(() => {
      result = new JavaMap<string, number>([["a", 1]]).equals(forged);
    });
    assert.equal(result, false);
  });

  it("distinguishes a key mapped to null from an absent key", () => {
    const withNull = new JavaMap<string, number | null>([["a", null]]);
    const empty = new JavaMap<string, number | null>();
    assert.equal(withNull.equals(empty), false);
  });
});

describe("JavaMap.toString", () => {
  it("matches Java's AbstractMap format", () => {
    assert.equal(new JavaMap<string, number>().toString(), "{}");
    assert.equal(new JavaMap<string, number>([["a", 1], ["b", 2]]).toString(), "{a=1, b=2}");
  });

  it("uses the key's own toString", () => {
    assert.equal(new JavaMap<Point, number>([[new Point(1, 2), 3]]).toString(), "{(1,2)=3}");
  });
});

describe("JavaMap.compute and friends", () => {
  it("compute receives the current value, or null when absent", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    const seen: (number | null)[] = [];
    map.compute("a", (_key, value) => {
      seen.push(value);
      return 10;
    });
    map.compute("b", (_key, value) => {
      seen.push(value);
      return 20;
    });
    assert.deepEqual(seen, [1, null]);
    assert.equal(map.get("a"), 10);
    assert.equal(map.get("b"), 20);
  });

  it("compute removes the entry when the remapper returns null", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(map.compute("a", () => null), null);
    assert.equal(map.containsKey("a"), false);
  });

  it("compute does not create an entry when the remapper returns null for an absent key", () => {
    const map = new JavaMap<string, number>();
    assert.equal(map.compute("a", () => null), null);
    assert.equal(map.size(), 0);
  });

  it("computeIfPresent skips absent keys entirely", () => {
    const map = new JavaMap<string, number>();
    let called = false;
    assert.equal(
      map.computeIfPresent("a", () => {
        called = true;
        return 1;
      }),
      null
    );
    assert.equal(called, false);
    assert.equal(map.size(), 0);
  });

  it("computeIfPresent rewrites a present value, and removes on null", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    assert.equal(map.computeIfPresent("a", (_key, value) => value * 10), 10);
    assert.equal(map.get("a"), 10);
    assert.equal(map.computeIfPresent("b", () => null), null);
    assert.equal(map.containsKey("b"), false);
  });

  it("computeIfPresent does not disturb insertion order", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    map.computeIfPresent("a", () => 99);
    assert.deepEqual([...map.keys()], ["a", "b"]);
  });
});

describe("JavaMap.merge", () => {
  it("inserts when the key is absent, without calling the remapper", () => {
    const map = new JavaMap<string, number>();
    let called = false;
    assert.equal(
      map.merge("a", 1, () => {
        called = true;
        return 0;
      }),
      1
    );
    assert.equal(called, false);
    assert.equal(map.get("a"), 1);
  });

  it("combines when the key is present", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(map.merge("a", 5, (existing, value) => existing + value), 6);
    assert.equal(map.get("a"), 6);
  });

  it("removes when the remapper returns null", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(map.merge("a", 1, () => null), null);
    assert.equal(map.containsKey("a"), false);
  });

  it("counts words in one line, which is what it is for", () => {
    const counts = new JavaMap<string, number>();
    for (const word of ["a", "b", "a", "c", "a"]) {
      counts.merge(word, 1, (existing, value) => existing + value);
    }
    assert.equal(counts.get("a"), 3);
    assert.equal(counts.get("b"), 1);
  });
});

describe("JavaMap.replace", () => {
  it("replaces a present key and returns the previous value", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(map.replace("a", 2), 1);
    assert.equal(map.get("a"), 2);
  });

  it("never creates an entry, unlike put", () => {
    const map = new JavaMap<string, number>();
    assert.equal(map.replace("a", 1), null);
    assert.equal(map.size(), 0);
  });

  it("compare-and-sets in the three-argument form", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(map.replace("a", 99, 2), false, "the expected value did not match");
    assert.equal(map.get("a"), 1);
    assert.equal(map.replace("a", 1, 2), true);
    assert.equal(map.get("a"), 2);
    assert.equal(map.replace("missing", 1, 2), false);
  });

  it("replaceAll rewrites every value, taking (value, key)", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    map.replaceAll((value, key) => value * 10 + key.length);
    assert.deepEqual([...map], [["a", 11], ["b", 21]]);
  });
});

describe("JavaMap.remove with an expected value", () => {
  it("removes only when the value matches", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(map.remove("a", 99), false);
    assert.equal(map.size(), 1);
    assert.equal(map.remove("a", 1), true);
    assert.equal(map.size(), 0);
  });

  it("reports false for an absent key", () => {
    assert.equal(new JavaMap<string, number>().remove("a", 1), false);
  });

  it("compares the expected value with equals", () => {
    const map = new JavaMap<string, Point>([["a", new Point(1, 2)]]);
    assert.equal(map.remove("a", new Point(1, 2)), true);
  });
});

describe("JavaMap fail-fast iteration", () => {
  it("throws when an entry is added mid-iteration", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2], ["c", 3]]);
    assert.throws(() => {
      for (const _entry of map) {
        map.put("new", 9);
      }
    }, ConcurrentModificationException);
  });

  it("throws when an entry is removed mid-iteration", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2], ["c", 3]]);
    assert.throws(() => {
      for (const [key] of map) {
        if (key === "a") {
          map.remove("c");
        }
      }
    }, ConcurrentModificationException);
  });

  it("throws from keys, values, entries and forEach alike", () => {
    const build = () => new JavaMap<string, number>([["a", 1], ["b", 2], ["c", 3]]);
    for (const iterate of [
      (m: JavaMap<string, number>) => {
        for (const _k of m.keys()) m.remove("c");
      },
      (m: JavaMap<string, number>) => {
        for (const _v of m.valueIterator()) m.remove("c");
      },
      (m: JavaMap<string, number>) => {
        for (const _e of m.entries()) m.remove("c");
      },
      (m: JavaMap<string, number>) => m.forEach(() => m.remove("c")),
    ]) {
      assert.throws(() => iterate(build()), ConcurrentModificationException);
    }
  });

  it("does not trip on replacing the value under an existing key", () => {
    // not a structural modification, and Java does not count it as one either
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    assert.doesNotThrow(() => {
      for (const [key] of map) {
        map.put(key, 99);
      }
    });
    assert.deepEqual(map.values().toArray(), [99, 99]);
  });

  it("does not notice a change made while consuming the final element", () => {
    // matches Java, where the walk has already finished by the time the change lands
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.doesNotThrow(() => {
      for (const [key] of map) {
        map.remove(key);
      }
    });
    assert.equal(map.size(), 0);
  });

  it("lets a fresh iteration proceed after a modification", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    map.put("b", 2);
    assert.deepEqual([...map.keys()], ["a", "b"]);
  });
});

describe("JavaMap views write through", () => {
  it("keySet removal removes from the map", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    assert.equal(map.keySet().remove("a"), true);
    assert.equal(map.containsKey("a"), false);
    assert.equal(map.keySet().remove("a"), false);
  });

  it("keySet refuses add, because there is no value to map to", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.throws(() => map.keySet().add("b"), UnsupportedOperationException);
  });

  it("keySet clear empties the map", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    map.keySet().clear();
    assert.equal(map.isEmpty(), true);
  });

  it("values removal drops the first entry holding that value", () => {
    const map = new JavaMap<string, number>([["a", 1], ["b", 1]]);
    assert.equal(map.values().remove(1), true);
    assert.deepEqual([...map.keys()], ["b"]);
    assert.equal(map.values().remove(99), false);
  });

  it("values refuses add", () => {
    assert.throws(() => new JavaMap<string, number>().values().add(1), UnsupportedOperationException);
  });

  it("entrySet contains only entries whose value still matches", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    const entries = map.entrySet();
    assert.equal(entries.contains(new JavaMapEntry("a", 1)), true);
    assert.equal(entries.contains(new JavaMapEntry("a", 2)), false);
    assert.equal(entries.contains(new JavaMapEntry("z", 1)), false);
  });

  it("entrySet removal is conditional on the value", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(map.entrySet().remove(new JavaMapEntry("a", 2)), false);
    assert.equal(map.size(), 1);
    assert.equal(map.entrySet().remove(new JavaMapEntry("a", 1)), true);
    assert.equal(map.size(), 0);
  });

  it("entrySet refuses add", () => {
    assert.throws(() => new JavaMap<string, number>().entrySet().add(new JavaMapEntry("a", 1)), UnsupportedOperationException);
  });

  it("a key set view equals a plain set with the same members", () => {
    // AbstractSet.equals is written against the Set interface, not against one class
    const map = new JavaMap<string, number>([["a", 1], ["b", 2]]);
    assert.equal(map.keySet().equals(new JavaSet<string>(["b", "a"])), true);
    assert.equal(new JavaSet<string>(["b", "a"]).equals(map.keySet()), true);
    assert.equal(map.keySet().hashCode(), new JavaSet<string>(["a", "b"]).hashCode());
  });

  it("views reflect a cleared map", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    const keys = map.keySet();
    map.clear();
    assert.equal(keys.isEmpty(), true);
    assert.deepEqual(keys.toArray(), []);
  });
});
