export { JavaObject, boilerplateEqualityCheck } from "./fundamentals/Object.js";
export { equalsOf, hashAll, hashCodeOf } from "./fundamentals/Hashing.js";
export { isNull, nonNull, requireNonNull, requireNonNullElse, requireNonNullElseGet } from "./fundamentals/Objects.js";
export {
  hashContractChecksEnabled,
  overridesEqualsWithoutHashCode,
  setHashContractChecks,
} from "./fundamentals/Contracts.js";
export { Optional } from "./fundamentals/Optional.js";
export { compareOf } from "./fundamentals/Comparable.js";
export type { Comparable, NaturallyOrdered } from "./fundamentals/Comparable.js";
export {
  comparator,
  comparing,
  naturalOrder,
  nullsFirst,
  nullsLast,
  reverseOrder,
} from "./fundamentals/Comparator.js";
export type { Comparator } from "./fundamentals/Comparator.js";

export { JavaAbstractMap, JavaMapEntry } from "./collections/JavaAbstractMap.js";
export { JavaAbstractSet, JavaCollection } from "./collections/JavaCollection.js";
export type { JavaIterator, JavaListIterator } from "./collections/JavaIterator.js";
export { JavaList } from "./collections/JavaList.js";
export { JavaMap } from "./collections/JavaMap.js";
export { JavaSet } from "./collections/JavaSet.js";
export { TreeMap } from "./collections/TreeMap.js";
export { TreeSet } from "./collections/TreeSet.js";
export {
  binarySearch,
  emptyList,
  emptyMap,
  emptySet,
  max,
  min,
  reverse,
  singleton,
  singletonList,
  singletonMap,
  sort,
  swap,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSet,
} from "./collections/Collections.js";

export { TSJavaException } from "./exceptions/TSJavaException.js";
export { RuntimeException } from "./exceptions/RuntimeException.js";
export { ClassCastException } from "./exceptions/ClassCastException.js";
export { ConcurrentModificationException } from "./exceptions/ConcurrentModificationException.js";
export { IllegalArgumentException } from "./exceptions/IllegalArgumentException.js";
export { IllegalStateException } from "./exceptions/IllegalStateException.js";
export { IndexOutOfBoundsException } from "./exceptions/IndexOutOfBoundsException.js";
export { JsonBindException } from "./exceptions/JsonBindException.js";
export { NoSuchElementException } from "./exceptions/NoSuchElementException.js";
export { NotImplementedException } from "./exceptions/NotImplementedException.js";
export { NullPointerException } from "./exceptions/NullPointerException.js";
export { UnsupportedOperationException } from "./exceptions/UnsupportedOperationException.js";
export { XmlBindException } from "./exceptions/XmlBindException.js";
export { XmlParseException } from "./exceptions/XmlParseException.js";

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
export { XmlElement, parseXml } from "./serialization/XmlParser.js";
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
