/**
 * The `Java` namespace: this library's reimplementation of the standard library, under Java's own names.
 *
 * This is the only way in: the standard library is reachable through `Java.*` and nowhere else. The names are
 * renamed here at the boundary rather than wrapped, so nothing costs an indirection. A namespace is what lets
 * them be Java's own — `Object`, `Map`, `Set`, `List` and `Iterator` would otherwise collide with JavaScript's
 * globals at module scope:
 *
 * ```ts
 * import { Java } from "typescript-java";
 *
 * class Point extends Java.Object { }
 * const seen = new Java.Map<Point, string>();
 * Java.Collections.sort(names);
 * ```
 *
 * The classes keep their prefixed *declaration* names and are renamed only here, at the boundary. That is
 * deliberate and not merely convenient: `collections/JavaMap.ts` stores its buckets in a real `Map` and
 * `fundamentals/Object.ts` calls the real `Object.getPrototypeOf`, so a class actually named `Map` or `Object`
 * would shadow the global it depends on. Aliasing at the boundary also leaves `constructor.name` alone, which
 * is what `JavaObject.toString()` prints — a `Java.Map` still renders as `JavaMap@1f45`.
 *
 * WHAT IS NOT HERE: anything without a `java.lang`, `java.util` or `java.io` counterpart. The serialization
 * layers model Jackson and JAXB rather than the standard library, and stay at the top level along with
 * `JsonBindException`, `XmlBindException` and `XmlParseException`; so do `boilerplateEqualityCheck` and the
 * `Contracts` module, which are this library's own tooling. `Java.*` is the standard library and nothing else.
 *
 * @module
 */

// ---------------------------------------------------------------------------------------------------------
// java.lang
// ---------------------------------------------------------------------------------------------------------

export { JavaObject as Object } from "../fundamentals/Object.js";
export type { Comparable } from "../fundamentals/Comparable.js";
/** No Java counterpart: the constraint `<T extends Comparable<? super T>>` states inline, named so it can be reused. */
export type { NaturallyOrdered } from "../fundamentals/Comparable.js";

// ---------------------------------------------------------------------------------------------------------
// java.util
// ---------------------------------------------------------------------------------------------------------

export { Optional } from "../fundamentals/Optional.js";

export { JavaCollection as Collection } from "../collections/JavaCollection.js";
export { JavaAbstractSet as AbstractSet } from "../collections/JavaCollection.js";
export { JavaAbstractMap as AbstractMap } from "../collections/JavaAbstractMap.js";
/** Java spells this `Map.Entry`; a nested name would mean making it a static of {@link Map}, which it is not. */
export { JavaMapEntry as MapEntry } from "../collections/JavaAbstractMap.js";
export { JavaList as List } from "../collections/JavaList.js";
export { JavaSet as Set } from "../collections/JavaSet.js";
export { JavaMap as Map } from "../collections/JavaMap.js";
export { TreeMap } from "../collections/TreeMap.js";
export { TreeSet } from "../collections/TreeSet.js";
export type { JavaIterator as Iterator, JavaListIterator as ListIterator } from "../collections/JavaIterator.js";

/** Both the `Comparator<T>` type and its statics, merged under one name. See {@link ./Comparator.js}. */
export { Comparator } from "./Comparator.js";

export * as Collections from "./Collections.js";
export * as Objects from "./Objects.js";

// ---------------------------------------------------------------------------------------------------------
// java.io
// ---------------------------------------------------------------------------------------------------------

export type { Serializable } from "../serialization/Serializable.js";

// ---------------------------------------------------------------------------------------------------------
// The exception hierarchy
//
// The three binding failures — JsonBindException, XmlBindException, XmlParseException — are deliberately
// absent, for the same reason the readers that raise them are: they belong to Jackson and JAXB's territory,
// not the standard library's. They remain top-level exports.
// ---------------------------------------------------------------------------------------------------------

/**
 * The root of everything this library throws.
 *
 * CAVEAT: Java's `Throwable` is the root of everything throwable, full stop. This one extends `Error` and
 * roots only this library's hierarchy, so `catch (e) { if (e instanceof Java.Throwable) }` catches what this
 * library raises and nothing else — not a `TypeError`, not a foreign library's error. That is the useful
 * behaviour and the documented one; the name says which Java concept it stands in for, not that it has
 * Java's reach.
 */
export { TSJavaException as Throwable } from "../exceptions/TSJavaException.js";
export { RuntimeException } from "../exceptions/RuntimeException.js";
export { ClassCastException } from "../exceptions/ClassCastException.js";
export { ConcurrentModificationException } from "../exceptions/ConcurrentModificationException.js";
export { IllegalArgumentException } from "../exceptions/IllegalArgumentException.js";
export { IllegalStateException } from "../exceptions/IllegalStateException.js";
export { IndexOutOfBoundsException } from "../exceptions/IndexOutOfBoundsException.js";
export { NoSuchElementException } from "../exceptions/NoSuchElementException.js";
export { NullPointerException } from "../exceptions/NullPointerException.js";
export { UnsupportedOperationException } from "../exceptions/UnsupportedOperationException.js";
/** No Java counterpart; kept here so the hierarchy under {@link RuntimeException} is complete in one place. */
export { NotImplementedException } from "../exceptions/NotImplementedException.js";
