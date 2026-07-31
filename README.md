# TypeScript Java

Java's `java.lang` and `java.util` semantics, reimplemented in TypeScript.

A surprisingly nontrivial observation about the Java programming language is that it need not be restricted to its
own specification. By obeying proper programming principles, you can quite literally re-implement Java's semantics
within a different language runtime — and get, along with them, the good practices that the nature of Java imposes
on its developers by default.

## The problem this solves

JavaScript's `Map` and `Set` compare keys by reference. Give them a value type — a point, a money amount, an ID
wrapper — and the second instance can never find the first, no matter how equal the two are:

```ts
const seen = new Map<Point, string>();
seen.set(new Point(1, 2), "origin-ish");
seen.get(new Point(1, 2)); // undefined

new Set([new Point(1, 2), new Point(1, 2)]).size; // 2
```

There is no hook to fix this. `Map` does not consult your class, and no amount of care at the call site changes
that. A `Java.Map` buckets by `hashCode()` and resolves collisions with `equals()`, so a value type behaves as a key
exactly the way it would on the JVM:

```ts
import { Java, boilerplateEqualityCheck } from "typescript-java";

class Point extends Java.Object {
  constructor(public readonly x: number, public readonly y: number) {
    super();
  }

  public override equals(other: unknown): boolean {
    return boilerplateEqualityCheck<Point>({ obj1: this, obj2: other }, (a, b) => a.x === b.x && a.y === b.y);
  }

  public override hashCode(): number {
    return Java.Objects.hash(this.x, this.y);
  }
}

const seen = new Java.Map<Point, string>();
seen.put(new Point(1, 2), "origin-ish");
seen.get(new Point(1, 2)); // "origin-ish"

new Java.Set([new Point(1, 2), new Point(1, 2)]).size(); // 1
```

The same blind spot runs through the rest of the standard library. `[p1].includes(p2)` and `array.indexOf(p2)` are
both false for structurally equal objects; `Java.List.contains` and `Java.List.indexOf` are not.

## The `Java` namespace

The standard library is reached through one exported namespace, and only through it. The names inside are Java's
own — `Java.Map`, `Java.Object`, `Java.Collections.sort` — because a namespace is the qualifier that keeps
`Object`, `Map`, `Set`, `List` and `Iterator` from colliding with JavaScript's globals without a prefix on every
name.

```ts
import { Java } from "typescript-java";

class Point extends Java.Object { }
const seen = new Java.Map<Point, string>();
const order: Java.Comparator<string> = Java.Comparator.naturalOrder<string>();
Java.Collections.sort(names);
```

The namespace re-exports its bindings rather than wrapping them, so there is no indirection to pay for and
`instanceof` is exactly what you would expect. Five of them are *declared* under a prefixed name and renamed
here: `JavaObject`, `JavaMap`, `JavaSet`, `JavaIterator` and `JavaListIterator`. Those are the five with a
JavaScript global behind them, and a class declared under one would shadow, inside its own module, the global it
is built on — `Map` keeps its buckets in a real `Map`, and `Object.getPrototypeOf` is what the equality helper
calls. TypeScript refuses `class Object` outright besides, with `error TS2725`.

Nothing else is renamed. `List`, `Collection`, `AbstractSet`, `AbstractMap`, `MapEntry`, `TreeMap`, `TreeSet` and
`Throwable` have no global to collide with, so they are declared under Java's own names and pass straight
through. The consequence is visible in `constructor.name`, and so in a stack trace: `Java.Map` reports `JavaMap`,
`Java.List` reports `List`. Subclasses are unaffected either way — they print their own name, which is what
`toString()` is for.

Java's static-utility classes are sub-namespaces, which restores the reading they have in Java: `Java.Collections`
carries `sort`, `max`, `min`, `binarySearch`, `reverse`, `swap` and the factories; `Java.Objects` carries
`requireNonNull`, `isNull`, `nonNull` and the four that a package root could not have spelled plainly —
`Java.Objects.hashCode`, `.equals`, `.hash` and `.compare`. A qualifier is what lets those take Java's own names.

`Java.Comparator` is both the type and its statics, as it is in Java — `Java.Comparator<T>` annotates and
`Java.Comparator.comparing(f)` constructs. TypeScript keeps types and values in separate declaration spaces,
which is what allows one name to carry both.

**What is not in the namespace:** anything without a `java.lang`, `java.util` or `java.io` counterpart. The
`JsonReader`, `JsonWriter`, `XmlReader` and `XmlWriter` layers model Jackson and JAXB rather than the standard
library, so they keep their top-level exports along with `JsonBindException`, `XmlBindException` and
`XmlParseException`; so do
`boilerplateEqualityCheck` and the `Contracts` module, which are this library's own tooling. `Java.*` is the
standard library and nothing else.

## Status

Alpha, version 0.1.0, and **not yet published to npm**. The collections, `Optional`, ordering, and the exception
hierarchy are complete and tested (742 tests); the serialization layer covers both directions of a JSON wire
contract and both of an XML one, parser and all. See [Roadmap](#roadmap) for what is deliberately still missing.

Requirements:

- **Node 20+**
- **ESM only.** There is no CommonJS build, and there will not be one.
- The repo builds on **TypeScript 7**. Consumers get plain `.d.ts` declarations with source maps.

There is no npm release yet. Install from the repository — `dist/` is not committed, but the `prepare` script
builds it on install:

```sh
npm install github:Brendan-Black/typescript_java
```

## What's in the box

| Group | Members |
| --- | --- |
| `Java.Object` | the base class: `equals`, `hashCode`, `toString` |
| `Java.Optional` | |
| `Java.Comparable`, `Java.NaturallyOrdered` | types only |
| `Java.Comparator` | the type, plus `.of`, `.comparing`, `.naturalOrder`, `.reverseOrder`, `.nullsFirst`, `.nullsLast` |
| `Java.Objects` | `.requireNonNull`, `.requireNonNullElse`, `.requireNonNullElseGet`, `.isNull`, `.nonNull`, `.hashCode`, `.equals`, `.hash`, `.compare` |
| Collections | `Java.Collection`, `Java.AbstractSet`, `Java.AbstractMap`, `Java.Iterator`, `Java.ListIterator`, `Java.List`, `Java.Set`, `Java.Map`, `Java.MapEntry`, `Java.TreeMap`, `Java.TreeSet` |
| `Java.Collections` | `.sort`, `.max`, `.min`, `.binarySearch`, `.reverse`, `.swap`, `.emptyList`, `.emptyMap`, `.emptySet`, `.singleton`, `.singletonList`, `.singletonMap`, `.unmodifiableList`, `.unmodifiableMap`, `.unmodifiableSet` |
| `Java.Throwable` | and 13 subclasses, less the three binding failures |
| `Java.Serializable` | type only |

Outside the namespace — no `java.*` counterpart, so these are the package's top-level exports:

| Module | Exports |
| --- | --- |
| `fundamentals/Object` | `boilerplateEqualityCheck` |
| `fundamentals/Contracts` | `setHashContractChecks`, `hashContractChecksEnabled`, `overridesEqualsWithoutHashCode` |
| `exceptions` | `JsonBindException`, `XmlBindException`, `XmlParseException` |
| `serialization/JsonReader` | `JsonReader`, `JsonFields`, `readJson`, `objectOf`, `listOf`, `setOf`, `mapOf`, `objectAsMap`, `treeSetOf`, `treeMapOf`, `entryOf`, `arrayOf`, `stringValue`, `numberValue`, `integerValue`, `booleanValue`, `unknownValue`, `enumOf`, `nullable`, `optionalValue`, `withDefault`, `mapping` |
| `serialization/JsonWriter` | `JsonWriter`, `JsonProperties`, `JsonValue`, `writeJson`, `objectFrom`, `arrayFrom`, `mapFrom`, `mapAsObject`, `entryFrom`, `stringAsJson`, `numberAsJson`, `integerAsJson`, `booleanAsJson`, `rawJson`, `nullableAsJson`, `optionalAsJson`, `mappingAsJson` |
| `serialization/XmlParser` | `parseXml`, `XmlElement`, `isXmlName` |
| `serialization/XmlReader` | `XmlReader`, `XmlTextReader`, `XmlField`, `XmlFields`, `readXml`, `elementOf`, `elementNamed`, `textElement`, `mappingElement`, `attribute`, `optionalAttribute`, `textContent`, `child`, `optionalChild`, `childText`, `children`, `wrappedChildren`, `stringText`, `rawText`, `numberText`, `integerText`, `booleanText`, `enumText`, `mappingText` |
| `serialization/XmlWriter` | `XmlWriter`, `XmlTextWriter`, `XmlPart`, `XmlParts`, `XmlDraft`, `XmlFormat`, `writeXml`, `elementFrom`, `textElementFrom`, `mappingElementFrom`, `intoAttribute`, `intoOptionalAttribute`, `intoText`, `intoChild`, `intoOptionalChild`, `intoChildText`, `intoChildren`, `intoWrappedChildren`, `stringAsText`, `numberAsText`, `integerAsText`, `booleanAsText`, `mappingAsText` |

These are re-exported from the package root, alongside `Java` itself. There is one import either way:

```ts
import { Java, readJson, objectOf, stringValue } from "typescript-java";
```

### Hashing that matches the JVM

`String.hashCode`, `Double.hashCode` and `Boolean.hashCode` are reproduced exactly, not approximated, so a hash
computed here equals one computed on the JVM for the same value. `Java.Objects.hashCode` extends that to the types
Java has no equivalent for — plain objects, arrays, functions and unregistered symbols get a stable identity hash
from a `WeakMap`, which is what Java's unoverridden `Object.hashCode` gives you.

### Optional

Java's `Optional`, including the later additions: `or`, `stream`, `ifPresentOrElse`, `isEmpty`.

```ts
const email = users.find("ada").map((u) => u.email).orElse("(none)");

// `stream()` yields an iterator rather than a Stream, which is the thing that actually composes in JavaScript
const found = [maybeA, maybeB, maybeC].flatMap((o) => [...o]);
```

`Java.Map.find(key)` is the unambiguous `get`: Java's `get` returns `null` both for an absent key and for a key
mapped to `null`, and `find` returns a `Java.Optional` instead. (A key mapped to `null` still yields an empty
`Java.Optional` — only `containsKey` separates those two cases.)

### Collections

`Java.Map` is Java's `LinkedHashMap`: insertion-ordered, fail-fast, with live write-through `keySet()`, `values()`
and `entrySet()` views, and the full set of mutators — `merge`, `compute`, `computeIfAbsent`, `computeIfPresent`,
`putIfAbsent`, and both overloads of `replace` and `remove`.

```ts
counts.merge(word, 1, (a, b) => a + b); // the whole of a word-frequency count
```

Iterators are fail-fast, as Java's are — a structural change mid-iteration throws rather than silently skipping
elements:

```ts
for (const p of list) {
  list.add(p); // ConcurrentModificationException
}
```

Unmodifiable wrappers are *views*, not copies, which is Java's behaviour and the usual source of surprise with it:

```ts
const view = Java.List.unmodifiable(backing);
backing.add(3);
view.toString(); // "[1, 2, 3]" — changes to the original show through
view.add(4);     // UnsupportedOperationException
```

`removeIf` is the short way to remove while walking a collection, since the fail-fast check above rules out doing
it inside the loop:

```ts
users.removeIf((u) => u.expired); // rather than a ConcurrentModificationException
```

`iterator()` is the exact way. It hands back a `Java.Iterator` — Java's `Iterator`, a cursor you drive yourself —
whose `remove()` takes out the element you are standing on rather than the first one equal to it:

```ts
const it = list.iterator();
while (it.hasNext()) {
  if (it.next().expired) {
    it.remove(); // this element, even if an equal one sits earlier in the list
  }
}
```

`remove()` throws `IllegalStateException` if it does not follow a `next()`, or if it is called twice for the same
one. Removing through the iterator does not trip the fail-fast check; anything else changing the collection
mid-walk still does. The map views hand out iterators too, and removing through any of the three removes the
whole entry — including `values()`, where `remove(value)` can only find the first entry holding it.

A `Java.Iterator` is also `Iterable`, which Java's `Iterator` is not, so a half-consumed one can be passed
straight to anything taking a sequence and picks up from where the cursor already is:

```ts
const rest = new Java.List<string>(it); // whatever next() has not yet reached
```

`Java.List.listIterator()` is Java's `ListIterator`: the same cursor, plus `hasPrevious`, `previous`, `nextIndex`,
`previousIndex`, `set` and `add`. The cursor sits *between* elements, which is why `next()` followed by
`previous()` hands back the same element twice, and why starting at `size()` walks the list backwards:

```ts
const it = list.listIterator(list.size());
while (it.hasPrevious()) {
  const value = it.previous();
  if (value.stale) {
    it.set(refresh(value)); // in place — no structural change, so nothing else iterating is disturbed
  }
}
```

`add` inserts at the cursor and steps over it, so a following `next()` is unaffected and a following `previous()`
returns what was just inserted. It is the one way to grow a list while walking it. Both `set` and `remove` need a
`next()` or `previous()` to have returned something they can act on, and an `add` or `remove` clears that — so
`IllegalStateException` is what you get for asking out of turn.

`Java.Collections` carries Java's algorithms as well as its factories — `sort`, `max`, `min`, `binarySearch`,
`reverse` and `swap`. Each comes in two forms, as Java's do: one taking a comparator, and one taking none and
using natural order.

```ts
Java.Collections.sort(names);                       // natural order
Java.Collections.sort(users, Java.Comparator.comparing<User, number>((u) => u.age));
Java.Collections.max(scores);
```

The comparator-free form constrains its element type, so `sort(listOfPoints)` is a compile error rather than a
`ClassCastException` partway through the sort. `binarySearch` reproduces Java's return value exactly, negative
half included — a miss is `-(insertionPoint) - 1`, offset by one so that an insertion point of `0` stays
distinguishable from a hit at index `0`:

```ts
const at = Java.Collections.binarySearch(sorted, key);
if (at < 0) {
  sorted.addAt(-(at + 1), key); // keeps it sorted
}
```

### Sorted collections

`Java.TreeMap` and `Java.TreeSet` keep their keys in order instead of in buckets — which is what you want when the key
type has a sensible order but no trustworthy hash, and it is the only way to ask the questions on the right:

```ts
const scores = new Java.TreeMap<string, number>([["carol", 3], ["alice", 1], ["bob", 2]]);

[...scores.keys()];       // ["alice", "bob", "carol"] — key order, not insertion order
scores.firstKey();        // "alice"
scores.floorKey("bib");   // "bob" is above it; "alice" is the greatest key at or below
scores.headMap("bob");    // {alice=1}
scores.pollFirstEntry();  // removes and returns alice=1
```

The full `NavigableMap` / `NavigableSet` surface is there: `first`/`last`, `floor`/`ceiling`/`lower`/`higher`,
`poll` from either end, `headMap`/`tailMap`/`subMap` (and the `Set` equivalents), and descending views. Both
take an optional comparator ahead of their contents, so `new Java.TreeSet(Java.Comparator.reverseOrder<string>(),
names)` reads the way Java's constructor does; with none, the keys are ordered by `Java.Objects.compare`.

The ranges are **live views**, as Java's are — a window onto the same entries rather than a copy of them:

```ts
const scores = new Java.TreeMap<string, number>([["alice", 1], ["bob", 2], ["carol", 3]]);
const early = scores.subMap("a", "c");

early.put("bea", 9);      // writes through: scores now holds bea=9
scores.put("bo", 5);      // and reads through: early now holds it too
early.remove("dave");     // outside the bounds, so it is simply absent — no throw
early.put("dave", 4);     // but writing outside them throws IllegalArgumentException
```

A range is bounded by *keys*, not positions, so it keeps its meaning as entries come and go around it. Writing
through one is the difference from `List.subList`, which is still a copy: a list's bound is a position, and
there is no way to say which side of it an insertion belongs on.

Because a range writes through, one taken off an unmodifiable map or off `Java.TreeMap.of` is unmodifiable too, and
narrowing a range can only ever narrow it — `subMap("a", "c").tailMap("z")` throws rather than handing back keys
the original range could not see.

Both share their derived operations with `Java.Map` and `Java.Set` — `Java.TreeMap` extends the same
`Java.AbstractMap` that `Java.Map` does, so `merge`, the `compute` family and the three live views behave identically, and a
`Java.TreeMap` `equals` a `Java.Map` holding the same entries.

One thing to keep in mind, and it is Java's rule too: a sorted collection decides what counts as the same key by
**comparing**, not by `equals`. Two keys that compare equal are one entry, whatever `equals` says — which is the
consistency-with-equals contract on `Java.Comparable` asking to be honoured.

### Ordering

`Java.Comparable` for a type that carries its own order, `Java.Comparator` for one imposed from outside, and
Java's combinators over them:

```ts
import { Java } from "typescript-java";

const { comparing, naturalOrder, nullsLast } = Java.Comparator;

users.sort(comparing<User, string>((u) => u.surname).thenComparing((u) => u.forename));
names.sort(naturalOrder<string>());

// a row whose score may be absent: the null-tolerance belongs on the *key*, not on the row
rows.sort(comparing<Row, number | null>((r) => r.score, nullsLast(naturalOrder<number>())));
```

A `Java.Comparator` here *is* a comparison function, so it goes straight into `Java.List.sort` or
`Array.prototype.sort`; it just carries `reversed()`, `then()` and `thenComparing()` as well.
`Java.Comparator.of(fn)` lifts a plain arrow function into one, which is the step Java's compiler does for you
when it turns a lambda into a functional interface — and the one member of `Java.Comparator` that Java itself
has no need for.

`naturalOrder<T>()` will not compile unless `T` actually has an order — a primitive Java orders, a `Date`, or
something implementing `Java.Comparable`. That is the same guarantee Java gets from
`<T extends Comparable<? super T>>`, and it turns a `ClassCastException` at sort time into a red squiggle.

Underneath is `Java.Objects.compare(a, b)`, which sits alongside `Java.Objects.hashCode` and
`Java.Objects.equals` and reproduces Java's comparison semantics rather than JavaScript's:

```ts
[3, NaN, 1, 2].sort((a, b) => a - b);        // [3, NaN, 1, 2] — the comparator returns NaN, so nothing moves
[3, NaN, 1, 2].sort(naturalOrder<number>()); // [1, 2, 3, NaN]
```

This is `Double.compare`: `NaN` sorts last and equals itself, `-0` sorts before `0`, and no subtraction is
involved, so nothing overflows or loses precision. `String.compareTo` is likewise reproduced down to its exact
return value, not just its sign. Natural order throws `NullPointerException` on an absent value rather than
guessing where it belongs — `nullsFirst` and `nullsLast` are how an ordering acquires an opinion about absence,
and both treat `undefined` as absent alongside `null`.

Which comparator you wrap matters, and the throw is what tells you that you got it wrong. `nullsLast(comparing(f))`
tolerates an absent *element*; `comparing(f, nullsLast(...))` tolerates an absent *key*. Wrapping the outer one
when the key is what goes missing leaves `comparing` to call natural order on a `null` and raise before the
wrapper is ever consulted.

### Contract checking

Java has an IDE that generates `equals` and `hashCode` together, and a compiler warning when you write one without
the other. There is no such safety net here, and the failure is silent — the key simply cannot be found again. So
the collections say something, once per class, on insertion:

```
[typescript-java] Broken overrides equals() but not hashCode(), so its instances will be bucketed by identity
and cannot be found again in a Java.Map or Java.Set. Override hashCode() from the same fields equals() compares —
Java.Objects.hash(...) does this in one line. Silence with setHashContractChecks(false).
```

A second warning fires when a hash bucket grows past eight entries, which here means the key class is producing
colliding hashes for distinct values. Both are off with `setHashContractChecks(false)`.

### Exceptions

Everything descends from `Java.Throwable` (which roots this library's hierarchy rather than everything throwable)
via `Java.RuntimeException`, so `catch (e) { if (e instanceof Java.RuntimeException) ... }` catches anything this
library raises and nothing else.

`Java.ClassCastException` · `Java.ConcurrentModificationException` · `Java.IllegalArgumentException` ·
`Java.IllegalStateException` · `Java.IndexOutOfBoundsException` · `Java.NoSuchElementException` ·
`Java.NotImplementedException` · `Java.NullPointerException` · `Java.UnsupportedOperationException`

The three serialization failures stay outside the namespace, alongside the layers that raise them —
`JsonBindException` · `XmlBindException` · `XmlParseException`. They are `Java.IllegalArgumentException`s
underneath — a payload of the wrong shape is an argument the reader cannot accept — so either type catches them.
`JsonBindException` and `XmlBindException` carry the path of the slot that failed; `XmlParseException` carries the
line and column, because a document that is not XML at all has no slots yet.

### Serialization

`Java.List`, `Java.Set`, `Java.Map`, `Java.TreeMap`, `Java.TreeSet`, `Java.MapEntry` and `Java.Optional` implement
`Java.Serializable`, so `JSON.stringify` produces something a caller would expect:

```ts
JSON.stringify(new Java.Map([["a", 1], ["b", 2]])); // [["a",1],["b",2]]
JSON.stringify(Java.List.of(1, 2));                 // [1,2]
```

A map serialises as pairs rather than as an object deliberately: JSON object keys can only be strings, so a map
keyed on numbers, nulls or `Java.Object`s would either collide or lose information. The pair form round-trips
straight back through the constructor.

A `Java.Optional` serialises as the value it holds, or as `null` when empty — the wrapper leaves no trace on the
wire:

```ts
JSON.stringify({ nickname: Java.Optional.of("addie") }); // {"nickname":"addie"}
JSON.stringify({ nickname: Java.Optional.empty() });     // {"nickname":null}
```

This is the shape Jackson's `Jdk8Module` produces for a Java DTO, and it is the only shape that makes
`Java.Optional` usable on a wire contract: whether a field is wrapped is a property of the server's code, not of
the JSON, and a consumer in another language should not have to know. `null` is unambiguous in both directions,
because it is the one value a `Java.Optional` cannot hold — `of` rejects it and `ofNullable` folds it to `empty`
— so `Java.Optional.ofNullable(JSON.parse(json))` reconstructs the original exactly. An empty `Java.Optional`
keeps its key rather than dropping it, which is the difference between "there is no nickname" and "nicknames were
never mentioned".

#### Reading it back

`JSON.parse` returns `unknown`, and the usual next step is a cast — which types a value without checking it, so a
field the server renamed becomes `undefined` and travels a long way before anything visibly breaks. A
`JsonReader<T>` is the parse direction stated as a contract: it checks as it reads and produces a real `T`, or
throws `JsonBindException` naming the slot that was wrong.

```ts
interface Order { id: number; status: "PENDING" | "SHIPPED"; lines: Java.List<string>; note: Java.Optional<string>; }

const order = objectOf<Order>({
  id: integerValue,
  status: enumOf("PENDING", "SHIPPED"),
  lines: listOf(stringValue),
  note: optionalValue(stringValue),
});

readJson(body, listOf(order)); // Java.List<Order>, or a JsonBindException saying where it went wrong
```

```
$.orders[2].total: expected a number, got a string
```

The path is on the exception as data too — `error.getPath()` — not only in the message.

Fields are **required by default**: a missing key reaches its reader as nothing and is refused there, so
optionality is something a contract states rather than something it falls into. `optionalValue` reads Jackson's
`Optional` shape (the value, or `null`, or a key that never arrived), `nullable` admits an explicit `null` only,
and `withDefault` substitutes. Keys the contract does not mention are ignored, which is Jackson's default and the
only choice that survives a server adding a field.

There is a reader for every shape this library writes — `listOf`, `setOf`, `mapOf`, `treeSetOf`, `treeMapOf`,
`entryOf`, `arrayOf`, `objectOf` — so anything it can serialise it can read back, and the tests pin that round
trip. `objectAsMap` covers the other map shape a Java backend sends: a JSON object, which is what Jackson emits
for a `Map<String, V>`. `mapping` is the hinge onto your own types:

```ts
const point = mapping(objectOf({ x: numberValue, y: numberValue }), ({ x, y }) => new Point(x, y));
```

#### Writing it out

`Serializable` already writes this library's own types, but `toJSON` belongs to the *value* rather than to the
contract, and there are three things it therefore cannot do. It cannot write a type it was not built into — the
`mapping` above reads `{x, y}` into a `Point`, and a `Point` has no `toJSON` to send one back with. It cannot
spell a field differently from the property behind it. And it cannot refuse anything, because by the time it runs
the encoding is already decided.

That last one is the one that costs, because `JSON.stringify` fails quietly in exactly the two places a wire
contract can least afford it: `undefined` in a field drops the key, and `NaN` and the infinities become `null`.
Both produce a document that parses. A `JsonWriter<T>` refuses both and names the slot:

```ts
const order = objectFrom<Order>({
  id: integerAsJson,
  status: stringAsJson,
  lines: arrayFrom(stringAsJson),
  note: optionalAsJson(stringAsJson),
});

writeJson(value, order);        // {"id":1,"status":"PENDING","lines":["a"],"note":null}
writeJson(value, order, "  ");  // the same document, indented
```

```
$.total: NaN cannot be written as a number
```

The contract reads line for line like the one that parses it, and every writer produces the shape the matching
reader reads, so the two are inverses: what `writeJson` sends, `readJson` reads back as an equal value. Where
the reading side has four names for a JSON array — `arrayOf`, `listOf`, `setOf`, `treeSetOf`, which differ only
in what they build out of one — writing has `arrayFrom` alone, because a `Java.List`, a `Java.Set`, a
`Java.TreeSet` and a plain array all leave the same array behind them. `mapFrom` writes the pair form and
`mapAsObject` the object form, matching `mapOf` and `objectAsMap`. There is no counterpart to `enumOf`: a
`"PENDING" | "SHIPPED"` *is* a `string` and writes as one, which is the same call `stringAsText` makes on the
XML side.

Two asymmetries are deliberate. A property that is absent at runtime is refused rather than written, mirroring a
missing key being refused on the way in — that is the case where a `T` can lie, and `JSON.stringify` would drop
the key and leave the reader at the far end to complain about it. And `integerAsJson` refuses an integer larger
than JavaScript was holding exactly, where `integerValue` accepts one: a reader has to take the number the
document contains, but a writer still has the original, and `9007199254740993` written out arrives as
`...992` — a number the receiver reads back happily, and not the one that was sent.

For the tree rather than the text of it — to nest a contract's output inside a document being assembled by hand
— call `order.write(value)` and keep the `JsonValue`.

### XML

Java services still speak XML — SOAP endpoints, JAXB-annotated beans, configuration a `web.xml` away from being
JSON — and Node has nothing to read it with. There is no `DOMParser` outside the browser, and this package has no
runtime dependencies, so `parseXml` is a hand-written recursive-descent parser: elements, attributes, text,
`CDATA`, comments, processing instructions, the five built-in entities and numeric character references.

```ts
const root = parseXml(`<order id="A-1"><total>19.99</total></order>`);
root.getAttribute("id").get();           // "A-1"
root.getChild("total").get().getText();  // "19.99"
root.toXml();                            // back out again
```

An `XmlElement` is a document model rather than a DOM: a name, its attributes, its child elements and its own
character data, with no text nodes and no parent pointers. Whitespace between children is dropped so a
pretty-printed document reads like a compact one, and kept inside a leaf, where it is the value. What the model
gives up is *mixed content* — `<p>hello <b>world</b> again</p>` keeps both parts but not the fact that the `<b>`
sat between them — which no document written for data interchange depends on. Malformed input raises
`XmlParseException`, which names the line and column.

Binding a document to a DTO is the same idea as `JsonReader`, one layer taller, because an XML element has three
places a value can hide. An `XmlTextReader` turns character data into a value, an `XmlField` says *where* in an
element to look, and an `XmlReader` assembles the two into a `T`:

```ts
interface Item { sku: string; quantity: number; }
interface Order { id: string; total: number; note: Java.Optional<string>; items: Java.List<Item>; }

const item = elementOf<Item>({
  sku: attribute("sku"),
  quantity: childText("quantity", integerText),
});

const order = elementOf<Order>({
  id: attribute("id"),
  total: childText("total", numberText),
  note: optionalChild("note", textElement()),
  items: wrappedChildren("items", "item", item), // JAXB's @XmlElementWrapper
});

readXml(body, elementNamed("order", order));
```

Failures carry an XPath rather than the `$.field[0]` notation the JSON readers use, because that is the notation
every other XML tool already speaks:

```
/order/items/item[2]/quantity: expected an integer, got "one"
```

`stringText` trims, since indentation is not content; `rawText` is there for when it is. `booleanText` accepts
XML Schema's four spellings and refuses everything else — Java's own `Boolean.parseBoolean` answers `false` to a
typo, which is the wrong end of the trade for a wire contract. Namespaces are left as written: a prefixed name
stays prefixed, `xmlns` declarations are ordinary attributes, and `getLocalName()` is there for matching without
one. DTDs are skipped rather than honoured, so an undeclared entity is a failure instead of a silent hole.

Writing is the same three layers in reverse, and the contract reads line for line like the one above. An
`XmlTextWriter` turns a value into character data, an `XmlPart` says *where in the element it goes*, and an
`XmlWriter` assembles a `T` into a whole element:

```ts
const item = elementFrom<Item>({
  sku: intoAttribute("sku"),
  quantity: intoChildText("quantity", integerAsText),
});

const order = elementFrom<Order>({
  id: intoAttribute("id"),
  total: intoChildText("total", numberAsText),
  note: intoOptionalChild("note", textElementFrom()),
  items: intoWrappedChildren("items", "item", item),
});

writeXml("order", value, order, { declaration: true, indent: "  " });
```

Where a reader takes the path it is reading at, a writer takes the name it is writing under: an element's name
belongs to whatever holds it, which is why the same `item` writer serves under any tag a caller nests it beneath,
and why the root name is an argument to `writeXml`. For the tree rather than the text of it — to nest it in a
document being assembled by hand — call `order.write(value, "order")` and keep the `XmlElement`.

Whatever `writeXml` produces, `parseXml` reads back as an equal element and a matching reader as an equal value.
That guarantee is why a few things are refused rather than written: `NaN` and the infinities, an integer larger
than JavaScript was holding exactly, and a tag or attribute name that is not an XML name — no amount of escaping
rescues `<order id>`, and a document nothing can read back is worse than a failure at the slot. Those failures
carry the same XPath the reading ones do, and two parts aimed at one attribute is an `IllegalStateException`
rather than one of the two values quietly vanishing. A property missing from the value at runtime — a `T` cast
from a parsed document, or built against a version of the type without the field — is refused before it reaches
its part, the same way `objectFrom` refuses one on the JSON side. Absence that is meant is said with
`intoOptionalAttribute`, `intoOptionalChild`, or an empty collection.

Indentation is opt-in and only ever goes between child elements, the one place a parser is entitled to throw
whitespace away. An element holding text stays on its own line, and so does one holding text and children
together, because breaking either apart would change what reads back out.

## Where this deliberately departs from Java

| | Java | Here | Why |
| --- | --- | --- | --- |
| Index vs. value ops | `remove(int)` / `remove(Object)` | `removeAt` / `remove`, `addAt` / `add` | TypeScript cannot overload on these; they collapse the moment `T` is `number` |
| `Map.forEach`, `replaceAll` | `(key, value)` | `(value, key)` | Follows JavaScript's `Map.forEach`; getting the two backwards is silent when `K` and `V` are both strings |
| `List.subList` | live view | copy | A live sublist has to track index shifts in its parent, and Java's own docs spend a paragraph on how that goes wrong |
| `HashMap` iteration order | unspecified | insertion order | An unspecified order that happens to be stable is a trap waiting for the first person to depend on it |
| `Map.Entry` | has `setValue` | snapshot only | Writing through one would not do what it looks like |
| `Stream` | full API | `Java.Optional.stream()` returns an iterator | There is no Stream type here; an iterator is the JavaScript equivalent |
| `Set.of` with duplicates | throws | collapses them | The less surprising of the two |
| `Collections.emptyList()` | shared singleton | fresh instance | |
| `null` vs `undefined` | no `undefined` | folded together as "absent" | Except in `Java.Objects.equals`, where a map keeps them distinct rather than silently rewriting one of your keys |
| `Optional` | not `Serializable` | serialises as the value, or `null` | Java's is a return type, not a field; here it is exactly what a DTO wants to hold, and the wire form matches what Jackson emits for one |
| `Comparator.thenComparing` | overloaded on `Comparator` and on a key extractor | `then` / `thenComparing` | A comparator is *structurally* a key extractor returning a number, so the overload would resolve silently and wrongly. Java needs a cast to break the same tie |
| `List.sort` | any comparator, every element | same | `Array.prototype.sort` hoists `undefined` entries to the end without ever consulting the comparator; `Java.List.sort` sorts positions so that nothing is hidden from it |
| `Collection.removeIf` | removes through the iterator, element by element | chooses from a snapshot, removes by value | The two differ only for a predicate that accepts one of two `equals` elements and not the other; `iterator()` is exact where that matters |
| `Iterator` | not `Iterable` | `Iterable` too | Everything here that takes a sequence takes an `Iterable`, and wrapping a half-consumed cursor to hand it on would be a step for nothing |
| `Iterator.remove` on an unmodifiable collection | order of the two checks varies by implementation | refuses before complaining about call order | "This cannot be removed from" is the more useful of the two answers, and it is what `Java.Collections.unmodifiableCollection`'s iterator gives |
| `Collections.max` / `min` | takes a `Collection` | takes any `Iterable` | An array or a plain `Set` is as good an input, and nothing in the algorithm needs more |
| `TreeMap` storage | red-black tree | one sorted array | Lookups are O(log n) either way; insertion and removal are O(n) here. In exchange every navigation and range question is index arithmetic, which is why they are all present and all obviously correct |
| `TreeMap.descendingMap`, `TreeSet.descendingSet` | live views | copies, ordered by the reversed comparator | A sorted collection in its own right rather than a reversed reading of another one; `descendingKeys()` covers the walk without the copy |
| `subMap` / `subSet` bounds | `(from, fromInclusive, to, toInclusive)` | `(from, to, fromInclusive?, toInclusive?)` | A `TreeMap<boolean, V>` would make the second argument a key and a flag at once, with nothing at runtime able to tell which was meant |
| `TreeMap.descendingKeySet` | live `NavigableSet` | `descendingKeys()` iterator, or `descendingMap()` | The view is almost always immediately walked; `descendingMap()` covers the rest and is a sorted map in its own right |
| XML parsing | a conforming parser: DTDs, entity declarations, namespace resolution, mixed content | elements, attributes, text, `CDATA`, the five built-in entities; a doctype is skipped and prefixes are left on names | Each omitted piece is refused or ignored explicitly rather than half-implemented. A parser that reads a DTD and applies none of it would be lying about the document it produced |
| `new TreeMap<Point, V>()` | compiles, throws at the first comparison | same | TypeScript cannot constrain a class's type parameter per constructor. Pass `Java.Comparator.naturalOrder<K>()` — which *is* constrained — to move the check to compile time |
| `java.lang` / `java.util` packages | `import java.util.Map` | one flat `Java` namespace | The split is an artefact of Java's own history — `Objects` in `java.util`, `Object` in `java.lang` — and reproducing it would make every use site longer without answering a question anyone asks |
| `Map.Entry` | nested in `Map` | `Java.MapEntry` | Nesting it would mean making it a static member of `Java.Map`, which it is not; it is its own class |
| `Throwable` | the root of everything throwable | `Java.Throwable` roots only this library's hierarchy | It extends `Error`, so `catch (e) { if (e instanceof Java.Throwable) }` catches what this library raises and nothing else. That is the useful behaviour; the name says which concept it stands in for, not that it has Java's reach |
| `Objects.compare` | `compare(a, b, comparator)` | `Java.Objects.compare(a, b)` | Natural order, dispatched on the runtime type. Passing a third argument is a compile error rather than a silently ignored one, so the two cannot be confused at a call site |
| `Comparator.of` | does not exist | lifts a plain `(a, b) => number` | Java does not need one: there a lambda already *is* a `Comparator` and the compiler supplies the default methods |

Additions with no Java counterpart: `Java.Map.find` / `Java.List.find` (returning `Java.Optional`), the whole
`Contracts` module, `Java.NotImplementedException`, and the `JsonReader`, `JsonWriter`, `XmlReader` and
`XmlWriter` layers — Java's own binding lives in Jackson and JAXB rather than in the standard library, and the
layers here follow their decisions where one has been made.

## Roadmap

- **Framework-specific wire support** (Spring/Jackson/raw Tomcat). Both wire contracts are symmetric now —
  `JsonWriter` and `JsonReader`, `XmlWriter` and `XmlReader` — but nothing here knows about a particular
  backend's conventions:
  Spring's error envelope, Jackson's polymorphic `@JsonTypeInfo` discriminators, or the date and `BigDecimal`
  encodings a Java service picks by configuration rather than by type.
- **XML Schema and namespace resolution.** The XML layers bind a document to a DTO in both directions, but
  neither knows anything about a schema: nothing validates a document against an `.xsd`, and nothing resolves a
  prefix to the URI it was declared against — a contract matches `soap:Body` by the name as written.

## Development

```sh
npm test        # compiles to dist-test/ and runs node --test
npm run build   # emits dist/ with declarations and source maps
npm run typecheck
```

The build is maximally strict — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedDeclarations`,
`skipLibCheck: false` — and `src/` contains no `any`.

## License

MIT — see [LICENSE](LICENSE).
