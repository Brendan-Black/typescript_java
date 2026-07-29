import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  binarySearch,
  emptyList,
  emptyMap,
  emptySet,
  max,
  min,
  reverse,
  singleton,
  singletonList,
  singletonMap,
  sort,
  swap,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSet,
} from "../src/collections/Collections.js";
import { JavaList } from "../src/collections/JavaList.js";
import { JavaMap } from "../src/collections/JavaMap.js";
import { JavaSet } from "../src/collections/JavaSet.js";
import { ClassCastException } from "../src/exceptions/ClassCastException.js";
import { IndexOutOfBoundsException } from "../src/exceptions/IndexOutOfBoundsException.js";
import { NoSuchElementException } from "../src/exceptions/NoSuchElementException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";
import { comparing, naturalOrder, nullsLast, reverseOrder } from "../src/fundamentals/Comparator.js";

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

/** an element with an order that deliberately ignores part of its identity, so ties are observable */
interface Ranked {
  readonly rank: number;
  readonly label: string;
}

const byRank = comparing<Ranked, number>((value) => value.rank);

describe("sort", () => {
  it("sorts by natural order when given no comparator", () => {
    const numbers = new JavaList<number>([3, 1, 2]);
    sort(numbers);
    assert.deepEqual(numbers.toArray(), [1, 2, 3]);
  });

  it("does not sort numbers as strings, unlike Array.prototype.sort", () => {
    const numbers = new JavaList<number>([10, 9]);
    sort(numbers);
    assert.deepEqual(numbers.toArray(), [9, 10]);
  });

  it("sorts strings by code unit, as String.compareTo does", () => {
    const names = new JavaList<string>(["banana", "Zebra", "apple"]);
    sort(names);
    assert.deepEqual(names.toArray(), ["Zebra", "apple", "banana"]);
  });

  it("sorts by the comparator when given one", () => {
    const numbers = new JavaList<number>([3, 1, 2]);
    sort(numbers, reverseOrder<number>());
    assert.deepEqual(numbers.toArray(), [3, 2, 1]);
  });

  it("is stable: equal elements keep their relative order", () => {
    const items = new JavaList<Ranked>([
      { rank: 1, label: "first" },
      { rank: 0, label: "zero" },
      { rank: 1, label: "second" },
    ]);
    sort(items, byRank);
    assert.deepEqual(items.toArray().map((item) => item.label), ["zero", "first", "second"]);
  });

  it("honours the comparator on undefined elements", () => {
    // Array.prototype.sort hoists undefined to the end without consulting the comparator; JavaList.sort sorts
    // positions so that nothing is hidden, and Collections.sort inherits that
    const numbers = new JavaList<number | undefined>([2, undefined, 1]);
    sort(numbers, nullsLast(naturalOrder<number>()));
    assert.deepEqual(numbers.toArray(), [1, 2, undefined]);
  });

  it("refuses an unmodifiable list", () => {
    assert.throws(() => sort(JavaList.of(2, 1)), UnsupportedOperationException);
  });

  it("throws ClassCastException when natural order has nothing to work with", () => {
    // the compiler stops this at the call site; the cast is how a JavaScript caller would get here
    const mixed = new JavaList<unknown>([1, "a"]);
    assert.throws(() => sort(mixed as JavaList<number>), ClassCastException);
  });

  it("leaves an empty list alone", () => {
    const empty = new JavaList<number>();
    sort(empty);
    assert.equal(empty.size(), 0);
  });
});

describe("max and min", () => {
  it("find the extremes in natural order", () => {
    assert.equal(max(new JavaList<number>([3, 1, 2])), 3);
    assert.equal(min(new JavaList<number>([3, 1, 2])), 1);
  });

  it("use the comparator when given one", () => {
    assert.equal(max(new JavaList<number>([3, 1, 2]), reverseOrder<number>()), 1);
    assert.equal(min(new JavaList<number>([3, 1, 2]), reverseOrder<number>()), 3);
  });

  it("accept any iterable, not just a JavaCollection", () => {
    assert.equal(max([3, 1, 2]), 3);
    assert.equal(min(new JavaSet<string>(["b", "a", "c"])), "a");
    assert.equal(max(new Set<number>([1, 5, 3])), 5);
  });

  it("keep the first of equal elements, as Java does", () => {
    const first: Ranked = { rank: 1, label: "first" };
    const second: Ranked = { rank: 1, label: "second" };
    assert.equal(max([first, second], byRank), first);
    assert.equal(min([first, second], byRank), first);
  });

  it("throw NoSuchElementException on an empty collection", () => {
    assert.throws(() => max(emptyList<number>()), NoSuchElementException);
    assert.throws(() => min<number>([]), NoSuchElementException);
  });

  it("say which operation had nothing to answer with", () => {
    assert.throws(() => max<number>([]), {
      message: "Collections.max has no answer for an empty collection.",
    });
  });

  it("put NaN last, as Double.compare does", () => {
    assert.equal(Number.isNaN(max([1, Number.NaN, 2])), true);
    assert.equal(min([1, Number.NaN, 2]), 1);
  });

  it("answer for a single element without consulting the comparator", () => {
    assert.equal(max(singletonList(7)), 7);
    assert.equal(min(singleton("only")), "only");
  });
});

describe("binarySearch", () => {
  const sorted = new JavaList<number>([10, 20, 30, 40]);

  it("finds every element that is present", () => {
    assert.equal(binarySearch(sorted, 10), 0);
    assert.equal(binarySearch(sorted, 20), 1);
    assert.equal(binarySearch(sorted, 30), 2);
    assert.equal(binarySearch(sorted, 40), 3);
  });

  it("encodes a miss as -(insertionPoint) - 1", () => {
    assert.equal(binarySearch(sorted, 5), -1); // would insert at 0
    assert.equal(binarySearch(sorted, 15), -2); // would insert at 1
    assert.equal(binarySearch(sorted, 35), -4); // would insert at 3
    assert.equal(binarySearch(sorted, 45), -5); // would insert at the end
  });

  it("keeps a miss strictly negative, which is why the encoding is offset by one", () => {
    // an insertion point of 0 would otherwise encode as -0, and -0 >= 0
    assert.equal(binarySearch(sorted, 5) < 0, true);
  });

  it("reports -1 for an empty list", () => {
    assert.equal(binarySearch(emptyList<number>(), 1), -1);
  });

  it("gives an insertion point that keeps the list sorted", () => {
    const list = new JavaList<number>([10, 30]);
    const at = binarySearch(list, 20);
    assert.equal(at < 0, true);
    list.addAt(-(at + 1), 20);
    assert.deepEqual(list.toArray(), [10, 20, 30]);
  });

  it("searches by the comparator when given one", () => {
    const descending = new JavaList<number>([40, 30, 20, 10]);
    assert.equal(binarySearch(descending, 30, reverseOrder<number>()), 1);
    assert.equal(binarySearch(descending, 35, reverseOrder<number>()), -2);
  });

  it("searches a list of objects by an extracted key", () => {
    const items = new JavaList<Ranked>([
      { rank: 1, label: "a" },
      { rank: 2, label: "b" },
      { rank: 3, label: "c" },
    ]);
    assert.equal(binarySearch(items, { rank: 2, label: "ignored" }, byRank), 1);
  });
});

describe("reverse and swap", () => {
  it("reverses an even-length list", () => {
    const list = new JavaList<number>([1, 2, 3, 4]);
    reverse(list);
    assert.deepEqual(list.toArray(), [4, 3, 2, 1]);
  });

  it("reverses an odd-length list, leaving the middle where it is", () => {
    const list = new JavaList<number>([1, 2, 3]);
    reverse(list);
    assert.deepEqual(list.toArray(), [3, 2, 1]);
  });

  it("leaves empty and single-element lists alone", () => {
    const empty = new JavaList<number>();
    reverse(empty);
    assert.equal(empty.size(), 0);
    const one = new JavaList<number>([1]);
    reverse(one);
    assert.deepEqual(one.toArray(), [1]);
  });

  it("swaps two positions", () => {
    const list = new JavaList<string>(["a", "b", "c"]);
    swap(list, 0, 2);
    assert.deepEqual(list.toArray(), ["c", "b", "a"]);
  });

  it("swapping a position with itself changes nothing", () => {
    const list = new JavaList<string>(["a", "b"]);
    swap(list, 1, 1);
    assert.deepEqual(list.toArray(), ["a", "b"]);
  });

  it("rejects an out-of-range index", () => {
    assert.throws(() => swap(new JavaList<number>([1, 2]), 0, 5), IndexOutOfBoundsException);
  });

  it("refuses an unmodifiable list", () => {
    assert.throws(() => reverse(JavaList.of(1, 2)), UnsupportedOperationException);
    assert.throws(() => swap(JavaList.of(1, 2), 0, 1), UnsupportedOperationException);
  });

  it("does not disturb iteration, being a replacement rather than a structural change", () => {
    const list = new JavaList<number>([1, 2, 3]);
    reverse(list);
    assert.deepEqual([...list], [3, 2, 1]);
  });
});

describe("removeIf", () => {
  it("drops every element the predicate accepts", () => {
    const list = new JavaList<number>([1, 2, 3, 4]);
    assert.equal(list.removeIf((value) => value % 2 === 0), true);
    assert.deepEqual(list.toArray(), [1, 3]);
  });

  it("reports that nothing changed when nothing matched", () => {
    const list = new JavaList<number>([1, 3]);
    assert.equal(list.removeIf((value) => value % 2 === 0), false);
    assert.deepEqual(list.toArray(), [1, 3]);
  });

  it("removes duplicates that all match", () => {
    const list = new JavaList<number>([1, 2, 2, 3]);
    assert.equal(list.removeIf((value) => value === 2), true);
    assert.deepEqual(list.toArray(), [1, 3]);
  });

  it("works on a set", () => {
    const set = new JavaSet<string>(["apple", "fig", "banana"]);
    assert.equal(set.removeIf((value) => value.length > 3), true);
    assert.deepEqual(set.toArray(), ["fig"]);
  });

  it("works through a map's key view, taking the entries with it", () => {
    const map = new JavaMap<string, number>([["a", 1], ["bb", 2], ["ccc", 3]]);
    assert.equal(map.keySet().removeIf((key) => key.length > 1), true);
    assert.deepEqual(map.keySet().toArray(), ["a"]);
    assert.equal(map.size(), 1);
  });

  it("does not need a snapshot at the call site, unlike removing inside for...of", () => {
    const list = new JavaList<number>([1, 2, 3]);
    list.removeIf((value) => value === 2);
    assert.deepEqual(list.toArray(), [1, 3]);
  });

  it("refuses an unmodifiable collection when something actually matches", () => {
    assert.throws(() => JavaList.of(1, 2).removeIf((value) => value === 1), UnsupportedOperationException);
  });
});
