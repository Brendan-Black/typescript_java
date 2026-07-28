import { JavaList } from "./JavaList.js";
import { JavaMap } from "./JavaMap.js";
import { JavaSet } from "./JavaSet.js";

/**
 * Java's `java.util.Collections`: the static helpers that wrap or manufacture collections.
 *
 * The `unmodifiable*` functions return read-only *views* that share the original's storage, so changes to the
 * original show through. The `empty*` and `singleton*` functions return frozen values with no original to
 * track. Both refuse mutators with `UnsupportedOperationException`, which is Java's approach: the read-only
 * wrappers still expose `add` and `remove`, and still throw when you call them.
 *
 * @module
 */

/** Java's `Collections.unmodifiableMap`: a read-only view of a map. See {@link JavaMap.unmodifiable}. */
export function unmodifiableMap<K, V>(map: JavaMap<K, V>): JavaMap<K, V> {
  return JavaMap.unmodifiable(map);
}

/** Java's `Collections.unmodifiableSet`: a read-only view of a set. See {@link JavaSet.unmodifiable}. */
export function unmodifiableSet<T>(set: JavaSet<T>): JavaSet<T> {
  return JavaSet.unmodifiable(set);
}

/** Java's `Collections.unmodifiableList`: a read-only view of a list. See {@link JavaList.unmodifiable}. */
export function unmodifiableList<T>(list: JavaList<T>): JavaList<T> {
  return JavaList.unmodifiable(list);
}

/** Java's `Collections.emptyMap`. Immutable, and a fresh instance each call rather than a shared singleton. */
export function emptyMap<K, V>(): JavaMap<K, V> {
  return JavaMap.of<K, V>();
}

/** Java's `Collections.emptySet`. */
export function emptySet<T>(): JavaSet<T> {
  return JavaSet.of<T>();
}

/** Java's `Collections.emptyList`. */
export function emptyList<T>(): JavaList<T> {
  return JavaList.of<T>();
}

/** Java's `Collections.singletonMap`: an immutable map holding exactly one entry. */
export function singletonMap<K, V>(key: K, value: V): JavaMap<K, V> {
  return JavaMap.of<K, V>([key, value]);
}

/** Java's `Collections.singleton`: an immutable set holding exactly one element. */
export function singleton<T>(value: T): JavaSet<T> {
  return JavaSet.of<T>(value);
}

/** Java's `Collections.singletonList`: an immutable list holding exactly one element. */
export function singletonList<T>(value: T): JavaList<T> {
  return JavaList.of<T>(value);
}
