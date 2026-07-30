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
that. A `JavaMap` buckets by `hashCode()` and resolves collisions with `equals()`, so a value type behaves as a key
exactly the way it would on the JVM:

```ts
import { JavaObject, JavaMap, JavaSet, boilerplateEqualityCheck, hashAll } from "typescript-java";

class Point extends JavaObject {
  constructor(public readonly x: number, public readonly y: number) {
    super();
  }

  public override equals(other: unknown): boolean {
    return boilerplateEqualityCheck<Point>({ obj1: this, obj2: other }, (a, b) => a.x === b.x && a.y === b.y);
  }

  public override hashCode(): number {
    return hashAll(this.x, this.y);
  }
}

const seen = new JavaMap<Point, string>();
seen.put(new Point(1, 2), "origin-ish");
seen.get(new Point(1, 2)); // "origin-ish"

new JavaSet([new Point(1, 2), new Point(1, 2)]).size(); // 1
```

The same blind spot runs through the rest of the standard library. `[p1].includes(p2)` and `array.indexOf(p2)` are
both false for structurally equal objects; `JavaList.contains` and `JavaList.indexOf` are not.

## Status

Alpha, version 0.1.0, and **not yet published to npm**. The collections, `Optional`, ordering, and the exception
hierarchy are complete and tested (515 tests); the serialization layer is one interface and little more. See
[Roadmap](#roadmap) for what is deliberately still missing.

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

| Module | Exports |
| --- | --- |
| `fundamentals/Object` | `JavaObject`, `boilerplateEqualityCheck` |
| `fundamentals/Hashing` | `hashCodeOf`, `equalsOf`, `hashAll` |
| `fundamentals/Objects` | `requireNonNull`, `requireNonNullElse`, `requireNonNullElseGet`, `isNull`, `nonNull` |
| `fundamentals/Optional` | `Optional` |
| `fundamentals/Comparable` | `Comparable`, `NaturallyOrdered`, `compareOf` |
| `fundamentals/Comparator` | `Comparator`, `comparator`, `comparing`, `naturalOrder`, `reverseOrder`, `nullsFirst`, `nullsLast` |
| `fundamentals/Contracts` | `setHashContractChecks`, `hashContractChecksEnabled`, `overridesEqualsWithoutHashCode` |
| `collections` | `JavaCollection`, `JavaAbstractSet`, `JavaAbstractMap`, `JavaIterator`, `JavaList`, `JavaSet`, `JavaMap`, `JavaMapEntry`, `TreeMap`, `TreeSet` |
| `collections/Collections` | `sort`, `max`, `min`, `binarySearch`, `reverse`, `swap`, `emptyList`, `emptyMap`, `emptySet`, `singleton`, `singletonList`, `singletonMap`, `unmodifiableList`, `unmodifiableMap`, `unmodifiableSet` |
| `exceptions` | `TSJavaException` and 10 subclasses |
| `serialization` | `Serializable` (type only) |

Everything is re-exported from the package root.

### Hashing that matches the JVM

`String.hashCode`, `Double.hashCode` and `Boolean.hashCode` are reproduced exactly, not approximated, so a hash
computed here equals one computed on the JVM for the same value. `hashCodeOf` extends that to the types Java has no
equivalent for — plain objects, arrays, functions and unregistered symbols get a stable identity hash from a
`WeakMap`, which is what Java's unoverridden `Object.hashCode` gives you.

### Optional

Java's `Optional`, including the later additions: `or`, `stream`, `ifPresentOrElse`, `isEmpty`.

```ts
const email = users.find("ada").map((u) => u.email).orElse("(none)");

// `stream()` yields an iterator rather than a Stream, which is the thing that actually composes in JavaScript
const found = [maybeA, maybeB, maybeC].flatMap((o) => [...o]);
```

`JavaMap.find(key)` is the unambiguous `get`: Java's `get` returns `null` both for an absent key and for a key
mapped to `null`, and `find` returns an `Optional` instead. (A key mapped to `null` still yields an empty Optional
— only `containsKey` separates those two cases.)

### Collections

`JavaMap` is Java's `LinkedHashMap`: insertion-ordered, fail-fast, with live write-through `keySet()`, `values()`
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
const view = JavaList.unmodifiable(backing);
backing.add(3);
view.toString(); // "[1, 2, 3]" — changes to the original show through
view.add(4);     // UnsupportedOperationException
```

`removeIf` is the short way to remove while walking a collection, since the fail-fast check above rules out doing
it inside the loop:

```ts
users.removeIf((u) => u.expired); // rather than a ConcurrentModificationException
```

`iterator()` is the exact way. It hands back a `JavaIterator` — Java's `Iterator`, a cursor you drive yourself —
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

A `JavaIterator` is also `Iterable`, which Java's `Iterator` is not, so a half-consumed one can be passed
straight to anything taking a sequence and picks up from where the cursor already is:

```ts
const rest = new JavaList<string>(it); // whatever next() has not yet reached
```

`Collections` carries Java's algorithms as well as its factories — `sort`, `max`, `min`, `binarySearch`,
`reverse` and `swap`. Each comes in two forms, as Java's do: one taking a comparator, and one taking none and
using natural order.

```ts
sort(names);                                       // natural order
sort(users, comparing<User, number>((u) => u.age));
max(scores);
```

The comparator-free form constrains its element type, so `sort(listOfPoints)` is a compile error rather than a
`ClassCastException` partway through the sort. `binarySearch` reproduces Java's return value exactly, negative
half included — a miss is `-(insertionPoint) - 1`, offset by one so that an insertion point of `0` stays
distinguishable from a hit at index `0`:

```ts
const at = binarySearch(sorted, key);
if (at < 0) {
  sorted.addAt(-(at + 1), key); // keeps it sorted
}
```

### Sorted collections

`TreeMap` and `TreeSet` keep their keys in order instead of in buckets — which is what you want when the key
type has a sensible order but no trustworthy hash, and it is the only way to ask the questions on the right:

```ts
const scores = new TreeMap<string, number>([["carol", 3], ["alice", 1], ["bob", 2]]);

[...scores.keys()];       // ["alice", "bob", "carol"] — key order, not insertion order
scores.firstKey();        // "alice"
scores.floorKey("bib");   // "bob" is above it; "alice" is the greatest key at or below
scores.headMap("bob");    // {alice=1}
scores.pollFirstEntry();  // removes and returns alice=1
```

The full `NavigableMap` / `NavigableSet` surface is there: `first`/`last`, `floor`/`ceiling`/`lower`/`higher`,
`poll` from either end, `headMap`/`tailMap`/`subMap` (and the `Set` equivalents), and descending views. Both
take an optional comparator ahead of their contents, so `new TreeSet(reverseOrder<string>(), names)` reads the
way Java's constructor does; with none, the keys are ordered by `compareOf`.

Both share their derived operations with `JavaMap` and `JavaSet` — `TreeMap` extends the same `JavaAbstractMap`
that `JavaMap` does, so `merge`, the `compute` family and the three live views behave identically, and a
`TreeMap` `equals` a `JavaMap` holding the same entries.

One thing to keep in mind, and it is Java's rule too: a sorted collection decides what counts as the same key by
**comparing**, not by `equals`. Two keys that compare equal are one entry, whatever `equals` says — which is the
consistency-with-equals contract on `Comparable` asking to be honoured.

### Ordering

`Comparable` for a type that carries its own order, `Comparator` for one imposed from outside, and Java's
combinators over them:

```ts
import { comparing, naturalOrder, nullsLast } from "typescript-java";

users.sort(comparing<User, string>((u) => u.surname).thenComparing((u) => u.forename));
names.sort(naturalOrder<string>());

// a row whose score may be absent: the null-tolerance belongs on the *key*, not on the row
rows.sort(comparing<Row, number | null>((r) => r.score, nullsLast(naturalOrder<number>())));
```

A `Comparator` here *is* a comparison function, so it goes straight into `JavaList.sort` or
`Array.prototype.sort`; it just carries `reversed()`, `then()` and `thenComparing()` as well. `comparator(fn)`
lifts a plain arrow function into one, which is the step Java's compiler does for you when it turns a lambda into
a functional interface.

`naturalOrder<T>()` will not compile unless `T` actually has an order — a primitive Java orders, a `Date`, or
something implementing `Comparable`. That is the same guarantee Java gets from `<T extends Comparable<? super
T>>`, and it turns a `ClassCastException` at sort time into a red squiggle.

Underneath is `compareOf(a, b)`, which sits alongside `hashCodeOf` and `equalsOf` and reproduces Java's
comparison semantics rather than JavaScript's:

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
and cannot be found again in a JavaMap or JavaSet. Override hashCode() from the same fields equals() compares —
hashAll(...) does this in one line. Silence with setHashContractChecks(false).
```

A second warning fires when a hash bucket grows past eight entries, which here means the key class is producing
colliding hashes for distinct values. Both are off with `setHashContractChecks(false)`.

### Exceptions

Everything descends from `TSJavaException` (standing in for `Throwable`) via `RuntimeException`, so `catch (e) { if
(e instanceof RuntimeException) ... }` catches anything this library raises and nothing else.

`ClassCastException` · `ConcurrentModificationException` · `IllegalArgumentException` · `IllegalStateException` ·
`IndexOutOfBoundsException` · `NoSuchElementException` · `NotImplementedException` · `NullPointerException` ·
`UnsupportedOperationException`

### Serialization

`JavaList`, `JavaSet`, `JavaMap`, `TreeMap`, `TreeSet`, `JavaMapEntry` and `Optional` implement `Serializable`, so `JSON.stringify`
produces something a caller would expect:

```ts
JSON.stringify(new JavaMap([["a", 1], ["b", 2]])); // [["a",1],["b",2]]
JSON.stringify(JavaList.of(1, 2));                 // [1,2]
```

A map serialises as pairs rather than as an object deliberately: JSON object keys can only be strings, so a map
keyed on numbers, nulls or `JavaObject`s would either collide or lose information. The pair form round-trips
straight back through the constructor.

An `Optional` serialises as the value it holds, or as `null` when empty — the wrapper leaves no trace on the wire:

```ts
JSON.stringify({ nickname: Optional.of("addie") }); // {"nickname":"addie"}
JSON.stringify({ nickname: Optional.empty() });     // {"nickname":null}
```

This is the shape Jackson's `Jdk8Module` produces for a Java DTO, and it is the only shape that makes `Optional`
usable on a wire contract: whether a field is wrapped is a property of the server's code, not of the JSON, and a
consumer in another language should not have to know. `null` is unambiguous in both directions, because it is the
one value an `Optional` cannot hold — `of` rejects it and `ofNullable` folds it to `empty` — so
`Optional.ofNullable(JSON.parse(json))` reconstructs the original exactly. An empty `Optional` keeps its key
rather than dropping it, which is the difference between "there is no nickname" and "nicknames were never
mentioned".

There is no interface for the reverse direction. Parsing back is `JSON.parse` plus a constructor call, which is
all the collections need — the pair form and the array form both feed straight into one.

## Where this deliberately departs from Java

| | Java | Here | Why |
| --- | --- | --- | --- |
| Index vs. value ops | `remove(int)` / `remove(Object)` | `removeAt` / `remove`, `addAt` / `add` | TypeScript cannot overload on these; they collapse the moment `T` is `number` |
| `Map.forEach`, `replaceAll` | `(key, value)` | `(value, key)` | Follows JavaScript's `Map.forEach`; getting the two backwards is silent when `K` and `V` are both strings |
| `List.subList` | live view | copy | A live sublist has to track index shifts in its parent, and Java's own docs spend a paragraph on how that goes wrong |
| `HashMap` iteration order | unspecified | insertion order | An unspecified order that happens to be stable is a trap waiting for the first person to depend on it |
| `Map.Entry` | has `setValue` | snapshot only | Writing through one would not do what it looks like |
| `Stream` | full API | `Optional.stream()` returns an iterator | There is no Stream type here; an iterator is the JavaScript equivalent |
| `Set.of` with duplicates | throws | collapses them | The less surprising of the two |
| `Collections.emptyList()` | shared singleton | fresh instance | |
| `null` vs `undefined` | no `undefined` | folded together as "absent" | Except in `equalsOf`, where a map keeps them distinct rather than silently rewriting one of your keys |
| `Optional` | not `Serializable` | serialises as the value, or `null` | Java's is a return type, not a field; here it is exactly what a DTO wants to hold, and the wire form matches what Jackson emits for one |
| `Comparator.thenComparing` | overloaded on `Comparator` and on a key extractor | `then` / `thenComparing` | A comparator is *structurally* a key extractor returning a number, so the overload would resolve silently and wrongly. Java needs a cast to break the same tie |
| `List.sort` | any comparator, every element | same | `Array.prototype.sort` hoists `undefined` entries to the end without ever consulting the comparator; `JavaList.sort` sorts positions so that nothing is hidden from it |
| `Collection.removeIf` | removes through the iterator, element by element | chooses from a snapshot, removes by value | The two differ only for a predicate that accepts one of two `equals` elements and not the other; `iterator()` is exact where that matters |
| `Iterator` | not `Iterable` | `Iterable` too | Everything here that takes a sequence takes an `Iterable`, and wrapping a half-consumed cursor to hand it on would be a step for nothing |
| `Iterator.remove` on an unmodifiable collection | order of the two checks varies by implementation | refuses before complaining about call order | "This cannot be removed from" is the more useful of the two answers, and it is what `Collections.unmodifiableCollection`'s iterator gives |
| `Collections.max` / `min` | takes a `Collection` | takes any `Iterable` | An array or a plain `Set` is as good an input, and nothing in the algorithm needs more |
| `TreeMap` storage | red-black tree | one sorted array | Lookups are O(log n) either way; insertion and removal are O(n) here. In exchange every navigation and range question is index arithmetic, which is why they are all present and all obviously correct |
| `TreeMap.headMap` / `subMap`, `TreeSet.headSet` / `subSet` | live views | copies | Same reason as `List.subList`, plus a live range view has to reject keys outside its own bounds |
| `subMap` / `subSet` bounds | `(from, fromInclusive, to, toInclusive)` | `(from, to, fromInclusive?, toInclusive?)` | A `TreeMap<boolean, V>` would make the second argument a key and a flag at once, with nothing at runtime able to tell which was meant |
| `TreeMap.descendingKeySet` | live `NavigableSet` | `descendingKeys()` iterator, or `descendingMap()` | The view is almost always immediately walked; `descendingMap()` covers the rest and is a sorted map in its own right |
| `new TreeMap<Point, V>()` | compiles, throws at the first comparison | same | TypeScript cannot constrain a class's type parameter per constructor. Pass `naturalOrder<K>()` — which *is* constrained — to move the check to compile time |

Additions with no Java counterpart: `JavaMap.find` / `JavaList.find` (returning `Optional`), the whole `Contracts`
module, and `NotImplementedException`.

## Roadmap

- **DTO wire contracts** to and from backend frameworks (Spring/Jackson/raw Tomcat). Today's serialization layer is
  one interface and `toJSON` on the collections and `Optional`; there is no framework-specific support, and
  nothing types the parse direction — a contract for that belongs with the layer that needs it.
- **XML parsing** (JavaBeans). Not started.
- **Live range views** from `TreeMap.headMap` / `subMap` and `TreeSet.headSet` / `subSet`, which today are copies.
  `JavaIterator` is the piece that was missing; what remains is bounds-checking writes made through a range and
  keeping a range and its parent's modification counts in step.
- Remaining `java.util` shapes: `ListIterator`, which adds `previous`, `set` and `add` to the cursor
  `JavaCollection.iterator()` already hands back.

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
