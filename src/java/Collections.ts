/**
 * `java.util.Collections`, as the static-utility class it is in Java.
 *
 * Every name here already matches Java's exactly; what the namespace restores is the qualifier. `sort(names)`
 * and `max(scores)` are unusually generic things to take from a package root — `Java.Collections.sort(names)`
 * says which `sort` it is, which is what a Java reader is used to and what makes the call site self-describing.
 *
 * Written out one name at a time rather than re-exported with `*`, for the reason `isolatedDeclarations` is on
 * in this repo: the public surface should be written down rather than derived, so that adding an export to
 * `collections/Collections.ts` cannot quietly widen the namespace.
 *
 * @module
 */

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
} from "../collections/Collections.js";
