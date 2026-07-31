import { MapEntry } from "../collections/AbstractMap.js";
import { List } from "../collections/List.js";
import { JavaMap } from "../collections/Map.js";
import { JavaSet } from "../collections/Set.js";
import { TreeMap } from "../collections/TreeMap.js";
import { TreeSet } from "../collections/TreeSet.js";
import { JsonBindException } from "../exceptions/JsonBindException.js";
import { Optional } from "../fundamentals/Optional.js";
import type { Serializable } from "./Serializable.js";

/**
 * The parse direction of a wire contract: what {@link Serializable} is for writing.
 *
 * `JSON.parse` hands back `unknown`, and the usual next step is a cast — which types the value without checking
 * it, so a field the server renamed becomes `undefined` and travels until something unrelated breaks. A
 * `JsonReader<T>` checks as it goes and produces a real `T`, or throws {@link JsonBindException} naming the slot
 * that was wrong. It is Jackson's `ObjectReader` in the role it actually plays on a DTO.
 *
 * The readers below compose, so a contract is written once and reads top to bottom:
 *
 * ```ts
 * interface Order { id: string; total: number; note: Optional<string>; }
 *
 * const order: JsonReader<Order> = objectOf<Order>({
 *   id: stringValue,
 *   total: numberValue,
 *   note: optionalValue(stringValue),
 * });
 * const orders = listOf(order).read(JSON.parse(body));
 * ```
 *
 * Every reader in this module round-trips the shape the matching {@link Serializable.toJSON} produces, so
 * anything this library can write, it can read back.
 */
export interface JsonReader<T> {
  /**
   * @param value a value straight from `JSON.parse` — `unknown`, because that is what it honestly is
   * @param path where this value sits in the document. Supplied by the composing readers; callers reading a whole
   *   document can leave it alone and get `$`.
   * @throws {@link JsonBindException} if the value does not match this contract
   */
  read(value: unknown, path?: string): T;
}

/** A reader per field of `T`, which is what {@link objectOf} needs to build one. */
export type JsonFields<T> = {
  readonly [K in keyof T]: JsonReader<T[K]>;
};

/** The path notation the readers build up. `$` is the document itself, so every message has a root to hang off. */
const ROOT = "$";

/**
 * What to call a value in a message. The type name rather than the value, except for the handful of cases where
 * the value is short and saying it is more use than naming its type.
 */
function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "nothing";
  }
  if (Array.isArray(value)) {
    return "an array";
  }
  if (typeof value === "object") {
    return "an object";
  }
  if (typeof value === "string") {
    return "a string";
  }
  return `${typeof value} ${String(value)}`;
}

function fail(path: string, expected: string, value: unknown): never {
  throw new JsonBindException(path, `expected ${expected}, got ${describe(value)}`);
}

/** A JSON object as what it is once parsed: string keys, unchecked values. */
function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "an object", value);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    return fail(path, "an array", value);
  }
  return value as readonly unknown[];
}

/** Java's `String` on the wire. */
export const stringValue: JsonReader<string> = {
  read(value: unknown, path: string = ROOT): string {
    return typeof value === "string" ? value : fail(path, "a string", value);
  },
};

/**
 * Java's numeric types on the wire, which JSON does not distinguish between.
 *
 * `NaN` and the infinities are refused rather than accepted: JSON has no way to write them, so a contract that
 * admits them is describing something no conforming document can contain.
 */
export const numberValue: JsonReader<number> = {
  read(value: unknown, path: string = ROOT): number {
    if (typeof value !== "number") {
      return fail(path, "a number", value);
    }
    if (!Number.isFinite(value)) {
      throw new JsonBindException(path, `expected a finite number, got ${String(value)}`);
    }
    return value;
  },
};

/**
 * Java's `int` and `long` on the wire.
 *
 * Separate from {@link numberValue} because a fractional value arriving where a count was promised is a real
 * mismatch, and JavaScript will otherwise carry it silently all the way to whatever indexes with it.
 */
export const integerValue: JsonReader<number> = {
  read(value: unknown, path: string = ROOT): number {
    const number = numberValue.read(value, path);
    if (!Number.isInteger(number)) {
      throw new JsonBindException(path, `expected an integer, got ${String(number)}`);
    }
    return number;
  },
};

export const booleanValue: JsonReader<boolean> = {
  read(value: unknown, path: string = ROOT): boolean {
    return typeof value === "boolean" ? value : fail(path, "a boolean", value);
  },
};

/**
 * Accepts whatever is there and hands it back unread.
 *
 * The honest way to say a slot is not part of the contract — a passthrough field, or one whose shape is decided
 * further down. Unlike a cast, it types the value as `unknown`, so reading it still costs a decision.
 */
export const unknownValue: JsonReader<unknown> = {
  read(value: unknown): unknown {
    return value;
  },
};

/**
 * Java's `Enum.valueOf`: one of a fixed set of strings, or a bind failure naming the ones that were allowed.
 *
 * ```ts
 * const status = enumOf("PENDING", "SHIPPED", "CANCELLED");
 * ```
 */
export function enumOf<T extends string>(...values: readonly T[]): JsonReader<T> {
  const allowed = new Set<string>(values);
  return {
    read(value: unknown, path: string = ROOT): T {
      const text = stringValue.read(value, path);
      if (!allowed.has(text)) {
        throw new JsonBindException(path, `expected one of ${values.join(", ")}, got ${text}`);
      }
      return text as T;
    },
  };
}

/**
 * Reads a value and then converts it — the hinge between a wire shape and the type a caller actually wants.
 *
 * This is how a DTO class gets built, rather than {@link objectOf} knowing about constructors:
 *
 * ```ts
 * const point = mapping(objectOf({ x: numberValue, y: numberValue }), ({ x, y }) => new Point(x, y));
 * ```
 *
 * The transform runs only on a value that already read cleanly, so it never has to defend itself.
 */
export function mapping<T, R>(reader: JsonReader<T>, transform: (value: T) => R): JsonReader<R> {
  return {
    read(value: unknown, path: string = ROOT): R {
      return transform(reader.read(value, path));
    },
  };
}

/**
 * Allows an explicit JSON `null` through as `null`, reading anything else with the wrapped reader.
 *
 * For a field that is *absent* rather than null, see {@link optionalValue} and {@link withDefault} — a missing
 * key reads as nothing, which this still refuses.
 */
export function nullable<T>(reader: JsonReader<T>): JsonReader<T | null> {
  return {
    read(value: unknown, path: string = ROOT): T | null {
      return value === null ? null : reader.read(value, path);
    },
  };
}

/**
 * Java's `Optional` on the wire, in the shape `Optional.toJSON` writes: the value itself, or `null`.
 *
 * A missing key reads as empty too. The two are worth distinguishing on the way out — an empty `Optional` keeps
 * its key, so a client can tell "there is no nickname" from "nicknames were never mentioned" — but on the way in
 * both leave the same `Optional`, and refusing the second would break against every server that drops null
 * fields. Jackson's `Jdk8Module` reads them the same way.
 */
export function optionalValue<T>(reader: JsonReader<T>): JsonReader<Optional<T>> {
  return {
    read(value: unknown, path: string = ROOT): Optional<T> {
      return value === null || value === undefined ? Optional.empty<T>() : Optional.of<T>(reader.read(value, path));
    },
  };
}

/**
 * Substitutes a value when the slot is absent or null, and reads it otherwise.
 *
 * The supplier is called per read rather than the value being captured once, so a default that is a mutable
 * collection does not end up shared between every object that took it.
 */
export function withDefault<T>(reader: JsonReader<T>, fallback: () => T): JsonReader<T> {
  return {
    read(value: unknown, path: string = ROOT): T {
      return value === null || value === undefined ? fallback() : reader.read(value, path);
    },
  };
}

/** A JSON array, as a plain JavaScript array. See {@link listOf} for the `List` this is the raw form of. */
export function arrayOf<T>(element: JsonReader<T>): JsonReader<T[]> {
  return {
    read(value: unknown, path: string = ROOT): T[] {
      return requireArray(value, path).map((item, index) => element.read(item, `${path}[${index}]`));
    },
  };
}

/** A JSON array as a {@link List}, which is the shape `List.toJSON` writes. */
export function listOf<T>(element: JsonReader<T>): JsonReader<List<T>> {
  return mapping(arrayOf(element), (items) => new List<T>(items));
}

/**
 * A JSON array as a {@link JavaSet}.
 *
 * Elements that are `equals` collapse into one, silently — a set is what the contract asked for, and a document
 * repeating a member is not obviously wrong. Read it as a {@link listOf} first if the count matters.
 */
export function setOf<T>(element: JsonReader<T>): JsonReader<JavaSet<T>> {
  return mapping(arrayOf(element), (items) => new JavaSet<T>(items));
}

/** A JSON array as a {@link TreeSet}, in the given order or in natural order when none is given. */
export function treeSetOf<T>(element: JsonReader<T>, comparator?: (a: T, b: T) => number): JsonReader<TreeSet<T>> {
  return mapping(arrayOf(element), (items) =>
    comparator === undefined ? new TreeSet<T>(items) : new TreeSet<T>(comparator, items),
  );
}

/** A `{ key, value }` object as a {@link MapEntry}, which is the shape `MapEntry.toJSON` writes. */
export function entryOf<K, V>(key: JsonReader<K>, value: JsonReader<V>): JsonReader<MapEntry<K, V>> {
  return {
    read(source: unknown, path: string = ROOT): MapEntry<K, V> {
      const object = requireObject(source, path);
      return new MapEntry<K, V>(
        key.read(object["key"], `${path}.key`),
        value.read(object["value"], `${path}.value`),
      );
    },
  };
}

/** The `[key, value]` pairs a map serialises as, read one pair at a time. */
function pairsOf<K, V>(key: JsonReader<K>, value: JsonReader<V>): JsonReader<[K, V][]> {
  return {
    read(source: unknown, path: string = ROOT): [K, V][] {
      return requireArray(source, path).map((item, index) => {
        const at = `${path}[${index}]`;
        const pair = requireArray(item, at);
        if (pair.length !== 2) {
          throw new JsonBindException(at, `expected a [key, value] pair, got an array of ${String(pair.length)}`);
        }
        return [key.read(pair[0], `${at}[0]`), value.read(pair[1], `${at}[1]`)];
      });
    },
  };
}

/**
 * A {@link JavaMap} from the array of `[key, value]` pairs `JavaMap.toJSON` writes.
 *
 * Pairs rather than a JSON object because a map here may be keyed on anything — numbers, nulls, whole
 * `JavaObject`s — and JSON object keys can only be strings. For the object form a Java backend produces for a
 * `JavaMap<String, V>`, see {@link objectAsMap}.
 *
 * A document repeating a key keeps the last pair, matching the constructor this feeds.
 */
export function mapOf<K, V>(key: JsonReader<K>, value: JsonReader<V>): JsonReader<JavaMap<K, V>> {
  return mapping(pairsOf(key, value), (pairs) => new JavaMap<K, V>(pairs));
}

/** A {@link TreeMap} from the same pair form {@link mapOf} reads, in the given order or in natural order. */
export function treeMapOf<K, V>(
  key: JsonReader<K>,
  value: JsonReader<V>,
  comparator?: (a: K, b: K) => number,
): JsonReader<TreeMap<K, V>> {
  return mapping(pairsOf(key, value), (pairs) =>
    comparator === undefined ? new TreeMap<K, V>(pairs) : new TreeMap<K, V>(comparator, pairs),
  );
}

/**
 * A JSON object read as a map of string keys to values — what Jackson emits for a Java `JavaMap<String, V>`, and
 * therefore what a Spring endpoint most often sends.
 *
 * The counterpart to {@link mapOf}, which reads this library's own pair form. Only string keys are reachable this
 * way, which is the limitation that made the pair form the default for writing.
 */
export function objectAsMap<V>(value: JsonReader<V>): JsonReader<JavaMap<string, V>> {
  return {
    read(source: unknown, path: string = ROOT): JavaMap<string, V> {
      const object = requireObject(source, path);
      const map = new JavaMap<string, V>();
      for (const key of Object.keys(object)) {
        map.put(key, value.read(object[key], `${path}.${key}`));
      }
      return map;
    },
  };
}

/**
 * A DTO: one reader per field, applied to a JSON object.
 *
 * ```ts
 * const user = objectOf<User>({ id: integerValue, email: stringValue, nickname: optionalValue(stringValue) });
 * ```
 *
 * Fields are required by default — a missing key reaches its reader as nothing and is refused there — so
 * optionality is stated in the field's own reader rather than assumed. {@link optionalValue} and
 * {@link withDefault} are the two ways to say it.
 *
 * Keys the contract does not mention are ignored rather than refused, which is Jackson's default and the only
 * choice that survives a server adding a field.
 *
 * Pass the target type explicitly — `objectOf<User>({...})` — so that a field the contract forgets is a compile
 * error rather than a shape TypeScript infers around.
 */
export function objectOf<T extends object>(fields: JsonFields<T>): JsonReader<T> {
  // JsonFields<T> is a mapped type over an unresolved T, which nothing built in describes as an ordinary record.
  // Widening it once here is what lets the loop below be written at all; the pairs it yields are read back into
  // exactly the keys T declares, so the cast on the way out is sound.
  const widened = fields as unknown as Readonly<Record<string, JsonReader<unknown>>>;
  const readers: readonly (readonly [string, JsonReader<unknown>])[] = Object.entries(widened);
  return {
    read(value: unknown, path: string = ROOT): T {
      const source = requireObject(value, path);
      const result: Record<string, unknown> = {};
      for (const [key, reader] of readers) {
        result[key] = reader.read(source[key], `${path}.${key}`);
      }
      return result as T;
    },
  };
}

/**
 * Parses a JSON document and reads it in one step.
 *
 * Malformed JSON arrives as a {@link JsonBindException} at the root, so a caller has one exception type to catch
 * for "this body was not what we agreed" rather than two — the underlying `SyntaxError` is kept as the cause.
 */
export function readJson<T>(text: string, reader: JsonReader<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new JsonBindException(ROOT, `the document is not valid JSON: ${String(cause)}`, { cause });
  }
  return reader.read(parsed, ROOT);
}
