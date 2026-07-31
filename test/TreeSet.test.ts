import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { max, min, unmodifiableSet } from "../src/collections/Collections.js";
import { AbstractSet } from "../src/collections/Collection.js";
import { Set } from "../src/collections/Set.js";
import { TreeSet } from "../src/collections/TreeSet.js";
import { ConcurrentModificationException } from "../src/exceptions/ConcurrentModificationException.js";
import { IllegalArgumentException } from "../src/exceptions/IllegalArgumentException.js";
import { NoSuchElementException } from "../src/exceptions/NoSuchElementException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";
import { comparing, reverseOrder } from "../src/fundamentals/Comparator.js";

const names = (): TreeSet<string> => new TreeSet<string>(["carol", "alice", "bob"]);
const numbers = (): TreeSet<number> => new TreeSet<number>([10, 20, 30, 40]);

describe("TreeSet ordering", () => {
  it("iterates in order rather than insertion order", () => {
    assert.deepEqual(names().toArray(), ["alice", "bob", "carol"]);
  });

  it("orders numbers numerically, not as strings", () => {
    assert.deepEqual(new TreeSet<number>([10, 9, 100]).toArray(), [9, 10, 100]);
  });

  it("honours an explicit comparator", () => {
    assert.deepEqual(new TreeSet<string>(reverseOrder<string>(), ["a", "c", "b"]).toArray(), ["c", "b", "a"]);
  });

  it("keeps order across later additions", () => {
    const set = names();
    set.add("bea");
    assert.deepEqual(set.toArray(), ["alice", "bea", "bob", "carol"]);
  });

  it("reports its comparator, and null when the order is the natural one", () => {
    assert.equal(names().comparator(), null);
    const ordering = reverseOrder<string>();
    assert.equal(new TreeSet<string>(ordering).comparator(), ordering);
  });

  it("tells a comparator apart from initial contents without being told which is which", () => {
    assert.deepEqual(new TreeSet<string>(["b", "a"]).toArray(), ["a", "b"]);
    assert.deepEqual(new TreeSet<string>(reverseOrder<string>(), ["b", "a"]).toArray(), ["b", "a"]);
  });
});

describe("TreeSet membership", () => {
  it("collapses duplicates", () => {
    const set = new TreeSet<string>(["a", "a", "b"]);
    assert.equal(set.size(), 2);
    assert.equal(set.add("a"), false);
    assert.equal(set.add("c"), true);
  });

  it("decides membership by comparing, not by equals", () => {
    // a comparator that only looks at length: "cat" and "dog" are the same member here
    const set = new TreeSet<string>(comparing<string, number>((value) => value.length));
    assert.equal(set.add("cat"), true);
    assert.equal(set.add("dog"), false);
    assert.equal(set.contains("pig"), true);
    assert.deepEqual(set.toArray(), ["cat"]);
  });

  it("removes by comparison", () => {
    const set = names();
    assert.equal(set.remove("bob"), true);
    assert.equal(set.remove("bob"), false);
    assert.deepEqual(set.toArray(), ["alice", "carol"]);
  });

  it("inherits the bulk operations, and retainAll respects the comparator", () => {
    const set = new TreeSet<string>(comparing<string, number>((value) => value.length), ["a", "bb", "ccc"]);
    assert.equal(set.containsAll(["z", "yy"]), true);
    // "zz" is length 2, which is what this set calls the same member as "bb"
    set.retainAll(["zz"]);
    assert.deepEqual(set.toArray(), ["bb"]);
  });

  it("removeIf works through the comparator-based remove", () => {
    const set = numbers();
    assert.equal(set.removeIf((value) => value > 20), true);
    assert.deepEqual(set.toArray(), [10, 20]);
  });

  it("is a AbstractSet, so it equals a hash set with the same members", () => {
    const tree = names();
    assert.equal(tree instanceof AbstractSet, true);
    assert.equal(tree.equals(new Set<string>(["bob", "carol", "alice"])), true);
    assert.equal(new Set<string>(["bob", "carol", "alice"]).equals(tree), true);
    assert.equal(tree.hashCode(), new Set<string>(["alice", "bob", "carol"]).hashCode());
  });

  it("formats and serialises like any other collection, in order", () => {
    assert.equal(names().toString(), "[alice, bob, carol]");
    assert.equal(JSON.stringify(names()), '["alice","bob","carol"]');
  });

  it("works as an Iterable for Collections.max and min", () => {
    assert.equal(max(numbers()), 40);
    assert.equal(min(numbers()), 10);
  });
});

describe("TreeSet navigation", () => {
  it("finds the first and last member", () => {
    assert.equal(numbers().first(), 10);
    assert.equal(numbers().last(), 40);
  });

  it("throws from first and last on an empty set, as SortedSet does", () => {
    const empty = new TreeSet<number>();
    assert.throws(() => empty.first(), NoSuchElementException);
    assert.throws(() => empty.last(), NoSuchElementException);
  });

  it("floor and ceiling accept an exact match; lower and higher do not", () => {
    const set = numbers();
    assert.equal(set.floor(20), 20);
    assert.equal(set.ceiling(20), 20);
    assert.equal(set.lower(20), 10);
    assert.equal(set.higher(20), 30);
  });

  it("navigates from a value that is not a member", () => {
    const set = numbers();
    assert.equal(set.floor(25), 20);
    assert.equal(set.ceiling(25), 30);
    assert.equal(set.lower(25), 20);
    assert.equal(set.higher(25), 30);
  });

  it("answers null when the query runs off either end", () => {
    const set = numbers();
    assert.equal(set.floor(5), null);
    assert.equal(set.lower(10), null);
    assert.equal(set.ceiling(45), null);
    assert.equal(set.higher(40), null);
  });

  it("polls from both ends, and answers null once empty", () => {
    const set = numbers();
    assert.equal(set.pollFirst(), 10);
    assert.equal(set.pollLast(), 40);
    assert.deepEqual(set.toArray(), [20, 30]);
    set.clear();
    assert.equal(set.pollFirst(), null);
    assert.equal(set.pollLast(), null);
  });
});

describe("TreeSet ranges", () => {
  it("headSet excludes its bound by default, and includes it on request", () => {
    assert.deepEqual(numbers().headSet(30).toArray(), [10, 20]);
    assert.deepEqual(numbers().headSet(30, true).toArray(), [10, 20, 30]);
  });

  it("tailSet includes its bound by default, and excludes it on request", () => {
    assert.deepEqual(numbers().tailSet(30).toArray(), [30, 40]);
    assert.deepEqual(numbers().tailSet(30, false).toArray(), [40]);
  });

  it("headSet and tailSet on the same value partition the set", () => {
    const set = numbers();
    assert.deepEqual([...set.headSet(30).toArray(), ...set.tailSet(30).toArray()], [10, 20, 30, 40]);
  });

  it("subSet is half-open by default", () => {
    assert.deepEqual(numbers().subSet(20, 40).toArray(), [20, 30]);
    assert.deepEqual(numbers().subSet(20, 40, true, true).toArray(), [20, 30, 40]);
    assert.deepEqual(numbers().subSet(20, 40, false, false).toArray(), [30]);
  });

  it("refuses an inverted range", () => {
    assert.throws(() => numbers().subSet(40, 20), IllegalArgumentException);
  });

  it("writes through to the set it was taken from", () => {
    const set = numbers();
    const head = set.headSet(30);
    head.add(15);
    head.remove(10);
    assert.deepEqual(set.toArray(), [15, 20, 30, 40]);
    assert.deepEqual(head.toArray(), [15, 20]);
  });

  it("sees changes made to the set behind it", () => {
    const set = numbers();
    const head = set.headSet(30);
    set.add(25);
    set.add(35);
    assert.deepEqual(head.toArray(), [10, 20, 25]);
    assert.equal(head.size(), 3);
  });

  it("refuses a member it could not then see", () => {
    const middle = numbers().subSet(20, 40);
    assert.throws(() => middle.add(50), IllegalArgumentException);
    assert.throws(() => middle.add(40), IllegalArgumentException);
    assert.doesNotThrow(() => middle.add(25));
  });

  it("treats a member outside its bounds as absent", () => {
    const set = numbers();
    const middle = set.subSet(20, 40);
    assert.equal(middle.contains(10), false);
    assert.equal(middle.remove(10), false);
    assert.equal(set.contains(10), true);
  });

  it("answers its ends and navigation within its bounds", () => {
    const middle = numbers().subSet(20, 40);
    assert.equal(middle.size(), 2);
    assert.equal(middle.first(), 20);
    assert.equal(middle.last(), 30);
    assert.equal(middle.floor(100), 30);
    assert.equal(middle.higher(30), null);
    assert.throws(() => numbers().subSet(20, 20).first(), NoSuchElementException);
  });

  it("polls and clears only what it can see", () => {
    const set = numbers();
    const middle = set.subSet(20, 40);
    assert.equal(middle.pollFirst(), 20);
    assert.equal(middle.pollLast(), 30);
    assert.deepEqual(set.toArray(), [10, 40]);

    const other = numbers();
    other.headSet(30).clear();
    assert.deepEqual(other.toArray(), [30, 40]);
  });

  it("narrows further, but will not be widened by narrowing", () => {
    const middle = numbers().subSet(20, 40);
    assert.deepEqual(middle.headSet(30).toArray(), [20]);
    assert.throws(() => middle.tailSet(10), IllegalArgumentException);
    assert.throws(() => middle.headSet(40, true), IllegalArgumentException);
  });

  it("removes through its iterator, taking the member from the set behind it", () => {
    const set = numbers();
    const middle = set.subSet(20, 40);
    const cursor = middle.iterator();
    cursor.next();
    cursor.remove();
    assert.deepEqual(set.toArray(), [10, 30, 40]);
  });

  it("a range keeps the comparator it came from", () => {
    const set = new TreeSet<number>(reverseOrder<number>(), [10, 20, 30]);
    const tail = set.tailSet(20);
    tail.add(15);
    assert.deepEqual(tail.toArray(), [20, 15, 10]);
  });
});

describe("TreeSet descending", () => {
  it("walks backwards", () => {
    assert.deepEqual([...numbers().descendingIterator()], [40, 30, 20, 10]);
    assert.deepEqual([...new TreeSet<number>().descendingIterator()], []);
  });

  it("descendingSet is a sorted set in its own right", () => {
    const descending = numbers().descendingSet();
    assert.deepEqual(descending.toArray(), [40, 30, 20, 10]);
    assert.equal(descending.first(), 40);
    descending.add(25);
    assert.deepEqual(descending.toArray(), [40, 30, 25, 20, 10]);
  });

  it("descendingSet is a copy, not a view", () => {
    const set = numbers();
    set.descendingSet().add(50);
    assert.equal(set.contains(50), false);
  });
});

describe("TreeSet fail-fast iteration", () => {
  it("throws when the set is structurally modified mid-walk", () => {
    const set = numbers();
    assert.throws(() => {
      for (const _value of set) {
        set.remove(40);
      }
    }, ConcurrentModificationException);

    const descending = numbers();
    assert.throws(() => {
      for (const _value of descending.descendingIterator()) {
        descending.remove(10);
      }
    }, ConcurrentModificationException);
  });
});

describe("TreeSet immutability", () => {
  it("TreeSet.of refuses every mutator", () => {
    const set = TreeSet.of<string>("b", "a");
    assert.deepEqual(set.toArray(), ["a", "b"]);
    assert.throws(() => set.add("c"), UnsupportedOperationException);
    assert.throws(() => set.remove("a"), UnsupportedOperationException);
    assert.throws(() => set.clear(), UnsupportedOperationException);
    assert.throws(() => set.retainAll(["a"]), UnsupportedOperationException);
    assert.throws(() => set.pollFirst(), UnsupportedOperationException);
    assert.throws(() => set.pollLast(), UnsupportedOperationException);
  });

  it("an unmodifiable view stays live against the original and keeps its navigation", () => {
    const base = names();
    const view = unmodifiableSet(base);
    base.add("dave");
    assert.equal(view.last(), "dave");
    assert.equal(view.floor("bz"), "bob");
    assert.throws(() => view.add("eve"), UnsupportedOperationException);
  });

  it("a range read off an unmodifiable view is unmodifiable too, since it writes through", () => {
    const view = unmodifiableSet(names());
    const head = view.headSet("carol");
    assert.deepEqual(head.toArray(), ["alice", "bob"]);
    assert.throws(() => head.add("bea"), UnsupportedOperationException);
    assert.throws(() => head.clear(), UnsupportedOperationException);
  });

  it("TreeSet.of hands out ranges that refuse writes, though its backing map is not itself read-only", () => {
    const set = TreeSet.of<string>("a", "b", "c");
    assert.throws(() => set.headSet("c").add("bb"), UnsupportedOperationException);
    assert.throws(() => set.headSet("c").pollFirst(), UnsupportedOperationException);
  });
});
