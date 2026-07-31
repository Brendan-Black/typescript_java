import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Java } from "../src/index.js";
import * as root from "../src/index.js";
import { JavaAbstractMap, JavaMapEntry } from "../src/collections/JavaAbstractMap.js";
import { binarySearch, sort } from "../src/collections/Collections.js";
import { JavaList } from "../src/collections/JavaList.js";
import { JavaMap } from "../src/collections/JavaMap.js";
import { JavaSet } from "../src/collections/JavaSet.js";
import { TreeMap } from "../src/collections/TreeMap.js";
import { compareOf } from "../src/fundamentals/Comparable.js";
import { comparator, naturalOrder } from "../src/fundamentals/Comparator.js";
import { equalsOf, hashAll, hashCodeOf } from "../src/fundamentals/Hashing.js";
import { JavaObject } from "../src/fundamentals/Object.js";
import { requireNonNull } from "../src/fundamentals/Objects.js";
import { Optional } from "../src/fundamentals/Optional.js";
import { TSJavaException } from "../src/exceptions/TSJavaException.js";

/**
 * The namespace renames its bindings at the boundary rather than wrapping them, so every one of these is an
 * identity check rather than a behavioural one. If they hold, `Java.X` cannot drift from the class the module
 * declares: there is only one of it. The declarations keep their prefixed names because a class declared
 * `Map` or `Object` would shadow, inside its own module, the global it is implemented on top of.
 */
describe("Java namespace identity", () => {
  it("names the declared class itself, not a copy of it", () => {
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

  it("keeps instanceof working through the namespace", () => {
    const map = new Java.Map<string, number>();
    assert.ok(map instanceof Java.Map);
    assert.ok(map instanceof Java.AbstractMap);
    assert.ok(map instanceof Java.Object);
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

  it("reaches the standard library only through Java.*", () => {
    // the flat, prefixed spellings are gone from the package root; the namespace is the only way in
    const removed = [
      "JavaObject", "JavaCollection", "JavaAbstractSet", "JavaAbstractMap", "JavaMapEntry", "JavaList",
      "JavaMap", "JavaSet", "TreeMap", "TreeSet", "Optional", "TSJavaException", "RuntimeException",
      "ClassCastException", "ConcurrentModificationException", "IllegalArgumentException",
      "IllegalStateException", "IndexOutOfBoundsException", "NoSuchElementException",
      "NotImplementedException", "NullPointerException", "UnsupportedOperationException",
      "hashCodeOf", "equalsOf", "hashAll", "compareOf", "requireNonNull", "requireNonNullElse",
      "requireNonNullElseGet", "isNull", "nonNull", "comparator", "comparing", "naturalOrder",
      "reverseOrder", "nullsFirst", "nullsLast", "sort", "max", "min", "binarySearch", "reverse", "swap",
      "emptyList", "emptyMap", "emptySet", "singleton", "singletonList", "singletonMap",
      "unmodifiableList", "unmodifiableMap", "unmodifiableSet",
    ];
    for (const absent of removed) {
      assert.ok(!(absent in root), `${absent} should be reachable only as Java.*`);
    }
  });

  it("keeps this library's own tooling at the top level", () => {
    // no Java counterpart, so no `Java.*` spelling to move to
    for (const present of ["boilerplateEqualityCheck", "setHashContractChecks", "hashContractChecksEnabled"]) {
      assert.ok(present in root, `${present} should stay a top-level export`);
    }
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
