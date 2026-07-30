import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  Java,
  JavaAbstractMap,
  JavaList,
  JavaMap,
  JavaMapEntry,
  JavaObject,
  JavaSet,
  Optional,
  TSJavaException,
  TreeMap,
  binarySearch,
  comparator,
  compareOf,
  equalsOf,
  hashAll,
  hashCodeOf,
  naturalOrder,
  requireNonNull,
  sort,
} from "../src/index.js";

/**
 * The namespace re-exports bindings rather than wrapping them, so every one of these is an identity check
 * rather than a behavioural one. If they hold, `Java.X` cannot drift from `JavaX`: there is only one class.
 */
describe("Java namespace identity", () => {
  it("names the same binding as the flat export, not a copy", () => {
    assert.equal(Java.Object, JavaObject);
    assert.equal(Java.Map, JavaMap);
    assert.equal(Java.Set, JavaSet);
    assert.equal(Java.List, JavaList);
    assert.equal(Java.AbstractMap, JavaAbstractMap);
    assert.equal(Java.MapEntry, JavaMapEntry);
    assert.equal(Java.TreeMap, TreeMap);
    assert.equal(Java.Optional, Optional);
    assert.equal(Java.Throwable, TSJavaException);
  });

  it("keeps instanceof working across both spellings", () => {
    const map = new Java.Map<string, number>();
    assert.ok(map instanceof JavaMap);
    assert.ok(map instanceof Java.AbstractMap);
    assert.ok(map instanceof Java.Object);

    const flat = new JavaMap<string, number>();
    assert.ok(flat instanceof Java.Map);
  });

  it("leaves constructor.name alone, so toString() is unchanged", () => {
    // the classes are renamed at the namespace boundary only; the declarations keep their prefixed names
    assert.equal(Java.Map.name, "JavaMap");
    assert.match(new Java.Map<string, number>().toString(), /^\{\}$/);
    assert.match(new (class Point extends Java.Object {})().toString(), /^Point@[0-9a-f]+$/);
  });

  it("routes the static groupings to the same functions", () => {
    assert.equal(Java.Collections.sort, sort);
    assert.equal(Java.Collections.binarySearch, binarySearch);
    assert.equal(Java.Objects.requireNonNull, requireNonNull);
    assert.equal(Java.Objects.hash, hashAll);
    assert.equal(Java.Objects.hashCode, hashCodeOf);
    assert.equal(Java.Objects.equals, equalsOf);
    assert.equal(Java.Objects.compare, compareOf);
    assert.equal(Java.Comparator.naturalOrder, naturalOrder);
    assert.equal(Java.Comparator.of, comparator);
  });
});

describe("Java namespace usage", () => {
  it("works as a base class", () => {
    class Point extends Java.Object {
      constructor(
        public readonly x: number,
        public readonly y: number,
      ) {
        super();
      }
      public override hashCode(): number {
        return Java.Objects.hash(this.x, this.y);
      }
      public override equals(other: unknown): boolean {
        return other instanceof Point && other.x === this.x && other.y === this.y;
      }
    }

    const seen = new Java.Map<Point, string>();
    seen.put(new Point(1, 2), "origin-ish");
    assert.equal(seen.get(new Point(1, 2)), "origin-ish");
    assert.equal(new Java.Set([new Point(1, 2), new Point(1, 2)]).size(), 1);
  });

  it("resolves Comparator as a type and as its statics under one name", () => {
    // the value meaning
    const byLength: Java.Comparator<string> = Java.Comparator.of((a, b) => a.length - b.length);
    // the type meaning, on a parameter
    const apply = (values: Java.List<string>, order: Java.Comparator<string>): void => {
      Java.Collections.sort(values, order);
    };

    const names = new Java.List(["ccc", "a", "bb"]);
    apply(names, byLength);
    assert.deepEqual([...names], ["a", "bb", "ccc"]);

    // and the statics compose the way Java's do
    const reversed: Java.Comparator<string> = Java.Comparator.naturalOrder<string>().reversed();
    Java.Collections.sort(names, reversed);
    assert.deepEqual([...names], ["ccc", "bb", "a"]);
  });

  it("takes namespaced types in exported signatures", () => {
    // exercises declaration emit: these annotations are what `isolatedDeclarations` has to write out
    const describeMap = (map: Java.AbstractMap<string, number>): string => map.toString();
    const firstOf = (values: Java.Collection<string>): Java.Optional<string> => {
      const iterator: Java.Iterator<string> = values.iterator();
      return iterator.hasNext() ? Java.Optional.of(iterator.next()) : Java.Optional.empty();
    };

    assert.equal(describeMap(new Java.Map([["a", 1]])), "{a=1}");
    assert.equal(firstOf(new Java.List(["x"])).get(), "x");
    assert.ok(firstOf(new Java.List<string>()).isEmpty());
  });

  it("reads a sorted collection the way Java's constructor does", () => {
    const names = new Java.TreeSet(Java.Comparator.reverseOrder<string>(), ["bob", "alice", "carol"]);
    assert.deepEqual([...names], ["carol", "bob", "alice"]);
  });

  it("roots the exception hierarchy at Java.Throwable", () => {
    assert.throws(
      () => new Java.List<number>().get(5),
      (thrown: unknown) => {
        assert.ok(thrown instanceof Java.IndexOutOfBoundsException);
        assert.ok(thrown instanceof Java.RuntimeException);
        assert.ok(thrown instanceof Java.Throwable);
        return true;
      },
    );
  });
});

describe("Java namespace surface", () => {
  it("exposes exactly the standard-library surface at runtime", () => {
    // type-only exports (Comparable, NaturallyOrdered, Iterator, ListIterator, Serializable) are erased
    assert.deepEqual(globalThis.Object.keys(Java).sort(), [
      "AbstractMap",
      "AbstractSet",
      "ClassCastException",
      "Collection",
      "Collections",
      "Comparator",
      "ConcurrentModificationException",
      "IllegalArgumentException",
      "IllegalStateException",
      "IndexOutOfBoundsException",
      "List",
      "Map",
      "MapEntry",
      "NoSuchElementException",
      "NotImplementedException",
      "NullPointerException",
      "Object",
      "Objects",
      "Optional",
      "RuntimeException",
      "Set",
      "Throwable",
      "TreeMap",
      "TreeSet",
      "UnsupportedOperationException",
    ]);
  });

  it("groups the static-utility classes completely", () => {
    assert.deepEqual(globalThis.Object.keys(Java.Objects).sort(), [
      "compare",
      "equals",
      "hash",
      "hashCode",
      "isNull",
      "nonNull",
      "requireNonNull",
      "requireNonNullElse",
      "requireNonNullElseGet",
    ]);
    assert.deepEqual(globalThis.Object.keys(Java.Comparator).sort(), [
      "comparing",
      "naturalOrder",
      "nullsFirst",
      "nullsLast",
      "of",
      "reverseOrder",
    ]);
    assert.equal(globalThis.Object.keys(Java.Collections).length, 15);
  });

  it("keeps the serialization layer out of the namespace", () => {
    // Jackson and JAXB's territory, not the standard library's — these stay top-level only
    for (const absent of ["readJson", "objectOf", "listOf", "parseXml", "readXml", "XmlElement"]) {
      assert.ok(!(absent in Java), `${absent} should not be in Java.*`);
    }
    // and so do the binding failures they raise
    for (const absent of ["JsonBindException", "XmlBindException", "XmlParseException"]) {
      assert.ok(!(absent in Java), `${absent} should not be in Java.*`);
    }
  });
});
