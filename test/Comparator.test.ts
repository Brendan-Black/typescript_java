import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { List } from "../src/collections/List.js";
import { ClassCastException } from "../src/exceptions/ClassCastException.js";
import { ConcurrentModificationException } from "../src/exceptions/ConcurrentModificationException.js";
import { NullPointerException } from "../src/exceptions/NullPointerException.js";
import { compareOf, type Comparable } from "../src/fundamentals/Comparable.js";
import {
  comparator,
  comparing,
  naturalOrder,
  nullsFirst,
  nullsLast,
  reverseOrder,
  type Comparator,
} from "../src/fundamentals/Comparator.js";
import { JavaObject } from "../src/fundamentals/Object.js";

class Money extends JavaObject implements Comparable<Money> {
  constructor(public readonly cents: number) {
    super();
  }
  public compareTo(other: Money): number {
    return this.cents - other.cents;
  }
}

interface User {
  readonly surname: string;
  readonly forename: string;
  readonly age: number;
}

const users: readonly User[] = [
  { surname: "Lovelace", forename: "Ada", age: 36 },
  { surname: "Hopper", forename: "Grace", age: 85 },
  { surname: "Lovelace", forename: "Byron", age: 12 },
];

const names = (sorted: readonly User[]) => sorted.map((u) => `${u.forename} ${u.surname}`);

describe("compareOf", () => {
  it("orders numbers", () => {
    assert.equal(compareOf(1, 2) < 0, true);
    assert.equal(compareOf(2, 1) > 0, true);
    assert.equal(compareOf(2, 2), 0);
  });

  it("sorts NaN last rather than poisoning the sort, as Double.compare does", () => {
    // `(a, b) => a - b` returns NaN here, which Array.prototype.sort reads as "these are equal", and one NaN in
    // the input is enough to leave the rest in an arbitrary order
    assert.equal(compareOf(NaN, Infinity) > 0, true);
    assert.equal(compareOf(-Infinity, NaN) < 0, true);
    assert.equal(compareOf(NaN, NaN), 0);
    assert.deepEqual([3, NaN, 1, 2].sort(naturalOrder<number>()), [1, 2, 3, NaN]);
  });

  it("orders -0 before 0, as Double.compare does", () => {
    assert.equal(compareOf(-0, 0) < 0, true);
    assert.equal(compareOf(0, -0) > 0, true);
    assert.equal(compareOf(-0, -0), 0);
  });

  it("returns String.compareTo's exact value, not just its sign", () => {
    // 'a' is 97, 'c' is 99
    assert.equal(compareOf("a", "c"), -2);
    // one string a prefix of the other: the difference in length
    assert.equal(compareOf("ab", "abcd"), -2);
    assert.equal(compareOf("abc", "abc"), 0);
  });

  it("orders strings by code unit, so uppercase sorts before lowercase", () => {
    assert.equal(compareOf("Z", "a") < 0, true);
  });

  it("orders false before true, as Boolean.compare does", () => {
    assert.equal(compareOf(false, true) < 0, true);
    assert.equal(compareOf(true, true), 0);
  });

  it("orders bigints by value rather than by their string form", () => {
    assert.equal(compareOf(9n, 10n) < 0, true);
  });

  it("orders dates by instant", () => {
    assert.equal(compareOf(new Date(0), new Date(1)) < 0, true);
    assert.equal(compareOf(new Date(5), new Date(5)), 0);
  });

  it("sorts an Invalid Date last instead of poisoning the sort", () => {
    assert.equal(compareOf(new Date(NaN), new Date(0)) > 0, true);
  });

  it("asks a Comparable for its own answer", () => {
    assert.equal(compareOf(new Money(100), new Money(250)) < 0, true);
  });

  it("throws NullPointerException on an absent value, which is why nullsFirst exists", () => {
    assert.throws(() => compareOf(null, 1), NullPointerException);
    assert.throws(() => compareOf(1, undefined), NullPointerException);
  });

  it("throws ClassCastException when the two values share no order", () => {
    assert.throws(() => compareOf(1, "a"), ClassCastException);
    assert.throws(() => compareOf({ x: 1 }, { x: 2 }), ClassCastException);
  });

  it("names both operands in the ClassCastException message", () => {
    assert.throws(() => compareOf(Symbol("s"), 1), (error: unknown) => {
      assert.equal(error instanceof ClassCastException, true);
      assert.match((error as Error).message, /symbol has no natural order against number/);
      return true;
    });
  });
});

describe("naturalOrder and reverseOrder", () => {
  it("sorts strings ascending", () => {
    assert.deepEqual(["c", "a", "b"].sort(naturalOrder<string>()), ["a", "b", "c"]);
  });

  it("sorts a Comparable by its own compareTo", () => {
    const sorted = [new Money(300), new Money(100), new Money(200)].sort(naturalOrder<Money>());
    assert.deepEqual(sorted.map((m) => m.cents), [100, 200, 300]);
  });

  it("reverseOrder is the exact reverse of naturalOrder", () => {
    assert.deepEqual(["c", "a", "b"].sort(reverseOrder<string>()), ["c", "b", "a"]);
  });

  it("rejects a type with no natural order at compile time", () => {
    // @ts-expect-error a plain object implements neither Comparable nor any of the ordered primitives
    naturalOrder<{ x: number }>();
  });
});

describe("comparing", () => {
  it("orders by an extracted key", () => {
    const byAge = comparing<User, number>((u) => u.age);
    assert.deepEqual(names([...users].sort(byAge)), ["Byron Lovelace", "Ada Lovelace", "Grace Hopper"]);
  });

  it("takes an explicit comparator for the key", () => {
    const caseInsensitive = comparator<string>((a, b) => compareOf(a.toLowerCase(), b.toLowerCase()));
    const sorted = ["beta", "Alpha", "GAMMA"].sort(comparing<string, string>((s) => s, caseInsensitive));
    assert.deepEqual(sorted, ["Alpha", "beta", "GAMMA"]);
  });

  it("rejects a key with no natural order at compile time", () => {
    // @ts-expect-error the key is a plain object, so the one-argument form does not apply
    comparing<User, { n: string }>((u) => ({ n: u.surname }));
  });
});

describe("comparator composition", () => {
  it("reversed() flips the order without touching the original", () => {
    const byAge = comparing<User, number>((u) => u.age);
    const descending = byAge.reversed();
    assert.deepEqual(names([...users].sort(descending)), ["Grace Hopper", "Ada Lovelace", "Byron Lovelace"]);
    assert.deepEqual(names([...users].sort(byAge)), ["Byron Lovelace", "Ada Lovelace", "Grace Hopper"]);
  });

  it("thenComparing breaks ties on a second key", () => {
    const byName = comparing<User, string>((u) => u.surname).thenComparing((u) => u.forename);
    assert.deepEqual(names([...users].sort(byName)), ["Grace Hopper", "Ada Lovelace", "Byron Lovelace"]);
  });

  it("thenComparing is consulted only on a tie", () => {
    const byAgeThenName = comparing<User, number>((u) => u.age).thenComparing((u) => u.forename);
    // no two ages are equal, so the second key never gets a say
    assert.deepEqual(names([...users].sort(byAgeThenName)), ["Byron Lovelace", "Ada Lovelace", "Grace Hopper"]);
  });

  it("thenComparing takes an explicit comparator for the tie-break key", () => {
    const byLength = comparator<string>((a, b) => a.length - b.length);
    const byName = comparing<User, string>((u) => u.surname).thenComparing((u) => u.forename, byLength);
    assert.deepEqual(names([...users].sort(byName)), ["Grace Hopper", "Ada Lovelace", "Byron Lovelace"]);
  });

  it("then() chains another comparator, where Java would overload thenComparing", () => {
    const bySurname = comparing<User, string>((u) => u.surname);
    const byForename = comparing<User, string>((u) => u.forename);
    assert.deepEqual(names([...users].sort(bySurname.then(byForename))), [
      "Grace Hopper",
      "Ada Lovelace",
      "Byron Lovelace",
    ]);
  });

  it("accepts a raw arrow function anywhere it accepts a comparator", () => {
    // the `Comparator<? super T>` positions: a bare function is as good as a lifted one
    const byAge = comparing<User, number>((u) => u.age).then((a, b) => compareOf(a.surname, b.surname));
    assert.deepEqual(names([...users].sort(byAge)), ["Byron Lovelace", "Ada Lovelace", "Grace Hopper"]);
    const byName = comparing<User, string>((u) => u.surname).thenComparing(
      (u) => u.forename,
      (a, b) => compareOf(b, a),
    );
    assert.deepEqual(names([...users].sort(byName)), ["Grace Hopper", "Byron Lovelace", "Ada Lovelace"]);
  });

  it("reversing a chain reverses the whole thing, not just the first key", () => {
    const byName = comparing<User, string>((u) => u.surname).thenComparing((u) => u.forename);
    assert.deepEqual(names([...users].sort(byName.reversed())), [
      "Byron Lovelace",
      "Ada Lovelace",
      "Grace Hopper",
    ]);
  });

  it("chains to a third key", () => {
    const rows = [
      { a: 1, b: 1, c: 2 },
      { a: 1, b: 1, c: 1 },
      { a: 1, b: 0, c: 9 },
    ];
    const sorted = [...rows].sort(
      comparing<(typeof rows)[number], number>((r) => r.a)
        .thenComparing((r) => r.b)
        .thenComparing((r) => r.c),
    );
    assert.deepEqual(sorted.map((r) => r.c), [9, 1, 2]);
  });
});

describe("null-tolerant comparators", () => {
  const values: readonly (string | null | undefined)[] = ["b", null, "a", undefined];

  it("nullsFirst puts absent values before everything else", () => {
    const sorted = new List<string | null | undefined>(values);
    sorted.sort(nullsFirst(naturalOrder<string>()));
    assert.deepEqual([...sorted], [null, undefined, "a", "b"]);
  });

  it("nullsLast puts absent values after everything else", () => {
    const sorted = new List<string | null | undefined>(values);
    sorted.sort(nullsLast(naturalOrder<string>()));
    assert.deepEqual([...sorted], ["a", "b", null, undefined]);
  });

  it("Array.prototype.sort overrules nullsFirst for undefined, which List.sort does not", () => {
    // `Array.prototype.sort` hoists undefined entries to the end and never shows them to the comparator, so a
    // null-tolerant comparator only half works on a raw array. `null` is an ordinary element and does go through.
    assert.deepEqual([...values].sort(nullsFirst(naturalOrder<string>())), [null, "a", "b", undefined]);
  });

  it("treats undefined as absent alongside null, and the two as equal", () => {
    const compare = nullsLast(naturalOrder<string>());
    assert.equal(compare(null, undefined), 0);
    assert.equal(compare(undefined, null), 0);
  });

  it("delegates to the wrapped comparator once both values are present", () => {
    assert.equal(nullsFirst(naturalOrder<string>())("a", "b") < 0, true);
  });

  it("tolerates an absent key when it wraps the key comparator", () => {
    const rows = [{ score: 2 }, { score: null }, { score: 1 }];
    const byScore = comparing<{ score: number | null }, number | null>(
      (r) => r.score,
      nullsLast(naturalOrder<number>()),
    );
    assert.deepEqual([...rows].sort(byScore).map((r) => r.score), [1, 2, null]);
  });

  it("does not tolerate an absent key when it wraps the outer comparator instead", () => {
    // `nullsLast` around the whole comparator guards an absent *row*; `comparing` still calls natural order on
    // the extracted score and raises before the wrapper is consulted. The throw is the point — it says the
    // tolerance was attached one level too high, rather than sorting the nulls somewhere arbitrary.
    const rows = [{ score: 2 }, { score: null }];
    const wrongLevel = nullsLast(comparing<{ score: number | null }, number>((r) => r.score as number));
    assert.throws(() => [...rows].sort(wrongLevel), NullPointerException);
  });
});

describe("comparators and List", () => {
  it("sorts a List in place", () => {
    const list = new List<string>(["c", "a", "b"]);
    list.sort(naturalOrder<string>());
    assert.equal(list.toString(), "[a, b, c]");
  });

  it("sorts a List of value types by a composed comparator", () => {
    const list = new List<Money>([new Money(300), new Money(100)]);
    list.sort(comparing<Money, number>((m) => m.cents).reversed());
    assert.deepEqual([...list].map((m) => m.cents), [300, 100]);
  });

  it("a Comparator is accepted anywhere a plain compare function is", () => {
    const asPlainFunction: (a: string, b: string) => number = naturalOrder<string>();
    assert.equal(asPlainFunction("a", "b") < 0, true);
  });

  it("is stable: equal elements keep their original order", () => {
    const list = new List([
      { key: "b", seq: 1 },
      { key: "a", seq: 2 },
      { key: "b", seq: 3 },
      { key: "a", seq: 4 },
    ]);
    list.sort(comparing((r) => r.key));
    assert.deepEqual([...list].map((r) => r.seq), [2, 4, 1, 3]);
  });

  it("shows the new order through an unmodifiable view of the same list", () => {
    const backing = new List<string>(["c", "a", "b"]);
    const view = List.unmodifiable(backing);
    backing.sort(naturalOrder<string>());
    assert.equal(view.toString(), "[a, b, c]");
  });

  it("counts as a structural change, so an in-flight iterator fails fast", () => {
    const list = new List<string>(["c", "a", "b"]);
    assert.throws(() => {
      for (const _ of list) {
        list.sort(naturalOrder<string>());
      }
    }, ConcurrentModificationException);
  });

  it("comparator() lifts a plain function into a composable one", () => {
    const byLength: Comparator<string> = comparator<string>((a, b) => a.length - b.length);
    const sorted = ["ccc", "a", "bb"].sort(byLength.reversed());
    assert.deepEqual(sorted, ["ccc", "bb", "a"]);
  });
});
