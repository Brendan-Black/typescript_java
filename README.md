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

Alpha, version 0.1.0, and **not yet published to npm**. The collections, `Optional`, and the exception hierarchy are
complete and tested (315 tests); the serialization layer is two interfaces and little more. See
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
| `fundamentals/Contracts` | `setHashContractChecks`, `hashContractChecksEnabled`, `overridesEqualsWithoutHashCode` |
| `collections` | `JavaCollection`, `JavaAbstractSet`, `JavaList`, `JavaSet`, `JavaMap`, `JavaMapEntry` |
| `collections/Collections` | `emptyList`, `emptyMap`, `emptySet`, `singleton`, `singletonList`, `singletonMap`, `unmodifiableList`, `unmodifiableMap`, `unmodifiableSet` |
| `exceptions` | `TSJavaException` and 9 subclasses |
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

`ConcurrentModificationException` · `IllegalArgumentException` · `IllegalStateException` ·
`IndexOutOfBoundsException` · `NoSuchElementException` · `NotImplementedException` · `NullPointerException` ·
`UnsupportedOperationException`

### Serialization

`JavaList`, `JavaSet`, `JavaMap`, `JavaMapEntry` and `Optional` implement `Serializable`, so `JSON.stringify`
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

Additions with no Java counterpart: `JavaMap.find` / `JavaList.find` (returning `Optional`), the whole `Contracts`
module, and `NotImplementedException`.

## Roadmap

- **DTO wire contracts** to and from backend frameworks (Spring/Jackson/raw Tomcat). Today's serialization layer is
  one interface and `toJSON` on the collections and `Optional`; there is no framework-specific support, and
  nothing types the parse direction — a contract for that belongs with the layer that needs it.
- **XML parsing** (JavaBeans). Not started.
- Remaining `java.util` shapes: `Comparable`/`Comparator`, `TreeMap`/`TreeSet`, `Iterator` as an interface rather
  than a generator.

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
