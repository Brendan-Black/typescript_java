import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { unmodifiableList, unmodifiableMap, unmodifiableSet } from "../src/collections/Collections.js";
import { JavaList } from "../src/collections/JavaList.js";
import { JavaMap } from "../src/collections/JavaMap.js";
import { JavaSet } from "../src/collections/JavaSet.js";
import { TreeMap } from "../src/collections/TreeMap.js";
import { TreeSet } from "../src/collections/TreeSet.js";
import { ConcurrentModificationException } from "../src/exceptions/ConcurrentModificationException.js";
import { IllegalStateException } from "../src/exceptions/IllegalStateException.js";
import { NoSuchElementException } from "../src/exceptions/NoSuchElementException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";

const letters = (): JavaList<string> => new JavaList<string>(["a", "b", "c"]);
const scores = (): JavaMap<string, number> => new JavaMap<string, number>([["a", 1], ["b", 2], ["c", 3]]);

describe("JavaIterator as a cursor", () => {
  it("walks with hasNext and next", () => {
    const it = letters().iterator();
    const seen: string[] = [];
    while (it.hasNext()) {
      seen.push(it.next());
    }
    assert.deepEqual(seen, ["a", "b", "c"]);
    assert.equal(it.hasNext(), false);
  });

  it("throws once exhausted rather than answering undefined", () => {
    const it = new JavaList<string>(["only"]).iterator();
    assert.equal(it.next(), "only");
    assert.throws(() => it.next(), NoSuchElementException);
  });

  it("is empty from the start for an empty collection", () => {
    const it = new JavaList<string>().iterator();
    assert.equal(it.hasNext(), false);
    assert.throws(() => it.next(), NoSuchElementException);
  });

  it("is itself iterable, and picks up from where the cursor already is", () => {
    const it = letters().iterator();
    assert.equal(it.next(), "a");
    assert.deepEqual([...it], ["b", "c"]);
  });

  it("can be handed straight to anything taking an Iterable", () => {
    assert.deepEqual(new JavaList<string>(letters().iterator()).toArray(), ["a", "b", "c"]);
  });
});

describe("JavaIterator.remove", () => {
  it("removes the element last returned", () => {
    const list = letters();
    const it = list.iterator();
    it.next();
    it.next();
    it.remove();
    assert.deepEqual(list.toArray(), ["a", "c"]);
  });

  it("carries on walking the elements the removal did not touch", () => {
    const list = letters();
    const it = list.iterator();
    const seen: string[] = [];
    while (it.hasNext()) {
      const value = it.next();
      seen.push(value);
      if (value === "a") {
        it.remove();
      }
    }
    assert.deepEqual(seen, ["a", "b", "c"]);
    assert.deepEqual(list.toArray(), ["b", "c"]);
  });

  it("can empty a collection as it goes", () => {
    const list = letters();
    const it = list.iterator();
    while (it.hasNext()) {
      it.next();
      it.remove();
    }
    assert.equal(list.isEmpty(), true);
  });

  it("removes by position, so duplicates are told apart — which removeIf cannot do", () => {
    const list = new JavaList<string>(["x", "dup", "dup", "y"]);
    const it = list.iterator();
    it.next();
    it.next();
    it.next();
    // the third element, not the first "dup"
    it.remove();
    assert.deepEqual(list.toArray(), ["x", "dup", "y"]);

    const byValue = new JavaList<string>(["x", "dup", "dup", "y"]);
    byValue.removeIf((value) => value === "dup");
    assert.deepEqual(byValue.toArray(), ["x", "y"]);
  });

  it("keeps its place across several removals, which shift everything behind them", () => {
    const list = new JavaList<string>(["a", "b", "c", "d", "e"]);
    const it = list.iterator();
    const seen: string[] = [];
    while (it.hasNext()) {
      const value = it.next();
      seen.push(value);
      if (value === "b" || value === "d") {
        it.remove();
      }
    }
    assert.deepEqual(seen, ["a", "b", "c", "d", "e"]);
    assert.deepEqual(list.toArray(), ["a", "c", "e"]);
  });

  it("insists on following a next", () => {
    const it = letters().iterator();
    assert.throws(() => it.remove(), IllegalStateException);
  });

  it("refuses to remove the same element twice", () => {
    const it = letters().iterator();
    it.next();
    it.remove();
    assert.throws(() => it.remove(), IllegalStateException);
  });

  it("is willing again after the next next", () => {
    const list = letters();
    const it = list.iterator();
    it.next();
    it.remove();
    assert.throws(() => it.remove(), IllegalStateException);
    it.next();
    it.remove();
    assert.deepEqual(list.toArray(), ["c"]);
  });
});

describe("JavaIterator fail-fast", () => {
  it("does not trip on its own removals", () => {
    const list = letters();
    const it = list.iterator();
    it.next();
    it.remove();
    assert.doesNotThrow(() => it.next());
  });

  it("throws when the collection is modified behind its back", () => {
    const list = letters();
    const it = list.iterator();
    it.next();
    list.add("d");
    assert.throws(() => it.next(), ConcurrentModificationException);
  });

  it("throws from remove as well as from next", () => {
    const list = letters();
    const it = list.iterator();
    it.next();
    list.remove("c");
    assert.throws(() => it.remove(), ConcurrentModificationException);
  });

  it("is not tripped by a non-structural change", () => {
    const list = letters();
    const it = list.iterator();
    it.next();
    list.set(2, "C");
    assert.equal(it.next(), "b");
  });
});

describe("JavaIterator over sets", () => {
  it("removes from a hash set", () => {
    const set = new JavaSet<string>(["a", "b", "c"]);
    const it = set.iterator();
    while (it.hasNext()) {
      if (it.next() === "b") {
        it.remove();
      }
    }
    assert.equal(set.contains("b"), false);
    assert.equal(set.size(), 2);
  });

  it("walks a TreeSet in order and removes the member it is standing on", () => {
    const set = new TreeSet<number>([30, 10, 20]);
    const it = set.iterator();
    assert.deepEqual([it.next(), it.next()], [10, 20]);
    it.remove();
    assert.deepEqual(set.toArray(), [10, 30]);
  });

  it("removes through a TreeSet's comparator rather than through equals", () => {
    const set = new TreeSet<string>((a, b) => a.length - b.length, ["a", "bb", "ccc"]);
    const it = set.iterator();
    it.next();
    it.remove();
    assert.deepEqual(set.toArray(), ["bb", "ccc"]);
  });

  it("fails fast on a set modified behind its back", () => {
    const set = new JavaSet<string>(["a", "b"]);
    const it = set.iterator();
    it.next();
    set.add("c");
    assert.throws(() => it.next(), ConcurrentModificationException);
  });
});

describe("JavaIterator over map views", () => {
  it("removes an entry through the key set", () => {
    const map = scores();
    const it = map.keySet().iterator();
    it.next();
    it.remove();
    assert.equal(map.containsKey("a"), false);
    assert.equal(map.size(), 2);
  });

  it("removes an entry through the entry set", () => {
    const map = scores();
    const it = map.entrySet().iterator();
    assert.equal(it.next().getKey(), "a");
    assert.equal(it.next().getValue(), 2);
    it.remove();
    assert.deepEqual(map.keySet().toArray(), ["a", "c"]);
  });

  it("removes the entry the cursor is on through the values view, not the first equal value", () => {
    const map = new JavaMap<string, number>([["a", 7], ["b", 7], ["c", 9]]);
    const it = map.values().iterator();
    it.next();
    it.next();
    it.remove();
    assert.deepEqual(map.keySet().toArray(), ["a", "c"]);

    // the view's own remove(value) can only find the first entry holding it, which is Java's behaviour too
    const byValue = new JavaMap<string, number>([["a", 7], ["b", 7], ["c", 9]]);
    byValue.values().remove(7);
    assert.deepEqual(byValue.keySet().toArray(), ["b", "c"]);
  });

  it("walks a TreeMap's entries in key order", () => {
    const map = new TreeMap<number, string>([[3, "c"], [1, "a"], [2, "b"]]);
    const it = map.entrySet().iterator();
    assert.deepEqual([...it].map((entry) => entry.getKey()), [1, 2, 3]);
  });

  it("removes from a TreeMap through its entry iterator", () => {
    const map = new TreeMap<number, string>([[3, "c"], [1, "a"], [2, "b"]]);
    const it = map.entryIterator();
    it.next();
    it.remove();
    assert.deepEqual([...map.keys()], [2, 3]);
  });

  it("fails fast on a map modified behind the view's back", () => {
    const map = scores();
    const it = map.keySet().iterator();
    it.next();
    map.put("d", 4);
    assert.throws(() => it.next(), ConcurrentModificationException);
  });

  it("is not tripped by replacing a value, which is not structural", () => {
    const map = scores();
    const it = map.keySet().iterator();
    it.next();
    map.put("c", 30);
    assert.equal(it.next(), "b");
  });
});

describe("JavaIterator on unmodifiable collections", () => {
  it("still walks", () => {
    assert.deepEqual([...unmodifiableList(letters()).iterator()], ["a", "b", "c"]);
  });

  it("refuses to remove from a list", () => {
    const it = unmodifiableList(letters()).iterator();
    it.next();
    assert.throws(() => it.remove(), UnsupportedOperationException);
  });

  it("refuses to remove from a set, and from one built by of()", () => {
    const view = unmodifiableSet(new JavaSet<string>(["a"])).iterator();
    view.next();
    assert.throws(() => view.remove(), UnsupportedOperationException);

    const frozen = JavaSet.of<string>("a").iterator();
    frozen.next();
    assert.throws(() => frozen.remove(), UnsupportedOperationException);

    const sorted = TreeSet.of<string>("a").iterator();
    sorted.next();
    assert.throws(() => sorted.remove(), UnsupportedOperationException);
  });

  it("refuses to remove through a map view", () => {
    const map = unmodifiableMap(scores());
    const keys = map.keySet().iterator();
    keys.next();
    assert.throws(() => keys.remove(), UnsupportedOperationException);

    const entries = map.entrySet().iterator();
    entries.next();
    assert.throws(() => entries.remove(), UnsupportedOperationException);

    const values = map.values().iterator();
    values.next();
    assert.throws(() => values.remove(), UnsupportedOperationException);
  });

  it("refuses before it complains about call order", () => {
    // the collection cannot be removed from at all, which is the more useful answer than "you have not called
    // next() yet". A modifiable collection asked the same way gets the state complaint.
    assert.throws(() => unmodifiableList(letters()).iterator().remove(), UnsupportedOperationException);
    assert.throws(() => JavaSet.of<string>("a").iterator().remove(), UnsupportedOperationException);
    assert.throws(() => letters().iterator().remove(), IllegalStateException);
  });
});
