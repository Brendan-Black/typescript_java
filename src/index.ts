/**
 * The package root.
 *
 * `Java` is the documented surface — `Java.Map`, `Java.Object`, `Java.Collections.sort` — and the flat,
 * prefixed exports below are the original spelling of the same bindings, kept so that nothing breaks. They
 * are deprecated rather than removed, and will go before 1.0. `Java.Map === JavaMap` is literally true: the
 * namespace re-exports the bindings rather than wrapping them, so `instanceof` holds across both spellings.
 *
 * The serialization layer is deliberately *not* under `Java.*`. Java's own binding lives in Jackson and JAXB
 * rather than in the standard library, so those readers keep their top-level exports and are not deprecated.
 */
export * as Java from "./java/index.js";

// ---------------------------------------------------------------------------------------------------------
// Flat surface — the original spelling. Deprecated in favour of `Java.*`; see above.
// ---------------------------------------------------------------------------------------------------------

export {
  /** @deprecated Use {@link Java.Object} instead. */
  JavaObject,
  // no Java counterpart, so it has no `Java.*` spelling and is not deprecated
  boilerplateEqualityCheck,
} from "./fundamentals/Object.js";
export {
  /** @deprecated Use {@link Java.Objects.equals} instead. */
  equalsOf,
  /** @deprecated Use {@link Java.Objects.hash} instead. */
  hashAll,
  /** @deprecated Use {@link Java.Objects.hashCode} instead. */
  hashCodeOf,
} from "./fundamentals/Hashing.js";
export {
  /** @deprecated Use {@link Java.Objects.isNull} instead. */
  isNull,
  /** @deprecated Use {@link Java.Objects.nonNull} instead. */
  nonNull,
  /** @deprecated Use {@link Java.Objects.requireNonNull} instead. */
  requireNonNull,
  /** @deprecated Use {@link Java.Objects.requireNonNullElse} instead. */
  requireNonNullElse,
  /** @deprecated Use {@link Java.Objects.requireNonNullElseGet} instead. */
  requireNonNullElseGet,
} from "./fundamentals/Objects.js";
// this library's own tooling rather than a Java reimplementation, so it stays here and is not deprecated
export {
  hashContractChecksEnabled,
  overridesEqualsWithoutHashCode,
  setHashContractChecks,
} from "./fundamentals/Contracts.js";
export {
  /** @deprecated Use {@link Java.Optional} instead. */
  Optional,
} from "./fundamentals/Optional.js";
export {
  /** @deprecated Use {@link Java.Objects.compare} instead. */
  compareOf,
} from "./fundamentals/Comparable.js";
export type {
  /** @deprecated Use {@link Java.Comparable} instead. */
  Comparable,
  /** @deprecated Use {@link Java.NaturallyOrdered} instead. */
  NaturallyOrdered,
} from "./fundamentals/Comparable.js";
export {
  /** @deprecated Use {@link Java.Comparator.of} instead. */
  comparator,
  /** @deprecated Use {@link Java.Comparator.comparing} instead. */
  comparing,
  /** @deprecated Use {@link Java.Comparator.naturalOrder} instead. */
  naturalOrder,
  /** @deprecated Use {@link Java.Comparator.nullsFirst} instead. */
  nullsFirst,
  /** @deprecated Use {@link Java.Comparator.nullsLast} instead. */
  nullsLast,
  /** @deprecated Use {@link Java.Comparator.reverseOrder} instead. */
  reverseOrder,
} from "./fundamentals/Comparator.js";
export type {
  /** @deprecated Use {@link Java.Comparator} instead. */
  Comparator,
} from "./fundamentals/Comparator.js";

export {
  /** @deprecated Use {@link Java.AbstractMap} instead. */
  JavaAbstractMap,
  /** @deprecated Use {@link Java.MapEntry} instead. */
  JavaMapEntry,
} from "./collections/JavaAbstractMap.js";
export {
  /** @deprecated Use {@link Java.AbstractSet} instead. */
  JavaAbstractSet,
  /** @deprecated Use {@link Java.Collection} instead. */
  JavaCollection,
} from "./collections/JavaCollection.js";
export type {
  /** @deprecated Use {@link Java.Iterator} instead. */
  JavaIterator,
  /** @deprecated Use {@link Java.ListIterator} instead. */
  JavaListIterator,
} from "./collections/JavaIterator.js";
export {
  /** @deprecated Use {@link Java.List} instead. */
  JavaList,
} from "./collections/JavaList.js";
export {
  /** @deprecated Use {@link Java.Map} instead. */
  JavaMap,
} from "./collections/JavaMap.js";
export {
  /** @deprecated Use {@link Java.Set} instead. */
  JavaSet,
} from "./collections/JavaSet.js";
export {
  /** @deprecated Use {@link Java.TreeMap} instead. */
  TreeMap,
} from "./collections/TreeMap.js";
export {
  /** @deprecated Use {@link Java.TreeSet} instead. */
  TreeSet,
} from "./collections/TreeSet.js";
export {
  /** @deprecated Use {@link Java.Collections.binarySearch} instead. */
  binarySearch,
  /** @deprecated Use {@link Java.Collections.emptyList} instead. */
  emptyList,
  /** @deprecated Use {@link Java.Collections.emptyMap} instead. */
  emptyMap,
  /** @deprecated Use {@link Java.Collections.emptySet} instead. */
  emptySet,
  /** @deprecated Use {@link Java.Collections.max} instead. */
  max,
  /** @deprecated Use {@link Java.Collections.min} instead. */
  min,
  /** @deprecated Use {@link Java.Collections.reverse} instead. */
  reverse,
  /** @deprecated Use {@link Java.Collections.singleton} instead. */
  singleton,
  /** @deprecated Use {@link Java.Collections.singletonList} instead. */
  singletonList,
  /** @deprecated Use {@link Java.Collections.singletonMap} instead. */
  singletonMap,
  /** @deprecated Use {@link Java.Collections.sort} instead. */
  sort,
  /** @deprecated Use {@link Java.Collections.swap} instead. */
  swap,
  /** @deprecated Use {@link Java.Collections.unmodifiableList} instead. */
  unmodifiableList,
  /** @deprecated Use {@link Java.Collections.unmodifiableMap} instead. */
  unmodifiableMap,
  /** @deprecated Use {@link Java.Collections.unmodifiableSet} instead. */
  unmodifiableSet,
} from "./collections/Collections.js";

export {
  /** @deprecated Use {@link Java.Throwable} instead. */
  TSJavaException,
} from "./exceptions/TSJavaException.js";
export {
  /** @deprecated Use {@link Java.RuntimeException} instead. */
  RuntimeException,
} from "./exceptions/RuntimeException.js";
export {
  /** @deprecated Use {@link Java.ClassCastException} instead. */
  ClassCastException,
} from "./exceptions/ClassCastException.js";
export {
  /** @deprecated Use {@link Java.ConcurrentModificationException} instead. */
  ConcurrentModificationException,
} from "./exceptions/ConcurrentModificationException.js";
export {
  /** @deprecated Use {@link Java.IllegalArgumentException} instead. */
  IllegalArgumentException,
} from "./exceptions/IllegalArgumentException.js";
export {
  /** @deprecated Use {@link Java.IllegalStateException} instead. */
  IllegalStateException,
} from "./exceptions/IllegalStateException.js";
export {
  /** @deprecated Use {@link Java.IndexOutOfBoundsException} instead. */
  IndexOutOfBoundsException,
} from "./exceptions/IndexOutOfBoundsException.js";
export {
  /** @deprecated Use {@link Java.NoSuchElementException} instead. */
  NoSuchElementException,
} from "./exceptions/NoSuchElementException.js";
export {
  /** @deprecated Use {@link Java.NotImplementedException} instead. */
  NotImplementedException,
} from "./exceptions/NotImplementedException.js";
export {
  /** @deprecated Use {@link Java.NullPointerException} instead. */
  NullPointerException,
} from "./exceptions/NullPointerException.js";
export {
  /** @deprecated Use {@link Java.UnsupportedOperationException} instead. */
  UnsupportedOperationException,
} from "./exceptions/UnsupportedOperationException.js";

// The binding failures belong to the serialization layer below, not to `Java.*`.
export { JsonBindException } from "./exceptions/JsonBindException.js";
export { XmlBindException } from "./exceptions/XmlBindException.js";
export { XmlParseException } from "./exceptions/XmlParseException.js";

// ---------------------------------------------------------------------------------------------------------
// Serialization. Jackson and JAXB's territory rather than the standard library's, so this layer keeps its
// top-level exports and has no `Java.*` spelling. `Serializable` itself is `java.io`, so it has both.
// ---------------------------------------------------------------------------------------------------------

export type { Serializable } from "./serialization/Serializable.js";
export type { JsonFields, JsonReader } from "./serialization/JsonReader.js";
export {
  arrayOf,
  booleanValue,
  entryOf,
  enumOf,
  integerValue,
  listOf,
  mapOf,
  mapping,
  nullable,
  numberValue,
  objectAsMap,
  objectOf,
  optionalValue,
  readJson,
  setOf,
  stringValue,
  treeMapOf,
  treeSetOf,
  unknownValue,
  withDefault,
} from "./serialization/JsonReader.js";
export { XmlElement, isXmlName, parseXml } from "./serialization/XmlParser.js";
export type { XmlField, XmlFields, XmlReader, XmlTextReader } from "./serialization/XmlReader.js";
export {
  attribute,
  booleanText,
  child,
  childText,
  children,
  elementNamed,
  elementOf,
  enumText,
  integerText,
  mappingElement,
  mappingText,
  numberText,
  optionalAttribute,
  optionalChild,
  rawText,
  readXml,
  stringText,
  textContent,
  textElement,
  wrappedChildren,
} from "./serialization/XmlReader.js";
export type { XmlFormat, XmlParts, XmlPart, XmlTextWriter, XmlWriter } from "./serialization/XmlWriter.js";
export {
  booleanAsText,
  elementFrom,
  integerAsText,
  intoAttribute,
  intoChild,
  intoChildText,
  intoChildren,
  intoOptionalAttribute,
  intoOptionalChild,
  intoText,
  intoWrappedChildren,
  mappingAsText,
  mappingElementFrom,
  numberAsText,
  stringAsText,
  textElementFrom,
  writeXml,
  XmlDraft,
} from "./serialization/XmlWriter.js";
