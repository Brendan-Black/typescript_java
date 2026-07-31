/**
 * The package root.
 *
 * `Java` is the surface — `Java.Map`, `Java.Object`, `Java.Collections.sort`. Everything with a `java.lang`,
 * `java.util` or `java.io` counterpart lives there and only there; the namespace is the qualifier that lets
 * these carry Java's own names without colliding with JavaScript's globals.
 *
 * What is exported flat below is what has no `Java.*` spelling to be reached by: the serialization layer,
 * which is Jackson and JAXB's territory rather than the standard library's, and this library's own tooling.
 */
export * as Java from "./java/index.js";

// ---------------------------------------------------------------------------------------------------------
// This library's own tooling. No Java counterpart, so no `Java.*` spelling.
// ---------------------------------------------------------------------------------------------------------

export { boilerplateEqualityCheck } from "./fundamentals/Object.js";
export {
  hashContractChecksEnabled,
  overridesEqualsWithoutHashCode,
  setHashContractChecks,
} from "./fundamentals/Contracts.js";

// ---------------------------------------------------------------------------------------------------------
// Serialization. Jackson and JAXB's territory rather than the standard library's, so this layer keeps its
// top-level exports. `Serializable` itself is `java.io`, so it lives under `Java.*` instead.
// ---------------------------------------------------------------------------------------------------------

// The binding failures belong to this layer, not to `Java.*`.
export { JsonBindException } from "./exceptions/JsonBindException.js";
export { XmlBindException } from "./exceptions/XmlBindException.js";
export { XmlParseException } from "./exceptions/XmlParseException.js";

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
export type { JsonProperties, JsonValue, JsonWriter, OmittedWhenEmpty } from "./serialization/JsonWriter.js";
export {
  arrayFrom,
  booleanAsJson,
  entryFrom,
  integerAsJson,
  mapAsObject,
  mapFrom,
  mappingAsJson,
  nullableAsJson,
  numberAsJson,
  objectFrom,
  omitWhenEmpty,
  optionalAsJson,
  rawJson,
  stringAsJson,
  writeJson,
} from "./serialization/JsonWriter.js";
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
