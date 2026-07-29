export { JavaObject, boilerplateEqualityCheck } from "./fundamentals/Object.js";
export { equalsOf, hashAll, hashCodeOf } from "./fundamentals/Hashing.js";
export { isNull, nonNull, requireNonNull, requireNonNullElse, requireNonNullElseGet } from "./fundamentals/Objects.js";
export {
  hashContractChecksEnabled,
  overridesEqualsWithoutHashCode,
  setHashContractChecks,
} from "./fundamentals/Contracts.js";
export { Optional } from "./fundamentals/Optional.js";

export { JavaAbstractSet, JavaCollection } from "./collections/JavaCollection.js";
export { JavaList } from "./collections/JavaList.js";
export { JavaMap, JavaMapEntry } from "./collections/JavaMap.js";
export { JavaSet } from "./collections/JavaSet.js";
export {
  emptyList,
  emptyMap,
  emptySet,
  singleton,
  singletonList,
  singletonMap,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSet,
} from "./collections/Collections.js";

export { TSJavaException } from "./exceptions/TSJavaException.js";
export { RuntimeException } from "./exceptions/RuntimeException.js";
export { ConcurrentModificationException } from "./exceptions/ConcurrentModificationException.js";
export { IllegalArgumentException } from "./exceptions/IllegalArgumentException.js";
export { IllegalStateException } from "./exceptions/IllegalStateException.js";
export { IndexOutOfBoundsException } from "./exceptions/IndexOutOfBoundsException.js";
export { NoSuchElementException } from "./exceptions/NoSuchElementException.js";
export { NotImplementedException } from "./exceptions/NotImplementedException.js";
export { NullPointerException } from "./exceptions/NullPointerException.js";
export { UnsupportedOperationException } from "./exceptions/UnsupportedOperationException.js";

export type { Serializable } from "./serialization/Serializable.js";
