import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { unmodifiableMap } from "../src/collections/Collections.js";
import { JavaMapEntry } from "../src/collections/JavaAbstractMap.js";
import { JavaMap } from "../src/collections/JavaMap.js";
import { TreeMap } from "../src/collections/TreeMap.js";
import { ClassCastException } from "../src/exceptions/ClassCastException.js";
import { ConcurrentModificationException } from "../src/exceptions/ConcurrentModificationException.js";
import { IllegalArgumentException } from "../src/exceptions/IllegalArgumentException.js";
import { NoSuchElementException } from "../src/exceptions/NoSuchElementException.js";
import { NullPointerException } from "../src/exceptions/NullPointerException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";
import { comparing, naturalOrder, reverseOrder } from "../src/fundamentals/Comparator.js";
import { JavaObject } from "../src/fundamentals/Object.js";

/** a key whose order deliberately ignores part of its identity, so "compares equal" and "is equal" can diverge */
class Version extends JavaObject {
  constructor(public readonly major: number, public readonly label: string) {
    super();
  }
  public compareTo(other: Version): number {
    return this.major - other.major;
  }
  public override toString(): string {
    return `v${this.major}${this.label}`;
  }
}

/** a JavaObject with no order of its own — the case a natural-order TreeMap has to refuse */
class JavaObject2 extends JavaObject {}

const letters = (): TreeMap<string, number> =>
  new TreeMap<string, number>([["carol", 3], ["alice", 1], ["bob", 2]]);

describe("TreeMap ordering", () => {
  it("iterates in key order rather than insertion order", () => {
    assert.deepEqual([...letters()], [["alice", 1], ["bob", 2], ["carol", 3]]);
  });

  it("keeps order across later insertions and removals", () => {
    const map = letters();
    map.put("bea", 9);
    map.remove("bob");
    assert.deepEqual([...map.keys()], ["alice", "bea", "carol"]);
  });

  it("orders numbers numerically, not as strings", () => {
    const map = new TreeMap<number, string>([[10, "ten"], [9, "nine"], [100, "hundred"]]);
    assert.deepEqual([...map.keys()], [9, 10, 100]);
  });

  it("honours an explicit comparator", () => {
    const map = new TreeMap<string, number>(reverseOrder<string>(), [["a", 1], ["c", 3], ["b", 2]]);
    assert.deepEqual([...map.keys()], ["c", "b", "a"]);
  });

  it("orders by a key extractor when told to", () => {
    const map = new TreeMap<Version, string>(comparing<Version, number>((v) => v.major));
    map.put(new Version(3, "c"), "third");
    map.put(new Version(1, "a"), "first");
    assert.deepEqual(map.values().toArray(), ["first", "third"]);
  });

  it("reports its comparator, and null when the order is the natural one", () => {
    assert.equal(letters().comparator(), null);
    const ordering = reverseOrder<string>();
    assert.equal(new TreeMap<string, number>(ordering).comparator(), ordering);
  });

  it("tells a comparator apart from initial contents without being told which is which", () => {
    const fromEntries = new TreeMap<string, number>([["b", 2], ["a", 1]]);
    const fromComparator = new TreeMap<string, number>(naturalOrder<string>(), [["b", 2], ["a", 1]]);
    assert.deepEqual([...fromEntries.keys()], ["a", "b"]);
    assert.deepEqual([...fromComparator.keys()], ["a", "b"]);
    assert.equal(fromEntries.comparator(), null);
    assert.notEqual(fromComparator.comparator(), null);
  });
});

describe("TreeMap as a map", () => {
  it("gets, replaces and removes by comparison", () => {
    const map = letters();
    assert.equal(map.get("bob"), 2);
    assert.equal(map.get("dave"), null);
    assert.equal(map.put("bob", 20), 2);
    assert.equal(map.size(), 3);
    assert.equal(map.remove("bob"), 20);
    assert.equal(map.size(), 2);
    assert.equal(map.remove("bob"), null);
  });

  it("treats keys that compare equal as one entry, whatever equals says", () => {
    const map = new TreeMap<Version, string>();
    map.put(new Version(1, "-alpha"), "first");
    map.put(new Version(1, "-beta"), "second");
    assert.equal(map.size(), 1);
    // the key already present is kept, as Java's put does; only the value is replaced
    assert.equal(map.firstKey().label, "-alpha");
    assert.equal(map.get(new Version(1, "-anything")), "second");
  });

  it("inherits the derived operations from JavaAbstractMap", () => {
    const map = letters();
    assert.equal(map.getOrDefault("dave", 0), 0);
    assert.equal(map.putIfAbsent("alice", 99), 1);
    assert.equal(map.computeIfAbsent("dave", () => 4), 4);
    assert.equal(map.merge("dave", 10, (a, b) => a + b), 14);
    assert.equal(map.replace("dave", 14, 5), true);
    assert.equal(map.find("dave").get(), 5);
    assert.equal(map.containsValue(5), true);
    map.replaceAll((value) => value * 2);
    assert.deepEqual(map.values().toArray(), [2, 4, 6, 10]);
  });

  it("equals another map with the same entries, whichever kind it is", () => {
    const tree = letters();
    const hash = new JavaMap<string, number>([["bob", 2], ["carol", 3], ["alice", 1]]);
    assert.equal(tree.equals(hash), true);
    assert.equal(hash.equals(tree), true);
    assert.equal(tree.hashCode(), hash.hashCode());
  });

  it("formats and serialises like any other map, in key order", () => {
    assert.equal(letters().toString(), "{alice=1, bob=2, carol=3}");
    assert.equal(JSON.stringify(letters()), '[["alice",1],["bob",2],["carol",3]]');
  });

  it("round-trips through its own constructor", () => {
    const map = letters();
    assert.equal(new TreeMap<string, number>(map).equals(map), true);
  });

  it("hands out live views in key order", () => {
    const map = letters();
    assert.deepEqual(map.keySet().toArray(), ["alice", "bob", "carol"]);
    assert.deepEqual(map.entrySet().toArray().map((entry) => entry.getKey()), ["alice", "bob", "carol"]);
    map.keySet().remove("bob");
    assert.equal(map.containsKey("bob"), false);
  });
});

describe("TreeMap key requirements", () => {
  it("rejects a key with no natural order, on the very first insertion", () => {
    const map = new TreeMap<JavaObject, number>();
    assert.throws(() => map.put(new JavaObject2(), 1), ClassCastException);
  });

  it("rejects a null key under natural order", () => {
    const map = new TreeMap<string | null, number>();
    assert.throws(() => map.put(null, 1), NullPointerException);
  });

  it("accepts whatever the comparator accepts", () => {
    const map = new TreeMap<JavaObject, number>(() => 0);
    assert.doesNotThrow(() => map.put(new JavaObject2(), 1));
  });
});

describe("TreeMap navigation", () => {
  const numbers = (): TreeMap<number, string> =>
    new TreeMap<number, string>([[10, "a"], [20, "b"], [30, "c"], [40, "d"]]);

  it("finds the first and last key", () => {
    assert.equal(numbers().firstKey(), 10);
    assert.equal(numbers().lastKey(), 40);
  });

  it("throws from firstKey and lastKey on an empty map, as SortedMap does", () => {
    const empty = new TreeMap<number, string>();
    assert.throws(() => empty.firstKey(), NoSuchElementException);
    assert.throws(() => empty.lastKey(), NoSuchElementException);
  });

  it("answers null from firstEntry and lastEntry on an empty map, as NavigableMap does", () => {
    const empty = new TreeMap<number, string>();
    assert.equal(empty.firstEntry(), null);
    assert.equal(empty.lastEntry(), null);
  });

  it("hands back whole entries", () => {
    assert.equal(numbers().firstEntry()?.equals(new JavaMapEntry(10, "a")), true);
    assert.equal(numbers().lastEntry()?.equals(new JavaMapEntry(40, "d")), true);
  });

  it("floor and ceiling accept an exact match; lower and higher do not", () => {
    const map = numbers();
    assert.equal(map.floorKey(20), 20);
    assert.equal(map.ceilingKey(20), 20);
    assert.equal(map.lowerKey(20), 10);
    assert.equal(map.higherKey(20), 30);
  });

  it("navigates from a key that is not in the map at all", () => {
    const map = numbers();
    assert.equal(map.floorKey(25), 20);
    assert.equal(map.ceilingKey(25), 30);
    assert.equal(map.lowerKey(25), 20);
    assert.equal(map.higherKey(25), 30);
  });

  it("answers null when the query runs off either end", () => {
    const map = numbers();
    assert.equal(map.floorKey(5), null);
    assert.equal(map.lowerKey(10), null);
    assert.equal(map.ceilingKey(45), null);
    assert.equal(map.higherKey(40), null);
  });

  it("returns the matching entries too", () => {
    const map = numbers();
    assert.equal(map.floorEntry(25)?.getValue(), "b");
    assert.equal(map.ceilingEntry(25)?.getValue(), "c");
    assert.equal(map.lowerEntry(10), null);
    assert.equal(map.higherEntry(30)?.getValue(), "d");
  });

  it("polls from both ends, and answers null once empty", () => {
    const map = numbers();
    assert.equal(map.pollFirstEntry()?.getKey(), 10);
    assert.equal(map.pollLastEntry()?.getKey(), 40);
    assert.deepEqual([...map.keys()], [20, 30]);
    map.clear();
    assert.equal(map.pollFirstEntry(), null);
    assert.equal(map.pollLastEntry(), null);
  });

  it("navigates by the comparator it was given, not by the natural order", () => {
    const map = new TreeMap<number, string>(reverseOrder<number>(), [[10, "a"], [20, "b"], [30, "c"]]);
    assert.equal(map.firstKey(), 30);
    // "below" means "later in this map's order", which for a descending map is numerically smaller
    assert.equal(map.higherKey(20), 10);
    assert.equal(map.lowerKey(20), 30);
  });
});

describe("TreeMap ranges", () => {
  const numbers = (): TreeMap<number, string> =>
    new TreeMap<number, string>([[10, "a"], [20, "b"], [30, "c"], [40, "d"]]);

  it("headMap excludes its bound by default, and includes it on request", () => {
    assert.deepEqual([...numbers().headMap(30).keys()], [10, 20]);
    assert.deepEqual([...numbers().headMap(30, true).keys()], [10, 20, 30]);
  });

  it("tailMap includes its bound by default, and excludes it on request", () => {
    assert.deepEqual([...numbers().tailMap(30).keys()], [30, 40]);
    assert.deepEqual([...numbers().tailMap(30, false).keys()], [40]);
  });

  it("headMap and tailMap on the same key partition the map", () => {
    const map = numbers();
    assert.deepEqual([...map.headMap(30).keys(), ...map.tailMap(30).keys()], [10, 20, 30, 40]);
  });

  it("subMap is half-open by default", () => {
    assert.deepEqual([...numbers().subMap(20, 40).keys()], [20, 30]);
    assert.deepEqual([...numbers().subMap(20, 40, true, true).keys()], [20, 30, 40]);
    assert.deepEqual([...numbers().subMap(20, 40, false, false).keys()], [30]);
  });

  it("subMap accepts bounds that are not keys, and an empty result", () => {
    assert.deepEqual([...numbers().subMap(15, 35).keys()], [20, 30]);
    assert.deepEqual([...numbers().subMap(21, 29).keys()], []);
    assert.deepEqual([...numbers().subMap(20, 20).keys()], []);
  });

  it("refuses an inverted range", () => {
    assert.throws(() => numbers().subMap(40, 20), IllegalArgumentException);
  });

  it("writes through to the map it was taken from", () => {
    const map = numbers();
    const head = map.headMap(30);
    head.put(15, "new");
    head.remove(10);
    assert.deepEqual([...map.keys()], [15, 20, 30, 40]);
    assert.deepEqual([...head.keys()], [15, 20]);
  });

  it("sees changes made to the map behind it", () => {
    const map = numbers();
    const head = map.headMap(30);
    map.put(25, "new");
    map.remove(10);
    assert.deepEqual([...head.keys()], [20, 25]);
    assert.equal(head.size(), 2);
    // and a change outside the bounds is invisible to it
    map.put(35, "outside");
    assert.deepEqual([...head.keys()], [20, 25]);
  });

  it("refuses a key it could not then see", () => {
    const map = numbers();
    const middle = map.subMap(20, 40);
    assert.throws(() => middle.put(50, "past the top"), IllegalArgumentException);
    assert.throws(() => middle.put(5, "below the bottom"), IllegalArgumentException);
    assert.throws(() => middle.put(40, "the exclusive bound itself"), IllegalArgumentException);
    assert.doesNotThrow(() => middle.put(20, "the inclusive bound itself"));
  });

  it("treats a key outside its bounds as absent rather than throwing, for reads and removals", () => {
    const map = numbers();
    const middle = map.subMap(20, 40);
    assert.equal(middle.get(10), null);
    assert.equal(middle.containsKey(10), false);
    assert.equal(middle.remove(10), null);
    // the entry the range cannot see is still there
    assert.equal(map.get(10), "a");
  });

  it("answers size, ends and navigation within its bounds", () => {
    const middle = numbers().subMap(20, 40);
    assert.equal(middle.size(), 2);
    assert.equal(middle.firstKey(), 20);
    assert.equal(middle.lastKey(), 30);
    // a key past the top of the range floors to the range's own last key, not the map's
    assert.equal(middle.floorKey(100), 30);
    assert.equal(middle.ceilingKey(0), 20);
    assert.equal(middle.higherKey(30), null);
    assert.equal(middle.lowerKey(20), null);
  });

  it("is empty rather than negative when its bounds meet", () => {
    const map = numbers();
    const empty = map.subMap(20, 20);
    assert.equal(empty.size(), 0);
    assert.equal(empty.isEmpty(), true);
    assert.equal(empty.firstEntry(), null);
    assert.equal(empty.pollFirstEntry(), null);
    assert.throws(() => empty.firstKey(), NoSuchElementException);
  });

  it("polls and clears only what it can see", () => {
    const map = numbers();
    const middle = map.subMap(20, 40);
    assert.equal(middle.pollFirstEntry()?.getKey(), 20);
    assert.equal(middle.pollLastEntry()?.getKey(), 30);
    assert.deepEqual([...map.keys()], [10, 40]);

    const other = numbers();
    other.headMap(30).clear();
    assert.deepEqual([...other.keys()], [30, 40]);
  });

  it("narrows further, but will not be widened by narrowing", () => {
    const middle = numbers().subMap(20, 40);
    assert.deepEqual([...middle.headMap(30).keys()], [20]);
    assert.throws(() => middle.headMap(50), IllegalArgumentException);
    assert.throws(() => middle.tailMap(10), IllegalArgumentException);
    // the excluded top is still a legal place to cut, so long as the cut does not try to include it
    assert.doesNotThrow(() => middle.headMap(40));
    assert.throws(() => middle.headMap(40, true), IllegalArgumentException);
  });

  it("fails fast on a change to the map behind it, as the map's own walks do", () => {
    const map = numbers();
    const head = map.headMap(40);
    assert.throws(() => {
      for (const _pair of head) {
        map.put(50, "outside the range entirely");
      }
    }, ConcurrentModificationException);
  });

  it("a range keeps the comparator it came from", () => {
    const map = new TreeMap<number, string>(reverseOrder<number>(), [[10, "a"], [20, "b"], [30, "c"]]);
    const tail = map.tailMap(20);
    tail.put(15, "d");
    assert.deepEqual([...tail.keys()], [20, 15, 10]);
  });

  it("walks backwards within its bounds, and copies only those entries into a descending map", () => {
    const middle = numbers().subMap(20, 40);
    assert.deepEqual([...middle.descendingKeys()], [30, 20]);
    assert.deepEqual([...middle.descendingMap().keys()], [30, 20]);
  });

  it("hands out key, value and entry views that stop at its bounds and write through", () => {
    const map = numbers();
    const middle = map.subMap(20, 40);
    assert.deepEqual([...middle.keySet()], [20, 30]);
    assert.deepEqual(middle.values().toArray(), ["b", "c"]);
    assert.equal(middle.entrySet().size(), 2);

    const cursor = middle.entrySet().iterator();
    cursor.next();
    cursor.remove();
    assert.deepEqual([...map.keys()], [10, 30, 40]);
  });

  it("a range of a range is still live against the original", () => {
    const map = numbers();
    const inner = map.subMap(20, 40).headMap(30);
    map.put(25, "new");
    assert.deepEqual([...inner.keys()], [20, 25]);
    inner.remove(20);
    assert.deepEqual([...map.keys()], [10, 25, 30, 40]);
  });

  it("compares equal to a plain map holding the same entries", () => {
    const middle = numbers().subMap(20, 40);
    const plain = new TreeMap<number, string>([[20, "b"], [30, "c"]]);
    assert.equal(middle.equals(plain), true);
    assert.equal(middle.hashCode(), plain.hashCode());
    assert.equal(middle.toString(), "{20=b, 30=c}");
  });
});

describe("TreeMap descending", () => {
  const numbers = (): TreeMap<number, string> =>
    new TreeMap<number, string>([[10, "a"], [20, "b"], [30, "c"]]);

  it("walks the keys and entries backwards", () => {
    assert.deepEqual([...numbers().descendingKeys()], [30, 20, 10]);
    assert.deepEqual([...numbers().descendingEntries()].map((entry) => entry.getValue()), ["c", "b", "a"]);
  });

  it("descendingMap is a sorted map in its own right", () => {
    const descending = numbers().descendingMap();
    assert.deepEqual([...descending.keys()], [30, 20, 10]);
    assert.equal(descending.firstKey(), 30);
    descending.put(25, "new");
    assert.deepEqual([...descending.keys()], [30, 25, 20, 10]);
  });

  it("descendingMap is a copy, not a view", () => {
    const map = numbers();
    map.descendingMap().put(40, "d");
    assert.equal(map.containsKey(40), false);
  });

  it("has nothing to walk when empty", () => {
    assert.deepEqual([...new TreeMap<number, string>().descendingKeys()], []);
  });
});

describe("TreeMap fail-fast iteration", () => {
  it("throws when the map is structurally modified mid-walk", () => {
    const walks: readonly ((map: TreeMap<string, number>) => void)[] = [
      (map) => { for (const _pair of map) { map.remove("carol"); } },
      (map) => { for (const _key of map.keys()) { map.put("dave", 4); } },
      (map) => { for (const _value of map.valueIterator()) { map.remove("carol"); } },
      (map) => { for (const _entry of map.entries()) { map.remove("carol"); } },
      (map) => { for (const _key of map.descendingKeys()) { map.remove("alice"); } },
      (map) => { for (const _entry of map.descendingEntries()) { map.remove("alice"); } },
      (map) => map.forEach(() => map.remove("carol")),
    ];
    for (const walk of walks) {
      assert.throws(() => walk(letters()), ConcurrentModificationException);
    }
  });

  it("does not throw when only a value is replaced", () => {
    const map = letters();
    assert.doesNotThrow(() => {
      for (const [key] of map) {
        map.put(key, 0);
      }
    });
    assert.deepEqual(map.values().toArray(), [0, 0, 0]);
  });
});

describe("TreeMap immutability", () => {
  it("TreeMap.of refuses every mutator", () => {
    const map = TreeMap.of<string, number>(["b", 2], ["a", 1]);
    assert.deepEqual([...map.keys()], ["a", "b"]);
    assert.throws(() => map.put("c", 3), UnsupportedOperationException);
    assert.throws(() => map.remove("a"), UnsupportedOperationException);
    assert.throws(() => map.clear(), UnsupportedOperationException);
    assert.throws(() => map.pollFirstEntry(), UnsupportedOperationException);
    assert.throws(() => map.pollLastEntry(), UnsupportedOperationException);
  });

  it("an unmodifiable view stays live against the original and keeps its navigation", () => {
    const base = letters();
    const view = unmodifiableMap(base);
    base.put("dave", 4);
    assert.equal(view.lastKey(), "dave");
    assert.equal(view.floorKey("bz"), "bob");
    assert.throws(() => view.put("eve", 5), UnsupportedOperationException);
  });

  it("a range read off an unmodifiable view is unmodifiable too, since it writes through", () => {
    const view = unmodifiableMap(letters());
    const head = view.headMap("carol");
    assert.deepEqual([...head.keys()], ["alice", "bob"]);
    assert.throws(() => head.put("bea", 9), UnsupportedOperationException);
    assert.throws(() => head.clear(), UnsupportedOperationException);
  });

  it("TreeMap.of hands out ranges that refuse writes", () => {
    const map = TreeMap.of<string, number>(["b", 2], ["a", 1], ["c", 3]);
    assert.throws(() => map.headMap("c").put("bb", 9), UnsupportedOperationException);
  });

  it("an unmodifiable wrapper around a range keeps the range's bounds", () => {
    const base = letters();
    const view = unmodifiableMap(base.headMap("carol"));
    assert.deepEqual([...view.keys()], ["alice", "bob"]);
    base.put("dave", 4);
    assert.deepEqual([...view.keys()], ["alice", "bob"]);
    assert.throws(() => view.put("bea", 9), UnsupportedOperationException);
  });
});
